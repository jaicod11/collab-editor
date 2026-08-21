/**
 * shared/ot/markdown.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure text transforms for the markdown toolbar.
 *
 * Formatting is CHARACTERS, not attributes. The OT engine transforms operations
 * over a flat string, so the only way formatting can survive a concurrent edit
 * is to be part of the text — which is exactly what markdown is. Phase 6 removed
 * the execCommand toolbar and Phase 7 blocked the native formatting shortcuts
 * because both wrote DOM structure the sync engine could not see.
 *
 * Italic uses `_`, not `*`. With `*`, italicising the inner text of `**bold**`
 * sees an asterisk on each side and unwraps one layer of the BOLD markers
 * instead — the two markers are indistinguishable to a character-level toggle.
 * `_italic_` is equally standard markdown and cannot collide with `**`.
 *
 * Everything here takes (text, selectionStart, selectionEnd) and returns the new
 * text plus where the selection should end up. Nothing touches the DOM: the
 * caller feeds the result through the same path as typing, so it produces real
 * operations and syncs like any other edit.
 */

// ─── Inline wrapping ─────────────────────────────────────────────────────────

/**
 * Wrap the selection in `marker`, or unwrap it if it is already wrapped.
 *
 * Toggling OFF is the reason this is not a plain string concat: applying bold
 * twice used to leave `****text****`.
 *
 * @returns {{ text: string, selectionStart: number, selectionEnd: number }}
 */
export function toggleWrap(text, start, end, marker) {
  const selected = text.slice(start, end);
  const len = marker.length;

  // Already wrapped inside the selection: "**bold**" with the markers selected.
  if (
    selected.length >= len * 2 &&
    selected.startsWith(marker) &&
    selected.endsWith(marker)
  ) {
    const inner = selected.slice(len, selected.length - len);
    return {
      text: text.slice(0, start) + inner + text.slice(end),
      selectionStart: start,
      selectionEnd: start + inner.length,
    };
  }

  // Wrapped just outside the selection: "**bold**" with only `bold` selected.
  const before = text.slice(Math.max(0, start - len), start);
  const after = text.slice(end, end + len);
  if (before === marker && after === marker) {
    return {
      text: text.slice(0, start - len) + selected + text.slice(end + len),
      selectionStart: start - len,
      selectionEnd: start - len + selected.length,
    };
  }

  // Not wrapped: add the markers. With an empty selection the caret lands
  // between them so the next keystroke is inside the formatting.
  const wrapped = marker + selected + marker;
  return {
    text: text.slice(0, start) + wrapped + text.slice(end),
    selectionStart: start + len,
    selectionEnd: start + len + selected.length,
  };
}

// ─── Line-level prefixes ─────────────────────────────────────────────────────

/** Index of the start of the line containing `pos`. */
function lineStart(text, pos) {
  const nl = text.lastIndexOf("\n", Math.max(0, pos - 1));
  return nl === -1 ? 0 : nl + 1;
}

/** Index just past the end of the line containing `pos`. */
function lineEnd(text, pos) {
  const nl = text.indexOf("\n", pos);
  return nl === -1 ? text.length : nl;
}

/** The [start, end) bounds of every line the selection touches. */
function selectedLines(text, start, end) {
  const from = lineStart(text, start);
  const to = lineEnd(text, end);
  const lines = [];
  let cursor = from;
  while (cursor <= to) {
    const stop = lineEnd(text, cursor);
    lines.push({ start: cursor, end: stop });
    if (stop >= to) break;
    cursor = stop + 1;
  }
  return { from, to, lines };
}

/**
 * Toggle a per-line prefix ("# ", "> ", "- ") across the selected lines.
 *
 * If every touched line already has the prefix it is removed; otherwise it is
 * added to the lines missing it. Heading levels replace each other rather than
 * stacking, so "## " over "# " gives "## ", not "# ## ".
 */
export function toggleLinePrefix(text, start, end, prefix, { replaces = [] } = {}) {
  const { from, to, lines } = selectedLines(text, start, end);
  const bodies = lines.map((l) => text.slice(l.start, l.end));

  const strip = (line) => {
    for (const candidate of [prefix, ...replaces]) {
      if (line.startsWith(candidate)) return line.slice(candidate.length);
    }
    return line;
  };

  const allHave = bodies.every((b) => b.startsWith(prefix));
  const next = bodies.map((b) => (allHave ? strip(b) : prefix + strip(b)));

  const rebuilt = next.join("\n");
  const delta = rebuilt.length - (to - from);

  return {
    text: text.slice(0, from) + rebuilt + text.slice(to),
    // Keep the whole affected span selected so the user can keep toggling.
    selectionStart: from,
    selectionEnd: to + delta,
  };
}

