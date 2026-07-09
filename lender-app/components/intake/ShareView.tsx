"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Preloaded } from "convex/react";
import { useMutation, usePreloadedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import {
  SECTION_KEYS,
  SECTION_LABELS,
  SECTION_DESCRIPTIONS,
  isShareSection,
  type ShareSectionId,
} from "@/convex/shareSections";
import {
  AssetsSection,
  BorrowersSection,
  HouseholdSection,
  IncomeSection,
  LoansSection,
  NotesSection,
  OverviewSection,
  PropertySection,
  WorkflowSection,
} from "./IntakeEditor";
import type { DealSectionProps } from "@/lib/file/dealSectionTypes";
import { mergeIntakeDraftWithServer } from "@/lib/share/mergeIntakeDraftWithServer";
import {
  ComparisonSection,
  CoverSection,
  DayCounterSection,
  DtiSection,
  PayoffSection,
  ReoSection,
  ScenarioSection,
  WeightedInterestSection,
} from "./IntakeSections2";
import {
  BusinessSection,
  CommercialSection,
  FeesSection,
  GuarantorsSection,
  HardMoneySection,
} from "./IntakeSectionsBiz";

type Sheet = Doc<"intakeSheets">;

const AUDIENCE_LABEL: Record<string, string> = {
  client: "Client",
  lender: "Lender",
  partner: "Partner",
  other: "Guest",
};

type ShareByTokenResult = FunctionReturnType<typeof api.shareLinks.getByToken>;

/** @public dynamic import entry — supports optional SSR preload for faster/error states. */
export function ShareView(props: {
  token: string;
  preloaded?: Preloaded<typeof api.shareLinks.getByToken>;
}) {
  if (props.preloaded) {
    return <ShareViewWithPreload token={props.token} preloaded={props.preloaded} />;
  }
  return <ShareViewWithLiveQuery token={props.token} />;
}

function ShareViewWithPreload({
  token,
  preloaded,
}: {
  token: string;
  preloaded: Preloaded<typeof api.shareLinks.getByToken>;
}) {
  const data = usePreloadedQuery(preloaded);
  return <ShareViewLoaded token={token} data={data} />;
}

function ShareViewWithLiveQuery({ token }: { token: string }) {
  const data = useQuery(api.shareLinks.getByToken, { token });
  return <ShareViewLoaded token={token} data={data} />;
}

function ShareViewLoaded({
  token,
  data,
}: {
  token: string;
  data: ShareByTokenResult | undefined;
}) {
  const markOpened = useMutation(api.shareLinks.markOpened);
  const patch = useMutation(api.shareLinks.patchByToken);

  const [draft, setDraft] = useState<Sheet | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Partial<Sheet>>({});
  const openedRef = useRef(false);

  // Seed, then merge live updates in — without clobbering what the user is
  // currently typing (tracked in pendingRef).
  useEffect(() => {
    if (data?.status !== "ok") return;
    const incoming = data.intake;
    const pendingKeys = new Set(Object.keys(pendingRef.current));
    setDraft((prev) =>
      mergeIntakeDraftWithServer(prev, incoming, pendingKeys),
    );
  }, [data]);

  useEffect(() => {
    if (data?.status === "ok" && !openedRef.current) {
      openedRef.current = true;
      void markOpened({ token });
    }
  }, [data, markOpened, token]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (data === undefined) {
    return <CenteredMessage>Loading your intake section…</CenteredMessage>;
  }
  if (data.status === "not_found") {
    return (
      <CenteredMessage tone="error">
        This share link is invalid or the intake no longer exists.
      </CenteredMessage>
    );
  }
  if (data.status === "revoked") {
    return (
      <CenteredMessage tone="error">
        This link has been revoked. Please contact the person who shared it with
        you.
      </CenteredMessage>
    );
  }
  if (data.status === "expired") {
    return (
      <CenteredMessage tone="error">
        This link has expired. Please request a new one.
      </CenteredMessage>
    );
  }

  const sections = data.link.sections.filter(isShareSection) as ShareSectionId[];
  if (sections.length === 0) {
    return (
      <CenteredMessage tone="error">
        This share link points to unknown sections.
      </CenteredMessage>
    );
  }
  const readOnly = data.link.access !== "edit";
  const audienceLabel = AUDIENCE_LABEL[data.link.audience] ?? "Guest";

  if (!draft) {
    return <CenteredMessage>Loading your intake section…</CenteredMessage>;
  }

  function scheduleFlush() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void flush();
    }, 900);
  }

  async function flush() {
    const pending = pendingRef.current;
    if (Object.keys(pending).length === 0) return;
    pendingRef.current = {};
    try {
      setSaving(true);
      setError(null);
      await patch({ token, changes: pending });
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
      pendingRef.current = { ...pending, ...pendingRef.current };
    } finally {
      setSaving(false);
    }
  }

  // Build the union of keys this link is allowed to write to.
  const allowedKeys = new Set<string>();
  for (const s of sections) {
    for (const k of SECTION_KEYS[s] as readonly string[]) allowedKeys.add(k);
  }

  function update<K extends keyof Sheet>(key: K, value: Sheet[K]) {
    if (readOnly) return;
    if (!allowedKeys.has(key as string)) return;
    setDraft((prev) => (prev ? ({ ...prev, [key]: value } as Sheet) : prev));
    pendingRef.current = { ...pendingRef.current, [key]: value };
    scheduleFlush();
  }

  const multi = sections.length > 1;
  const titleText = multi
    ? `${sections.length} sections`
    : SECTION_LABELS[sections[0]];

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/80 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                    readOnly
                      ? "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
                      : "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
                  }`}
                >
                  {readOnly ? "View only" : "Editable"}
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  · {audienceLabel} access
                </span>
              </div>
              <h1 className="mt-1 break-words text-xl font-bold tracking-tight text-foreground">
                {titleText}
                {data.link.label ? (
                  <span className="break-words text-sm font-medium text-muted-foreground sm:ml-2">
                    {" "}
                    · {data.link.label}
                  </span>
                ) : null}
              </h1>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                {draft.clientName || "Intake"}
                {draft.projectName ? ` · ${draft.projectName}` : null}
              </p>
            </div>
            <div className="shrink-0 sm:pt-1">
              {!readOnly ? (
                <SaveBadge saving={saving} savedAt={savedAt} error={error} />
              ) : (
                <span className="text-xs font-medium text-muted-foreground">
                  This link is view only
                </span>
              )}
            </div>
          </div>
          {multi ? (
            <nav className="flex max-w-full flex-wrap gap-1.5 overflow-x-auto pb-0.5 [-webkit-overflow-scrolling:touch]">
              {sections.map((s) => (
                <a
                  key={s}
                  href={`#sec-${s}`}
                  className="rounded-full border border-border/80 bg-muted/50 px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                >
                  {SECTION_LABELS[s]}
                </a>
              ))}
            </nav>
          ) : null}
        </div>
      </header>

      <main className="mx-auto min-w-0 w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        {readOnly ? (
          <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
            <p className="font-semibold">Read-only access</p>
            <p className="mt-0.5 text-xs">
              You can review this information but cannot make changes. Any
              edits attempted here will not be saved.
            </p>
          </div>
        ) : null}

        <fieldset
          disabled={readOnly}
          className={`contents ${readOnly ? "select-text" : ""}`}
        >
          <div
            className={
              readOnly
                ? "pointer-events-none opacity-95 [&_input]:cursor-default [&_button]:cursor-default [&_select]:cursor-default [&_textarea]:cursor-default"
                : ""
            }
          >
            {sections.map((s, i) => (
              <section
                key={s}
                id={`sec-${s}`}
                className={i > 0 ? "mt-10 border-t border-border/80 pt-8" : ""}
              >
                {multi ? (
                  <div className="mb-4">
                    <h2 className="text-lg font-bold tracking-tight text-foreground">
                      {SECTION_LABELS[s]}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {SECTION_DESCRIPTIONS[s]}
                    </p>
                  </div>
                ) : (
                  <p className="mb-4 text-xs text-muted-foreground">
                    {SECTION_DESCRIPTIONS[s]}
                  </p>
                )}
                <SectionRenderer
                  sectionId={s}
                  draft={draft}
                  update={update}
                />
              </section>
            ))}
          </div>
        </fieldset>
      </main>

      <footer className="mx-auto min-w-0 w-full max-w-5xl px-4 py-6 text-center text-xs text-muted-foreground sm:px-6">
        Secure share link · Created{" "}
        {new Date(data.link.createdAt).toLocaleDateString()}
      </footer>
    </div>
  );
}

