#!/usr/bin/env python3
"""Offline, read-only Growth OS MariaDB migration preflight.

Usage: python3 scripts/check-mariadb-migrations.py /path/to/hostinger-export.sql
Does not connect to databases or execute SQL. No external dependencies.
"""
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "database" / "mysql"
EXPECTED = [f"{n:03d}" for n in range(1, 9)]
def fail(message):
    print("FAIL:", message)
    return 1

def main():
    if len(sys.argv) != 2:
        return fail("Provide an existing SQL export path")
    export_path = Path(sys.argv[1])
    if not export_path.is_file():
        return fail("Export not found")
    dump = export_path.read_text(encoding="utf-8-sig", errors="replace")
    existing = set(re.findall(r"(?im)^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?([a-zA-Z0-9_]+)`?", dump))
    existing |= set(re.findall(r"(?im)^--\s+Table structure for table\s+`([^\x60]+)`", dump))
    found = []
    created = set()
    issues = []
    for number in EXPECTED:
        paths = sorted(MIGRATIONS.glob(number + "_*.sql"))
        if len(paths) != 1:
            issues.append(f"Expected exactly one migration {number}, found {len(paths)}")
            continue
        path = paths[0]
        sql = path.read_text(encoding="utf-8")
        found.append(path.name)
        created |= set(re.findall(r"(?i)\bCREATE\s+TABLE\s+(`?[a-zA-Z0-9_]+`?)", sql))
        if re.search(r"(?i)\b(DROP|TRUNCATE|REPLACE)\s+TABLE\b", sql):
            issues.append(f"Potentially destructive DDL: {path.name}")
    created = {x.strip("`") for x in created}
    collision = sorted(existing & created)
    print("Migrations:", ", ".join(found))
    print("Export CREATE TABLE entries:", len(existing))
    print("Growth OS table names in migrations:", len(created))
    print("Existing table name collisions:", ", ".join(collision) or "none in snapshot")
    print("Trigger migration requires client DELIMITER support and privileges")
    print("NOTE: Snapshot is not live schema. SQL syntax and runtime compatibility NOT certified.")
    if collision:
        issues.append("Export contains names targeted by migrations")
    for issue in issues:
        print("FAIL:", issue)
    return 1 if issues else 0

if __name__ == "__main__":
    sys.exit(main())
