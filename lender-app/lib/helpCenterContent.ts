/**
 * Static help center articles and contextual quick tips (no network).
 */

export type HelpCategory =
  | "basics"
  | "tasks"
  | "pipeline"
  | "contacts"
  | "lenders"
  | "documents"
  | "account"
  | "sharing"
  | "events"
  | "operations";

/** Global-admin only — routes, block IDs, component paths. */
export type HelpDeveloperGlossary = {
  routes?: string[];
  blockIds?: string[];
  navIds?: string[];
  componentPaths?: string[];
  notes?: string[];
};

export type HelpArticle = {
  id: string;
  title: string;
  summary: string;
  /** Short paragraphs (plain text). */
  body: string[];
  category: HelpCategory;
  /** Extra tokens for search (routes, synonyms). */
  keywords?: string[];
  /** Structured encyclopedia sections (user-facing). */
  purpose?: string;
  whatYouCanDo?: string[];
  storedHere?: string[];
  storedElsewhere?: string[];
  relatedArticleIds?: string[];
  developerGlossary?: HelpDeveloperGlossary;
};

export const HELP_CATEGORIES: { id: HelpCategory; label: string }[] = [
  { id: "basics", label: "Basics" },
  { id: "tasks", label: "Tasks" },
  { id: "pipeline", label: "Pipeline & deals" },
  { id: "contacts", label: "Contacts" },
  { id: "lenders", label: "Lenders" },
  { id: "documents", label: "Documents" },
  { id: "sharing", label: "Sharing" },
  { id: "events", label: "Events" },
  { id: "operations", label: "Operations" },
  { id: "account", label: "Account & team" },
];

