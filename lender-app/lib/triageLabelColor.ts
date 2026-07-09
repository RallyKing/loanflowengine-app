import type { Doc } from "@/convex/_generated/dataModel";
import type { TaskColorPreset } from "@/lib/taskColorPresets";
import { lookupTaskPreset } from "@/lib/inFileTaskTriageUi";

const HEX6 = /^#([0-9A-Fa-f]{6})$/;
const HEX3 = /^#([0-9A-Fa-f]{3})$/;

/** Normalize user/preset input to `#RRGGBB`, or `undefined` if invalid. */
export function normalizeTriageLabelHex(
  raw: string | undefined | null,
): string | undefined {
  if (raw == null) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  const six = withHash.match(HEX6);
  if (six) return `#${six[1].toUpperCase()}`;
  const three = withHash.match(HEX3);
  if (three) {
    const [r, g, b] = three[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return undefined;
}

export type TriageLabelColorFields = Pick<
  Doc<"organizationTriageLabels">,
  "customHexCode" | "colorId"
>;

/** Custom hex wins; otherwise org preset via `colorId`. */
export function resolveTriageLabelHex(
  label: TriageLabelColorFields,
  presets: TaskColorPreset[],
): string {
  const custom = normalizeTriageLabelHex(label.customHexCode);
  if (custom) return custom;
  const preset = lookupTaskPreset(presets, label.colorId);
  return preset?.hexCode ?? "#64748B";
}
