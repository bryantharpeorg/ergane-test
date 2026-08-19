from db import get_conn


def seed() -> None:
    conn = get_conn()
    try:
        existing = conn.execute("SELECT COUNT(*) FROM trips").fetchone()[0]
        if existing:
            return

        conn.executemany(
            "INSERT INTO trips (name, destination, start_date, end_date) VALUES (?, ?, ?, ?)",
            [
                ("Q3 Client Onsite", "Chicago, IL", "2026-07-14", "2026-07-17"),
                ("Vendor Summit", "Austin, TX", "2026-08-03", "2026-08-06"),
            ],
        )
        conn.executemany(
            "INSERT INTO expenses (trip_id, date, amount_cents, category, note) VALUES (?, ?, ?, ?, ?)",
            [
                (1, "2026-07-14", 41200, "Lodging", "Hotel, 3 nights"),
                (1, "2026-07-15", 6350, "Food", "Team dinner"),
                (1, "2026-07-17", 8900, "Transport", "Airport taxi both ways"),
                (2, "2026-08-03", 25000, "Lodging", "Conference rate"),
                (2, "2026-08-04", 1875, "Food", "Coffee and lunch"),
            ],
        )
        conn.commit()
    finally:
        conn.close()
