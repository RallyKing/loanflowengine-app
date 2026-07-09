/**
 * Desktop destructive confirm anchor — center of the visible workspace (main scroll),
 * not raw viewport center (avoids sidebar bias).
 */

export type DestructiveConfirmAnchor = {
  x: number;
  y: number;
};

export function measureDestructiveConfirmAnchor(): DestructiveConfirmAnchor {
  if (typeof window === "undefined") {
    return { x: 0, y: 0 };
  }

  const main =
    document.querySelector<HTMLElement>("[data-app-main-scroll]") ??
    document.getElementById("app-main-scroll");

  if (main) {
    const rect = main.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + Math.min(rect.height * 0.46, rect.height - 120),
    };
  }

  return {
    x: window.innerWidth / 2,
    y: window.innerHeight * 0.44,
  };
}
