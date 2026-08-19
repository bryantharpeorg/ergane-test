---

description: "Task list for Trip Expenses implementation"
---

# Tasks: Trip Expenses

**Input**: Design documents from `/specs/001-trip-expenses/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/api.md

**Tests**: No automated tests were requested for this prototype, so no test tasks appear below. Verification is the acceptance scenarios in `spec.md` plus [quickstart.md](./quickstart.md).

**Organization**: Tasks are grouped by user story so each story can be implemented and demonstrated on its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US5)
- Include exact file paths in descriptions

## Path Conventions

Single project, backend and frontend in one tree served same-origin: `src/` and
`src/frontend/` at the repository root, per the Structure Decision in `plan.md`.

---

## Phase 1: User Story 1 - See what every trip cost (Priority: P1) 🎯 MVP

**Goal**: A trips list showing every trip with its destination, date range, and total spent, plus the form that creates trips — on top of the schema, connection factory and validators the whole feature stands on.

**Independent Test**: Create two trips, confirm each appears with the correct computed total; a trip with no expenses shows $0.00 rather than being omitted.

### Foundation for User Story 1

The schema, the connection factory, the shared validators and the seed. This
work sits inside US1 rather than in a phase of its own because Ergane dispatches
**one agent per user story and nothing else** — a task in no story's section is
handed to no agent and never gets built. US2–US5 all import `src/db.py` and
`src/validators.py`, and each waits on this story's *merge*, so they branch from
a `main` that already contains it.

- [ ] T001 [US1] Create the application skeleton this repository does not have: `requirements.txt` pinning `fastapi` and `uvicorn[standard]`, `src/main.py` exposing `app = FastAPI()` with `GET /api/health` returning `{"status": "ok"}`, and the `Dockerfile` and `compose.yaml` quickstart.md runs. Nothing is seeded — every path in plan.md's Structure Decision is created by this story
- [ ] T002 [P] [US1] Confirm `requirements.txt` names nothing beyond FastAPI and Uvicorn — `csv` and `sqlite3` are standard library, and FR-021 forbids anything fetched at run time
- [ ] T003 [US1] Create `src/schema.sql` with the `trips` table using the canonical columns `id, name, destination, start_date, end_date` per data-model.md
- [ ] T004 [US1] Add the `expenses` table to `src/schema.sql` with canonical columns `id, trip_id, date, amount_cents, category, note`, `trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE`, `CHECK (amount_cents > 0)`, and the six-value category `CHECK`
- [ ] T005 [US1] Add `CREATE INDEX idx_expenses_trip_date ON expenses (trip_id, date DESC);` to `src/schema.sql`
- [ ] T006 [US1] Write the `get_conn()` connection factory in `src/db.py` — open the SQLite file, set `row_factory = sqlite3.Row`, and execute `PRAGMA foreign_keys = ON` on **every** connection (data-model.md invariant 1; without it the cascade in T004 is silently inert)
- [ ] T007 [US1] Add `init_db()` to `src/db.py` applying `src/schema.sql` idempotently at app startup
- [ ] T008 [US1] Create `src/validators.py` defining `CATEGORIES = ("Lodging", "Food", "Transport", "Gear", "Fees", "Other")` as the single source of truth for the enum
- [ ] T009 [P] [US1] Add `parse_amount_to_cents(value: str) -> int` to `src/validators.py` — accept `^\d+(\.\d{1,2})?$`, return integer cents, raise on zero, negative, or more than two decimals
- [ ] T010 [P] [US1] Add `parse_date(value: str) -> str` to `src/validators.py` validating `YYYY-MM-DD`
- [ ] T011 [P] [US1] Add `parse_category(value: str, *, lenient: bool = False) -> str` to `src/validators.py` — exact case-sensitive match against `CATEGORIES`; when `lenient=True` trim and case-fold first (import path only)
- [ ] T012 [P] [US1] Add `format_cents(cents: int) -> str` to `src/validators.py` returning two-decimal dollars (`12450 → "124.50"`)
- [ ] T013 [US1] Write `src/seed.py` inserting the 2 trips and 5 expenses from data-model.md, skipping entirely when `SELECT COUNT(*) FROM trips` is non-zero
- [ ] T014 [US1] Verify boot: no `sqlite3.OperationalError`, `SELECT COUNT(*) FROM expenses` returns 5, and the two trip totals are `56450` and `26875`

### Implementation for User Story 1

- [ ] T015 [US1] Implement `GET /api/trips` in `src/main.py` returning every trip with computed `total_cents` via `LEFT JOIN expenses ... GROUP BY trips.id` and `COALESCE(SUM(amount_cents), 0)` — trips with no expenses must return `0`, not be dropped (spec US1-S3)
- [ ] T016 [US1] Implement `POST /api/trips` in `src/main.py` per contracts/api.md — validate non-empty name and destination, both dates via `parse_date`, and `end_date >= start_date`; return `201` or `422` with per-field messages (spec US1-S2, US1-S4)
- [ ] T017 [US1] Add the `GET /` route to `src/main.py` serving `src/frontend/index.html`
- [ ] T018 [P] [US1] Write `src/frontend/index.html` — a create-trip form above a trips table with columns name, destination, date range, total spent (spec US1-S1)
- [ ] T019 [P] [US1] Create `src/frontend/app.css` with the base page layout and table styling
- [ ] T020 [US1] Write `src/frontend/trips.js` to fetch `/api/trips` on load and render rows, formatting `total_cents` as `$X.XX` and the range as `start_date – end_date`
- [ ] T021 [US1] Wire the create-trip form in `src/frontend/trips.js` to `POST /api/trips`, re-rendering the table on success and surfacing `422` field messages inline (spec US1-S2)
- [ ] T022 [US1] Make each trips-table row navigate to `/trips/{id}` on click in `src/frontend/trips.js`

### Negative requirements owned by User Story 1

- [ ] T054 [P] [US1] Confirm no login page, account record, user table, password field, or session handling exists anywhere in `src/` (FR-020)
- [ ] T057 [P] [US1] Confirm `src/frontend/` contains no vendored third-party library file and the running app issues no outbound network request (FR-021)

**Checkpoint**: The trips list is fully functional on its own — the user can create trips and read totals off the list

---

## Phase 2: User Story 2 - Record and read a trip's expenses (Priority: P2)

**Goal**: A trip detail view with a newest-first expenses table, an inline add form, per-row delete, and the over-$200 highlight.

**Independent Test**: Open a trip, add four expenses including one over $200, confirm newest-first ordering and the highlight, delete one and confirm the total drops.

### Implementation for User Story 2

- [ ] T023 [US2] Implement `GET /api/trips/{trip_id}` in `src/main.py` returning `{trip, expenses, total_cents}` with expenses ordered `date DESC, id DESC`; `404` on unknown id (the `subtotals` key is added in US3) (spec US2-S2)
- [ ] T024 [US2] Implement `POST /api/trips/{trip_id}/expenses` in `src/main.py` using `parse_date`, `parse_amount_to_cents`, and `parse_category` (strict), inserting `amount_cents`; return `201` or `422` with per-field messages (spec US2-S1, US2-S4)
- [ ] T025 [US2] Make `note` optional on T024 — trimmed, defaulting to `""`, rejected over 500 characters
- [ ] T026 [US2] Implement `DELETE /api/expenses/{expense_id}` in `src/main.py` returning `204`, `404` on unknown id (spec US2-S5)
- [ ] T027 [US2] Add the `GET /trips/{trip_id}` route to `src/main.py` serving `src/frontend/trip.html`
- [ ] T028 [P] [US2] Write `src/frontend/trip.html` with, in order: trip header, subtotals block, chart container, add-expense form, category filter, expenses table, export button, import box — later stories fill the empty regions
- [ ] T029 [US2] Populate the add-expense form's category `<select>` in `src/frontend/trip.html` with exactly the six categories; no free-text category input anywhere (FR-004)
- [ ] T030 [US2] Write `src/frontend/trip-detail.js` to read the trip id from the URL, fetch `/api/trips/{id}`, and render the header and the expenses table newest-first
- [ ] T031 [US2] Wire the add-expense form in `src/frontend/trip-detail.js` to `POST /api/trips/{id}/expenses`, then re-render the table and total without a page reload (spec US2-S1)
- [ ] T032 [US2] Add a per-row delete button in `src/frontend/trip-detail.js` calling `DELETE /api/expenses/{id}` and re-rendering the table and total (spec US2-S5)
- [ ] T033 [US2] In `src/frontend/trip-detail.js`, apply class `expense-over-threshold` to any row whose `amount_cents > 20000` — strictly greater, so exactly $200.00 is not highlighted (spec US2-S3)
- [ ] T034 [P] [US2] Style `.expense-over-threshold` as bold red text in `src/frontend/app.css`

### Negative requirements owned by User Story 2

- [ ] T055 [P] [US2] Confirm no currency selector exists and every amount renders with a `$` prefix (FR-010)
- [ ] T056 [P] [US2] Confirm no free-text category input exists and `CATEGORIES` in `src/validators.py` is the only definition of the six values (FR-004)

**Checkpoint**: US1 and US2 both work — trips can be created, opened, and populated with expenses

---

## Phase 3: User Story 3 - Report spending by category (Priority: P3)

**Goal**: Per-category subtotals, one chart of them, and a category filter on the table.

**Independent Test**: With expenses across three categories, confirm subtotals match hand arithmetic, the chart shows one bar per non-empty category, and the filter narrows only the table.

### Implementation for User Story 3

- [ ] T035 [US3] Extend `GET /api/trips/{trip_id}` in `src/main.py` with the `subtotals` array grouped by category, omitting categories with no expenses (FR-012) (spec US3-S1, US3-S2)
- [ ] T036 [US3] Implement `GET /api/trips/{trip_id}/expenses` in `src/main.py` with an optional `?category=` param, ordered `date DESC, id DESC`; `422` on an unrecognised category (spec US3-S3)
- [ ] T037 [US3] Render the subtotals block in `src/frontend/trip-detail.js` from the `subtotals` array (spec US3-S1)
- [ ] T038 [US3] Render the per-category **horizontal bar chart** in `src/frontend/trip-detail.js` — one `<div class="bar">` per category with `style.width = subtotal_cents / max(subtotal_cents) * 100%`, label left, dollar value at the end. This is the chart type chosen in research.md R-001; do not substitute a pie and do not vendor a charting library (spec US3-S2)
- [ ] T039 [P] [US3] Style the bar chart in `src/frontend/app.css` — track, fill, label, and value alignment
- [ ] T040 [US3] Add the category filter control in `src/frontend/trip-detail.js` ("All" plus the six values) that re-fetches `/api/trips/{id}/expenses?category=` and re-renders the table only, leaving subtotals and chart untouched (spec US3-S3, US3-S4)
- [ ] T041 [US3] Make T031 and T032 also refresh the subtotals and chart after an add or delete

**Checkpoint**: US1–US3 all work independently — the trip detail view is complete except for CSV

---

## Phase 4: User Story 4 - Move data in and out as CSV (Priority: P4)

**Goal**: Per-trip CSV export, and paste-import that skips malformed rows and reports how many.

**Independent Test**: Export a three-expense trip and confirm header plus three rows; paste a five-row block with two bad rows and confirm three land with `skipped: 2` and the offending line numbers.

### Implementation for User Story 4

- [ ] T042 [US4] Implement `GET /api/trips/{trip_id}/export.csv` in `src/main.py` returning `text/csv` with header `date,amount,category,note` and one row per expense newest-first, amounts via `format_cents`, written with `csv.writer` so notes containing commas are quoted (spec US4-S1, US4-S2)
- [ ] T043 [US4] Set `Content-Disposition: attachment; filename="<slugified-trip-name>-expenses.csv"` on the T042 response
- [ ] T044 [US4] Implement `POST /api/trips/{trip_id}/import` in `src/main.py` accepting `{"csv": "<text>"}` and parsing with `csv.reader`
- [ ] T045 [US4] In the T044 handler, skip a leading row whose first cell case-insensitively equals `date` without counting it as an error, so an exported file re-imports cleanly (FR-018) (spec US4-S4)
- [ ] T046 [US4] In the T044 handler, validate each row with the same `validators.py` functions used by T024 — calling `parse_category` with `lenient=True` — collecting failures as `{line, reason}` instead of raising; a malformed row must never abort the run (FR-017) (spec US4-S3, US4-S5)
- [ ] T047 [US4] Make the T044 handler insert all valid rows in one transaction committed at the end and return `{"added", "skipped", "skipped_details"}` with `200` regardless of how many rows were skipped (spec US4-S3)
- [ ] T048 [P] [US4] Wire the Export CSV button in `src/frontend/trip-detail.js` to navigate to `/api/trips/{id}/export.csv` so the browser downloads the file
- [ ] T049 [US4] Wire the import paste box in `src/frontend/trip-detail.js` to `POST /api/trips/{id}/import`, then display `Added N, skipped M` and re-render table, subtotals, chart, and total
- [ ] T050 [US4] Render `skipped_details` in `src/frontend/trip-detail.js` as an expandable list of `line: reason`, shown only when `skipped > 0` (spec US4-S3)

**Checkpoint**: US1–US4 all work — data can enter in bulk and leave intact

---

## Phase 5: User Story 5 - Delete a trip without leaving orphans (Priority: P5)

**Goal**: Confirm-then-delete on a trip, taking its expenses with it.

**Independent Test**: Create a trip with expenses, delete it, confirm zero expenses referencing it remain in the data store.

### Implementation for User Story 5

- [ ] T051 [US5] Implement `DELETE /api/trips/{trip_id}` in `src/main.py` returning `204`, relying on `ON DELETE CASCADE` from T004 for the expenses; `404` on unknown id (spec US5-S3)
- [ ] T052 [US5] Add a per-row delete button in `src/frontend/trips.js` that calls native `confirm("Delete <name> and all its expenses? This cannot be undone.")` and only issues the request on acceptance (spec US5-S1, US5-S2)
- [ ] T053 [US5] Verify the cascade end to end per quickstart.md — create a trip, add an expense, delete the trip, and confirm `SELECT COUNT(*) FROM expenses WHERE trip_id = <id>` is `0`. A non-zero count means T006's pragma is missing, and nothing in the UI will reveal it (spec US5-S3)

**Checkpoint**: All five user stories independently functional

---

## Phase 6: Operator verification

**Purpose**: The one pass no node can do for itself — every story has landed, so
walk the whole thing end to end.

This phase deliberately names no story. Ergane's slice lint reports it as
reaching no node, and that report is correct: this is the operator's own closing
pass, not work for an agent.

- [ ] T058 Walk every acceptance scenario in spec.md and every check in quickstart.md end to end

---

## Dependencies & Execution Order

### Phase Dependencies

- **US1 (Phase 1)**: No dependencies. Carries the shared foundation — schema,
  `db.py`, `validators.py`, seed — because every other story imports it.
- **US2 (Phase 2)**: Waits on US1 having **merged**, not merely verified. Each
  node branches from `main` at dispatch, so a verification-gated edge would
  hand US2 a tree with no `src/db.py` in it.
- **US3, US4, US5 (Phases 3–5)**: Each waits on US2's merge and on nothing else.
  They are independent of one another and the factory may run them at the same
  time; all three write `src/frontend/trip-detail.js`, so whichever lands second
  rebases on the first.
- **Operator verification (Phase 6)**: after all five have landed.

This is the same shape as the `## Work Graph` block in `spec.md`, which is the
copy Ergane actually compiles. Change one and change the other.

