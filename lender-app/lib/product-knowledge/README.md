# Product knowledge & Product Updates

## Product Updates (masterpage Updates bell)

- **UI:** `components/ProductUpdatesBell.tsx` (header chrome via `AppChrome`)
- **Table:** `productReleasePosts` (platform-global changelog)
- **Queries:** `productKnowledge.listPublishedReleasePostsForViewer`, `unreadReleaseCountForUser`
- **Admin UI:** Settings → Product knowledge (`ProductKnowledgeAdminPanel`)
- **Timestamps:** stored as UTC epoch ms; UI formats with the **viewer’s local timezone** via `lib/product-knowledge/formatPublishedAt.ts` (never force `timeZone: "UTC"`).

### Agent / operator ship rule

**Every user-facing production ship must add a Product Updates entry in the same session** — including small fixes. Each entry needs title, short summary, and expandable full description (`body` paragraphs). Do not invent unfinished work as shipped. Prefer additive unique `slug`s when other agents are also appending to the session file.

Preferred path (idempotent by `slug`):

```text
productKnowledge:operatorPublishReleasePost
```

Args: `operatorSecret`, `title`, `summary`, `body` (string[]), `changeType`, stable `slug`, optional `deploymentId` / `publishedAt`.

**`publishedAt`:** UTC epoch **milliseconds**. Omit it (or never use `0`) so the server / publish script assigns “now”. Values before 2020-01-01 are rejected so posts are not buried at epoch in the feed.

Also: append to `sessionReleasePosts.json` then run:

```powershell
npx tsx scripts/publish-session-release-posts.mts
```

The publish script skips invalid/`0` stamps and staggers replacements so JSON order is preserved. Re-runs are safe (same slug upserts).

Or use Settings → Publish release post (global admin).

### Quick checks

```powershell
npx tsx scripts/format-published-at-tests.ts
```
