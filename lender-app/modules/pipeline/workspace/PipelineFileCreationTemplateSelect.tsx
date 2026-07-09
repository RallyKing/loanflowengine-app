"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { PIPELINE_FILE_TEMPLATES } from "@/lib/pipelineFileTemplates";
import { decodeFileCreationTemplateSelect } from "@/lib/pipelineFileCreationTemplateSelect";

type Props = {
  accountId: string | undefined;
  value: string;
  onChange: (next: string) => void;
  id?: string;
  selectClassName?: string;
  /** When false, omit description line under the select. */
  showDescription?: boolean;
};

/**
 * Built-in catalog templates plus account-owned templates for new-file creation.
 * Values: `""` | catalog id | `user:` + Convex id (see `decodeFileCreationTemplateSelect`).
 */
export function PipelineFileCreationTemplateSelect({
  accountId,
  value,
  onChange,
  id,
  selectClassName = "mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm",
  showDescription = true,
}: Props) {
  const trimmed = accountId?.trim() ?? "";
  const userList = useQuery(
    api.pipelineFileUserTemplates.listByAccountId,
    trimmed ? { accountId: trimmed } : "skip",
  );

  const decoded = decodeFileCreationTemplateSelect(value);
  const selectedCatalog = decoded.catalogFileTemplateId
    ? PIPELINE_FILE_TEMPLATES.find(
        (t) => t.templateId === decoded.catalogFileTemplateId,
      )
    : undefined;
  const selectedUser =
    decoded.userPipelineFileTemplateId && userList
      ? userList.find((r) => r._id === decoded.userPipelineFileTemplateId)
      : undefined;

  const description =
    selectedCatalog?.description ?? selectedUser?.description ?? null;

  return (
    <>
      <select
        id={id}
        className={selectClassName}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Use my saved default</option>
        <optgroup label="Built-in">
          {PIPELINE_FILE_TEMPLATES.map((t) => (
            <option key={t.templateId} value={t.templateId}>
              {t.name}
            </option>
          ))}
        </optgroup>
        {trimmed && userList && userList.length > 0 ? (
          <optgroup label="My templates">
            {userList.map((r) => (
              <option key={r._id} value={`user:${r._id}`}>
                {r.name}
              </option>
            ))}
          </optgroup>
        ) : null}
      </select>
      {showDescription && description ? (
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      ) : null}
    </>
  );
}
