# `data-testid` conventions

## Rules

1. Prefer **`data-testid`** over brittle CSS selectors for E2E and AI-driven tools.
2. Use **kebab-case** stable names: `pipeline-table`, `app-main-scroll`.
3. One primary test id per logical region (avoid duplicates across routes).
4. For dynamic lists, prefer **row anchors** (`data-testid` on predictable cells) over positional indices when possible.

## Canonical IDs (examples)

| id | Location |
|----|----------|
| `app-main-scroll` | `AppChrome` `<main>` — sole app scroll owner |
| `pipeline-table` | Pipeline hub data table |
| `pipeline-drawer-scroll` | File workspace bounded body (see pipeline specs) |

## Adding new ids

- Name after **user-meaning**, not component file names.
- Document new ids in PR descriptions until a UI map is centralized.
