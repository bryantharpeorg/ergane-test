# Data Model — Trip Expenses (Phase 1)

Two tables, one foreign key. The column lists below are **canonical**: every DDL
statement, seed row, and contract example in this feature uses exactly these
names and no others. A column that appears in a seed row or an API example but
not in the DDL is a defect — it produces
`sqlite3.OperationalError: table X has no column named Y` on container boot.

## Entity: Trip

Canonical columns: `id`, `name`, `destination`, `start_date`, `end_date`

```sql
CREATE TABLE trips (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    destination TEXT NOT NULL,
    start_date  TEXT NOT NULL,   -- ISO-8601 'YYYY-MM-DD'
    end_date    TEXT NOT NULL    -- ISO-8601 'YYYY-MM-DD'
);
```

- **Primary key**: `trips.id`
- **Foreign keys**: none
- **Derived, not stored**: the trip total. Computed on read as
  `COALESCE(SUM(amount_cents), 0)` over the trip's expenses. There is
  deliberately no `total` column — a stored total drifts the first time an
  import or a delete touches expenses (FR-003).
- **Validation** (application layer): `name` and `destination` non-empty after
  trimming; both dates parse as `YYYY-MM-DD`; `end_date >= start_date`.

## Entity: Expense

Canonical columns: `id`, `trip_id`, `date`, `amount_cents`, `category`, `note`

```sql
CREATE TABLE expenses (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id      INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    date         TEXT NOT NULL,      -- ISO-8601 'YYYY-MM-DD'
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    category     TEXT NOT NULL CHECK (
                     category IN ('Lodging','Food','Transport','Gear','Fees','Other')
                 ),
    note         TEXT NOT NULL DEFAULT ''
);

CREATE INDEX idx_expenses_trip_date ON expenses (trip_id, date DESC);
```

- **Primary key**: `expenses.id`
- **Foreign key**: `expenses.trip_id → trips.id`, `ON DELETE CASCADE`
- **`note` is `NOT NULL DEFAULT ''`** — an omitted note is the empty string, so
  CSV export never has to special-case null.
- **Ordering**: the table always reads `ORDER BY date DESC, id DESC`. The index
  above serves it; the `id` tiebreaker makes same-date ordering deterministic.

## Relationship

One Trip has zero or more Expenses. An Expense belongs to exactly one Trip and
cannot exist without it. Deleting a Trip deletes its Expenses (FR-019).

## Invariants the implementation must hold

1. **`PRAGMA foreign_keys = ON` on every connection.** SQLite disables foreign
   keys per connection by default; with them off the `ON DELETE CASCADE` above
   is silently inert and trip deletion leaves orphans. Set this in the
   connection factory in `src/db.py` — it is connection-scoped and cannot live
   in `schema.sql`. See [research.md](./research.md) R-003.
2. **Money is integer cents everywhere inside the system.** `amount_cents` is
   the only representation stored, summed, or compared. Decimal strings exist
   only at the HTTP boundary — parsed on the way in, formatted on the way out.
   The highlight rule is `amount_cents > 20000`. See R-002.
3. **The category enum has exactly one definition.**
   `CATEGORIES = ("Lodging", "Food", "Transport", "Gear", "Fees", "Other")` in
   `src/validators.py`, consumed by the DDL `CHECK`, the form `<select>`, the
   subtotal grouping, and the import parser. No free-text category input exists
   anywhere (FR-004).
4. **Subtotals omit empty categories.** A category with no expenses produces no
   subtotal row and no chart bar (FR-012).

## Seed data

Two trips, five expenses, using exactly the canonical columns above.

```sql
INSERT INTO trips (name, destination, start_date, end_date) VALUES
  ('Q3 Client Onsite', 'Chicago, IL', '2026-07-14', '2026-07-17'),
  ('Vendor Summit',    'Austin, TX',  '2026-08-03', '2026-08-06');

INSERT INTO expenses (trip_id, date, amount_cents, category, note) VALUES
  (1, '2026-07-14', 41200, 'Lodging',   'Hotel, 3 nights'),
  (1, '2026-07-15',  6350, 'Food',      'Team dinner'),
  (1, '2026-07-17',  8900, 'Transport', 'Airport taxi both ways'),
  (2, '2026-08-03', 25000, 'Lodging',   'Conference rate'),
  (2, '2026-08-04',  1875, 'Food',      'Coffee and lunch');
```

Derived values this seed produces, useful as boot-time assertions:

| Trip | Total | Subtotals |
|---|---|---|
| Q3 Client Onsite | `56450` → $564.50 | Lodging $412.00, Food $63.50, Transport $89.00 |
| Vendor Summit | `26875` → $268.75 | Lodging $250.00, Food $18.75 |

Two rows (`41200`, `25000`) exceed the $200 threshold, so the highlight is
visible on first boot without the user typing anything. Four of the six
categories are unused, so the "omit empty categories" rule is also exercised by
the seed.

Seeding is idempotent: skip entirely if `SELECT COUNT(*) FROM trips` is non-zero.
