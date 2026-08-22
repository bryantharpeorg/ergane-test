---

description: "Task list for Expense Notes implementation"
---

# Tasks: Expense Notes

**Input**: Design documents from `/specs/002-expense-notes/`

**Prerequisites**: plan.md (required), spec.md (required for user stories)

**Tests**: US1 ships standard-library `unittest` tests under `tests/`, which `scripts/gate.sh` discovers and runs. US2 has no JavaScript runner available inside the gate boundary; its scenarios are verified from the diff and the gate's audits.

**Organization**: Tasks are grouped by user story so each story can be implemented and demonstrated on its own. There is no setup or foundational phase: Ergane dispatches one agent per user story and nothing else, so a task outside a story's phase reaches no agent.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US2)
- Include exact file paths in descriptions

## Path Conventions

Single project, backend and frontend in one tree served same-origin: `src/` and
`src/frontend/` at the repository root, per spec 001's Structure Decision.
Tests live in `tests/` at the repository root, where `scripts/gate.sh` looks.

---

## Phase 1: User Story 1 - Keep a short note on an expense (Priority: P1) 🎯 MVP

**Goal**: One note rule — trim, empty is `null`, at most 280 characters — in `src/validators.py`, applied by create, by a new note-only `PATCH`, and by CSV import; `null` rather than `""` on every read; a `tests/` package the gate runs.

**Independent Test**: Create an expense with note `"  Lunch with client  "` and read back `"Lunch with client"`; create one with `""` and read back `null`; submit 281 characters and get `422` on `note` with no row written; `PATCH` a note and read it back; run `bash scripts/gate.sh` and see `unittest discover passed`.

### Implementation for User Story 1

- [ ] T001 [US1] Add `parse_note(value) -> Optional[str]` to `src/validators.py`: `None` returns `None`; a non-`str` raises `ValidationError("note must be text")`; otherwise strip, return `None` for the empty result, raise `ValidationError("note must be 280 characters or fewer")` when the stripped length exceeds 280, else return the stripped string. Define the limit once as `NOTE_MAX_CHARS = 280` beside `CATEGORIES` (spec US1-S1, US1-S2, US1-S3)
- [ ] T002 [US1] Change `_expense_row` in `src/main.py` to return `"note": row["note"] or None`, so every endpoint that serializes an expense — create, update, `GET /api/trips/{trip_id}`, `GET /api/trips/{trip_id}/expenses` — returns `null` for a stored `''` (spec US1-S2)
- [ ] T003 [US1] In `create_expense` in `src/main.py`, replace the inline note block (the `raw_note` branch with its 500-character check) with a single call to `parse_note(payload.get("note"))` inside a `try`/`except ValidationError` that records `errors["note"]`, and insert `note if note is not None else ""` (spec US1-S1, US1-S3)
- [ ] T004 [US1] Add `PATCH /api/expenses/{expense_id}` to `src/main.py`: run `parse_note(payload.get("note"))` and return `422` `{"errors": {"note": ...}}` on `ValidationError`; `UPDATE expenses SET note = ? WHERE id = ?` with `note if note is not None else ""`; raise `HTTPException(status_code=404, detail="expense not found")` when `rowcount == 0`; otherwise commit and return `200` with `_expense_row` of the re-selected row. Ignore any other key in the body (spec US1-S4)
- [ ] T005 [US1] In `import_csv` in `src/main.py`, replace `note = note_raw.strip()` and its 500-character check with `parse_note(note_raw)` inside the same `try`/`except ValidationError` pattern the date, amount and category checks use, appending `{"line": line_number, "reason": str(exc)}` and `continue` on failure, and storing `note if note is not None else ""` in `valid_rows` (spec US1-S5)
- [ ] T006 [P] [US1] Create `tests/__init__.py` (empty) and `tests/test_expense_notes.py` with a `unittest.TestCase` importing `from src.validators import NOTE_MAX_CHARS, ValidationError, parse_note` and covering: `"  Lunch with client  "` returns `"Lunch with client"`; `""` returns `None`; `"   "` returns `None`; `None` returns `None`; a string of exactly 280 `"x"` is returned unchanged; a string of 281 `"x"` raises `ValidationError` whose message is `note must be 280 characters or fewer`; a 290-character string that trims to 280 is accepted; `42` raises `ValidationError`. Import nothing outside the standard library and `src.validators` (spec US1-S6)
- [ ] T007 [US1] Run `bash scripts/gate.sh` from the repository root and confirm the `unit tests` step prints the test names and `unittest discover passed`, every audit passes, and the last line is `gate: PASS`. Report the output; a failing step is reported as failing (spec US1-S6)
- [ ] T008 [US1] Verify the read and write paths end to end against a running app per the Independent Test above: the trimmed note on create, `null` on an omitted and on an empty note from both `GET /api/trips/{trip_id}` and `GET /api/trips/{trip_id}/expenses`, `422` at 281 with `SELECT COUNT(*) FROM expenses` unchanged, `201` at 280, `PATCH` round-trips, `PATCH` on id 9999 returns `404`, and a three-row import with a 281-character note on row 2 reports `added: 2, skipped: 1` naming line 2 (spec US1-S1, US1-S2, US1-S3, US1-S4, US1-S5)

**Checkpoint**: The note rule is complete and tested on the API alone; the existing frontend still works because `textContent = null` renders as an empty cell

---

## Phase 2: User Story 2 - Read the note beneath the expense (Priority: P2)

**Goal**: The note leaves its table column and appears as a full-width row beneath its expense when present, nothing when absent; the form input is capped at 280.

