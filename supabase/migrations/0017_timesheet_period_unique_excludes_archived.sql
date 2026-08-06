-- Archiving a timesheet (0005_soft_delete_timesheets.sql) was meant to free
-- up its period for a redo, but the plain unique constraint on
-- (caregiver_id, period_start, period_end) from 0001_schema.sql doesn't know
-- about deleted_at -- it still rejects a fresh insert for the same period
-- even once the old row is archived (see the 23505 handling in Pay.tsx's
-- timesheetErrorMessage). Swap it for a partial unique index that only
-- applies to active rows, matching how deleted_at is treated everywhere
-- else in the app, so archiving (or voiding the linked payment and then
-- archiving the timesheet) actually clears the period for reuse.
alter table public.timesheets
  drop constraint timesheets_caregiver_id_period_start_period_end_key;

create unique index timesheets_caregiver_period_active_key
  on public.timesheets (caregiver_id, period_start, period_end)
  where deleted_at is null;
