-- Spec 11 (Role Permission Matrix): "Approve timesheet", "Reject/request
-- correction", "Mark payment made", and "Approve PTO" are listed as
-- Yes/Optional for parent co-admin, meaning a household can restrict a
-- co-admin from them the same way it already can for edit_pay_rate,
-- edit_pto_policy, edit_guaranteed_hours_policy, edit_schedule,
-- edit_household, manage_users, and view_audit_log (migration 0002). Those
-- four matrix rows had no restrictable key until now -- a restricted
-- co-admin could still approve timesheets, mark payments paid, and approve
-- PTO regardless of the toggle. This migration adds three new
-- coadmin_permission_allowed keys -- approve_timesheet, mark_payment_made,
-- approve_pto -- enforced the same way: parent_admin is never restricted,
-- and a parent_co_admin has the permission by default unless
-- household_users.permissions[key] is explicitly set to false.
--
-- "Export records" (also Yes/Optional in the matrix) is intentionally not
-- given an RLS key here: export buttons only read rows the co-admin can
-- already SELECT and format them client-side, so there is no additional
-- data boundary for the database to enforce -- a restricted co-admin could
-- reconstruct the same export by hand from data they can already see. That
-- one is gated client-side only (see App code); see QUESTIONS_AND_CLARIFICATIONS.md.

-- ---------------------------------------------------------------------------
-- timesheets: approving (or rejecting/requesting correction) requires
-- approve_timesheet. Rows that stay in draft/submitted/needs_correction
-- (nanny submission, parent edits before a decision) don't.
-- ---------------------------------------------------------------------------
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
    or public.is_caregiver_user(caregiver_id)
  );

drop policy if exists timesheets_update on public.timesheets;
create policy timesheets_update on public.timesheets
  for update
  using (
    public.is_parent_or_coadmin(public.household_id_for_caregiver(caregiver_id))
    or (public.is_caregiver_user(caregiver_id) and status in ('draft', 'needs_correction'))
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
    )
  );

-- ---------------------------------------------------------------------------
-- payment_records: creating a record (either the automatic one that comes
-- from approving a timesheet, or a correction record) requires either
-- approve_timesheet or mark_payment_made -- both workflows legitimately
-- create a payment_records row. Updating one (mark paid/partially paid,
-- void, mark the original 'corrected') requires mark_payment_made
-- specifically, since that's the payment-lifecycle action, not the
-- timesheet-approval one.
-- ---------------------------------------------------------------------------
drop policy if exists payment_records_insert_manager on public.payment_records;
create policy payment_records_insert_manager on public.payment_records
  for insert
  with check (
    public.can_manage_household_setting(
      public.household_id_for_caregiver(caregiver_id), 'approve_timesheet'
    )
    or public.can_manage_household_setting(
      public.household_id_for_caregiver(caregiver_id), 'mark_payment_made'
    )
  );

drop policy if exists payment_records_update_manager on public.payment_records;
create policy payment_records_update_manager on public.payment_records
  for update
  using (
    public.can_manage_household_setting(
      public.household_id_for_caregiver(caregiver_id), 'mark_payment_made'
    )
  )
  with check (
    public.can_manage_household_setting(
      public.household_id_for_caregiver(caregiver_id), 'mark_payment_made'
    )
  );

-- ---------------------------------------------------------------------------
-- leave_requests: a parent/co-admin recording leave that lands directly in
-- 'approved' (the "record leave" form path in Pto.tsx, as opposed to a
-- nanny's 'requested' submission) requires approve_pto, as does reviewing
-- (approve/reject) an existing request.
-- ---------------------------------------------------------------------------
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
    or (public.is_caregiver_user(caregiver_id) and requested_by = auth.uid())
  );

drop policy if exists leave_requests_update on public.leave_requests;
create policy leave_requests_update on public.leave_requests
  for update
  using (
    public.is_parent_or_coadmin(public.household_id_for_caregiver(caregiver_id))
    or (public.is_caregiver_user(caregiver_id) and status = 'requested')
  )
  with check (
    (
      public.is_parent_or_coadmin(public.household_id_for_caregiver(caregiver_id))
      and (
        status not in ('approved', 'rejected')
        or public.can_manage_household_setting(
          public.household_id_for_caregiver(caregiver_id), 'approve_pto'
        )
      )
    )
    or (public.is_caregiver_user(caregiver_id) and status in ('requested', 'canceled'))
  );

-- leave_ledger 'used' events are written immediately after a leave_requests
-- approval, and 'opening_balance'/'manual_adjustment' events are written from
-- the caregiver-settings allowance form (edit_pto_policy). Allow either
-- permission to insert, since both are legitimate sources of ledger rows.
drop policy if exists leave_ledger_insert_manager on public.leave_ledger;
create policy leave_ledger_insert_manager on public.leave_ledger
  for insert
  with check (
    public.can_manage_household_setting(
      public.household_id_for_caregiver(caregiver_id), 'approve_pto'
    )
    or public.can_manage_household_setting(
      public.household_id_for_caregiver(caregiver_id), 'edit_pto_policy'
    )
  );
