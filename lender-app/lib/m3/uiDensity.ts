/**
 * Analyst / operator density — Material 3–aligned spacing scale on `documentElement`.
 * Persisted via `UserPreferences.displaySettings.uiDensity` (Convex).
 */

export type UiDensityMode = "comfortable" | "compact" | "analyst";

const MODES: ReadonlySet<string> = new Set(["comfortable", "compact", "analyst"]);

export function parseUiDensityMode(raw: unknown): UiDensityMode {
  if (typeof raw === "string" && MODES.has(raw)) return raw as UiDensityMode;
  return "comfortable";
}

/** Sets `data-ui-density` on the root element for globals.css token overrides. */
export function applyUiDensityToElement(
  el: HTMLElement,
  displaySettings: Record<string, unknown>,
) {
  const mode = parseUiDensityMode(displaySettings.uiDensity);
  el.dataset.uiDensity = mode;
}
