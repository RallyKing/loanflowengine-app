"use client";

import { Plus, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import {
  CONTACT_EMAIL_LABELS,
  CONTACT_PHONE_LABELS,
  formatPhoneDisplay,
  newContactMethodId,
  type ContactEmailEntry,
  type ContactEmailLabel,
  type ContactPhoneEntry,
  type ContactPhoneLabel,
} from "@/lib/contact/contactMethods";

function setPrimary<T extends { id: string; isPrimary: boolean }>(
  list: T[],
  id: string,
): T[] {
  return list.map((item) => ({ ...item, isPrimary: item.id === id }));
}

type ContactMethodsEditorProps = {
  emails: ContactEmailEntry[];
  phones: ContactPhoneEntry[];
  onEmailsChange: (next: ContactEmailEntry[]) => void;
  onPhonesChange: (next: ContactPhoneEntry[]) => void;
  disabled?: boolean;
};

export function ContactMethodsEditor({
  emails,
  phones,
  onEmailsChange,
  onPhonesChange,
  disabled,
}: ContactMethodsEditorProps) {
  const addEmail = () => {
    const isFirst = emails.length === 0;
    onEmailsChange([
      ...emails,
      {
        id: newContactMethodId(),
        label: "Work",
        email: "",
        isPrimary: isFirst,
      },
    ]);
  };

  const addPhone = () => {
    const isFirst = phones.length === 0;
    onPhonesChange([
      ...phones,
      {
        id: newContactMethodId(),
        label: "Mobile",
        number: "",
        isPrimary: isFirst,
      },
    ]);
  };

  return (
    <div className="grid gap-6">
      <section className="grid gap-3" aria-labelledby="contact-emails-heading">
        <h3
          id="contact-emails-heading"
          className="text-sm font-medium text-foreground"
        >
          Emails
        </h3>
        {emails.length === 0 ? (
          <p className="text-sm text-muted-foreground">No email addresses yet.</p>
        ) : (
          <ul className="grid gap-2" role="list">
            {emails.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-col gap-2 rounded-md border border-border bg-muted/20 p-3 sm:flex-row sm:items-end"
              >
                <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[7rem_1fr]">
                  <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                    Label
                    <Select
                      value={entry.label}
                      disabled={disabled}
                      onChange={(e) => {
                        const label = (e.currentTarget?.value ??
                          "") as ContactEmailLabel;
                        onEmailsChange(
                          emails.map((x) =>
                            x.id === entry.id ? { ...x, label } : x,
                          ),
                        );
                      }}
                    >
                      {CONTACT_EMAIL_LABELS.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label className="grid min-w-0 gap-1 text-xs font-medium text-muted-foreground">
                    Email
                    <Input
                      type="email"
                      value={entry.email ?? ""}
                      disabled={disabled}
                      placeholder="name@example.com"
                      onChange={(e) => {
                        const email = e.currentTarget.value;
                        onEmailsChange(
                          emails.map((x) =>
                            x.id === entry.id ? { ...x, email } : x,
                          ),
                        );
                      }}
                    />
                  </label>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant={entry.isPrimary ? "primary" : "outline"}
                    size="sm"
                    disabled={disabled}
                    title={entry.isPrimary ? "Primary email" : "Set as primary"}
                    aria-label={
                      entry.isPrimary
                        ? "Primary email"
                        : "Set as primary email"
                    }
                    onClick={() => onEmailsChange(setPrimary(emails, entry.id))}
                  >
                    <Star
                      className={cn(
                        "h-3.5 w-3.5",
                        entry.isPrimary && "fill-current",
                      )}
                      aria-hidden
                    />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={disabled}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Remove email"
                    onClick={() => {
                      const next = emails.filter((x) => x.id !== entry.id);
                      if (next.length && !next.some((x) => x.isPrimary)) {
                        next[0] = { ...next[0], isPrimary: true };
                      }
                      onEmailsChange(next);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          disabled={disabled}
          onClick={addEmail}
        >
          <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
          Add Email
        </Button>
      </section>

      <section className="grid gap-3" aria-labelledby="contact-phones-heading">
        <h3
          id="contact-phones-heading"
          className="text-sm font-medium text-foreground"
        >
          Phones
        </h3>
        {phones.length === 0 ? (
          <p className="text-sm text-muted-foreground">No phone numbers yet.</p>
        ) : (
          <ul className="grid gap-2" role="list">
            {phones.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-col gap-2 rounded-md border border-border bg-muted/20 p-3 sm:flex-row sm:items-end"
              >
                <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[7rem_1fr]">
                  <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                    Label
                    <Select
                      value={entry.label}
                      disabled={disabled}
                      onChange={(e) => {
                        const label = (e.currentTarget?.value ??
                          "") as ContactPhoneLabel;
                        onPhonesChange(
                          phones.map((x) =>
                            x.id === entry.id ? { ...x, label } : x,
                          ),
                        );
                      }}
                    >
                      {CONTACT_PHONE_LABELS.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label className="grid min-w-0 gap-1 text-xs font-medium text-muted-foreground">
                    Number
                    <Input
                      type="tel"
                      value={entry.number ?? ""}
                      disabled={disabled}
                      placeholder="Phone number"
                      onChange={(e) => {
                        const number = e.currentTarget?.value ?? "";
                        onPhonesChange(
                          phones.map((x) =>
                            x.id === entry.id ? { ...x, number } : x,
                          ),
                        );
                      }}
                    />
                  </label>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant={entry.isPrimary ? "primary" : "outline"}
                    size="sm"
                    disabled={disabled}
                    title={entry.isPrimary ? "Primary phone" : "Set as primary"}
                    aria-label={
                      entry.isPrimary
                        ? "Primary phone"
                        : "Set as primary phone"
                    }
                    onClick={() => onPhonesChange(setPrimary(phones, entry.id))}
                  >
                    <Star
                      className={cn(
                        "h-3.5 w-3.5",
                        entry.isPrimary && "fill-current",
                      )}
                      aria-hidden
                    />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={disabled}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Remove phone"
                    onClick={() => {
                      const next = phones.filter((x) => x.id !== entry.id);
                      if (next.length && !next.some((x) => x.isPrimary)) {
                        next[0] = { ...next[0], isPrimary: true };
                      }
                      onPhonesChange(next);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          disabled={disabled}
          onClick={addPhone}
        >
          <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
          Add Phone
        </Button>
      </section>
    </div>
  );
}

/** Compact preview row for list contexts. */
export function contactMethodsPreviewLine(
  emails: ContactEmailEntry[],
  phones: ContactPhoneEntry[],
): string | null {
  const e = emails.find((x) => x.isPrimary) ?? emails[0];
  const p = phones.find((x) => x.isPrimary) ?? phones[0];
  const parts: string[] = [];
  if (e?.email.trim()) parts.push(e.email.trim());
  else if (phones.length === 0 && emails.length > 1) return null;
  if (p?.number.trim()) parts.push(formatPhoneDisplay(p.number));
  return parts.length ? parts.join(" · ") : null;
}
