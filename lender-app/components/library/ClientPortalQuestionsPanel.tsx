"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  FILE_TASK_QUESTION_ANSWER_TYPE_LABELS,
  answerMapFromRows,
  sanitizeQuestionItems,
  type FileTaskQuestionAnswerType,
  type FileTaskQuestionItem,
} from "@/lib/fileTaskQuestions";
import { showOperationalToast } from "@/lib/ui/operationalToast";
import { readPortalTaskAccessProof } from "@/lib/portalTaskAccessProof";
import { readPortalAccessProof } from "@/lib/portalAccessProof";

type AnswerRow = { questionId: string; value: string };

export type ClientPortalQuestionsPanelProps = {
  bundleToken: string;
  fileTaskId: Id<"documentVaultFileTasks">;
  questionItems: FileTaskQuestionItem[];
  questionAnswers?: AnswerRow[];
  taskStatus: "incomplete" | "pending_review" | "complete";
  disabled?: boolean;
  onSubmitted: () => void;
};

function inputModeFor(
  answerType: FileTaskQuestionAnswerType,
): "tel" | "email" | "decimal" | "text" {
  switch (answerType) {
    case "phone":
      return "tel";
    case "email":
      return "email";
    case "dollar_amount":
      return "decimal";
    case "single_line":
    case "large_text":
      return "text";
    default: {
      const _exhaustive: never = answerType;
      return _exhaustive;
    }
  }
}

export function ClientPortalQuestionsPanel({
  bundleToken,
  fileTaskId,
  questionItems,
  questionAnswers,
  taskStatus,
  disabled = false,
  onSubmitted,
}: ClientPortalQuestionsPanelProps) {
  const items = useMemo(
    () => sanitizeQuestionItems(questionItems),
    [questionItems],
  );
  const serverMap = useMemo(
    () =>
      answerMapFromRows(
        (questionAnswers ?? []).map((a) => ({
          questionId: a.questionId,
          value: a.value,
          updatedAt: 0,
        })),
      ),
    [questionAnswers],
  );
  const [draft, setDraft] = useState<Record<string, string>>(serverMap);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Dirty local edits — never clobber from reactive server pushes. */
  const dirtyRef = useRef(false);
  const hydratedTaskIdRef = useRef<string | null>(null);

  const submitAnswers = useMutation(
    api.documentVaultClientBundlePortal.submitQuestionAnswersFromBundle,
  );
  const autosaveAnswers = useMutation(
    api.documentVaultClientBundlePortal.autosaveQuestionAnswersFromBundle,
  );

  useEffect(() => {
    const taskKey = String(fileTaskId);
    if (hydratedTaskIdRef.current !== taskKey) {
      hydratedTaskIdRef.current = taskKey;
      dirtyRef.current = false;
      setDraft(serverMap);
      return;
    }
    if (dirtyRef.current) return;
    setDraft(serverMap);
  }, [fileTaskId, serverMap]);

  const readOnly = disabled || taskStatus === "complete";
  const accessProof = readPortalAccessProof(bundleToken);
  const taskAccessProof = readPortalTaskAccessProof(
    bundleToken,
    String(fileTaskId),
  );

  const patchFromDraft = () =>
    items.map((q) => ({
      questionId: q.id,
      value: draft[q.id] ?? "",
    }));

  const flushDraft = async () => {
    if (readOnly) return;
    try {
      await autosaveAnswers({
        bundleToken,
        fileTaskId,
        answers: patchFromDraft(),
        accessProof: accessProof ?? undefined,
        taskAccessProof: taskAccessProof ?? undefined,
      });
    } catch {
      // Draft save is best-effort; submit validates.
    }
  };

  return (
    <div className="mt-4 space-y-3">
      <p className="text-xs text-muted-foreground">
        Answer each question below
        {taskStatus === "pending_review"
          ? " — you can update answers until your broker marks this complete."
          : ", then submit when ready."}
      </p>
      <ol className="space-y-3">
        {items.map((q, index) => {
          const isLarge = q.answerType === "large_text";
          const value = draft[q.id] ?? "";
          return (
            <li
              key={q.id}
              className="rounded-dlc-md border border-border/70 bg-muted/10 px-3 py-3"
            >
              <label className="block">
                <span className="text-sm font-medium text-foreground">
                  {index + 1}. {q.prompt}
                  {q.required !== false ? (
                    <span className="ml-1 text-amber-700">*</span>
                  ) : null}
                </span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                  {FILE_TASK_QUESTION_ANSWER_TYPE_LABELS[q.answerType]}
                </span>
                {isLarge ? (
                  <textarea
                    className="mt-2 min-h-[5.5rem] w-full rounded-dlc-md border border-border bg-background px-3 py-2 text-sm"
                    value={value}
                    disabled={readOnly || busy}
                    onChange={(e) => {
                      dirtyRef.current = true;
                      setDraft((prev) => ({ ...prev, [q.id]: e.target.value }));
                    }}
                    onBlur={() => void flushDraft()}
                  />
                ) : (
                  <Input
                    className="mt-2"
                    type={q.answerType === "email" ? "email" : "text"}
                    inputMode={inputModeFor(q.answerType)}
                    autoComplete={
                      q.answerType === "email"
                        ? "email"
                        : q.answerType === "phone"
                          ? "tel"
                          : "off"
                    }
                    value={value}
                    disabled={readOnly || busy}
                    onChange={(e) => {
                      dirtyRef.current = true;
                      setDraft((prev) => ({ ...prev, [q.id]: e.target.value }));
                    }}
                    onBlur={() => void flushDraft()}
                  />
                )}
              </label>
            </li>
          );
        })}
      </ol>
      {error ? (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      {!readOnly ? (
        <Button
          type="button"
          size="sm"
          variant="primary"
          className="w-full"
          disabled={busy}
          data-testid="client-portal-questions-submit"
          onClick={() => {
            void (async () => {
              setBusy(true);
              setError(null);
              try {
                await submitAnswers({
                  bundleToken,
                  fileTaskId,
                  answers: patchFromDraft(),
                  accessProof: accessProof ?? undefined,
                  taskAccessProof: taskAccessProof ?? undefined,
                });
                dirtyRef.current = false;
                onSubmitted();
                showOperationalToast({
                  title: "Answers submitted",
                  description: "Your broker will review them shortly.",
                  variant: "success",
                });
              } catch (e) {
                const message =
                  e instanceof Error ? e.message : "Could not submit answers.";
                setError(message);
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          {busy
            ? "Submitting…"
            : taskStatus === "pending_review"
              ? "Update answers"
              : "Submit answers"}
        </Button>
      ) : null}
    </div>
  );
}
