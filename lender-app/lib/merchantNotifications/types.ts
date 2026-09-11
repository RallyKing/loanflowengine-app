/**
 * Merchant channel notification webhooks (SenseBS / GHL pattern).
 * One org webhook URL; separate POSTs per deliveryMethod (SMS | EMAIL | INTERNAL).
 * @see docs/WEBHOOK_SMS_EMAIL_NOTIFICATION_SPEC.md
 */

export type DeliveryMethod = "SMS" | "EMAIL" | "INTERNAL";

export type MerchantNotificationPerson = {
  id: string | null;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
};

export type MerchantNotificationOrg = {
  id: string;
  name: string;
  subdomain?: string | null;
};

export type BuildMerchantNotificationArgs = {
  event: string;
  context: string;
  deliveryMethod: DeliveryMethod;
  isTest: boolean;
  message: string;
  organization: MerchantNotificationOrg;
  customer: MerchantNotificationPerson;
  /** Pre-rendered SMS body (required for SMS channel). */
  smsMessage?: string | null;
  /** Pre-rendered email fields (required for EMAIL channel). */
  subject?: string | null;
  html?: string | null;
  plaintext?: string | null;
  /** Extra domain blobs under data.* (pipeline, links, payment, …). */
  domain?: Record<string, unknown>;
  /** Now override (ms); tests only. */
  nowMs?: number;
};

/**
 * Portable companion payload for merchant platforms (GHL / Zapier / custom).
 * Missing scalars are `null` (never omitted) so field maps stay stable.
 */
export type NotificationCompanionPayload = {
  event: string;
  timestamp: number;
  timestampISO: string;
  message: string;
  isTest: boolean;

  organization: MerchantNotificationOrg;

  customerName: string | null;
  name: string | null;
  firstName: string | null;
  lastName: string | null;

  phone: string | null;
  recipientPhone: string | null;
  smsMessage: string | null;
  customerMessage: string | null;
  body: string | null;

  email: string | null;
  to: string | null;
  recipientEmail: string | null;
  subject: string | null;
  html: string | null;
  htmlBody: string | null;
  emailBody: string | null;
  emailHTML: string | null;
  emailHtml: string | null;

  paymentSucceeded: boolean | null;
  paymentStatus: string | null;
  paymentMethod: string | null;
  cardLast4: string | null;
  cardBrand: string | null;
  receiptUrl: string | null;

  data: {
    notification: {
      deliveryMethod: DeliveryMethod;
      context: string;
      phone: string | null;
      recipientPhone: string | null;
      smsMessage: string | null;
      customerMessage: string | null;
      email: string | null;
      to: string | null;
      recipientEmail: string | null;
      subject: string | null;
      body: string | null;
      html: string | null;
      htmlBody: string | null;
      emailBody: string | null;
      emailHTML: string | null;
      emailHtml: string | null;
      plaintext: string | null;
      isTest: boolean;
      firstName: string | null;
      lastName: string | null;
      customerName: string | null;
      name: string | null;
      trackingUrl: string | null;
    };
    customer: MerchantNotificationPerson & { customerName: string | null };
    [key: string]: unknown;
  };
};

export type MerchantChannelResult =
  | "sent"
  | "skipped:no-url"
  | "skipped:channel-disabled"
  | "skipped:no-phone"
  | "skipped:no-email"
  | "skipped:no-body"
  | `error:${string}`;
