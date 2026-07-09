"use client";

import type { Doc } from "@/convex/_generated/dataModel";
import {
  formatPhoneDisplay,
  resolveContactEmails,
  resolveContactPhones,
} from "@/lib/contact/contactMethods";
import { Star } from "lucide-react";

type ContactMethodsDetailProps = {
  contact: Pick<Doc<"contacts">, "email" | "emails" | "phone" | "phones">;
  /** When set, renders as page heading above method sections. */
  name?: string;
  className?: string;
};

export function ContactMethodsDetail({
  contact,
  name,
  className,
}: ContactMethodsDetailProps) {
  const emails = resolveContactEmails(contact);
  const phones = resolveContactPhones(contact);

  return (
    <div className={className}>
      {name ? (
        <h3 className="text-base font-semibold text-foreground">{name}</h3>
      ) : null}

      {emails.length > 0 ? (
        <section
          className={name ? "mt-4" : undefined}
          aria-labelledby="contact-detail-emails"
        >
          <h4
            id="contact-detail-emails"
            className="text-sm font-medium text-foreground"
          >
            Emails
          </h4>
          <ul className="mt-2 space-y-2" role="list">
            {emails.map((e) => (
              <li key={e.id} className="text-sm">
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <span>{e.label}</span>
                  {e.isPrimary ? (
                    <Star
                      className="h-3 w-3 fill-primary text-primary"
                      aria-label="Primary"
                    />
                  ) : null}
                </div>
                <a
                  href={`mailto:${encodeURIComponent(e.email)}`}
                  className="text-primary hover:underline"
                >
                  {e.email}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {phones.length > 0 ? (
        <section
          className={emails.length > 0 || name ? "mt-4" : undefined}
          aria-labelledby="contact-detail-phones"
        >
          <h4
            id="contact-detail-phones"
            className="text-sm font-medium text-foreground"
          >
            Phones
          </h4>
          <ul className="mt-2 space-y-2" role="list">
            {phones.map((p) => (
              <li key={p.id} className="text-sm">
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <span>{p.label}</span>
                  {p.isPrimary ? (
                    <Star
                      className="h-3 w-3 fill-primary text-primary"
                      aria-label="Primary"
                    />
                  ) : null}
                </div>
                <a
                  href={`tel:${p.number.replace(/\s/g, "")}`}
                  className="text-foreground hover:underline"
                >
                  {formatPhoneDisplay(p.number)}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {emails.length === 0 && phones.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          No email or phone on file.
        </p>
      ) : null}
    </div>
  );
}
