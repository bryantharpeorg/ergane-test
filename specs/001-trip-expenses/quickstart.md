# Quickstart — Trip Expenses (Phase 1)

How to bring the app up and prove it does what `spec.md` says. Every check below
maps to an acceptance scenario or a success criterion.

## Run

```bash
docker compose up -d --build
curl -fsS localhost:${PORT}/api/health
```

First boot applies `src/schema.sql` and runs `src/seed.py`, which is idempotent —
restarting does not duplicate the seed.

**If boot fails with `sqlite3.OperationalError: table ... has no column named ...`**,
the seed and the DDL have drifted. Fix the DDL to match the canonical column
list in `data-model.md`; do not drop the seed column.

## Smoke — the data layer

```bash
# Two trips, five expenses from the seed
curl -s localhost:${PORT}/api/trips | python3 -m json.tool
```

Expect `total_cents` of `56450` and `26875`. If a total is `0` or missing, the
aggregate is wrong; if a trip is absent, the `LEFT JOIN` was written as an inner
join and trips with no expenses are being dropped.

## Verify the foreign-key pragma (the one that fails silently)

This is invariant 1 in `data-model.md` and the single most likely thing to be
quietly wrong.

```bash
# Create a throwaway trip, give it an expense, delete the trip
TRIP=$(curl -s -X POST localhost:${PORT}/api/trips \
  -H 'content-type: application/json' \
  -d '{"name":"Cascade Test","destination":"Nowhere","start_date":"2026-01-01","end_date":"2026-01-02"}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')

curl -s -X POST localhost:${PORT}/api/trips/$TRIP/expenses \
  -H 'content-type: application/json' \
  -d '{"date":"2026-01-01","amount":"10.00","category":"Food","note":"x"}' > /dev/null

curl -s -X DELETE localhost:${PORT}/api/trips/$TRIP -o /dev/null -w '%{http_code}\n'

# Must be 0 — anything else means PRAGMA foreign_keys = ON is missing
docker exec <container> python3 -c "
import sqlite3; c = sqlite3.connect('<db path>')
print(c.execute('SELECT COUNT(*) FROM expenses WHERE trip_id = $TRIP').fetchone()[0])"
```

A non-zero count here is the orphan bug the user explicitly ruled out (FR-019),
and it will not show up anywhere in the UI.

## Verify amount validation

Each of these must return `422` and create nothing:

```bash
for AMT in "0" "-5.00" "12.345" "abc"; do
  curl -s -X POST localhost:${PORT}/api/trips/1/expenses \
    -H 'content-type: application/json' \
    -d "{\"date\":\"2026-07-20\",\"amount\":\"$AMT\",\"category\":\"Food\"}" \
    -o /dev/null -w "$AMT -> %{http_code}\n"
done
```

## Verify import skip-and-report

```bash
curl -s -X POST localhost:${PORT}/api/trips/2/import \
  -H 'content-type: application/json' \
  -d '{"csv":"date,amount,category,note\n2026-08-05,20.00,Food,ok\n2026-08-05,abc,Food,bad amount\n2026-08-05,15.00,Snacks,bad category\n2026-08-05,9.99,food,lowercase ok\n"}'
```

Expect `added: 2`, `skipped: 2`, with lines 3 and 4 named. Note the fourth data
row (`food`, lowercase) **must** be accepted and stored as `Food` — the importer
matches categories case-insensitively while the form does not.

## Verify export round-trips

```bash
curl -s localhost:${PORT}/api/trips/1/export.csv
```

Header `date,amount,category,note`, three rows, newest date first, amounts as
decimal dollars, and `"Hotel, 3 nights"` quoted. Paste that exact output back
into another trip's import box: it must report `skipped: 0` and the header row
must not count as an error.

## Verify in the browser

1. **Trips list** — both seed trips with date ranges and totals; clicking a row opens its detail.
2. **Trip detail** — expenses newest-first; the $412.00 and $250.00 rows visibly highlighted; a $200.00 expense added by hand is **not** highlighted.
3. **Add form** — the category control offers exactly six options with no free-text entry; submitting updates table, subtotals, chart, and total with no page reload.
4. **Chart** — one horizontal bar per non-empty category. On the seed data, trip 1 shows three bars and trip 2 shows two — never six.
5. **Filter** — selecting Food narrows the table only; subtotals and chart stay put.
6. **Delete trip** — the confirm dialog names the trip and says its expenses go too.

## Verify the negative requirements

```bash
grep -ri "password\|login\|session\|account" src/ | grep -v "^Binary"   # must be empty
grep -ri "currency\|EUR\|GBP" src/                                      # must be empty
ls src/frontend/                                                        # no vendored library files
```

The app must also make zero outbound requests at runtime — check the browser
network tab shows only same-origin traffic.
