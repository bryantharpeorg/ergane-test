---
state: draft
depends_on_landed: []
---

# Feature Specification: Expense Notes

**Feature Branch**: `002-expense-notes`

**Created**: 2026-08-22

**Status**: Draft

**Input**: User description: "An expense may carry an optional free-text note of at most 280 characters, accepted on create and update and returned on every read; an empty note is no note. The trip-detail page shows the note beneath the expense's line when there is one and nothing when there is not."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Keep a short note on an expense (Priority: P1)

The user attaches a short free-text note to an expense when they create it, or
later by updating just the note, and reads it back on every expense they fetch.
A blank note is no note: the API returns `null` for it rather than an empty
string. A note longer than 280 characters is refused the same way a bad amount
is refused today — a `422` naming the field — and nothing is written.

**Why this priority**: The note is the only free-text the user has per expense
("Hotel, 3 nights", "Airport taxi both ways"). Spec 001 stored it with no
stated limit beyond a 500-character ceiling and no way to correct it after the
fact. This story pins the rule down — one length, one normalization, one
function — and gives the user a way to fix a note without deleting and
re-adding the expense. The frontend story cannot render "no note" as nothing
until this story defines when a note is `null`.

**Independent Test**: With the app running, create an expense with a note of
`"  Lunch with client  "` and confirm it reads back as `"Lunch with client"`;
create one with note `""` and confirm it reads back as `null`; submit a
281-character note and confirm a `422` on field `note` and no new row; `PATCH`
an existing expense's note and confirm the read reflects it. Run
`bash scripts/gate.sh` and confirm the unit tests ran and passed. Delivers the
whole note rule with no other story implemented.

**Acceptance Scenarios**:

1. **Given** a trip exists, **When** `POST /api/trips/{trip_id}/expenses` is sent with `{"date": "2026-08-20", "amount": "12.00", "category": "Food", "note": "  Lunch with client  "}`, **Then** the response is `201` with `"note": "Lunch with client"`, and `GET /api/trips/{trip_id}` lists that expense with the same note.
2. **Given** a trip exists, **When** an expense is created with `note` omitted, `null`, `""`, or `"   "`, **Then** the `201` body carries `"note": null`, and both `GET /api/trips/{trip_id}` and `GET /api/trips/{trip_id}/expenses` return `"note": null` for it.
3. **Given** a trip exists, **When** an expense is created with a 281-character note, **Then** the response is `422` with body `{"errors": {"note": "note must be 280 characters or fewer"}}` and `SELECT COUNT(*) FROM expenses` is unchanged; the same request with a 280-character note returns `201`.
4. **Given** an expense with id 2 exists with note `"Team dinner"`, **When** `PATCH /api/expenses/2` is sent with `{"note": "Team dinner, receipt filed"}`, **Then** the response is `200` with the full expense row whose `note` is `"Team dinner, receipt filed"` and whose `date`, `amount_cents`, and `category` are unchanged; a second `PATCH` with `{"note": ""}` returns `200` with `"note": null`; `PATCH /api/expenses/9999` returns `404`.
5. **Given** a CSV paste of three rows where row 2 carries a 281-character note, **When** `POST /api/trips/{trip_id}/import` runs, **Then** two expenses are created and the response reports `skipped: 1` with line 2 and reason `note must be 280 characters or fewer`.
6. **Given** the repository at the story's merge commit, **When** `bash scripts/gate.sh` runs, **Then** the `unit tests` step prints `unittest discover passed` having executed tests in `tests/` that exercise trimming, the `""`-to-`null` and `null`-to-`null` normalizations, acceptance at 280 characters, rejection at 281, and rejection of a non-string.

---

### User Story 2 - Read the note beneath the expense (Priority: P2)

On the trip-detail page, an expense that has a note shows it on its own line
directly beneath the expense's row, in the same table. An expense with no note
shows nothing extra — no blank cell, no empty line. The add-expense form stops
the user at 280 characters before the server has to.

**Why this priority**: Today the note is a column in the expenses table, which
squeezes the date, category and amount sideways and renders an empty cell for
every expense without one. Moving the note beneath the row gives it the width
of the table and costs nothing when it is absent. It is second because it
renders the `null` that US1 defines.

**Independent Test**: Open a trip whose expenses include one with a note and
one without. Confirm the noted expense's row is followed by exactly one
`tr.expense-note` row containing the note text, the unnoted expense's row is
followed directly by the next expense (or nothing), and the table header has no
`Note` column. Confirm the note input carries `maxlength="280"`. Run
`bash scripts/gate.sh` and confirm the remote-script and egress audits still
pass.

