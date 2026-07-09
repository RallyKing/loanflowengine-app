import type { CommunicationChannel } from "@/lib/comms/types";

type DraftScopeArgs = {
  organizationId: string;
  userKey: string;
  channel: CommunicationChannel;
  pipelineFileId?: string;
  contactId?: string;
  lenderId?: string;
};

export function buildDraftScopeKey(args: DraftScopeArgs): string {
  return [
    args.organizationId,
    args.userKey.trim().toLowerCase(),
    args.channel,
    args.pipelineFileId ?? "-",
    args.contactId ?? "-",
    args.lenderId ?? "-",
  ].join(":");
}
