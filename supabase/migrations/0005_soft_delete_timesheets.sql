-- Makes "deleting" a timesheet non-destructive: instead of removing the row,
-- the app now sets deleted_at on the timesheet and its linked payment record
-- (and clears it again to restore from the trash). This replaces the hard
-- delete added in 0004_allow_timesheet_delete.sql.
--
-- Run this against any database that already applied 0004_allow_timesheet_delete.sql.

alter table public.timesheets add column if not exists deleted_at timestamptz;
alter table public.payment_records add column if not exists deleted_at timestamptz;

-- The app no longer issues hard deletes for these tables -- soft-delete goes
-- through the existing update policies instead -- so the delete policies are
-- dropped entirely. This means a row can't be removed outright even via a
-- direct API call.
drop policy if exists timesheets_delete_manager on public.timesheets;
drop policy if exists payment_records_delete_manager on public.payment_records;
drop policy if exists payment_records_delete_admin on public.payment_records;
