"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  FILE_TASK_QUESTION_ANSWER_TYPE_LABELS,
  answerMapFromRows,
  questionAnswersAreSubstantive,
  sanitizeQuestionItems,
  type FileTaskQuestionAnswer,
  type FileTaskQuestionItem,
} from "@/lib/fileTaskQuestions";
import { downloadFileTaskQuestionsPdf } from "@/lib/fileTaskQuestionsPdf";
import { showOperationalToast } from "@/lib/ui/operationalToast";

export type FileTaskQuestionsAnswersPanelProps = {
  fileTaskId: Id<"documentVaultFileTasks">;
  taskTitle: string;
  fileLabel?: string;
  questionItems: FileTaskQuestionItem[] | null | undefined;
  questionAnswers: FileTaskQuestionAnswer[] | null | undefined;
  memberUserKey?: string;
  canEdit: boolean;
};

export function FileTaskQuestionsAnswersPanel({
  fileTaskId,
  taskTitle,
  fileLabel,
  questionItems,
  questionAnswers,
  memberUserKey,
  canEdit,
}: FileTaskQuestionsAnswersPanelProps) {
  const items = useMemo(
    () => sanitizeQuestionItems(questionItems),
    [questionItems],
  );
  const serverMap = useMemo(
    () => answerMapFromRows(questionAnswers),
    [questionAnswers],
  );
  const [draft, setDraft] = useState(serverMap);
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const upsertAnswers = useMutation(
    api.documentVaultFileTasks.upsertQuestionAnswers,
  );

  useEffect(() => {
    setDraft(serverMap);
  }, [serverMap]);

  const hasAnswers = questionAnswersAreSubstantive(items, questionAnswers);

  if (items.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No questions configured on this task.
      </p>
    );
  }

  return (
    <div className="space-y-3" data-testid="file-task-questions-answers">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Questions & answers
        </p>
        {hasAnswers ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={pdfBusy}
            data-testid="file-task-questions-pdf"
            onClick={() => {
              void (async () => {
                setPdfBusy(true);
                try {
                  await downloadFileTaskQuestionsPdf({
                    taskTitle,
                    fileLabel,
                    questionItems: items,
                    questionAnswers,
                  });
                } catch (e) {
                  showOperationalToast({
                    title: "PDF failed",
                    description:
                      e instanceof Error ? e.message : "Could not build PDF.",
                    variant: "destructive",
                  });
                } finally {
                  setPdfBusy(false);
                }
              })();
            }}
          >
            {pdfBusy ? "PDF…" : "PDF"}
          </Button>
        ) : null}
      </div>

      <ol className="space-y-2">
        {items.map((q, index) => {
          const isLarge = q.answerType === "large_text";
          const value = draft[q.id] ?? "";
          return (
            <li
              key={q.id}
              className="rounded-dlc-md border border-border/60 bg-dlc-surface px-3 py-2.5"
            >
              <p className="text-xs font-medium text-foreground">
                {index + 1}. {q.prompt}
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {FILE_TASK_QUESTION_ANSWER_TYPE_LABELS[q.answerType]}
              </p>
              {isLarge ? (
                <textarea
                  className="mt-1.5 min-h-[4rem] w-full rounded-dlc-md border border-border bg-background px-3 py-2 text-sm"
                  value={value}
                  disabled={!canEdit || busy}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, [q.id]: e.target.value }))
                  }
                />
              ) : (
                <Input
                  className="mt-1.5"
                  value={value}
                  disabled={!canEdit || busy}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, [q.id]: e.target.value }))
                  }
                />
              )}
            </li>
          );
        })}
      </ol>

      {canEdit && memberUserKey ? (
        <Button
          type="button"
          size="sm"
          disabled={busy}
          onClick={() => {
            void (async () => {
              setBusy(true);
              try {
                const result = await upsertAnswers({
                  fileTaskId,
                  memberUserKey,
                  answers: items.map((q) => ({
                    questionId: q.id,
                    value: draft[q.id] ?? "",
                  })),
                });
                showOperationalToast({
                  title: result.changed ? "Answers saved" : "No changes",
                  variant: "success",
                });
              } catch (e) {
                showOperationalToast({
                  title: "Could not save answers",
                  description:
                    e instanceof Error ? e.message : "Something went wrong.",
                  variant: "destructive",
                });
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          {busy ? "Saving…" : "Save answers"}
        </Button>
      ) : null}
    </div>
  );
}