export const HELP_ARTICLES: HelpArticle[] = [
  {
    id: "workspace-overview",
    title: "How the workspace is organized",
    summary:
      "Tasks, Pipeline, Contacts, and Lenders work together for deal flow and CRM.",
    category: "basics",
    keywords: ["navigation", "menu", "sidebar", "home", "encyclopedia"],
    purpose:
      "Loan Flow Engine is one workspace for referral partners: track deals, people, capital sources, and daily work without switching tools.",
    whatYouCanDo: [
      "Jump between Tasks, Pipeline, Contacts, and Lenders from the nav or mobile bottom bar.",
      "Search everything from the header (⌘K / Ctrl+K).",
      "Open Help anytime with ? or the Help button.",
    ],
    storedHere: ["Your active organization context and navigation preferences."],
    storedElsewhere: [
      "Deal records live in Pipeline files; people in Contacts; capital partners in Lenders.",
    ],
    relatedArticleIds: ["global-search", "pipeline-hub-overview", "settings-hub"],
    body: [
      "Use Tasks for what you need to do today; Pipeline for live deals and stages; Contacts for people; Lenders for your capital-partner directory.",
      "Switch workspace theme under Settings → Appearance (Classic vs SaaS layout). The header search (⌘K / Ctrl+K) finds files, contacts, lenders, and tasks in your active organization.",
    ],
    developerGlossary: {
      navIds: ["tasks", "pipeline", "contacts", "lenders", "settings"],
      routes: ["/tasks", "/pipeline", "/contacts", "/lenders", "/settings"],
    },
  },
  {
    id: "global-search",
    title: "Global search (⌘K)",
    summary: "Search across pipeline files, contacts, lenders, and open tasks.",
    category: "basics",
    keywords: ["keyboard", "shortcut", "find", "command"],
    body: [
      "Open search from the search control in the header or press ⌘K on Mac / Ctrl+K on Windows.",
      "Type at least two characters. Use the chips to filter by files, contacts, lenders, or tasks. You can include archived pipeline files when needed.",
    ],
  },
  {
    id: "tasks-matrix",
    title: "Tasks and the priority matrix",
    summary:
      "Work, personal, and errands use quadrants; link tasks to files and contacts.",
    category: "tasks",
    keywords: ["eisenhower", "quadrant", "due", "reminder", "today"],
    body: [
      "Tasks can be organized by quadrant (urgent/important style). Set due dates and reminders so items surface when you need them.",
      "Link a task to a pipeline file or a CRM contact to jump back to the deal or person from the task detail.",
    ],
  },
  {
    id: "pipeline-files",
    title: "Pipeline files and the deal drawer",
    summary:
      "Each file has a stage, lenders, embedded deal data, and a configurable drawer.",
    category: "pipeline",
    keywords: ["deal", "stage", "status", "drawer", "blocks"],
    purpose:
      "A pipeline file is the operational home for one loan opportunity — stage, lenders, deal math, notes, and linked people.",
    whatYouCanDo: [
      "Update stage and sub-stage as the deal progresses.",
      "Attach and compare lenders; run scenario tools from the drawer.",
      "Link contacts, tasks, and documents from drawer blocks.",
    ],
    storedHere: [
      "Stage, deal fields, file-scoped notes, attached lenders, and drawer block layout for this file.",
    ],
    storedElsewhere: [
      "Global contact records (Contacts); lender directory rows (Lenders); org-wide pipeline defaults (Settings → Pipeline admin).",
    ],
    relatedArticleIds: ["pipeline-hub-overview", "pipeline-file-workspace", "lenders-directory"],
    body: [
      "Pipeline files represent opportunities. Update the stage as the deal progresses; attach lenders you are shopping or have selected.",
      "The drawer holds structured deal fields, notes, scenario tools, and more — layout can be tuned in Settings for new files and by admins globally.",
    ],
    developerGlossary: {
      routes: ["/pipeline/[fileId]"],
      blockIds: [
        "fileDetails",
        "dealWorkspace",
        "lenders",
        "contacts",
        "scenarioMatch",
        "tasks",
      ],
      componentPaths: [
        "components/pipeline/drawer/*",
        "app/pipeline/[fileId]/*",
      ],
    },
  },
  {
    id: "contacts-crm",
    title: "Contacts and linking",
    summary:
      "Standalone contacts, CRM roles, and links to files and lenders.",
    category: "contacts",
    keywords: ["crm", "borrower", "referral", "email"],
    body: [
      "Contacts live in the Contacts area. Assign a CRM contact role and link people to files and lenders.",
      "Link contacts to pipeline files or lenders so context follows the deal — links are visible from the file and contact profiles.",
    ],
  },
  {
    id: "lenders-directory",
    title: "Lenders directory and scenario search",
    summary: "Browse partners and match lenders to deal criteria.",
    category: "lenders",
    keywords: ["browse", "filter", "scenario", "programs"],
    body: [
      "The Lenders area holds your directory — organization visibility depends on how rows are scoped.",
      "Use filters and scenario-style search to narrow programs, geography, or deal shape before attaching lenders to a file.",
    ],
  },
  {
    id: "documents",
    title: "Documents",
    summary: "Library documents and versions for your workspace.",
    category: "documents",
    keywords: ["pdf", "upload", "library", "files"],
    body: [
      "The Documents section is for workspace document workflows — uploads and versions are tied to your account and organization rules.",
      "Link documents to deals or contacts where the product supports it, so everything stays discoverable from search and record pages.",
    ],
  },
  {
    id: "activity-feed",
    title: "Activity feed",
    summary: "Recent changes across files, contacts, lenders, and tasks.",
    category: "basics",
    keywords: ["timeline", "history", "audit"],
    body: [
      "Activity summarizes meaningful events so you can catch up without opening every record.",
      "Open an item from Activity to go straight to the underlying file, contact, or task when linked.",
    ],
  },
  {
    id: "settings-hub",
    title: "Settings hub",
    summary: "Team, appearance, workflow, notifications, and more.",
    category: "account",
    keywords: ["preferences", "theme", "notifications", "billing"],
    body: [
      "Open Settings from the nav or gear control. Sections are grouped: organization, billing, appearance, workflow, pipeline admin, and others.",
      "Most choices persist per user or per team as labeled in each section. Admins see extra controls for membership and org-wide policy.",
    ],
  },
  {
    id: "demo-workspace",
    title: "Demo workspace sample data",
    summary: "Optional labeled demo files, contacts, lenders, and tasks.",
    category: "account",
    keywords: ["sample", "tutorial", "test", "getting started"],
    body: [
      "Under Settings → Getting started you can load a demo bundle: everything is prefixed with [Demo] and can be removed in one action.",
      "Use demo data to explore the product without touching real clients; remove it anytime to keep the workspace clean.",
    ],
  },
  {
    id: "notifications",
    title: "Notifications",
    summary: "In-app alerts and optional email for assignments and mentions.",
    category: "account",
    keywords: ["bell", "email", "mention", "deadline"],
    body: [
      "The bell in the header shows in-app notifications. Tune categories and email under Settings → Notifications.",
      "If email is off, you still see in-app alerts when signed in.",
    ],
  },
  {
    id: "offline-connection",
    title: "Connection status and offline",
    summary: "Live pill and sync banners explain connectivity.",
    category: "basics",
    keywords: ["convex", "network", "sync", "live"],
    body: [
      "The live / connection indicator reflects Convex and local state. If you see an offline banner, changes may queue until you are back online.",
      "Critical actions usually require a live connection; retry after connectivity returns.",
    ],
  },
  {
    id: "pipeline-hub-overview",
    title: "Pipeline hub — list, filters, and projections",
    summary:
      "The /pipeline hub is your deal command center: search, filter, and switch how rows are grouped.",
    category: "pipeline",
    keywords: ["hub", "filter", "projection", "client", "project", "board"],
    purpose:
      "See every active deal in one place, then drill into a file workspace or create new client → project → loan hierarchy.",
    whatYouCanDo: [
      "Search across client, project, loan, and deal fields.",
      "Switch projection mode: Client, Project, Loan File, Lender, Referral, Team, or Task focus.",
      "Filter by stage, status, momentum, capital stack, and involvement.",
      "Expand hierarchy rows and open a file in the full workspace.",
    ],
    storedHere: [
      "Hub view preferences (projection mode, filters, expansion) in browser storage for your device.",
    ],
    storedElsewhere: [
      "Authoritative deal data on each pipeline file record; analytics and ledger on their routes.",
    ],
    relatedArticleIds: ["pipeline-files", "pipeline-file-workspace"],
    body: [
      "Open Pipeline from the nav. The hub toolbar combines search with a projection switcher — each mode reorganizes the same deals around a different lens (e.g. by client entity vs. by lender).",
      "Use stage and status chips to narrow the list. Archived and snoozed files can be toggled when you need historical context.",
      "Click a row to open the file workspace, or use inline create flows to add clients, projects, or loans without leaving the hub.",
    ],
    developerGlossary: {
      routes: ["/pipeline"],
      navIds: ["pipeline_hub", "pipeline"],
      componentPaths: ["app/pipeline/PipelinePageClient.tsx"],
      notes: [
        "Projection modes: client, project, file, lender, referral, team, task",
        "Persistence: pipelineHubPersistence.ts localStorage keys",
      ],
    },
  },
  {
    id: "pipeline-file-workspace",
    title: "Pipeline file workspace",
    summary:
      "The full-screen file route is where you work a single deal — blocks, sheet layout, and workspace scroll.",
    category: "pipeline",
    keywords: ["workspace", "sheet", "blocks", "file route", "wide"],
    purpose:
      "Deep work on one pipeline file: deal blocks, inspectors, and utilities without the hub list in the way.",
    whatYouCanDo: [
      "Reorder and collapse drawer/workspace blocks for this file.",
      "Open task or lender inspectors as overlays.",
      "Scroll the workspace sheet — the app header stays fixed.",
    ],
    storedHere: [
      "Per-file block order, collapse state, and in-workspace edits.",
    ],
    storedElsewhere: [
      "Hub list filters and projection mode (/pipeline); org-wide block defaults (Settings).",
    ],
    relatedArticleIds: ["pipeline-files", "pipeline-hub-overview"],
    body: [
      "When you open a file from the hub, the URL moves to /pipeline/[fileId]. The workspace uses a dedicated scroll area so the deal sheet feels like a focused surface.",
      "Utilities and blocks may start collapsed — expand what you need. Task and record inspectors open as overlays and do not take over page scroll.",
      "Use the back control or Pipeline nav to return to the hub list.",
    ],
    developerGlossary: {
      routes: ["/pipeline/[fileId]"],
      notes: [
        "Scroll owner: [data-pipeline-workspace-scroll]",
        "AppChrome main scroll mode: workspace-delegated",
      ],
    },
  },
  {
    id: "sharing-records",
    title: "Shared records and external access",
    summary:
      "The Shared area lists items you have shared or received — links, portals, and collaboration entry points.",
    category: "sharing",
    keywords: ["share", "link", "external", "portal", "collaborate"],
    purpose:
      "Find and manage shared pipeline artifacts without hunting through individual files.",
    whatYouCanDo: [
      "Review what is shared from your organization.",
      "Open shared links you have access to.",
      "Jump back to the underlying file or record when linked.",
    ],
    storedHere: ["Share link metadata and your share inbox for the active org."],
    storedElsewhere: [
      "Underlying file and contact records remain in Pipeline and Contacts.",
    ],
    relatedArticleIds: ["pipeline-files", "settings-hub"],
    body: [
      "Shared appears in the workspace nav. It aggregates share-related workflows so referral partners can see what is in flight externally.",
      "Permissions still apply — you only see shares your role and organization allow.",
    ],
    developerGlossary: {
      routes: ["/shared"],
      navIds: ["shared"],
    },
  },
  {
    id: "events-overview",
    title: "Events",
    summary:
      "Track dates, milestones, and calendar-style items tied to your pipeline work.",
    category: "events",
    keywords: ["calendar", "milestone", "date", "schedule"],
    purpose:
      "See upcoming and past events so deadlines and milestones stay visible beside tasks.",
    whatYouCanDo: [
      "Browse organization events from the Events nav item.",
      "Connect event context back to deals and follow-ups where supported.",
    ],
    storedHere: ["Event records scoped to your organization."],
    storedElsewhere: ["Task due dates and reminders live in Tasks."],
    relatedArticleIds: ["tasks-matrix", "pipeline-hub-overview"],
    body: [
      "Events complements Tasks: use it when you need a calendar-oriented view of what is coming up for the team.",
      "Open Events from the left nav (desktop) or the menu on mobile.",
    ],
    developerGlossary: {
      routes: ["/events"],
      navIds: ["events"],
    },
  },
  {
    id: "operations-overview",
    title: "Operations dashboard",
    summary:
      "Operational metrics and workspace health signals for teams running volume.",
    category: "operations",
    keywords: ["ops", "metrics", "dashboard", "health"],
    purpose:
      "Give admins and operators a cross-deal view of workload and system-facing operational data.",
    whatYouCanDo: [
      "Open Operations from the nav for org-level operational views.",
      "Use alongside Pipeline hub filters when triaging volume.",
    ],
    storedHere: ["Operational aggregates and views for the active organization."],
    storedElsewhere: [
      "Individual deal detail remains on pipeline files; Activity shows recent change feed.",
    ],
    relatedArticleIds: ["activity-feed", "pipeline-hub-overview"],
    body: [
      "Operations is aimed at teams who need a higher-level picture than a single file drawer.",
      "Pair it with Activity when you need both trends and a chronological audit of changes.",
    ],
    developerGlossary: {
      routes: ["/operations"],
      navIds: ["operations"],
    },
  },
];