function SectionRenderer({
  sectionId,
  draft,
  update,
}: { sectionId: ShareSectionId } & DealSectionProps) {
  const sectionProps: DealSectionProps = { draft, update };
  switch (sectionId) {
    case "cover":
      return <CoverSection {...sectionProps} />;
    case "scenario":
      return <ScenarioSection {...sectionProps} />;
    case "overview":
      return <OverviewSection {...sectionProps} />;
    case "borrowers":
      return <BorrowersSection {...sectionProps} />;
    case "guarantors":
      return <GuarantorsSection {...sectionProps} />;
    case "business":
      return <BusinessSection {...sectionProps} />;
    case "property":
      return <PropertySection {...sectionProps} />;
    case "commercial":
      return <CommercialSection {...sectionProps} />;
    case "hardmoney":
      return <HardMoneySection {...sectionProps} />;
    case "loans":
      return <LoansSection {...sectionProps} />;
    case "income":
      return <IncomeSection {...sectionProps} />;
    case "assets":
      return <AssetsSection {...sectionProps} />;
    case "household":
      return <HouseholdSection {...sectionProps} />;
    case "workflow":
      return <WorkflowSection {...sectionProps} />;
    case "notes":
      return <NotesSection {...sectionProps} />;
    case "dti":
      return <DtiSection {...sectionProps} />;
    case "reo":
      return <ReoSection {...sectionProps} />;
    case "comparison":
      return <ComparisonSection {...sectionProps} />;
    case "weighted":
      return <WeightedInterestSection {...sectionProps} />;
    case "payoff":
      return <PayoffSection {...sectionProps} />;
    case "daycounter":
      return <DayCounterSection {...sectionProps} />;
    case "fees":
      return <FeesSection {...sectionProps} />;
  }
}

function CenteredMessage({
  children,
  tone = "info",
}: {
  children: React.ReactNode;
  tone?: "info" | "error";
}) {
  const toneClass =
    tone === "error"
      ? "border-destructive/30 bg-destructive/[0.08] text-destructive"
      : "border-border/80 bg-muted/40 text-foreground";
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className={`max-w-lg rounded-2xl border p-6 text-center ${toneClass}`}>
        {children}
      </div>
    </div>
  );
}

function SaveBadge({
  saving,
  savedAt,
  error,
}: {
  saving: boolean;
  savedAt: number | null;
  error: string | null;
}) {
  const label = useMemo(() => {
    if (error) return { text: error, cls: "text-destructive" };
    if (saving) return { text: "Saving…", cls: "text-muted-foreground" };
    if (savedAt)
      return {
        text: `Saved ${new Date(savedAt).toLocaleTimeString()}`,
        cls: "text-emerald-600 dark:text-emerald-400",
      };
    return {
      text: "Changes auto-save",
      cls: "text-muted-foreground",
    };
  }, [saving, savedAt, error]);

  return (
    <span className={`text-xs font-medium ${label.cls}`}>{label.text}</span>
  );
}
