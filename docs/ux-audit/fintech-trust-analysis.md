# Fintech Trust Analysis — Direct Lending Connection

**Lens:** Emotional trust, perceived competence, **financial professionalism** — how UX helps users **commit money and reputation** without anxiety.

---

## 1. Visual stability

| Signal | DLC strength | Risk |
|--------|--------------|------|
| **Stable chrome** | Shell contracts documented; file scroll delegated — fewer jump bugs | **Regression** if nested scroll reintroduced |
| **Motion** | Tokenized easing; Vaul for snap | **Avoid** bounce on amounts; **respect** `prefers-reduced-motion` |
| **Typography** | Brand serif + MD-ish scale | Ensure **numbers** (currency, rate) use **tabular** lining where possible |

**Recommendation:** Audit **currency** and **rate** rendering for **consistent** rounding display vs stored precision (avoid “$1,000,000.04” surprises without explanation).

---

## 2. Status clarity (stages, snooze, archive)

| Element | Trust role |
|---------|-------------|
| **Stage pills** | Must map to **one** internal enum users learn |
| **Snooze** | Clear end date / relative time |
| **Archive** | Explicit “hidden from default pipeline” copy |

**Risk:** **Custom** org stage styles (`displaySettings`) — ensure **contrast** never drops below readable on all surfaces.

---

## 3. Destructive & irreversible actions

| Pattern | Expectation |
|---------|-------------|
| **Delete file**, **clear lenders** | Explicit confirm; show **consequences** (tasks? portal?) |
| **Mobile** | Destructive not in **thumb zone** without confirm |

**Audit target:** `dangerZone` block + archive/delete flows — **two-step** or typed confirm for worst cases.

---

## 4. Data truth & overrides (`fileSharedState`)

**Strength:** Indicators show **shared vs override** — builds trust if copy is plain English (“This block overrides the file total”).  
**Risk:** **Jargon** (“bus”, “override key”) leaking to end users — keep **operator-facing** labels.

---

## 5. Portal & client-facing surfaces

| Trust factor | Bar |
|--------------|-----|
| **Branding** | Org logo/colors — must feel **intentional**, not debug |
| **Errors** | Never raw stack; **retry** path |
| **Identity** | “You’re viewing as…” for grants |

---

## 6. Notifications

**Risk:** **Alert fatigue** erodes trust (“another meaningless ping”).  
**Mitigation:** Batch; severity levels; **mute** per file.

---

## 7. Color psychology

| Scheme | Perception |
|--------|------------|
| **Classic** forest/gold | Established brand; ensure **error** isn’t confused with gold |
| **SaaS** green/blue | “Enterprise CRM” — **destructive** must stay **red** |

**Recommendation:** **Semantic palette doc** — error/warning/success **fixed** hues independent of `--primary`.

---

## Prioritized trust backlog

| Priority | Item |
|----------|------|
| Critical | Semantic colors vs brand accents |
| High | Currency/rate display consistency |
| High | Destructive flow audit on mobile |
| Medium | Portal error/branding polish |
| Low | Tabular numerals for tables |

---

*See: `material-design-3-gap-analysis.md`, `mobile-operational-workflow-audit.md`.*
