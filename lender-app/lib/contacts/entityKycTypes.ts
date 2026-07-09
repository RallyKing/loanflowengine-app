/**
 * Corporate KYC field labels and entity type options for CRM hub.
 */
export const CLIENT_ENTITY_TYPES = [
  { id: "llc", label: "LLC" },
  { id: "s_corp", label: "S-Corp" },
  { id: "c_corp", label: "C-Corp" },
  { id: "partnership", label: "Partnership" },
  { id: "sole_proprietorship", label: "Sole Proprietorship" },
] as const;

export type ClientEntityTypeId = (typeof CLIENT_ENTITY_TYPES)[number]["id"];

export function clientEntityTypeLabel(typeId: string | undefined): string {
  const row = CLIENT_ENTITY_TYPES.find((t) => t.id === typeId);
  return row?.label ?? typeId ?? "";
}

export type EntityKycDraft = {
  entityType: ClientEntityTypeId | "";
  ein: string;
  stateOfIncorporation: string;
  dateOfFormation: string;
};

export function entityKycDraftFromClient(client: {
  entityType?: string;
  ein?: string;
  stateOfIncorporation?: string;
  dateOfFormation?: number;
}): EntityKycDraft {
  const validType = CLIENT_ENTITY_TYPES.some((t) => t.id === client.entityType);
  return {
    entityType: validType ? (client.entityType as ClientEntityTypeId) : "",
    ein: client.ein?.trim() ?? "",
    stateOfIncorporation: client.stateOfIncorporation?.trim() ?? "",
    dateOfFormation: client.dateOfFormation
      ? new Date(client.dateOfFormation).toISOString().slice(0, 10)
      : "",
  };
}

export function formatEntityFormationDate(ms: number | undefined): string {
  if (!ms) return "";
  try {
    return new Date(ms).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

export function parseEntityFormationDateInput(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return undefined;
  return parsed;
}