/** Numbered list: renumber the selected lines, or strip existing numbering. */
export function toggleOrderedList(text, start, end) {
  const { from, to, lines } = selectedLines(text, start, end);
  const bodies = lines.map((l) => text.slice(l.start, l.end));
  const NUMBERED = /^\d+\.\s/;

  const allNumbered = bodies.every((b) => NUMBERED.test(b));
  const next = allNumbered
    ? bodies.map((b) => b.replace(NUMBERED, ""))
    : bodies.map((b, i) => `${i + 1}. ${b.replace(NUMBERED, "")}`);

  const rebuilt = next.join("\n");
  const delta = rebuilt.length - (to - from);
  return {
    text: text.slice(0, from) + rebuilt + text.slice(to),
    selectionStart: from,
    selectionEnd: to + delta,
  };
}

// ─── Blocks and links ────────────────────────────────────────────────────────

/** Fenced code block around the selection. */
export function toggleCodeBlock(text, start, end) {
  const selected = text.slice(start, end);
  const fenced = /^```[^\n]*\n([\s\S]*?)\n?```$/;

  const match = selected.match(fenced);
  if (match) {
    const inner = match[1];
    return {
      text: text.slice(0, start) + inner + text.slice(end),
      selectionStart: start,
      selectionEnd: start + inner.length,
    };
  }

  // Fences need their own lines to parse, so add surrounding newlines when the
  // selection is not already at a line boundary.
  const needsLeading = start > 0 && text[start - 1] !== "\n";
  const needsTrailing = end < text.length && text[end] !== "\n";
  const open = `${needsLeading ? "\n" : ""}\`\`\`\n`;
  const close = `\n\`\`\`${needsTrailing ? "\n" : ""}`;

  return {
    text: text.slice(0, start) + open + selected + close + text.slice(end),
    selectionStart: start + open.length,
    selectionEnd: start + open.length + selected.length,
  };
}

/** Markdown link. Selected text becomes the label; the caret lands on the URL. */
export function insertLink(text, start, end, url = "") {
  const selected = text.slice(start, end);
  const label = selected || "link text";
  const snippet = `[${label}](${url})`;

  // Put the selection on whichever part still needs typing.
  const urlStart = start + label.length + 3; // "[" + label + "](",
  return {
    text: text.slice(0, start) + snippet + text.slice(end),
    selectionStart: selected ? urlStart : start + 1,
    selectionEnd: selected ? urlStart + url.length : start + 1 + label.length,
  };
}

// ─── List auto-continuation ──────────────────────────────────────────────────

const BULLET = /^(\s*)([-*+])\s+(.*)$/;
const ORDERED = /^(\s*)(\d+)\.\s+(.*)$/;
const QUOTE = /^(\s*)(>)\s?(.*)$/;

/**
 * What Enter should do at `pos`.
 *
 * Inside a non-empty list item, continue the list. On an EMPTY item, remove the
 * marker instead — that is how a person ends a list.
 *
 * @returns {null | { text, selectionStart, selectionEnd }} null = insert a
 *          plain newline, the caller's normal path.
 */
export function continueListOnEnter(text, pos) {
  const from = lineStart(text, pos);
  const line = text.slice(from, pos);

  for (const [re, next] of [
    [BULLET, (m) => `${m[1]}${m[2]} `],
    [ORDERED, (m) => `${m[1]}${Number(m[2]) + 1}. `],
    [QUOTE, (m) => `${m[1]}> `],
  ]) {
    const m = line.match(re);
    if (!m) continue;

    // Empty item: strip the marker and end the list rather than adding another.
    if (m[3].trim() === "") {
      return {
        text: text.slice(0, from) + text.slice(pos),
        selectionStart: from,
        selectionEnd: from,
      };
    }

    const marker = next(m);
    const insert = `\n${marker}`;
    return {
      text: text.slice(0, pos) + insert + text.slice(pos),
      selectionStart: pos + insert.length,
      selectionEnd: pos + insert.length,
    };
  }

  return null;
}
