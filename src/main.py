import os
import sqlite3
from contextlib import asynccontextmanager
from typing import Any, Dict, List

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from db import get_conn, init_db, DATABASE_PATH
from seed import seed
from validators import parse_amount_to_cents, parse_category, parse_date, ValidationError


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
        "amount_cents": int(row["amount_cents"]),
        "category": row["category"],
        "note": row["note"],
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

        total = conn.execute(
            "SELECT COALESCE(SUM(amount_cents), 0) AS total_cents FROM expenses WHERE trip_id = ?",
            (trip_id,),
        ).fetchone()["total_cents"]

        expenses = conn.execute(
            """
            SELECT id, trip_id, date, amount_cents, category, note
            FROM expenses
            WHERE trip_id = ?
            ORDER BY date DESC, id DESC
            """,
            (trip_id,),
        ).fetchall()

        return {
            "trip": _trip_row(trip, int(total)),
            "expenses": [_expense_row(row) for row in expenses],
            "total_cents": int(total),
        }
    finally:
        conn.close()


@app.post("/api/trips/{trip_id}/expenses")
def create_expense(trip_id: int, payload: Dict[str, Any]) -> JSONResponse:
    errors: Dict[str, str] = {}

    date_value = payload.get("date", "")
    if not isinstance(date_value, str):
        errors["date"] = "must be a date in YYYY-MM-DD format"
    else:
        try:
            date_value = parse_date(date_value)
        except ValidationError as exc:
            errors["date"] = str(exc)

    amount_value = payload.get("amount", "")
    if not isinstance(amount_value, str):
        errors["amount"] = "must be a positive number with at most two decimals"
    else:
        try:
            amount_cents = parse_amount_to_cents(amount_value)
        except ValidationError as exc:
            errors["amount"] = str(exc)

    category_value = payload.get("category", "")
    if not isinstance(category_value, str):
        errors["category"] = "category not one of the six"
    else:
        try:
            category_value = parse_category(category_value)
        except ValidationError as exc:
            errors["category"] = str(exc)

    note_value = payload.get("note", "")
    if not isinstance(note_value, str):
        note_value = ""
    note_value = note_value.strip()
    if len(note_value) > 500:
        errors["note"] = "note must be at most 500 characters"

    if errors:
        return JSONResponse({"errors": errors}, status_code=422)

    conn = get_conn()
    try:
        trip = conn.execute("SELECT id FROM trips WHERE id = ?", (trip_id,)).fetchone()
        if not trip:
            raise HTTPException(status_code=404, detail="trip not found")

        cursor = conn.execute(
            """
            INSERT INTO expenses (trip_id, date, amount_cents, category, note)
            VALUES (?, ?, ?, ?, ?)
            """,
            (trip_id, date_value, amount_cents, category_value, note_value),
        )
        expense_id = cursor.lastrowid
        conn.commit()

        row = conn.execute(
            "SELECT id, trip_id, date, amount_cents, category, note FROM expenses WHERE id = ?",
            (expense_id,),
        ).fetchone()
        return JSONResponse(_expense_row(row), status_code=201)
    finally:
        conn.close()


@app.delete("/api/expenses/{expense_id}", status_code=204)
def delete_expense(expense_id: int) -> None:
    conn = get_conn()
    try:
        cursor = conn.execute("DELETE FROM expenses WHERE id = ?", (expense_id,))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="expense not found")
        conn.commit()
    finally:
        conn.close()


@app.get("/trips/{trip_id}")
def trip_detail(trip_id: int):
    return FileResponse(os.path.join(os.path.dirname(__file__), "frontend", "trip.html"))


@app.get("/")
def index():
    return FileResponse(os.path.join(os.path.dirname(__file__), "frontend", "index.html"))
