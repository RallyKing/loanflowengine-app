"use client";

import { Plus, Trash2 } from "lucide-react";
import type { Lender, Program } from "@/lib/schema";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { CollapsibleSection } from "@/components/CollapsibleSection";

function Field({ k, v }: { k: string; v: string }) {
  if (!v) return null;
  return (
    <div>
      <div className="text-xs text-muted-foreground">{k}</div>
      <div className="text-sm leading-5">{v}</div>
    </div>
  );
}

export function LenderProgramsTab({
  draft,
  editing,
  canUseHub,
  onAddProgram,
  onRemoveProgram,
  onPatchProgram,
  onPatchField,
}: {
  draft: Lender;
  editing: boolean;
  canUseHub: boolean;
  onAddProgram: () => void;
  onRemoveProgram: (i: number) => void;
  onPatchProgram: (i: number, patch: Partial<Program>) => void;
  onPatchField: (field: keyof Lender, value: string) => void;
}) {
  const programs = draft.programList ?? [];
  const canEdit = editing && canUseHub;

  return (
    <div className="space-y-5">
      <CollapsibleSection
        variant="card"
        defaultOpen
        title={
          <span className="text-sm font-semibold normal-case text-foreground">
            Specialty summary
          </span>
        }
        description="Free-text niche and funding types used in search and matching."
      >
        {canEdit ? (
          <div className="grid grid-cols-1 gap-3">
            <div>
              <Label>Primary niche</Label>
              <Input
                className="mt-1"
                value={draft.primaryNiche ?? ""}
                onChange={(e) => onPatchField("primaryNiche", e.target.value)}
              />
            </div>
            <div>
              <Label>Programs / funding types</Label>
              <Textarea
                className="mt-1"
                rows={3}
                value={draft.programs ?? ""}
                onChange={(e) => onPatchField("programs", e.target.value)}
              />
            </div>
            <div>
              <Label>Property types</Label>
              <Textarea
                className="mt-1"
                rows={2}
                value={draft.propertyTypes ?? ""}
                onChange={(e) => onPatchField("propertyTypes", e.target.value)}
              />
            </div>
            <div>
              <Label>Exclusions</Label>
              <Textarea
                className="mt-1"
                rows={2}
                value={draft.exclusions ?? ""}
                onChange={(e) => onPatchField("exclusions", e.target.value)}
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            <Field k="Primary Niche" v={draft.primaryNiche} />
            <Field k="Programs / Funding Types" v={draft.programs} />
            <Field k="Property Types" v={draft.propertyTypes} />
            <Field k="Exclusions" v={draft.exclusions} />
            {!draft.primaryNiche &&
              !draft.programs &&
              !draft.propertyTypes &&
              !draft.exclusions && (
                <p className="col-span-full text-sm text-muted-foreground">
                  No specialty summary yet. Tap Edit to add niche and funding types.
                </p>
              )}
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        variant="card"
        defaultOpen
        title={
          <span className="text-sm font-semibold normal-case text-foreground">
            Programs
          </span>
        }
        description="Structured programs with per-program FICO and requirements — used by scenario matching."
        headerRight={
          canEdit ? (
            <Button type="button" variant="outline" size="sm" onClick={onAddProgram}>
              <Plus className="h-3.5 w-3.5" /> Add program
            </Button>
          ) : undefined
        }
      >
        {programs.length === 0 ? (
          <div className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
            {canEdit
              ? 'No structured programs yet. Click "Add program" to start.'
              : "No structured programs yet. Tap Edit to add programs."}
          </div>
        ) : canEdit ? (
          <div className="space-y-3">
            {programs.map((p, i) => (
              <div key={i} className="rounded-md border bg-muted/20 p-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="md:col-span-2">
                    <Label>Program name</Label>
                    <Input
                      className="mt-1"
                      placeholder="e.g. DSCR Investor / SBA 7(a) / Bridge"
                      value={p.name ?? ""}
                      onChange={(e) => onPatchProgram(i, { name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label hint="Leave blank to use the lender-wide min">
                      Min FICO
                    </Label>
                    <Input
                      className="mt-1"
                      placeholder="680"
                      inputMode="numeric"
                      value={p.minFico ?? ""}
                      onChange={(e) =>
                        onPatchProgram(i, { minFico: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <Label>Requirements / notes</Label>
                  <Textarea
                    className="mt-1"
                    rows={3}
                    placeholder={"e.g. DSCR >= 1.1\n12mo reserves"}
                    value={p.requirements ?? ""}
                    onChange={(e) =>
                      onPatchProgram(i, { requirements: e.target.value })
                    }
                  />
                </div>
                <div className="mt-2 flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onRemoveProgram(i)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" /> Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {programs.map((p, i) => (
              <div key={i} className="rounded-md border bg-muted/30 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-sm font-semibold">
                    {p.name || (
                      <span className="italic text-muted-foreground">
                        (unnamed program)
                      </span>
                    )}
                  </div>
                  {p.minFico && (
                    <Badge variant="warning">Min FICO: {p.minFico}</Badge>
                  )}
                </div>
                {p.requirements && (
                  <div className="mt-2 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
                    {p.requirements}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CollapsibleSection>
    </div>
  );
}
