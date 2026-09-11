import type {
  BuildMerchantNotificationArgs,
  NotificationCompanionPayload,
} from "./types";

function n(value: string | null | undefined): string | null {
  if (value == null) return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

/**
 * Build SenseBS-compatible companion JSON for one deliveryMethod POST.
 * Prefer null over omitting keys.
 */
export function buildMerchantNotificationPayload(
  args: BuildMerchantNotificationArgs,
): NotificationCompanionPayload {
  const now = args.nowMs ?? Date.now();
  const customerName = n(args.customer.name);
  const firstName = n(args.customer.firstName);
  const lastName = n(args.customer.lastName);
  const phone = n(args.customer.phone);
  const email = n(args.customer.email);
  const sms = n(args.smsMessage);
  const subject = n(args.subject);
  const html = n(args.html);
  const plaintext = n(args.plaintext);
  const isTest = Boolean(args.isTest);

  const delivery = args.deliveryMethod;
  const smsOrHtmlBody =
    delivery === "SMS" ? sms : delivery === "EMAIL" ? html : null;

  const payment = (args.domain?.payment ?? null) as
    | {
        succeeded?: boolean;
        status?: string;
        paymentMethod?: string;
        card?: { last4?: string; brand?: string };
      }
    | null;

  const links = (args.domain?.links ?? null) as
    | { trackingUrl?: string | null }
    | null;
  const trackingUrl = n(links?.trackingUrl ?? null);

  const payload: NotificationCompanionPayload = {
    event: args.event,
    timestamp: now,
    timestampISO: new Date(now).toISOString(),
    message: args.message,
    isTest,

    organization: {
      id: args.organization.id,
      name: args.organization.name,
      subdomain: args.organization.subdomain ?? null,
    },

    customerName,
    name: customerName,
    firstName,
    lastName,

    phone,
    recipientPhone: phone,
    smsMessage: delivery === "SMS" || delivery === "INTERNAL" ? sms : null,
    customerMessage: delivery === "SMS" || delivery === "INTERNAL" ? sms : null,
    body: smsOrHtmlBody,

    email,
    to: email,
    recipientEmail: email,
    subject: delivery === "EMAIL" || delivery === "INTERNAL" ? subject : null,
    html: delivery === "EMAIL" || delivery === "INTERNAL" ? html : null,
    htmlBody: delivery === "EMAIL" || delivery === "INTERNAL" ? html : null,
    emailBody: delivery === "EMAIL" || delivery === "INTERNAL" ? html : null,
    emailHTML: delivery === "EMAIL" || delivery === "INTERNAL" ? html : null,
    emailHtml: delivery === "EMAIL" || delivery === "INTERNAL" ? html : null,

    paymentSucceeded:
      payment && typeof payment.succeeded === "boolean"
        ? payment.succeeded
        : null,
    paymentStatus: n(payment?.status ?? null),
    paymentMethod: n(payment?.paymentMethod ?? null),
    cardLast4: n(payment?.card?.last4 ?? null),
    cardBrand: n(payment?.card?.brand ?? null),
    receiptUrl: n(
      typeof args.domain?.receiptUrl === "string"
        ? args.domain.receiptUrl
        : null,
    ),

    data: {
      notification: {
        deliveryMethod: delivery,
        context: args.context,
        phone,
        recipientPhone: phone,
        smsMessage: delivery === "SMS" || delivery === "INTERNAL" ? sms : null,
        customerMessage:
          delivery === "SMS" || delivery === "INTERNAL" ? sms : null,
        email,
        to: email,
        recipientEmail: email,
        subject: delivery === "EMAIL" || delivery === "INTERNAL" ? subject : null,
        body: smsOrHtmlBody,
        html: delivery === "EMAIL" || delivery === "INTERNAL" ? html : null,
        htmlBody: delivery === "EMAIL" || delivery === "INTERNAL" ? html : null,
        emailBody:
          delivery === "EMAIL" || delivery === "INTERNAL" ? html : null,
        emailHTML:
          delivery === "EMAIL" || delivery === "INTERNAL" ? html : null,
        emailHtml:
          delivery === "EMAIL" || delivery === "INTERNAL" ? html : null,
        plaintext:
          delivery === "EMAIL" || delivery === "INTERNAL" ? plaintext : null,
        isTest,
        firstName,
        lastName,
        customerName,
        name: customerName,
        trackingUrl,
      },
      customer: {
        id: n(args.customer.id),
        name: customerName,
        firstName,
        lastName,
        customerName,
        phone,
        email,
      },
      changes: null,
      ...(args.domain ?? {}),
    },
  };

  return payload;
}

export function splitName(full: string | null | undefined): {
  firstName: string | null;
  lastName: string | null;
  name: string | null;
} {
  const name = n(full);
  if (!name) return { firstName: null, lastName: null, name: null };
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return { firstName: parts[0]!, lastName: null, name };
  }
  return {
    firstName: parts[0]!,
    lastName: parts.slice(1).join(" "),
    name,
  };
}
