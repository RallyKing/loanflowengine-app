/**
 * Placeholder catalog for external integration connectors.
 * Real implementations register handlers in Convex workers against these keys.
 */

export type IntegrationCategory = "crm" | "email" | "messaging";

export type ConnectorCapability =
  | "inbound_webhook"
  | "sync_outbound"
  | "sync_inbound"
  | "action_dispatch";

export type ConnectorProviderDefinition = {
  readonly key: string;
  readonly label: string;
  readonly capabilities: readonly ConnectorCapability[];
  readonly description?: string;
};

export const CRM_PROVIDERS: readonly ConnectorProviderDefinition[] = [
  {
    key: "salesforce",
    label: "Salesforce",
    capabilities: ["inbound_webhook", "sync_outbound", "sync_inbound", "action_dispatch"],
    description: "Placeholder — connect OAuth + REST/SOAP in the worker.",
  },
  {
    key: "hubspot",
    label: "HubSpot",
    capabilities: ["inbound_webhook", "sync_outbound", "sync_inbound", "action_dispatch"],
  },
  {
    key: "generic_crm",
    label: "Generic CRM (webhook)",
    capabilities: ["inbound_webhook", "action_dispatch"],
    description: "Receive JSON webhooks and map fields in custom actions.",
  },
] as const;

export const EMAIL_PROVIDERS: readonly ConnectorProviderDefinition[] = [
  {
    key: "sendgrid",
    label: "SendGrid",
    capabilities: ["inbound_webhook", "sync_outbound", "action_dispatch"],
  },
  {
    key: "resend",
    label: "Resend",
    capabilities: ["sync_outbound", "action_dispatch"],
  },
  {
    key: "microsoft_graph",
    label: "Microsoft 365 / Outlook",
    capabilities: ["sync_inbound", "sync_outbound", "action_dispatch"],
  },
] as const;

export const MESSAGING_PROVIDERS: readonly ConnectorProviderDefinition[] = [
  {
    key: "slack",
    label: "Slack",
    capabilities: ["inbound_webhook", "action_dispatch"],
  },
  {
    key: "teams",
    label: "Microsoft Teams",
    capabilities: ["inbound_webhook", "action_dispatch"],
  },
  {
    key: "generic_messaging",
    label: "Generic messaging (webhook)",
    capabilities: ["inbound_webhook", "action_dispatch"],
  },
] as const;

export const CONNECTOR_CATALOG: Record<
  IntegrationCategory,
  readonly ConnectorProviderDefinition[]
> = {
  crm: CRM_PROVIDERS,
  email: EMAIL_PROVIDERS,
  messaging: MESSAGING_PROVIDERS,
};

const ALL_KEYS = new Map<
  IntegrationCategory,
  Map<string, ConnectorProviderDefinition>
>();

for (const cat of Object.keys(CONNECTOR_CATALOG) as IntegrationCategory[]) {
  const m = new Map<string, ConnectorProviderDefinition>();
  for (const p of CONNECTOR_CATALOG[cat]) {
    m.set(p.key, p);
  }
  ALL_KEYS.set(cat, m);
}

export function isKnownProvider(
  category: IntegrationCategory,
  providerKey: string,
): boolean {
  return ALL_KEYS.get(category)?.has(providerKey) ?? false;
}

export function getProviderDefinition(
  category: IntegrationCategory,
  providerKey: string,
): ConnectorProviderDefinition | undefined {
  return ALL_KEYS.get(category)?.get(providerKey);
}
