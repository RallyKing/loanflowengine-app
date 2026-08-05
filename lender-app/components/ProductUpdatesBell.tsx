"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueries, type RequestForQueries } from "convex/react";
import { ChevronDown, Sparkles } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { PortalOverlayPanel } from "@/components/ui/PortalOverlayPanel";
import { cn } from "@/lib/cn";
import { useHelpSupport } from "@/lib/helpSupportContext";
import { useAuth } from "@/lib/sessionUiClient";
import { useActorUserKey } from "@/lib/useActorUserKey";
import { useOrgPermissions } from "@/lib/useOrgPermissions";
import { APP_DISPLAY_NAME } from "@/lib/brandIdentity";
import {
  formatPublishedAt,
  isValidPublishedAt,
} from "@/lib/product-knowledge/formatPublishedAt";
import { SilentFeatureErrorBoundary } from "@/components/SilentFeatureErrorBoundary";

function changeTypeLabel(
  t: Doc<"productReleasePosts">["changeType"],
): string {
  switch (t) {
    case "added":
      return "New";
    case "changed":
      return "Changed";
    case "moved":
      return "Moved";
    case "fixed":
      return "Fixed";
    case "improved":
      return "Improved";
    case "redesigned":
      return "Redesigned";
    default:
      return "Update";
  }
}

