import { createResendEmailAdapter } from "@/lib/comms/emailResendAdapter";
import {
  defaultProviderForChannel,
  type CommunicationChannel,
  type CommunicationProviderAdapter,
} from "@/lib/comms/types";

function createStubAdapter(
  channel: Exclude<CommunicationChannel, "email">,
  providerKey: string,
): CommunicationProviderAdapter {
  return {
    channel,
    providerKey,
    async send(payload) {
      return {
        providerMessageId: `${providerKey}-${Date.now()}`,
        responsePayload: {
          stubbed: true,
          channel,
          providerKey,
          recipientCount: payload.recipients.length,
        },
        deliveredAt: Date.now(),
        summary: `${providerKey}:stub`,
      };
    },
  };
}

const PROVIDERS = new Map<string, CommunicationProviderAdapter>([
  ["resend", createResendEmailAdapter()],
  ["portal_native", createStubAdapter("portal", "portal_native")],
  ["sms_stub", createStubAdapter("sms", "sms_stub")],
  ["push_stub", createStubAdapter("push", "push_stub")],
  ["voice_stub", createStubAdapter("voice", "voice_stub")],
  ["webhook_stub", createStubAdapter("webhook", "webhook_stub")],
]);

export function resolveCommunicationProvider(args: {
  channel: CommunicationChannel;
  providerKey?: string;
}): CommunicationProviderAdapter {
  const key = args.providerKey?.trim() || defaultProviderForChannel(args.channel);
  const adapter = PROVIDERS.get(key);
  if (!adapter) {
    throw new Error(`Unknown communication provider "${key}".`);
  }
  if (adapter.channel !== args.channel) {
    throw new Error(
      `Provider "${key}" is registered for ${adapter.channel}, not ${args.channel}.`,
    );
  }
  return adapter;
}
