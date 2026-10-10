/** Question(s) file-task definitions + durable answer merge helpers. */

export const FILE_TASK_QUESTION_ANSWER_TYPES = [
  "phone",
  "email",
  "single_line",
  "large_text",
  "dollar_amount",
] as const;

export type FileTaskQuestionAnswerType =
  (typeof FILE_TASK_QUESTION_ANSWER_TYPES)[number];

export const FILE_TASK_QUESTION_ANSWER_TYPE_LABELS: Record<
  FileTaskQuestionAnswerType,
  string
> = {
  phone: "Phone number",
  email: "Email",
  single_line: "Single line text",
  large_text: "Large text box",
  dollar_amount: "Dollar amount",
};

export const MAX_FILE_TASK_QUESTIONS = 40;
export const MAX_QUESTION_PROMPT_LEN = 500;
export const MAX_QUESTION_ANSWER_LEN = 8000;

export type FileTaskQuestionItem = {
  id: string;
  prompt: string;
  answerType: FileTaskQuestionAnswerType;
  sortOrder: number;
  required?: boolean;
};

export type FileTaskQuestionAnswer = {
  questionId: string;
  value: string;
  updatedAt: number;
  updatedBy?: "client" | "broker";
};

export function isFileTaskQuestionAnswerType(
  value: string,
): value is FileTaskQuestionAnswerType {
  return (FILE_TASK_QUESTION_ANSWER_TYPES as readonly string[]).includes(value);
}

/** Stable client-side id for a new question row. */
export function newFileTaskQuestionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyFileTaskQuestion(
  sortOrder = 1000,
): FileTaskQuestionItem {
  return {
    id: newFileTaskQuestionId(),
    prompt: "",
    answerType: "single_line",
    sortOrder,
    required: true,
  };
}

export function sanitizeQuestionItems(
  items: FileTaskQuestionItem[] | null | undefined,
): FileTaskQuestionItem[] {
  if (!Array.isArray(items) || items.length === 0) return [];
  const seen = new Set<string>();
  const sorted = [...items].sort((a, b) => a.sortOrder - b.sortOrder);
  const out: FileTaskQuestionItem[] = [];
  for (const raw of sorted) {
    if (out.length >= MAX_FILE_TASK_QUESTIONS) break;
    const id = typeof raw.id === "string" ? raw.id.trim() : "";
    if (!id || seen.has(id)) continue;
    const prompt = (raw.prompt ?? "").trim().slice(0, MAX_QUESTION_PROMPT_LEN);
    if (!prompt) continue;
    const answerType = isFileTaskQuestionAnswerType(raw.answerType)
      ? raw.answerType
      : "single_line";
    seen.add(id);
    out.push({
      id,
      prompt,
      answerType,
      sortOrder: (out.length + 1) * 1000,
      required: raw.required !== false,
    });
  }
  return out;
}

export function validateQuestionItemsConfig(
  items: FileTaskQuestionItem[] | null | undefined,
): string | null {
  const sanitized = sanitizeQuestionItems(items);
  if (sanitized.length === 0) {
    return "Add at least one question for Question(s) tasks.";
  }
  return null;
}

/** Normalize a single answer value for storage (trim + length cap). */
export function normalizeQuestionAnswerValue(
  answerType: FileTaskQuestionAnswerType,
  raw: string,
): string {
  let value = (raw ?? "").trim().slice(0, MAX_QUESTION_ANSWER_LEN);
  if (answerType === "email") {
    value = value.toLowerCase();
  }
  if (answerType === "dollar_amount") {
    // Keep user-entered currency text; strip control chars only.
    value = value.replace(/[\u0000-\u001f]/g, "");
  }
  return value;
}

/**
 * Merge answer patches by questionId. Unchanged values are skipped (retry-safe).
 * Answers for removed question ids are dropped. Existing answers for kept ids
 * are preserved when the patch omits them.
 */
export function mergeQuestionAnswers(args: {
  questionItems: FileTaskQuestionItem[];
  existing: FileTaskQuestionAnswer[] | null | undefined;
  patch: Array<{ questionId: string; value: string }>;
  updatedBy: "client" | "broker";
  now: number;
}): { answers: FileTaskQuestionAnswer[]; changed: boolean } {
  const allowed = new Set(args.questionItems.map((q) => q.id));
  const typeById = new Map(
    args.questionItems.map((q) => [q.id, q.answerType] as const),
  );
  const byId = new Map<string, FileTaskQuestionAnswer>();
  for (const row of args.existing ?? []) {
    if (!allowed.has(row.questionId)) continue;
    byId.set(row.questionId, row);
  }

  let changed = false;
  // Drop answers whose questions were removed.
  if ((args.existing ?? []).some((a) => !allowed.has(a.questionId))) {
    changed = true;
  }

  for (const entry of args.patch) {
    const questionId = entry.questionId.trim();
    if (!allowed.has(questionId)) continue;
    const answerType = typeById.get(questionId) ?? "single_line";
    const value = normalizeQuestionAnswerValue(answerType, entry.value);
    const prior = byId.get(questionId);
    if (prior && prior.value === value) continue;
    byId.set(questionId, {
      questionId,
      value,
      updatedAt: args.now,
      updatedBy: args.updatedBy,
    });
    changed = true;
  }

  const answers = args.questionItems
    .map((q) => byId.get(q.id))
    .filter((a): a is FileTaskQuestionAnswer => a != null);

  return { answers, changed };
}

export function answerMapFromRows(
  answers: FileTaskQuestionAnswer[] | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of answers ?? []) {
    out[row.questionId] = row.value;
  }
  return out;
}

export function questionAnswersAreSubstantive(
  items: FileTaskQuestionItem[] | null | undefined,
  answers: FileTaskQuestionAnswer[] | null | undefined,
): boolean {
  const sanitized = sanitizeQuestionItems(items);
  if (sanitized.length === 0) return false;
  const map = answerMapFromRows(answers);
  return sanitized.some((q) => (map[q.id] ?? "").trim().length > 0);
}

export function validateClientQuestionSubmission(args: {
  items: FileTaskQuestionItem[];
  answers: Array<{ questionId: string; value: string }>;
}): string | null {
  const map = new Map(
    args.answers.map((a) => [a.questionId, (a.value ?? "").trim()] as const),
  );
  for (const q of args.items) {
    if (q.required === false) continue;
    const value = map.get(q.id) ?? "";
    if (!value) {
      return `Answer required: ${q.prompt}`;
    }
    if (q.answerType === "email" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return `Enter a valid email for: ${q.prompt}`;
    }
  }
  return null;
}
