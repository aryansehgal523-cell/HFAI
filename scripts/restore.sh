#!/usr/bin/env bash
# Restore a backup made by .github/workflows/backup.yml
#   ./scripts/restore.sh hireflow-2026-11-06.dump "postgres://user:pass@host/db"
# Restore into a NEW empty database first, check it, then point DATABASE_URL at it.
set -euo pipefail
FILE="${1:?usage: restore.sh <file.dump> <target DATABASE_URL>}"
TARGET="${2:?usage: restore.sh <file.dump> <target DATABASE_URL>}"
pg_restore --no-owner --no-acl --clean --if-exists --dbname "$TARGET" "$FILE"
echo "Restored $FILE"
