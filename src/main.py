import csv
import io
import os
import re
import sqlite3
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Tuple

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from db import get_conn, init_db, DATABASE_PATH
from seed import seed
from validators import (
    ValidationError,
    format_cents,
    parse_amount_to_cents,
    parse_category,
    parse_date,
    parse_note,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    os.makedirs(os.path.dirname(DATABASE_PATH) or ".", exist_ok=True)
    init_db()
    seed()
    yield


app = FastAPI(lifespan=lifespan)
app.mount("/static", StaticFiles(directory=os.path.join(os.path.dirname(__file__), "frontend")), name="static")


def _trip_row(row: sqlite3.Row, total_cents: int) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "name": row["name"],
        "destination": row["destination"],
        "start_date": row["start_date"],
        "end_date": row["end_date"],
        "total_cents": total_cents,
    }


def _expense_row(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "trip_id": row["trip_id"],
        "date": row["date"],
        "amount_cents": row["amount_cents"],
        "category": row["category"],
        "note": row["note"] or None,
    }


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/trips")
def list_trips() -> List[Dict[str, Any]]:
    conn = get_conn()
    try:
        rows = conn.execute(
            """
            SELECT trips.id, trips.name, trips.destination, trips.start_date, trips.end_date,
                   COALESCE(SUM(expenses.amount_cents), 0) AS total_cents
            FROM trips
            LEFT JOIN expenses ON expenses.trip_id = trips.id
            GROUP BY trips.id
            ORDER BY trips.id
            """
        ).fetchall()
        return [_trip_row(row, int(row["total_cents"])) for row in rows]
    finally:
        conn.close()


@app.post("/api/trips")
def create_trip(payload: Dict[str, Any]) -> JSONResponse:
    errors: Dict[str, str] = {}

    name = payload.get("name", "").strip() if isinstance(payload.get("name"), str) else ""
    if not name:
        errors["name"] = "name is required"

    destination = payload.get("destination", "").strip() if isinstance(payload.get("destination"), str) else ""
    if not destination:
        errors["destination"] = "destination is required"

    start_date = payload.get("start_date", "")
    end_date = payload.get("end_date", "")

    for field, value in (("start_date", start_date), ("end_date", end_date)):
        if not isinstance(value, str):
            errors[field] = "must be a date in YYYY-MM-DD format"
        else:
            try:
                parse_date(value)
            except ValidationError as exc:
                errors[field] = str(exc)

    if "start_date" not in errors and "end_date" not in errors:
        if end_date < start_date:
            errors["end_date"] = "end_date must be on or after start_date"

    if errors:
        return JSONResponse({"errors": errors}, status_code=422)

    conn = get_conn()
    try:
        cursor = conn.execute(
            "INSERT INTO trips (name, destination, start_date, end_date) VALUES (?, ?, ?, ?)",
            (name, destination, start_date, end_date),
        )
        trip_id = cursor.lastrowid
        conn.commit()
        return JSONResponse(
            _trip_row(
                conn.execute(
                    "SELECT id, name, destination, start_date, end_date FROM trips WHERE id = ?",
                    (trip_id,),
                ).fetchone(),
                0,
            ),
            status_code=201,
        )
    finally:
        conn.close()


@app.get("/api/trips/{trip_id}")
def get_trip(trip_id: int) -> Dict[str, Any]:
    conn = get_conn()
    try:
        trip = conn.execute(
            "SELECT id, name, destination, start_date, end_date FROM trips WHERE id = ?",
            (trip_id,),
        ).fetchone()
        if not trip:
            raise HTTPException(status_code=404, detail="trip not found")

        expenses = conn.execute(
            """
            SELECT id, trip_id, date, amount_cents, category, note
            FROM expenses
            WHERE trip_id = ?
            ORDER BY date DESC, id DESC
            """,
            (trip_id,),
        ).fetchall()

        total_cents = conn.execute(
            "SELECT COALESCE(SUM(amount_cents), 0) FROM expenses WHERE trip_id = ?",
            (trip_id,),
        ).fetchone()[0]

        subtotal_rows = conn.execute(
            """
            SELECT category, SUM(amount_cents) AS subtotal_cents
            FROM expenses
            WHERE trip_id = ?
            GROUP BY category
            ORDER BY subtotal_cents DESC, category
            """,
            (trip_id,),
        ).fetchall()
        subtotals = [
            {"category": row["category"], "subtotal_cents": int(row["subtotal_cents"])}
            for row in subtotal_rows
        ]

        return {
            "trip": _trip_row(trip, int(total_cents)),
            "expenses": [_expense_row(row) for row in expenses],
            "subtotals": subtotals,
            "total_cents": int(total_cents),
        }
    finally:
        conn.close()


