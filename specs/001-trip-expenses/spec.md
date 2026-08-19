---
state: ready
depends_on_landed: []
---

# Feature Specification: Trip Expenses

**Feature Branch**: `001-trip-expenses`

**Created**: 2026-08-18

**Status**: Draft

**Input**: User description: "I want to finally deal with my trip expense mess. Every work trip I come back with a pile of numbers in four places and I redo the same spreadsheet. Small local tool, nothing hosted. Call it trip-expenses." (planning call, two speakers — A wants the tool, B is engineer; source: `apps/eval/datasets/prototype-transcripts/meeting-C.txt`)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See what every trip cost (Priority: P1)

The user opens the tool and sees every trip they have recorded, each with its
destination, its date range, and the total amount spent on it. One glance
answers "which trip cost what" without opening anything.

**Why this priority**: This is the reason the tool exists — the user currently
rebuilds this view by hand in a spreadsheet after every trip. A trips list with
computed totals is the smallest thing that replaces the manual work, and every
other story hangs off the trip record it creates.

**Independent Test**: Create two trips, add expenses to each directly in the
data store, load the list, and confirm each trip shows the correct sum. Delivers
the "which trip cost what" answer with no other story implemented.

**Acceptance Scenarios**:

1. **Given** no trips exist, **When** the user opens the trips list, **Then** an empty state is shown and a create-trip form is available.
2. **Given** the user submits a trip with name, destination, start date and end date, **When** the form is saved, **Then** the trip appears in the list with a total of $0.00.
3. **Given** a trip has three expenses of $412.00, $63.50 and $89.00, **When** the trips list is loaded, **Then** that trip's total reads $564.50.
4. **Given** a trip with an end date earlier than its start date is submitted, **When** the form is saved, **Then** the trip is rejected with a field-level message.

---

### User Story 2 - Record and read a trip's expenses (Priority: P2)

The user opens one trip and sees its expenses in a table, newest date first,
with an add-expense form on that same page. Large expenses are visually obvious
without hunting. Individual expenses can be removed.

**Why this priority**: Without this the trips list has nothing to total. It is
second only because a trip must exist before an expense can belong to one.

**Independent Test**: Open a trip, add four expenses including one over $200,
confirm they render newest-first with the large one highlighted, delete one and
confirm it disappears and the total drops.

**Acceptance Scenarios**:

1. **Given** a trip is open, **When** the user submits date, amount, category and note, **Then** the expense appears at the correct position in the table and the trip total increases by that amount.
2. **Given** expenses dated 07-14, 07-15 and 07-17 exist, **When** the table renders, **Then** the 07-17 row is first and the 07-14 row is last.
3. **Given** an expense of $412.00 exists, **When** the table renders, **Then** that row is visually distinguished from rows at or under $200.00.
4. **Given** an amount of `12.345`, `0`, or `-5` is submitted, **When** the form is saved, **Then** the expense is rejected and no row is created.
5. **Given** an expense row is shown, **When** the user clicks its delete button, **Then** the row is removed and the trip total decreases accordingly.

---

### User Story 3 - Report spending by category (Priority: P3)

On a trip, the user sees per-category subtotals and one chart of those
subtotals, and can filter the expenses table down to a single category.

**Why this priority**: This is the reporting the user explicitly asked for, and
it is the reason categories became a closed set. It is genuinely additive — the
table and totals are useful without it.

**Independent Test**: With expenses across three categories, confirm the
subtotals match hand arithmetic, the chart renders one bar per non-empty
category, and selecting a category filters the table to only those rows.

**Acceptance Scenarios**:

1. **Given** a trip has $412.00 of Lodging and $63.50 of Food, **When** the trip detail loads, **Then** subtotals show exactly those two categories with those amounts.
2. **Given** a trip has no Gear expenses, **When** the subtotals render, **Then** no Gear row and no Gear bar appear.
3. **Given** the user selects the Food filter, **When** the table re-renders, **Then** only Food rows are listed and the subtotals and chart are unchanged.
4. **Given** the category control is opened, **When** the user inspects the options, **Then** exactly six categories are offered and no free-text entry is possible.

---

### User Story 4 - Move data in and out as CSV (Priority: P4)

The user exports one trip's expenses as a CSV file, and pastes CSV rows from an
old spreadsheet into a box to bulk-add expenses to the trip they are viewing.
Malformed rows are skipped and counted rather than aborting the import.

