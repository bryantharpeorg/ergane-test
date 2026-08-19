import os
import sqlite3

_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE_PATH = os.environ.get("DATABASE_PATH", os.path.join(_BASE_DIR, "..", "data", "trip-expenses.db"))


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    schema_path = os.path.join(_BASE_DIR, "schema.sql")
    conn = get_conn()
    try:
        with open(schema_path, "r") as f:
            conn.executescript(f.read())
        conn.commit()
    finally:
        conn.close()