function ReleasePostCard({
  post,
  onLearnMore,
}: {
  post: Doc<"productReleasePosts">;
  onLearnMore: (slug: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasBody = post.body.length > 0;
  const detailsId = `product-update-body-${post._id}`;

  return (
    <li className="rounded-dlc-md border border-border/80 bg-muted/20 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
          {changeTypeLabel(post.changeType)}
        </span>
        {isValidPublishedAt(post.publishedAt) ? (
          <time
            className="text-[10px] text-muted-foreground"
            dateTime={new Date(post.publishedAt).toISOString()}
          >
            {formatPublishedAt(post.publishedAt)}
          </time>
        ) : null}
      </div>
      <p className="mt-1.5 text-sm font-medium leading-snug text-foreground">
        {post.title}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{post.summary}</p>

      {hasBody ? (
        <div className="mt-2">
          <button
            type="button"
            className="inline-flex min-h-9 items-center gap-1 rounded-dlc-sm px-1.5 text-[11px] font-medium text-primary underline-offset-2 hover:underline"
            aria-expanded={expanded}
            aria-controls={detailsId}
            onClick={() => setExpanded((v) => !v)}
          >
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 shrink-0 transition-transform duration-dlc-short1 ease-dlc-standard",
                expanded && "rotate-180",
              )}
              aria-hidden
            />
            {expanded ? "Hide details" : "Show details"}
          </button>
          {expanded ? (
            <div
              id={detailsId}
              className="mt-2 space-y-1.5 border-t border-border/60 pt-2 text-xs leading-relaxed text-foreground"
            >
              {post.body.map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {post.learnMoreSlug ? (
        <button
          type="button"
          className="mt-2 text-[11px] font-medium text-primary underline-offset-2 hover:underline"
          onClick={() => onLearnMore(post.learnMoreSlug!)}
        >
          Learn more in Help
        </button>
      ) : null}
    </li>
  );
}

type ProductUpdatesBellProps = {
  userKey?: string;
  className?: string;
};

export function ProductUpdatesBell({
  userKey,
  className,
}: ProductUpdatesBellProps) {
  const { openHelp } = useHelpSupport();
  const { isLoaded: authLoaded, isSignedIn, userId } = useAuth();
  const actorKey = useActorUserKey();
  const sessionKey = isSignedIn && userId ? userId.trim() : "";
  const k = sessionKey || (userKey?.trim() ?? "") || actorKey;
  const { activeOrganizationId } = useOrgPermissions();
  const [open, setOpen] = useState(false);
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0, width: 360 });
  const rootRef = useRef<HTMLDivElement>(null);

  const ready = authLoaded && isSignedIn && k.length > 0;

  const queries = useMemo((): RequestForQueries => {
    const q: RequestForQueries = {};
    if (ready) {
      q.unread = {
        query: api.productKnowledge.unreadReleaseCountForUser,
        args: {
          memberUserKey: k,
          ...(activeOrganizationId
            ? { organizationId: activeOrganizationId }
            : {}),
        },
      };
      q.posts = {
        query: api.productKnowledge.listPublishedReleasePostsForViewer,
        args: {
          memberUserKey: k,
          ...(activeOrganizationId
            ? { organizationId: activeOrganizationId }
            : {}),
          // Show a full recent ship log — small fixes must not fall off a tiny cap.
          limit: 80,
        },
      };
    }
    return q;
  }, [ready, k, activeOrganizationId]);

  const results = useQueries(queries);
  const unread =
    results.unread instanceof Error ? 0 : (results.unread ?? 0);
  const postsRaw = ready ? results.posts : undefined;
  const posts: Doc<"productReleasePosts">[] | undefined =
    postsRaw instanceof Error
      ? undefined
      : (postsRaw as Doc<"productReleasePosts">[] | undefined);

  const markRead = useMutation(api.productKnowledge.markReleaseFeedRead);

  useLayoutEffect(() => {
    if (!open || !rootRef.current) return;
    const rect = rootRef.current.getBoundingClientRect();
    const width = Math.min(360, window.innerWidth - 16);
    const left = Math.max(
      8,
      Math.min(rect.right - width, window.innerWidth - width - 8),
    );
    setPanelPos({ top: rect.bottom + 6, left, width });
  }, [open]);

  if (!ready) return null;

  const openPanel = () => {
    setOpen(true);
    const latest = posts?.[0]?.publishedAt;
    if (latest) {
      void markRead({
        memberUserKey: k,
        throughPublishedAt: latest,
      }).catch(() => {
        /* Backend unavailable — panel still opens. */
      });
    }
  };

  return (
    <div
      ref={rootRef}
      className={cn("relative", className)}
      data-portal-overlay-trigger
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="relative h-11 min-h-11 min-w-11 shrink-0 gap-1.5 max-md:px-2 sm:min-w-0"
        data-testid="product-updates-bell"
        title={`Product updates — what changed in ${APP_DISPLAY_NAME}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          if (open) setOpen(false);
          else openPanel();
        }}
      >
        <Sparkles className="h-4 w-4" aria-hidden />
        <span className="hidden sm:inline">Updates</span>
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Button>

      <PortalOverlayPanel
        open={open}
        onClose={() => setOpen(false)}
        position={panelPos}
        layer="CHROME_MENU"
        className="p-3"
        aria-label="Product updates"
        data-testid="product-updates-panel"
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Product updates
          </span>
        </div>

        <div className="max-h-[min(60dvh,26rem)] space-y-3 overflow-y-auto overscroll-contain touch-scroll-y pr-0.5">
          {!posts || posts.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No published updates yet. Your workspace admin can seed content
              from Settings → Product knowledge.
            </p>
          ) : (
            <ul className="space-y-2">
              {posts.map((post) => (
                <ReleasePostCard
                  key={post._id}
                  post={post}
                  onLearnMore={(slug) => {
                    openHelp({ articleId: slug });
                    setOpen(false);
                  }}
                />
              ))}
            </ul>
          )}
        </div>

        <p className="mt-2 border-t border-border pt-2 text-[10px] text-muted-foreground">
          Task and mention alerts stay in the Alerts bell. This feed is for
          product changes only.
        </p>
      </PortalOverlayPanel>
    </div>
  );
}

/** AppChrome-safe wrapper — hides bell when Convex productKnowledge is unavailable. */
export function ProductUpdatesBellSafe(props: ProductUpdatesBellProps) {
  return (
    <SilentFeatureErrorBoundary feature="product-updates-bell">
      <ProductUpdatesBell {...props} />
    </SilentFeatureErrorBoundary>
  );
}
