/**
 * components/UI/PortalMenu.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * A dropdown menu that renders via React Portal directly into document.body.
 *
 * WHY THIS EXISTS:
 * Every "three-dot" context menu in the app (My Documents, Shared with Me,
 * Archive) lives inside a table row, and that table's outer wrapper has
 * `overflow: hidden` (needed for the rounded corners). Any absolutely
 * positioned child — like a dropdown menu — gets silently clipped by that
 * ancestor's overflow box, no matter which direction it tries to open.
 * Flipping the menu up/down does NOT fix this, because the clipping
 * boundary is the table container, not the browser viewport.
 *
 * The fix: render the menu outside the DOM tree entirely (via createPortal
 * into document.body) and position it with `position: fixed` using the
 * exact pixel coordinates of the trigger button (getBoundingClientRect).
 * This makes it immune to any ancestor's overflow, scroll, or border-radius.
 *
 * USAGE:
 *   const btnRef = useRef(null);
 *   const [open, setOpen] = useState(false);
 *
 *   <button ref={btnRef} onClick={() => setOpen(o => !o)}>⋮</button>
 *   {open && (
 *     <PortalMenu anchorRef={btnRef} onClose={() => setOpen(false)} width={200}>
 *       ...menu content...
 *     </PortalMenu>
 *   )}
 */

import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";

/**
 * @param {React.RefObject} anchorRef  — ref to the button that opened the menu
 * @param {() => void}      onClose    — called on outside click or Escape
 * @param {number}          width      — menu width in px (default 200)
 * @param {number}          estimatedHeight — rough menu height for flip calc (default 240)
 * @param {React.ReactNode} children
 */
export default function PortalMenu({ anchorRef, onClose, width = 200, estimatedHeight = 240, children }) {
    const menuRef = useRef(null);
    const [pos, setPos] = useState(null);

    // ── Compute fixed position from the anchor button's real screen location ──
    useEffect(() => {
        if (!anchorRef.current) return;

        const rect = anchorRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        const openUpward = spaceBelow < estimatedHeight;

        // Right-align the menu to the button, matching how these menus looked before
        let left = rect.right - width;
        // Keep it fully on-screen horizontally
        left = Math.max(8, Math.min(left, window.innerWidth - width - 8));

        const top = openUpward
            ? Math.max(8, rect.top - estimatedHeight)
            : rect.bottom + 4;

        setPos({ top, left, openUpward });
    }, [anchorRef, estimatedHeight, width]);

    // ── Close on outside click ─────────────────────────────────────────────────
    useEffect(() => {
        const handleClick = (e) => {
            if (menuRef.current?.contains(e.target)) return;
            if (anchorRef.current?.contains(e.target)) return; // let the button's own onClick handle toggling
            onClose();
        };
        const handleEscape = (e) => { if (e.key === "Escape") onClose(); };
        document.addEventListener("mousedown", handleClick);
        document.addEventListener("keydown", handleEscape);
        return () => {
            document.removeEventListener("mousedown", handleClick);
            document.removeEventListener("keydown", handleEscape);
        };
    }, [anchorRef, onClose]);

    // ── Close on scroll of any ancestor (menu position would go stale) ─────────
    useEffect(() => {
        const handleScroll = () => onClose();
        window.addEventListener("scroll", handleScroll, true); // capture phase — catches inner scroll containers too
        window.addEventListener("resize", handleScroll);
        return () => {
            window.removeEventListener("scroll", handleScroll, true);
            window.removeEventListener("resize", handleScroll);
        };
    }, [onClose]);

    if (!pos) return null; // wait for first position calculation to avoid a flash at (0,0)

    return createPortal(
        <div
            ref={menuRef}
            style={{
                position: "fixed",
                top: pos.top,
                left: pos.left,
                width,
                maxHeight: "min(320px, calc(100vh - 16px))",
                overflowY: "auto",
                zIndex: 1000, // above everything, including modals' typical z-index range
            }}
        >
            {children}
        </div>,
        document.body
    );
}