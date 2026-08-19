# API Contracts — Trip Expenses (Phase 1)

Same-origin. JSON endpoints under `/api`; two routes return HTML. All amounts
cross this boundary as decimal strings; `amount_cents` integers appear in
responses where the client needs to compare against the highlight threshold.

`/api/health` is provided by the skeleton and is not specified here.

| Method | Path | Story | Purpose |
|---|---|---|---|
| GET | `/` | US1 | Trips list page (HTML) |
| GET | `/trips/{trip_id}` | US2 | Trip detail page (HTML) |
| GET | `/api/trips` | US1 | All trips with computed totals |
| POST | `/api/trips` | US1 | Create a trip |
| GET | `/api/trips/{trip_id}` | US2/US3 | One trip, its expenses, its subtotals |
| DELETE | `/api/trips/{trip_id}` | US5 | Delete trip, cascade expenses |
| GET | `/api/trips/{trip_id}/expenses` | US3 | Expenses, newest first, optional category filter |
| POST | `/api/trips/{trip_id}/expenses` | US2 | Add one expense |
| DELETE | `/api/expenses/{expense_id}` | US2 | Delete one expense |
| GET | `/api/trips/{trip_id}/export.csv` | US4 | CSV download of the trip's expenses |
| POST | `/api/trips/{trip_id}/import` | US4 | Paste-import CSV rows into the trip |

---

## GET /api/trips

Returns every trip with its computed total. Trips with no expenses return
`total_cents: 0` and are **not** omitted.

**200**

```json
[
  {"id": 1, "name": "Q3 Client Onsite", "destination": "Chicago, IL",
   "start_date": "2026-07-14", "end_date": "2026-07-17", "total_cents": 56450},
  {"id": 2, "name": "Vendor Summit", "destination": "Austin, TX",
   "start_date": "2026-08-03", "end_date": "2026-08-06", "total_cents": 26875}
]
```

## POST /api/trips

**Request**

```json
{"name": "Q4 Kickoff", "destination": "Denver, CO",
 "start_date": "2026-10-05", "end_date": "2026-10-08"}
```

**201** — the created trip, shaped as a `GET /api/trips` element with
`total_cents: 0`.

**422** — validation failure, one entry per offending field:

```json
{"errors": {"end_date": "end_date must be on or after start_date"}}
```

Rules: `name` and `destination` non-empty after trimming; both dates
`YYYY-MM-DD`; `end_date >= start_date`.

## GET /api/trips/{trip_id}

Everything the detail view renders, in one round trip. `expenses` is ordered
`date DESC, id DESC`. `subtotals` omits categories with no expenses.

**200**

```json
{
  "trip": {"id": 1, "name": "Q3 Client Onsite", "destination": "Chicago, IL",
           "start_date": "2026-07-14", "end_date": "2026-07-17"},
  "expenses": [
    {"id": 3, "trip_id": 1, "date": "2026-07-17", "amount_cents": 8900,
     "category": "Transport", "note": "Airport taxi both ways"},
    {"id": 2, "trip_id": 1, "date": "2026-07-15", "amount_cents": 6350,
     "category": "Food", "note": "Team dinner"},
    {"id": 1, "trip_id": 1, "date": "2026-07-14", "amount_cents": 41200,
     "category": "Lodging", "note": "Hotel, 3 nights"}
  ],
  "subtotals": [
    {"category": "Lodging", "subtotal_cents": 41200},
    {"category": "Food", "subtotal_cents": 6350},
    {"category": "Transport", "subtotal_cents": 8900}
  ],
  "total_cents": 56450
}
```

**404** — unknown `trip_id`.

## DELETE /api/trips/{trip_id}

Deletes the trip; its expenses go with it via `ON DELETE CASCADE` (which
requires the `foreign_keys` pragma — see data-model.md invariant 1). The
confirmation prompt is a client concern; this endpoint does not re-confirm.

**204** — no body. **404** — unknown `trip_id`.

## GET /api/trips/{trip_id}/expenses

Query params: `category` (optional, one of the six exactly).

**200** — array of expense objects, ordered `date DESC, id DESC`, shaped as in
`GET /api/trips/{trip_id}`.

**422** — `category` present but not one of the six.

**404** — unknown `trip_id`.

## POST /api/trips/{trip_id}/expenses

**Request** — `amount` is the decimal string the user typed; `note` optional.

```json
{"date": "2026-07-16", "amount": "124.50", "category": "Food",
 "note": "Client lunch"}
```

**201**

```json
{"id": 4, "trip_id": 1, "date": "2026-07-16", "amount_cents": 12450,
 "category": "Food", "note": "Client lunch"}
```

**422**

```json
{"errors": {"amount": "must be a positive number with at most two decimals"}}
```

Rules: `date` parses `YYYY-MM-DD`; `amount` matches `^\d+(\.\d{1,2})?$` and
converts to `amount_cents > 0` — zero and negative rejected; `category` matches
one of the six **exactly and case-sensitively**; `note` optional, trimmed,
defaults to `""`, max 500 characters.

**404** — unknown `trip_id`.

## DELETE /api/expenses/{expense_id}

**204** — no body. **404** — unknown `expense_id`.

## GET /api/trips/{trip_id}/export.csv

**200**, `Content-Type: text/csv`,
`Content-Disposition: attachment; filename="<slugified-trip-name>-expenses.csv"`.

Header row then one row per expense, newest date first. Exactly four columns —
`amount` is decimal dollars, not cents, because a human reads this file in a
spreadsheet and it round-trips back through import.

```csv
date,amount,category,note
2026-07-17,89.00,Transport,Airport taxi both ways
2026-07-15,63.50,Food,Team dinner
2026-07-14,412.00,Lodging,"Hotel, 3 nights"
```

Quoting is `csv.writer`'s, so notes containing commas or quotes stay valid.

**404** — unknown `trip_id`.

## POST /api/trips/{trip_id}/import

**Request**

```json
{"csv": "date,amount,category,note\n2026-07-18,45.00,Food,Breakfast\n..."}
```

**200** — always, whatever mix of good and bad rows arrived. Skipping is the
specified behaviour, not an error condition (FR-017).

```json
{"added": 12, "skipped": 3, "skipped_details": [
  {"line": 4, "reason": "amount not a positive number with at most two decimals"},
  {"line": 9, "reason": "category not one of the six"},
  {"line": 15, "reason": "expected 4 columns, got 3"}
]}
```

Parsing rules:

- Same four columns as export, same order.
- A leading row whose first cell case-insensitively equals `date` is treated as
  a header and skipped without counting as an error, so an exported file
  re-imports cleanly (FR-018).
- Each row runs the **same validators as the add-expense endpoint**, with one
  deliberate relaxation: category matching is trimmed and case-insensitive here
  (`food` → `Food`), because spreadsheet casing would otherwise cause mass
  skips. A value that still matches none of the six is skipped.
- `line` in `skipped_details` is the 1-based line number **within the pasted
  text**, so the user can find the row in what they pasted.
- All valid rows insert in **one transaction committed at the end**. A skipped
  row simply never inserts. Only an unexpected exception rolls back and returns
  `500` — no validation failure can reach that path.

**404** — unknown `trip_id`.
