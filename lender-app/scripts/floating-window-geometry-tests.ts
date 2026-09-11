/**
 * Quick checks for floating window geometry clamp / defaults.
 * Run: npx tsx scripts/floating-window-geometry-tests.ts
 */
import {
  clampFloatingWindowGeometry,
  defaultFloatingWindowGeometry,
  FLOATING_WINDOW_MIN_H,
  FLOATING_WINDOW_MIN_W,
} from "../lib/ui/floatingWindowGeometry";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const clamped = clampFloatingWindowGeometry({
  x: -100,
  y: -50,
  w: 40,
  h: 40,
});
assert(clamped.w >= FLOATING_WINDOW_MIN_W, "min width");
assert(clamped.h >= FLOATING_WINDOW_MIN_H, "min height");
assert(clamped.x >= 0, "x not negative past pad");
assert(clamped.y >= 0, "y not negative past pad");

const def = defaultFloatingWindowGeometry(0);
assert(def.w >= FLOATING_WINDOW_MIN_W, "default width");
assert(def.h >= FLOATING_WINDOW_MIN_H, "default height");

console.log("floating-window-geometry-tests: ok");
