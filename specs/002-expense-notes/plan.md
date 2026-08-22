# Implementation Plan: Expense Notes

**Branch**: `002-expense-notes` | **Date**: 2026-08-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-expense-notes/spec.md`

## Summary

Two small stories over the existing `expenses.note` column. The backend story
pins the note rule to one function — trim, empty becomes `null`, 280
characters or fewer — applies it on create, on a new note-only `PATCH`, and on
CSV import, and returns `null` instead of `""` on every read. It also creates
the repository's first `tests/` package, which `scripts/gate.sh` already knows
how to run. The frontend story moves the note out of its table column and
renders it as a full-width row beneath the expense when present, nothing when
absent, and caps the form input at 280.

Three decisions carry the design and are recorded below: the column is not
migrated (absence is `''` in storage, `null` on the wire); the rule lives in
`src/validators.py` so the stdlib test runner can reach it without FastAPI;
and the update endpoint changes one field only.

## Technical Context

**Language/Version**: Python 3.12 (`python:3.12-slim` base image); Python 3.13
on the host and inside the gate boundary.

**Primary Dependencies**: FastAPI, Uvicorn — unchanged. This feature adds no
dependency. `requirements.txt` is not edited.

**Storage**: SQLite, unchanged. `expenses.note` stays `TEXT NOT NULL DEFAULT ''`.
No DDL changes, no migration.

**Testing**: Standard-library `unittest`, discovered by
`python3 -m unittest discover -s tests -t .` from the repository root — the
exact command `scripts/gate.sh` runs when a `tests/` directory exists. Tests
import `src.validators` (a namespace package under the repository root) and
nothing else outside the standard library. FastAPI is not importable inside the
node's bwrap worktree, so `src/main.py` is not imported by any test.

**Target Platform**: Linux container on the user's own machine, reached over
localhost. Unchanged.

**Project Type**: Web application — Python backend serving a vanilla HTML/CSS/JS
frontend from the same origin. Unchanged.

**Performance Goals**: None stated and none needed.

**Constraints**: Air-gapped, no authentication, USD only — all inherited from
spec 001 and enforced by `scripts/gate.sh`. The frontend story must keep every
audit in that gate green.

**Scale/Scope**: One new validator function, one new endpoint, three edited
handlers, one new test module; one edited render function, one edited template,
one CSS rule.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
|---|---|---|
| I. Spec-derived work | **PASS** | Every task below cites a scenario in `spec.md`. No adjacent refactor: `parse_amount_to_cents`, `parse_date`, `parse_category` are not touched. |
| II. Mechanical verification | **PASS** | `tests/` is created by US1 and run by the existing gate with no change to `scripts/gate.sh` or `ergane.yaml`. The tests can fail: a 281-character note accepted, or `""` returned instead of `None`, fails them. |
| III. Scoped, reversible change | **PASS** | Neither story edits `ergane.yaml`, the gates workflow, or the ruleset. US1 writes `src/validators.py`, `src/main.py`, `tests/`; US2 writes `src/frontend/`. |
| IV. Evidence over assertion | **PASS** | US1's last task and US2's last task are a gate run whose output is reported. No test is narrowed to pass; the only limit change (500 to 280) is the spec's stated requirement, not a relaxation. |
| V. One story per landing | **PASS** | Two stories, two PRs, titled `US1: ...` and `US2: ...`. |
| Security & runtime | **PASS** | No credential, no network, nothing outside the worktree. |

**Post-Phase-1 re-check**: PASS, unchanged. No new dependency, no new service,
no schema change.

## Design Decisions

### D-001: The column is not migrated; `''` in storage is `null` on the wire

`expenses.note` is `TEXT NOT NULL DEFAULT ''` and `init_db()` applies
`schema.sql` with `CREATE TABLE IF NOT EXISTS`, which cannot relax a `NOT NULL`
on a table that already exists. Relaxing it would need a table rebuild in
`init_db()` for a two-field feature, and would leave existing database files
(the compose volume) on a different definition from fresh ones.

Instead the boundary does the work. `parse_note` returns `None` for an absent
note and the handlers store `note if note is not None else ""`; `_expense_row`
returns `row["note"] or None`. The empty string never crosses the API in
either direction, and every row already in the database reads back under the
same rule without being rewritten. CSV export keeps writing the stored value, so an
absent note exports as an empty cell exactly as it does today.

### D-002: The rule lives in `src/validators.py`, not in the handlers

Spec 001 already routes date, amount and category through one shared module
so the add form and the importer cannot drift. The note was the one field each
handler validated inline, with the limit written twice. Moving it to
`parse_note` gives create, update and import one definition of "valid note",
and gives the test suite something it can import without FastAPI:
`src/validators.py` imports only `re` and `typing`.

`parse_note(value)`:

- `None` → `None`
- not a `str` → `ValidationError("note must be text")`
- otherwise strip; `""` → `None`
- length over 280 → `ValidationError("note must be 280 characters or fewer")`
- else the stripped string

### D-003: `PATCH /api/expenses/{expense_id}` updates the note and nothing else

Spec 001 recorded that editing an expense was not requested; a correction was
delete plus re-add. This spec asks for the note to be correctable in place. A
note-only endpoint satisfies that without reopening the question of editing
dates, amounts or categories, which would drag the amount and category
validators and the highlight threshold into a story meant to be small. The
body is `{"note": ...}`; other keys are ignored; the response is the full
expense row so a caller can re-render from it.

### D-004: The note becomes a row, not a column

A column gives every expense a note cell whether or not it has a note, and
narrows date, category and amount to make room. A `<tr class="expense-note">`
with one `<td colspan="4">` directly under the expense row takes the table's
full width when present and costs nothing when absent. `renderExpenses`
rebuilds `#expenses-body` from the response on every load, add, delete and
filter change, so a note row can never outlive or precede its expense.

## Project Structure

### Documentation (this feature)

```text
specs/002-expense-notes/
├── plan.md              # This file
├── spec.md              # Feature specification
└── tasks.md             # Task list, one phase per story
```

No research, data-model or contracts documents: the decisions above are the
whole of Phase 0, the entity is unchanged, and the one new endpoint is
specified in full by FR-001 and scenario US1-S4.

### Source Code (repository root)

```text
src/
├── main.py              # US1: parse_note in create + import, new PATCH, _expense_row returns null
├── validators.py        # US1: parse_note
└── frontend/
    ├── trip.html        # US2: drop the Note <th>, maxlength="280" on the note input
    ├── trip-detail.js   # US2: renderExpenses emits tr.expense-note beneath noted rows
    └── app.css          # US2: .expense-note styling
tests/
├── __init__.py          # US1: makes tests/ importable under `discover -s tests -t .`
└── test_expense_notes.py # US1: parse_note cases
```

**Structure Decision**: No new module beyond the test package. The `tests/`
directory must be a package (`__init__.py` present) because
`unittest discover -s tests -t .` imports the start directory relative to the
top-level directory and refuses a start directory that is not importable.
Tests reach the code under test as `from src.validators import ...`, which
works because the repository root is the top-level directory and `src/` is an
implicit namespace package; no `sys.path` manipulation is needed.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations. Table intentionally empty.
