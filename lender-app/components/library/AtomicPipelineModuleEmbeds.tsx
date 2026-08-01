"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Input } from "@/components/ui/Input";
import { InlineText } from "@/components/inline";
import { FieldLabel } from "@/components/pipeline/FieldLabel";
import {
  DealWorkspaceEditorProvider,
  useDealWorkspaceEditorOptional,
} from "@/lib/file/useDealWorkspaceEditor";
import type { DealWorkspaceSheet } from "@/lib/file/dealSectionTypes";
import type { DealWorkspaceUpdater } from "@/lib/file/dealSectionTypes";
import { AtomicDealSectionRenderer } from "@/components/library/AtomicDealSectionRenderer";
import { useClientPortalBlockSessionOptional } from "@/lib/clientPortalDraftStore";
import { useLenderDeliveryBlockSessionOptional } from "@/components/library/LenderDeliveryBlockPanel";
import { cn } from "@/lib/cn";

const FeesSplitsBlockLazy = dynamic(
  () =>
    import("@/components/pipeline/blocks/FeesSplitsBlock").then((m) => ({
      default: m.FeesSplitsBlock,
    })),
  { loading: () => <EmbedLoading /> },
);

function EmbedLoading() {
  return (
    <p className="py-4 text-center text-xs text-muted-foreground" role="status">
      Loading…
    </p>
  );
}

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-sm text-foreground">{value || "—"}</p>
    </div>
  );
}

