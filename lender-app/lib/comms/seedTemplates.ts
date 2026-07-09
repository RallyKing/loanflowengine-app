import type { CommunicationChannel } from "@/lib/comms/types";

export type SeedCommunicationTemplate = {
  slug: string;
  name: string;
  channel: CommunicationChannel;
  subjectTemplate?: string;
  bodyTemplate: string;
  description: string;
};

export const GLOBAL_COMMUNICATION_TEMPLATE_SEEDS: readonly SeedCommunicationTemplate[] = [
  {
    slug: "document-request",
    name: "Document request",
    channel: "email",
    subjectTemplate: "Documents needed for {{fileName}}",
    bodyTemplate:
      "Hello {{contactName}},\n\nWe are ready to keep {{fileName}} moving. Please upload the requested documents in the portal at your earliest convenience.\n\nThanks,\n{{senderName}}",
    description: "Borrower-facing document request email.",
  },
  {
    slug: "condition-update",
    name: "Condition update",
    channel: "portal",
    bodyTemplate:
      "We added an update on {{fileName}}. Please review the latest conditions and reply here if you need help.",
    description: "Portal update for file conditions.",
  },
  {
    slug: "approval-notice",
    name: "Approval notice",
    channel: "email",
    subjectTemplate: "{{fileName}} approval update",
    bodyTemplate:
      "Good news {{contactName}}. {{fileName}} has an approval update.\n\n{{approvalSummary}}\n\nWe will follow up with any next steps.",
    description: "Approval progress email.",
  },
  {
    slug: "funding-update",
    name: "Funding update",
    channel: "email",
    subjectTemplate: "{{fileName}} funding update",
    bodyTemplate:
      "Hello {{contactName}},\n\nHere is the latest funding update for {{fileName}}:\n{{fundingSummary}}\n\nThank you,\n{{senderName}}",
    description: "Funding milestone notification.",
  },
  {
    slug: "follow-up",
    name: "Follow up",
    channel: "email",
    subjectTemplate: "Following up on {{fileName}}",
    bodyTemplate:
      "Hello {{contactName}},\n\nChecking in on {{fileName}}. Let us know if you have questions or need anything from our team.\n\n{{senderName}}",
    description: "Simple follow-up email.",
  },
  {
    slug: "internal-escalation",
    name: "Internal escalation",
    channel: "portal",
    bodyTemplate:
      "Internal escalation for {{fileName}}: {{escalationReason}}\nOwner: {{senderName}}",
    description: "Internal or portal-visible escalation note.",
  },
] as const;
