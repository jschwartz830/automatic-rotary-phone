-- Generating a timesheet (Pay.tsx) now creates a 'draft' that a parent
-- reviews, can hand-edit, and approves as stored -- approval no longer
-- recalculates a parent-generated draft. The nanny branch of
-- timesheets_update (0014) lets the caregiver update any of their own
-- timesheets while it's draft/needs_correction, which would let a nanny
-- change the hours or rate on a parent's draft before it's approved.
-- Narrow that branch to rows the nanny submitted themselves. The app never
-- issues a nanny-side timesheet update today, so nothing in-app changes.
drop policy if exists timesheets_update on public.timesheets;
create policy timesheets_update on public.timesheets
  for update
  using (
    public.is_parent_or_coadmin(public.household_id_for_caregiver(caregiver_id))
    or (
      public.is_caregiver_user(caregiver_id)
      and status in ('draft', 'needs_correction')
      and submitted_by = auth.uid()
    )
  )
  with check (
    (
      public.is_parent_or_coadmin(public.household_id_for_caregiver(caregiver_id))
      and (
        status not in ('approved', 'needs_correction', 'payment_due', 'paid', 'locked')
        or public.can_manage_household_setting(
          public.household_id_for_caregiver(caregiver_id), 'approve_timesheet'
        )
      )
    )
    or (
      public.is_caregiver_user(caregiver_id)
      and status in ('draft', 'submitted', 'needs_correction')
      and submitted_by = auth.uid()
    )
  );
