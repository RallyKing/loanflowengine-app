import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { downloadPdfBytes } from "@/lib/documents/pdfExport";
import {
  FILE_TASK_QUESTION_ANSWER_TYPE_LABELS,
  type FileTaskQuestionAnswer,
  type FileTaskQuestionItem,
  answerMapFromRows,
  sanitizeQuestionItems,
} from "@/lib/fileTaskQuestions";

const LETTER_WIDTH = 612;
const LETTER_HEIGHT = 792;
const MARGIN = 54;
const LINE_GAP = 4;

export type FileTaskQuestionsPdfInput = {
  taskTitle: string;
  fileLabel?: string;
  questionItems: FileTaskQuestionItem[];
  questionAnswers?: FileTaskQuestionAnswer[] | null;
};

function wrapText(
  text: string,
  font: { widthOfTextAtSize: (t: string, size: number) => number },
  size: number,
  maxWidth: number,
): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  if (words.length === 0 || (words.length === 1 && !words[0])) return [];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Build a Q&A-style PDF (question + answer pairs). */
export async function buildFileTaskQuestionsPdf(
  input: FileTaskQuestionsPdfInput,
): Promise<{ bytes: Uint8Array; fileName: string }> {
  const items = sanitizeQuestionItems(input.questionItems);
  const answers = answerMapFromRows(input.questionAnswers);
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const maxWidth = LETTER_WIDTH - MARGIN * 2;

  let page = doc.addPage([LETTER_WIDTH, LETTER_HEIGHT]);
  let y = LETTER_HEIGHT - MARGIN;

  const ensureSpace = (needed: number) => {
    if (y - needed < MARGIN) {
      page = doc.addPage([LETTER_WIDTH, LETTER_HEIGHT]);
      y = LETTER_HEIGHT - MARGIN;
    }
  };

  const drawLines = (
    lines: string[],
    size: number,
    bold: boolean,
    color = rgb(0.1, 0.1, 0.12),
  ) => {
    const f = bold ? fontBold : font;
    for (const line of lines) {
      ensureSpace(size + LINE_GAP);
      page.drawText(line, { x: MARGIN, y: y - size, size, font: f, color });
      y -= size + LINE_GAP;
    }
  };

  const title = (input.taskTitle || "Questions").trim() || "Questions";
  drawLines(wrapText(title, fontBold, 16, maxWidth), 16, true);
  y -= 6;
  if (input.fileLabel?.trim()) {
    drawLines(
      wrapText(input.fileLabel.trim(), font, 10, maxWidth),
      10,
      false,
      rgb(0.35, 0.35, 0.4),
    );
    y -= 4;
  }
  drawLines(
    wrapText("Question & Answer summary", font, 11, maxWidth),
    11,
    false,
    rgb(0.25, 0.25, 0.3),
  );
  y -= 12;

  items.forEach((q, index) => {
    ensureSpace(48);
    const label = `Q${index + 1}. ${q.prompt}`;
    drawLines(wrapText(label, fontBold, 11, maxWidth), 11, true);
    const typeLabel = FILE_TASK_QUESTION_ANSWER_TYPE_LABELS[q.answerType];
    drawLines(
      wrapText(typeLabel, font, 9, maxWidth),
      9,
      false,
      rgb(0.45, 0.45, 0.5),
    );
    const answer = (answers[q.id] ?? "").trim() || "—";
    drawLines(wrapText(`A: ${answer}`, font, 11, maxWidth), 11, false);
    y -= 14;
  });

  if (items.length === 0) {
    drawLines(["No questions configured."], 11, false);
  }

  const bytes = await doc.save();
  const safe = title
    .replace(/[^\w\s-]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return {
    bytes,
    fileName: `${safe || "questions"}-qa.pdf`,
  };
}

export async function downloadFileTaskQuestionsPdf(
  input: FileTaskQuestionsPdfInput,
): Promise<void> {
  const { bytes, fileName } = await buildFileTaskQuestionsPdf(input);
  downloadPdfBytes(bytes, fileName);
}
