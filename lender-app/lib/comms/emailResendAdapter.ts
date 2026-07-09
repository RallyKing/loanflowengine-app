import type {
  CommunicationProviderAdapter,
  ProviderSendPayload,
  ProviderSendResult,
} from "@/lib/comms/types";

function buildHtmlFromText(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<div style="white-space:pre-wrap;font-family:sans-serif">${escaped}</div>`;
}

function buildAttachmentFooter(payload: ProviderSendPayload): string {
  if (!payload.attachments?.length) return "";
  const lines = payload.attachments.map((attachment) => {
    const href = attachment.url?.trim();
    if (!href) return `- ${attachment.fileName}`;
    return `- <a href="${href}">${attachment.fileName}</a>`;
  });
  return `<hr /><div style="font-family:sans-serif"><strong>Attachments</strong><br/>${lines.join("<br/>")}</div>`;
}

export function createResendEmailAdapter(): CommunicationProviderAdapter {
  return {
    channel: "email",
    providerKey: "resend",
    async send(payload: ProviderSendPayload): Promise<ProviderSendResult> {
      const apiKey = process.env.RESEND_API_KEY?.trim();
      const from =
        process.env.SYSTEM_EMAIL_FROM?.trim() ||
        process.env.NOTIFICATION_EMAIL_FROM?.trim() ||
        process.env.CLIENT_PORTAL_EMAIL_FROM?.trim() ||
        "";

      if (!apiKey) {
        throw new Error("RESEND_API_KEY is not configured.");
      }
      if (!from) {
        throw new Error(
          "SYSTEM_EMAIL_FROM, NOTIFICATION_EMAIL_FROM, or CLIENT_PORTAL_EMAIL_FROM must be set.",
        );
      }

      const to = payload.recipients
        .filter((recipient) => recipient.kind !== "cc" && recipient.kind !== "bcc")
        .map((recipient) => recipient.value.trim())
        .filter(Boolean);
      const cc = payload.recipients
        .filter((recipient) => recipient.kind === "cc")
        .map((recipient) => recipient.value.trim())
        .filter(Boolean);
      const bcc = payload.recipients
        .filter((recipient) => recipient.kind === "bcc")
        .map((recipient) => recipient.value.trim())
        .filter(Boolean);

      const html = `${payload.bodyHtml?.trim() || buildHtmlFromText(payload.bodyText)}${buildAttachmentFooter(payload)}`;
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to,
          ...(cc.length ? { cc } : {}),
          ...(bcc.length ? { bcc } : {}),
          subject: payload.subject || "(no subject)",
          text: payload.bodyText,
          html,
          ...(payload.metadata ? { headers: { "X-DLC-Metadata": JSON.stringify(payload.metadata) } } : {}),
        }),
      });

      const raw = await response.text();
      if (!response.ok) {
        throw new Error(`Resend HTTP ${response.status}: ${raw.slice(0, 800)}`);
      }

      let providerMessageId = "";
      let parsedPayload: unknown = raw;
      try {
        parsedPayload = JSON.parse(raw) as unknown;
        const parsed = parsedPayload as { id?: string };
        providerMessageId = parsed.id?.trim() ?? "";
      } catch {
        providerMessageId = "";
      }
      if (!providerMessageId) {
        throw new Error("Resend returned no message id.");
      }

      return {
        providerMessageId,
        responsePayload: parsedPayload,
        summary: `resend:${providerMessageId}`,
      };
    },
  };
}
