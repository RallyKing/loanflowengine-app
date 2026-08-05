import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  intakeFormLinksTable,
  intakeFormsTable,
  intakeSheetsTable,
  shareLinksTable,
} from "./intakeSchemaPart";
import {
  allResourceShareTypeV,
  eventCollaboratorRoleV,
  eventConversionSourceTypeV,
  eventInvitationStatusV,
  eventIdeaStatusV,
  eventItemActivityKindV,
  eventPrintKindV,
  eventSectionItemTypeV,
  eventStatusV,
  recurrenceRuleV,
  sourceLineageV,
} from "./events/eventValidators";
import {
  contactBusinessDebtFieldsV,
  contactBusinessEntityFieldsV,
  contactDataEntityTypeV,
  contactReoPropertyFieldsV,
  contactStickyAssetRowV,
  contactStickyIncomeRowV,
  contactStickyLiabilityRowV,
  libraryDocumentCategoryV,
} from "./contactStickyData/validators";
import { entityContactRelationshipRoleV } from "./crmLinkValidators";
import { registryRoleIdV } from "./registryRoleValidators";

export default defineSchema({
  lenders: defineTable({
    source: v.string(),
    section: v.string(),
    company: v.string(),
    contactName: v.string(),
    titleRole: v.string(),
    phone: v.string(),
    email: v.string(),
    website: v.string(),
    entityType: v.string(),
    primaryNiche: v.string(),
    programs: v.string(),
    propertyTypes: v.string(),
    exclusions: v.string(),
    statesServed: v.string(),
    ownerOrInvestor: v.string(),
    fundingAmountMin: v.optional(v.string()),
    fundingAmountMax: v.optional(v.string()),
    /** Legacy / enrichment alias for `fundingAmountMin` / `fundingAmountMax`. */
    loanAmountMin: v.optional(v.string()),
    loanAmountMax: v.optional(v.string()),
    ltv: v.string(),
    interestRates: v.string(),
    amortTerm: v.string(),
    referralFees: v.string(),
    notes: v.string(),
    status: v.string(),
    lastUpdated: v.string(),

    /**
     * Manual override for the lender's minimum FICO score. When set to a
     * numeric string (e.g. "680"), scenario matching uses this value as the
     * authoritative floor instead of regex-extracted or entity-type-inferred
     * minimums. Empty string means "no manual override".
     */
    minFico: v.optional(v.string()),

    /**
     * Structured list of programs this lender offers. Each program has its
     * own name, optional minimum FICO, and free-text requirements (e.g.
     * "2yr seasoning", "DSCR >= 1.1", "No first-time investors"). When a
     * broker filters by funding type during scenario search, we match against
     * both the free-text `programs` string AND this structured list so we
     * can use a per-program FICO floor instead of the lender-wide one.
     */
    programList: v.optional(
      v.array(
        v.object({
          name: v.string(),
          minFico: v.optional(v.string()),
          requirements: v.optional(v.string()),
        })
      )
    ),

    /**
     * Additional contacts beyond the primary one stored in
     * contactName/titleRole/phone/email. Use this for multi-contact
     * lenders (e.g. intake + closing + sales).
     */
    contacts: v.optional(
      v.array(
        v.object({
          name: v.string(),
          titleRole: v.optional(v.string()),
          phone: v.optional(v.string()),
          email: v.optional(v.string()),
          notes: v.optional(v.string()),
        })
      )
    ),

    /**
     * Additional company-level phone numbers — main line, toll-free, fax,
     * loan intake, etc. Each entry: { label, phone }.
     */
    phoneNumbers: v.optional(
      v.array(
        v.object({
          label: v.optional(v.string()),
          phone: v.string(),
        })
      )
    ),

    /**
     * Broker's personal rating of this lender (0-5). 0 / undefined means
     * "not rated". Higher ratings boost the lender's score in scenario
     * search so trusted partners surface first.
     */
    rating: v.optional(v.number()),
    ratingNotes: v.optional(v.string()),

    /**
     * Last time this lender was auto-enriched from web search. Used by the
     * bulk enrichment pass so we don't re-hit the LLM on rows that were
     * recently enriched.
     */
    enrichedAt: v.optional(v.number()),
    enrichmentStatus: v.optional(v.string()),
    enrichmentSources: v.optional(v.array(v.string())),

    // Normalized fields for fast dedupe lookups
    companyKey: v.string(),
    emailKey: v.string(),
    contactKey: v.string(),

    /**
     * When true, row is missing both programs and niche (or equivalent).
     * Indexed with `enrichedAt` for fast `listIncomplete` + enrich ordering.
     */
    incompleteData: v.optional(v.boolean()),

    /**
     * Denormalized lowercased blob (see `lenderSearchText.buildLenderSearchBlob`).
     * Drives `lender_scenario` + faster `matchScenario` when funding-type keywords are set.
     */
    searchText: v.optional(v.string()),

    createdAt: v.number(),
    updatedAt: v.number(),

    /**
     * When set, this lender row is scoped to one organization (team-private).
     * When unset, the row is part of the global catalog (legacy / shared directory).
     */
    organizationId: v.optional(v.id("organizations")),

    /**
     * When set with `organizationId`, this row belongs to a removable demo bundle
     * (see Settings → Getting started).
     */
    demoBundleId: v.optional(v.string()),
  })
    .index("by_company", ["companyKey"])
    .index("by_email", ["emailKey"])
    .index("by_company_email", ["companyKey", "emailKey"])
    .index("by_company_contact", ["companyKey", "contactKey"])
    .index("by_entityType", ["entityType"])
    .index("by_entity_section", ["entityType", "section"])
    .index("by_incomplete_enriched", ["incompleteData", "enrichedAt"])
    .index("by_organization", ["organizationId"])
    .index("by_org_demoBundle", ["organizationId", "demoBundleId"])
    .searchIndex("search_all", {
      searchField: "company",
      filterFields: ["entityType", "section"],
    })
    .searchIndex("lender_scenario", { searchField: "searchText" })
    .searchIndex("global_entity", {
      searchField: "searchText",
      filterFields: ["organizationId"],
    }),

  /**
   * O(1) aggregate counts for browse stats. Kept in sync from lender
   * mutations so `lenders.stats` does not scan the full table on every update.
   */
  lenderStats: defineTable({
    key: v.literal("singleton"),
    total: v.number(),
    byEntity: v.record(v.string(), v.number()),
    bySection: v.record(v.string(), v.number()),
    incompleteCount: v.number(),
  }).index("by_key", ["key"]),

  /**
   * Single-row global policy for pipeline drawer blocks (admin “control panel”).
   * Seeded on first save from Settings → Pipeline admin.
   */
  pipelineGlobalBlockConfig: defineTable({
    key: v.literal("singleton"),
    /** Blocks removed from the product for every file (not rendered). */
    disabledBlockIds: v.array(v.string()),
    /**
     * Extra block ids that may not be hidden in the drawer (union with registry
     * `isMandatory`).
     */
    adminRequiredBlockIds: v.array(v.string()),
    /** Default `fileDrawerLayout` for newly created pipeline rows. */
    newFileDrawerLayout: v.object({
      v: v.literal(1),
      order: v.array(v.string()),
      hidden: v.array(v.string()),
      expanded: v.optional(v.record(v.string(), v.boolean())),
      settings: v.optional(v.record(v.string(), v.any())),
    }),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  /**
   * Per-account customization (blocks, order, collapse, display/behavior JSON).
   * `accountId` is a stable browser-provisioned id until real auth maps here.
   * **Does not** mutate pipeline rows or per-file drawer layout — load/merge in
   * feature code when you intentionally apply these prefs.
   */
  userPreferences: defineTable({
    accountId: v.string(),
    updatedAt: v.number(),
    formatVersion: v.literal(1),
    defaultBlocks: v.array(v.string()),
    blockOrder: v.array(v.string()),
    collapseBehavior: v.union(
      v.literal("all_open"),
      v.literal("all_closed"),
      v.literal("smart"),
    ),
    displaySettings: v.any(),
    behaviorSettings: v.any(),
    /** Per-block drawer settings merged onto new pipeline files for this account only. */
    newFileDrawerSettings: v.optional(v.any()),
    /** Phase Modular-D: pinned pipeline block ids for the file favorites quick-access bar. */
    favoriteFileBlocks: v.optional(v.array(v.string())),
    gettingStartedDismissed: v.optional(v.boolean()),
    gettingStartedComplete: v.optional(v.boolean()),
    gettingStartedSkipped: v.optional(v.boolean()),
  }).index("by_accountId", ["accountId"]),

  /**
   * Per-account adaptive navigation overrides (order, visibility, preset).
   */
  navigationUserConfig: defineTable({
    accountId: v.string(),
    updatedAt: v.number(),
    formatVersion: v.union(v.literal(1), v.literal(2)),
    preset: v.union(
      v.literal("admin"),
      v.literal("analyst"),
      v.literal("viewer"),
      v.literal("sales"),
      v.literal("processor"),
      v.literal("manager"),
    ),
    overrides: v.array(
      v.object({
        id: v.string(),
        visible: v.optional(v.boolean()),
        order: v.optional(v.number()),
        pinned: v.optional(v.boolean()),
        iconKey: v.optional(v.string()),
      }),
    ),
    quickActions: v.optional(
      v.array(
        v.object({
          id: v.string(),
          label: v.string(),
          href: v.string(),
          catalogId: v.optional(v.string()),
          iconKey: v.optional(v.string()),
          order: v.optional(v.number()),
        }),
      ),
    ),
    syncScope: v.optional(
      v.union(v.literal("cloud"), v.literal("device")),
    ),
    navLayoutMode: v.optional(
      v.union(v.literal("compact"), v.literal("expanded")),
    ),
  }).index("by_accountId", ["accountId"]),

  /**
   * Getting-started checklist for authenticated users (Clerk `subject`).
   * Progress steps are inferred in the client; this row stores skip / collapsed only.
   */
  userOnboarding: defineTable({
    /** Clerk user id (`identity.subject`). */
    userKey: v.string(),
    /** User chose “Skip for now” — checklist stays hidden until resumed from Settings. */
    skipped: v.optional(v.boolean()),
    /** Compact chip mode while checklist is incomplete. */
    collapsed: v.optional(v.boolean()),
    gettingStartedDismissed: v.optional(v.boolean()),
    updatedAt: v.number(),
  }).index("by_userKey", ["userKey"]),

  /**
   * Per-account “simple workflows” (trigger → action). Executed on the server
   * only for whitelisted triggers/actions; see `userSimpleWorkflowExecutor`.
   */
  userSimpleWorkflows: defineTable({
    accountId: v.string(),
    updatedAt: v.number(),
    formatVersion: v.literal(1),
    rules: v.array(
      v.object({
        id: v.string(),
        enabled: v.boolean(),
        name: v.optional(v.string()),
        trigger: v.union(
          v.object({ type: v.literal("file_created") }),
          v.object({ type: v.literal("lender_selected") }),
          v.object({ type: v.literal("lender_attached") })
        ),
        action: v.union(
          v.object({
            type: v.literal("show_drawer_block"),
            blockId: v.string(),
          }),
          v.object({
            type: v.literal("create_task_reminder"),
            title: v.string(),
            body: v.optional(v.string()),
          }),
          v.object({
            type: v.literal("enqueue_integration_job"),
            category: v.union(
              v.literal("crm"),
              v.literal("email"),
              v.literal("messaging"),
            ),
            providerKey: v.string(),
            kind: v.union(v.literal("action"), v.literal("sync_push")),
            connectorPublicId: v.optional(v.string()),
          }),
          v.object({
            type: v.literal("emit_automation_webhook"),
            includeFileSnapshot: v.boolean(),
          }),
        ),
      })
    ),
  }).index("by_accountId", ["accountId"]),

  /**
   * Organization / team root. Identified workers use `organizationMembers.userKey`
   * (today: browser `accountId`; later: auth subject).
   */
  organizations: defineTable({
    name: v.string(),
    /**
     * Product tier for feature gating (manual assignment until billing is wired).
     * Omitted historic rows behave as `basic` in code paths that normalize.
     */
    plan: v.optional(
      v.union(
        v.literal("basic"),
        v.literal("pro"),
        v.literal("enterprise"),
      ),
    ),
    /**
     * When `stripe`, `plan` is synced from the active subscription (webhooks).
     * `manual` or unset: plan may be set in UI without Stripe.
     */
    planSource: v.optional(
      v.union(v.literal("manual"), v.literal("stripe")),
    ),
    /** Stripe Customer id (`cus_…`). Set on first checkout or webhook. */
    stripeCustomerId: v.optional(v.string()),
    /** Active subscription id (`sub_…`), if any. */
    stripeSubscriptionId: v.optional(v.string()),
    /** Stripe Subscription.status (e.g. active, trialing, canceled). */
    subscriptionStatus: v.optional(v.string()),
    /**
     * True when Stripe `cancel_at_period_end` is set — access continues until
     * `subscriptionCurrentPeriodEnd` while status may still be `active`.
     */
    subscriptionCancelAtPeriodEnd: v.optional(v.boolean()),
    /** Unix ms — end of current paid period when known. */
    subscriptionCurrentPeriodEnd: v.optional(v.number()),
    /** Last processed Stripe subscription item price id (for debugging). */
    stripePriceId: v.optional(v.string()),
    /** Optional stable slug for deep links (unique enforced in mutations). */
    slug: v.optional(v.string()),
    /**
     * Clerk `org_*` id when this Convex tenant row is synced from Clerk Organizations.
     */
    clerkOrganizationId: v.optional(v.string()),
    /**
     * White-label UI (logo in Convex file storage; colors as `#RRGGBB`).
     * Requires `settings.access` to edit.
     */
    branding: v.optional(
      v.object({
        appName: v.optional(v.string()),
        logoStorageId: v.optional(v.id("_storage")),
        primaryColor: v.optional(v.string()),
        secondaryColor: v.optional(v.string()),
        updatedAt: v.optional(v.number()),
      }),
    ),
    /**
     * When set, this org has loaded the bundled demo dataset (`demoBundleId`
     * on seeded rows matches this value). Cleared when demo data is removed.
     */
    demoWorkspaceBundleId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_clerk_organization", ["clerkOrganizationId"])
    .index("by_stripe_customer", ["stripeCustomerId"]),

  /**
   * Internal username/password accounts. `memberUserKey` in org APIs is the `authUsers` id.
   */
  authUsers: defineTable({
    normalizedUsername: v.string(),
    usernameNormalized: v.optional(v.string()),
    displayUsername: v.string(),
    passwordHash: v.string(),
    email: v.optional(v.string()),
    emailVerifiedAt: v.optional(v.number()),
    emailVerificationRequired: v.optional(v.boolean()),
    accountLockedUntilMs: v.optional(v.number()),
    accountLockedReason: v.optional(v.string()),
    failedLoginCount: v.optional(v.number()),
    lastFailedLoginAt: v.optional(v.number()),
    credentialVersion: v.number(),
    isGlobalAdmin: v.optional(v.boolean()),
    systemRole: v.optional(
      v.union(v.literal("standard"), v.literal("SUPER_ADMIN")),
    ),
    defaultOrganizationId: v.optional(v.id("organizations")),
    primaryOwner: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_normalizedUsername", ["normalizedUsername"])
    .index("by_usernameNormalized", ["usernameNormalized"])
    .index("by_email", ["email"]),

  authSessions: defineTable({
    userId: v.id("authUsers"),
    publicId: v.string(),
    tokenHash: v.string(),
    previousTokenHash: v.optional(v.string()),
    previousTokenValidUntilMs: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
    lastSeenAt: v.number(),
    absoluteExpiresAtMs: v.number(),
    idleExpiresAtMs: v.number(),
    rememberMe: v.boolean(),
    revokedAtMs: v.optional(v.number()),
    revokeReason: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    ipHint: v.optional(v.string()),
    credentialVersion: v.number(),
    csrfTokenHash: v.string(),
  })
    .index("by_publicId", ["publicId"])
    .index("by_user", ["userId"]),

  /** Immutable login attempts for operator audit (Phase 12). */
  authLoginAudit: defineTable({
    userId: v.optional(v.id("authUsers")),
    normalizedUsernameAttempt: v.optional(v.string()),
    at: v.number(),
    outcome: v.union(v.literal("success"), v.literal("failure")),
    reason: v.optional(v.string()),
    ipHint: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  }).index("by_at", ["at"]).index("by_audit_user", ["userId"]),

  /** Server-side superuser tenant impersonation sessions (Phase 12.2 Step 7). */
  superuserImpersonationSessions: defineTable({
    publicId: v.string(),
    tokenHash: v.string(),
    authSessionPublicId: v.string(),
    initiatorUserId: v.id("authUsers"),
    targetOrganizationId: v.id("organizations"),
    mode: v.union(v.literal("readonly"), v.literal("operator")),
    issuedAt: v.number(),
    expiresAt: v.number(),
    nonce: v.string(),
    revokedAtMs: v.optional(v.number()),
    revokeReason: v.optional(v.string()),
  })
    .index("by_publicId", ["publicId"])
    .index("by_authSessionPublicId", ["authSessionPublicId"])
    .index("by_initiator", ["initiatorUserId"]),

  /** Immutable audit trail for superuser tenant impersonation. */
  superuserImpersonationAudit: defineTable({
    event: v.union(
      v.literal("start"),
      v.literal("stop"),
      v.literal("mutation_blocked"),
      v.literal("mutation_allowed"),
      v.literal("expired"),
      v.literal("logout"),
    ),
    initiatorUserId: v.id("authUsers"),
    impersonationPublicId: v.optional(v.string()),
    targetOrganizationId: v.id("organizations"),
    targetOrganizationName: v.optional(v.string()),
    mode: v.optional(v.union(v.literal("readonly"), v.literal("operator"))),
    durationMs: v.optional(v.number()),
    mutationPath: v.optional(v.string()),
    detail: v.optional(v.string()),
    at: v.number(),
  })
    .index("by_initiator_at", ["initiatorUserId", "at"])
    .index("by_target_org_at", ["targetOrganizationId", "at"]),

  authPasswordResetTokens: defineTable({
    userId: v.id("authUsers"),
    tokenHash: v.string(),
    expiresAtMs: v.number(),
    createdAt: v.number(),
    usedAtMs: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_tokenHash", ["tokenHash"]),

  authEmailVerificationTokens: defineTable({
    userId: v.id("authUsers"),
    tokenHash: v.string(),
    expiresAtMs: v.number(),
    createdAt: v.number(),
    usedAtMs: v.optional(v.number()),
  }).index("by_user", ["userId"]),

  authRateBuckets: defineTable({
    key: v.string(),
    windowStartMs: v.number(),
    count: v.number(),
  }).index("by_key_window", ["key", "windowStartMs"]),

  /**
   * Custom hostnames (e.g. app.client.com) mapped to an organization after DNS verify.
   * SSL is issued by the hosting provider (e.g. Vercel) once DNS targets the deployment.
   */
  organizationCustomDomains: defineTable({
    organizationId: v.id("organizations"),
    /** FQDN, normalized lowercase (no scheme, no trailing dot). */
    hostname: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("active"),
      v.literal("disabled"),
    ),
    /** Proves control via TXT at `_lender-verify.<hostname>`. */
    verificationToken: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    verifiedAt: v.optional(v.number()),
  })
    .index("by_hostname", ["hostname"])
    .index("by_organization", ["organizationId"]),

  /**
   * Membership: links a `userKey` string to one organization with a role.
   */
  organizationMembers: defineTable({
    organizationId: v.id("organizations"),
    /**
     * Caller identity key — currently the client `UserPreferences` account id.
     * Replace with Convex Auth user id when auth ships.
     */
    userKey: v.string(),
    /**
     * Tenant administration: ownership and invite policy (legacy).
     * `owner` / legacy org `admin` imply broad capabilities; product RBAC uses
     * `assignedRoleId` for normal members.
     */
    role: v.union(
      v.literal("owner"),
      v.literal("admin"),
      v.literal("member"),
    ),
    /**
     * Product RBAC role (Admin / Manager / User presets or a custom role row).
     * When unset for `member`, the "user" preset applies once roles are seeded.
     */
    assignedRoleId: v.optional(v.id("organizationRoles")),
    /**
     * When false, member cannot sign in or resolve permissions (Phase 12).
     * Omitted / undefined = active (legacy rows).
     */
    isActive: v.optional(v.boolean()),
    createdAt: v.number(),
  })
    .index("by_org_user", ["organizationId", "userKey"])
    .index("by_user_org", ["userKey", "organizationId"])
    .index("by_organization", ["organizationId"]),

  /**
   * Per-organization role definitions: built-in Admin/Manager/User rows plus
   * arbitrary custom roles (`isSystem: false`). Permissions are `OrgPermission` strings.
   */
  organizationRoles: defineTable({
    organizationId: v.id("organizations"),
    /** Stable slug: `admin` | `manager` | `user` or a custom key. */
    key: v.string(),
    label: v.string(),
    description: v.optional(v.string()),
    permissions: v.array(v.string()),
    isSystem: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_organization_key", ["organizationId", "key"])
    .index("by_organization", ["organizationId"]),

  /**
   * Org-level permission overlays (deny wins after role resolution).
   */
  organizationPermissions: defineTable({
    organizationId: v.id("organizations"),
    permissionKey: v.string(),
    denied: v.boolean(),
    updatedAt: v.number(),
  })
    .index("by_organization_key", ["organizationId", "permissionKey"])
    .index("by_organization", ["organizationId"]),

  /**
   * Org-level navigation policy (enforced visibility).
   */
  organizationNavigationPolicy: defineTable({
    organizationId: v.id("organizations"),
    updatedAt: v.number(),
    formatVersion: v.literal(1),
    enforcedVisibleIds: v.array(v.string()),
    enforcedHiddenIds: v.array(v.string()),
  }).index("by_organization", ["organizationId"]),

  /**
   * Phase 21 — org-level operational settings (task triage palette, etc.).
   * One row per organization; presets are seeded on first read.
   */
  organizationSettings: defineTable({
    organizationId: v.id("organizations"),
    /** Exactly 8 `{ id, label, hexCode }` presets — ids are stable product keys. */
    taskColorPresets: v.array(
      v.object({
        id: v.string(),
        label: v.string(),
        hexCode: v.string(),
      }),
    ),
    /** Phase 25 — CRM contact role catalog (settings-driven). */
    contactRoles: v.optional(
      v.array(
        v.object({
          id: v.string(),
          displayName: v.string(),
          isSystemDefault: v.boolean(),
        }),
      ),
    ),
    /** Phase 32.2 — org-local "Next Morning" snooze preset for task attempts. */
    taskSnoozeDefaults: v.optional(
      v.object({
        timezone: v.string(),
        nextMorningHour: v.number(),
        nextMorningMinute: v.number(),
      }),
    ),
    updatedAt: v.number(),
    updatedByUserKey: v.optional(v.string()),
  }).index("by_organization", ["organizationId"]),

  /**
   * Phase 22 — admin-defined triage labels (maps human label → preset color).
   */
  organizationTriageLabels: defineTable({
    organizationId: v.id("organizations"),
    label: v.string(),
    /** One of the org's 8 task color preset ids (`taskColorPresets`). Legacy fallback when `customHexCode` unset. */
    colorId: v.string(),
    /** Arbitrary `#RRGGBB` highlight — takes precedence over `colorId` preset mapping. */
    customHexCode: v.optional(v.string()),
    /**
     * Phase 24.2A — rollup winner priority among labeled open tasks on a file
     * (higher wins). Independent of preset list order.
     */
    severityWeight: v.optional(v.number()),
    /** Phase 24.2B — composer / manager display order (lower first). */
    sortOrder: v.optional(v.number()),
    /** Phase 24.2B — soft archive; hidden from composer, inactive for new assignments. */
    archivedAt: v.optional(v.number()),
    updatedAt: v.number(),
    updatedByUserKey: v.optional(v.string()),
  }).index("by_organization", ["organizationId"]),

  /**
   * Phase 23 — playbook groups (loan programs, lenders, etc.).
   */
  taskTemplateGroups: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    description: v.optional(v.string()),
    /**
     * Phase Modular-B — lender playbook binding. When set, the group is that
     * lender's task playbook and is suggested when the lender attaches to a file.
     */
    lenderId: v.optional(v.id("lenders")),
    sortOrder: v.optional(v.number()),
    updatedAt: v.number(),
    updatedByUserKey: v.optional(v.string()),
  })
    .index("by_organization", ["organizationId"])
    .index("by_lender", ["lenderId"]),

  /**
   * Phase 23 — task definitions within a playbook group.
   */
  taskTemplates: defineTable({
    organizationId: v.id("organizations"),
    templateGroupId: v.id("taskTemplateGroups"),
    title: v.string(),
    description: v.optional(v.string()),
    triageLabelId: v.optional(v.id("organizationTriageLabels")),
    /** Convex `_storage` blob for template attachment (cloned on apply). */
    attachmentStorageId: v.optional(v.id("_storage")),
    attachmentFileName: v.optional(v.string()),
    attachmentContentType: v.optional(v.string()),
    attachmentSize: v.optional(v.number()),
    sortOrder: v.optional(v.number()),
    updatedAt: v.number(),
    updatedByUserKey: v.optional(v.string()),
  })
    .index("by_group", ["templateGroupId"])
    .index("by_organization", ["organizationId"]),

  /**
   * Per-account named pipeline file templates (drawer blocks / order / defaults).
   * Does not modify built-in catalog templates in code.
   */
  pipelineFileUserTemplates: defineTable({
    accountId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    includedBlocks: v.array(v.string()),
    blockOrder: v.array(v.string()),
    defaultSettings: v.optional(v.any()),
    /** Phase Modular-E: block ids pre-pinned to the favorites quick-access bar. */
    favoriteBlockIds: v.optional(v.array(v.string())),
    /** Phase Modular-E: portal document requests queued when the borrower is invited. */
    portalRequestChecklist: v.optional(
      v.array(
        v.object({
          title: v.string(),
          description: v.optional(v.string()),
          folderName: v.optional(v.string()),
        }),
      ),
    ),
    /** Phase Modular-E: org task-template groups applied on file creation. */
    taskTemplateGroupIds: v.optional(v.array(v.id("taskTemplateGroups"))),
    updatedAt: v.number(),
  }).index("by_accountId", ["accountId"]),

  /** Rich-text document vault creator templates (tokens preserved for reuse). */
  documentVaultTemplates: defineTable({
    organizationId: v.id("organizations"),
    title: v.string(),
    description: v.optional(v.string()),
    bodyHtml: v.string(),
    createdByUserKey: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_updated", ["organizationId", "updatedAt"]),

  /**
   * Org-scoped internal underwriting workflow checklists (Portals & Progress).
   * Applied onto `dealData.workflow[]` — does not replace portal status steps.
   */
  internalWorkflowTemplates: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    description: v.optional(v.string()),
    steps: v.array(
      v.object({
        id: v.string(),
        label: v.string(),
      }),
    ),
    archivedAt: v.optional(v.number()),
    createdByUserKey: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_updated", ["organizationId", "updatedAt"]),

  /**
   * Candidate lenders surfaced by the AI Discovery feature.
   * Users review, edit and either accept (converts to a real `lenders` row)
   * or dismiss each candidate.
   */
  lenderCandidates: defineTable({
    query: v.string(),
    provider: v.string(),
    company: v.string(),
    website: v.string(),
    contactName: v.string(),
    phone: v.string(),
    email: v.string(),
    entityType: v.string(),
    primaryNiche: v.string(),
    programs: v.string(),
    propertyTypes: v.string(),
    statesServed: v.string(),
    fundingAmountMin: v.string(),
    fundingAmountMax: v.string(),
    notes: v.string(),
    sourceUrl: v.string(),
    confidence: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("dismissed"),
      v.literal("duplicate")
    ),
    duplicateOfLenderId: v.optional(v.id("lenders")),
    createdAt: v.number(),
    updatedAt: v.number(),
    companyKey: v.string(),
  })
    .index("by_status", ["status"])
    .index("by_query", ["query"])
    .index("by_company", ["companyKey"]),

  /**
   * Cache of prior discovery runs so the UI can show history and avoid
   * re-running recent queries.
   */
  discoveryRuns: defineTable({
    query: v.string(),
    provider: v.string(),
    candidatesFound: v.number(),
    duplicatesSkipped: v.number(),
    warnings: v.array(v.string()),
    createdAt: v.number(),
  }).index("by_created", ["createdAt"]),

  /**
   * User-uploaded files (PDF, guidelines, term sheets) linked to a lender
   * profile. Blobs live in Convex `_storage`.
   */
  lenderAttachments: defineTable({
    lenderId: v.id("lenders"),
    /** Denormalized from `lenders.organizationId` for strict tenant filtering. */
    organizationId: v.optional(v.id("organizations")),
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.optional(v.string()),
    size: v.optional(v.number()),
    label: v.optional(v.string()),
    /** Free-form notation on the document. */
    notes: v.optional(v.string()),
    /** Optional folder/group label for organizing docs in the lender profile. */
    groupName: v.optional(v.string()),
    /** Preview zoom preference (0.5–2). Viewer UX only. */
    previewScale: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_lender", ["lenderId"])
    .index("by_organization", ["organizationId"])
    .index("by_lender_group", ["lenderId", "groupName"]),

  /**
   * Partner-portal login vault for a lender (URL + username/password).
   * Password/username sealed via AES-GCM when `CLIENT_PORTAL_FIELD_ENCRYPTION_KEY`
   * is set; otherwise stored under org-auth-only Convex access (never logged).
   */
  lenderPortalCredentials: defineTable({
    lenderId: v.id("lenders"),
    organizationId: v.id("organizations"),
    portalUrl: v.optional(v.string()),
    /** Sealed or org-gated username. */
    usernameEnc: v.optional(v.string()),
    /** Sealed or org-gated password — never returned unless revealPassword=true. */
    passwordEnc: v.optional(v.string()),
    notes: v.optional(v.string()),
    updatedAt: v.number(),
    updatedByUserKey: v.optional(v.string()),
  })
    .index("by_lender", ["lenderId"])
    .index("by_organization", ["organizationId"]),

  /**
   * Named filter presets (smart lists) for the Browse view — same fields as
   * `lenders.list` filter arguments, stored for quick recall.
   */
  savedFilterPresets: defineTable({
    name: v.string(),
    search: v.optional(v.string()),
    entityType: v.optional(v.string()),
    section: v.optional(v.string()),
    matchDealAmount: v.optional(v.number()),
    programKeywords: v.optional(v.string()),
    stateCode: v.optional(v.string()),
    minRating: v.optional(v.number()),
    ficoCleared: v.optional(v.number()),
    propertyTypeContains: v.optional(v.string()),
    ownerOrInvestor: v.optional(v.string()),
    lenderMaxAtLeast: v.optional(v.number()),
    lenderMinAtMost: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
    organizationId: v.optional(v.id("organizations")),
  })
    .index("by_name", ["name"])
    .index("by_organization", ["organizationId"]),

  /**
   * Org-scoped configurable pipeline funnel parent stages (Phase 12.1).
   */
  organizationPipelineStages: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    slug: v.string(),
    color: v.string(),
    icon: v.string(),
    order: v.number(),
    isDefault: v.boolean(),
    isArchived: v.boolean(),
    createdBy: v.string(),
    updatedBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_order", ["organizationId", "order"])
    .index("by_organization_slug", ["organizationId", "slug"]),

  /**
   * Nested sub-stages under a parent org pipeline stage (Phase 12.1).
   */
  organizationPipelineSubStages: defineTable({
    organizationId: v.id("organizations"),
    parentStageId: v.id("organizationPipelineStages"),
    name: v.string(),
    slug: v.string(),
    order: v.number(),
    color: v.string(),
    isArchived: v.boolean(),
    createdBy: v.string(),
    updatedBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_parent", ["parentStageId"])
    .index("by_parent_order", ["parentStageId", "order"]),

  /**
   * Loan / deal pipeline — one row per file or opportunity. `status` is a free
   * string; use a consistent set of stage names in the app (e.g. "Lead",
   * "Application", "Underwriting", "Approved", "Funded", "Closed", "Dead").
   * `tasks.relatedFileId` may point at a pipeline row.
   *
   * **Ownership model** (see `lib/deal/canonicalDataModel.ts`): deal/borrower
   * payload fields live in **`dealData`** (same shape as `intakeSheets`). The
   * pipeline row holds workflow, lender list, fee shell, scenario-match scratch
   * fields, and a **stored** `fundingAmount` that is kept aligned with the deal when
   * a derived amount exists.
   */
  /**
   * Phase 13.3 — normalized client entity (parent of projects and loan files).
   * Legacy pipeline rows may omit FKs until backfill; reads synthesize from `dealData`.
   */
  clients: defineTable({
    organizationId: v.id("organizations"),
    ownerUserId: v.string(),
    ownerUserKey: v.string(),
    displayName: v.string(),
    normalizedName: v.string(),
    /** Canonical CRM person for this client — display name derives from this contact. */
    primaryContactId: v.optional(v.id("contacts")),
    primaryContactName: v.optional(v.string()),
    primaryContactEmail: v.optional(v.string()),
    primaryContactPhone: v.optional(v.string()),
    companyName: v.optional(v.string()),
    /** Phase CRM-3 — corporate KYC metadata for business entities. */
    entityType: v.optional(
      v.union(
        v.literal("llc"),
        v.literal("s_corp"),
        v.literal("c_corp"),
        v.literal("partnership"),
        v.literal("sole_proprietorship"),
      ),
    ),
    ein: v.optional(v.string()),
    stateOfIncorporation: v.optional(v.string()),
    dateOfFormation: v.optional(v.number()),
    /** When true, org-wide share defaults may apply to child projects/files (future). */
    inheritOrgSharingDefaults: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_org_normalized", ["organizationId", "normalizedName"])
    .index("by_org_owner", ["organizationId", "ownerUserId"])
    .searchIndex("entity_search", {
      searchField: "displayName",
      filterFields: ["organizationId"],
    }),

  /**
   * Phase 13.3 — project under a client (parent of one or more loan files).
   */
  projects: defineTable({
    clientId: v.id("clients"),
    organizationId: v.id("organizations"),
    ownerUserId: v.string(),
    ownerUserKey: v.string(),
    title: v.string(),
    normalizedTitle: v.string(),
    purpose: v.optional(v.string()),
    status: v.union(
      v.literal("active"),
      v.literal("on_hold"),
      v.literal("completed"),
      v.literal("cancelled"),
    ),
    targetFunding: v.optional(v.number()),
    /** Optional stored progress; rollups may recompute from child files. */
    completionPercent: v.optional(v.number()),
    /** Client workspace display order (lower first). */
    workspaceSortOrder: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_client", ["clientId"])
    .index("by_organization", ["organizationId"])
    .index("by_org_client", ["organizationId", "clientId"])
    .index("by_org_owner", ["organizationId", "ownerUserId"]),

  /**
   * Phase 14 Step 1 — secondary (and mirrored primary) client ↔ project links.
   * `projects.clientId` remains the authoritative primary FK.
   */
  projectClients: defineTable({
    organizationId: v.id("organizations"),
    projectId: v.id("projects"),
    clientId: v.id("clients"),
    relationshipType: v.union(
      v.literal("primary"),
      v.literal("coborrower"),
      v.literal("guarantor"),
      v.literal("entity"),
      v.literal("sponsor"),
      v.literal("partner"),
      v.literal("other"),
    ),
    sortOrder: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_client", ["clientId"])
    .index("by_org_client", ["organizationId", "clientId"])
    .index("by_project_client", ["projectId", "clientId"]),

  /**
   * Phase 55.4 — business entity ↔ parent client links (client workspace tier).
   * Links other `clients` rows as entities/coborrowers/etc. on the parent client.
   */
  clientEntityLinks: defineTable({
    organizationId: v.id("organizations"),
    clientId: v.id("clients"),
    linkedClientId: v.id("clients"),
    relationshipType: v.union(
      v.literal("coborrower"),
      v.literal("guarantor"),
      v.literal("entity"),
      v.literal("sponsor"),
      v.literal("partner"),
      v.literal("other"),
    ),
    sortOrder: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_client", ["clientId"])
    .index("by_linked_client", ["linkedClientId"])
    .index("by_org_client", ["organizationId", "clientId"])
    .index("by_client_linked", ["clientId", "linkedClientId"]),

  /**
   * Phase 55.4 — secondary CRM contacts linked to a parent client (not primary).
   */
  clientContactLinks: defineTable({
    organizationId: v.id("organizations"),
    clientId: v.id("clients"),
    contactId: v.id("contacts"),
    role: v.string(),
    /** Phase Registry-1 — canonical junction role id. */
    registryRoleId: v.optional(registryRoleIdV),
    /** @deprecated Phase Registry-1 — use `registryRoleId`. */
    contactRoleId: v.optional(v.string()),
    notes: v.optional(v.string()),
    sortOrder: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_client", ["clientId"])
    .index("by_contact", ["contactId"])
    .index("by_client_contact", ["clientId", "contactId"]),

  /**
   * Phase CRM-1 — business entity (clients row) ↔ individual (contacts row) junction.
   * Distinct from clientContactLinks (parent client group) — this ties people to entity records.
   */
  entityContactLinks: defineTable({
    organizationId: v.id("organizations"),
    /** Business entity stored in `clients`. */
    entityId: v.id("clients"),
    /** Individual CRM contact. */
    contactId: v.id("contacts"),
    /** Title at the entity (Owner, President, CFO, …). */
    position: v.string(),
    /** Phase Registry-1 — canonical role id (see `lib/registry/universalRoles.ts`). */
    registryRoleId: v.optional(registryRoleIdV),
    /**
     * @deprecated Phase Registry-1 — use `registryRoleId`; retained for unmigrated rows.
     */
    relationshipRole: entityContactRelationshipRoleV,
    /** Ownership stake at this entity (0–100). Canonical with entity portfolio links. */
    ownershipPercentage: v.optional(v.number()),
    /** @deprecated Phase CRM-4 — marks the individual's primary employer / company affiliation. */
    isPrimaryCompany: v.optional(v.boolean()),
    sortOrder: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_entity", ["entityId"])
    .index("by_contact", ["contactId"])
    .index("by_organization", ["organizationId"])
    .index("by_org_entity", ["organizationId", "entityId"])
    .index("by_entity_contact", ["entityId", "contactId"]),

  /**
   * Phase CRM overhaul — individual ↔ individual person-to-person relationships.
   */
  individualContactLinks: defineTable({
    organizationId: v.id("organizations"),
    contactId1: v.id("contacts"),
    contactId2: v.id("contacts"),
    /** e.g. Spouse, Business Partner, Referral Source */
    relationshipType: v.string(),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_contact1", ["contactId1"])
    .index("by_contact2", ["contactId2"])
    .index("by_organization", ["organizationId"])
    .index("by_org_contact1", ["organizationId", "contactId1"])
    .index("by_org_contact2", ["organizationId", "contactId2"])
    .index("by_contact_pair", ["contactId1", "contactId2"]),

  /**
   * Phase 14 Step 1 — secondary (and mirrored primary) client ↔ loan file links.
   * `pipeline.clientId` remains the authoritative primary FK.
   */
  loanClients: defineTable({
    organizationId: v.id("organizations"),
    pipelineId: v.id("pipeline"),
    clientId: v.id("clients"),
    relationshipType: v.union(
      v.literal("primary"),
      v.literal("coborrower"),
      v.literal("guarantor"),
      v.literal("entity"),
      v.literal("sponsor"),
      v.literal("partner"),
      v.literal("other"),
    ),
    sortOrder: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_pipeline", ["pipelineId"])
    .index("by_client", ["clientId"])
    .index("by_org_client", ["organizationId", "clientId"])
    .index("by_pipeline_client", ["pipelineId", "clientId"]),

  /**
   * Phase 15 Step 2 — indexed graph edges (file ↔ entity). Additive; dual-read with
   * legacy FKs (`pipeline.clientId`, `pipeline.projectId`, `pipeline.lenders[]`) and
   * Phase 14 `loanClients`. Edges do not grant ACL.
   */
  fileClients: defineTable({
    organizationId: v.id("organizations"),
    fileId: v.id("pipeline"),
    clientId: v.id("clients"),
    relationshipType: v.union(
      v.literal("primary"),
      v.literal("coborrower"),
      v.literal("guarantor"),
      v.literal("entity"),
      v.literal("sponsor"),
      v.literal("partner"),
      v.literal("other"),
    ),
    sortOrder: v.number(),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_file", ["fileId"])
    .index("by_entity", ["clientId"])
    .index("by_file_entity", ["fileId", "clientId"])
    .index("by_org_entity", ["organizationId", "clientId"]),

  fileProjects: defineTable({
    organizationId: v.id("organizations"),
    fileId: v.id("pipeline"),
    projectId: v.id("projects"),
    relationshipType: v.union(
      v.literal("primary"),
      v.literal("secondary"),
      v.literal("related"),
      v.literal("other"),
    ),
    sortOrder: v.number(),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_file", ["fileId"])
    .index("by_entity", ["projectId"])
    .index("by_file_entity", ["fileId", "projectId"])
    .index("by_org_entity", ["organizationId", "projectId"]),

  fileLenders: defineTable({
    organizationId: v.id("organizations"),
    fileId: v.id("pipeline"),
    lenderId: v.id("lenders"),
    relationshipType: v.union(
      v.literal("quoted"),
      v.literal("selected"),
      v.literal("submitted"),
      v.literal("declined"),
      /** Phase Modular-B — syndication / partner-group deal structures. */
      v.literal("syndication_partner"),
      v.literal("sub_lender"),
      v.literal("partner_group"),
      v.literal("other"),
    ),
    /** Phase 26.1 — operator reason when `relationshipType` is `declined`. */
    rejectionReason: v.optional(v.string()),
    /**
     * Phase Modular-B — loan program chosen for this file from the lender's
     * `programList` (matched by program name).
     */
    selectedProgramName: v.optional(v.string()),
    /** Lender representative (contact) handling this file for the institution. */
    contactRepId: v.optional(v.id("contacts")),
    sortOrder: v.number(),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_file", ["fileId"])
    .index("by_entity", ["lenderId"])
    .index("by_file_entity", ["fileId", "lenderId"])
    .index("by_org_entity", ["organizationId", "lenderId"]),

  /**
   * Phase Modular-C — construction budget lines for a pipeline file
   * (`constructionBudget` block). Amounts are strings to match the sticky-data
   * money-field convention across the CRM.
   */
  constructionBudgetLines: defineTable({
    organizationId: v.optional(v.id("organizations")),
    fileId: v.id("pipeline"),
    category: v.string(),
    description: v.optional(v.string()),
    budgetAmount: v.optional(v.string()),
    spentAmount: v.optional(v.string()),
    drawNumber: v.optional(v.string()),
    status: v.union(
      v.literal("planned"),
      v.literal("in_progress"),
      v.literal("complete"),
      v.literal("on_hold"),
    ),
    sortOrder: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_file", ["fileId"])
    .index("by_file_sort", ["fileId", "sortOrder"])
    .index("by_organization", ["organizationId"]),

  fileReferralPartners: defineTable({
    organizationId: v.id("organizations"),
    fileId: v.id("pipeline"),
    contactId: v.id("contacts"),
    relationshipType: v.union(
      v.literal("referral"),
      v.literal("introducer"),
      v.literal("broker"),
      v.literal("other"),
    ),
    sortOrder: v.number(),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_file", ["fileId"])
    .index("by_entity", ["contactId"])
    .index("by_file_entity", ["fileId", "contactId"])
    .index("by_org_entity", ["organizationId", "contactId"]),

  fileTeamMembers: defineTable({
    organizationId: v.id("organizations"),
    fileId: v.id("pipeline"),
    userKey: v.string(),
    relationshipType: v.union(
      v.literal("assignee"),
      v.literal("shared"),
      v.literal("watcher"),
      v.literal("other"),
    ),
    sortOrder: v.number(),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_file", ["fileId"])
    .index("by_entity", ["userKey"])
    .index("by_file_entity", ["fileId", "userKey"])
    .index("by_org_entity", ["organizationId", "userKey"]),

  fileTasks: defineTable({
    organizationId: v.id("organizations"),
    fileId: v.id("pipeline"),
    taskId: v.id("tasks"),
    relationshipType: v.union(
      v.literal("related"),
      v.literal("blocked_by"),
      v.literal("follow_up"),
      v.literal("other"),
    ),
    sortOrder: v.number(),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_file", ["fileId"])
    .index("by_entity", ["taskId"])
    .index("by_file_entity", ["fileId", "taskId"])
    .index("by_org_entity", ["organizationId", "taskId"]),

  /**
   * Phase 15 Step 2 — project-scoped graph edges (additive).
   */
  projectLenders: defineTable({
    organizationId: v.id("organizations"),
    projectId: v.id("projects"),
    lenderId: v.id("lenders"),
    relationshipType: v.union(
      v.literal("quoted"),
      v.literal("selected"),
      v.literal("target"),
      v.literal("other"),
    ),
    sortOrder: v.number(),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_entity", ["lenderId"])
    .index("by_project_entity", ["projectId", "lenderId"])
    .index("by_org_entity", ["organizationId", "lenderId"]),

  projectReferralPartners: defineTable({
    organizationId: v.id("organizations"),
    projectId: v.id("projects"),
    contactId: v.id("contacts"),
    relationshipType: v.union(
      v.literal("referral"),
      v.literal("introducer"),
      v.literal("broker"),
      v.literal("other"),
    ),
    sortOrder: v.number(),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_entity", ["contactId"])
    .index("by_project_entity", ["projectId", "contactId"])
    .index("by_org_entity", ["organizationId", "contactId"]),

  projectTeamMembers: defineTable({
    organizationId: v.id("organizations"),
    projectId: v.id("projects"),
    userKey: v.string(),
    relationshipType: v.union(
      v.literal("owner"),
      v.literal("assignee"),
      v.literal("shared"),
      v.literal("other"),
    ),
    sortOrder: v.number(),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_entity", ["userKey"])
    .index("by_project_entity", ["projectId", "userKey"])
    .index("by_org_entity", ["organizationId", "userKey"]),

  projectTasks: defineTable({
    organizationId: v.id("organizations"),
    projectId: v.id("projects"),
    taskId: v.id("tasks"),
    relationshipType: v.union(
      v.literal("related"),
      v.literal("milestone"),
      v.literal("follow_up"),
      v.literal("other"),
    ),
    sortOrder: v.number(),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_entity", ["taskId"])
    .index("by_project_entity", ["projectId", "taskId"])
    .index("by_org_entity", ["organizationId", "taskId"]),

  /**
   * Phase 14 Step 3 — capital required per project.
   */
  projectCapitalRequirements: defineTable({
    organizationId: v.id("organizations"),
    projectId: v.id("projects"),
    capitalType: v.union(
      v.literal("acquisition"),
      v.literal("rehab"),
      v.literal("refinance"),
      v.literal("working_capital"),
      v.literal("bridge"),
      v.literal("LOC"),
      v.literal("term"),
      v.literal("equity"),
      v.literal("other"),
    ),
    requiredAmount: v.number(),
    priorityOrder: v.number(),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_org_project", ["organizationId", "projectId"]),

  /**
   * Phase 14 Step 3 — funding sources (optional link to loan file).
   */
  projectCapitalSources: defineTable({
    organizationId: v.id("organizations"),
    projectId: v.id("projects"),
    pipelineId: v.optional(v.id("pipeline")),
    sourceType: v.union(
      v.literal("loan"),
      v.literal("LOC"),
      v.literal("term_loan"),
      v.literal("equity"),
      v.literal("cash"),
      v.literal("mezzanine"),
      v.literal("bridge"),
      v.literal("other"),
    ),
    committedAmount: v.number(),
    approvedAmount: v.number(),
    fundedAmount: v.number(),
    status: v.union(
      v.literal("planned"),
      v.literal("sourcing"),
      v.literal("approved"),
      v.literal("funded"),
      v.literal("failed"),
    ),
    sortOrder: v.number(),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_pipeline", ["pipelineId"])
    .index("by_org_project", ["organizationId", "projectId"]),

  /**
   * Phase 14 Step 3 — partial allocation of a source toward requirements.
   */
  projectCapitalAllocations: defineTable({
    organizationId: v.id("organizations"),
    projectId: v.id("projects"),
    requirementId: v.id("projectCapitalRequirements"),
    sourceId: v.id("projectCapitalSources"),
    allocatedAmount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_source", ["sourceId"])
    .index("by_requirement", ["requirementId"])
    .index("by_source_requirement", ["sourceId", "requirementId"]),

  pipeline: defineTable({
    fileName: v.string(),
    /**
     * Optional link to a legacy `intakeSheets` row. New files store the full
     * intake-shaped document on this row via `dealData` instead; when both
     * are set, readers prefer `dealData` and `patchDeal` keeps the legacy row
     * in sync until the link is removed.
     */
    intakeSheetId: v.optional(v.id("intakeSheets")),

    /** Phase 13.3 — optional FK to normalized client (legacy rows omit). */
    clientId: v.optional(v.id("clients")),
    /** Phase 13.3 — optional FK to normalized project (legacy rows omit). */
    projectId: v.optional(v.id("projects")),

    /**
     * Canonical borrower/property/commercial payload — **same field names and
     * types as `intakeSheets`** (`convex/intakeSchemaPart.ts`). Patches use
     * `intakePatchableFields`, which references those validators directly.
     *
     * Stored as `v.any()` so historical rows with forward-compatible extra keys
     * are never rejected at read time; new writes still go through typed
     * `patchDeal` / `intakeSheets.patch` validators.
     */
    dealData: v.optional(v.any()),
    status: v.string(),
    /** Org-scoped dynamic parent stage (Phase 12.1). Legacy rows may omit until migration. */
    stageId: v.optional(v.id("organizationPipelineStages")),
    /** Optional nested sub-stage under `stageId`. */
    subStageId: v.optional(v.id("organizationPipelineSubStages")),
    fundingAmount: v.optional(v.number()),
    rate: v.number(),
    term: v.string(),
    /**
     * Legacy one-line subject address for file-only rows. When `dealData` (or a
     * linked intake) exists, structured + coversheet addresses on the deal win
     * in UI previews; prefer `patchDeal` over writing this field for deal-backed
     * files.
     */
    propertyAddress: v.optional(v.string()),
    notes: v.optional(v.string()),

    /**
     * Operator confidence in how serious / urgent the client is (1 = weak
     * likelihood … 5 = near-certain close). Default read model is 3 when unset.
     */
    clientMomentum: v.optional(v.number()),

    /**
     * Revenue tracking (USD), **mirrors** `fileSharedState.commission` /
     * `fileSharedState.netRevenue`. Use `normalizeFileSharedStateFromPipeline`
     * as the read model — same as `fundingAmount` / rate / term / notes.
     * Distinct from fee-calculator `brokerGross` / `netToUser`.
     */
    commission: v.optional(v.number()),
    netRevenue: v.optional(v.number()),

    /** Lenders associated with this deal (referral partners, multiple quotes, etc.). */
    lenders: v.array(v.id("lenders")),

    /**
     * Primary lender for this deal — lead relationship. Denormalized into
     * `selectedLenderId` and `lenders[]` for legacy readers.
     */
    primaryLenderId: v.optional(v.id("lenders")),

    /**
     * Secondary / syndication lenders (excludes primary). When unset, readers
     * fall back to legacy `supportingLenderIds`.
     */
    secondaryLenderIds: v.optional(v.array(v.id("lenders"))),

    /**
     * Shortlist — lenders under consideration before role assignment.
     */
    consideringLenderIds: v.optional(v.array(v.id("lenders"))),

    /** @deprecated Legacy alias — mirrored from `secondaryLenderIds` on write. */
    supportingLenderIds: v.optional(v.array(v.id("lenders"))),

    /**
     * The lender the user has chosen to actually fund the deal (after
     * shopping the file around). Always points at one of the ids in
     * `lenders` when set; cleared automatically when that lender is
     * detached or when the user clears the lender list. Surfaces in the
     * drawer as a "Chosen" badge on the linked-lender row and unlocks
     * the "Clear other lenders" action so the file can be pruned down
     * to just the winner once a decision is made.
     */
    selectedLenderId: v.optional(v.id("lenders")),

    /**
     * Date the user sent this file to the **selected** lender (Unix ms, typically
     * midnight local time from the date picker). **Manual** tracking field — set
     * from the pipeline table via `pipeline.patch`; cleared when the selection is
     * cleared. Not auto-filled when choosing a lender (`selectLender`).
     */
    selectedLenderSentAt: v.optional(v.number()),

    /**
     * Target closing date for the deal (Unix ms). Editable on the pipeline file;
     * if unset, the UI may fall back to intake cover `estCOE` when linked.
     */
    targetCloseDate: v.optional(v.number()),

    /**
     * NMLS-style identifiers for files **without** a linked intake sheet.
     * When `intakeSheetId` is set, the UI reads/writes `cover.loNmls` /
     * `cover.brokerNmls` on the intake document instead so historical data
     * stays in one place.
     */
    loNmls: v.optional(v.string()),
    brokerNmls: v.optional(v.string()),

    /**
     * Opt-in flag for the ledger's "Projections" forecast. Set when the
     * user wants to include this not-yet-funded file's `netToUser` in
     * their net-revenue forecast on the ledger page. Independent of
     * status — the user picks which in-flight deals are confident
     * enough to forecast. Cleared either via the toggle on the ledger
     * Projections card or automatically once the file flips to
     * Paid/Paying (a paid file lives in the ledger proper, not the
     * forecast).
     */
    projectIntoLedger: v.optional(v.boolean()),

    /**
     * Contacts tied to this pipeline item (borrower, closer, title, etc.).
     */
    contacts: v.array(
      v.object({
        name: v.string(),
        email: v.optional(v.string()),
        phone: v.optional(v.string()),
        company: v.optional(v.string()),
      })
    ),

    /**
     * Fees are entered as **percent of loan + optional flat "outside" fee**.
     * The dollar totals (`lenderFee`, `brokerGross`, `netToUser`) are
     * recomputed server-side in `pipeline.patch` whenever any of
     * `fundingAmount`, the `*Pct`, or the `*Outside` fields change so reports,
     * splits, and the ledger always read a single consistent number.
     *
     * Legacy rows that only have the dollar total (no `*Pct` / `*Outside`)
     * are preserved — the UI shows the dollar value until the user starts
     * editing percent / outside, at which point the recompute takes over.
     */
    lenderFee: v.optional(v.number()),
    lenderFeePct: v.optional(v.number()),
    lenderFeeOutside: v.optional(v.number()),
    brokerGross: v.optional(v.number()),
    brokerGrossPct: v.optional(v.number()),
    brokerGrossOutside: v.optional(v.number()),
    splits: v.optional(
      v.array(
        v.object({
          name: v.string(),
          amount: v.number(),
          reason: v.optional(v.string()),
        })
      )
    ),
    netToUser: v.optional(v.number()),
    netToUserPct: v.optional(v.number()),
    netToUserOutside: v.optional(v.number()),

    scenario: v.optional(v.string()),

    /**
     * Structured criteria for the on-file "Find matching lenders" feature
     * (a per-file mirror of the global Scenario Search form). Fields use
     * the same labels / vocabulary as `lib/scenario.ts` so the values can
     * be passed straight into `api.scenario.matchScenario`. `fundingAmount`
     * is intentionally **not** stored here — `pipeline.fundingAmount` is the
     * single source of truth for that number. Each leaf is optional so
     * the user can fill in only what they know.
     */
    scenarioCriteria: v.optional(
      v.object({
        fundingTypeLabel: v.optional(v.string()),
        propertyTypeLabel: v.optional(v.string()),
        state: v.optional(v.string()),
        transactionType: v.optional(v.string()),
        ficoScore: v.optional(v.number()),
        annualRevenue: v.optional(v.number()),
        timeInBusinessMonths: v.optional(v.number()),
        ltv: v.optional(v.number()),
        ownerOccupied: v.optional(
          v.union(
            v.literal("Owner"),
            v.literal("Investor"),
            v.literal("Either")
          )
        ),
        entityTypePreference: v.optional(v.string()),
        industry: v.optional(v.string()),
      })
    ),

    /**
     * Multi-user scaffolding (no auth yet). Free-form string ids so the
     * UI can render assignment / sharing today; we'll swap to `v.id("users")`
     * once auth ships. Both default to undefined ("everyone with access").
     */
    assigneeId: v.optional(v.string()),
    sharedWithIds: v.optional(v.array(v.string())),

    /**
     * Soft-archive timestamp. When set, the file is hidden from the default
     * pipeline list, board, and ledger projection candidates, but the row
     * (and its history / ledger refs) is preserved. The `archive` /
     * `unarchive` mutations toggle this field; `getAll({ includeArchived: true })`
     * surfaces archived rows for the "Show archived" view.
     *
     * Unix ms. Independent of `status` — an archived file keeps its
     * funnel stage so it can be restored without losing context.
     */
    archivedAt: v.optional(v.number()),

    /**
     * Snooze-until instant: ISO 8601 string (preferred for new writes) or legacy
     * Unix ms. While the instant is in the future, the file is hidden from the
     * default pipeline list/board; once `now` passes it, the file reappears.
     */
    snoozedUntil: v.optional(v.union(v.string(), v.number())),

    /**
     * Quote-style term options drafted in the PipelineDrawer's
     * Generate Terms section. Persisted so they survive a page close
     * and can be reproduced on the bullet/email exports.
     */
    termOptions: v.optional(
      v.array(
        v.object({
          rate: v.string(),
          term: v.string(),
          prepaymentPenalty: v.string(),
          notes: v.string(),
          appraisalRequired: v.optional(v.boolean()),
          newLoanAmount: v.optional(v.string()),
          fundingTimeframe: v.optional(v.string()),
          qualifyingIncomeType: v.optional(v.string()),
          includeQualifyingIncomeAmount: v.optional(v.boolean()),
          qualifyingIncomeAmount: v.optional(v.string()),
        })
      )
    ),

    /**
     * Cross-block canonical snapshot for modular pipeline UI (“data bus”).
     * Canonical names: **`fundingAmount`**, **`interestRate`**, **`term`**, **`notes`** plus
     * **`commission`**, **`netRevenue`** (tracked revenue — not the pct-fee `brokerGross` /
     * `netToUser` lines).
     * Top-level `fundingAmount`, `rate`, `term`, `notes`, `commission`, and `netRevenue`
     * are **mirrors** for legacy list readers; use `lib/fileSharedFields.ts`
     * (`normalizeFileSharedStateFromPipeline`) as the single read model.
     */
    fileSharedState: v.optional(
      v.object({
        fundingAmount: v.optional(v.number()),
        /** Note rate / APR — canonical; mirrors `rate`. */
        interestRate: v.optional(v.number()),
        term: v.optional(v.string()),
        notes: v.optional(v.string()),
        /** Expected commission (USD); mirrors `pipeline.commission`. */
        commission: v.optional(v.number()),
        /** Expected net revenue / take-home (USD); mirrors `pipeline.netRevenue`. */
        netRevenue: v.optional(v.number()),
        updatedAt: v.number(),
      })
    ),
    /**
     * Per-block field overrides for shared numerics. Keys `blockId::fieldKey`
     * (see `lib/fileSharedFields.ts`). `n` is the effective value for that block.
     */
    fileBlockFieldOverrides: v.optional(
      v.record(
        v.string(),
        v.object({
          n: v.number(),
          updatedAt: v.number(),
        })
      )
    ),

    /**
     * Per-file pipeline drawer block order / visibility / expand state.
     * Mirrors `PipelineDrawerLayoutV1` in `lib/pipelineDrawerLayoutStorage.ts`.
     */
    fileDrawerLayout: v.optional(
      v.object({
        v: v.literal(1),
        order: v.array(v.string()),
        hidden: v.array(v.string()),
        expanded: v.optional(v.record(v.string(), v.boolean())),
        settings: v.optional(v.record(v.string(), v.any())),
      })
    ),

    /**
     * Phase Modular-E — portal document requests queued by a loan-strategy
     * template at file creation. Consumed (created + cleared) the first time a
     * borrower is invited to the client portal for this file.
     */
    pendingPortalChecklist: v.optional(
      v.array(
        v.object({
          title: v.string(),
          description: v.optional(v.string()),
          folderName: v.optional(v.string()),
        }),
      ),
    ),

    /**
     * Optional organization scope for shared CRM data (multi-user teams).
     * **Unset / undefined** = legacy rows (pre–org migration). When set, only
     * members of that organization should read or mutate the row (enforced in
     * mutations when `memberUserKey` / `preferencesAccountId` is passed).
     */
    organizationId: v.optional(v.id("organizations")),

    /**
     * **`UserPreferences` account id** of the member who owns this file.
     * On org-scoped rows, when set, the file is visible to the owner, users in
     * `pipelineFileShares`, and members with `files.view_all` / `files.edit_all`.
     * When unset on an org row, any member with `files.view` still sees it
     * (migration / legacy team-wide visibility).
     */
    ownerUserKey: v.optional(v.string()),

    /**
     * Canonical auth user id (`authUsers._id` as string) who owns this file.
     * Required on org-scoped rows after Step 8B backfill; synced with `ownerUserKey`.
     */
    ownerUserId: v.optional(v.string()),

    /**
     */
    demoBundleId: v.optional(v.string()),

    /**
     * Denormalized lowercase blob for global search (`globalSearch.search`).
     * Kept in sync from `lib/globalSearchText` via mutations / backfill.
     */
    globalSearchText: v.optional(v.string()),

    /** Phase 40.3 — custom display label for the vault root directory. */
    documentVaultRootLabel: v.optional(v.string()),

    /** Project workspace display order (lower first). */
    workspaceSortOrder: v.optional(v.number()),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_stageId", ["stageId"])
    .index("by_organization_stage", ["organizationId", "stageId"])
    .index("by_createdAt", ["createdAt"])
    .index("by_intakeSheetId", ["intakeSheetId"])
    .index("by_organization_createdAt", ["organizationId", "createdAt"])
    .index("by_org_demoBundle", ["organizationId", "demoBundleId"])
    .index("by_clientId", ["clientId"])
    .index("by_projectId", ["projectId"])
    .index("by_org_client", ["organizationId", "clientId"])
    .index("by_org_project", ["organizationId", "projectId"])
    .searchIndex("global_search", {
      searchField: "globalSearchText",
      filterFields: ["organizationId"],
    })
    .searchIndex("global_search_all", { searchField: "globalSearchText" }),

  /**
   * Explicit share of a pipeline file to another org member (view / edit).
   */
  pipelineFileShares: defineTable({
    fileId: v.id("pipeline"),
    userKey: v.string(),
    access: v.union(v.literal("view"), v.literal("edit")),
    /**
     * Finer-than-legacy share level. When absent, `access` remains authoritative
     * (`view`→view, `edit`→edit|manage for pipeline resolution).
     */
    permissionLevel: v.optional(
      v.union(
        v.literal("view"),
        v.literal("comment"),
        v.literal("edit"),
        v.literal("manage"),
      ),
    ),
    shareKind: v.optional(
      v.union(
        v.literal("direct"),
        v.literal("team"),
        v.literal("role"),
        v.literal("temporary"),
      ),
    ),
    expiresAtMs: v.optional(v.number()),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    createdByUserKey: v.string(),
    updatedAt: v.number(),
  })
    .index("by_file", ["fileId"])
    .index("by_file_user", ["fileId", "userKey"])
    .index("by_userKey", ["userKey"]),

  /**
   * Pending pipeline share for emails with no auth account yet (Phase 13.1A).
   * Does not grant ACL until the user exists and owner re-shares or invite is fulfilled.
   */
  pipelineSharePendingInvites: defineTable({
    fileId: v.id("pipeline"),
    organizationId: v.id("organizations"),
    inviteEmail: v.string(),
    permission: v.union(v.literal("view"), v.literal("edit")),
    createdByUserId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_file", ["fileId"])
    .index("by_file_email", ["fileId", "inviteEmail"]),

  /**
   * Normalized owner-scoped ACL for tasks and pipeline files (Step 8B).
   * Org membership alone does not grant visibility — only owner, share, or impersonation.
   */
  resourceShares: defineTable({
    sharedUserId: v.string(),
    resourceType: allResourceShareTypeV,
    resourceId: v.string(),
    permission: v.union(v.literal("view"), v.literal("edit")),
    /** Phase 16 — canonical role; do not infer co_owner from permission alone. */
    collaboratorRole: v.optional(eventCollaboratorRoleV),
    organizationId: v.id("organizations"),
    createdAt: v.number(),
    createdByUserId: v.string(),
    updatedAt: v.number(),
  })
    .index("by_org_shared_user_type", [
      "organizationId",
      "sharedUserId",
      "resourceType",
    ])
    .index("by_resource", ["resourceType", "resourceId"])
    .index("by_resource_user", ["resourceType", "resourceId", "sharedUserId"]),

  /**
   * Append-only log when a mutation is denied by owner-scoped ACL (Step 8B).
   */
  resourceAccessDenials: defineTable({
    actorUserId: v.string(),
    organizationId: v.id("organizations"),
    resourceType: allResourceShareTypeV,
    resourceId: v.string(),
    action: v.string(),
    reason: v.string(),
    at: v.number(),
  }).index("by_org_at", ["organizationId", "at"]),

  /**
   * Append-only audit trail for pipeline files (compact rows; capped per file).
   * Queried on demand — does not load on pipeline list/board.
   */
  pipelineFileActivity: defineTable({
    fileId: v.id("pipeline"),
    /** Event time (Unix ms); mirror of ordering for range scans. */
    at: v.number(),
    kind: v.union(
      v.literal("file_created"),
      v.literal("data_patch"),
      v.literal("deal_patch"),
      v.literal("drawer_layout"),
      v.literal("contact_link"),
      v.literal("contact_unlink"),
      v.literal("contact_link_update"),
      v.literal("lender_attach"),
      v.literal("lender_detach"),
      v.literal("lender_select"),
      v.literal("automation"),
      v.literal("undo"),
      v.literal("share_grant"),
      v.literal("share_revoke"),
      v.literal("share_update"),
      v.literal("client_momentum"),
      v.literal("vault_client_upload"),
      v.literal("vault_broker_review"),
      v.literal("lender_delivery_accessed"),
      v.literal("lender_document_previewed"),
      v.literal("lender_folder_expanded"),
      v.literal("lender_package_exported"),
    ),
    /** Top-level fields or deal sections touched (short names only). */
    keys: v.optional(v.array(v.string())),
    summary: v.optional(v.string()),
    contactId: v.optional(v.id("contacts")),
    lenderId: v.optional(v.id("lenders")),
    /** Subject of a share grant/revoke/update (browser account id). */
    shareTargetUserKey: v.optional(v.string()),
    shareAccess: v.optional(
      v.union(v.literal("view"), v.literal("edit")),
    ),
    blocksShown: v.optional(v.array(v.string())),
    blocksHidden: v.optional(v.array(v.string())),
    /** Machine-readable rollback payload (small — large patches skip undo). */
    undoSpec: v.optional(v.any()),
    /** Snapshot of affected state after the change; must match before undo. */
    expectPost: v.optional(v.any()),
    /** Set when this activity row has been rolled back. */
    revertedAt: v.optional(v.number()),
  })
    .index("by_file_at", ["fileId", "at"])
    .index("by_lender_at", ["lenderId", "at"]),

  /**
   * Funding / revenue ledger — one row per funded loan, regardless of how
   * the user is being paid (lump sum, future-scheduled, or a monthly
   * receivable stream). Individual payment events live in the `payments`
   * table below; the values stored here represent the **expected** total
   * (`gross` / `net`) the user will collect on the deal. `date` is the
   * funding date.
   *
   * Legacy rows (no `paymentMode`) are treated as `"lump_sum"` by the UI.
   *
   * Currency amounts are in the app's implied unit. All dates are Unix ms.
   */
  ledger: defineTable({
    fileId: v.id("pipeline"),
    gross: v.number(),
    net: v.number(),
    paymentMethod: v.optional(v.string()),
    paidBy: v.optional(v.string()),
    date: v.number(),

    /**
     * How the user gets paid for this funded loan.
     *  - `"lump_sum"` (default for legacy rows): single payment event;
     *    `payments` will typically have 0 or 1 row.
     *  - `"scheduled"`: paid in full on a future date; `scheduledDate` is
     *    when the user expects the money to land.
     *  - `"monthly"`: ongoing receivable; `monthlyAmount` is each
     *    installment, `termMonths` is how many installments are expected
     *    (so `monthlyAmount * termMonths` ≈ `gross`).
     */
    paymentMode: v.optional(
      v.union(
        v.literal("lump_sum"),
        v.literal("scheduled"),
        v.literal("monthly")
      )
    ),
    scheduledDate: v.optional(v.number()),
    monthlyAmount: v.optional(v.number()),
    termMonths: v.optional(v.number()),
    notes: v.optional(v.string()),
  }).index("by_fileId", ["fileId"]),

  /**
   * Individual payment receipts collected against a `ledger` row. Each
   * payment captures one wire / ACH / check the user actually received
   * (or is recording having received). `gross` is the amount sent; `net`
   * is what the user kept after upstream splits (defaults to `gross`).
   */
  payments: defineTable({
    ledgerId: v.id("ledger"),
    /** Denormalized so `byFile` / per-file totals stay one query. */
    fileId: v.id("pipeline"),
    date: v.number(),
    gross: v.number(),
    net: v.number(),
    method: v.optional(v.string()),
    paidBy: v.optional(v.string()),
    notes: v.optional(v.string()),
  })
    .index("by_ledgerId", ["ledgerId"])
    .index("by_fileId", ["fileId"])
    .index("by_date", ["date"]),

  /**
   * Personal / work task tracking. Quadrant 1–4 = Eisenhower matrix quadrants
   * (convention, not enforced in schema). Dates are Unix ms, same as `lenders`.
   */
  tasks: defineTable({
    title: v.string(),
    description: v.optional(v.string()),
    type: v.union(
      v.literal("work"),
      v.literal("personal"),
      v.literal("errands_groceries")
    ),
    category: v.union(
      v.literal("errand"),
      v.literal("research"),
      v.literal("call"),
      v.literal("admin"),
      v.literal("project")
    ),
    quadrant: v.number(),
    /**
     * Manual execution order within the Eisenhower quadrant (top-level tasks
     * only). Lower = earlier. Undefined = fall back to matrix sort mode.
     */
    quadrantPosition: v.optional(v.number()),
    status: v.union(
      v.literal("todo"),
      v.literal("in_progress"),
      v.literal("done"),
      v.literal("archived")
    ),
    priority: v.number(),
    dueDate: v.optional(v.number()),
    startDate: v.optional(v.number()),
    parentTaskId: v.optional(v.id("tasks")),
    relatedFileId: v.optional(v.id("pipeline")),
    /** Linked CRM contact (standalone contacts table). */
    relatedContactId: v.optional(v.id("contacts")),

    /**
     * Multi-user scaffolding — see `pipeline.assigneeId` for the same
     * notes. Filters today are no-ops, but the data model is ready.
     */
    assigneeId: v.optional(v.string()),
    sharedWithIds: v.optional(v.array(v.string())),

    /**
     * Canonical auth user id (`authUsers._id` as string) who owns this task.
     * Required on org-scoped rows after Step 8B backfill.
     */
    ownerUserId: v.optional(v.string()),

    /**
     * Set when status flips to "done". Used for daily / weekly
     * "completed" sections and analytics.
     */
    completedAt: v.optional(v.number()),

    /**
     * "Wake-up" timestamp for snoozed tasks (Unix ms). When set and in
     * the future, the task is hidden from the default Matrix / Today /
     * Week / Long-term views and from "overdue" counts — surface it via
     * the Snoozed filter on the tasks page. Cleared (set to undefined)
     * when the user wakes the task or when it auto-wakes (the UI just
     * checks `snoozedUntil > Date.now()` lazily; no server cron is
     * required).
     */
    snoozedUntil: v.optional(v.number()),

    /** Phase 32.2 — follow-up attempts logged on this task (denormalized). */
    attemptCount: v.optional(v.number()),
    /** Phase 32.2 — Unix ms of most recent attempt log. */
    lastAttemptAt: v.optional(v.number()),

    /**
     * Optional reminder time (Unix ms). Surfaced in the task hub and in
     * assignee attention previews when `<= now` (with due date nudges).
     */
    reminderAt: v.optional(v.number()),

    /**
     * Phase 21 — visual triage: denormalized preset id for hub/feed rendering.
     * Derived from triage label or default schedule color when applicable.
     */
    highlightColorId: v.optional(v.string()),
    /**
     * Phase 22 — optional admin-defined triage label. While open, triggers
     * immediate hub highlight using the label's color.
     */
    triageLabelId: v.optional(v.id("organizationTriageLabels")),
    /** Unix ms when `triageLabelId` was last assigned or changed (not task creation). */
    labelAppliedAt: v.optional(v.number()),
    /** @deprecated Phase 22 — use triageLabelId. Retained for legacy rows. */
    isUrgent: v.optional(v.boolean()),
    /** Scheduled follow-up — highlight activates when `<= evaluation time` while open. */
    scheduledTriggerTime: v.optional(v.number()),

    /**
     * Optional recurrence rule. When set, completing the task spawns a
     * fresh instance with the next due date and marks the original done.
     * `interval` is "every N units" (default 1).
     * `endsOn` (Unix ms) caps the recurrence; once `dueDate > endsOn`,
     * no new instance is created.
     * `daysOfWeek` only applies when `every === "week"` (0 = Sunday).
     */
    recurrence: v.optional(
      v.object({
        every: v.union(
          v.literal("day"),
          v.literal("week"),
          v.literal("month"),
          v.literal("year")
        ),
        interval: v.number(),
        daysOfWeek: v.optional(v.array(v.number())),
        endsOn: v.optional(v.number()),
      })
    ),

    /**
     * Free-form list of websites / files / references for this task.
     * Each link is `{ url, label?, kind? }` — `kind` lets the UI tell
     * apart docs, websites, repos, etc. (advisory only). Empty list /
     * undefined both render as "no links".
     */
    links: v.optional(
      v.array(
        v.object({
          url: v.string(),
          label: v.optional(v.string()),
          kind: v.optional(v.string()),
        })
      )
    ),

    /**
     * Other task ids this task is "see also" / blocked-by / related to.
     * Symmetric: when A → B is added, B → A is added too. Self-references
     * are rejected. Use this for cross-quadrant or cross-project links
     * that aren't strict parent/child relationships.
     */
    linkedTaskIds: v.optional(v.array(v.id("tasks"))),

    /**
     * Inline micro-todos that live inside a task (acceptance criteria,
     * sub-steps too small to deserve a full task). Each item is
     * `{ text, done }`.
     */
    checklist: v.optional(
      v.array(
        v.object({
          text: v.string(),
          done: v.boolean(),
        })
      )
    ),

    /**
     * Errands / groceries: stores (locations) each with an item checklist
     * (`name` + `completed`). Only used when `type === "errands_groceries"`.
     */
    errandLocations: v.optional(
      v.array(
        v.object({
          id: v.string(),
          name: v.string(),
          /** Whole store done (also auto-true when every item is checked). */
          completed: v.optional(v.boolean()),
          items: v.array(
            v.object({
              id: v.string(),
              name: v.string(),
              completed: v.boolean(),
              quantity: v.optional(v.string()),
              note: v.optional(v.string()),
            })
          ),
        })
      )
    ),

    organizationId: v.optional(v.id("organizations")),

    /** Removable demo workspace bundle id. */
    demoBundleId: v.optional(v.string()),

    /** Global search blob; see `lib/globalSearchText`. */
    globalSearchText: v.optional(v.string()),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_dueDate", ["dueDate"])
    .index("by_quadrant", ["quadrant"])
    .index("by_quadrant_position", ["quadrant", "quadrantPosition"])
    .index("by_relatedFile", ["relatedFileId"])
    .index("by_relatedContact", ["relatedContactId"])
    .index("by_parent", ["parentTaskId"])
    .index("by_organization", ["organizationId"])
    .index("by_org_demoBundle", ["organizationId", "demoBundleId"])
    .index("by_assignee_updatedAt", ["assigneeId", "updatedAt"])
    .searchIndex("global_search", {
      searchField: "globalSearchText",
      filterFields: ["organizationId"],
    })
    .searchIndex("global_search_all", { searchField: "globalSearchText" }),

  /**
   * In-app notifications when tasks are assigned / reassigned (per userKey).
   */
  taskNotifications: defineTable({
    userKey: v.string(),
    taskId: v.id("tasks"),
    kind: v.union(v.literal("assigned"), v.literal("reassigned")),
    summary: v.string(),
    readAt: v.optional(v.number()),
    createdAt: v.number(),
    actorUserKey: v.optional(v.string()),
  })
    .index("by_user_created", ["userKey", "createdAt"])
    .index("by_task", ["taskId"]),

  /**
   * Unified in-app notification inbox (account id = `userKey`).
   * Email delivery is optional via Resend / env (see `notifications.trySendNotificationEmail`).
   */
  userNotifications: defineTable({
    userKey: v.string(),
    category: v.union(
      v.literal("task_assignment"),
      v.literal("file_update"),
      v.literal("mention"),
      v.literal("deadline"),
      v.literal("assignment_change"),
      v.literal("comment_activity"),
      v.literal("document_activity"),
      v.literal("status_change"),
      v.literal("digest_group"),
    ),
    summary: v.string(),
    detail: v.optional(v.string()),
    readAt: v.optional(v.number()),
    createdAt: v.number(),
    actorUserKey: v.optional(v.string()),
    taskId: v.optional(v.id("tasks")),
    fileId: v.optional(v.id("pipeline")),
    lenderId: v.optional(v.id("lenders")),
    libraryDocumentId: v.optional(v.id("libraryDocuments")),
    collaborationThreadId: v.optional(v.id("collaborationThreads")),
    /** Correlation to structured `collaborationActivityEvents` row when applicable. */
    collaborationEventId: v.optional(v.id("collaborationActivityEvents")),
    /**
     * When set (e.g. cron deadline digest), duplicate notifications for the
     * same key are skipped for that user.
     */
    dedupeKey: v.optional(v.string()),
    emailDispatchedAt: v.optional(v.number()),
    /** In-app silencing until instant (ms). */
    snoozedUntil: v.optional(v.number()),
  })
    .index("by_user_created", ["userKey", "createdAt"])
    .index("by_task", ["taskId"])
    .index("by_file", ["fileId"])
    .index("by_user_dedupe", ["userKey", "dedupeKey"]),
  /**
   * Per-task file metadata (the app’s “task files” / attachments store).
   * Bytes live in Convex file storage (`_storage`); each row points at a blob via `storageId`.
   *
   * Field mapping (schema names → common terms):
   * - `taskId` — owning task (indexed for all per-task reads/writes).
   * - `storageId` — Convex `_storage` id for the uploaded file (not a separate `fileId`).
   * - `fileName` — stored / display file name (same role as `name` in UI copy).
   * - `contentType` — MIME type when known (same role as `type`).
   * - `size` — byte length when known.
   * - `createdAt` — client-visible upload time (ms); used for stable “newest first” ordering.
   * - `label` — optional user-facing note distinct from the file name.
   *
   * Indexes:
   * - `by_task` — equality on `taskId` (counts, deletes, bulk collect).
   * - `by_task_createdAt` — equality on `taskId`, range/sort on `createdAt` (efficient ordered lists).
   *
   * Table key remains `taskAttachments` for backwards compatibility with existing deployments
   * and generated `Id<"taskAttachments">` types.
   */
  taskAttachments: defineTable({
    taskId: v.id("tasks"),
    /** Denormalized from `tasks.organizationId` for tenant isolation on storage paths. */
    organizationId: v.optional(v.id("organizations")),
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.optional(v.string()),
    size: v.optional(v.number()),
    label: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_task", ["taskId"])
    .index("by_task_createdAt", ["taskId", "createdAt"])
    .index("by_organization", ["organizationId"]),

  /**
   * Standalone CRM-style contacts (not linked to pipeline files or lenders).
   * See `convex/contacts.ts`.
   */
  contacts: defineTable({
    name: v.string(),
    /**
     * Legacy single-value fields — kept in sync with primary `emails[]` / `phones[]`
     * entry for backward compatibility. Do not remove without a migration plan.
     */
    email: v.string(),
    phone: v.string(),
    /** Multi-value contact methods (Phase 24 — CRM). */
    emails: v.optional(
      v.array(
        v.object({
          id: v.string(),
          label: v.union(
            v.literal("Work"),
            v.literal("Personal"),
            v.literal("Billing"),
            v.literal("Assistant"),
            v.literal("Other"),
          ),
          email: v.string(),
          isPrimary: v.boolean(),
        }),
      ),
    ),
    phones: v.optional(
      v.array(
        v.object({
          id: v.string(),
          label: v.union(
            v.literal("Mobile"),
            v.literal("Work"),
            v.literal("Home"),
            v.literal("Direct"),
            v.literal("Office"),
            v.literal("Fax"),
            v.literal("Assistant"),
            v.literal("Emergency"),
            v.literal("Other"),
          ),
          number: v.string(),
          isPrimary: v.boolean(),
        }),
      ),
    ),
    notes: v.string(),
    /**
     * Phase 25.7b — master CRM roles (multi-select). Canonical for hub/views.
     */
    contactRoleIds: v.optional(v.array(v.string())),
    /**
     * @deprecated Phase 25.7b — primary/legacy single role; mirrored from `contactRoleIds[0]` when set.
     */
    contactRoleId: v.optional(v.string()),
    /**
     * @deprecated Phase 25.1b — purged by migration; kept optional so unmigrated rows validate.
     */
    labels: v.optional(v.array(v.string())),
    /**
     * @deprecated Phase 25.1b — replaced by `contactRoleId`; optional for unmigrated rows.
     */
    crmRelationshipTypes: v.optional(
      v.array(
        v.union(
          v.literal("client"),
          v.literal("referral"),
          v.literal("lender_rep"),
        ),
      ),
    ),
    /** @deprecated Phase CRM-4 — use `entityContactLinks` primary company link; retained for unmigrated rows. */
    companyName: v.optional(v.string()),
    /**
     * @deprecated Phase CRM-4 — derived from legacy `companyName`; use relational entity links.
     */
    companyKey: v.optional(v.string()),
    /**
     * Normalized email for duplicate detection within an organization.
     */
    emailKey: v.optional(v.string()),
    /**
     * Communication preferences (schema-only until campaigns/SMS UI).
     * When unset, resolvers default to primary `emails[]` / `phones[]` entries.
     */
    preferredEmailId: v.optional(v.string()),
    preferredPhoneId: v.optional(v.string()),
    preferredContactMethod: v.optional(
      v.union(v.literal("email"), v.literal("phone"), v.literal("sms")),
    ),
    /** Phase CRM overhaul — persistent identity / credit fields (deal sync in Phase 2). */
    fico: v.optional(v.number()),
    ssn: v.optional(v.string()),
    dob: v.optional(v.string()),
    organizationId: v.optional(v.id("organizations")),

    /** Removable demo workspace bundle id (see `demoWorkspace` Convex module). */
    demoBundleId: v.optional(v.string()),

    /** Global search blob; see `lib/globalSearchText`. */
    globalSearchText: v.optional(v.string()),

    /**
     * Phase Contacts overhaul — CRM list fields (backfilled + maintained by
     * `contactCrmListFields` on link/activity mutations).
     */
    linkStatus: v.optional(
      v.union(
        v.literal("linked"),
        v.literal("unlinked"),
        v.literal("partial"),
      ),
    ),
    lastActivityAt: v.optional(v.number()),
    lastInteractionAt: v.optional(v.number()),
    crmTags: v.optional(v.array(v.string())),

    /**
     * Org portal default templates assigned to this contact (additive).
     * At most one id per portal type is enforced in mutations; Portals & Progress
     * resolves these when the contact is linked to a pipeline file.
     */
    portalDefaultIds: v.optional(v.array(v.id("portalDefaults"))),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_updatedAt", ["updatedAt"])
    .index("by_organization_updatedAt", ["organizationId", "updatedAt"])
    .index("by_organization_emailKey", ["organizationId", "emailKey"])
    .index("by_org_demoBundle", ["organizationId", "demoBundleId"])
    .searchIndex("global_search", {
      searchField: "globalSearchText",
      filterFields: ["organizationId"],
    })
    .searchIndex("global_search_all", { searchField: "globalSearchText" }),

  /**
   * Rollback snapshots for `contactMultiMethodsMigration` (operator migrations).
   */
  contactMultiMethodsMigrationLog: defineTable({
    contactId: v.id("contacts"),
    migratedAt: v.number(),
    beforeEmail: v.string(),
    beforePhone: v.string(),
    hadEmailsArray: v.boolean(),
    hadPhonesArray: v.boolean(),
    /** JSON-serialized arrays before migration (optional). */
    beforeEmailsJson: v.optional(v.string()),
    beforePhonesJson: v.optional(v.string()),
    rolledBackAt: v.optional(v.number()),
  }).index("by_contact", ["contactId"]),

  /**
   * Many-to-many links between standalone contacts and pipeline files.
   * Additive model: does not alter existing `pipeline.contacts` rows.
   */
  contactFileLinks: defineTable({
    contactId: v.id("contacts"),
    fileId: v.id("pipeline"),
    /** Flexible per-link relationship label (e.g. co-signer). */
    role: v.string(),
    /** Phase Registry-1 — canonical junction role id. */
    registryRoleId: v.optional(registryRoleIdV),
    /** @deprecated Phase Registry-1 — use `registryRoleId`. */
    contactRoleId: v.optional(v.string()),
    /**
     * @deprecated Phase 25.1b — optional for unmigrated link rows.
     */
    relationshipType: v.optional(
      v.union(
        v.literal("client"),
        v.literal("referral"),
        v.literal("lender_rep"),
      ),
    ),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_contact", ["contactId", "updatedAt"])
    .index("by_file", ["fileId", "updatedAt"])
    .index("by_contact_file", ["contactId", "fileId"]),

  /**
   * Many-to-many links between standalone contacts and lenders.
   * Fully additive — does not change `lenders` rows or embedded lender contacts.
   */
  contactLenderLinks: defineTable({
    contactId: v.id("contacts"),
    lenderId: v.id("lenders"),
    role: v.string(),
    /** Phase Registry-1 — canonical junction role id. */
    registryRoleId: v.optional(registryRoleIdV),
    /** @deprecated Phase Registry-1 — use `registryRoleId`. */
    contactRoleId: v.optional(v.string()),
    /**
     * @deprecated Phase 25.1b — optional for unmigrated link rows.
     */
    relationshipType: v.optional(
      v.union(
        v.literal("client"),
        v.literal("referral"),
        v.literal("lender_rep"),
      ),
    ),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_contact", ["contactId", "updatedAt"])
    .index("by_lender", ["lenderId", "updatedAt"])
    .index("by_contact_lender", ["contactId", "lenderId"]),

  /**
   * CRM activity log per contact (notes, calls, link events).
   */
  contactActivity: defineTable({
    contactId: v.id("contacts"),
    at: v.number(),
    kind: v.union(
      v.literal("note"),
      v.literal("call"),
      v.literal("email"),
      v.literal("meeting"),
      v.literal("file_linked"),
      v.literal("file_unlinked"),
      v.literal("lender_linked"),
      v.literal("lender_unlinked"),
      v.literal("system"),
    ),
    summary: v.string(),
    detail: v.optional(v.string()),
    noteCategory: v.optional(v.string()),
    actorUserKey: v.optional(v.string()),
    relatedFileId: v.optional(v.id("pipeline")),
    relatedLenderId: v.optional(v.id("lenders")),
  })
    .index("by_contact_at", ["contactId", "at"])
    .index("by_relatedFile", ["relatedFileId"])
    .index("by_relatedLender", ["relatedLenderId"]),

  /** CRM activity log per business entity (notes, calls). */
  entityActivity: defineTable({
    clientId: v.id("clients"),
    at: v.number(),
    kind: v.union(
      v.literal("note"),
      v.literal("call"),
      v.literal("email"),
      v.literal("meeting"),
      v.literal("system"),
    ),
    summary: v.string(),
    detail: v.optional(v.string()),
    noteCategory: v.optional(v.string()),
    actorUserKey: v.optional(v.string()),
  }).index("by_client_at", ["clientId", "at"]),

  /**
   * Phase 37.1.B — Contact-first sticky data (REO, PFS, business entities/debt).
   * Source of truth for borrower data that travels across pipeline files.
   * Legacy `pipeline.dealData` remains untouched until UI migration phases.
   */
  contactReoProperties: defineTable({
    organizationId: v.optional(v.id("organizations")),
    contactId: v.id("contacts"),
    sortOrder: v.number(),
    ...contactReoPropertyFieldsV,
    archivedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_contact", ["contactId"])
    .index("by_contact_sort", ["contactId", "sortOrder"])
    .index("by_organization_contact", ["organizationId", "contactId"]),

  contactFinancialProfiles: defineTable({
    organizationId: v.optional(v.id("organizations")),
    contactId: v.id("contacts"),
    income: v.array(contactStickyIncomeRowV),
    assets: v.array(contactStickyAssetRowV),
    liabilities: v.array(contactStickyLiabilityRowV),
    netWorth: v.optional(v.string()),
    liquidAssets: v.optional(v.string()),
    /** Phase 37.4.H.2 — household dependents (primary borrower, reusable across files). */
    dependentsCount: v.optional(v.string()),
    dependentsAges: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_contact", ["contactId"])
    .index("by_organization_contact", ["organizationId", "contactId"]),

  /**
   * Phase Modular-C — investor track record (`investorExperience` block).
   * Sticky contact-scoped data: travels across files like REO / PFS rows.
   */
  contactInvestorProjects: defineTable({
    organizationId: v.optional(v.id("organizations")),
    contactId: v.id("contacts"),
    address: v.optional(v.string()),
    projectType: v.optional(v.string()),
    role: v.optional(v.string()),
    purchaseAmount: v.optional(v.string()),
    purchaseDate: v.optional(v.string()),
    saleAmount: v.optional(v.string()),
    saleDate: v.optional(v.string()),
    outcome: v.optional(v.string()),
    notes: v.optional(v.string()),
    sortOrder: v.number(),
    archivedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_contact", ["contactId"])
    .index("by_contact_sort", ["contactId", "sortOrder"])
    .index("by_organization_contact", ["organizationId", "contactId"]),

  contactBusinessEntities: defineTable({
    organizationId: v.optional(v.id("organizations")),
    /**
     * Phase Modular-A — back-reference to the canonical `clients` row for this
     * business entity. `clients` is authoritative; this row is a derived cache
     * (see `convex/entityCanonicalization.ts`).
     */
    clientId: v.optional(v.id("clients")),
    ...contactBusinessEntityFieldsV,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_entity_name", ["organizationId", "entityName"])
    .index("by_client", ["clientId"]),

  contactBusinessOwnership: defineTable({
    organizationId: v.optional(v.id("organizations")),
    contactId: v.id("contacts"),
    businessEntityId: v.id("contactBusinessEntities"),
    ownershipPercentage: v.optional(v.string()),
    title: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_contact", ["contactId"])
    .index("by_business_entity", ["businessEntityId"])
    .index("by_contact_entity", ["contactId", "businessEntityId"]),

  contactBusinessDebtSchedules: defineTable({
    organizationId: v.optional(v.id("organizations")),
    businessEntityId: v.id("contactBusinessEntities"),
    sortOrder: v.number(),
    ...contactBusinessDebtFieldsV,
    archivedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_business_entity", ["businessEntityId"])
    .index("by_business_entity_sort", ["businessEntityId", "sortOrder"]),

  /**
   * Append-only version log for contact sticky-data edits (rollback support).
   */
  contactDataVersions: defineTable({
    organizationId: v.optional(v.id("organizations")),
    contactId: v.id("contacts"),
    entityType: contactDataEntityTypeV,
    /** Child row id when version applies to a single REO/debt/ownership row. */
    entityId: v.optional(v.string()),
    previousState: v.optional(v.any()),
    modifiedBy: v.string(),
    modifiedAt: v.number(),
  })
    .index("by_contact_at", ["contactId", "modifiedAt"])
    .index("by_contact_entity_type_at", ["contactId", "entityType", "modifiedAt"]),

  /**
   * Workspace-wide activity (org or user scope). Mirrors high-signal events from
   * pipeline, contacts, lenders, and tasks for a unified feed; subscribe via Convex.
   */
  activityFeed: defineTable({
    at: v.number(),
    scopeKind: v.union(v.literal("org"), v.literal("user")),
    scopeId: v.string(),
    category: v.union(
      v.literal("file"),
      v.literal("contact"),
      v.literal("lender"),
      v.literal("task"),
    ),
    kind: v.string(),
    summary: v.string(),
    detail: v.optional(v.string()),
    /** Indexable actor; "__system__" when unknown (automations, legacy writes). */
    actorKey: v.string(),
    fileId: v.optional(v.id("pipeline")),
    contactId: v.optional(v.id("contacts")),
    lenderId: v.optional(v.id("lenders")),
    taskId: v.optional(v.id("tasks")),
  })
    .index("by_scope_at", ["scopeKind", "scopeId", "at"])
    .index("by_scope_category_at", ["scopeKind", "scopeId", "category", "at"])
    .index("by_scope_actor_at", ["scopeKind", "scopeId", "actorKey", "at"])
    .index("by_scope_file_at", ["scopeKind", "scopeId", "fileId", "at"])
    .index("by_file", ["fileId"])
    .index("by_lender", ["lenderId"]),

  /**
   * Intake sheet subsystem (borrower/property/loan detail). See
   * `convex/intakeSheets.ts` and `convex/intakeSchemaPart.ts`.
   */
  intakeSheets: intakeSheetsTable,
  shareLinks: shareLinksTable,
  intakeForms: intakeFormsTable,
  intakeFormLinks: intakeFormLinksTable,

  /**
   * Phase 39.2 — virtual filesystem folders scoped to a pipeline file.
   * Documents reference folders via `libraryDocumentLinks.folderId`.
   */
  documentFolders: defineTable({
    name: v.string(),
    pipelineFileId: v.id("pipeline"),
    parentFolderId: v.optional(v.id("documentFolders")),
    /** Optional File Task requirement container parent. */
    fileTaskId: v.optional(v.id("documentVaultFileTasks")),
    /** Global Registry — individual contact assignee. */
    assignedContactId: v.optional(v.id("contacts")),
    /** Global Registry — business entity assignee. */
    assignedClientId: v.optional(v.id("clients")),
    /** Global Registry — lender assignee. */
    assignedLenderId: v.optional(v.id("lenders")),
    /** Manual sort among siblings (lower first). */
    sortOrder: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_pipeline", ["pipelineFileId"])
    .index("by_fileTask", ["fileTaskId"]),

  /**
   * Document Vault File Tasks — requirement containers (e.g. "6 Months Bank Statements").
   * Parent wrappers for folders and loose files; distinct from graph `fileTasks` junction.
   */
  documentVaultFileTasks: defineTable({
    pipelineFileId: v.id("pipeline"),
    title: v.string(),
    /** Optional broker-facing description shown in task modals. */
    description: v.optional(v.string()),
    sortOrder: v.number(),
    status: v.union(
      v.literal("incomplete"),
      v.literal("pending_review"),
      v.literal("complete"),
    ),
    isRequired: v.boolean(),
    isPortalVisible: v.boolean(),
    isArchived: v.optional(v.boolean()),
    /** Unix ms due date for broker/client visibility. */
    dueDate: v.optional(v.number()),
    /** Task urgency — shown as row badge. */
    priority: v.optional(
      v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
    ),
    /** Polymorphic task kind — defaults to document_upload when unset. */
    taskType: v.optional(
      v.union(
        v.literal("document_upload"),
        v.literal("client_instruction"),
        v.literal("internal_task"),
        v.literal("block_assignment"),
      ),
    ),
    /** Rich text / markdown instruction for client_instruction tasks. */
    clientInstructionText: v.optional(v.string()),
    /** External URL for client_instruction tasks (payment portal, etc.). */
    instructionUrl: v.optional(v.string()),
    /**
     * Broker-attached template / reference files for client-visible requests
     * (document_upload / client_instruction). Stored in Convex `_storage`.
     */
    clientTemplateAttachments: v.optional(
      v.array(
        v.object({
          storageId: v.id("_storage"),
          fileName: v.string(),
          mimeType: v.string(),
          size: v.number(),
        }),
      ),
    ),
    assignedContactId: v.optional(v.id("contacts")),
    assignedClientId: v.optional(v.id("clients")),
    assignedLenderId: v.optional(v.id("lenders")),
    /** Ordered pipeline block assignments for block_assignment tasks. */
    assignedBlockEntries: v.optional(
      v.array(
        v.object({
          blockId: v.string(),
          sortOrder: v.number(),
        }),
      ),
    ),
    /** Legacy flat block ids — kept in sync with assignedBlockEntries on write. */
    assignedBlocks: v.optional(v.array(v.string())),
    /** Broker note when rejecting a client upload for rework. */
    rejectionNote: v.optional(v.string()),
    lastNotifiedAt: v.optional(v.number()),
    createdByUserKey: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_pipeline_sort", ["pipelineFileId", "sortOrder"]),

  /**
   * Tokenized direct-upload gateway for a single File Task (unauthenticated).
   * Stores SHA-256 hash only; plain token returned once to broker on issue.
   */
  documentVaultFileTaskUploadTokens: defineTable({
    fileTaskId: v.id("documentVaultFileTasks"),
    pipelineFileId: v.id("pipeline"),
    tokenHash: v.string(),
    status: v.union(v.literal("active"), v.literal("revoked")),
    createdByUserKey: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
    lastUsedAt: v.optional(v.number()),
    uploadCount: v.optional(v.number()),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_fileTask", ["fileTaskId"]),

  documentTaskTemplates: defineTable({
    organizationId: v.id("organizations"),
    stackId: v.optional(v.id("documentTaskTemplateStacks")),
    title: v.string(),
    description: v.optional(v.string()),
    isRequired: v.boolean(),
    isPortalVisible: v.boolean(),
    /** Legacy absolute due — prefer dueOffsetDays for templates. */
    dueDate: v.optional(v.number()),
    /** Days after template injection when a live task due date is calculated. */
    dueOffsetDays: v.optional(v.number()),
    priority: v.optional(
      v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
    ),
    taskType: v.optional(
      v.union(
        v.literal("document_upload"),
        v.literal("client_instruction"),
        v.literal("internal_task"),
        v.literal("block_assignment"),
      ),
    ),
    clientInstructionText: v.optional(v.string()),
    instructionUrl: v.optional(v.string()),
    /**
     * Broker-attached template / reference files for client-visible request
     * templates (document_upload / client_instruction). Carried onto live
     * `documentVaultFileTasks` when the template is applied.
     */
    clientTemplateAttachments: v.optional(
      v.array(
        v.object({
          storageId: v.id("_storage"),
          fileName: v.string(),
          mimeType: v.string(),
          size: v.number(),
        }),
      ),
    ),
    assignedBlockEntries: v.optional(
      v.array(
        v.object({
          blockId: v.string(),
          sortOrder: v.number(),
        }),
      ),
    ),
    assignedBlocks: v.optional(v.array(v.string())),
    /** Nested upload folders (flat rows; depth 0 = task root). */
    folderTemplate: v.optional(
      v.array(
        v.object({
          name: v.string(),
          depth: v.number(),
          sortOrder: v.number(),
        }),
      ),
    ),
    sortOrder: v.number(),
    createdByUserKey: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_stack", ["stackId"]),

  documentTaskTemplateStacks: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    description: v.optional(v.string()),
    sortOrder: v.number(),
    createdByUserKey: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_org", ["organizationId"]),

  portalEmailTemplates: defineTable({
    organizationId: v.optional(v.id("organizations")),
    kind: v.union(
      v.literal("initial_request"),
      v.literal("file_task_reminder"),
      v.literal("magic_link"),
    ),
    name: v.string(),
    subject: v.string(),
    bodyText: v.string(),
    isDefault: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_org_kind", ["organizationId", "kind"]),

  /**
   * Org-scoped portal default templates (Settings → Portal defaults).
   * Contact assignment via `contacts.portalDefaultIds`; file surface via
   * `contactFileLinks` → Portals & Progress. Does not replace live
   * `clientPortalLinks` / grants / lender delivery tokens.
   * Page composition: `config.sections` promoted from `portalDefaultVersions`.
   */
  portalDefaults: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    description: v.optional(v.string()),
    portalType: v.union(
      v.literal("client"),
      v.literal("lender"),
      v.literal("referrer"),
      v.literal("deal_partner"),
    ),
    config: v.object({
      welcomeMessage: v.optional(v.string()),
      permission: v.optional(
        v.union(v.literal("view"), v.literal("view_upload")),
      ),
      linkExpiresPreset: v.optional(
        v.union(
          v.literal("1h"),
          v.literal("24h"),
          v.literal("7d"),
          v.literal("30d"),
        ),
      ),
      grantExpiresPreset: v.optional(
        v.union(
          v.literal("never"),
          v.literal("30d"),
          v.literal("90d"),
        ),
      ),
      checklistId: v.optional(v.string()),
      requestChecklist: v.optional(
        v.array(
          v.object({
            title: v.string(),
            description: v.optional(v.string()),
            folderName: v.optional(v.string()),
          }),
        ),
      ),
      lenderPermission: v.optional(
        v.union(v.literal("view_only"), v.literal("downloadable")),
      ),
      includeAllDocumentsByDefault: v.optional(v.boolean()),
      showDealSummary: v.optional(v.boolean()),
      allowMessaging: v.optional(v.boolean()),
      statusVisibility: v.optional(
        v.union(v.literal("basic"), v.literal("detailed")),
      ),
      sections: v.optional(
        v.array(
          v.object({
            instanceId: v.string(),
            sectionId: v.string(),
            enabled: v.optional(v.boolean()),
            /** Sanitized in portalDefaults / lib/portalSectionConfig. */
            props: v.optional(v.any()),
            layout: v.optional(
              v.object({
                colSpan: v.optional(v.number()),
                order: v.optional(v.number()),
              }),
            ),
          }),
        ),
      ),
      chrome: v.optional(v.any()),
    }),
    /** Version currently promoted into `config.sections` (live default). */
    activeVersionId: v.optional(v.id("portalDefaultVersions")),
    archivedAt: v.optional(v.number()),
    createdByUserKey: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization_updated", ["organizationId", "updatedAt"])
    .index("by_organization_type", ["organizationId", "portalType", "updatedAt"]),

  /**
   * Draft / published page compositions under a portal default.
   * Promote copies `sections` (+ chrome) onto the parent `portalDefaults.config`.
   */
  portalDefaultVersions: defineTable({
    organizationId: v.id("organizations"),
    portalDefaultId: v.id("portalDefaults"),
    name: v.string(),
    sections: v.array(
      v.object({
        instanceId: v.string(),
        sectionId: v.string(),
        enabled: v.optional(v.boolean()),
        /** Sanitized in portalDefaults / lib/portalSectionConfig. */
        props: v.optional(v.any()),
        layout: v.optional(
          v.object({
            colSpan: v.optional(v.number()),
            order: v.optional(v.number()),
          }),
        ),
      }),
    ),
    /** Sidebar / top / layout chrome for this version. */
    chrome: v.optional(v.any()),
    status: v.union(v.literal("draft"), v.literal("published")),
    createdByUserKey: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_portal_default", ["portalDefaultId", "updatedAt"])
    .index("by_organization", ["organizationId", "updatedAt"]),

  /**
   * Portal viewer progress on custom status-bar checklist steps.
   * Stable `stepId` + completion timestamps enable future automations.
   */
  portalSectionStepProgress: defineTable({
    organizationId: v.id("organizations"),
    pipelineFileId: v.id("pipeline"),
    portalDefaultId: v.optional(v.id("portalDefaults")),
    sectionInstanceId: v.string(),
    stepId: v.string(),
    completedAt: v.number(),
    /** emailKey, session subject, or "__preview__" for builder. */
    completedByKey: v.string(),
    /** Last event type written (stable for automation subscribers). */
    eventType: v.literal("portal.status_step.completed"),
  })
    .index("by_file_section", ["pipelineFileId", "sectionInstanceId"])
    .index("by_file_step", ["pipelineFileId", "stepId"])
    .index("by_organization", ["organizationId", "completedAt"]),

  documentVaultClientBundleTokens: defineTable({
    pipelineFileId: v.id("pipeline"),
    fileTaskIds: v.array(v.id("documentVaultFileTasks")),
    tokenHash: v.string(),
    status: v.union(v.literal("active"), v.literal("revoked")),
    mode: v.union(v.literal("all_outstanding"), v.literal("selective")),
    readOnlyPreview: v.optional(v.boolean()),
    /** Broker agent preview may edit blocks (not read-only). */
    brokerAgentCapable: v.optional(v.boolean()),
    expiresAt: v.number(),
    createdByUserKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_pipeline", ["pipelineFileId"]),

  /**
   * Unified link registry — client portal + lender delivery sessions.
   * Plain token lives only in the URL; registry stores tokenHash for lookup.
   */
  clientPortalLinks: defineTable({
    pipelineFileId: v.id("pipeline"),
    organizationId: v.optional(v.id("organizations")),
    linkType: v.optional(
      v.union(
        v.literal("client"),
        v.literal("lender"),
        v.literal("task_upload"),
        v.literal("portal_grant"),
      ),
    ),
    bundleTokenId: v.optional(v.id("documentVaultClientBundleTokens")),
    lenderDeliveryTokenId: v.optional(v.id("lenderDeliveryTokens")),
    fileTaskUploadTokenId: v.optional(v.id("documentVaultFileTaskUploadTokens")),
    fileTaskId: v.optional(v.id("documentVaultFileTasks")),
    grantId: v.optional(v.id("clientPortalGrants")),
    lenderId: v.optional(v.id("lenders")),
    targetName: v.optional(v.string()),
    emailKey: v.optional(v.string()),
    companySlug: v.optional(v.string()),
    title: v.optional(v.string()),
    tokenHash: v.string(),
    status: v.union(
      v.literal("active"),
      v.literal("revoked"),
      v.literal("expired"),
    ),
    linkKind: v.optional(
      v.union(
        v.literal("client_invite"),
        v.literal("broker_preview"),
        v.literal("broker_agent"),
        v.literal("lender_delivery"),
        v.literal("task_upload"),
        v.literal("portal_grant"),
        /** Selective client portal link scoped to one block_assignment file task. */
        v.literal("block_fill"),
      ),
    ),
    /** True when the live URL still uses `/lender-delivery/{token}` instead of slug URLs. */
    legacyPath: v.optional(v.boolean()),
    /**
     * Last issued absolute URL (token plaintext only stored here for operator copy).
     * Rotates on regenerate; never exposed on public portal queries.
     */
    issuedUrl: v.optional(v.string()),
    requiresVerification: v.optional(v.boolean()),
    verificationType: v.optional(
      v.union(v.literal("passcode"), v.literal("email_otp")),
    ),
    verificationPasscodeHash: v.optional(v.string()),
    verificationPasscodeSalt: v.optional(v.string()),
    verificationEmail: v.optional(v.string()),
    expiresAt: v.number(),
    revokedAt: v.optional(v.number()),
    createdByUserKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_pipeline_created", ["pipelineFileId", "createdAt"])
    .index("by_tokenHash", ["tokenHash"])
    .index("by_companySlug_tokenHash", ["companySlug", "tokenHash"])
    .index("by_fileTaskUploadToken", ["fileTaskUploadTokenId"])
    .index("by_grant", ["grantId"]),

  /** Short-lived proof tokens after passcode/OTP verification for gated portal links. */
  portalLinkAccessProofs: defineTable({
    tokenHash: v.string(),
    proofToken: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_proofToken", ["proofToken"])
    .index("by_tokenHash", ["tokenHash"]),

  /** Pending email OTP codes for portal link verification. */
  portalVerificationOtps: defineTable({
    linkId: v.id("clientPortalLinks"),
    emailKey: v.string(),
    otpHash: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
  }).index("by_link", ["linkId"]),

  lenderDeliveryTokens: defineTable({
    pipelineFileId: v.id("pipeline"),
    lenderId: v.id("lenders"),
    tokenHash: v.string(),
    status: v.union(v.literal("active"), v.literal("revoked")),
    permission: v.union(v.literal("view_only"), v.literal("downloadable")),
    includedDocumentIds: v.array(v.id("libraryDocuments")),
    includedFolderIds: v.array(v.id("documentFolders")),
    includedFileTaskIds: v.array(v.id("documentVaultFileTasks")),
    expiresAt: v.number(),
    createdByUserKey: v.string(),
    createdAt: v.number(),
  }).index("by_tokenHash", ["tokenHash"]),

  /** Point-in-time snapshots of pipeline block settings before client overwrites. */
  pipelineBlockSnapshots: defineTable({
    pipelineFileId: v.id("pipeline"),
    blockId: v.string(),
    fileTaskId: v.optional(v.id("documentVaultFileTasks")),
    snapshotData: v.any(),
    source: v.union(
      v.literal("client_submission"),
      v.literal("broker_manual"),
      v.literal("broker_restore"),
    ),
    label: v.optional(v.string()),
    createdByUserKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_pipeline_block", ["pipelineFileId", "blockId"])
    .index("by_fileTask", ["fileTaskId"]),

  /**
   * Central document library: versioned blobs in Convex `_storage`, linked to
   * pipeline files, CRM contacts, and/or tasks. See `convex/libraryDocuments.ts`.
   */
  libraryDocuments: defineTable({
    organizationId: v.optional(v.id("organizations")),
    title: v.string(),
    createdByUserKey: v.string(),
    /** Monotonic version count; 0 = metadata only, no blob yet. */
    latestVersionNumber: v.number(),
    latestVersionId: v.optional(v.id("libraryDocumentVersions")),
    latestFileName: v.optional(v.string()),
    latestContentType: v.optional(v.string()),
    latestSize: v.optional(v.number()),
    latestUploadedAt: v.optional(v.number()),
    /** Phase 43 — AI auto-filer suggestion (cleared on accept or manual category). */
    aiSuggestedCategory: v.optional(libraryDocumentCategoryV),
    aiConfidence: v.optional(v.number()),
    aiSuggestedTaxYear: v.optional(v.string()),
    aiSuggestedFolderName: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_organization_updatedAt", ["organizationId", "updatedAt"]),

  libraryDocumentVersions: defineTable({
    documentId: v.id("libraryDocuments"),
    version: v.number(),
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.optional(v.string()),
    size: v.optional(v.number()),
    uploadedByUserKey: v.string(),
    uploadedAt: v.number(),
    /** Phase 40.2 — highlights + sticky notes overlay metadata. */
    annotations: v.optional(
      v.object({
        highlights: v.array(
          v.object({
            id: v.string(),
            type: v.literal("highlight"),
            pageIndex: v.number(),
            x: v.number(),
            y: v.number(),
            width: v.number(),
            height: v.number(),
            color: v.optional(v.string()),
          }),
        ),
        notes: v.array(
          v.object({
            id: v.string(),
            type: v.literal("note"),
            pageIndex: v.number(),
            x: v.number(),
            y: v.number(),
            text: v.string(),
          }),
        ),
      }),
    ),
  }).index("by_document_version", ["documentId", "version"]),

  /**
   * Phase 42 — normalized page images for canvas-based crop/merge/assembly.
   * Each row is one raster page; crop/rotation persist here until finalize.
   */
  documentPageAssets: defineTable({
    documentId: v.id("libraryDocuments"),
    storageId: v.id("_storage"),
    order: v.number(),
    sourceWidth: v.number(),
    sourceHeight: v.number(),
    cropData: v.optional(
      v.object({
        x: v.number(),
        y: v.number(),
        w: v.number(),
        h: v.number(),
      }),
    ),
    rotation: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_document_order", ["documentId", "order"]),

  /** Phase 40.3 — lightweight view/edit audit for document properties panel. */
  libraryDocumentAccessEvents: defineTable({
    documentId: v.id("libraryDocuments"),
    pipelineFileId: v.optional(v.id("pipeline")),
    userKey: v.string(),
    action: v.union(
      v.literal("view"),
      v.literal("edit"),
      v.literal("download"),
    ),
    at: v.number(),
  })
    .index("by_document_at", ["documentId", "at"])
    .index("by_pipeline_document", ["pipelineFileId", "documentId"]),

  /**
   * Associates a library document with one registry anchor among pipeline file,
   * individual contact, business entity (`clients`), lender, or task.
   * Multiple links per document are allowed (e.g. pipeline + contact + entity).
   */
  libraryDocumentLinks: defineTable({
    documentId: v.id("libraryDocuments"),
    pipelineFileId: v.optional(v.id("pipeline")),
    contactId: v.optional(v.id("contacts")),
    /** Phase Registry-1 — native entity vault (borrower / partner org). */
    clientId: v.optional(v.id("clients")),
    /** Phase Registry-1 — native lender vault. */
    lenderId: v.optional(v.id("lenders")),
    taskId: v.optional(v.id("tasks")),
    /** Phase 39.2 — optional folder placement within a pipeline file vault. */
    folderId: v.optional(v.id("documentFolders")),
    /** File Task requirement container (loose files at task root). */
    fileTaskId: v.optional(v.id("documentVaultFileTasks")),
    assignedContactId: v.optional(v.id("contacts")),
    assignedClientId: v.optional(v.id("clients")),
    assignedLenderId: v.optional(v.id("lenders")),
    /** Phase 37.1.B — filter contact docs (ID, DD214, tax return, etc.). */
    documentCategory: v.optional(libraryDocumentCategoryV),
    /** Tax return year (e.g. "2024") when `documentCategory` is `tax_return`. */
    taxYear: v.optional(v.string()),
    /** Phase 40.3 — enterprise classification tags (pipeline scope). */
    customTags: v.optional(v.array(v.string())),
    /** Phase 41 — computed from category + latest upload timestamp. */
    expiresAt: v.optional(v.number()),
    /** Phase 46 — underwriter triage rejection on pipeline link. */
    reviewStatus: v.optional(v.literal("rejected")),
    rejectionReason: v.optional(v.string()),
    rejectedAt: v.optional(v.number()),
    rejectedByUserKey: v.optional(v.string()),
    /** When true, client portal grant holders may view this pipeline link. Default internal. */
    isSharedWithClient: v.optional(v.boolean()),
    linkedAt: v.number(),
    linkedByUserKey: v.string(),
  })
    .index("by_document", ["documentId"])
    .index("by_pipeline_linkedAt", ["pipelineFileId", "linkedAt"])
    .index("by_contact_linkedAt", ["contactId", "linkedAt"])
    .index("by_contact_category", ["contactId", "documentCategory"])
    .index("by_client_linkedAt", ["clientId", "linkedAt"])
    .index("by_client_category", ["clientId", "documentCategory"])
    .index("by_lender_linkedAt", ["lenderId", "linkedAt"])
    .index("by_task_linkedAt", ["taskId", "linkedAt"])
    .index("by_folder", ["folderId"])
    .index("by_fileTask", ["fileTaskId"]),

  /**
   * E-signature envelopes for library document versions (Dropbox Sign / HelloSign
   * or internal demo). See `convex/signatures.ts`, `convex/signatureActions.ts`.
   */
  signatureEnvelopes: defineTable({
    libraryDocumentId: v.id("libraryDocuments"),
    libraryVersionId: v.id("libraryDocumentVersions"),
    organizationId: v.optional(v.id("organizations")),
    title: v.string(),
    message: v.optional(v.string()),
    /** Sequential: each signer waits for prior; parallel: all notified together. */
    signingMode: v.union(v.literal("sequential"), v.literal("parallel")),
    provider: v.union(
      v.literal("internal_demo"),
      v.literal("dropbox_sign"),
    ),
    status: v.union(
      v.literal("draft"),
      v.literal("sending"),
      v.literal("sent"),
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("declined"),
      v.literal("voided"),
      v.literal("error"),
    ),
    externalRequestId: v.optional(v.string()),
    createdByUserKey: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
  })
    .index("by_document_updatedAt", ["libraryDocumentId", "updatedAt"])
    .index("by_external", ["externalRequestId"])
    .index("by_org_updatedAt", ["organizationId", "updatedAt"]),

  signatureSigners: defineTable({
    envelopeId: v.id("signatureEnvelopes"),
    orderIndex: v.number(),
    name: v.string(),
    /** Lowercase trimmed email for matching provider webhooks. */
    emailNormalized: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("awaiting_turn"),
      v.literal("email_sent"),
      v.literal("viewed"),
      v.literal("signed"),
      v.literal("declined"),
    ),
    providerSignerId: v.optional(v.string()),
    /** Present for demo or when provider returns an embedded URL (short-lived). */
    signUrl: v.optional(v.string()),
    signedAt: v.optional(v.number()),
    declinedAt: v.optional(v.number()),
    declineReason: v.optional(v.string()),
  }).index("by_envelope_order", ["envelopeId", "orderIndex"]),

  /** Append-only compliance / audit trail for signature workflows. */
  signatureAuditEvents: defineTable({
    envelopeId: v.id("signatureEnvelopes"),
    at: v.number(),
    actorType: v.union(
      v.literal("broker"),
      v.literal("signer"),
      v.literal("provider"),
      v.literal("system"),
    ),
    actorKey: v.string(),
    kind: v.string(),
    detail: v.optional(v.string()),
  }).index("by_envelope_at", ["envelopeId", "at"]),

  /**
   * Client portal — external clients scoped by org (or "none" for legacy files).
   * See `convex/clientPortal.ts` and `convex/clientPortalAdmin.ts`.
   */
  clientPortalIdentities: defineTable({
    /** `organizationId` as string, or `"none"` when the pipeline row has no org. */
    orgScope: v.string(),
    emailKey: v.string(),
    passwordSalt: v.optional(v.string()),
    passwordHash: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_scope_email", ["orgScope", "emailKey"]),

  clientPortalGrants: defineTable({
    orgScope: v.string(),
    emailKey: v.string(),
    pipelineFileId: v.id("pipeline"),
    status: v.union(v.literal("active"), v.literal("revoked")),
    invitedByUserKey: v.string(),
    label: v.optional(v.string()),
    /**
     * External sharing: `view` = read-only; `view_upload` = read + upload docs.
     * Omitted on legacy rows → treated as view_upload.
     */
    permission: v.optional(
      v.union(v.literal("view"), v.literal("view_upload")),
    ),
    /** When set, grant stops working after this time (Unix ms). */
    grantExpiresAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_scope_email", ["orgScope", "emailKey"])
    .index("by_file", ["pipelineFileId"])
    .index("by_email_file", ["emailKey", "pipelineFileId"])
    .index("by_email", ["emailKey"]),

  clientPortalSessions: defineTable({
    tokenHash: v.string(),
    orgScope: v.string(),
    emailKey: v.string(),
    grantIds: v.array(v.id("clientPortalGrants")),
    expiresAt: v.number(),
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
  })
    .index("by_tokenHash", ["tokenHash"])
    /** Active sessions for an identity (third field range: expiresAt > now). */
    .index("by_scope_email_expires", ["orgScope", "emailKey", "expiresAt"]),

  clientPortalMagicLinks: defineTable({
    tokenHash: v.string(),
    orgScope: v.string(),
    emailKey: v.string(),
    grantIds: v.array(v.id("clientPortalGrants")),
    expiresAt: v.number(),
    usedAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_tokenHash", ["tokenHash"]),

  clientPortalUploads: defineTable({
    grantId: v.id("clientPortalGrants"),
    pipelineFileId: v.id("pipeline"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.optional(v.string()),
    size: v.optional(v.number()),
    /** Phase 39.2 — CRM contact resolved from portal grantee (when known). */
    uploaderContactId: v.optional(v.id("contacts")),
    /** Broker triage — omitted on legacy rows → treated as unreviewed. */
    reviewStatus: v.optional(
      v.union(v.literal("unreviewed"), v.literal("archived")),
    ),
    /** Set when promoted into `libraryDocuments` via broker action. */
    promotedLibraryDocumentId: v.optional(v.id("libraryDocuments")),
    /** Phase 39.4 — portal request this upload fulfills (for vault folder routing). */
    fulfilledRequestId: v.optional(v.id("clientPortalRequests")),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_grant", ["grantId", "createdAt"])
    .index("by_file_created", ["pipelineFileId", "createdAt"]),

  clientPortalRequests: defineTable({
    grantId: v.id("clientPortalGrants"),
    pipelineFileId: v.id("pipeline"),
    title: v.string(),
    description: v.optional(v.string()),
    /** Phase 39.4 — vault subfolder for promoted uploads fulfilling this request. */
    targetFolderId: v.optional(v.id("documentFolders")),
    status: v.union(v.literal("open"), v.literal("done")),
    createdByUserKey: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    clientCompletedNote: v.optional(v.string()),
    completedAt: v.optional(v.number()),
    /** Phase 41 — ties automated re-upload nudges to a vault document. */
    sourceDocumentId: v.optional(v.id("libraryDocuments")),
    requestKind: v.optional(
      v.union(
        v.literal("staleness"),
        v.literal("manual"),
        v.literal("rejection"),
      ),
    ),
    documentCategory: v.optional(libraryDocumentCategoryV),
  }).index("by_grant", ["grantId", "createdAt"]),

  clientPortalUpdates: defineTable({
    grantId: v.id("clientPortalGrants"),
    pipelineFileId: v.id("pipeline"),
    summary: v.string(),
    detail: v.optional(v.string()),
    createdByUserKey: v.string(),
    createdAt: v.number(),
  }).index("by_grant_at", ["grantId", "createdAt"]),

  /**
   * Deal-room messaging: team-only vs portal-visible threads on a pipeline file.
   * Optional `contactId` when the message references a CRM contact linked to the file.
   */
  fileMessages: defineTable({
    pipelineFileId: v.id("pipeline"),
    contactId: v.optional(v.id("contacts")),
    audience: v.union(v.literal("internal"), v.literal("portal")),
    parentMessageId: v.optional(v.id("fileMessages")),
    isRoot: v.boolean(),
    /** Roots: patched to own `_id` right after insert; replies: root id. */
    threadRootId: v.optional(v.id("fileMessages")),
    body: v.string(),
    authorKind: v.union(v.literal("team"), v.literal("client")),
    teamUserKey: v.optional(v.string()),
    clientEmailKey: v.optional(v.string()),
    authorLabel: v.optional(v.string()),
    organizationId: v.optional(v.id("organizations")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_file_audience_root_created", [
      "pipelineFileId",
      "audience",
      "isRoot",
      "createdAt",
    ])
    .index("by_thread_created", ["threadRootId", "createdAt"]),

  fileMessageAttachments: defineTable({
    messageId: v.id("fileMessages"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.optional(v.string()),
    size: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_message", ["messageId"]),

  /**
   * Append-only audit trail for external client portal access and broker invites.
   */
  clientPortalAudit: defineTable({
    at: v.number(),
    orgScope: v.string(),
    kind: v.string(),
    actorType: v.union(
      v.literal("client"),
      v.literal("broker"),
      v.literal("system"),
    ),
    /** Client events: emailKey; broker events: userKey */
    actorKey: v.string(),
    detail: v.optional(v.string()),
    pipelineFileId: v.optional(v.id("pipeline")),
    grantId: v.optional(v.id("clientPortalGrants")),
  })
    .index("by_file_at", ["pipelineFileId", "at"])
    .index("by_grant_at", ["grantId", "at"]),

  /**
   * Security-focused audit (auth failures, lockouts, anomaly detections).
   * `subjectKey` is typically portal emailKey or hashed magic-link id.
   */
  securityAuditLog: defineTable({
    at: v.number(),
    kind: v.string(),
    orgScope: v.optional(v.string()),
    subjectKey: v.optional(v.string()),
    detail: v.optional(v.string()),
  })
    .index("by_kind_at", ["kind", "at"])
    .index("by_scope_at", ["orgScope", "at"]),

  /**
   * Phase 1 client-centric overhaul — append-only audit for merge / conversion ops.
   */
  mergeAuditLogs: defineTable({
    organizationId: v.id("organizations"),
    operationType: v.union(
      v.literal("ContactMerge"),
      v.literal("EntityConversion"),
      v.literal("ClientMerge"),
      v.literal("RecordConsolidation"),
    ),
    /** Canonical id of the surviving record (contact, client, etc.). */
    survivingRecordId: v.string(),
    /** Canonical id of the merged-away record. */
    mergedRecordId: v.string(),
    /** Tables / junction edges updated during the operation. */
    affectedRelations: v.array(
      v.object({
        table: v.string(),
        edgeId: v.optional(v.string()),
        detail: v.optional(v.string()),
      }),
    ),
    performedBy: v.string(),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_org_createdAt", ["organizationId", "createdAt"])
    .index("by_org_operation", ["organizationId", "operationType"]),

  /**
   * Per-key counters for portal auth rate limits (password, magic link token hash).
   */
  portalAuthThrottle: defineTable({
    key: v.string(),
    failCount: v.number(),
    firstFailAt: v.number(),
    lockedUntil: v.number(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  /**
   * Append-only style snapshot metadata for automated DB exports (NDJSON in `_storage`).
   * Does not include self-referential rows; parts live in `dataBackupParts`.
   */
  dataBackupSnapshots: defineTable({
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    status: v.union(
      v.literal("running"),
      v.literal("complete"),
      v.literal("failed"),
    ),
    error: v.optional(v.string()),
    manifestStorageId: v.optional(v.id("_storage")),
    totalBytes: v.optional(v.number()),
    partCount: v.optional(v.number()),
    /** Resumable full-scan progress */
    progressTableIndex: v.optional(v.number()),
    progressCursor: v.optional(v.string()),
  })
    .index("by_started", ["startedAt"])
    .index("by_status_started", ["status", "startedAt"]),

  dataBackupParts: defineTable({
    snapshotId: v.id("dataBackupSnapshots"),
    tableName: v.string(),
    sequence: v.number(),
    storageId: v.id("_storage"),
    docCount: v.number(),
    byteSize: v.optional(v.number()),
  }).index("by_snapshot_table_seq", [
    "snapshotId",
    "tableName",
    "sequence",
  ]),

  /**
   * Machine API keys for external integrations (Bearer `idc_live_…`).
   * Org-scoped; acts as `actorUserKey` against existing RLS queries.
   */
  integrationApiKeys: defineTable({
    publicId: v.string(),
    secretSalt: v.string(),
    secretHash: v.string(),
    organizationId: v.id("organizations"),
    actorUserKey: v.string(),
    name: v.string(),
    /** e.g. `files:read`, `contacts:read`, or `*` */
    scopes: v.array(v.string()),
    createdAt: v.number(),
    revokedAt: v.optional(v.number()),
  })
    .index("by_publicId", ["publicId"])
    .index("by_organization", ["organizationId"]),

  /** OAuth2-style M2M clients (`client_id` prefix `int_oauth_`). */
  integrationOAuthClients: defineTable({
    publicId: v.string(),
    secretSalt: v.string(),
    secretHash: v.string(),
    organizationId: v.id("organizations"),
    actorUserKey: v.string(),
    name: v.string(),
    scopes: v.array(v.string()),
    createdAt: v.number(),
    revokedAt: v.optional(v.number()),
  })
    .index("by_publicId", ["publicId"])
    .index("by_organization", ["organizationId"]),

  /** Bearer tokens issued via client_credentials (`int_at_…`). */
  integrationAccessTokens: defineTable({
    publicId: v.string(),
    secretSalt: v.string(),
    secretHash: v.string(),
    oauthClientPublicId: v.string(),
    organizationId: v.id("organizations"),
    actorUserKey: v.string(),
    scopes: v.array(v.string()),
    expiresAt: v.number(),
    createdAt: v.number(),
    revokedAt: v.optional(v.number()),
  })
    .index("by_publicId", ["publicId"])
    .index("by_oauth_client", ["oauthClientPublicId"]),

  /** Rolling per-minute request counters for integration HTTP (see `INTEGRATION_API_RPM`). */
  integrationRateLimitBuckets: defineTable({
    credentialPublicId: v.string(),
    windowMinute: v.number(),
    count: v.number(),
  }).index("by_cred_window", ["credentialPublicId", "windowMinute"]),

  /**
   * External integration connector instances (CRM / email / messaging).
   * Webhook URL: POST `/api/v1/integrations/webhook?connector=<publicId>` .
   */
  integrationConnectors: defineTable({
    publicId: v.string(),
    organizationId: v.id("organizations"),
    name: v.string(),
    category: v.union(
      v.literal("crm"),
      v.literal("email"),
      v.literal("messaging"),
    ),
    /** Key from `lib/integrations/catalog.ts` (e.g. salesforce, sendgrid). */
    providerKey: v.string(),
    status: v.union(v.literal("active"), v.literal("paused")),
    /** Opaque provider config (API base URLs, metadata). No secrets — use env or vault later. */
    config: v.optional(v.any()),
    /** When set, inbound webhooks must send matching `X-Integration-Token` or `?token=` . */
    inboundVerifySalt: v.optional(v.string()),
    inboundVerifyHash: v.optional(v.string()),
    createdByUserKey: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_publicId", ["publicId"])
    .index("by_organization", ["organizationId"]),

  /**
   * Durable integration work: inbound events, syncs, and external-triggered actions.
   * Processed by `integrationJobWorker` with exponential backoff and dead-lettering.
   */
  integrationJobs: defineTable({
    organizationId: v.id("organizations"),
    connectorId: v.optional(v.id("integrationConnectors")),
    category: v.union(
      v.literal("crm"),
      v.literal("email"),
      v.literal("messaging"),
    ),
    providerKey: v.string(),
    kind: v.union(
      v.literal("inbound_event"),
      v.literal("sync_pull"),
      v.literal("sync_push"),
      v.literal("action"),
    ),
    /** Empty string when idempotency is not used (unique index still applies per org). */
    idempotencyKey: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("dead"),
    ),
    payload: v.any(),
    resultSummary: v.optional(v.string()),
    attemptCount: v.number(),
    maxAttempts: v.number(),
    nextAttemptAt: v.number(),
    lastError: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
    /** One-shot org automation bridge for `inbound_event` jobs (`integrationAutomationBridge`). */
    inboundAutomationDispatched: v.optional(v.boolean()),
  })
    .index("by_status_next", ["status", "nextAttemptAt"])
    .index("by_org_idempotency", ["organizationId", "idempotencyKey"])
    .index("by_organization", ["organizationId"]),

  /** Per-connector sync checkpoint (cursors, watermarks). */
  integrationSyncCursors: defineTable({
    connectorId: v.id("integrationConnectors"),
    resourceKey: v.string(),
    cursor: v.optional(v.string()),
    lastSyncedAt: v.number(),
    updatedAt: v.number(),
  }).index("by_connector_resource", ["connectorId", "resourceKey"]),

  /**
   * Org-level automations when integration webhooks receive payloads.
   * Complements per-account `userSimpleWorkflows` (file-scoped).
   */
  organizationIntegrationWorkflows: defineTable({
    organizationId: v.id("organizations"),
    updatedAt: v.number(),
    formatVersion: v.literal(1),
    rules: v.array(
      v.object({
        id: v.string(),
        enabled: v.boolean(),
        name: v.optional(v.string()),
        /** When set, only this connector public id matches. */
        connectorPublicId: v.optional(v.string()),
        action: v.union(
          v.object({
            type: v.literal("create_org_task"),
            title: v.string(),
            body: v.optional(v.string()),
          }),
          v.object({
            type: v.literal("enqueue_integration_job"),
            category: v.union(
              v.literal("crm"),
              v.literal("email"),
              v.literal("messaging"),
            ),
            providerKey: v.string(),
            kind: v.union(v.literal("action"), v.literal("sync_push")),
            connectorPublicId: v.optional(v.string()),
          }),
        ),
      }),
    ),
  }).index("by_organization", ["organizationId"]),

  /**
   * Canonical cross-channel communication thread for Phase 11. Legacy
   * `fileMessages` and `systemEmailLog` remain in place and can be linked in.
   */
  communicationThreads: defineTable({
    publicId: v.string(),
    organizationId: v.id("organizations"),
    threadKey: v.string(),
    channel: v.union(
      v.literal("email"),
      v.literal("sms"),
      v.literal("push"),
      v.literal("portal"),
      v.literal("voice"),
      v.literal("webhook"),
    ),
    scopeKind: v.union(
      v.literal("organization"),
      v.literal("pipeline_file"),
      v.literal("contact"),
      v.literal("lender"),
    ),
    title: v.optional(v.string()),
    relatedPipelineFileId: v.optional(v.id("pipeline")),
    relatedContactId: v.optional(v.id("contacts")),
    relatedLenderId: v.optional(v.id("lenders")),
    rootFileMessageId: v.optional(v.id("fileMessages")),
    rootSystemEmailLogId: v.optional(v.id("systemEmailLog")),
    createdByUserKey: v.string(),
    lastMessageAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_publicId", ["publicId"])
    .index("by_org_threadKey", ["organizationId", "threadKey"])
    .index("by_org_created", ["organizationId", "createdAt"])
    .index("by_org_file", ["organizationId", "relatedPipelineFileId", "updatedAt"])
    .index("by_org_contact", ["organizationId", "relatedContactId", "updatedAt"])
    .index("by_org_lender", ["organizationId", "relatedLenderId", "updatedAt"]),

  /**
   * Provider-agnostic outbound message envelope. One row can mirror legacy
   * `systemEmailLog` / `fileMessages` while exposing a unified queue + audit
   * surface for future SMS / push / voice providers.
   */
  outboundMessages: defineTable({
    publicId: v.string(),
    organizationId: v.id("organizations"),
    threadId: v.optional(v.id("communicationThreads")),
    channel: v.union(
      v.literal("email"),
      v.literal("sms"),
      v.literal("push"),
      v.literal("portal"),
      v.literal("voice"),
      v.literal("webhook"),
    ),
    status: v.union(
      v.literal("draft"),
      v.literal("queued"),
      v.literal("scheduled"),
      v.literal("sending"),
      v.literal("sent"),
      v.literal("delivered"),
      v.literal("opened"),
      v.literal("clicked"),
      v.literal("failed"),
      v.literal("bounced"),
      v.literal("replied"),
      v.literal("archived"),
    ),
    priority: v.union(
      v.literal("low"),
      v.literal("normal"),
      v.literal("high"),
      v.literal("critical"),
    ),
    source: v.union(
      v.literal("manual_compose"),
      v.literal("automation"),
      v.literal("notification"),
      v.literal("test_mode"),
    ),
    senderUserKey: v.string(),
    senderLabel: v.optional(v.string()),
    recipientSummary: v.array(v.string()),
    subject: v.optional(v.string()),
    bodyText: v.string(),
    bodyHtml: v.optional(v.string()),
    channelAddress: v.optional(v.string()),
    providerKey: v.string(),
    providerMessageId: v.optional(v.string()),
    templateId: v.optional(v.id("communicationTemplates")),
    templateVersionId: v.optional(v.id("communicationTemplateVersions")),
    automationRouteId: v.optional(v.id("communicationAutomationRoutes")),
    relatedPipelineFileId: v.optional(v.id("pipeline")),
    relatedContactId: v.optional(v.id("contacts")),
    relatedLenderId: v.optional(v.id("lenders")),
    rootFileMessageId: v.optional(v.id("fileMessages")),
    rootSystemEmailLogId: v.optional(v.id("systemEmailLog")),
    draftScopeKey: v.optional(v.string()),
    dedupeKey: v.optional(v.string()),
    isTestMode: v.boolean(),
    scheduledFor: v.optional(v.number()),
    queuedAt: v.optional(v.number()),
    sendingAt: v.optional(v.number()),
    sentAt: v.optional(v.number()),
    deliveredAt: v.optional(v.number()),
    failedAt: v.optional(v.number()),
    bouncedAt: v.optional(v.number()),
    repliedAt: v.optional(v.number()),
    archivedAt: v.optional(v.number()),
    openCount: v.number(),
    clickCount: v.number(),
    lastOpenedAt: v.optional(v.number()),
    providerResponsePayload: v.optional(v.any()),
    latestError: v.optional(v.string()),
    retryCount: v.number(),
    maxRetries: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_publicId", ["publicId"])
    .index("by_org_created", ["organizationId", "createdAt"])
    .index("by_status_schedule", ["status", "scheduledFor"])
    .index("by_status_updated", ["status", "updatedAt"])
    .index("by_org_status_schedule", ["organizationId", "status", "scheduledFor"])
    .index("by_org_thread", ["organizationId", "threadId", "createdAt"])
    .index("by_org_file", ["organizationId", "relatedPipelineFileId", "createdAt"])
    .index("by_org_contact", ["organizationId", "relatedContactId", "createdAt"])
    .index("by_org_lender", ["organizationId", "relatedLenderId", "createdAt"])
    .index("by_org_draft_scope", ["organizationId", "draftScopeKey"])
    .index("by_org_dedupe", ["organizationId", "dedupeKey"]),

  outboundMessageAttachments: defineTable({
    outboundMessageId: v.id("outboundMessages"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.optional(v.string()),
    size: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_message", ["outboundMessageId", "createdAt"]),

  outboundMessageAttempts: defineTable({
    outboundMessageId: v.id("outboundMessages"),
    organizationId: v.id("organizations"),
    attemptNumber: v.number(),
    channel: v.string(),
    providerKey: v.string(),
    status: v.union(
      v.literal("queued"),
      v.literal("sending"),
      v.literal("sent"),
      v.literal("delivered"),
      v.literal("failed"),
      v.literal("dead"),
    ),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    nextRetryAt: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    providerPayload: v.optional(v.any()),
    providerResponsePayload: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_message_attempt", ["outboundMessageId", "attemptNumber"])
    .index("by_org_started", ["organizationId", "startedAt"]),

  outboundProviderEvents: defineTable({
    outboundMessageId: v.id("outboundMessages"),
    organizationId: v.id("organizations"),
    channel: v.string(),
    providerKey: v.string(),
    eventType: v.union(
      v.literal("queued"),
      v.literal("sending"),
      v.literal("sent"),
      v.literal("delivered"),
      v.literal("opened"),
      v.literal("clicked"),
      v.literal("failed"),
      v.literal("bounced"),
      v.literal("replied"),
      v.literal("archived"),
      v.literal("retry_scheduled"),
    ),
    at: v.number(),
    summary: v.optional(v.string()),
    payload: v.optional(v.any()),
  })
    .index("by_message_at", ["outboundMessageId", "at"])
    .index("by_org_at", ["organizationId", "at"]),

  communicationTemplates: defineTable({
    organizationId: v.optional(v.id("organizations")),
    scope: v.union(v.literal("global"), v.literal("organization")),
    slug: v.string(),
    name: v.string(),
    channel: v.union(
      v.literal("email"),
      v.literal("sms"),
      v.literal("push"),
      v.literal("portal"),
      v.literal("voice"),
      v.literal("webhook"),
    ),
    status: v.union(
      v.literal("draft"),
      v.literal("published"),
      v.literal("archived"),
    ),
    roleRestrictions: v.optional(v.array(v.string())),
    publishedVersion: v.optional(v.number()),
    currentDraftVersion: v.optional(v.number()),
    createdByUserKey: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org_slug", ["organizationId", "slug"])
    .index("by_scope_slug", ["scope", "slug"])
    .index("by_org_updated", ["organizationId", "updatedAt"]),

  communicationTemplateVersions: defineTable({
    templateId: v.id("communicationTemplates"),
    organizationId: v.optional(v.id("organizations")),
    version: v.number(),
    status: v.union(
      v.literal("draft"),
      v.literal("published"),
      v.literal("archived"),
    ),
    subjectTemplate: v.optional(v.string()),
    bodyTemplate: v.string(),
    previewVariables: v.optional(v.any()),
    conditionalBlocks: v.optional(v.any()),
    createdByUserKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_template_version", ["templateId", "version"])
    .index("by_template_created", ["templateId", "createdAt"]),

  communicationAutomationRoutes: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    enabled: v.boolean(),
    triggerKind: v.union(
      v.literal("pipeline_stage_changed"),
      v.literal("task_overdue"),
      v.literal("document_uploaded"),
      v.literal("comment_mentioned"),
      v.literal("assignment_changed"),
      v.literal("borrower_inactive"),
      v.literal("lender_response"),
      v.literal("manual_invocation"),
    ),
    channel: v.union(
      v.literal("email"),
      v.literal("sms"),
      v.literal("push"),
      v.literal("portal"),
      v.literal("voice"),
      v.literal("webhook"),
    ),
    templateId: v.optional(v.id("communicationTemplates")),
    templateVersionId: v.optional(v.id("communicationTemplateVersions")),
    recipientMode: v.union(
      v.literal("explicit"),
      v.literal("file_contacts"),
      v.literal("assigned_user"),
      v.literal("watchers"),
      v.literal("lender_contacts"),
      v.literal("organization_role"),
    ),
    staticRecipients: v.optional(v.array(v.string())),
    roleKeys: v.optional(v.array(v.string())),
    timingMode: v.union(
      v.literal("immediate"),
      v.literal("delay"),
      v.literal("scheduled"),
    ),
    delayMinutes: v.optional(v.number()),
    retryPolicy: v.optional(v.any()),
    priority: v.optional(
      v.union(
        v.literal("low"),
        v.literal("normal"),
        v.literal("high"),
        v.literal("critical"),
      ),
    ),
    createdByUserKey: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org_enabled", ["organizationId", "enabled"])
    .index("by_org_trigger", ["organizationId", "triggerKind", "updatedAt"]),

  /** Append-only analytics for org emails (`systemEmailLog`). */
  systemEmailEvents: defineTable({
    emailLogId: v.id("systemEmailLog"),
    organizationId: v.id("organizations"),
    at: v.number(),
    kind: v.union(
      v.literal("queued"),
      v.literal("sent"),
      v.literal("send_failed"),
      v.literal("open"),
      v.literal("reply_inbound"),
      v.literal("reply_marked"),
    ),
    /** Redacted: short UA prefix, correlation ids — never full message bodies. */
    detail: v.optional(v.string()),
  })
    .index("by_email", ["emailLogId", "at"])
    .index("by_organization_at", ["organizationId", "at"]),

  /**
   * Outbound email sent through the system (Resend). Org-scoped; body searchable
   * only by members with `email.send` / admin-equivalent.
   */
  systemEmailLog: defineTable({
    organizationId: v.id("organizations"),
    sentByUserKey: v.string(),
    status: v.union(
      v.literal("queued"),
      v.literal("sent"),
      v.literal("failed"),
    ),
    toAddresses: v.array(v.string()),
    ccAddresses: v.optional(v.array(v.string())),
    subject: v.string(),
    bodyText: v.string(),
    /** Final HTML sent to provider when HTML is used (may include open pixel). */
    bodyHtmlForProvider: v.optional(v.string()),
    relatedPipelineFileId: v.optional(v.id("pipeline")),
    relatedContactId: v.optional(v.id("contacts")),
    outboundMessageId: v.optional(v.id("outboundMessages")),
    provider: v.literal("resend"),
    providerMessageId: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    trackOpens: v.boolean(),
    /** Opaque token for `/email/track/:token` (unguessable). */
    openToken: v.optional(v.string()),
    openCount: v.number(),
    firstOpenedAt: v.optional(v.number()),
    /** Correlates manual or webhook inbound replies (no PII). */
    correlationId: v.string(),
    hasInboundReply: v.boolean(),
    lastReplySnippet: v.optional(v.string()),
    replyDetectedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
    sentAt: v.optional(v.number()),
  })
    .index("by_organization_created", ["organizationId", "createdAt"])
    .index("by_open_token", ["openToken"])
    .index("by_correlation", ["correlationId"])
    .index("by_outbound_message", ["outboundMessageId"]),

  /**
   * Future: Gmail / Microsoft inbox sync (OAuth). Rows exist so product can
   * migrate cleanly; today `mode` is always `disabled`.
   */
  emailInboxSyncPreferences: defineTable({
    organizationId: v.id("organizations"),
    userKey: v.string(),
    mode: v.union(v.literal("disabled"), v.literal("google_planned")),
    updatedAt: v.number(),
  }).index("by_org_user", ["organizationId", "userKey"]),

  /**
   * Outbound webhook subscriptions — we POST structured events to `targetUrl`.
   */
  outboundWebhookSubscriptions: defineTable({
    publicId: v.string(),
    organizationId: v.id("organizations"),
    name: v.string(),
    targetUrl: v.string(),
    /** HMAC-SHA256 signing secret (server-only; shown once on create / rotate). */
    signingSecret: v.string(),
    /** Allowed event types, or `*` for all (see `lib/webhooks/outboundEnvelope.ts`). */
    eventTypes: v.array(v.string()),
    status: v.union(v.literal("active"), v.literal("paused")),
    createdByUserKey: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_publicId", ["publicId"])
    .index("by_organization", ["organizationId"]),

  /** Queued POST attempts to subscriber URLs (retries + dead-lettering). */
  outboundWebhookDeliveries: defineTable({
    subscriptionId: v.id("outboundWebhookSubscriptions"),
    organizationId: v.id("organizations"),
    /** Same id as inside envelope — used for idempotency on subscriber side. */
    eventId: v.string(),
    eventType: v.string(),
    /** Full JSON envelope (`WebhookEnvelopeV1`). */
    payload: v.any(),
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("dead"),
    ),
    attemptCount: v.number(),
    maxAttempts: v.number(),
    nextAttemptAt: v.number(),
    lastError: v.optional(v.string()),
    lastHttpStatus: v.optional(v.number()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status_next", ["status", "nextAttemptAt"])
    .index("by_organization", ["organizationId"])
    .index("by_subscription", ["subscriptionId"]),

  /** Append-only log lines for debugging webhook deliveries. */
  outboundWebhookDeliveryLogs: defineTable({
    deliveryId: v.id("outboundWebhookDeliveries"),
    organizationId: v.id("organizations"),
    at: v.number(),
    level: v.union(v.literal("info"), v.literal("warn"), v.literal("error")),
    step: v.string(),
    detail: v.optional(v.string()),
  })
    .index("by_delivery", ["deliveryId", "at"])
    .index("by_organization", ["organizationId"]),

  /**
   * SaaS notification webhook endpoints — multi-channel routing (email/SMS/external).
   * Managed from Account Settings; deliveries run via `webhookDispatcher`.
   */
  webhooks: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    url: v.string(),
    isActive: v.boolean(),
    subscribedEvents: v.array(v.string()),
    createdByUserKey: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_organization", ["organizationId"]),

  webhook_logs: defineTable({
    webhookId: v.id("webhooks"),
    organizationId: v.id("organizations"),
    event: v.string(),
    payload: v.string(),
    status: v.union(
      v.literal("success"),
      v.literal("failed"),
      v.literal("retrying"),
    ),
    httpStatus: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    attempts: v.optional(v.number()),
    nextRetryAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_webhook", ["webhookId", "createdAt"])
    .index("by_organization", ["organizationId", "createdAt"]),

  /**
   * Snapshots of rows quarantined during `referentialIntegrity` repair (orphan / cross-org links).
   */
  referentialIntegrityQuarantine: defineTable({
    sourceTable: v.string(),
    sourceId: v.string(),
    snapshotJson: v.string(),
    reason: v.string(),
    createdAt: v.number(),
  }).index("by_source", ["sourceTable", "sourceId"]),

  /**
   * Canonical append-only collaboration / audit stream (structured).
   * Mirrors subset into `activityFeed` for UX; retained for compliance and automation.
   */
  collaborationActivityEvents: defineTable({
    organizationId: v.id("organizations"),
    at: v.number(),
    eventType: v.union(
      v.literal("file_created"),
      v.literal("file_updated"),
      v.literal("status_changed"),
      v.literal("task_assigned"),
      v.literal("task_completed"),
      v.literal("comment_added"),
      v.literal("document_uploaded"),
      v.literal("lender_interaction_created"),
      v.literal("note_edited"),
      v.literal("ownership_changed"),
      v.literal("deadline_changed"),
      v.literal("assignment_changed"),
      v.literal("communication_sent"),
      v.literal("communication_delivered"),
      v.literal("communication_failed"),
      v.literal("communication_retry_scheduled"),
      v.literal("presence_hint"),
    ),
    visibility: v.union(
      v.literal("org_wide"),
      v.literal("entity_participants"),
      v.literal("direct_recipients"),
      v.literal("internal_admin"),
    ),
    actorUserKey: v.string(),
    summary: v.string(),
    delta: v.optional(v.any()),
    recipientUserKeys: v.optional(v.array(v.string())),
    pipelineFileId: v.optional(v.id("pipeline")),
    taskId: v.optional(v.id("tasks")),
    lenderId: v.optional(v.id("lenders")),
    libraryDocumentId: v.optional(v.id("libraryDocuments")),
    contactId: v.optional(v.id("contacts")),
    collaborationThreadId: v.optional(v.id("collaborationThreads")),
  })
    .index("by_org_at", ["organizationId", "at"])
    .index("by_org_type_at", ["organizationId", "eventType", "at"])
    .index("by_org_file_at", ["organizationId", "pipelineFileId", "at"])
    .index("by_org_task_at", ["organizationId", "taskId", "at"]),

  /**
   * Ephemeral member presence (heartbeats). Rows expire; cron purges stale `expiresAt`.
   */
  memberPresence: defineTable({
    organizationId: v.id("organizations"),
    userKey: v.string(),
    status: v.union(
      v.literal("online"),
      v.literal("viewing_file"),
      v.literal("editing_file"),
      v.literal("idle"),
      v.literal("away"),
      v.literal("typing"),
    ),
    pipelineFileId: v.optional(v.id("pipeline")),
    collaborationThreadId: v.optional(v.id("collaborationThreads")),
    tabSessionId: v.optional(v.string()),
    /**
     * Granular workspace slice for multi-operator coordination (Phase 10).
     * `surfaceKey` disambiguates drawer block ids, note anchors, etc.
     */
    workspaceSurface: v.optional(
      v.union(
        v.literal("pipeline_drawer"),
        v.literal("file_messages"),
        v.literal("lenders_panel"),
        v.literal("documents"),
        v.literal("comments"),
        v.literal("tasks_panel"),
        v.literal("financial_terms"),
        v.literal("assignment"),
        v.literal("hub"),
      ),
    ),
    surfaceKey: v.optional(v.string()),
    /** Passive / read-mostly presence — softer halo, no edit-lock semantics. */
    observationOnly: v.optional(v.boolean()),
    updatedAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_org_user", ["organizationId", "userKey"])
    .index("by_org_file", ["organizationId", "pipelineFileId", "status"])
    .index("by_org_expires", ["organizationId", "expiresAt"]),

  /**
   * Assignable workflow roles on CRM / pipeline entities (multi-user).
   */
  entityAssignments: defineTable({
    organizationId: v.id("organizations"),
    entityKind: v.union(
      v.literal("pipeline_file"),
      v.literal("task"),
      v.literal("lender"),
      v.literal("library_document"),
    ),
    pipelineFileId: v.optional(v.id("pipeline")),
    taskId: v.optional(v.id("tasks")),
    lenderId: v.optional(v.id("lenders")),
    libraryDocumentId: v.optional(v.id("libraryDocuments")),
    role: v.union(
      v.literal("owner"),
      v.literal("assignee"),
      v.literal("watcher"),
      v.literal("follower"),
      v.literal("reviewer"),
      v.literal("approver"),
    ),
    userKey: v.string(),
    assignedByUserKey: v.string(),
    assignedAt: v.number(),
    revokedAt: v.optional(v.number()),
    note: v.optional(v.string()),
  })
    .index("by_org_file", ["organizationId", "pipelineFileId"])
    .index("by_org_task", ["organizationId", "taskId"])
    .index("by_org_lender", ["organizationId", "lenderId"])
    .index("by_org_library_doc", ["organizationId", "libraryDocumentId"])
    .index("by_org_user", ["organizationId", "userKey"]),

  collaborationThreads: defineTable({
    organizationId: v.id("organizations"),
    subjectKind: v.union(
      v.literal("pipeline_file"),
      v.literal("task"),
      v.literal("lender"),
      v.literal("library_document"),
      v.literal("internal_note"),
    ),
    pipelineFileId: v.optional(v.id("pipeline")),
    taskId: v.optional(v.id("tasks")),
    lenderId: v.optional(v.id("lenders")),
    libraryDocumentId: v.optional(v.id("libraryDocuments")),
    /** Stable key for anchored notes (e.g. `pipeline:<id>:block:<blockSortKey>`). */
    internalNoteKey: v.optional(v.string()),
    title: v.optional(v.string()),
    resolvedAt: v.optional(v.number()),
    resolvedByUserKey: v.optional(v.string()),
    createdByUserKey: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org_file", ["organizationId", "pipelineFileId", "createdAt"])
    .index("by_org_task", ["organizationId", "taskId", "createdAt"])
    .index("by_org_lender", ["organizationId", "lenderId", "createdAt"])
    .index("by_org_doc", ["organizationId", "libraryDocumentId", "createdAt"])
    .index("by_org_note_key", ["organizationId", "internalNoteKey"]),

  collaborationComments: defineTable({
    organizationId: v.id("organizations"),
    threadId: v.id("collaborationThreads"),
    parentCommentId: v.optional(v.id("collaborationComments")),
    body: v.string(),
    authorUserKey: v.string(),
    mentionUserKeys: v.optional(v.array(v.string())),
    audience: v.union(v.literal("internal"), v.literal("portal")),
    editedAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_thread_created", ["threadId", "createdAt"]),

  /**
   * Phase 19 — authenticated audit log entries per pipeline file (Convex `_creationTime`).
   */
  pipelineFileNotes: defineTable({
    organizationId: v.id("organizations"),
    pipelineFileId: v.id("pipeline"),
    authorUserKey: v.string(),
    content: v.string(),
    attachments: v.optional(
      v.array(
        v.object({
          storageId: v.id("_storage"),
          fileName: v.string(),
          mimeType: v.string(),
          size: v.number(),
        }),
      ),
    ),
    /** Phase 24.5 — unlimited pins; sort by pinnedAt desc among pinned rows. */
    isPinned: v.optional(v.boolean()),
    pinnedAt: v.optional(v.number()),
    pinnedBy: v.optional(v.string()),
    /** Phase 32.2 — `standard` (default) or `attempt` (task follow-up audit). */
    noteKind: v.optional(
      v.union(v.literal("standard"), v.literal("attempt")),
    ),
    linkedTaskId: v.optional(v.id("tasks")),
    /** Denormalized task title at attempt time (Phase 32.3). */
    linkedTaskTitle: v.optional(v.string()),
    attemptNumber: v.optional(v.number()),
  })
    .index("by_org_file", ["organizationId", "pipelineFileId"])
    .index("by_file", ["pipelineFileId"])
    .index("by_linked_task", ["linkedTaskId"]),

  /** Phase 24.5 — URL attachments on pipeline file notes. */
  pipelineFileNoteLinks: defineTable({
    noteId: v.id("pipelineFileNotes"),
    organizationId: v.id("organizations"),
    url: v.string(),
    title: v.optional(v.string()),
    createdAt: v.number(),
    createdBy: v.string(),
  })
    .index("by_note", ["noteId"])
    .index("by_org_note", ["organizationId", "noteId"]),

  /**
   * Phase 16 — owner-scoped event shell. Org membership does not grant visibility.
   */
  events: defineTable({
    organizationId: v.id("organizations"),
    ownerUserId: v.string(),
    ownerUserKey: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    eventType: v.optional(v.string()),
    location: v.optional(v.string()),
    coverStorageId: v.optional(v.id("_storage")),
    tags: v.optional(v.array(v.string())),
    pinnedAt: v.optional(v.number()),
    /** Lowercase denormalized search blob (title, location, tags, sections). */
    searchText: v.optional(v.string()),
    status: eventStatusV,
    timezone: v.string(),
    startsAt: v.optional(v.number()),
    endsAt: v.optional(v.number()),
    allDay: v.boolean(),
    multiDayKey: v.optional(v.string()),
    listSortKey: v.number(),
    calendarSortAt: v.number(),
    templateId: v.optional(v.id("eventTemplates")),
    templateVersion: v.optional(v.number()),
    clonedFromEventId: v.optional(v.id("events")),
    defaultPrintProfileId: v.optional(v.id("eventPrintProfiles")),
    provenance: v.optional(
      v.object({
        sourceKind: v.optional(v.string()),
        sourceId: v.optional(v.string()),
        convertedAt: v.optional(v.number()),
        convertedByUserKey: v.optional(v.string()),
      }),
    ),
    sectionCount: v.number(),
    itemCount: v.number(),
    archivedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    createdByUserKey: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_org_owner_list", ["organizationId", "ownerUserId", "listSortKey"])
    .index("by_org_owner_status_sort", [
      "organizationId",
      "ownerUserId",
      "status",
      "calendarSortAt",
    ])
    .index("by_org_owner_starts", ["organizationId", "ownerUserId", "startsAt"])
    .index("by_org_pinned", ["organizationId", "pinnedAt"]),

  eventSections: defineTable({
    eventId: v.id("events"),
    organizationId: v.id("organizations"),
    sectionKey: v.string(),
    title: v.string(),
    iconKey: v.string(),
    sortOrder: v.number(),
    collapsedByDefault: v.boolean(),
    customLabel: v.string(),
    archivedAt: v.optional(v.number()),
    sourceTemplateSectionId: v.optional(v.id("eventTemplateSections")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_event_sort", ["eventId", "sortOrder"])
    .index("by_event_key", ["eventId", "sectionKey"]),

  eventSectionItems: defineTable({
    eventId: v.id("events"),
    sectionId: v.id("eventSections"),
    organizationId: v.id("organizations"),
    itemType: eventSectionItemTypeV,
    title: v.string(),
    description: v.optional(v.string()),
    sortOrder: v.number(),
    parentItemId: v.optional(v.id("eventSectionItems")),
    isChecked: v.optional(v.boolean()),
    checkedAt: v.optional(v.number()),
    priority: v.optional(v.number()),
    statusKey: v.optional(v.string()),
    dueAt: v.optional(v.number()),
    reminderAt: v.optional(v.number()),
    assigneeUserKey: v.optional(v.string()),
    dependsOnItemId: v.optional(v.id("eventSectionItems")),
    recurrenceRule: v.optional(recurrenceRuleV),
    recurrenceParentItemId: v.optional(v.id("eventSectionItems")),
    printVisible: v.boolean(),
    archivedAt: v.optional(v.number()),
    sourceLineage: v.optional(sourceLineageV),
    linkedTaskId: v.optional(v.id("tasks")),
    createdByUserKey: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_section_sort", ["sectionId", "sortOrder"])
    .index("by_event", ["eventId"])
    .index("by_linked_task", ["linkedTaskId"])
    .index("by_parent", ["parentItemId"]),

  /**
   * Pending event share for emails with no auth account yet (Phase 16.3).
   */
  eventSharePendingInvites: defineTable({
    eventId: v.id("events"),
    organizationId: v.id("organizations"),
    inviteEmail: v.string(),
    collaboratorRole: eventCollaboratorRoleV,
    createdByUserId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_event", ["eventId"])
    .index("by_event_email", ["eventId", "inviteEmail"]),

  eventShellActivity: defineTable({
    eventId: v.id("events"),
    organizationId: v.id("organizations"),
    kind: v.string(),
    summary: v.string(),
    actorUserKey: v.string(),
    at: v.number(),
  }).index("by_event_at", ["eventId", "at"]),

  eventIdeas: defineTable({
    organizationId: v.id("organizations"),
    ownerUserId: v.string(),
    ownerUserKey: v.string(),
    title: v.string(),
    body: v.optional(v.string()),
    status: eventIdeaStatusV,
    capturedAt: v.number(),
    convertedToEventId: v.optional(v.id("events")),
    convertedAt: v.optional(v.number()),
    createdByUserKey: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org_owner_status", ["organizationId", "ownerUserId", "status"])
    .index("by_organization", ["organizationId"]),

  eventInvitations: defineTable({
    organizationId: v.id("organizations"),
    ownerUserId: v.string(),
    ownerUserKey: v.string(),
    title: v.string(),
    status: eventInvitationStatusV,
    host: v.optional(v.string()),
    venue: v.optional(v.string()),
    receivedAt: v.optional(v.number()),
    respondByAt: v.optional(v.number()),
    capturedAt: v.number(),
    convertedToEventId: v.optional(v.id("events")),
    convertedAt: v.optional(v.number()),
    createdByUserKey: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org_owner_status", ["organizationId", "ownerUserId", "status"])
    .index("by_organization", ["organizationId"]),

  eventTemplates: defineTable({
    organizationId: v.id("organizations"),
    ownerUserId: v.string(),
    ownerUserKey: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    version: v.number(),
    isPublished: v.boolean(),
    defaultPrintProfileId: v.optional(v.id("eventPrintProfiles")),
    createdByUserKey: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org_owner", ["organizationId", "ownerUserId"])
    .index("by_organization", ["organizationId"]),

  eventTemplateSections: defineTable({
    templateId: v.id("eventTemplates"),
    organizationId: v.id("organizations"),
    sectionKey: v.string(),
    title: v.string(),
    iconKey: v.string(),
    sortOrder: v.number(),
    collapsedByDefault: v.boolean(),
    customLabel: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_template_sort", ["templateId", "sortOrder"]),

  eventTemplateItems: defineTable({
    templateId: v.id("eventTemplates"),
    templateSectionId: v.id("eventTemplateSections"),
    organizationId: v.id("organizations"),
    itemType: eventSectionItemTypeV,
    title: v.string(),
    description: v.optional(v.string()),
    sortOrder: v.number(),
    priority: v.optional(v.number()),
    statusKey: v.optional(v.string()),
    recurrenceRule: v.optional(recurrenceRuleV),
    printVisible: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_template_section_sort", ["templateSectionId", "sortOrder"]),

  /**
   * Denormalized collaborator role for events — visibility still via resourceShares.
   */
  eventCollaborators: defineTable({
    eventId: v.id("events"),
    organizationId: v.id("organizations"),
    userId: v.string(),
    collaboratorRole: eventCollaboratorRoleV,
    resourceShareId: v.id("resourceShares"),
    createdByUserId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_event_user", ["eventId", "userId"])
    .index("by_resource_share", ["resourceShareId"]),

  eventPrintProfiles: defineTable({
    organizationId: v.id("organizations"),
    ownerUserId: v.string(),
    ownerUserKey: v.string(),
    eventId: v.optional(v.id("events")),
    templateId: v.optional(v.id("eventTemplates")),
    printKind: eventPrintKindV,
    title: v.string(),
    sectionKeys: v.array(v.string()),
    layout: v.optional(v.record(v.string(), v.any())),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_event", ["eventId"])
    .index("by_template", ["templateId"]),

  eventItemAttachments: defineTable({
    itemId: v.id("eventSectionItems"),
    eventId: v.id("events"),
    organizationId: v.id("organizations"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    mimeType: v.optional(v.string()),
    sizeBytes: v.optional(v.number()),
    createdByUserKey: v.string(),
    createdAt: v.number(),
  }).index("by_item", ["itemId"]),

  eventItemLinks: defineTable({
    itemId: v.id("eventSectionItems"),
    eventId: v.id("events"),
    organizationId: v.id("organizations"),
    url: v.string(),
    label: v.optional(v.string()),
    createdByUserKey: v.string(),
    createdAt: v.number(),
  }).index("by_item", ["itemId"]),

  eventItemActivity: defineTable({
    itemId: v.id("eventSectionItems"),
    eventId: v.id("events"),
    organizationId: v.id("organizations"),
    kind: eventItemActivityKindV,
    summary: v.optional(v.string()),
    actorUserKey: v.string(),
    at: v.number(),
  }).index("by_item_at", ["itemId", "at"]),

  eventConversionHistory: defineTable({
    organizationId: v.id("organizations"),
    sourceType: eventConversionSourceTypeV,
    sourceId: v.string(),
    targetEventId: v.id("events"),
    convertedByUserKey: v.string(),
    convertedAt: v.number(),
    snapshot: v.optional(v.any()),
  })
    .index("by_target", ["targetEventId"])
    .index("by_source", ["sourceType", "sourceId"]),

  eventItemTaskLinks: defineTable({
    eventItemId: v.id("eventSectionItems"),
    eventId: v.id("events"),
    taskId: v.id("tasks"),
    organizationId: v.id("organizations"),
    linkPolicy: v.union(v.literal("reference_only"), v.literal("sync_complete")),
    createdByUserKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_event_item", ["eventItemId"])
    .index("by_task", ["taskId"]),

  /** Future graph links — does not grant visibility (Phase 16+). */
  eventRelations: defineTable({
    eventId: v.id("events"),
    organizationId: v.id("organizations"),
    targetType: v.union(
      v.literal("client"),
      v.literal("project"),
      v.literal("pipeline"),
      v.literal("lender"),
      v.literal("referral"),
      v.literal("team_member"),
      v.literal("task"),
    ),
    targetId: v.string(),
    role: v.optional(v.string()),
    createdByUserKey: v.string(),
    createdAt: v.number(),
  }).index("by_event", ["eventId"]),

  /** Chunked rollback metadata for `dataMigration.run`. */
  dataMigrationRollbackChunks: defineTable({
    runId: v.string(),
    seq: v.number(),
    createdAt: v.number(),
    entries: v.array(v.any()),
  }).index("by_run_seq", ["runId", "seq"]),

  dataMigrationRuns: defineTable({
    runId: v.string(),
    mode: v.union(v.literal("dry_run"), v.literal("execute")),
    fingerprint: v.string(),
    startedAt: v.number(),
    status: v.union(
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    completedAt: v.optional(v.number()),
    summary: v.optional(v.any()),
    error: v.optional(v.string()),
  }).index("by_fingerprint_mode_status", ["fingerprint", "mode", "status"]),

  /** Platform-global feature encyclopedia (not org-scoped). */
  productKnowledgeArticles: defineTable({
    slug: v.string(),
    /** Original helpCenterContent id for tip / deep-link compatibility. */
    legacyId: v.optional(v.string()),
    title: v.string(),
    summary: v.string(),
    categoryId: v.string(),
    keywords: v.optional(v.array(v.string())),
    body: v.object({
      purpose: v.string(),
      whatYouCanDo: v.array(v.string()),
      storedHere: v.array(v.string()),
      storedElsewhere: v.array(v.string()),
      relatedSlugs: v.array(v.string()),
      paragraphs: v.optional(v.array(v.string())),
    }),
    developerGlossary: v.optional(
      v.object({
        routes: v.optional(v.array(v.string())),
        blockIds: v.optional(v.array(v.string())),
        navIds: v.optional(v.array(v.string())),
        convexQueries: v.optional(v.array(v.string())),
        componentPaths: v.optional(v.array(v.string())),
        notes: v.optional(v.array(v.string())),
      }),
    ),
    status: v.union(
      v.literal("draft"),
      v.literal("published"),
      v.literal("archived"),
    ),
    publishedAt: v.optional(v.number()),
    updatedAt: v.number(),
    sourceRevision: v.optional(v.string()),
    visibility: v.optional(
      v.object({
        orgPlans: v.optional(
          v.array(
            v.union(
              v.literal("basic"),
              v.literal("pro"),
              v.literal("enterprise"),
            ),
          ),
        ),
        orgRoles: v.optional(v.array(v.string())),
        featureFlags: v.optional(v.array(v.string())),
        minRole: v.optional(v.string()),
      }),
    ),
  })
    .index("by_slug", ["slug"])
    .index("by_status", ["status"]),

  /** Human-facing product changelog (platform-global). */
  productReleasePosts: defineTable({
    slug: v.string(),
    title: v.string(),
    summary: v.string(),
    body: v.array(v.string()),
    changeType: v.union(
      v.literal("added"),
      v.literal("changed"),
      v.literal("moved"),
      v.literal("fixed"),
      v.literal("improved"),
      v.literal("redesigned"),
    ),
    affectedPersonas: v.array(v.string()),
    affectedArticleSlugs: v.array(v.string()),
    learnMoreSlug: v.optional(v.string()),
    status: v.union(
      v.literal("draft"),
      v.literal("published"),
      v.literal("archived"),
    ),
    publishedAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
    /** Optional Vercel deployment id (e.g. dpl_…) for ship traceability. */
    deploymentId: v.optional(v.string()),
    visibility: v.optional(
      v.object({
        orgPlans: v.optional(
          v.array(
            v.union(
              v.literal("basic"),
              v.literal("pro"),
              v.literal("enterprise"),
            ),
          ),
        ),
        orgRoles: v.optional(v.array(v.string())),
        featureFlags: v.optional(v.array(v.string())),
        minRole: v.optional(v.string()),
      }),
    ),
  })
    .index("by_slug", ["slug"])
    .index("by_status_publishedAt", ["status", "publishedAt"]),

  /** Automation inbox — Phase 3 generator writes here; admin approves. */
  productKnowledgeDrafts: defineTable({
    detectedChanges: v.array(
      v.object({
        kind: v.union(
          v.literal("route"),
          v.literal("nav"),
          v.literal("block"),
          v.literal("permission"),
          v.literal("schema"),
          v.literal("other"),
        ),
        id: v.string(),
        description: v.string(),
      }),
    ),
    confidence: v.optional(v.number()),
    proposedArticleSlug: v.optional(v.string()),
    proposedPostTitle: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_status", ["status"]),

  /** Per-user watermark for product release feed unread badge. */
  productReleaseReadReceipts: defineTable({
    userKey: v.string(),
    lastReadPublishedAt: v.number(),
    updatedAt: v.number(),
  }).index("by_userKey", ["userKey"]),
});
