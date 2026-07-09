import type { Doc } from "@/convex/_generated/dataModel";

export function taskBucketQuadrant(n: number): 1 | 2 | 3 | 4 {
  if (n === 1 || n === 2 || n === 3 || n === 4) return n;
  return 2;
}

const QUADRANT_TITLE: Record<1 | 2 | 3 | 4, string> = {
  1: "Urgent & important",
  2: "Important, not urgent",
  3: "Urgent, not important",
  4: "Not urgent, not important",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function errandStoreDone(loc: NonNullable<Doc<"tasks">["errandLocations"]>[number]): boolean {
  if (loc.completed) return true;
  return (
    loc.items.length > 0 && loc.items.every((i) => i.completed)
  );
}

function formatErrandItemPlain(it: NonNullable<
  Doc<"tasks">["errandLocations"]
>[number]["items"][number]): string {
  const mark = it.completed ? "☑" : "☐";
  let line = `    ${mark} ${it.name}`;
  const q = it.quantity?.trim();
  const n = it.note?.trim();
  const extras: string[] = [];
  if (q) extras.push(`× ${q}`);
  if (n) extras.push(n);
  if (extras.length) line += `  ${extras.join("  ·  ")}`;
  return line;
}

function formatErrandLocationsPlain(t: Doc<"tasks">): string {
  const locs = t.errandLocations;
  if (!locs?.length) return "  (No stores yet — add stops in the app.)";
  const lines: string[] = [];
  for (const loc of locs) {
    const done = errandStoreDone(loc);
    const n = loc.items.length;
    const checked = loc.items.filter((i) => i.completed).length;
    const prog = n > 0 ? ` ${checked}/${n}` : "";
    const tag = done ? " ☑" : "";
    lines.push(`  [${loc.name}]${prog}${tag}`);
    for (const it of loc.items) {
      lines.push(formatErrandItemPlain(it));
    }
  }
  return lines.join("\n");
}

function formatErrandLocationsHtml(t: Doc<"tasks">): string {
  const locs = t.errandLocations;
  if (!locs?.length) {
    return `<div class="stores"><p class="errand-empty">No stores yet — add stops in the app before printing, or use this sheet for handwritten notes.</p></div>`;
  }
  const blocks = locs.map((loc) => {
    const done = errandStoreDone(loc);
    const n = loc.items.length;
    const checked = loc.items.filter((i) => i.completed).length;
    const prog =
      n > 0
        ? `<span class="store-prog" aria-label="Items completed at this stop">${checked} / ${n}</span>`
        : `<span class="store-prog muted">0 items</span>`;
    const items = loc.items
      .map((it) => {
        const q = it.quantity?.trim();
        const note = it.note?.trim();
        const metaParts: string[] = [];
        if (q) {
          metaParts.push(
            `<span class="qty"><span class="meta-label">Qty</span> ${escapeHtml(q)}</span>`
          );
        }
        if (note) {
          metaParts.push(
            `<span class="note"><span class="meta-label">Note</span> ${escapeHtml(note)}</span>`
          );
        }
        const meta =
          metaParts.length > 0
            ? `<div class="item-meta">${metaParts.join("")}</div>`
            : "";
        const checkedClass = it.completed ? " done" : "";
        const ariaDone = it.completed ? "true" : "false";
        return `<li class="errand-item${checkedClass}" data-done="${ariaDone}">
  <span class="chk-wrap" aria-hidden="true"><span class="chk-box${it.completed ? " is-checked" : ""}"></span></span>
  <div class="item-body">
    <div class="item-line"><span class="iname">${escapeHtml(it.name)}</span></div>
    ${meta}
  </div>
</li>`;
      })
      .join("\n");
    const doneMark = done
      ? `<span class="store-done-mark" title="All items done at this stop">✓</span>`
      : "";
    return `<section class="store${done ? " store-done" : ""}">
  <header class="store-hd">
    <h3 class="store-title">${escapeHtml(loc.name)}</h3>
    ${prog}
    ${doneMark}
  </header>
  <ul class="errand-items">${items}</ul>
</section>`;
  });
  return `<div class="stores">${blocks.join("\n")}</div>`;
}

function typeLabel(t: Doc<"tasks">["type"]): string {
  if (t === "errands_groceries") return "Errands / groceries";
  return t;
}

function formatDue(ms: number | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "";
  try {
    return new Date(ms).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

export function formatSelectedTasksPlainText(tasks: Doc<"tasks">[]): string {
  if (tasks.length === 0) return "";
  const blocks = tasks.map((t) => {
    const q = taskBucketQuadrant(t.quadrant);
    const meta = `Q${q} (${QUADRANT_TITLE[q]}) · ${t.category} · ${typeLabel(t.type)} · ${t.status}`;
    const due = formatDue(t.dueDate);
    const parts: string[] = [`• ${t.title}`];
    if (t.type === "errands_groceries") {
      parts.push(formatErrandLocationsPlain(t));
      if (t.description?.trim()) {
        parts.push(
          `  Notes:\n${t.description.trim().split("\n").join("\n  ")}`
        );
      }
    } else if (t.description?.trim()) {
      parts.push(t.description.trim().split("\n").join("\n  "));
    }
    parts.push(`  ${meta}${due ? ` · Due ${due}` : ""}`);
    return parts.join("\n");
  });
  return blocks.join("\n\n");
}

/**
 * Opens a minimal print-friendly document in a new tab and triggers the
 * browser print dialog (user can choose “Save as PDF”).
 */
export function printTasksInNewWindow(tasks: Doc<"tasks">[]): boolean {
  if (tasks.length === 0) return false;
  const docTitle =
    tasks.length === 1
      ? tasks[0].title.trim() || "Task"
      : `Selected tasks (${tasks.length})`;
  const body = tasks
    .map((t) => {
      const q = taskBucketQuadrant(t.quadrant);
      const meta = escapeHtml(
        `Q${q} — ${QUADRANT_TITLE[q]} · ${t.category} · ${typeLabel(t.type)} · ${t.status}`
      );
      const due = formatDue(t.dueDate);
      const stores =
        t.type === "errands_groceries" ? formatErrandLocationsHtml(t) : "";
      const desc =
        t.type !== "errands_groceries" && t.description?.trim()
          ? `<div class="desc">${escapeHtml(t.description.trim()).replace(/\n/g, "<br/>")}</div>`
          : "";
      const title = `<h2 class="task-title">${escapeHtml(t.title)}</h2>`;
      const metaBlock = `<p class="meta">${meta}${due ? ` · Due ${escapeHtml(due)}` : ""}</p>`;
      if (t.type === "errands_groceries") {
        const notes = t.description?.trim()
          ? `<div class="desc desc-after-stores"><span class="desc-label">Notes</span><div class="desc-body">${escapeHtml(t.description.trim()).replace(/\n/g, "<br/>")}</div></div>`
          : "";
        return `<article class="task task-errands">${title}${stores}${notes}${metaBlock}</article>`;
      }
      return `<article class="task">${title}${desc}${metaBlock}</article>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${escapeHtml(docTitle)}</title>
  <style>
    * { box-sizing: border-box; }
    @page {
      margin: 12mm 14mm;
      size: auto;
    }
    html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body {
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      margin: 0;
      padding: 20px 16px 24px;
      color: #000;
      background: #fff;
      line-height: 1.45;
      font-size: 11pt;
    }
    h1 {
      font-size: 1.25rem;
      font-weight: 700;
      margin: 0 0 16px;
      padding-bottom: 8px;
      border-bottom: 2px solid #000;
    }
    .task {
      padding: 12px 0 16px;
      border-bottom: 1px solid #999;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .task:last-child { border-bottom: none; }
    .task-title {
      font-size: 1.1rem;
      font-weight: 700;
      margin: 0 0 10px;
      line-height: 1.25;
      word-wrap: break-word;
      overflow-wrap: anywhere;
    }
    .meta {
      font-size: 0.8rem;
      color: #333;
      margin: 10px 0 0;
      line-height: 1.35;
      word-wrap: break-word;
    }
    .desc {
      margin: 8px 0 0;
      font-size: 0.95rem;
      line-height: 1.45;
      word-wrap: break-word;
      overflow-wrap: anywhere;
    }
    .desc-after-stores { margin-top: 14px; padding-top: 10px; border-top: 1px dashed #666; }
    .desc-label {
      display: block;
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-bottom: 4px;
      color: #000;
    }
    .desc-body { white-space: pre-wrap; }

    /* —— Errands / groceries —— */
    .stores { margin: 4px 0 0; }
    .errand-empty {
      margin: 8px 0 0;
      font-size: 0.9rem;
      color: #333;
      font-style: italic;
      line-height: 1.4;
      max-width: 40rem;
    }
    .store {
      margin: 14px 0 0;
      padding: 10px 12px 12px;
      border: 1px solid #000;
      border-radius: 2px;
      break-inside: auto;
      page-break-inside: auto;
    }
    .store:first-of-type { margin-top: 8px; }
    .store-hd {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 8px 12px;
      margin: 0 0 8px;
      padding-bottom: 6px;
      border-bottom: 1px solid #000;
    }
    .store-title {
      font-size: 0.98rem;
      font-weight: 700;
      margin: 0;
      flex: 1 1 12rem;
      min-width: 0;
      line-height: 1.25;
      word-wrap: break-word;
      overflow-wrap: anywhere;
    }
    .store-prog {
      font-size: 0.78rem;
      font-weight: 600;
      color: #000;
      white-space: nowrap;
    }
    .store-prog.muted { font-weight: 500; color: #444; }
    .store-done-mark {
      font-size: 0.85rem;
      font-weight: 700;
      border: 1px solid #000;
      padding: 0 5px;
      line-height: 1.2;
    }
    ul.errand-items {
      margin: 0;
      padding: 0;
      list-style: none;
      font-size: 0.92rem;
    }
    .errand-item {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      margin: 0;
      padding: 6px 0;
      border-bottom: 1px solid #ccc;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .errand-item:last-child { border-bottom: none; }
    .chk-wrap {
      flex-shrink: 0;
      width: 18px;
      padding-top: 2px;
    }
    .chk-box {
      display: block;
      position: relative;
      width: 14px;
      height: 14px;
      border: 1.5pt solid #000;
      box-sizing: border-box;
      background: #fff;
    }
    .chk-box.is-checked::after {
      content: "\\2713";
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: 700;
      line-height: 1;
    }
    .item-body {
      flex: 1;
      min-width: 0;
    }
    .item-line { min-width: 0; }
    .iname {
      font-weight: 500;
      word-wrap: break-word;
      overflow-wrap: anywhere;
      line-height: 1.35;
    }
    .errand-item.done .iname {
      text-decoration: line-through;
      color: #555;
      font-weight: 400;
    }
    .item-meta {
      margin-top: 4px;
      font-size: 0.82rem;
      line-height: 1.4;
      color: #222;
      word-wrap: break-word;
      overflow-wrap: anywhere;
    }
    .item-meta .qty { display: block; margin-top: 2px; }
    .item-meta .note { display: block; margin-top: 2px; font-style: italic; }
    .meta-label {
      font-weight: 700;
      font-size: 0.68rem;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      margin-right: 4px;
      color: #000;
    }
    .errand-item.done .item-meta { color: #555; }

    @media print {
      body { padding: 0; font-size: 10pt; }
      h1 { border-bottom-color: #000; }
      .task { padding: 10px 0 14px; }
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(docTitle)}</h1>
  ${body}
  <script>
    window.addEventListener("load", function () {
      setTimeout(function () { window.print(); }, 200);
    });
  </script>
</body>
</html>`;

  const w = window.open("", "_blank", "noopener,noreferrer");
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}