**Acceptance Scenarios**:

1. **Given** an expense with note `"Hotel, 3 nights"` is rendered in `#expenses-table`, **When** `renderExpenses` runs, **Then** the element immediately following that expense's `<tr>` in `#expenses-body` is a `<tr class="expense-note">` holding exactly one `<td colspan="4">` whose text content is `Hotel, 3 nights`.
2. **Given** an expense with `"note": null` is rendered, **When** `renderExpenses` runs, **Then** no `tr.expense-note` follows its row, and the `<thead>` of `#expenses-table` holds exactly four `<th>` elements — Date, Category, Amount, and the empty actions header — with no `Note` column.
3. **Given** the add-expense form in `src/frontend/trip.html`, **When** the user inspects the note input, **Then** it carries `maxlength="280"`, and a `422` response whose `errors.note` is set is shown in `#error-note` with no page reload.
4. **Given** this story's diff, **When** `bash scripts/gate.sh` runs, **Then** the `no remote script or stylesheet` and `no runtime egress from the frontend` audits pass, and `requirements.txt` is unchanged from the story's base commit.

### Edge Cases

- What happens when a note is exactly 280 characters after trimming? It is accepted. The limit is inclusive; 281 is the first rejected length.
- What happens when a note is 290 characters but 280 after trimming? It is accepted — trimming happens before the length check.
- What happens when an expense's note is updated with `{"note": null}` or a body with no `note` key? The note is cleared and reads back as `null`. Omitted and `null` are the same request.
- What happens when a `PATCH` body carries fields other than `note`? They are ignored; only the note changes. The endpoint updates one field by design.
- What happens to the CSV export of an expense with no note? The `note` column of that row is empty, exactly as it was before this feature; export reads the stored value, which is `''`.
- What happens to expenses that already exist in the database with a 281-to-500-character note from spec 001's ceiling? They are read back unchanged; the limit is applied on write, not on read. The seed data has no such row.
- What happens when an over-threshold expense (amount over $200.00) has a note? The expense row keeps `expense-over-threshold`; the `tr.expense-note` row beneath it does not carry that class.
- What happens when an expense with a note is deleted? Its `tr.expense-note` row disappears with it — `renderExpenses` rebuilds `#expenses-body` from the response, so no note row can outlive its expense.
- What happens when the category filter narrows the table? Note rows are rendered by the same `renderExpenses` the filter path calls, so they follow their expenses under every filter.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST accept an optional `note` on expense creation (`POST /api/trips/{trip_id}/expenses`) and on a new note-only update endpoint, `PATCH /api/expenses/{expense_id}`, whose body is `{"note": <string or null>}`. The update MUST change only that expense's note, MUST return `200` with the full expense row in the same shape `POST` returns, and MUST return `404` with `detail` `"expense not found"` for an unknown id.
- **FR-002**: System MUST treat an omitted, `null`, empty, or whitespace-only note as no note: stored as the empty string (the column is `NOT NULL DEFAULT ''` and is not migrated) and returned as JSON `null` by every endpoint that returns an expense — the `201` create body, the `200` update body, the `expenses` array of `GET /api/trips/{trip_id}`, and `GET /api/trips/{trip_id}/expenses`. A stored note MUST be returned with leading and trailing whitespace already removed.
- **FR-003**: System MUST reject a note longer than 280 characters after trimming with HTTP `422` and body `{"errors": {"note": "note must be 280 characters or fewer"}}`, writing nothing. This replaces the 500-character ceiling from spec 001 on every write path.
- **FR-004**: The note rule MUST exist in exactly one function, `parse_note(value) -> Optional[str]` in `src/validators.py`, raising `ValidationError` on a non-string or an over-long value, and MUST be called by the create endpoint, the update endpoint, and the CSV importer. An import row whose note exceeds 280 characters MUST be skipped and counted with that reason, per spec 001 FR-017, never aborting the import.
- **FR-005**: The repository MUST gain a `tests/` package that `python3 -m unittest discover -s tests -t .` runs from the repository root, importing only the standard library and `src/validators.py`, with tests covering trimming, the `""`-to-`None` and `None`-to-`None` normalizations, acceptance at 280 characters, rejection at 281, and rejection of a non-string. `bash scripts/gate.sh` MUST exit `0` with those tests executed.
- **FR-006**: On the trip-detail page, `renderExpenses` in `src/frontend/trip-detail.js` MUST render an expense whose `note` is non-null as its own `<tr class="expense-note">` holding one `<td colspan="4">` with the note as text content, appended to `#expenses-body` immediately after that expense's row; an expense whose `note` is `null` MUST produce no note row. The `Note` column MUST be removed from the table header and from the expense row.
- **FR-007**: The add-expense form's note input in `src/frontend/trip.html` MUST carry `maxlength="280"`, and a `422` whose `errors.note` is set MUST be shown in `#error-note` without a page reload.
- **FR-008**: The frontend story MUST add no dependency, no build step, no vendored library, no remote script or stylesheet, and no runtime request to any origin other than the page's own; `requirements.txt` MUST be unchanged and the `FR-021` audits in `scripts/gate.sh` MUST pass.

