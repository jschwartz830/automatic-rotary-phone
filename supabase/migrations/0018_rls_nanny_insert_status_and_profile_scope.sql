-- Spec 19 (Supabase RLS Requirements) says a nanny "can only insert/update
-- their own draft time entries," "cannot approve leave requests," and
-- "cannot update approved, paid, or locked records" -- and the *update*
-- policies on time_entries/timesheets/leave_requests already enforce a
-- status allow-list on the caregiver-user branch. But each table's *insert*
-- policy's caregiver-user branch was never given the same status check --
-- only schedule_exceptions_insert (0002_rls.sql) got this right. Net effect:
-- a nanny calling the Supabase client directly (not through the app UI,
-- which never offers this) could insert a time_entries/leave_requests/
-- timesheets row already at 'approved'/'paid'/'locked', which Pay.tsx's
-- payroll calculations read via a plain status filter with no other
-- safeguard. This closes that gap by mirroring each table's own sibling
-- update policy's allow-list.

drop policy if exists time_entries_insert on public.time_entries;
create policy time_entries_insert on public.time_entries
  for insert
  with check (
    public.is_parent_or_coadmin(public.household_id_for_caregiver(caregiver_id))
    or (
      public.is_caregiver_user(caregiver_id)
      and status in ('draft', 'submitted')
    )
  );

drop policy if exists timesheets_insert on public.timesheets;
create policy timesheets_insert on public.timesheets
  for insert
  with check (
    (
      public.is_parent_or_coadmin(public.household_id_for_caregiver(caregiver_id))
      and (
        status not in ('approved', 'payment_due', 'paid', 'locked')
        or public.can_manage_household_setting(
          public.household_id_for_caregiver(caregiver_id), 'approve_timesheet'
        )
      )
    )
    or (
      public.is_caregiver_user(caregiver_id)
      and status in ('draft', 'submitted')
    )
  );

drop policy if exists leave_requests_insert on public.leave_requests;
create policy leave_requests_insert on public.leave_requests
  for insert
  with check (
    (
      public.is_parent_or_coadmin(public.household_id_for_caregiver(caregiver_id))
      and (
        status <> 'approved'
        or public.can_manage_household_setting(
          public.household_id_for_caregiver(caregiver_id), 'approve_pto'
        )
      )
    )
    or (
      public.is_caregiver_user(caregiver_id)
      and requested_by = auth.uid()
      and status = 'requested'
    )
  );

-- Spec 19 also says "A nanny can only read their own caregiver profile,"
-- but caregiver_profiles_select_member let any household member -- nanny
-- included -- read every caregiver_profiles row in the household, exposing
-- pay rate and other nanny_can_view_*-gated fields for *other* caregivers
-- (a real scenario once a household has more than one). The app UI never
-- reads another caregiver's row for a nanny viewer, so this only tightens
-- the network-layer boundary to match; parent/co-admin visibility is
-- unchanged.
drop policy if exists caregiver_profiles_select_member on public.caregiver_profiles;
create policy caregiver_profiles_select_member on public.caregiver_profiles
  for select
  using (
    public.is_household_member(household_id)
    and (not public.is_nanny_user(household_id) or public.is_caregiver_user(id))
  );
