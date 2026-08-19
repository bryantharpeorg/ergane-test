# Implementation Plan: Trip Expenses

**Branch**: `001-trip-expenses` | **Date**: 2026-08-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-trip-expenses/spec.md`

## Summary

A single-user, local-only web app over two entities — Trips and Expenses —
delivering a trips list with computed totals, a trip detail view with an inline
add form, a newest-first expenses table, per-category subtotals and one chart, a
category filter, CSV export, CSV paste-import with skip-and-report, a >$200 row
highlight, and confirm-then-cascade trip deletion.

The technical approach is deliberately boring: a FastAPI app over SQLite with
server-rendered HTML and vanilla JS, no frontend framework, no build step, and
**zero third-party frontend libraries**. Three decisions carry the design — money
stored as integer cents, a horizontal CSS bar chart chosen over a pie so nothing
has to be vendored, and one shared validation module used by both the add form
and the CSV importer. All three are recorded in [research.md](./research.md).

## Technical Context

**Language/Version**: Python 3.12 (`python:3.12-slim` base image)

**Primary Dependencies**: FastAPI, Uvicorn. Standard library only for the feature
work — `sqlite3` for storage, `csv` for import/export. No additional runtime
dependencies are introduced by this feature.

**Storage**: SQLite, single file on a local volume. Two tables, one foreign key.

**Testing**: Manual verification against the acceptance scenarios in `spec.md`,
plus the checks in [quickstart.md](./quickstart.md). No automated test suite was
requested for this prototype.

**Target Platform**: Linux container on the user's own machine, reached over
localhost. Not hosted, not exposed.

**Project Type**: Web application — Python backend serving a vanilla HTML/CSS/JS
frontend from the same origin.

**Performance Goals**: None stated and none needed. Single user, tens of expenses
per trip; every query is an indexed lookup or a small aggregate.

**Constraints**: Fully air-gapped — no outbound network calls at runtime and no
assets fetched from a CDN. No authentication of any kind. USD only.

**Scale/Scope**: One user, one machine, two entities, two views, eleven
endpoints. Delivery target is "usable Thursday", which is a scope constraint on
this plan as much as a schedule.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

This prototype has no project constitution file; the governing constraints are
the prototype platform's local-first rules plus the negative requirements the
user stated outright. Gates evaluated against those:

| Gate | Status | Evidence |
|---|---|---|
| Air-gapped — no cloud service, no BaaS, no cloud DB | **PASS** | SQLite on a local volume. The transcript names no cloud service, so no replacement recommendation was required. |
| No runtime network egress | **PASS** | Zero third-party frontend libraries; the chart is hand-authored CSS. Nothing to fetch at build time or run time. |
| No authentication | **PASS** | FR-020. No user table, no session handling, no password field anywhere in the design. |
| Single currency | **PASS** | FR-010. No currency column exists in the schema, so a switcher is unrepresentable. |
| Default stack unmodified | **PASS** | Python 3.12-slim + FastAPI + Uvicorn + SQLite + vanilla frontend, default internal port. |
| Data-model consistency | **PASS** | One canonical column list per table in [data-model.md](./data-model.md), reused by the DDL, the seed rows, and every contract example. |

**Post-Phase-1 re-check**: PASS, unchanged. The Phase 1 design introduced no new
dependency, no new service, and no new persisted entity.

## Project Structure

### Documentation (this feature)

```text
specs/001-trip-expenses/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output — the three decisions
├── data-model.md        # Phase 1 output — schema, invariants, seed data
├── quickstart.md        # Phase 1 output — how to verify the build
├── contracts/
│   └── api.md           # Phase 1 output — endpoint contracts
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
src/
├── main.py              # FastAPI app; HTML routes and JSON endpoints
├── db.py                # Connection factory (foreign_keys pragma), schema bootstrap
├── validators.py        # Shared date / amount / category validation + formatting
├── schema.sql           # DDL for trips and expenses
├── seed.py              # Idempotent seed data
└── frontend/
    ├── index.html       # Trips list view
    ├── trip.html        # Trip detail view
    ├── app.css          # Styling, incl. over-threshold rows and the bar chart
    ├── trips.js         # Trips list behaviour
    └── trip-detail.js   # Trip detail behaviour
```

**Structure Decision**: Single project, backend and frontend in one tree, served
same-origin by FastAPI. A split backend/frontend layout would add a build step
and a second server for a two-page app with no framework — cost with no benefit
at this scale. `validators.py` is broken out as its own module rather than living
in `main.py` specifically so the add-expense endpoint and the CSV importer
cannot drift apart on what counts as valid; that shared module is the only
structural concession beyond the obvious.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations. Table intentionally empty.
