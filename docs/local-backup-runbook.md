# Local PostgreSQL and media backups

The local scripts use only Docker Compose, PostgreSQL's `pg_dump`/`pg_restore`, and the configured filesystem media provider.

## Create a backup

With Docker PostgreSQL running, stop the Next.js app for a consistent database/media snapshot, then execute `npm run backup:local`. The script writes a timestamped directory under `BACKUP_PATH` (default `./backups`) containing a custom-format database dump, a copy of local media, and a manifest. It refuses symlinks and stores files with owner-only permissions where the host filesystem supports them. Backup folders are ignored by Git.

Set `BACKUP_PATH` to a separate disk or encrypted volume for operational resilience. The script does not encrypt backups itself.

## Restore a backup

Stop the Next.js app, ensure Docker PostgreSQL is running, and run `npm run restore:local -- --backup <path-to-backup-directory> --confirm`. Restore replaces the local database and the entire `LOCAL_STORAGE_PATH` media directory. Review the selected backup before confirming.

These scripts are for local development and operator-managed snapshots. Production backup scheduling, encryption/key custody, off-host retention, and restore drills still need an operations plan.