### User Story Dependencies

- **US1 (P1)**: Standalone, and the only story that may assume nothing exists.
- **US2 (P2)**: Needs a trip to exist, which US1 creates, plus US1's validators.
- **US3 (P3)**: Extends T023's endpoint and T028's page regions.
- **US4 (P4)**: Needs an open trip and the expense writer from US2. Independent of US3.
- **US5 (P5)**: Needs trips (US1) and, to demonstrate the cascade, expenses (US2). Independent of US3 and US4.

### Within Each User Story

- Endpoints before the JS that calls them
- Shared validators (T008–T012) before any endpoint that validates
- Core rendering before interaction wiring
- Story complete before moving to the next priority

### Parallel Opportunities

- The four validator functions, T009–T012, are independent of each other in `src/validators.py` and can be written in parallel once T008 defines `CATEGORIES`
- The markup and stylesheet, T018 and T019, touch different files and can run alongside T015–T017
- The two CSS-only tasks, T034 and T039, can run alongside their sibling JS tasks
- The four negative-requirement audits, T054–T057, are independent, two in US1 and two in US2

---

## Parallel Example: the validators inside User Story 1

```bash
# After T008 lands CATEGORIES, launch the four validator functions together:
Task: "Add parse_amount_to_cents(value) -> int to src/validators.py"
Task: "Add parse_date(value) -> str to src/validators.py"
Task: "Add parse_category(value, *, lenient=False) -> str to src/validators.py"
Task: "Add format_cents(cents) -> str to src/validators.py"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Phase 1 — skeleton, schema, validators, seed, then the trips list
2. **STOP and VALIDATE**: trips list shows correct computed totals
3. Demo — this alone replaces the manual spreadsheet the tool exists to kill

### Incremental Delivery

1. US1 → foundation, trips and totals → demo (MVP)
2. US2 → expenses land and read back → demo
3. US3 → category reporting and the chart → demo
4. US4 → CSV in and out → demo
5. US5 → safe deletion → demo

Given the stated Thursday deadline, US1 + US2 is the defensible cut line: it
delivers the whole point of the tool. US3–US5 are each a self-contained
afternoon on top.

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] labels map tasks to user stories for traceability, and to a dispatched agent: a task tagged for no story is work no agent is given
- `(spec USn-Sk)` cites the acceptance scenario a task exists to satisfy. A task may only cite a scenario of the story whose phase it sits in — a citation across stories reads as work filed under the wrong agent
- Commit after each task or logical group
- The two tasks most likely to be silently wrong are **T006** (the foreign-key pragma — the cascade fails invisibly without it) and **T046** (import validation must collect failures, not raise); T053 and quickstart.md exist to catch exactly those
- The Dockerfile, compose file and entrypoint are created by T001. This repository is empty; nothing is seeded