**Why this priority**: Import is how the user's existing trips get into the tool
at all, and export is how the data stays theirs. Both were called out as
mattering, but the tool is usable for a new trip without either.

**Independent Test**: Export a trip with three expenses, confirm the file has a
header plus three rows; paste a five-row block with two malformed rows into
another trip and confirm three expenses land and the response reports two
skipped.

**Acceptance Scenarios**:

1. **Given** a trip has expenses, **When** the user clicks Export CSV, **Then** a file downloads with the columns `date, amount, category, note` and one row per expense.
2. **Given** an expense note contains a comma, **When** the file is exported, **Then** the note is quoted and the file parses as valid CSV.
3. **Given** a paste of five rows where row 2 has a malformed amount and row 4 has an unrecognised category, **When** the import runs, **Then** three expenses are created and the result reports 2 skipped with the offending line numbers.
4. **Given** a previously exported file is pasted back in, **When** the import runs, **Then** its header row is ignored and every data row is accepted.
5. **Given** a category is pasted as `food` rather than `Food`, **When** the import runs, **Then** the row is accepted and stored as `Food`.

---

### User Story 5 - Delete a trip without leaving orphans (Priority: P5)

Deleting a trip asks for confirmation, then removes the trip together with
every expense that belonged to it.

**Why this priority**: A correctness and hygiene concern rather than a daily
one — but the user was explicit that expenses must not survive their trip.

**Independent Test**: Create a trip with expenses, delete it, confirm both the
trip and all of its expenses are gone from the data store.

**Acceptance Scenarios**:

1. **Given** a trip with expenses, **When** the user clicks delete, **Then** a confirmation naming the trip and its expenses is shown before anything is removed.
2. **Given** the confirmation is dismissed, **When** the user cancels, **Then** the trip and its expenses remain.
3. **Given** the confirmation is accepted, **When** the delete completes, **Then** the trip is gone from the list and no expense referencing it remains.

### Edge Cases

- What happens when a trip has no expenses? Its total reads $0.00 and it still appears in the list; its detail page shows an empty table, no subtotals, and no chart bars.
- What happens when an amount is submitted with more than two decimal places, as zero, or as a negative? It is rejected with a field-level message; nothing is written.
- What happens when an imported row has the wrong number of columns? That row is skipped and counted; the rest of the paste still imports.
- What happens when every row in an import is malformed? Zero expenses are added, the result reports all rows skipped, and no partial state is left behind.
- What happens when an expense is exactly $200.00? It is **not** highlighted — the threshold is strictly greater than $200.00.
- What happens when a note contains a comma or a quote character on export? It is quoted per CSV rules and round-trips back through import unchanged.
- What happens when two expenses share the same date? Both appear; ties are broken by insertion order, newest inserted first.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST persist trips with a name, a destination, a start date, and an end date.
- **FR-002**: System MUST persist expenses, each belonging to exactly one trip, with a date, an amount, a category, and a short note.
- **FR-003**: System MUST compute each trip's total from its expenses at read time and MUST NOT store a total that can drift.
- **FR-004**: System MUST restrict categories to exactly six values — Lodging, Food, Transport, Gear, Fees, Other — offered as a fixed selection. Free-text categories were proposed and explicitly withdrawn during the call and MUST NOT be implemented.
- **FR-005**: Users MUST be able to create a trip and see it listed with its date range and total.
- **FR-006**: Users MUST be able to open a trip and see its expenses in a table ordered by date, newest first.
- **FR-007**: Users MUST be able to add an expense from the trip detail view itself, without navigating away.
- **FR-008**: Users MUST be able to delete an individual expense from its row in the table.
- **FR-009**: System MUST accept only positive amounts with at most two decimal places, rejecting zero, negatives, and finer precision.
- **FR-010**: System MUST record every amount in United States dollars. No currency selection, conversion, or second currency may exist.
- **FR-011**: System MUST visually distinguish expenses greater than $200.00 in the table.
- **FR-012**: System MUST show per-category subtotals for the open trip, omitting categories with no expenses.
- **FR-013**: System MUST render exactly one chart of those per-category subtotals on the trip detail view, and the chosen chart type MUST be recorded in the design artifacts.
- **FR-014**: Users MUST be able to filter the expenses table by a single category without affecting the subtotals or the chart.
- **FR-015**: Users MUST be able to export the open trip's expenses as a CSV file containing the columns `date, amount, category, note`.
- **FR-016**: Users MUST be able to paste CSV rows in that same column order to bulk-add expenses to the open trip.
- **FR-017**: System MUST skip any malformed import row, continue processing the remainder, and report how many rows were skipped. A malformed row MUST NOT abort the import or leave a partial write.
- **FR-018**: System MUST ignore a leading header row on import so that an exported file re-imports without editing.
- **FR-019**: System MUST require confirmation before deleting a trip, and on confirmation MUST delete that trip's expenses with it, leaving no expense without a trip.
- **FR-020**: System MUST NOT implement authentication in any form — no login screen, no accounts, no user records, no password field, no sessions. The user stated that a password field means the wrong thing was built.
- **FR-021**: System MUST operate entirely locally with no hosted service, no outbound network calls at runtime, and no cloud data store.

