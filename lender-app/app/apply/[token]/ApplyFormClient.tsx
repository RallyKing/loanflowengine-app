"use client";

import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { useMutation } from "convex/react";
import type { Preloaded } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import {
  portalFieldsForForm,
  type DealPartyFieldDef,
} from "@/lib/intake/dealPartyFieldRegistry";

type PublicFormPayload = {
  status: "ok";
  link: { _id: string; label?: string };
  form: {
    _id: string;
    name: string;
    formType: "file_intake" | "referral";
    fieldKeys: string[];
    borrowerPartyType: "individual" | "entity" | "either";
    organizationName: string;
  };
};

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: DealPartyFieldDef;
  value: string;
  onChange: (next: string) => void;
}) {
  const common = {
    id: field.registryKey,
    name: field.registryKey,
    value,
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      onChange(e.target.value),
    className: "min-h-11 w-full",
    required: field.registryKey === "borrower_first_name" || field.registryKey === "entity_legal_name",
  };

  if (field.kind === "select" && field.selectOptions) {
    return (
      <select
        {...common}
        className={cn(common.className, "rounded-dlc-md border border-input bg-background px-3 text-sm")}
      >
        <option value="">Select…</option>
        {field.selectOptions.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }

  return (
    <Input
      type={
        field.kind === "email"
          ? "email"
          : field.kind === "tel"
            ? "tel"
            : field.kind === "date"
              ? "date"
              : "text"
      }
      autoComplete={
        field.kind === "email"
          ? "email"
          : field.kind === "tel"
            ? "tel"
            : undefined
      }
      {...common}
    />
  );
}

export function ApplyFormClient({
  token,
  initial,
}: {
  token: string;
  initial: PublicFormPayload;
}) {
  const markOpened = useMutation(api.intakeForms.markOpened);
  const submit = useMutation(api.intakeForms.submitByToken);
  const [partyType, setPartyType] = useState<"individual" | "entity">(
    initial.form.borrowerPartyType === "entity" ? "entity" : "individual",
  );
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    void markOpened({ token });
  }, [markOpened, token]);

  const fields = useMemo(
    () =>
      portalFieldsForForm({
        fieldKeys: initial.form.fieldKeys,
        borrowerPartyType: initial.form.borrowerPartyType,
        submittedPartyType: partyType,
      }),
    [initial.form.fieldKeys, initial.form.borrowerPartyType, partyType],
  );

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await submit({
        token,
        values,
        partyType:
          initial.form.borrowerPartyType === "either" ? partyType : undefined,
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (submitted) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-border/80 bg-card p-8 text-center shadow-dlc-2">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
          ✓
        </div>
        <h1 className="text-lg font-semibold text-foreground">Thank you</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your information was submitted securely. Your loan team will follow up
          shortly.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-lg">
      <header className="mb-8 text-center">
        <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl bg-brand text-sm font-bold text-brand-foreground">
          DLC
        </div>
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Secure intake · {initial.form.organizationName}
        </p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
          {initial.form.name}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Complete the fields below. Your data is encrypted in transit and shared
          only with your assigned loan team.
        </p>
      </header>

      <form
        onSubmit={(e) => void onSubmit(e)}
        className="space-y-5 rounded-2xl border border-border/80 bg-card p-6 shadow-dlc-1 sm:p-8"
      >
        {initial.form.borrowerPartyType === "either" ? (
          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Borrower type
            </legend>
            <div className="flex gap-2">
              {(
                [
                  ["individual", "Individual"],
                  ["entity", "Business entity"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPartyType(value)}
                  className={cn(
                    "flex-1 rounded-dlc-md border px-3 py-2.5 text-sm font-medium transition-colors duration-dlc-standard",
                    partyType === value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted/40",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
        ) : null}

        <div className="space-y-4">
          {fields.map((field) => (
            <div key={field.registryKey} className="space-y-1.5">
              <label
                htmlFor={field.registryKey}
                className="text-xs font-semibold text-foreground"
              >
                {field.label}
              </label>
              <FieldInput
                field={field}
                value={values[field.registryKey] ?? ""}
                onChange={(next) =>
                  setValues((prev) => ({ ...prev, [field.registryKey]: next }))
                }
              />
            </div>
          ))}
        </div>

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <Button
          type="submit"
          className="min-h-11 w-full"
          disabled={busy || fields.length === 0}
        >
          {busy ? "Submitting…" : "Submit securely"}
        </Button>

        <p className="text-center text-[10px] leading-relaxed text-muted-foreground">
          By submitting, you authorize {initial.form.organizationName} to use this
          information for loan qualification purposes.
        </p>
      </form>
    </div>
  );
}

export type ApplyPreloaded = Preloaded<typeof api.intakeForms.getByToken>;
