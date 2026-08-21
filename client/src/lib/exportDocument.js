/**
 * lib/exportDocument.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Drives the browser's print dialog for "Save as PDF".
 *
 * Browsers derive the suggested PDF filename from document.title, so a plain
 * window.print() offers something like "about:blank" or the route. Swapping the
 * title for the document's own name and restoring it afterwards is what makes
 * the download default to "My Notes.pdf".
 */

/** Strip characters that are awkward in a filename, and bound the length. */
export function printTitleFor(documentTitle) {
  const cleaned = String(documentTitle ?? "")
    .replace(/[\\/:*?"<>|]+/g, " ")   // illegal on at least one major platform
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || "Untitled Document").slice(0, 120);
}

/**
 * Print the current page (the print stylesheet reveals only the printable
 * document). Restores the page title on `afterprint`, and on a timer as a
 * fallback for browsers that do not fire it reliably.
 *
 * @param {string} documentTitle
 */
export function exportDocumentAsPdf(documentTitle) {
  const previous = document.title;
  document.title = printTitleFor(documentTitle);

  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    document.title = previous;
    window.removeEventListener("afterprint", restore);
  };

  window.addEventListener("afterprint", restore);
  // Safari has historically not fired afterprint; never leave the tab renamed.
  setTimeout(restore, 60_000);

  window.print();
}
