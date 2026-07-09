# Common User Flow Optimization — Direct Lending Discovery

**Method:** Map high-frequency broker workflows to **steps**, **friction**, and **DLC-specific** fixes. Not generic UX platitudes.

---

## Flow: Create / open a file

| Step | DLC today (conceptual) | Friction | Optimization |
|------|------------------------|----------|--------------|
| From hub | Open row / button | Scroll + find in large table | **Saved views**, **default sort**, virtualized table |
| From switcher | In-file dropdown | Good for multi-file | Ensure **keyboard** and **mobile** picker parity |

---

## Flow: Manage deal (stage, economics, override)

| Step | Friction | Optimization |
|------|----------|--------------|
| Edit funding / rate | Multiple blocks + indicators | **Single “economics” summary** with drill-down; keep overrides **obvious** |
| Stage change | Inline in chrome | Good — add **undo toast** + activity clarity |

---

## Flow: Attach / select lenders

| Step | Friction | Optimization |
|------|----------|--------------|
| Browse catalog | Density + scroll | Mobile **snap** browse (see snap-sheet doc) |
| Scenario match | Cognitive load | Progressive disclosure: **top 5** + expand |
| Chosen lender visibility | Must stay obvious | **Compact chrome** must still show **chosen** |

---

## Flow: Run scenarios

| Friction | Optimization |
|----------|--------------|
| Criteria buried | Surface **criteria summary** chip in layout strip |
| Results long | Collapsible tiers + **export** |

---

## Flow: Communicate (messages, email, portal)

| Friction | Optimization |
|----------|--------------|
| Quick panels stack | **Tabs** or **priority-ordered** accordion inside utilities |
| Portal vs internal | Clear **labels** + iconography (trust) |

---

## Flow: Contacts / CRM lookup

| Friction | Optimization |
|------|--------------|
| Embedded vs linked contacts | **Product decision** + unified UI copy (see redundancy doc) |
| Jump to contact record | **Search** + consistent **return** breadcrumb |

---

## Flow: Notes

| Friction | Optimization |
|------|--------------|
| Split across blocks | One **canonical** notes entry with timeline link |

---

## Flow: Documents

| Friction | Optimization |
|------|--------------|
| Multiple surfaces | **One** document hub pattern from file |

---

## Flow: Tasks (assign, complete)

| Friction | Optimization |
|------|--------------|
| Matrix vs file block | Same **task model** in drawer; **deep link** from file |
| Snooze | Consistent with file snooze **metaphor** |

---

## Flow: Snooze / archive file

| Friction | Optimization |
|------|--------------|
| Discoverability | Snooze in chrome — good; **confirm** archive path scary enough |

---

## Flow: Mobile pipeline management

| Friction | Optimization |
|------|--------------|
| Table scan | **Card** view toggle for hub on mobile |
| Context switch | File **snap** + bottom nav policy |

---

## Flow: Search lenders / edit contacts

| Friction | Optimization |
|------|--------------|
| Global search vs page search | **Scoped search** when inside file |
| Contact edit | **Side sheet** inspector |

---

## Flow: Client onboarding (portal)

| Friction | Optimization |
|------|--------------|
| Trust gap | Portal **branding**, loading states, explicit **identity** |

---

## Cross-cutting: context switching

**Problem:** Hub ↔ File ↔ Task drawer ↔ Lender drawer — cognitive cost.  
**Mitigations:** Breadcrumb in drawers; **recent files**; **command palette** actions; **pinned files** (future).

---

## Prioritized workflow backlog

1. **Economics + override** clarity (daily).  
2. **Hub** scale + mobile card view.  
3. **Contact model** clarity.  
4. **Automation** visibility on file.

---

*See: `full-fintech-ux-audit.md`, `information-density-analysis.md`.*
