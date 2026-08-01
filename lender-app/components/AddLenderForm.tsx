"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation } from "convex/react";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Button } from "./ui/Button";
import { Input, Label, Select, Textarea } from "./ui/Input";
import {
  FIELD_META,
  ENTITY_TYPES,
  blankLender,
  type Lender,
  type LenderField,
} from "@/lib/schema";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { classifyEntity } from "@/lib/classify";
import { cn } from "@/lib/cn";
import { useLiveConnection } from "@/lib/useLiveConnection";
import { LiveDataPausedNotice } from "@/components/LiveDataPausedNotice";
import { SettingsLink } from "@/components/SettingsLink";
import { useOrgConvexQueryArgs } from "@/lib/useOrgConvexQueryArgs";

const ADD_FIELD_GROUPS: {
  title: string;
  fields: LenderField[];
  defaultOpen?: boolean;
}[] = [
  {
    title: "Source & contact",
    fields: [
      "source",
      "section",
      "company",
      "contactName",
      "titleRole",
      "phone",
      "email",
      "website",
    ],
    defaultOpen: true,
  },
  {
    title: "Classification",
    fields: ["entityType", "primaryNiche"],
    defaultOpen: true,
  },
  {
    title: "Programs & property",
    fields: ["programs", "propertyTypes", "exclusions"],
    defaultOpen: true,
  },
  {
    title: "Geography & loan size",
    fields: [
      "statesServed",
      "ownerOrInvestor",
      "fundingAmountMin",
      "fundingAmountMax",
      "minFico",
      "ltv",
    ],
    defaultOpen: true,
  },
  {
    title: "Terms & fees",
    fields: ["interestRates", "amortTerm", "referralFees"],
    defaultOpen: false,
  },
  {
    title: "Notes & status",
    fields: ["notes", "status", "lastUpdated"],
    defaultOpen: false,
  },
];

export function AddLenderForm() {
  const [draft, setDraft] = useState<Lender>(blankLender());
  const [submitting, setSubmitting] = useState(false);
  const [flash, setFlash] = useState<null | {
    type: "ok" | "err";
    action?: "inserted" | "updated";
    message: string;
    id?: string;
  }>(null);
  const upsert = useMutation(api.lenders.upsert);
  const orgScope = useOrgConvexQueryArgs();
  const { canUseHub, browserOnline, actionTitle } = useLiveConnection();

  function update<K extends keyof Lender>(k: K, v: string) {
    setDraft((d) => ({ ...d, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFlash(null);
    if (!draft.company.trim()) {
      setFlash({ type: "err", message: "Company is required." });
      return;
    }
    if (!orgScope) {
      setFlash({ type: "err", message: "Sign in and select a workspace to add lenders." });
      return;
    }
    setSubmitting(true);
    try {
      const entityType =
        draft.entityType ||
        classifyEntity(draft.company, draft.primaryNiche, draft.notes);
      const result = await upsert({ ...draft, entityType, ...orgScope });
      setFlash({
        type: "ok",
        action: result.action,
        message:
          result.action === "inserted"
            ? `${draft.company} added to the database.`
            : `${draft.company} already existed — record updated with your new info.`,
        id: result.id,
      });
      setDraft(blankLender());
    } catch (err) {
      setFlash({
        type: "err",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSubmitting(false);
    }
  }

  const autoEntityType = draft.entityType
    ? null
    : classifyEntity(draft.company, draft.primaryNiche, draft.notes);

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <LiveDataPausedNotice
          scope="add"
          canUseHub={canUseHub}
          browserOnline={browserOnline}
          className="min-w-0 flex-1"
        />
        <SettingsLink
          section="data"
          className="shrink-0 self-start text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          Data preferences
        </SettingsLink>
      </div>
      {flash && (
        <div
          className={cn(
            "flex items-start gap-3 rounded-lg border p-3 text-sm",
            flash.type === "ok"
              ? "border-green-600/30 bg-green-50 text-green-900 dark:border-green-500/30 dark:bg-green-950/30 dark:text-green-200"
              : "border-destructive/30 bg-destructive/[0.08] text-destructive"
          )}
        >
          {flash.type === "ok" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4" />
          )}
          <div className="flex-1">
            <div>{flash.message}</div>
            {flash.type === "ok" && (
              <div className="mt-1 text-xs">
                <Link href="/lenders" className="underline">
                  Back to the list →
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="space-y-4">
        {ADD_FIELD_GROUPS.map((g) => (
          <CollapsibleSection
            key={g.title}
            variant="card"
            defaultOpen={g.defaultOpen !== false}
            title={
              <span className="text-sm font-semibold normal-case text-foreground">
                {g.title}
              </span>
            }
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {g.fields.map((f) => {
                const meta = FIELD_META[f];
                const fullWidth =
                  meta.multiline || f === "programs" || f === "propertyTypes";
                const value = (draft as unknown as Record<string, string>)[f];
                return (
                  <div key={f} className={cn(fullWidth && "md:col-span-2")}>
                    <Label hint={meta.hint}>
                      {meta.label}
                      {f === "company" && (
                        <span className="ml-1 text-destructive" aria-hidden>
                          *
                        </span>
                      )}
                    </Label>
                    {f === "entityType" ? (
                      <div className="space-y-1">
                        <Select
                          className="mt-1"
                          value={value}
                          onChange={(e) => update("entityType", e.target.value)}
                        >
                          <option value="">(auto-classify)</option>
                          {ENTITY_TYPES.map((e) => (
                            <option key={e} value={e}>
                              {e}
                            </option>
                          ))}
                        </Select>
                        {autoEntityType && (
                          <div className="text-xs text-muted-foreground">
                            Auto-classified as:{" "}
                            <strong className="text-foreground">
                              {autoEntityType}
                            </strong>
                          </div>
                        )}
                      </div>
                    ) : meta.multiline ? (
                      <Textarea
                        className="mt-1"
                        rows={5}
                        value={value}
                        onChange={(e) =>
                          update(f as keyof Lender, e.target.value)
                        }
                      />
                    ) : (
                      <Input
                        className="mt-1"
                        value={value}
                        onChange={(e) =>
                          update(f as keyof Lender, e.target.value)
                        }
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </CollapsibleSection>
        ))}
      </div>

      <div className="flex items-center justify-end gap-2 border-t pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => setDraft(blankLender())}
        >
          Reset
        </Button>
        <Button
          type="submit"
          disabled={submitting || !canUseHub}
          title={actionTitle("Add or update this lender in the database")}
        >
          {submitting ? "Saving…" : "Save Lender"}
        </Button>
      </div>
    </form>
  );
}
