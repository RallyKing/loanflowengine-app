export const ALERT_CATEGORIES = [
  "file_snooze_due",
  "task_due",
  "task_scheduled",
] as const;

export type AlertCategory = (typeof ALERT_CATEGORIES)[number];

export type AlertChannelPrefs = {
  inApp: boolean;
  push: boolean;
};

export type AlertPreferencesResolved = Record<AlertCategory, AlertChannelPrefs>;

/** Defaults: everything on in-app, push off. */
export const DEFAULT_ALERT_PREFERENCES: AlertPreferencesResolved = {
  file_snooze_due: { inApp: true, push: false },
  task_due: { inApp: true, push: false },
  task_scheduled: { inApp: true, push: false },
};

export function isAlertCategory(value: string): value is AlertCategory {
  return (ALERT_CATEGORIES as readonly string[]).includes(value);
}

export function resolveAlertPreferences(
  stored: Partial<Record<AlertCategory, Partial<AlertChannelPrefs>>> | null | undefined,
): AlertPreferencesResolved {
  const out: AlertPreferencesResolved = {
    file_snooze_due: { ...DEFAULT_ALERT_PREFERENCES.file_snooze_due },
    task_due: { ...DEFAULT_ALERT_PREFERENCES.task_due },
    task_scheduled: { ...DEFAULT_ALERT_PREFERENCES.task_scheduled },
  };
  if (!stored) return out;
  for (const cat of ALERT_CATEGORIES) {
    const row = stored[cat];
    if (!row) continue;
    if (typeof row.inApp === "boolean") out[cat].inApp = row.inApp;
    if (typeof row.push === "boolean") out[cat].push = row.push;
  }
  return out;
}

export function shouldCreateInAppAlert(
  prefs: AlertPreferencesResolved,
  category: AlertCategory,
): boolean {
  return prefs[category].inApp === true;
}

export function shouldSendPushAlert(
  prefs: AlertPreferencesResolved,
  category: AlertCategory,
): boolean {
  return prefs[category].push === true;
}
