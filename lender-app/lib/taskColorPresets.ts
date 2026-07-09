/**
 * Phase 21 — org-level task highlight palette (exactly 8 presets; ids are stable).
 */

export const TASK_COLOR_PRESET_COUNT = 8 as const;

export type TaskColorPreset = {
  id: string;
  label: string;
  hexCode: string;
};

export const DEFAULT_TASK_COLOR_PRESETS: TaskColorPreset[] = [
  { id: "triage-urgent-red", label: "Urgent Red", hexCode: "#DC2626" },
  { id: "triage-pending-amber", label: "Pending Amber", hexCode: "#D97706" },
  { id: "triage-clear-green", label: "Clear Green", hexCode: "#16A34A" },
  { id: "triage-info-blue", label: "Info Blue", hexCode: "#2563EB" },
  { id: "triage-review-purple", label: "Review Purple", hexCode: "#7C3AED" },
  { id: "triage-watch-teal", label: "Watch Teal", hexCode: "#0D9488" },
  { id: "triage-hold-slate", label: "Hold Slate", hexCode: "#475569" },
  { id: "triage-neutral-gray", label: "Neutral Gray", hexCode: "#6B7280" },
];

const PRESET_ID_SET = new Set(
  DEFAULT_TASK_COLOR_PRESETS.map((preset) => preset.id),
);

export function isTaskColorPresetId(id: string): boolean {
  return PRESET_ID_SET.has(id.trim());
}

export function isValidTaskColorHex(hexCode: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(hexCode.trim());
}

/** Preset list order — lower index = higher visual priority when scores tie. */
export function taskColorPresetIndex(colorId: string): number {
  const index = DEFAULT_TASK_COLOR_PRESETS.findIndex(
    (preset) => preset.id === colorId,
  );
  return index >= 0 ? index : TASK_COLOR_PRESET_COUNT;
}

export function assertExactlyEightTaskColorPresets(
  presets: TaskColorPreset[],
): void {
  if (presets.length !== TASK_COLOR_PRESET_COUNT) {
    throw new Error(
      `Organization must define exactly ${TASK_COLOR_PRESET_COUNT} task color presets`,
    );
  }
  for (const expected of DEFAULT_TASK_COLOR_PRESETS) {
    if (!presets.some((preset) => preset.id === expected.id)) {
      throw new Error(`Missing preset id: ${expected.id}`);
    }
  }
  for (const preset of presets) {
    if (!preset.label.trim()) {
      throw new Error("Preset label is required");
    }
    if (!isValidTaskColorHex(preset.hexCode)) {
      throw new Error(`Invalid hex code for preset ${preset.id}`);
    }
  }
}

export function normalizeTaskColorPresets(
  presets: TaskColorPreset[],
): TaskColorPreset[] {
  assertExactlyEightTaskColorPresets(presets);
  return DEFAULT_TASK_COLOR_PRESETS.map((expected) => {
    const match = presets.find((preset) => preset.id === expected.id);
    if (!match) {
      throw new Error(`Missing preset id: ${expected.id}`);
    }
    return {
      id: expected.id,
      label: match.label.trim(),
      hexCode: match.hexCode.trim().toUpperCase(),
    };
  });
}

export function lookupTaskColorPreset(
  presets: TaskColorPreset[],
  colorId: string,
): TaskColorPreset | null {
  return presets.find((preset) => preset.id === colorId) ?? null;
}
