"use client";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  FILE_TASK_QUESTION_ANSWER_TYPE_LABELS,
  FILE_TASK_QUESTION_ANSWER_TYPES,
  MAX_FILE_TASK_QUESTIONS,
  emptyFileTaskQuestion,
  type FileTaskQuestionAnswerType,
  type FileTaskQuestionItem,
} from "@/lib/fileTaskQuestions";
import { cn } from "@/lib/cn";

export type FileTaskQuestionsEditorProps = {
  value: FileTaskQuestionItem[];
  onChange: (next: FileTaskQuestionItem[]) => void;
  disabled?: boolean;
};

export function FileTaskQuestionsEditor({
  value,
  onChange,
  disabled = false,
}: FileTaskQuestionsEditorProps) {
  const rows =
    value.length > 0
      ? [...value].sort((a, b) => a.sortOrder - b.sortOrder)
      : [emptyFileTaskQuestion(1000)];

  const commit = (next: FileTaskQuestionItem[]) => {
    onChange(
      next.map((q, index) => ({
        ...q,
        sortOrder: (index + 1) * 1000,
      })),
    );
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Add one or more questions the borrower must answer in the client portal.
      </p>
      <ul className="space-y-3">
        {rows.map((row, index) => (
          <li
            key={row.id}
            className="rounded-dlc-md border border-border/70 bg-background p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Question {index + 1}
              </p>
              {rows.length > 1 ? (
                <button
                  type="button"
                  disabled={disabled}
                  className="text-[11px] font-medium text-muted-foreground hover:text-destructive"
                  onClick={() => commit(rows.filter((r) => r.id !== row.id))}
                >
                  Remove
                </button>
              ) : null}
            </div>
            <label className="mt-2 block">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Prompt
              </span>
              <Input
                className="mt-1"
                placeholder="e.g. Best phone number to reach you"
                value={row.prompt}
                disabled={disabled}
                onChange={(e) =>
                  commit(
                    rows.map((r) =>
                      r.id === row.id ? { ...r, prompt: e.target.value } : r,
                    ),
                  )
                }
              />
            </label>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="block">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Answer type
                </span>
                <select
                  className="mt-1 h-9 w-full rounded-dlc-md border border-border bg-background px-3 text-sm"
                  value={row.answerType}
                  disabled={disabled}
                  onChange={(e) =>
                    commit(
                      rows.map((r) =>
                        r.id === row.id
                          ? {
                              ...r,
                              answerType: e.target
                                .value as FileTaskQuestionAnswerType,
                            }
                          : r,
                      ),
                    )
                  }
                >
                  {FILE_TASK_QUESTION_ANSWER_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {FILE_TASK_QUESTION_ANSWER_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mt-6 flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={row.required !== false}
                  disabled={disabled}
                  onChange={(e) =>
                    commit(
                      rows.map((r) =>
                        r.id === row.id
                          ? { ...r, required: e.target.checked }
                          : r,
                      ),
                    )
                  }
                />
                Required
              </label>
            </div>
          </li>
        ))}
      </ul>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={disabled || rows.length >= MAX_FILE_TASK_QUESTIONS}
        className={cn(rows.length >= MAX_FILE_TASK_QUESTIONS && "opacity-60")}
        onClick={() =>
          commit([
            ...rows,
            emptyFileTaskQuestion((rows.length + 1) * 1000),
          ])
        }
      >
        Add question
      </Button>
    </div>
  );
}
