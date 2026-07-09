# Final Ranked Action Matrix

**Usage:** Execution backlog seed; **not** a sprint commitment.  
**Severity scale:** Critical → Future (bucket).  
**Impact scales:** Low / Medium / High (qualitative).

---

## Matrix (ranked)

| Priority | System | Problem | Severity | User impact | Business impact | Mobile impact | Perf impact | Arch impact | Est. complexity | Est. leverage | Suggested replacement / outcome | Dependencies | Risk if ignored |
|----------|--------|---------|----------|-------------|-----------------|---------------|-------------|-------------|-----------------|---------------|-----------------------------------|--------------|-----------------|
| Critical | Documentation | `project-intelligence-summary` §3 contradicts workspace sheet scroll model | Critical | Medium | High | Medium | Low | High | Low | **Very high** | Reconcile docs; single source of truth | ED+eng | Wrong roadmap decisions; bad hires/contractor output |
| Critical | `PipelineFileWorkspace` | Monolithic orchestrator; regression blast radius | High | High | High | High | High | **Very high** | High | **Very high** | Split data shell + region UI | Convex hooks design | Shipping slows; scroll/regression bugs |
| Critical | Hub table | Unbounded DOM at scale | High | High | High | High | **Very high** | Medium | Medium | **Very high** | Virtualization + saved views | Filters UX | Jank; churn at growth accounts |
| Critical | Overlay patterns | Task vs lender vs modal inconsistency | Medium | High | Medium | High | Medium | High | Medium | **Very high** | `RecordInspectorShell` + policy | Design QA | Training cost; trust dips |
| Critical | Contacts UX | Dual mental model (embedded vs links) | High | High | Medium | Medium | Low | Medium | Medium | High | Links-first + ContactInspector | Data narrative | Integrity perception; support load |
| High | Semantic colors | Brand/tint/stage collision | Medium | Medium | Medium | Medium | Low | Medium | Medium | High | Token role map (MD3-aligned) | Theme refactor | Misread states; fintech trust loss |
| High | `fileSharedState` consumers | Possible duplicate reads parent/block | Medium | Medium | Low | Medium | High | High | Medium | High | Single-flight query + slices | Block API | UI thrash; wasted bandwidth |
| High | Automation | Silent failures invisible | Medium | Medium | **High** | Low | Medium | Medium | Medium | **Very high** | Activity + delivery log strip | Webhook UX | Enterprise deals blocked |
| High | Portal | Generic errors / half branding | Medium | High | **High** | Medium | Low | Medium | Medium | High | Trust loading + structured errors | Brand assets | “Sketchy” client perception |
| High | Mobile hub | Table-only scan on 390px | High | High | Medium | **Very high** | Medium | Low | Medium | High | Card mode + filters snap | Hub data | Mobile ops fail in field |
| High | Messaging | Nested scroll + density | Medium | Medium | Low | **High** | Medium | Low | Medium | Medium | Snap conversation pattern | Vaul std | Fatigue; mis-taps |
| High | Scenario editor | Dense mobile form + keyboard | Medium | High | Medium | **Very high** | Medium | Low | Medium | High | Mobile snap + stepped flow | Shared forms | Abandon mid-edit |
| High | Lender attach mobile | List density + context loss | Medium | Medium | Medium | **High** | Low | Low | Medium | Medium | Peek snap + inspector | LenderDrawer | Slower closes |
| High | GlobalSearchPalette | Nav-only; underpowered vs Linear | Low | Medium | Low | Low | Low | Low | Low | Medium | Action verbs + scope | Cmd index | Power users stay slower |
| High | FieldSyncIndicator | Jargon risk in edge cases | Low | Medium | Low | Medium | Low | Low | Low | Medium | Plain-English copy pass | i18n later | Confusion on overrides |
| High | Testing / E2E | Split scroll selectors (`app-main` vs `pipeline-workspace`) | Medium | Low | Medium | Medium | Low | High | Medium | High | Unified governance tests | Playwright | Regressions slip |
| Medium | Tablet | Portrait wasted horizontal space | Medium | Medium | Low | High | Low | Low | High | Medium | Split preview experiment | Hub virt | Premium seat dissatisfaction |
| Medium | Navigation rail | No MD3 adaptive rail | Low | Low | Low | Low | Low | Medium | Medium | Medium | Add `≥ md` rail for hub | IA | Slower multi-app nav |
| Medium | Documents | Preview memory / gestures | Medium | Medium | Low | **High** | **High** | Low | Medium | Medium | Lazy tab unmount + sheet | Storage | Jank on low devices |
| Medium | Tasks matrix | Four grids unvirtualized | Medium | Medium | Low | Medium | **High** | Low | Medium | High | Row virtualization | DnD if any | Session heat |
| Medium | Density | No user/org table density | Low | Medium | Low | Low | Low | Low | Low | Medium | Comfortable / compact | Table primitive | Eye strain; zoom hacks |
| Medium | Insights vs activity | Competing status stories | Low | Medium | Low | Low | Low | Low | Low | Medium | Tab merge or hierarchy | Product copy | Cognitive overload |
| Medium | Settings IA | Duplicate branding entry | Low | Low | Low | Low | Low | Low | Low | Low | Consolidate nav | — | Minor confusion |
| Medium | Theme | SaaS vs classic double maintenance | Low | Low | Medium | Low | Low | **High** | **High** | Medium | Semantic bridge; fewer forks | DS | Long-term drag |
| Medium | Webhook UX | Technical-only surfaces | Low | Low | **High** | Low | Low | Low | Medium | High | Org-visible delivery UI | Admin | Ops distrust |
| Low | FAB / quick add | Inconsistent | Low | Low | Low | Medium | Low | Low | Low | Low | MD3 FAB policy (hub only?) | — | Minor |
| Low | Keyboard shortcuts | Undocumented | Low | Low | Low | Low | Low | Low | Low | Medium | Help overlay | Cmd palette | Power user gap |
| Low | Empty states | Illustration drift | Low | Low | Low | Low | Low | Low | Low | Low | `EmptyState` kit | Marketing | Polish |
| Low | AI lender discovery | Trust labeling | Low | Medium | Medium | Low | Low | Low | Low | Medium | “Proposed” chip always | Legal | Mis-click trust |
| Future | Material You | Dynamic color per tenant | Low | Low | Low | Low | Low | Medium | **High** | Medium | Optional harmonization | Brand pipeline | Nice-to-have |
| Future | Persistent inspector rail | Lightning-style | Low | Medium | Medium | Low | Low | **High** | **Very high** | Medium | Ultra-wide experiment | Inspector shell | None short-term |
| Future | Offline queue | Deferred mutations UX | Low | Medium | Medium | Medium | Low | **High** | **High** | Medium | Explicit queued state | Convex | Field reliability |

---

## Priority tier definitions

| Tier | Meaning |
|------|---------|
| **Critical** | Trust, scale, or architecture failure modes **this year** without intervention |
| **High** | Major UX/ops deficits or **high leverage** fixes |
| **Medium** | Meaningful polish or **medium-term** drag reduction |
| **Low** | Incremental quality |
| **Future** | Strategic bets beyond 12 months |

---

## Reading order with this matrix

1. Resolve **Critical** doc + orchestrator + hub scale.  
2. Ship **inspector shell** (unblocks many **High** rows).  
3. Mobile **hub** + **scenario** snap.  
4. **Automation** + **portal** trust.  
5. Iterate **Medium**/**Low** as capacity allows.

---

*See: `master-enterprise-modernization-report.md`, `component-scorecard.md`, `future-state-enterprise-blueprint.md`.*
