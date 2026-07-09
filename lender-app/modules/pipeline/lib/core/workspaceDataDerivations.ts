import { embeddedDealPayloadIsSubstantive } from "@/lib/file/embeddedDealPresence";
import { getPipelineStatusInfo } from "@/lib/pipelineStatus";
import type { Doc } from "@/convex/_generated/dataModel";

type CoverSlice = { loNmls?: string; brokerNmls?: string };

type TablePreviewRow = {
  _id: string;
  status: string;
  updatedAt: number;
  fileName?: string | null;
};

/** Sort pipeline table preview for the file switcher (status weight, then recency). */
export function buildPipelineSwitcherRows<T extends TablePreviewRow>(
  preview: readonly T[] | undefined,
): T[] {
  if (!preview) return [];
  const sorted = [...preview].sort((a, b) => {
    const wa = getPipelineStatusInfo(a.status).weight;
    const wb = getPipelineStatusInfo(b.status).weight;
    if (wa !== wb) return wa - wb;
    return b.updatedAt - a.updatedAt;
  });
  return sorted;
}

export function buildLicenseDisplay(args: {
  pipeline: Doc<"pipeline"> | null | undefined;
  intakeForLicense: Doc<"intakeSheets"> | null | undefined;
  intakeLoading: boolean;
}): { lo: string; broker: string; loading: boolean } {
  const pipe = args.pipeline;
  if (!pipe) {
    return { lo: "", broker: "", loading: false };
  }
  if (embeddedDealPayloadIsSubstantive(pipe.dealData)) {
    const embedCover = ((pipe.dealData as { cover?: CoverSlice }).cover ??
      {}) as CoverSlice;
    return {
      lo: embedCover.loNmls ?? "",
      broker: embedCover.brokerNmls ?? "",
      loading: false,
    };
  }
  if (pipe.intakeSheetId) {
    if (args.intakeLoading) {
      return { lo: "", broker: "", loading: true };
    }
    const c = (args.intakeForLicense?.cover ?? {}) as CoverSlice;
    return {
      lo: c.loNmls ?? "",
      broker: c.brokerNmls ?? "",
      loading: false,
    };
  }
  return {
    lo: pipe.loNmls ?? "",
    broker: pipe.brokerNmls ?? "",
    loading: false,
  };
}

export function buildDealSheetForMetrics(args: {
  pipeline: Doc<"pipeline"> | null | undefined;
  intakeForLicense: Doc<"intakeSheets"> | null | undefined;
}): Doc<"intakeSheets"> | null {
  const pipe = args.pipeline;
  if (!pipe) return null;
  if (embeddedDealPayloadIsSubstantive(pipe.dealData)) {
    return pipe.dealData as Doc<"intakeSheets">;
  }
  if (args.intakeForLicense) return args.intakeForLicense;
  return null;
}
