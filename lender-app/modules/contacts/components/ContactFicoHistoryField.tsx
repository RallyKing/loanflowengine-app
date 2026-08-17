"use client";

import { useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import {
  applyFicoScore,
  ficoTrendFromHistory,
  FICO_SCORE_MAX,
  FICO_SCORE_MIN,
  parseFicoScore,
  seedFicoHistory,
  type FicoHistoryEntry,
} from "@/lib/contacts/ficoHistory";
import { cn } from "@/lib/cn";
import {
  DEFAULT_VIEWER_TIMEZONE,
  zonedParts,
  zonedWallTimeToUtcMs,
} from "@/lib/dateTimeZone";
import { toHtmlDateInputValue } from "@/lib/schedule/dateInput";

function formatFicoDate(
  ms: number,
  timeZone: string = DEFAULT_VIEWER_TIMEZONE,
): string {
  if (!Number.isFinite(ms)) return "";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toLocaleDateString("en-US");
  }
}

function dateInputToRecordedAt(value: string): number | null {
  const ymd = toHtmlDateInputValue(value);
  if (!ymd) return null;
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return null;
  return zonedWallTimeToUtcMs(y, m, d, 12, 0, 0, DEFAULT_VIEWER_TIMEZONE);
}

function todayInputValue(): string {
  const p = zonedParts(new Date(), DEFAULT_VIEWER_TIMEZONE);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

type ContactFicoHistoryFieldProps = {
  contactId: Id<"contacts">;
  memberUserKey: string;
  currentFico?: number;
  history?: FicoHistoryEntry[] | null;
  fallbackRecordedAt: number;
  onCurrentScoreChange: (score: string) => void;
};

export function ContactFicoHistoryField({
  contactId,
  memberUserKey,
  currentFico,
  history,
  fallbackRecordedAt,
  onCurrentScoreChange,
}: ContactFicoHistoryFieldProps) {
  const recordFico = useMutation(api.contacts.recordFicoScore);
  const [score, setScore] = useState("");
  const [asOf, setAsOf] = useState(todayInputValue);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const entries = useMemo(
    () =>
      seedFicoHistory({
        fico: currentFico,
        history,
        fallbackRecordedAt,
      }),
    [currentFico, history, fallbackRecordedAt],
  );
  const trend = ficoTrendFromHistory(entries);
  const current = trend.current;

  async function onRecord() {
    const parsed = parseFicoScore(score);
    if (parsed == null) {
      setError(`Enter a FICO between ${FICO_SCORE_MIN} and ${FICO_SCORE_MAX}.`);
      return;
    }
    const recordedAt = dateInputToRecordedAt(asOf);
    if (recordedAt == null) {
      setError("Choose the date of this pull.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      applyFicoScore({
        fico: currentFico,
        history,
        nextScore: parsed,
        recordedAt,
        note,
        now: Date.now(),
        fallbackRecordedAt,
      });
      await recordFico({
        id: contactId,
        score: parsed,
        recordedAt,
        note: note.trim() || undefined,
        memberUserKey,
      });
      onCurrentScoreChange(String(parsed));
      setScore("");
      setNote("");
      setAsOf(todayInputValue());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save FICO.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 sm:col-span-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-dlc-label-sm font-medium leading-dlc-label-sm tracking-dlc-label-sm text-muted-foreground">
            FICO
          </p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="text-dlc-title-lg font-semibold leading-dlc-title-lg tracking-dlc-title-lg tabular-nums text-foreground">
              {current != null ? current : "—"}
            </p>
            {current != null ? (
              <p className="text-dlc-body-sm text-muted-foreground">
                Current
                {entries[0] ? ` · as of ${formatFicoDate(entries[0].recordedAt)}` : ""}
              </p>
            ) : (
              <p className="text-dlc-body-sm text-muted-foreground">
                No score recorded yet
              </p>
            )}
            {trend.direction && trend.delta != null ? (
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-dlc-body-sm font-medium",
                  trend.direction === "up" && "text-emerald-700 dark:text-emerald-400",
                  trend.direction === "down" && "text-rose-700 dark:text-rose-400",
                  trend.direction === "flat" && "text-muted-foreground",
                )}
              >
                {trend.direction === "up" ? (
                  <TrendingUp className="size-3.5" aria-hidden />
                ) : trend.direction === "down" ? (
                  <TrendingDown className="size-3.5" aria-hidden />
                ) : (
                  <Minus className="size-3.5" aria-hidden />
                )}
                {trend.delta > 0 ? "+" : ""}
                {trend.delta} vs prior {trend.previous}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-3 rounded-dlc-md border border-border/70 bg-dlc-surface-high/40 p-3 sm:grid-cols-[minmax(0,7rem)_minmax(0,11rem)_minmax(0,1fr)_auto]">
        <div className="space-y-1.5">
          <Label htmlFor="contact-fico-next">New score</Label>
          <Input
            id="contact-fico-next"
            inputMode="numeric"
            autoComplete="off"
            placeholder="720"
            value={score}
            onChange={(e) => setScore(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="contact-fico-date">As of</Label>
          <Input
            id="contact-fico-date"
            type="date"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="contact-fico-note">Note (optional)</Label>
          <Input
            id="contact-fico-note"
            autoComplete="off"
            placeholder="Experian pull, dispute, etc."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <div className="flex items-end">
          <Button
            type="button"
            variant="secondary"
            className="w-full sm:w-auto"
            disabled={saving}
            onClick={() => void onRecord()}
          >
            {saving ? "Saving…" : current != null ? "Update score" : "Save score"}
          </Button>
        </div>
      </div>
      {error ? (
        <p className="text-dlc-body-sm text-destructive" role="alert">
          {error}
        </p>
      ) : (
        <p className="text-dlc-body-sm text-muted-foreground">
          Updating keeps the previous score and date so you can see movement over
          time.
        </p>
      )}

      {entries.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[18rem] text-left text-dlc-body-sm">
            <thead>
              <tr className="border-b border-border/70 text-muted-foreground">
                <th className="py-1.5 pr-3 font-medium">Date</th>
                <th className="py-1.5 pr-3 font-medium">Score</th>
                <th className="py-1.5 pr-3 font-medium">Change</th>
                <th className="py-1.5 font-medium">Note</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, index) => {
                const older = entries[index + 1];
                const delta = older ? entry.score - older.score : null;
                return (
                  <tr
                    key={entry.id}
                    className="border-b border-border/40 last:border-0"
                  >
                    <td className="py-1.5 pr-3 tabular-nums text-foreground">
                      {formatFicoDate(entry.recordedAt)}
                      {index === 0 ? (
                        <span className="ml-1.5 text-muted-foreground">
                          current
                        </span>
                      ) : null}
                    </td>
                    <td className="py-1.5 pr-3 tabular-nums font-medium text-foreground">
                      {entry.score}
                    </td>
                    <td
                      className={cn(
                        "py-1.5 pr-3 tabular-nums",
                        delta == null && "text-muted-foreground",
                        delta != null && delta > 0 && "text-emerald-700 dark:text-emerald-400",
                        delta != null && delta < 0 && "text-rose-700 dark:text-rose-400",
                        delta === 0 && "text-muted-foreground",
                      )}
                    >
                      {delta == null
                        ? "—"
                        : `${delta > 0 ? "+" : ""}${delta}`}
                    </td>
                    <td className="py-1.5 text-muted-foreground">
                      {entry.note ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
