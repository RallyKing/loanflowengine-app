"use client";

import { useEffect, useMemo, useState } from "react";
import { Archive } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { OperationalCheckbox } from "@/components/ui/OperationalCheckbox";
import {
  AUTO_ARCHIVE_MAX_DAYS,
  AUTO_ARCHIVE_MIN_DAYS,
  AUTO_ARCHIVE_PRESET_DAYS,
  formatAutoArchiveRemainingShort,
  isAutoArchivePresetDays,
  remainingAutoArchiveMs,
} from "@/lib/pipelineAutoArchive";
import { cn } from "@/lib/cn";

type Props = {
  inactivityDays?: number | null;
  autoArchiveAfterAt?: number | null;
  lastActivityAt: number;
  archived: boolean;
  disabled?: boolean;
  busy?: boolean;
  error?: string | null;
  onEnable: (days: number) => void | Promise<void>;
  onDisable: () => void | Promise<void>;
};

const CUSTOM_VALUE = "custom";

/**
 * File-chrome control next to snooze: auto-archive if no new activity for N days.
 * Distinct from snooze (hide until date vs archive after inactivity).
 */
export function PipelineFileAutoArchiveControl({
  inactivityDays,
  autoArchiveAfterAt,
  lastActivityAt,
  archived,
  disabled = false,
  busy = false,
  error = null,
  onEnable,
  onDisable,
}: Props) {
  const enabled =
    inactivityDays != null && Number.isFinite(inactivityDays);
  const presetMatch =
    inactivityDays != null &&
    Number.isFinite(inactivityDays) &&
    isAutoArchivePresetDays(inactivityDays);
  const [customDraft, setCustomDraft] = useState(
    enabled && !presetMatch ? String(inactivityDays) : "90",
  );
  const [selectValue, setSelectValue] = useState<string>(
    !enabled ? "30" : presetMatch ? String(inactivityDays) : CUSTOM_VALUE,
  );

  useEffect(() => {
    if (inactivityDays == null) return;
    if (isAutoArchivePresetDays(inactivityDays)) {
      setSelectValue(String(inactivityDays));
      return;
    }
    setSelectValue(CUSTOM_VALUE);
    setCustomDraft(String(inactivityDays));
  }, [inactivityDays]);

  const remainingLabel = useMemo(() => {
    if (!enabled) return null;
    const remaining = remainingAutoArchiveMs({
      now: Date.now(),
      autoArchiveAfterAt,
      lastActivityAt,
      inactivityDays,
    });
    const short = formatAutoArchiveRemainingShort(remaining);
    return remaining != null && remaining <= 0
      ? "Due — run auto-archive from Pipeline"
      : short
        ? `${short} remaining`
        : null;
  }, [autoArchiveAfterAt, enabled, inactivityDays, lastActivityAt]);

  const locked = disabled || archived || busy;

  async function commitDays(days: number) {
    await onEnable(days);
  }

  return (
    <div className="flex min-w-0 w-full flex-col gap-2 md:w-auto md:flex-row md:flex-wrap md:items-center md:gap-x-2 md:gap-y-1">
      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground">
        <Archive className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Auto-archive if inactive
      </span>
      <div className="flex min-w-0 w-full flex-col flex-wrap gap-2 md:w-auto md:flex-row md:items-center md:gap-1">
        <label className="inline-flex min-h-10 items-center gap-2 text-xs text-foreground">
          <OperationalCheckbox
            checked={enabled}
            disabled={locked}
            aria-label="Auto-archive this file after a period with no new activity"
            onChange={(e) => {
              if (e.target.checked) {
                const days =
                  selectValue === CUSTOM_VALUE
                    ? Number.parseInt(customDraft, 10)
                    : Number.parseInt(selectValue, 10);
                void commitDays(
                  Number.isFinite(days) ? days : AUTO_ARCHIVE_PRESET_DAYS[1],
                );
              } else {
                void onDisable();
              }
            }}
          />
          <span className="leading-tight">
            Archive after inactivity
            <span className="block text-[10px] font-normal text-muted-foreground">
              Not snooze — snooze only hides until a date
            </span>
          </span>
        </label>
        <Select
          aria-label="Inactivity period before auto-archive"
          className="h-10 min-h-10 w-full min-w-[8rem] text-xs sm:w-auto"
          disabled={locked || archived}
          value={selectValue}
          onChange={(e) => {
            const next = e.target.value;
            setSelectValue(next);
            if (!enabled) return;
            if (next === CUSTOM_VALUE) return;
            const days = Number.parseInt(next, 10);
            if (Number.isFinite(days)) void commitDays(days);
          }}
        >
          {AUTO_ARCHIVE_PRESET_DAYS.map((d) => (
            <option key={d} value={String(d)}>
              {d} days
            </option>
          ))}
          <option value={CUSTOM_VALUE}>Custom…</option>
        </Select>
        {selectValue === CUSTOM_VALUE ? (
          <div className="flex min-w-0 items-center gap-1">
            <Input
              type="number"
              min={AUTO_ARCHIVE_MIN_DAYS}
              max={AUTO_ARCHIVE_MAX_DAYS}
              inputMode="numeric"
              aria-label="Custom inactivity days"
              className="h-10 min-h-10 w-20 text-xs"
              disabled={locked || archived}
              value={customDraft}
              onChange={(e) => setCustomDraft(e.target.value)}
            />
            <span className="text-xs text-muted-foreground">days</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-10 shrink-0 px-2 text-xs"
              disabled={locked || archived}
              onClick={() => {
                const days = Number.parseInt(customDraft, 10);
                if (!Number.isFinite(days)) return;
                void commitDays(days);
              }}
            >
              Apply
            </Button>
          </div>
        ) : null}
        {enabled && remainingLabel ? (
          <span
            className={cn(
              "text-[10px] tabular-nums text-muted-foreground",
            )}
          >
            {remainingLabel}
          </span>
        ) : null}
      </div>
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
