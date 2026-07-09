import type { HelpArticle } from "./helpCenterContent";

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function tokenize(s: string): string[] {
  return normalize(s)
    .split(/[^a-z0-9]+/i)
    .filter((t) => t.length > 0);
}

const haystackFor = (a: HelpArticle): string =>
  [
    a.title,
    a.summary,
    ...a.body,
    ...(a.keywords ?? []),
    a.category,
    a.purpose ?? "",
    ...(a.whatYouCanDo ?? []),
    ...(a.storedHere ?? []),
    ...(a.storedElsewhere ?? []),
  ].join(" ");

/** Simple relevance search over bundled articles (client-side). */
export function searchHelpArticles(
  articles: HelpArticle[],
  rawQuery: string,
  limit = 40,
): HelpArticle[] {
  const q = normalize(rawQuery);
  if (!q) return [...articles];

  const tokens = tokenize(rawQuery);
  if (tokens.length === 0) return [...articles];

  const scored = articles.map((a) => {
    const h = haystackFor(a).toLowerCase();
    let score = 0;
    for (const t of tokens) {
      if (t.length < 2) continue;
      if (a.title.toLowerCase().includes(t)) score += 12;
      if (a.summary.toLowerCase().includes(t)) score += 8;
      if (h.includes(t)) score += 4;
      for (const kw of a.keywords ?? []) {
        if (kw.toLowerCase().includes(t)) score += 6;
      }
    }
    if (q.length >= 3 && a.title.toLowerCase().includes(q)) score += 20;
    if (q.length >= 3 && a.summary.toLowerCase().includes(q)) score += 14;
    return { a, score };
  });

  return scored
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit)
    .map((x) => x.a);
}
