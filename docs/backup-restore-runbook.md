# Backup and restore runbook

1. Produce an encrypted PostgreSQL backup using the hosting provider's supported process and record its creation time, retention class, region, encryption status, and operator.
2. Set `BACKUP_FILE` to the downloaded artifact and optionally `BACKUP_SHA256`; run `npm run verify:backup`. Store the JSON output as release evidence.
3. Provision a disposable database whose name contains `_restore_drill`. Never target staging or production.
4. Set `RESTORE_DRILL_DATABASE_URL`, `BACKUP_FILE`, and `CONFIRM_RESTORE_DRILL` (exact database name), then run `npm run drill:restore` on a machine with PostgreSQL client tools.
5. Run migrations, application readiness, authentication smoke, representative record counts, and privacy-boundary checks against the restored database.
6. Record RPO, RTO, table count, migration version, approver, anomalies, and cleanup confirmation. Delete the disposable database through the hosting provider only after evidence is retained.

The restore script refuses targets without `_restore_drill` and requires an exact confirmation value. A successful artifact check is not a restore drill; Phase 7 requires both.