**Independent Test**: Open a trip with one noted and one unnoted expense; the noted row is followed by exactly one `tr.expense-note` holding the text, the unnoted row by the next expense or nothing, the header has four `<th>` and no `Note`, the note input has `maxlength="280"`, and `bash scripts/gate.sh` passes.

### Implementation for User Story 2

- [ ] T009 [US2] In `src/frontend/trip.html`, remove the `<th>Note</th>` from `#expenses-table`'s header so it holds exactly four `<th>` — Date, Category, the `numeric` Amount, and the empty actions header — and add `maxlength="280"` to `<input type="text" id="note" name="note">` in `#add-expense-form` (spec US2-S2, US2-S3)
- [ ] T010 [US2] In `renderExpenses` in `src/frontend/trip-detail.js`, remove `noteCell` and its `append` so the expense row holds date, category, amount and action cells only; then, after `tbody.appendChild(row)`, when `expense.note` is a non-empty string create `const noteRow = document.createElement("tr")` with `className = "expense-note"`, one `<td>` with `colSpan = 4` and `textContent = expense.note`, and append `noteRow` to `tbody` immediately after `row`. A `null` note appends nothing. Do not add `expense-over-threshold` to the note row (spec US2-S1, US2-S2)
- [ ] T011 [P] [US2] Add a `.expense-note td` rule to `src/frontend/app.css`: `padding-top: 0`, `border-top: none`, `color: #6b7280`, `font-size: 0.875rem`, `white-space: pre-wrap`, so the note reads as a continuation of the row above it; add `.expense-note { cursor: default; }` so the existing `tbody tr { cursor: pointer }` does not apply to it (spec US2-S1)
- [ ] T012 [US2] Confirm the `422` path still surfaces a server note error: submit the form with a note the server rejects (temporarily via `curl` against `POST /api/trips/{trip_id}/expenses` with 281 characters, since the input's `maxlength` blocks it in the browser) and confirm `showErrors` writes the message into `#error-note` with no page reload — no change to `showErrors` is expected; report if one is needed (spec US2-S3)
- [ ] T013 [US2] Run `bash scripts/gate.sh` from the repository root and confirm `no remote script or stylesheet` and `no runtime egress from the frontend` pass and the last line is `gate: PASS`; confirm `git diff --stat main -- requirements.txt` is empty and the diff touches only `src/frontend/trip.html`, `src/frontend/trip-detail.js`, and `src/frontend/app.css` (spec US2-S4)
- [ ] T014 [US2] Verify in a browser per the Independent Test above — one noted and one unnoted expense, under the `All categories` filter and under a single-category filter, and after deleting the noted expense confirm its `tr.expense-note` is gone (spec US2-S1, US2-S2)

**Checkpoint**: Both stories land independently — the API defines `null`, the page renders it as nothing

---

## Dependencies & Execution Order

### Phase Dependencies

- **US1 (Phase 1)**: No dependencies. Writes `src/validators.py`, `src/main.py`, and creates `tests/`.
- **US2 (Phase 2)**: Waits on US1 having **merged**, not merely verified. Each node branches from `main` at dispatch, and US2's `if (expense.note)` check is only correct against an API that returns `null` rather than `""` for an absent note — a verification-gated edge would hand US2 a `main` whose `_expense_row` still returns empty strings.

This is the same shape as the `## Work Graph` block in `spec.md`, which is the
copy Ergane actually compiles. Change one and change the other.

### User Story Dependencies

- **US1 (P1)**: Standalone. The existing frontend keeps working against it because `textContent = null` renders as an empty cell.
- **US2 (P2)**: Renders the `null` that US1's `_expense_row` produces.

### Within Each User Story

- `parse_note` (T001) before any handler that calls it (T003–T005)
- `_expense_row` (T002) before the end-to-end check (T008)
- Template (T009) before the render change (T010) so `colspan="4"` matches the header
- Gate run last in each story, after every other task

### Parallel Opportunities

- The test module, T006, touches only `tests/` and can be written alongside T001–T005; it will fail until T001 lands, which is the point
- The CSS rule, T011, touches only `app.css` and can run alongside T009–T010

---

## Parallel Example: User Story 1

```bash
# T006 needs only the function signature from T001's description, so it can start at once:
Task: "Create tests/__init__.py and tests/test_expense_notes.py covering parse_note"
Task: "Add parse_note(value) -> Optional[str] to src/validators.py"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Phase 1 — `parse_note`, the three handlers, the `PATCH`, the tests
2. **STOP and VALIDATE**: `bash scripts/gate.sh` prints `gate: PASS` with the tests executed
3. Demo — a note can be added, corrected, and cleared through the API

### Incremental Delivery

1. US1 → the rule, the update endpoint, the tests → demo (MVP)
2. US2 → the note beneath the row → demo

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] labels map tasks to user stories for traceability, and to a dispatched agent: a task tagged for no story is work no agent is given
- `(spec USn-Sk)` cites the acceptance scenario a task exists to satisfy. A task may only cite a scenario of the story whose phase it sits in — a citation across stories reads as work filed under the wrong agent
- PR titles: `US1: Keep a short note on an expense` and `US2: Read the note beneath the expense` — `ergane spec landed` reads the story out of the squashed subject line
- The task most likely to be silently wrong is **T002**: if `_expense_row` keeps returning `""`, US1's own tests still pass (they test `parse_note`, not the read path) while US1-S2 fails and US2 renders nothing wrong either — T008 exists to catch exactly that
- Do not edit `scripts/gate.sh`, `ergane.yaml`, or the gates workflow in either story; the gate already runs `tests/` the moment the directory exists
