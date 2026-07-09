export const COMMUNICATION_CHANNELS = [
  "email",
  "sms",
  "push",
  "portal",
  "voice",
  "webhook",
] as const;

export type CommunicationChannel = (typeof COMMUNICATION_CHANNELS)[number];

export const OUTBOUND_MESSAGE_STATUSES = [
  "draft",
  "queued",
  "scheduled",
  "sending",
  "sent",
  "delivered",
  "opened",
  "clicked",
  "failed",
  "bounced",
  "replied",
  "archived",
] as const;

export type OutboundMessageStatus = (typeof OUTBOUND_MESSAGE_STATUSES)[number];

export const OUTBOUND_PRIORITIES = ["low", "normal", "high", "critical"] as const;

export type OutboundPriority = (typeof OUTBOUND_PRIORITIES)[number];

export const COMMUNICATION_PROVIDER_KEYS = {
  email: ["resend"] as const,
  portal: ["portal_native"] as const,
  sms: ["sms_stub"] as const,
  push: ["push_stub"] as const,
  voice: ["voice_stub"] as const,
  webhook: ["webhook_stub"] as const,
} as const;

export type CommunicationProviderKey =
  | (typeof COMMUNICATION_PROVIDER_KEYS.email)[number]
  | (typeof COMMUNICATION_PROVIDER_KEYS.portal)[number]
  | (typeof COMMUNICATION_PROVIDER_KEYS.sms)[number]
  | (typeof COMMUNICATION_PROVIDER_KEYS.push)[number]
  | (typeof COMMUNICATION_PROVIDER_KEYS.voice)[number]
  | (typeof COMMUNICATION_PROVIDER_KEYS.webhook)[number];

export type OutboundRecipient = {
  value: string;
  kind?: "to" | "cc" | "bcc" | "portal";
  label?: string;
};

export type OutboundAttachmentDescriptor = {
  fileName: string;
  contentType?: string;
  size?: number;
  url?: string;
};

export type ProviderSendPayload = {
  channel: CommunicationChannel;
  providerKey: string;
  subject?: string;
  bodyText: string;
  bodyHtml?: string;
  recipients: OutboundRecipient[];
  attachments?: OutboundAttachmentDescriptor[];
  senderLabel?: string;
  metadata?: Record<string, unknown>;
};

export type ProviderSendResult = {
  providerMessageId: string;
  responsePayload?: unknown;
  deliveredAt?: number;
  summary?: string;
};

export interface CommunicationProviderAdapter {
  readonly channel: CommunicationChannel;
  readonly providerKey: string;
  send(payload: ProviderSendPayload): Promise<ProviderSendResult>;
}

export function defaultProviderForChannel(channel: CommunicationChannel): string {
  switch (channel) {
    case "email":
      return "resend";
    case "portal":
      return "portal_native";
    case "sms":
      return "sms_stub";
    case "push":
      return "push_stub";
    case "voice":
      return "voice_stub";
    case "webhook":
      return "webhook_stub";
    default: {
      const exhaustiveCheck: never = channel;
      return exhaustiveCheck;
    }
  }
}
