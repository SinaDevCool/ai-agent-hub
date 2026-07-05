import os
import sqlite3
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PRISMA_DIR = ROOT / "prisma"
DB_PATH = PRISMA_DIR / "dev.db"
SQL_PATH = ROOT / "prisma" / "migrations" / "0001_init" / "migration.sql"


def main() -> None:
    database_url = os.getenv("DATABASE_URL", "file:./dev.db").strip('"')
    if database_url.startswith("file:"):
        candidate = database_url.replace("file:", "", 1)
        db_path = (PRISMA_DIR / candidate).resolve() if not Path(candidate).is_absolute() else Path(candidate)
    else:
        db_path = DB_PATH

    db_path.parent.mkdir(parents=True, exist_ok=True)
    sql = SQL_PATH.read_text(encoding="utf-8")
    with sqlite3.connect(db_path) as connection:
        connection.executescript(sql)
        connection.commit()
    print(f"SQLite database bootstrapped at {db_path}")


if __name__ == "__main__":
    main()
