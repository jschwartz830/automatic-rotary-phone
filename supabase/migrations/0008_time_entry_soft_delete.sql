-- Adds archive (soft-delete) support to time_entries, consistent with the
-- soft-delete already used on timesheets. The SELECT policy is updated to
-- exclude archived rows so the app never surfaces them in normal queries.
-- The DELETE policy is kept for safety but the app should archive instead.
alter table public.time_entries
  add column if not exists deleted_at timestamptz;

drop policy if exists time_entries_select on public.time_entries;
create policy time_entries_select on public.time_entries
  for select using (
    deleted_at is null
    and public.is_household_member(public.household_id_for_caregiver(caregiver_id))
  );
