"use client";

import { useMemo } from "react";
import { useQueries, type RequestForQueries } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import {
  HELP_ARTICLES,
  HELP_CATEGORIES,
  type HelpArticle,
  type HelpCategory,
} from "@/lib/helpCenterContent";
import { useActorUserKey } from "@/lib/useActorUserKey";
import { useOrgPermissions } from "@/lib/useOrgPermissions";

function convexArticleToHelp(row: Doc<"productKnowledgeArticles">): HelpArticle {
  const category = row.categoryId as HelpCategory;
  const relatedArticleIds = row.body.relatedSlugs.length
    ? row.body.relatedSlugs
    : undefined;
  const paragraphs = row.body.paragraphs ?? [];
  return {
    id: row.legacyId ?? row.slug,
    title: row.title,
    summary: row.summary,
    category,
    keywords: row.keywords,
    purpose: row.body.purpose,
    whatYouCanDo: row.body.whatYouCanDo,
    storedHere: row.body.storedHere,
    storedElsewhere: row.body.storedElsewhere,
    relatedArticleIds,
    body: paragraphs.length > 0 ? paragraphs : [row.summary],
    developerGlossary: row.developerGlossary,
  };
}

export function useHelpArticles(
  /**
   * When `false`, skip the Convex article subscription entirely and serve the
   * bundled static help content. The Help Center panel passes its open state so
   * the full-table `listPublishedArticlesForViewer` `.collect()` only mounts
   * while the panel is actually open — not as an always-on shell subscription on
   * every page. Defaults to `true` to preserve prior behavior for any other
   * caller. No new Convex functions / polling; this only narrows WHEN the
   * existing query subscribes.
   */
  enabled: boolean = true,
): {
  articles: HelpArticle[];
  categories: typeof HELP_CATEGORIES;
  source: "convex" | "static";
  loading: boolean;
} {
  const memberUserKey = useActorUserKey();
  const { activeOrganizationId } = useOrgPermissions();
  const ready = enabled && memberUserKey.length > 0;

  const queries = useMemo((): RequestForQueries => {
    const q: RequestForQueries = {};
    if (ready) {
      q.articles = {
        query: api.productKnowledge.listPublishedArticlesForViewer,
        args: {
          memberUserKey,
          ...(activeOrganizationId
            ? { organizationId: activeOrganizationId }
            : {}),
        },
      };
    }
    return q;
  }, [ready, memberUserKey, activeOrganizationId]);

  const results = useQueries(queries);
  const convexRowsRaw = ready ? results.articles : undefined;

  return useMemo(() => {
    if (!ready || convexRowsRaw === undefined) {
      return {
        articles: HELP_ARTICLES,
        categories: HELP_CATEGORIES,
        source: "static" as const,
        loading: ready && convexRowsRaw === undefined,
      };
    }
    if (convexRowsRaw instanceof Error) {
      return {
        articles: HELP_ARTICLES,
        categories: HELP_CATEGORIES,
        source: "static" as const,
        loading: false,
      };
    }
    const convexRows = convexRowsRaw as Doc<"productKnowledgeArticles">[];
    if (convexRows.length === 0) {
      return {
        articles: HELP_ARTICLES,
        categories: HELP_CATEGORIES,
        source: "static" as const,
        loading: false,
      };
    }
    const articles = convexRows.map(convexArticleToHelp);
    const categoryIds = new Set(articles.map((a) => a.category));
    const categories = HELP_CATEGORIES.filter((c) => categoryIds.has(c.id));
    return {
      articles,
      categories: categories.length > 0 ? categories : HELP_CATEGORIES,
      source: "convex" as const,
      loading: false,
    };
  }, [convexRowsRaw, ready]);
}

export function articleByIdFromList(
  articles: HelpArticle[],
  id: string,
): HelpArticle | undefined {
  return articles.find((a) => a.id === id || a.id === id.trim());
}
