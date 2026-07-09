/**
 * Outbound communication provider interfaces — no vendor SDKs (Phase 8 stub layer).
 */

export type CommsChannel = "email" | "sms" | "portal_message" | "webhook" | "slack" | "crm_sync";

export type CommsPriority = "low" | "normal" | "high" | "critical";

export type CommsMessage = {
  idempotencyKey: string;
  organizationId: string;
  channel: CommsChannel;
  priority: CommsPriority;
  /** Opaque routing (e.g. email address, E.164, webhook URL id). */
  targetRef: string;
  subject?: string;
  bodyText: string;
  bodyHtml?: string;
  metadata?: Record<string, string>;
};

export type CommsSendResult =
  | { ok: true; providerMessageId?: string }
  | { ok: false; errorCode: string; retryable: boolean };

export interface EmailOutboundProvider {
  readonly channel: "email";
  send(message: CommsMessage): Promise<CommsSendResult>;
}

export interface SmsOutboundProvider {
  readonly channel: "sms";
  send(message: CommsMessage): Promise<CommsSendResult>;
}

export interface PortalMessageProvider {
  readonly channel: "portal_message";
  send(message: CommsMessage): Promise<CommsSendResult>;
}

export interface WebhookPushProvider {
  readonly channel: "webhook";
  send(message: CommsMessage): Promise<CommsSendResult>;
}

export interface SlackOutboundProvider {
  readonly channel: "slack";
  send(message: CommsMessage): Promise<CommsSendResult>;
}

export interface CrmSyncProvider {
  readonly channel: "crm_sync";
  send(message: CommsMessage): Promise<CommsSendResult>;
}

export type AnyCommsProvider =
  | EmailOutboundProvider
  | SmsOutboundProvider
  | PortalMessageProvider
  | WebhookPushProvider
  | SlackOutboundProvider
  | CrmSyncProvider;
