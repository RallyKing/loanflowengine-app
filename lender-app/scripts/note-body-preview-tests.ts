import assert from "node:assert/strict";
import {
  NOTE_BODY_PREVIEW_MAX_CHARS,
  NOTE_HISTORY_INITIAL_VISIBLE,
  noteBodyNeedsPreview,
  truncateNoteBodyPreview,
} from "../lib/pipeline/noteBodyPreview";

assert.equal(NOTE_HISTORY_INITIAL_VISIBLE, 5);

assert.equal(noteBodyNeedsPreview("Short note"), false);
assert.equal(noteBodyNeedsPreview("a".repeat(NOTE_BODY_PREVIEW_MAX_CHARS)), false);
assert.equal(
  noteBodyNeedsPreview("a".repeat(NOTE_BODY_PREVIEW_MAX_CHARS + 1)),
  true,
);
assert.equal(noteBodyNeedsPreview("one\ntwo\nthree\nfour"), false);
assert.equal(noteBodyNeedsPreview("one\ntwo\nthree\nfour\nfive"), true);
assert.equal(noteBodyNeedsPreview("   "), false);

const long = "Word ".repeat(80).trim();
assert.equal(noteBodyNeedsPreview(long), true);
const preview = truncateNoteBodyPreview(long);
assert.ok(preview.endsWith("…"));
assert.ok(preview.length < long.length);
assert.ok(!preview.includes("\n\n…"));

const multi = ["line1", "line2", "line3", "line4", "line5", "line6"].join("\n");
const multiPreview = truncateNoteBodyPreview(multi);
assert.ok(multiPreview.startsWith("line1\nline2\nline3\nline4"));
assert.ok(!multiPreview.includes("line5"));
assert.ok(multiPreview.endsWith("…"));

console.log("note-body-preview-tests: ok");
