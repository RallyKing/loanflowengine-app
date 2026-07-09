"use client";

import {
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

const baseInput =
  "w-full rounded-md border border-border/80 bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground shadow-sm transition focus-visible:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:ring-offset-1 focus-visible:ring-offset-background";

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-xs font-medium uppercase tracking-wide text-muted-foreground"
    >
      {children}
    </label>
  );
}

export function Field({
  label,
  hint,
  className = "",
  children,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label ? <Label>{label}</Label> : null}
      {children}
      {hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return <input {...rest} className={`${baseInput} ${className}`} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = "", ...rest } = props;
  return <textarea {...rest} className={`${baseInput} min-h-[88px] resize-y ${className}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = "", ...rest } = props;
  return <select {...rest} className={`${baseInput} ${className}`} />;
}

export function SectionCard({
  title,
  description,
  children,
  actions,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="w-full min-w-0 max-w-full rounded-2xl border border-border bg-background p-3 shadow-sm sm:p-4 md:p-6">
      <header className="mb-4 flex flex-col gap-3 sm:mb-5 md:flex-row md:items-start md:justify-between md:gap-4">
        <div className="min-w-0 w-full flex-1">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          {description ? (
            <p className="mt-0.5 break-words text-sm text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div className="w-full shrink-0 self-start md:w-auto">{actions}</div> : null}
      </header>
      <div className="min-w-0 w-full">{children}</div>
    </section>
  );
}

/** A field that visibly derives its value from another section of the intake.
 *  - Empty value with a linked source shows a "linked from" hint
 *  - Matching value shows a "matches intake" badge
 *  - Differing value shows an amber conflict banner with a one-click revert
 */
export function LinkedField({
  label,
  value,
  linkedValue,
  linkedFrom,
  onChange,
  placeholder,
  formatDisplay,
  className = "",
  hint,
  type = "text",
  "data-testid": dataTestId,
}: {
  label?: ReactNode;
  value: string | undefined;
  linkedValue: string | undefined;
  linkedFrom: string;
  onChange: (v: string) => void;
  placeholder?: string;
  formatDisplay?: (v: string) => string;
  className?: string;
  hint?: ReactNode;
  type?: string;
  "data-testid"?: string;
}) {
  const hasLinked = Boolean((linkedValue ?? "").toString().trim());
  const hasValue = Boolean((value ?? "").toString().trim());
  const fmt = (v: string) => (formatDisplay ? formatDisplay(v) : v);

  const differs = hasLinked && hasValue && !numericOrStringEqual(value!, linkedValue!);

  let status: ReactNode = hint ? (
    <p className="text-xs text-muted-foreground">{hint}</p>
  ) : null;

  if (hasLinked && !hasValue) {
    status = (
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <LinkGlyph /> From <strong className="font-semibold">{linkedFrom}</strong>:{" "}
          <span className="font-medium text-foreground">{fmt(linkedValue!)}</span>
        </span>
        <button
          type="button"
          onClick={() => onChange(linkedValue!)}
          className="text-foreground/80 underline decoration-dotted underline-offset-2 hover:text-foreground"
        >
          Use
        </button>
      </div>
    );
  } else if (differs) {
    status = (
      <div className="flex items-start justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
        <span className="inline-flex items-start gap-1">
          <WarnGlyph />
          <span>
            Conflicts with <strong className="font-semibold">{linkedFrom}</strong>:{" "}
            <span className="font-medium">{fmt(linkedValue!)}</span>
          </span>
        </span>
        <button
          type="button"
          onClick={() => onChange(linkedValue!)}
          className="shrink-0 rounded-sm bg-amber-200 px-1.5 py-0.5 font-semibold text-amber-900 hover:bg-amber-300 dark:bg-amber-900 dark:text-amber-100 dark:hover:bg-amber-800"
        >
          Use intake
        </button>
      </div>
    );
  } else if (hasLinked && hasValue) {
    status = (
      <div className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
        <LinkGlyph /> Matches <strong className="font-semibold">{linkedFrom}</strong>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label ? <Label>{label}</Label> : null}
      <input
        type={type}
        className={baseInput}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? (hasLinked ? fmt(linkedValue!) : "")}
        data-testid={dataTestId}
      />
      {status}
    </div>
  );
}

/** Read-only summary stat sourced from another section, with an optional "override" text input. */
export function LinkedStat({
  label,
  value,
  sourceLabel,
  detail,
}: {
  label: string;
  value: string;
  sourceLabel?: string;
  detail?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-muted/40 px-3 py-2">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-sm font-semibold tabular-nums text-foreground">
        {value}
      </span>
      {detail ? <span className="text-[11px] text-muted-foreground">{detail}</span> : null}
      {sourceLabel ? (
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
          <LinkGlyph /> {sourceLabel}
        </span>
      ) : null}
    </div>
  );
}

function numericOrStringEqual(a: string, b: string): boolean {
  const aa = a.trim();
  const bb = b.trim();
  if (aa === bb) return true;
  const an = Number(aa.replace(/[^0-9.\-]/g, ""));
  const bn = Number(bb.replace(/[^0-9.\-]/g, ""));
  if (Number.isFinite(an) && Number.isFinite(bn) && (an !== 0 || bn !== 0)) {
    return Math.abs(an - bn) < 0.009;
  }
  return aa.toLowerCase() === bb.toLowerCase();
}

function LinkGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function WarnGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

export function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  const styles = {
    primary:
      "bg-primary text-primary-foreground shadow-sm hover:opacity-90",
    secondary:
      "border border-border bg-muted text-foreground hover:bg-muted/80",
    ghost:
      "bg-transparent text-foreground shadow-none hover:bg-muted",
    danger:
      "bg-destructive text-destructive-foreground hover:opacity-90",
  } as const;
  return (
    <button
      type={type}
      {...rest}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-medium shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${styles[variant]} ${className}`}
    />
  );
}
