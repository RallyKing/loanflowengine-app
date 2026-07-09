"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  SECTION_KEYS,
  SECTION_LABELS,
  isShareSection,
  type ShareSectionId,
} from "@/convex/shareSections";
import { shareTokenAbsoluteUrl } from "@/lib/intake/routes";

type ShareLink = Doc<"shareLinks">;

type Access = "view" | "edit";
type Audience = "client" | "lender" | "partner" | "other";

type Preset = {
  id: string;
  label: string;
  description: string;
  access: Access;
  audience: Audience;
};

const PRESETS: Preset[] = [
  {
    id: "client-edit",
    label: "Client — editable",
    description: "Client can fill in and update the selected sections.",
    access: "edit",
    audience: "client",
  },
  {
    id: "client-view",
    label: "Client — view only",
    description: "Client can review but cannot make changes.",
    access: "view",
    audience: "client",
  },
  {
    id: "lender-view",
    label: "Lender — view only",
    description: "Shareable summary for a 3rd-party lender or capital partner.",
    access: "view",
    audience: "lender",
  },
  {
    id: "custom",
    label: "Custom",
    description: "Pick audience and permissions manually.",
    access: "edit",
    audience: "other",
  },
];

const AUDIENCE_OPTIONS: { value: Audience; label: string }[] = [
  { value: "client", label: "Client" },
  { value: "lender", label: "Lender / capital partner" },
  { value: "partner", label: "Partner / referral" },
  { value: "other", label: "Other" },
];

const SECTION_GROUPS: { label: string; items: ShareSectionId[] }[] = [
  {
    label: "Summary",
    items: ["cover", "scenario", "overview"],
  },
  {
    label: "Intake",
    items: [
      "borrowers",
      "guarantors",
      "business",
      "property",
      "loans",
      "income",
      "assets",
      "household",
    ],
  },
  {
    label: "Commercial / Hard Money",
    items: ["commercial", "hardmoney", "fees"],
  },
  {
    label: "Analysis",
    items: ["dti", "reo", "comparison", "weighted", "payoff", "daycounter"],
  },
  {
    label: "Closing",
    items: ["workflow", "notes"],
  },
];

const ALL_SECTIONS = (Object.keys(SECTION_KEYS) as ShareSectionId[]).slice();