function fmtCurrency(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function fmtPct(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n}%`;
}

type PortalSheetSession = {
  draft: DealWorkspaceSheet;
  update?: DealWorkspaceUpdater;
  readOnly: boolean;
};

function usePortalSheetSession(): PortalSheetSession | null {
  const clientSession = useClientPortalBlockSessionOptional();
  const lenderSession = useLenderDeliveryBlockSessionOptional();
  if (clientSession?.status === "ready" && clientSession.draft) {
    return {
      draft: clientSession.draft,
      update: (key, value) => clientSession.updateSheet(key, value),
      readOnly: false,
    };
  }
  if (lenderSession?.status === "ready" && lenderSession.draft) {
    return {
      draft: lenderSession.draft as DealWorkspaceSheet,
      readOnly: true,
    };
  }
  return null;
}

function patchBorrowerField(
  draft: DealWorkspaceSheet,
  update: DealWorkspaceUpdater | undefined,
  field: string,
  value: string,
  readOnly: boolean,
) {
  if (readOnly || !update) return;
  const borrowers = Array.isArray(draft.borrowers) ? [...draft.borrowers] : [];
  const primary = { ...(borrowers[0] ?? {}) } as Record<string, unknown>;
  primary[field] = value;
  borrowers[0] = primary as (typeof borrowers)[number];
  update("borrowers", borrowers as DealWorkspaceSheet["borrowers"]);
}

function patchCoverField(
  draft: DealWorkspaceSheet,
  update: DealWorkspaceUpdater | undefined,
  field: string,
  value: string,
  readOnly: boolean,
) {
  if (readOnly || !update) return;
  const cover = { ...(draft.cover ?? {}) } as Record<string, unknown>;
  cover[field] = value;
  update("cover", cover as DealWorkspaceSheet["cover"]);
}

function patchPropertyField(
  draft: DealWorkspaceSheet,
  update: DealWorkspaceUpdater | undefined,
  field: string,
  value: string,
  readOnly: boolean,
) {
  if (readOnly || !update) return;
  const subjectProperty = {
    ...(draft.subjectProperty ?? {}),
  } as Record<string, unknown>;
  subjectProperty[field] = value;
  update(
    "subjectProperty",
    subjectProperty as DealWorkspaceSheet["subjectProperty"],
  );
}

/** Client-editable file metadata in portal / lender read-only views. */
export function PortalFileDetailsEmbed({
  readOnly,
  testId = "client-portal-block-file_details",
}: {
  readOnly: boolean;
  testId?: string;
}) {
  const session = usePortalSheetSession();
  if (!session) return <EmbedLoading />;

  const { draft, update } = session;
  const cover = (draft.cover ?? {}) as Record<string, unknown>;
  const subject = (draft.subjectProperty ?? {}) as Record<string, unknown>;
  const borrowers = Array.isArray(draft.borrowers) ? draft.borrowers : [];
  const primary = (borrowers[0] ?? {}) as Record<string, unknown>;
  const locked = readOnly || session.readOnly;

  return (
    <div className="space-y-3" data-testid={testId}>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted-foreground">
          File / deal name
        </span>
        <Input
          value={String(cover.fileName ?? "")}
          readOnly={locked}
          data-testid="portal-file-details-name"
          onChange={(e) =>
            patchCoverField(draft, update, "fileName", e.target.value, locked)
          }
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted-foreground">
          Subject property address
        </span>
        <Input
          value={String(subject.address ?? "")}
          readOnly={locked}
          data-testid="portal-file-details-address"
          onChange={(e) =>
            patchPropertyField(draft, update, "address", e.target.value, locked)
          }
        />
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        {(["firstName", "lastName", "email", "phone"] as const).map((field) => (
          <label key={field} className="block space-y-1">
            <span className="text-xs font-medium capitalize text-muted-foreground">
              {field.replace(/([A-Z])/g, " $1")}
            </span>
            <Input
              value={String(primary[field] ?? "")}
              readOnly={locked}
              onChange={(e) =>
                patchBorrowerField(draft, update, field, e.target.value, locked)
              }
            />
          </label>
        ))}
      </div>
    </div>
  );
}

/** Broker-only licensing — read-only in portal. */
export function PortalLicensingReadOnlyEmbed({
  testId = "client-portal-block-licensing",
}: {
  testId?: string;
}) {
  const session = usePortalSheetSession();
  if (!session) return <EmbedLoading />;

  const cover = (session.draft.cover ?? {}) as Record<string, unknown>;
  const lo = String(cover.loNmls ?? "").trim();
  const broker = String(cover.brokerNmls ?? "").trim();

  return (
    <div
      className="grid gap-3 sm:grid-cols-2"
      data-testid={testId}
      aria-readonly
    >
      <ReadOnlyRow label="LO NMLS #" value={lo} />
      <ReadOnlyRow label="Company NMLS #" value={broker} />
      <p className="sm:col-span-2 text-[11px] text-muted-foreground">
        Licensing is managed by your broker and shown here for reference only.
      </p>
    </div>
  );
}

/** Broker-only lender summary — read-only in portal. */
export function PortalLenderInfoReadOnlyEmbed({
  pipelineFileId,
  testId = "client-portal-block-lender_info",
}: {
  pipelineFileId: Id<"pipeline">;
  testId?: string;
}) {
  const session = usePortalSheetSession();
  const detail = useQuery(api.pipeline.getDetail, { id: pipelineFileId });

  if (!session || detail === undefined) return <EmbedLoading />;

  const lenders = detail?.lenders ?? [];
  const chosen = detail?.pipeline?.selectedLenderId
    ? lenders.find((l) => l._id === detail.pipeline.selectedLenderId)
    : null;

  return (
    <div className="space-y-2" data-testid={testId} aria-readonly>
      {chosen ? (
        <ReadOnlyRow label="Selected lender" value={chosen.company} />
      ) : (
        <p className="text-sm text-muted-foreground">No lender selected yet.</p>
      )}
      {lenders.length > 0 ? (
        <ul className="space-y-1 rounded-dlc-md border border-border/50 bg-muted/10 px-3 py-2">
          {lenders.slice(0, 6).map((l) => (
            <li key={l._id} className="text-xs text-foreground">
              {l.company}
              {l._id === detail?.pipeline?.selectedLenderId ? (
                <span className="ml-1.5 text-[10px] font-semibold uppercase text-emerald-700">
                  Selected
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-[11px] text-muted-foreground">
        Lender shopping is managed by your broker.
      </p>
    </div>
  );
}

/** Broker-only fees — read-only in portal. */
export function PortalFeesSplitsReadOnlyEmbed({
  pipelineFileId,
  testId = "client-portal-block-fees_splits",
}: {
  pipelineFileId: Id<"pipeline">;
  testId?: string;
}) {
  const detail = useQuery(api.pipeline.getDetail, { id: pipelineFileId });
  if (detail === undefined) return <EmbedLoading />;

  const file = detail?.pipeline;
  if (!file) {
    return (
      <p className="text-xs text-muted-foreground" data-testid={testId}>
        Fee worksheet unavailable.
      </p>
    );
  }

  const splits = file.splits ?? [];

  return (
    <div className="space-y-3" data-testid={testId} aria-readonly>
      <div className="grid gap-3 sm:grid-cols-3">
        <ReadOnlyRow
          label="Lender fee"
          value={`${fmtPct(file.lenderFeePct)} · ${fmtCurrency(file.lenderFee)}`}
        />
        <ReadOnlyRow
          label="Broker gross"
          value={`${fmtPct(file.brokerGrossPct)} · ${fmtCurrency(file.brokerGross)}`}
        />
        <ReadOnlyRow
          label="Net to user"
          value={`${fmtPct(file.netToUserPct)} · ${fmtCurrency(file.netToUser)}`}
        />
      </div>
      {splits.length > 0 ? (
        <ul className="space-y-1 rounded-dlc-md border border-border/50 bg-muted/10 px-3 py-2">
          {splits.map((split, index) => (
            <li key={`${split.name}-${index}`} className="text-xs text-foreground">
              {split.name}: {fmtCurrency(split.amount)}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-[11px] text-muted-foreground">
        Fees and splits are managed by your broker.
      </p>
    </div>
  );
}

function BrokerLicensingEmbed({
  readOnly,
}: {
  readOnly: boolean;
}) {
  const editor = useDealWorkspaceEditorOptional();
  if (!editor?.draft) return <EmbedLoading />;
  const cover = (editor.draft.cover ?? {}) as Record<string, unknown>;
  const lo = String(cover.loNmls ?? "");
  const broker = String(cover.brokerNmls ?? "");

  const commit = (field: "loNmls" | "brokerNmls", value: string) => {
    if (readOnly || !editor.draft) return;
    const next = { ...(editor.draft.cover ?? {}) } as Record<string, unknown>;
    next[field] = value.trim() || undefined;
    editor.update("cover", next as DealWorkspaceSheet["cover"]);
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <FieldLabel>LO NMLS #</FieldLabel>
        <InlineText
          value={lo}
          allowEmpty
          readOnly={readOnly}
          onCommit={async (next) => commit("loNmls", next)}
          ariaLabel="LO NMLS number"
        />
      </div>
      <div className="space-y-2">
        <FieldLabel>Company NMLS #</FieldLabel>
        <InlineText
          value={broker}
          allowEmpty
          readOnly={readOnly}
          onCommit={async (next) => commit("brokerNmls", next)}
          ariaLabel="Company NMLS number"
        />
      </div>
    </div>
  );
}

function BrokerFileDetailsEmbed({ readOnly }: { readOnly: boolean }) {
  const editor = useDealWorkspaceEditorOptional();
  if (!editor?.draft) return <EmbedLoading />;

  return (
    <div className="space-y-4">
      <AtomicDealSectionRenderer
        sectionId="cover"
        draft={editor.draft}
        update={readOnly ? () => {} : editor.update}
      />
      <AtomicDealSectionRenderer
        sectionId="property"
        draft={editor.draft}
        update={readOnly ? () => {} : editor.update}
      />
      <AtomicDealSectionRenderer
        sectionId="borrowers"
        draft={editor.draft}
        update={readOnly ? () => {} : editor.update}
      />
    </div>
  );
}

function BrokerLenderInfoEmbed({
  pipelineFileId,
  readOnly: _readOnly,
}: {
  pipelineFileId: Id<"pipeline">;
  memberUserKey?: string;
  readOnly: boolean;
}) {
  return (
    <PortalLenderInfoReadOnlyEmbed
      pipelineFileId={pipelineFileId}
      testId="broker-atomic-block-lender_info"
    />
  );
}

function BrokerFeesSplitsEmbed({
  pipelineFileId,
  memberUserKey,
  readOnly,
}: {
  pipelineFileId: Id<"pipeline">;
  memberUserKey?: string;
  readOnly: boolean;
}) {
  const detail = useQuery(
    api.pipeline.getDetail,
    memberUserKey
      ? { id: pipelineFileId, memberUserKey }
      : { id: pipelineFileId },
  );
  const patchPipeline = useMutation(api.pipeline.patch);

  const loanBaseAmount = useMemo(() => {
    const p = detail?.pipeline;
    if (!p) return 0;
    return typeof p.fundingAmount === "number" && Number.isFinite(p.fundingAmount)
      ? p.fundingAmount
      : 0;
  }, [detail?.pipeline]);

  if (detail == null || !detail.pipeline) return <EmbedLoading />;

  const file = detail.pipeline;
  const splits = (file.splits ?? []).map((s) => ({
    name: s.name,
    amount: s.amount,
    reason: s.reason,
  }));

  return (
    <FeesSplitsBlockLazy
      file={file}
      loanBaseAmount={loanBaseAmount}
      splits={splits}
      patch={async (fields) => {
        if (readOnly) return;
        await patchPipeline(fields);
      }}
      onCommitSplits={async (next) => {
        if (readOnly) return;
        await patchPipeline({
          id: file._id,
          splits: next,
        });
      }}
    />
  );
}

export function AtomicPipelineModulePortalEmbed({
  atomicId,
  pipelineFileId,
  readOnly,
}: {
  atomicId:
    | "file_details"
    | "licensing"
    | "lender_info"
    | "fees_splits";
  pipelineFileId: Id<"pipeline">;
  readOnly: boolean;
}) {
  switch (atomicId) {
    case "file_details":
      return <PortalFileDetailsEmbed readOnly={readOnly} />;
    case "licensing":
      return <PortalLicensingReadOnlyEmbed />;
    case "lender_info":
      return <PortalLenderInfoReadOnlyEmbed pipelineFileId={pipelineFileId} />;
    case "fees_splits":
      return <PortalFeesSplitsReadOnlyEmbed pipelineFileId={pipelineFileId} />;
    default:
      return null;
  }
}

export function AtomicPipelineModuleBrokerEmbed({
  atomicId,
  pipelineFileId,
  memberUserKey,
  readOnly = false,
}: {
  atomicId:
    | "file_details"
    | "licensing"
    | "lender_info"
    | "fees_splits";
  pipelineFileId: Id<"pipeline">;
  memberUserKey?: string;
  readOnly?: boolean;
}) {
  const existingEditor = useDealWorkspaceEditorOptional();

  const wrapDealEditor = (child: React.ReactNode) =>
    existingEditor ? (
      child
    ) : (
      <DealWorkspaceEditorProvider fileId={pipelineFileId}>
        {child}
      </DealWorkspaceEditorProvider>
    );

  switch (atomicId) {
    case "file_details":
      return wrapDealEditor(<BrokerFileDetailsEmbed readOnly={readOnly} />);
    case "licensing":
      return wrapDealEditor(<BrokerLicensingEmbed readOnly={readOnly} />);
    case "lender_info":
      return (
        <BrokerLenderInfoEmbed
          pipelineFileId={pipelineFileId}
          memberUserKey={memberUserKey}
          readOnly={readOnly}
        />
      );
    case "fees_splits":
      return (
        <BrokerFeesSplitsEmbed
          pipelineFileId={pipelineFileId}
          memberUserKey={memberUserKey}
          readOnly={readOnly}
        />
      );
    default:
      return null;
  }
}
