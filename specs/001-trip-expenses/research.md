# Research — Trip Expenses (Phase 0)

Three decisions needed resolving before design. Two came from the transcript
leaving a choice open; one came from a correctness risk the transcript implied
but did not name.

## R-001 — Chart type for the per-category subtotals

**Question**: The user delegated the choice — *"Bar or pie, honestly whatever is
easiest — just pick one and write down which you picked."* The instruction to
record the choice is itself a requirement (FR-013).

**Decision**: **A horizontal bar chart, hand-authored in HTML and CSS.** One row
per non-empty category: a label, a track, a fill whose width is
`subtotal / max(subtotal) * 100%`, and the dollar value at the end.

**Rationale**: A pie chart needs arc geometry — SVG path arcs or a canvas
`arc()` loop — which in practice means vendoring a charting library. A
horizontal bar chart is a handful of divs with a percentage width and no
measurement code at all. Choosing bars keeps the prototype at zero third-party
frontend dependencies, which makes the air-gap constraint trivially true and
removes an entire class of build failure (a coder stalling on a library it was
supposed to download rather than author).

**Alternatives considered**:

- *Pie chart via a vendored library (Chart.js et al.)* — rejected. Introduces a
  `kind: library` asset requiring a pinned URL and a download step, for a chart
  of at most six values.
- *Pie chart hand-authored in SVG* — rejected. Arc-path math is the most
  error-prone code in the whole prototype, and it buys nothing over bars for
  six categories.
- *Bar chart via a vendored library* — rejected. Same dependency cost as the
  pie, and CSS already does this.

## R-002 — How to represent money

**Question**: Amounts must be "positive numbers, two decimals", and per-category
subtotals are summed and displayed. What type stores them?

**Decision**: **Integer cents** in a column named `amount_cents`. Parse
`"124.50"` → `12450` on input; format `12450` → `"124.50"` on output. Conversion
happens only at the edges.

**Rationale**: Binary floating point cannot represent 0.10 exactly. Summing
floats for per-category subtotals and a trip total accumulates error that
surfaces as cent-level discrepancies — precisely the "the subtotals will be
garbage" failure the user was already worried about from a different direction.
Integers make the arithmetic exact and make the validation rule ("at most two
decimal places") a parse-time check rather than a rounding convention.

**Consequence for the highlight rule**: the >$200 test becomes
`amount_cents > 20000`, an integer comparison with no epsilon.

**Alternatives considered**:

- *`REAL` column* — rejected on the accumulation error above.
- *`TEXT` column holding a decimal string* — rejected; SQLite would sort and sum
  it wrongly without casting at every use site.
- *Python `Decimal` with a `NUMERIC` column* — rejected as heavier than needed;
  SQLite has no true decimal type, so it round-trips through float anyway.

## R-003 — Guaranteeing "no orphan expenses"

**Question**: The user required that deleting a trip takes its expenses with it —
*"no orphan expenses hanging around."* A foreign key with `ON DELETE CASCADE`
looks sufficient. Is it?

**Decision**: Declare `ON DELETE CASCADE` on `expenses.trip_id` **and** execute
`PRAGMA foreign_keys = ON` on every connection opened by the app, in the
connection factory in `src/db.py`.

**Rationale**: SQLite disables foreign-key enforcement per connection by
default, for backwards compatibility. With it off, the `ON DELETE CASCADE`
clause parses, the schema looks correct, deleting a trip succeeds — and its
expenses silently remain, orphaned by a dangling `trip_id`. The failure is
invisible in every code path except the one the user explicitly asked about. The
pragma cannot live in `schema.sql` because it is connection-scoped, not
schema-scoped; it must be set by whatever opens the connection.

**Alternatives considered**:

- *Application-level cascade — delete expenses, then the trip, in a transaction*
  — rejected as a second source of truth for a rule the schema can enforce, but
  noted as the fallback if the pragma ever proves unavailable.
- *Relying on the DDL alone* — rejected; this is the bug being guarded against.

## Non-questions

Resolved by the transcript, recorded here so they are not reopened during
implementation:

- **Category set**: closed enum of exactly six values. Free text was proposed and
  withdrawn *in the same call*, with the user's own reasoning
  (`"food"`/`"Food"`/`"meals"` would wreck the subtotals). Not an open choice.
- **Storage engine**: SQLite, agreed in the room by both speakers.
- **Currency**: USD, no switching. Stated as a prohibition.
- **Authentication**: none, stated as a prohibition with a test for it — *"If I
  see a password field you built the wrong thing."*