### Key Entities *(include if feature involves data)*

- **Expense**: Unchanged in storage — one row in `expenses` with `note TEXT NOT NULL DEFAULT ''`. On the wire, `note` is either a trimmed non-empty string of at most 280 characters or `null`; the empty string never crosses the API boundary in either direction.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every endpoint that returns an expense returns a `note` key whose value is either `null` or a non-empty string of at most 280 characters with no leading or trailing whitespace; the value `""` never appears in a response.
- **SC-002**: No write path — create, update, or CSV import — can place a note longer than 280 characters in the database; each refuses with the field named or skips the row with the reason recorded.
- **SC-003**: `bash scripts/gate.sh` exits `0` on the merged tree and its `unit tests` step reports at least six tests executed from `tests/`.
- **SC-004**: On a rendered trip-detail page, the number of `tr.expense-note` elements in `#expenses-body` equals the number of expenses in the response whose `note` is non-null, under every category filter.
- **SC-005**: A search of `src/` finds no `src=` or `href=` pointing at `http://` or `https://`, and `requirements.txt` is byte-identical before and after the feature.

## Assumptions

- The 280-character limit is fixed in the implementation and is not user-configurable.
- The `note` column keeps its `NOT NULL DEFAULT ''` definition. Absence is represented as `''` in storage and as `null` on the wire; the boundary is the only place the two meet, and no schema migration is needed for existing database files.
- The update endpoint changes the note and nothing else. Editing an expense's date, amount, or category was not requested in spec 001 and is not requested here.
- The trip-detail page has no JavaScript test runner and the gate cannot install one, so US2's scenarios are verified from the diff and the gate, and US1's from the diff, the gate, and the stdlib tests.
- Tests cannot import `src/main.py` inside the gate boundary because FastAPI is not installed there; the rule under test therefore lives in `src/validators.py`, which imports only the standard library.
- CSV export is unchanged: it writes the stored value, so an expense with no note exports an empty `note` cell as it does today.

## Work Graph

One node per user story. Ergane compiles this section — and only this section —
into the graph it dispatches; the prose above is what the judge scores a diff
against, not what schedules it.

The one edge is `depends_on_merged`, not `depends_on`, for the reason spec 001
records: each node branches from `main` at dispatch, and US2 renders the `null`
that US1's `_expense_row` produces. Both stories touch the same two files that
001's stories contended over — US1 writes `src/main.py`, US2 writes
`src/frontend/trip-detail.js` — and US2's `if (expense.note)` check is only
correct against a backend that no longer returns `""`. A verification-gated
edge would hand US2 a `main` whose API still returns empty strings.

`implements` partitions all eight functional requirements across the two nodes
by **where the delivering code lands, not which feature it reads as** — the
lesson 001 paid for. The judge is handed one node's diff and its criteria and
nothing else, so an FR whose code sits in the other node's diff fails honestly.
FR-001 through FR-005 are satisfied by edits to `src/validators.py`,
`src/main.py`, and the new `tests/` package: US1's diff. FR-006 through FR-008
are satisfied by edits to `src/frontend/trip-detail.js`, `src/frontend/trip.html`,
and `src/frontend/app.css`: US2's diff. No FR straddles the two, so neither node
has a reason to pad its diff with a cosmetic touch to the other's files.

Spec 001 left FR-002, FR-009 and FR-010 unclaimed and asked that "a future spec
that touches the schema or the validators should claim them". This spec touches
`src/validators.py` but not the schema or the amount rules, and claiming another
spec's requirement keys here would be judged against this diff, which does not
carry that code. They stay unclaimed.

```yaml
US1:
  depends_on: []
  implements: [FR-001, FR-002, FR-003, FR-004, FR-005]
  timeout: 5400

US2:
  depends_on: []
  depends_on_merged: [US1]
  implements: [FR-006, FR-007, FR-008]
  timeout: 5400
```
