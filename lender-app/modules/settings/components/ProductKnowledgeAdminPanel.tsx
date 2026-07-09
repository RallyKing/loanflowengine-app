"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useActorUserKey } from "@/lib/useActorUserKey";
import type { ProductReleaseChangeType } from "@/lib/product-knowledge/types";

const CHANGE_TYPES: ProductReleaseChangeType[] = [
  "added",
  "changed",
  "moved",
  "fixed",
  "improved",
  "redesigned",
];

export function ProductKnowledgeAdminPanel() {
  const memberUserKey = useActorUserKey();
  const stats = useQuery(api.productKnowledge.adminStats, { memberUserKey });
  const posts = useQuery(api.productKnowledge.adminListReleasePosts, {
    memberUserKey,
  });
  const pendingDrafts = useQuery(api.productKnowledge.adminListPendingDrafts, {
    memberUserKey,
  });

  const seed = useMutation(api.productKnowledge.adminSeedPlatformContentIfEmpty);
  const publish = useMutation(api.productKnowledge.adminPublishReleasePost);

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [changeType, setChangeType] =
    useState<ProductReleaseChangeType>("improved");
  const [learnMoreSlug, setLearnMoreSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const runSeed = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await seed({ memberUserKey });
      setMessage(
        result.seeded
          ? `Seeded ${result.articlesInserted} articles and ${result.postsInserted} release posts.`
          : result.reason ?? "Seed skipped.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Seed failed.");
    } finally {
      setBusy(false);
    }
  };

  const runPublish = async () => {
    if (!title.trim() || !summary.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      await publish({
        memberUserKey,
        title: title.trim(),
        summary: summary.trim(),
        body: bodyText
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean),
        changeType,
        affectedPersonas: ["All users"],
        affectedArticleSlugs: learnMoreSlug.trim()
          ? [learnMoreSlug.trim()]
          : [],
        learnMoreSlug: learnMoreSlug.trim() || undefined,
      });
      setTitle("");
      setSummary("");
      setBodyText("");
      setLearnMoreSlug("");
      setMessage("Release post published.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Publish failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <p className="text-sm text-muted-foreground">
        Platform-global product knowledge — encyclopedia articles and human-facing
        release notes. Content is never auto-published from automation without
        review (Phase 3 drafts land in the pending queue below).
      </p>

      {stats ? (
        <dl className="grid grid-cols-2 gap-3 rounded-lg border border-border/80 bg-muted/20 p-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">Articles</dt>
            <dd className="font-semibold">
              {stats.publishedArticleCount}/{stats.articleCount} published
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Release posts</dt>
            <dd className="font-semibold">
              {stats.publishedPostCount}/{stats.postCount} published
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Pending drafts</dt>
            <dd className="font-semibold">{stats.pendingDraftCount}</dd>
          </div>
        </dl>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={busy}
          onClick={() => void runSeed()}
        >
          Seed platform content (if empty)
        </Button>
      </div>

      <div className="space-y-3 rounded-lg border border-border/80 p-4">
        <h3 className="text-sm font-semibold">Publish release post</h3>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (human-friendly)"
          aria-label="Release post title"
        />
        <Input
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="One-line summary"
          aria-label="Release post summary"
        />
        <textarea
          value={bodyText}
          onChange={(e) => setBodyText(e.target.value)}
          placeholder="Body paragraphs (one per line)"
          rows={4}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          aria-label="Release post body"
        />
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-muted-foreground" htmlFor="pk-change-type">
            Change type
          </label>
          <select
            id="pk-change-type"
            value={changeType}
            onChange={(e) =>
              setChangeType(e.target.value as ProductReleaseChangeType)
            }
            className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          >
            {CHANGE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <Input
          value={learnMoreSlug}
          onChange={(e) => setLearnMoreSlug(e.target.value)}
          placeholder="Learn more article slug (optional)"
          aria-label="Learn more slug"
        />
        <Button
          type="button"
          size="sm"
          disabled={busy || !title.trim() || !summary.trim()}
          onClick={() => void runPublish()}
        >
          Publish to Updates feed
        </Button>
      </div>

      {pendingDrafts && pendingDrafts.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Pending automation drafts</h3>
          <ul className="space-y-2 text-xs text-muted-foreground">
            {pendingDrafts.slice(0, 8).map((d) => (
              <li
                key={d._id}
                className="rounded-md border border-border/70 px-3 py-2"
              >
                {d.proposedPostTitle ?? d.proposedArticleSlug ?? "Draft"} —{" "}
                {d.detectedChanges.length} change(s)
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {posts && posts.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Recent release posts</h3>
          <ul className="space-y-1.5 text-xs">
            {posts.slice(0, 10).map((p) => (
              <li key={p._id} className="text-muted-foreground">
                <span className="font-medium text-foreground">{p.title}</span> —{" "}
                {p.status}
                {p.publishedAt
                  ? ` · ${new Date(p.publishedAt).toLocaleDateString()}`
                  : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {message ? (
        <p className="text-sm text-muted-foreground" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