### Key Entities *(include if feature involves data)*

- **Trip**: One journey the user took. Carries a name, a destination, a start date and an end date. Owns zero or more Expenses. Its total spend is derived from those Expenses, never stored.
- **Expense**: One amount of money spent, belonging to exactly one Trip. Carries a date, an amount in dollars, one of the six fixed categories, and a short free-text note. Cannot exist without its Trip.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From the trips list, the user can identify what each trip cost without opening any trip — the total is on the list row.
- **SC-002**: Adding one expense to an open trip takes a single form submission and no page navigation, and the table, subtotals, chart, and total all reflect it immediately.
- **SC-003**: An expense over $200.00 is identifiable in the table without reading the amount column value by value.
- **SC-004**: A CSV file exported from a trip can be pasted back into the import box and produces the same number of expenses it contained, with zero rows skipped.
- **SC-005**: An import containing malformed rows adds every valid row and reports the exact count of skipped rows; no import leaves a partially written trip.
- **SC-006**: After a trip is deleted, zero expenses referencing it remain in the data store.
- **SC-007**: A search of the delivered source tree finds no login page, no user or account record, no password field, and no currency-selection control.
- **SC-008**: The running application issues no outbound network requests.

## Assumptions

- Single user on a single machine; no concurrent access, so no locking, no conflict resolution, and no audit trail is required.
- Dates are entered and stored as calendar dates without times or time zones; the user records what day money was spent, not when.
- Editing an existing expense was not requested. Create and delete only; a correction is a delete plus a re-add.
- Editing an existing trip's fields was not requested and is out of scope.
- Expense counts per trip are small (tens, not thousands), so no pagination, lazy loading, or search beyond the category filter is needed.
- The note field is optional; an omitted note is an empty string rather than an absent value.
- The $200.00 highlight threshold is fixed in the implementation and is not user-configurable — the user asked for a threshold, not a setting.
- "Use it Thursday" is treated as a scope constraint: anything not named in the transcript is deferred rather than inferred.

## Work Graph

One node per user story. Ergane compiles this section — and only this section —
into the graph it dispatches; the prose above is what the judge scores a diff
against, not what schedules it.

Every edge is `depends_on_merged` rather than `depends_on`. A `depends_on` edge
unlocks when its dependency is *verified*, and each node branches from `main` at
dispatch: US2 unlocked on US1's verification would branch from a `main` that
does not yet contain US1's endpoints. All five stories write `src/main.py` and
four of them write `src/frontend/trip-detail.js`, so the conflict would surface
in the merge queue instead of in the worktree where an agent could fix it.

US3, US4 and US5 all hang off US2 rather than off each other — tasks.md records
them as independent — so the factory may run them concurrently once US2 lands.

`implements` partitions all twenty-one functional requirements across the five
nodes, so each FR is judged against exactly one diff. The cross-cutting
negatives FR-020 (no authentication) and FR-021 (local only) sit on US1 because
US1 is the node that creates the application skeleton and its routes.

```yaml
US1:
  depends_on: []
  implements: [FR-001, FR-003, FR-005, FR-020, FR-021]

US2:
  depends_on: []
  depends_on_merged: [US1]
  implements: [FR-002, FR-004, FR-006, FR-007, FR-008, FR-009, FR-010, FR-011]

US3:
  depends_on: []
  depends_on_merged: [US2]
  implements: [FR-012, FR-013, FR-014]

US4:
  depends_on: []
  depends_on_merged: [US2]
  implements: [FR-015, FR-016, FR-017, FR-018]

US5:
  depends_on: []
  depends_on_merged: [US2]
  implements: [FR-019]
```