@app.get("/api/trips/{trip_id}/expenses")
def list_expenses(trip_id: int, category: str = None) -> List[Dict[str, Any]]:
    conn = get_conn()
    try:
        trip = conn.execute("SELECT id FROM trips WHERE id = ?", (trip_id,)).fetchone()
        if not trip:
            raise HTTPException(status_code=404, detail="trip not found")

        if category is not None:
            try:
                parse_category(category)
            except ValidationError as exc:
                raise HTTPException(status_code=422, detail=str(exc))
            category_filter = category
        else:
            category_filter = None

        if category_filter is not None:
            rows = conn.execute(
                """
                SELECT id, trip_id, date, amount_cents, category, note
                FROM expenses
                WHERE trip_id = ? AND category = ?
                ORDER BY date DESC, id DESC
                """,
                (trip_id, category_filter),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT id, trip_id, date, amount_cents, category, note
                FROM expenses
                WHERE trip_id = ?
                ORDER BY date DESC, id DESC
                """,
                (trip_id,),
            ).fetchall()

        return [_expense_row(row) for row in rows]
    finally:
        conn.close()


@app.post("/api/trips/{trip_id}/expenses")
def create_expense(trip_id: int, payload: Dict[str, Any]) -> JSONResponse:
    conn = get_conn()
    try:
        trip = conn.execute("SELECT id FROM trips WHERE id = ?", (trip_id,)).fetchone()
        if not trip:
            return JSONResponse({"errors": {"trip_id": "trip not found"}}, status_code=404)
    finally:
        conn.close()

    errors: Dict[str, str] = {}

    raw_date = payload.get("date")
    if not isinstance(raw_date, str):
        errors["date"] = "must be a date in YYYY-MM-DD format"
    else:
        try:
            date = parse_date(raw_date)
        except ValidationError as exc:
            errors["date"] = str(exc)

    raw_amount = payload.get("amount")
    if not isinstance(raw_amount, str):
        errors["amount"] = "must be a positive number with at most two decimals"
    else:
        try:
            amount_cents = parse_amount_to_cents(raw_amount)
        except ValidationError as exc:
            errors["amount"] = str(exc)

    raw_category = payload.get("category")
    if not isinstance(raw_category, str):
        errors["category"] = "category not one of the six"
    else:
        try:
            category = parse_category(raw_category)
        except ValidationError as exc:
            errors["category"] = str(exc)

    try:
        note = parse_note(payload.get("note"))
    except ValidationError as exc:
        errors["note"] = str(exc)

    if errors:
        return JSONResponse({"errors": errors}, status_code=422)

    conn = get_conn()
    try:
        cursor = conn.execute(
            """
            INSERT INTO expenses (trip_id, date, amount_cents, category, note)
            VALUES (?, ?, ?, ?, ?)
            """,
            (trip_id, date, amount_cents, category, note if note is not None else ""),
        )
        expense_id = cursor.lastrowid
        conn.commit()
        return JSONResponse(
            _expense_row(
                conn.execute(
                    "SELECT id, trip_id, date, amount_cents, category, note FROM expenses WHERE id = ?",
                    (expense_id,),
                ).fetchone()
            ),
            status_code=201,
        )
    finally:
        conn.close()


@app.patch("/api/expenses/{expense_id}")
def update_expense_note(expense_id: int, payload: Dict[str, Any]) -> JSONResponse:
    errors: Dict[str, str] = {}

    try:
        note = parse_note(payload.get("note"))
    except ValidationError as exc:
        errors["note"] = str(exc)

    if errors:
        return JSONResponse({"errors": errors}, status_code=422)

    conn = get_conn()
    try:
        cursor = conn.execute(
            "UPDATE expenses SET note = ? WHERE id = ?",
            (note if note is not None else "", expense_id),
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="expense not found")
        conn.commit()

        row = conn.execute(
            "SELECT id, trip_id, date, amount_cents, category, note FROM expenses WHERE id = ?",
            (expense_id,),
        ).fetchone()
        return JSONResponse(_expense_row(row), status_code=200)
    finally:
        conn.close()


@app.delete("/api/expenses/{expense_id}")
def delete_expense(expense_id: int):
    conn = get_conn()
    try:
        cursor = conn.execute("DELETE FROM expenses WHERE id = ?", (expense_id,))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="expense not found")
        conn.commit()
    finally:
        conn.close()


@app.delete("/api/trips/{trip_id}", status_code=204)
def delete_trip(trip_id: int):
    conn = get_conn()
    try:
        # Explicitly remove the trip's expenses first, then the trip itself,
        # so the database never holds an orphaned expense even if the cascade
        # were disabled by a missing pragma.
        conn.execute("DELETE FROM expenses WHERE trip_id = ?", (trip_id,))
        cursor = conn.execute("DELETE FROM trips WHERE id = ?", (trip_id,))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="trip not found")
        conn.commit()
    finally:
        conn.close()


def _slugify(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    value = value.strip("-")
    return value or "trip"


@app.get("/api/trips/{trip_id}/export.csv")
def export_csv(trip_id: int) -> StreamingResponse:
    conn = get_conn()
    try:
        trip = conn.execute(
            "SELECT name FROM trips WHERE id = ?", (trip_id,)
        ).fetchone()
        if not trip:
            raise HTTPException(status_code=404, detail="trip not found")

        rows = conn.execute(
            """
            SELECT date, amount_cents, category, note
            FROM expenses
            WHERE trip_id = ?
            ORDER BY date DESC, id DESC
            """,
            (trip_id,),
        ).fetchall()

        filename = f"{_slugify(trip['name'])}-expenses.csv"

        def generate():
            buf = io.StringIO()
            writer = csv.writer(buf)
            writer.writerow(["date", "amount", "category", "note"])
            for row in rows:
                writer.writerow([
                    row["date"],
                    format_cents(int(row["amount_cents"])),
                    row["category"],
                    row["note"],
                ])
                chunk = buf.getvalue()
                buf.seek(0)
                buf.truncate(0)
                yield chunk

        return StreamingResponse(
            generate(),
            media_type="text/csv",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"'
            },
        )
    finally:
        conn.close()


@app.post("/api/trips/{trip_id}/import")
def import_csv(trip_id: int, payload: Dict[str, Any]) -> JSONResponse:
    conn = get_conn()
    try:
        trip = conn.execute("SELECT id FROM trips WHERE id = ?", (trip_id,)).fetchone()
        if not trip:
            return JSONResponse({"errors": {"trip_id": "trip not found"}}, status_code=404)
    finally:
        conn.close()

    raw_csv = payload.get("csv")
    if not isinstance(raw_csv, str):
        return JSONResponse({"errors": {"csv": "csv text is required"}}, status_code=422)

    reader = csv.reader(io.StringIO(raw_csv))

    valid_rows: List[Tuple[str, int, str, str]] = []
    skipped_details: List[Dict[str, Any]] = []
    line_number = 0
    first_row = True
    for line_number, raw_row in enumerate(reader, start=1):
        if first_row:
            first_row = False
            if raw_row and raw_row[0].strip().casefold() == "date":
                continue

        if len(raw_row) < 4:
            skipped_details.append({"line": line_number, "reason": "row must have at least 4 columns"})
            continue

        date_raw, amount_raw, category_raw, note_raw, *_ = raw_row

        try:
            date = parse_date(date_raw)
        except ValidationError as exc:
            skipped_details.append({"line": line_number, "reason": str(exc)})
            continue

        try:
            amount_cents = parse_amount_to_cents(amount_raw)
        except ValidationError as exc:
            skipped_details.append({"line": line_number, "reason": str(exc)})
            continue

        try:
            category = parse_category(category_raw, lenient=True)
        except ValidationError as exc:
            skipped_details.append({"line": line_number, "reason": str(exc)})
            continue

        try:
            note = parse_note(note_raw)
        except ValidationError as exc:
            skipped_details.append({"line": line_number, "reason": str(exc)})
            continue

        valid_rows.append((date, amount_cents, category, note if note is not None else ""))

    conn = get_conn()
    try:
        with conn:
            for date, amount_cents, category, note in valid_rows:
                conn.execute(
                    """
                    INSERT INTO expenses (trip_id, date, amount_cents, category, note)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (trip_id, date, amount_cents, category, note),
                )

        return JSONResponse(
            {
                "added": len(valid_rows),
                "skipped": len(skipped_details),
                "skipped_details": skipped_details,
            },
            status_code=200,
        )
    finally:
        conn.close()


@app.get("/trips/{trip_id}")
def trip_detail(trip_id: int):
    return FileResponse(os.path.join(os.path.dirname(__file__), "frontend", "trip.html"))


@app.get("/")
def index():
    return FileResponse(os.path.join(os.path.dirname(__file__), "frontend", "index.html"))