/** One tip per route prefix (first match wins); `articleId` opens that article from “Learn more”. */
export type QuickRouteTip = {
  id: string;
  routePrefix: string;
  message: string;
  articleId?: string;
};

export const QUICK_ROUTE_TIPS: QuickRouteTip[] = [
  {
    id: "tip-tasks",
    routePrefix: "/tasks",
    message:
      "Tip: Link tasks to a pipeline file or contact from the task details so follow-ups stay tied to the deal.",
    articleId: "tasks-matrix",
  },
  {
    id: "tip-pipeline",
    routePrefix: "/pipeline",
    message:
      "Tip: Switch projection mode on the hub to group deals by client, lender, or team — then open a file for full workspace blocks.",
    articleId: "pipeline-hub-overview",
  },
  {
    id: "tip-shared",
    routePrefix: "/shared",
    message:
      "Tip: Shared collects external links and collaboration entry points — open an item to jump to the underlying record.",
    articleId: "sharing-records",
  },
  {
    id: "tip-events",
    routePrefix: "/events",
    message:
      "Tip: Use Events for calendar-style milestones; link follow-ups in Tasks when you need assignees and reminders.",
    articleId: "events-overview",
  },
  {
    id: "tip-operations",
    routePrefix: "/operations",
    message:
      "Tip: Operations gives a cross-deal ops view — pair it with Activity for recent changes.",
    articleId: "operations-overview",
  },
  {
    id: "tip-contacts",
    routePrefix: "/contacts",
    message:
      "Tip: Link contacts to files and lenders so borrower and referral context stays in one place.",
    articleId: "contacts-crm",
  },
  {
    id: "tip-lenders",
    routePrefix: "/lenders",
    message:
      "Tip: Narrow the lender list with filters, then attach winners to pipeline files from the deal side.",
    articleId: "lenders-directory",
  },
  {
    id: "tip-documents",
    routePrefix: "/documents",
    message:
      "Tip: Keep deal artifacts in Documents so versions stay organized and searchable.",
    articleId: "documents",
  },
  {
    id: "tip-settings",
    routePrefix: "/settings",
    message:
      "Tip: Press ? (outside a text field) anytime to open Help & support with search.",
    articleId: "settings-hub",
  },
  {
    id: "tip-activity",
    routePrefix: "/activity",
    message:
      "Tip: Activity is a lightweight timeline — open entries to land on the underlying record.",
    articleId: "activity-feed",
  },
];

export function articleById(id: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((a) => a.id === id);
}

export function quickTipForPathname(pathname: string | null): QuickRouteTip | null {
  if (!pathname) return null;
  for (const tip of QUICK_ROUTE_TIPS) {
    if (
      pathname === tip.routePrefix ||
      pathname.startsWith(`${tip.routePrefix}/`)
    ) {
      return tip;
    }
  }
  return null;
}
