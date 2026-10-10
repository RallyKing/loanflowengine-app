/**
 * Unit tests for Question(s) file-task helpers.
 * Run: npx tsx scripts/file-task-questions-tests.ts
 */
import assert from "node:assert/strict";
import {
  emptyFileTaskQuestion,
  mergeQuestionAnswers,
  sanitizeQuestionItems,
  validateClientQuestionSubmission,
  validateQuestionItemsConfig,
} from "../lib/fileTaskQuestions";

function testSanitize() {
  const a = emptyFileTaskQuestion(1000);
  a.prompt = "  Phone?  ";
  const b = emptyFileTaskQuestion(2000);
  b.prompt = "";
  const out = sanitizeQuestionItems([a, b, { ...a, id: a.id }]);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.prompt, "Phone?");
}

function testValidateConfig() {
  assert.match(
    validateQuestionItemsConfig([]) ?? "",
    /at least one/i,
  );
  const q = emptyFileTaskQuestion(1000);
  q.prompt = "Email?";
  assert.equal(validateQuestionItemsConfig([q]), null);
}

function testMergePreserves() {
  const q1 = emptyFileTaskQuestion(1000);
  q1.prompt = "Q1";
  const q2 = emptyFileTaskQuestion(2000);
  q2.prompt = "Q2";
  const existing = [
    {
      questionId: q1.id,
      value: "keep-me",
      updatedAt: 1,
      updatedBy: "client" as const,
    },
  ];
  const { answers, changed } = mergeQuestionAnswers({
    questionItems: [q1, q2],
    existing,
    patch: [{ questionId: q1.id, value: "keep-me" }],
    updatedBy: "broker",
    now: 2,
  });
  assert.equal(changed, false);
  assert.equal(answers.find((a) => a.questionId === q1.id)?.value, "keep-me");

  const next = mergeQuestionAnswers({
    questionItems: [q1],
    existing: [
      ...existing,
      { questionId: q2.id, value: "orphan", updatedAt: 1, updatedBy: "client" },
    ],
    patch: [],
    updatedBy: "broker",
    now: 3,
  });
  assert.equal(next.changed, true);
  assert.equal(next.answers.length, 1);
  assert.equal(next.answers[0]!.value, "keep-me");
}

function testClientValidation() {
  const q = emptyFileTaskQuestion(1000);
  q.prompt = "Email";
  q.answerType = "email";
  q.required = true;
  assert.match(
    validateClientQuestionSubmission({
      items: [q],
      answers: [{ questionId: q.id, value: "" }],
    }) ?? "",
    /required/i,
  );
  assert.match(
    validateClientQuestionSubmission({
      items: [q],
      answers: [{ questionId: q.id, value: "not-an-email" }],
    }) ?? "",
    /valid email/i,
  );
  assert.equal(
    validateClientQuestionSubmission({
      items: [q],
      answers: [{ questionId: q.id, value: "a@b.co" }],
    }),
    null,
  );
}

testSanitize();
testValidateConfig();
testMergePreserves();
testClientValidation();
console.log("file-task-questions-tests: ok");
