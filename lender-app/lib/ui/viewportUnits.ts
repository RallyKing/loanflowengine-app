/**
 * Viewport width helpers — prefer `100dvw` over `100vw` to avoid scrollbar bleed
 * that triggers mobile shrink-to-fit zoom-out (Phase 15A).
 */

/** Max width for anchored panels/dropdowns inset from screen edges. */
export const DLC_VIEWPORT_PAD_MAX_W_CLASS = "max-w-[min(100%,calc(100dvw-2rem))]";

/** Fixed width cap for compact overlays (e.g. saved views menu). */
export const DLC_VIEWPORT_PAD_W_CLASS = "w-[min(100%,calc(100dvw-2rem))]";
