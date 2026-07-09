"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  ExternalLink,
  HelpCircle,
  Mail,
  Search,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { APP_DISPLAY_NAME } from "@/lib/brandIdentity";
import {
  opSearchOverlayInputClass,
  OP_SEARCH_OVERLAY_ROW_CLASS,
} from "@/lib/ui/operationalInputs";
import {
  type HelpArticle,
  type HelpCategory,
} from "@/lib/helpCenterContent";
import {
  articleByIdFromList,
  useHelpArticles,
} from "@/lib/product-knowledge/useHelpArticles";
import { searchHelpArticles } from "@/lib/searchHelpArticles";
import {
  getSupportMailtoHref,
  useHelpSupport,
} from "@/lib/helpSupportContext";
import { useAuth } from "@/lib/sessionUiClient";
import { layerZIndexStyle, overlayScrimClass } from "@/lib/ui/layering";

function categoryLabel(
  cat: HelpCategory,
  categories: { id: HelpCategory; label: string }[],
): string {
  return categories.find((c) => c.id === cat)?.label ?? cat;
}

function StructuredSection({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  if (items.length === 0) return null;
  return (
    <section className="mt-4">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      <ul className="mt-2 list-disc space-y-1.5 pl-4 text-sm leading-relaxed text-foreground">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

function DeveloperGlossaryBlock({
  article,
}: {
  article: HelpArticle;
}) {
  const g = article.developerGlossary;
  if (!g) return null;

  const rows: { label: string; values: string[] }[] = [];
  if (g.routes?.length) rows.push({ label: "Routes", values: g.routes });
  if (g.navIds?.length) rows.push({ label: "Nav IDs", values: g.navIds });
  if (g.blockIds?.length) rows.push({ label: "Block IDs", values: g.blockIds });
  if (g.componentPaths?.length) {
    rows.push({ label: "Components", values: g.componentPaths });
  }
  if (g.notes?.length) rows.push({ label: "Notes", values: g.notes });

  if (rows.length === 0) return null;

  return (
    <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
        Developer reference
      </p>
      <dl className="mt-2 space-y-2 text-xs text-foreground">
        {rows.map(({ label, values }) => (
          <div key={label}>
            <dt className="font-medium text-muted-foreground">{label}</dt>
            <dd className="mt-0.5 font-mono text-[11px] leading-relaxed">
              {values.join(" · ")}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ArticleDetail({
  article,
  allArticles,
  categories,
  showGlossary,
  onPickRelated,
}: {
  article: HelpArticle;
  allArticles: HelpArticle[];
  categories: { id: HelpCategory; label: string }[];
  showGlossary: boolean;
  onPickRelated: (id: string) => void;
}) {
  const related = (article.relatedArticleIds ?? [])
    .map((id) => articleByIdFromList(allArticles, id))
    .filter(Boolean) as HelpArticle[];

  return (
    <article className="px-4 py-4 sm:px-6 sm:py-5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {categoryLabel(article.category, categories)}
      </p>
      <h3 className="mt-1 text-lg font-semibold leading-snug text-foreground">
        {article.title}
      </h3>
      <p className="mt-2 text-sm text-muted-foreground">{article.summary}</p>

      {article.purpose ? (
        <section className="mt-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Purpose
          </h4>
          <p className="mt-2 text-sm leading-relaxed text-foreground">
            {article.purpose}
          </p>
        </section>
      ) : null}

      <StructuredSection title="What you can do" items={article.whatYouCanDo ?? []} />
      <StructuredSection title="Stored here" items={article.storedHere ?? []} />
      <StructuredSection
        title="Stored elsewhere"
        items={article.storedElsewhere ?? []}
      />

      {article.body.length > 0 ? (
        <div className="mt-4 space-y-3 text-sm leading-relaxed text-foreground">
          {article.body.map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
      ) : null}

      {showGlossary ? <DeveloperGlossaryBlock article={article} /> : null}

      {related.length > 0 ? (
        <section className="mt-5 border-t border-border pt-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Related
          </h4>
          <ul className="mt-2 flex flex-wrap gap-2">
            {related.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => onPickRelated(a.id)}
                  className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-foreground hover:border-primary/35 hover:bg-muted"
                >
                  {a.title}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}

export function HelpCenterPanel() {
  const { isGlobalAdmin } = useAuth();
  const { articles, categories } = useHelpArticles();
  const {
    isOpen,
    closeHelp,
    initialQuery,
    initialArticleId,
  } = useHelpSupport();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<HelpCategory | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const supportHref = getSupportMailtoHref();

  useEffect(() => {
    if (!isOpen) return;
    setQ(initialQuery);
    if (initialArticleId && articleByIdFromList(articles, initialArticleId)) {
      setSelectedId(initialArticleId);
    } else if (initialQuery.trim()) {
      const hits = searchHelpArticles(articles, initialQuery, 1);
      setSelectedId(hits[0]?.id ?? null);
    } else {
      setSelectedId(null);
    }
    const t = window.setTimeout(() => searchRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [isOpen, initialQuery, initialArticleId, articles]);

  const filtered = useMemo(() => {
    const byCat =
      category === "all"
        ? articles
        : articles.filter((a) => a.category === category);
    const qq = q.trim();
    if (!qq) return byCat;
    const hits = searchHelpArticles(byCat, qq, 80);
    const hitIds = new Set(hits.map((h) => h.id));
    return byCat.filter((a) => hitIds.has(a.id));
  }, [category, q, articles]);

  const selected = useMemo(
    () => (selectedId ? articleByIdFromList(articles, selectedId) : null),
    [selectedId, articles],
  );

  const selectedHasGlossary = Boolean(selected?.developerGlossary);

  useEffect(() => {
    if (!isOpen) return;
    if (selectedId && !filtered.some((a) => a.id === selectedId)) {
      setSelectedId(filtered[0]?.id ?? null);
    }
  }, [filtered, isOpen, selectedId]);

  useEffect(() => {
    setGlossaryOpen(false);
  }, [selectedId]);

  const pick = useCallback((a: HelpArticle) => {
    setSelectedId(a.id);
  }, []);

  const showGlossary =
    isGlobalAdmin && glossaryOpen && selectedHasGlossary;

  if (!isOpen) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 flex justify-end backdrop-blur-[1px]",
        overlayScrimClass(),
      )}
      style={layerZIndexStyle("HELP")}
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-center-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close help"
        onClick={closeHelp}
      />
      <aside
        className={cn(
          "relative flex h-full w-full max-w-xl flex-col border-l border-border bg-background shadow-2xl",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-border px-4 py-3 sm:px-5">
          <div className="mt-0.5 rounded-lg bg-primary/10 p-2 text-primary">
            <BookOpen className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id="help-center-title"
              className="text-base font-semibold text-foreground"
            >
              How {APP_DISPLAY_NAME} works
            </h2>
            <p className="text-xs text-muted-foreground">
              Search the feature encyclopedia or contact support. Press{" "}
              <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">
                ?
              </kbd>{" "}
              outside a field to reopen.
            </p>
          </div>
          <button
            type="button"
            onClick={closeHelp}
            className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <div className="flex min-h-0 w-full shrink-0 flex-col border-b border-border md:w-[42%] md:border-b-0 md:border-r">
            <div className="shrink-0 border-b border-border p-3 sm:p-4">
              <div className={OP_SEARCH_OVERLAY_ROW_CLASS}>
                <Search className="h-4 w-4 shrink-0 text-foreground/55" />
                <input
                  ref={searchRef}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search help…"
                  className={opSearchOverlayInputClass()}
                  aria-label="Search help articles"
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => setCategory("all")}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[11px] font-medium",
                    category === "all"
                      ? "border-primary/40 bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:bg-muted/50",
                  )}
                >
                  All
                </button>
                {categories.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategory(c.id)}
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[11px] font-medium",
                      category === c.id
                        ? "border-primary/40 bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:bg-muted/50",
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
            <nav
              className="min-h-0 flex-1 touch-scroll-y overflow-y-auto p-2 sm:p-3"
              aria-label="Help articles"
            >
              {filtered.length === 0 ? (
                <p className="px-2 py-8 text-center text-sm text-muted-foreground">
                  No articles match. Try another word or category.
                </p>
              ) : (
                <ul className="space-y-0.5">
                  {filtered.map((a) => {
                    const active = selectedId === a.id;
                    return (
                      <li key={a.id}>
                        <button
                          type="button"
                          onClick={() => pick(a)}
                          className={cn(
                            "w-full rounded-lg px-3 py-2 text-left text-sm transition-colors",
                            active
                              ? "bg-muted font-medium text-foreground"
                              : "text-foreground hover:bg-muted/70",
                          )}
                        >
                          <span className="block leading-snug">{a.title}</span>
                          <span className="mt-0.5 block text-[11px] text-muted-foreground">
                            {categoryLabel(a.category, categories)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </nav>
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 touch-scroll-y flex-col overflow-y-auto">
            {isGlobalAdmin && selectedHasGlossary ? (
              <div className="shrink-0 border-b border-border px-4 py-2 sm:px-6">
                <button
                  type="button"
                  onClick={() => setGlossaryOpen((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/35 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-900 dark:text-amber-100"
                >
                  Developer glossary
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 transition-transform duration-dlc-short ease-dlc-standard",
                      glossaryOpen && "rotate-180",
                    )}
                    aria-hidden
                  />
                </button>
              </div>
            ) : null}

            {selected ? (
              <ArticleDetail
                article={selected}
                allArticles={articles}
                categories={categories}
                showGlossary={showGlossary}
                onPickRelated={(id) => setSelectedId(id)}
              />
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
                <HelpCircle className="h-10 w-10 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  Select an article or type in the search box.
                </p>
              </div>
            )}

            <div className="mt-auto border-t border-border bg-muted/20 px-4 py-4 sm:px-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Contact support
              </p>
              {supportHref ? (
                <a
                  href={supportHref}
                  className={cn(
                    "mt-2 inline-flex h-8 items-center justify-center gap-2 rounded-md border border-border",
                    "bg-background px-3 text-xs font-medium text-foreground shadow-sm",
                    "hover:border-primary/35 hover:bg-muted focus-visible:outline-none",
                    "focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                  )}
                >
                  <Mail className="h-4 w-4" aria-hidden />
                  Email support
                  <ExternalLink
                    className="h-3.5 w-3.5 opacity-70"
                    aria-hidden
                  />
                </a>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  Ask your workspace admin for the support contact. Teams can set{" "}
                  <code className="rounded bg-muted px-1 py-0.5 text-[10px]">
                    NEXT_PUBLIC_SUPPORT_EMAIL
                  </code>{" "}
                  to enable one-click email here.
                </p>
              )}
              <p className="mt-3 text-[11px] text-muted-foreground">
                Include what you were doing, what you expected, and any error
                text. Screenshots help.
              </p>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