export function ShareManager({
  intakeId,
  currentSection,
  onClose,
}: {
  intakeId: Id<"intakeSheets">;
  currentSection: string;
  onClose: () => void;
}) {
  const links = useQuery(api.shareLinks.listForIntake, { intakeId });
  const createLink = useMutation(api.shareLinks.create);
  const revokeLink = useMutation(api.shareLinks.revoke);
  const removeLink = useMutation(api.shareLinks.remove);

  const defaultSection: ShareSectionId = isShareSection(currentSection)
    ? currentSection
    : "reo";

  // Captured once at mount so the expiry comparison stays pure for this render
  // batch. Refreshed naturally each time the manager is reopened since the
  // component is unmounted when closed.
  const [now] = useState(() => Date.now());

  const [picked, setPicked] = useState<Set<ShareSectionId>>(
    () => new Set([defaultSection]),
  );
  const [presetId, setPresetId] = useState<string>("client-edit");
  const [access, setAccess] = useState<Access>("edit");
  const [audience, setAudience] = useState<Audience>("client");
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [justCreated, setJustCreated] = useState<Id<"shareLinks"> | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const grouped = useMemo(() => {
    const active: ShareLink[] = [];
    const inactive: ShareLink[] = [];
    for (const l of links ?? []) {
      if (l.revokedAt || (l.expiresAt && l.expiresAt < now))
        inactive.push(l);
      else active.push(l);
    }
    active.sort((a, b) => b.createdAt - a.createdAt);
    inactive.sort((a, b) => b.createdAt - a.createdAt);
    return { active, inactive };
  }, [links, now]);

  function applyPreset(id: string) {
    setPresetId(id);
    const p = PRESETS.find((x) => x.id === id);
    if (p && id !== "custom") {
      setAccess(p.access);
      setAudience(p.audience);
    }
  }

  function togglePick(id: ShareSectionId) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setPicked(new Set(ALL_SECTIONS));
  }
  function clearAll() {
    setPicked(new Set());
  }
  function onlyCurrent() {
    setPicked(new Set([defaultSection]));
  }

  async function onCreate() {
    if (picked.size === 0) return;
    try {
      setCreating(true);
      const { id } = await createLink({
        intakeId,
        sections: Array.from(picked),
        access,
        audience,
        label: label.trim() || undefined,
      });
      setJustCreated(id);
      setLabel("");
      setTimeout(
        () => setJustCreated((j) => (j === id ? null : j)),
        2500,
      );
    } finally {
      setCreating(false);
    }
  }

  async function onCopy(token: string) {
    const url = buildUrl(token);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(token);
      setTimeout(() => setCopied((c) => (c === token ? null : c)), 1800);
    } catch {
      window.prompt("Copy this link:", url);
    }
  }

  const canCreate = !creating && picked.size > 0;
  const pickedCount = picked.size;

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/45 p-0 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="flex max-h-[min(92dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-1rem))] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-border bg-background shadow-2xl sm:max-h-[min(92dvh,100dvh-2rem)] sm:rounded-2xl"
      >
        <header className="relative flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:px-6">
          <div className="min-w-0 pr-8 sm:pr-0">
            <h2 className="text-lg font-semibold text-foreground">
              Share this intake
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Pick one or more sections, choose a permission preset, and
              send the link to your client, lender, or a 3rd party.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground sm:static sm:right-auto sm:top-auto sm:shrink-0"
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-4 sm:px-6 sm:py-5">
          <section className="mb-6 rounded-xl border border-border bg-muted/50 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              1. Who is this for?
            </h3>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {PRESETS.map((p) => {
                const active = presetId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyPreset(p.id)}
                    className={`rounded-xl border p-3 text-left transition ${
                      active
                        ? "border-primary bg-background ring-2 ring-primary/20"
                        : "border-border bg-background hover:border-primary/35"
                    }`}
                  >
                    <p className="text-sm font-semibold text-foreground">
                      {p.label}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{p.description}</p>
                  </button>
                );
              })}
            </div>

            {presetId === "custom" ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-xs font-medium text-muted-foreground">
                    Audience
                  </span>
                  <select
                    value={audience}
                    onChange={(e) => setAudience(e.target.value as Audience)}
                    className="rounded-md border border-border/80 bg-background px-2 py-1.5 text-sm text-foreground"
                  >
                    {AUDIENCE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-xs font-medium text-muted-foreground">
                    Permission
                  </span>
                  <select
                    value={access}
                    onChange={(e) => setAccess(e.target.value as Access)}
                    className="rounded-md border border-border/80 bg-background px-2 py-1.5 text-sm text-foreground"
                  >
                    <option value="edit">Editable</option>
                    <option value="view">View only</option>
                  </select>
                </label>
              </div>
            ) : null}
          </section>

          <section className="mb-6 rounded-xl border border-border bg-muted/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  2. Which sections?
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {pickedCount === 0
                    ? "Select at least one section."
                    : `${pickedCount} section${pickedCount === 1 ? "" : "s"} selected`}
                </p>
              </div>
              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  onClick={onlyCurrent}
                  className="rounded-md border border-border bg-background px-2 py-1 font-medium text-foreground hover:bg-muted"
                >
                  Current section
                </button>
                <button
                  type="button"
                  onClick={selectAll}
                  className="rounded-md border border-border bg-background px-2 py-1 font-medium text-foreground hover:bg-muted"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={clearAll}
                  className="rounded-md border border-border bg-background px-2 py-1 font-medium text-foreground hover:bg-muted"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {SECTION_GROUPS.map((group) => (
                <div key={group.label} className="rounded-lg bg-background p-3 ring-1 ring-border/60">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.label}
                  </p>
                  <ul className="flex flex-col gap-1">
                    {group.items.map((id) => {
                      const active = picked.has(id);
                      return (
                        <li key={id}>
                          <label className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-0.5 text-sm text-foreground hover:bg-muted/80">
                            <input
                              type="checkbox"
                              checked={active}
                              onChange={() => togglePick(id)}
                              className="h-3.5 w-3.5 rounded border-border text-primary accent-primary"
                            />
                            <span>{SECTION_LABELS[id]}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <section className="mb-6 rounded-xl border border-border bg-muted/50 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              3. Label & generate
            </h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs font-medium text-muted-foreground">
                  Label (optional — e.g. &quot;John Smith&quot; or &quot;Kiavi — file 4281&quot;)
                </span>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Reminds you who this link went to"
                  className="rounded-md border border-border/80 bg-background px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground"
                />
              </label>
              <div className="flex items-end">
                <button
                  type="button"
                  disabled={!canCreate}
                  onClick={onCreate}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {creating
                    ? "Creating…"
                    : `Generate ${access === "edit" ? "editable" : "view-only"} link`}
                </button>
              </div>
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Active links
            </h3>
            {grouped.active.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border bg-muted/30 p-5 text-center text-sm text-muted-foreground">
                No active share links yet.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {grouped.active.map((l) => (
                  <LinkRow
                    key={l._id}
                    link={l}
                    now={now}
                    copied={copied === l.token}
                    highlight={justCreated === l._id}
                    onCopy={() => onCopy(l.token)}
                    onRevoke={() => revokeLink({ id: l._id })}
                  />
                ))}
              </ul>
            )}

            {grouped.inactive.length > 0 ? (
              <>
                <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Revoked / expired
                </h3>
                <ul className="flex flex-col gap-2">
                  {grouped.inactive.map((l) => (
                    <LinkRow
                      key={l._id}
                      link={l}
                      now={now}
                      copied={false}
                      inactive
                      onCopy={() => {}}
                      onRemove={() => removeLink({ id: l._id })}
                    />
                  ))}
                </ul>
              </>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}

function LinkRow({
  link,
  now,
  copied,
  highlight,
  onCopy,
  onRevoke,
  onRemove,
  inactive,
}: {
  link: ShareLink;
  now: number;
  copied: boolean;
  highlight?: boolean;
  onCopy: () => void;
  onRevoke?: () => void;
  onRemove?: () => void;
  inactive?: boolean;
}) {
  const sections = linkSections(link);
  const sectionsText =
    sections.length === 0
      ? "(no sections)"
      : sections.length <= 3
        ? sections.map((s) => labelFor(s)).join(", ")
        : `${sections.length} sections`;
  const access: Access = link.access === "view" ? "view" : "edit";
  const audience = link.audience ?? "client";
  const url = buildUrl(link.token);

  return (
    <li
      className={`flex flex-col gap-2 rounded-xl border p-3 text-sm transition ${
        inactive
          ? "border-border bg-muted/40 opacity-75"
          : highlight
            ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30"
            : "border-border bg-background"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                access === "edit"
                  ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
                  : "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
              }`}
            >
              {access === "edit" ? "Editable" : "View only"}
            </span>
            <span className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-foreground">
              {audienceLabelOf(audience)}
            </span>
          </div>
          <p className="mt-1 font-semibold text-foreground">
            {sectionsText}
            {link.label ? (
              <span className="ml-2 text-muted-foreground">· {link.label}</span>
            ) : null}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Created {new Date(link.createdAt).toLocaleString()}
            {link.lastOpenedAt
              ? ` · Last opened ${new Date(link.lastOpenedAt).toLocaleString()}`
              : " · Never opened"}
            {link.submissionCount && link.submissionCount > 0
              ? ` · ${link.submissionCount} submission${link.submissionCount === 1 ? "" : "s"}`
              : ""}
            {link.revokedAt ? " · Revoked" : ""}
            {!link.revokedAt && link.expiresAt && link.expiresAt < now
              ? " · Expired"
              : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!inactive ? (
            <>
              <button
                type="button"
                onClick={onCopy}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-foreground transition hover:bg-muted"
              >
                {copied ? "Copied!" : "Copy link"}
              </button>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-foreground transition hover:bg-muted"
              >
                Open
              </a>
              {onRevoke ? (
                <button
                  type="button"
                  onClick={onRevoke}
                  className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 transition hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300"
                >
                  Revoke
                </button>
              ) : null}
            </>
          ) : (
            <>
              {onRemove ? (
                <button
                  type="button"
                  onClick={onRemove}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-muted-foreground transition hover:bg-muted"
                >
                  Delete
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>
      {!inactive ? (
        <input
          type="text"
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="w-full rounded-md border border-border bg-muted/40 px-2 py-1 font-mono text-xs text-foreground"
        />
      ) : null}
    </li>
  );
}

function linkSections(l: ShareLink): string[] {
  if (l.sections && l.sections.length > 0) return l.sections;
  if (l.section) return [l.section];
  return [];
}

function labelFor(id: string): string {
  return isShareSection(id) ? SECTION_LABELS[id] : id;
}

function audienceLabelOf(a: string): string {
  switch (a) {
    case "client":
      return "Client";
    case "lender":
      return "Lender";
    case "partner":
      return "Partner";
    default:
      return "Guest";
  }
}

function buildUrl(token: string) {
  return shareTokenAbsoluteUrl(token);
}
