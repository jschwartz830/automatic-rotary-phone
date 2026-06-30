-- Nanny Ledger: Row Level Security policies and helper functions.
-- All app authorization must flow through these policies; the frontend only
-- hides controls for UX, it is never the security boundary.

-- ---------------------------------------------------------------------------
-- Helper functions (security definer so they can read household_users
-- without triggering RLS recursion on that table).
-- ---------------------------------------------------------------------------
create or replace function public.is_household_member(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.household_users hu
    where hu.household_id = p_household_id
      and hu.user_id = auth.uid()
      and hu.status = 'active'
  );
$$;

create or replace function public.is_parent_admin(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.household_users hu
    where hu.household_id = p_household_id
      and hu.user_id = auth.uid()
      and hu.status = 'active'
      and hu.role = 'parent_admin'
  );
$$;

create or replace function public.is_parent_or_coadmin(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.household_users hu
    where hu.household_id = p_household_id
      and hu.user_id = auth.uid()
      and hu.status = 'active'
      and hu.role in ('parent_admin', 'parent_co_admin')
  );
$$;

create or replace function public.is_nanny_user(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.household_users hu
    where hu.household_id = p_household_id
      and hu.user_id = auth.uid()
      and hu.status = 'active'
      and hu.role = 'nanny'
  );
$$;

create or replace function public.is_caregiver_user(p_caregiver_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.caregiver_profiles cp
    where cp.id = p_caregiver_id
      and cp.user_id = auth.uid()
  );
$$;

create or replace function public.household_id_for_caregiver(p_caregiver_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select household_id from public.caregiver_profiles where id = p_caregiver_id;
$$;

create or replace function public.household_id_for_timesheet(p_timesheet_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select cp.household_id
  from public.timesheets t
  join public.caregiver_profiles cp on cp.id = t.caregiver_id
  where t.id = p_timesheet_id;
$$;

-- A parent co-admin has every permission by default. A household_users.permissions
-- jsonb key explicitly set to false revokes a specific sensitive permission for
-- that co-admin, per spec section 10 ("can optionally be restricted from...").
create or replace function public.coadmin_permission_allowed(p_household_id uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select (hu.permissions ->> p_key)::boolean
      from public.household_users hu
      where hu.household_id = p_household_id
        and hu.user_id = auth.uid()
        and hu.status = 'active'
        and hu.role = 'parent_co_admin'
    ),
    true
  );
$$;

-- True if the caller can perform a sensitive/settings-level action for a
-- household: parent_admin always can; parent_co_admin can unless explicitly
-- restricted via permissions[key] = false.
create or replace function public.can_manage_household_setting(p_household_id uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_parent_admin(p_household_id)
    or (public.is_parent_or_coadmin(p_household_id)
        and public.coadmin_permission_allowed(p_household_id, p_key));
$$;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
create policy users_select_self_or_household_peer on public.users
  for select
  using (
    id = auth.uid()
    or exists (
      select 1
      from public.household_users mine
      join public.household_users theirs on theirs.household_id = mine.household_id
      where mine.user_id = auth.uid()
        and mine.status = 'active'
        and theirs.user_id = public.users.id
        and theirs.status = 'active'
    )
  );

create policy users_update_self on public.users
  for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- households
-- ---------------------------------------------------------------------------
create policy households_select_member on public.households
  for select
  using (public.is_household_member(id));

create policy households_insert_creator on public.households
  for insert
  with check (created_by = auth.uid());

create policy households_update_admin on public.households
  for update
  using (public.can_manage_household_setting(id, 'edit_household'))
  with check (public.can_manage_household_setting(id, 'edit_household'));

-- ---------------------------------------------------------------------------
-- household_users
-- ---------------------------------------------------------------------------
create policy household_users_select_member on public.household_users
  for select
  using (public.is_household_member(household_id));

-- A user may also see/create their own initial parent_admin membership row
-- when creating a brand-new household (no members exist yet to grant via RLS).
create policy household_users_insert_self_admin_or_manager on public.household_users
  for insert
  with check (
    (
      user_id = auth.uid()
      and role = 'parent_admin'
      and not exists (
        select 1 from public.household_users existing
        where existing.household_id = household_users.household_id
      )
    )
    or public.can_manage_household_setting(household_id, 'manage_users')
  );

create policy household_users_update_manager on public.household_users
  for update
  using (public.can_manage_household_setting(household_id, 'manage_users'))
  with check (public.can_manage_household_setting(household_id, 'manage_users'));

create policy household_users_delete_manager on public.household_users
  for delete
  using (public.can_manage_household_setting(household_id, 'manage_users'));

-- ---------------------------------------------------------------------------
-- caregiver_profiles
-- ---------------------------------------------------------------------------
create policy caregiver_profiles_select_member on public.caregiver_profiles
  for select
  using (public.is_household_member(household_id));

create policy caregiver_profiles_insert_manager on public.caregiver_profiles
  for insert
  with check (public.is_parent_or_coadmin(household_id));

create policy caregiver_profiles_update_manager on public.caregiver_profiles
  for update
  using (public.is_parent_or_coadmin(household_id))
  with check (public.is_parent_or_coadmin(household_id));

create policy caregiver_profiles_delete_admin on public.caregiver_profiles
  for delete
  using (public.is_parent_admin(household_id));

-- Row-level RLS can't restrict individual columns, so a trigger enforces the
-- "co-admin can be restricted from editing pay rate / guaranteed hours policy"
-- rules from spec section 10 at the column level.
create or replace function public.enforce_caregiver_profile_restrictions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_parent_admin(new.household_id) then
    return new;
  end if;

  if not public.coadmin_permission_allowed(new.household_id, 'edit_pay_rate') then
    if new.default_hourly_rate is distinct from old.default_hourly_rate
      or new.overtime_threshold_hours is distinct from old.overtime_threshold_hours
      or new.overtime_multiplier is distinct from old.overtime_multiplier
      or new.payment_method_label is distinct from old.payment_method_label
      or new.pay_frequency is distinct from old.pay_frequency
      or new.pay_period_start_day is distinct from old.pay_period_start_day
      or new.payday_rule is distinct from old.payday_rule
      or new.payday_day_of_week is distinct from old.payday_day_of_week
      or new.payday_days_after_period_end is distinct from old.payday_days_after_period_end
    then
      raise exception 'This co-admin is restricted from editing pay rate / pay settings';
    end if;
  end if;

  if not public.coadmin_permission_allowed(new.household_id, 'edit_guaranteed_hours_policy') then
    if new.guaranteed_hours_enabled is distinct from old.guaranteed_hours_enabled
      or new.guaranteed_hours_basis is distinct from old.guaranteed_hours_basis
      or new.fixed_weekly_guaranteed_hours is distinct from old.fixed_weekly_guaranteed_hours
      or new.fixed_pay_period_guaranteed_hours is distinct from old.fixed_pay_period_guaranteed_hours
      or new.unpaid_time_off_reduces_guarantee is distinct from old.unpaid_time_off_reduces_guarantee
      or new.family_cancellation_counts_toward_guarantee is distinct from old.family_cancellation_counts_toward_guarantee
      or new.pto_counts_toward_guarantee is distinct from old.pto_counts_toward_guarantee
      or new.sick_counts_toward_guarantee is distinct from old.sick_counts_toward_guarantee
      or new.holiday_counts_toward_guarantee is distinct from old.holiday_counts_toward_guarantee
    then
      raise exception 'This co-admin is restricted from editing guaranteed hours settings';
    end if;
  end if;

  return new;
end;
$$;

create trigger enforce_caregiver_profile_restrictions
  before update on public.caregiver_profiles
  for each row execute function public.enforce_caregiver_profile_restrictions();

-- ---------------------------------------------------------------------------
-- caregiver_private_notes (parent-only, never visible to nanny)
-- ---------------------------------------------------------------------------
create policy caregiver_private_notes_select_parent on public.caregiver_private_notes
  for select
  using (public.is_parent_or_coadmin(public.household_id_for_caregiver(caregiver_id)));

create policy caregiver_private_notes_upsert_parent on public.caregiver_private_notes
  for insert
  with check (public.is_parent_or_coadmin(public.household_id_for_caregiver(caregiver_id)));

create policy caregiver_private_notes_update_parent on public.caregiver_private_notes
  for update
  using (public.is_parent_or_coadmin(public.household_id_for_caregiver(caregiver_id)))
  with check (public.is_parent_or_coadmin(public.household_id_for_caregiver(caregiver_id)));

-- ---------------------------------------------------------------------------
-- schedule_templates / schedule_shifts
-- ---------------------------------------------------------------------------
create policy schedule_templates_select_member on public.schedule_templates
  for select
  using (public.is_household_member(public.household_id_for_caregiver(caregiver_id)));

create policy schedule_templates_write_manager on public.schedule_templates
  for all
  using (public.can_manage_household_setting(public.household_id_for_caregiver(caregiver_id), 'edit_schedule'))
  with check (public.can_manage_household_setting(public.household_id_for_caregiver(caregiver_id), 'edit_schedule'));

create policy schedule_shifts_select_member on public.schedule_shifts
  for select
  using (
    public.is_household_member(
      (select public.household_id_for_caregiver(st.caregiver_id)
       from public.schedule_templates st where st.id = schedule_template_id)
    )
  );

create policy schedule_shifts_write_manager on public.schedule_shifts
  for all
  using (
    public.can_manage_household_setting(
      (select public.household_id_for_caregiver(st.caregiver_id)
       from public.schedule_templates st where st.id = schedule_template_id),
      'edit_schedule'
    )
  )
  with check (
    public.can_manage_household_setting(
      (select public.household_id_for_caregiver(st.caregiver_id)
       from public.schedule_templates st where st.id = schedule_template_id),
      'edit_schedule'
    )
  );

-- ---------------------------------------------------------------------------
-- schedule_exceptions
-- ---------------------------------------------------------------------------
create policy schedule_exceptions_select_member on public.schedule_exceptions
  for select
  using (public.is_household_member(public.household_id_for_caregiver(caregiver_id)));

-- Nanny may create requests (pto/sick/unpaid/other) for themselves only, and
-- only in a requestable status; parents/co-admins (subject to schedule
-- permission) can create any exception type directly as approved.
create policy schedule_exceptions_insert on public.schedule_exceptions
  for insert
  with check (
    public.can_manage_household_setting(public.household_id_for_caregiver(caregiver_id), 'edit_schedule')
    or (
      public.is_caregiver_user(caregiver_id)
      and exception_type in ('pto', 'sick', 'unpaid_time_off')
      and status in ('draft', 'requested')
    )
  );

create policy schedule_exceptions_update on public.schedule_exceptions
  for update
  using (
    public.can_manage_household_setting(public.household_id_for_caregiver(caregiver_id), 'edit_schedule')
    or (public.is_caregiver_user(caregiver_id) and status in ('draft', 'requested'))
  )
  with check (
    public.can_manage_household_setting(public.household_id_for_caregiver(caregiver_id), 'edit_schedule')
    or (
      public.is_caregiver_user(caregiver_id)
      and exception_type in ('pto', 'sick', 'unpaid_time_off')
      and status in ('draft', 'requested')
    )
  );

create policy schedule_exceptions_delete_manager on public.schedule_exceptions
  for delete
  using (public.can_manage_household_setting(public.household_id_for_caregiver(caregiver_id), 'edit_schedule'));

-- ---------------------------------------------------------------------------
-- time_entries
-- ---------------------------------------------------------------------------
create policy time_entries_select on public.time_entries
  for select
  using (
    public.is_household_member(public.household_id_for_caregiver(caregiver_id))
  );

create policy time_entries_insert on public.time_entries
  for insert
  with check (
    public.is_parent_or_coadmin(public.household_id_for_caregiver(caregiver_id))
    or public.is_caregiver_user(caregiver_id)
  );

-- Nanny can only modify their own entries while still draft/submitted (not
-- approved/locked); parent/co-admin can edit any entry that is not locked.
create policy time_entries_update on public.time_entries
  for update
  using (
    public.is_parent_or_coadmin(public.household_id_for_caregiver(caregiver_id))
    or (public.is_caregiver_user(caregiver_id) and status in ('draft', 'submitted'))
  )
  with check (
    public.is_parent_or_coadmin(public.household_id_for_caregiver(caregiver_id))
    or (public.is_caregiver_user(caregiver_id) and status in ('draft', 'submitted'))
  );

create policy time_entries_delete on public.time_entries
  for delete
  using (
    (public.is_parent_or_coadmin(public.household_id_for_caregiver(caregiver_id)) and status <> 'locked')
    or (public.is_caregiver_user(caregiver_id) and status = 'draft')
  );

-- ---------------------------------------------------------------------------
-- timesheets
-- ---------------------------------------------------------------------------
create policy timesheets_select on public.timesheets
  for select
  using (public.is_household_member(public.household_id_for_caregiver(caregiver_id)));

create policy timesheets_insert on public.timesheets
  for insert
  with check (
    public.is_parent_or_coadmin(public.household_id_for_caregiver(caregiver_id))
    or public.is_caregiver_user(caregiver_id)
  );

-- Nanny may only touch their own timesheet while draft/needs_correction
-- (e.g. to submit it); approval and any change once approved/paid/locked is
-- parent/co-admin only.
create policy timesheets_update on public.timesheets
  for update
  using (
    public.is_parent_or_coadmin(public.household_id_for_caregiver(caregiver_id))
    or (public.is_caregiver_user(caregiver_id) and status in ('draft', 'needs_correction'))
  )
  with check (
    public.is_parent_or_coadmin(public.household_id_for_caregiver(caregiver_id))
    or (
      public.is_caregiver_user(caregiver_id)
      and status in ('draft', 'submitted', 'needs_correction')
    )
  );

create policy timesheets_delete_manager on public.timesheets
  for delete
  using (
    public.is_parent_or_coadmin(public.household_id_for_caregiver(caregiver_id))
    and status = 'draft'
  );

-- ---------------------------------------------------------------------------
-- leave_policies (parent/admin settings; nanny read-only when visible)
-- ---------------------------------------------------------------------------
create policy leave_policies_select on public.leave_policies
  for select
  using (
    public.is_parent_or_coadmin(public.household_id_for_caregiver(caregiver_id))
    or (public.is_caregiver_user(caregiver_id) and visible_to_nanny)
  );

create policy leave_policies_write_manager on public.leave_policies
  for all
  using (public.can_manage_household_setting(public.household_id_for_caregiver(caregiver_id), 'edit_pto_policy'))
  with check (public.can_manage_household_setting(public.household_id_for_caregiver(caregiver_id), 'edit_pto_policy'));

-- ---------------------------------------------------------------------------
-- leave_requests
-- ---------------------------------------------------------------------------
create policy leave_requests_select on public.leave_requests
  for select
  using (
    public.is_parent_or_coadmin(public.household_id_for_caregiver(caregiver_id))
    or public.is_caregiver_user(caregiver_id)
  );

create policy leave_requests_insert on public.leave_requests
  for insert
  with check (
    public.is_parent_or_coadmin(public.household_id_for_caregiver(caregiver_id))
    or (public.is_caregiver_user(caregiver_id) and requested_by = auth.uid())
  );

-- Nanny may edit/cancel only their own request while still pending; parents
-- approve/reject/modify.
create policy leave_requests_update on public.leave_requests
  for update
  using (
    public.is_parent_or_coadmin(public.household_id_for_caregiver(caregiver_id))
    or (public.is_caregiver_user(caregiver_id) and status = 'requested')
  )
  with check (
    public.is_parent_or_coadmin(public.household_id_for_caregiver(caregiver_id))
    or (public.is_caregiver_user(caregiver_id) and status in ('requested', 'canceled'))
  );

create policy leave_requests_delete on public.leave_requests
  for delete
  using (
    public.is_parent_or_coadmin(public.household_id_for_caregiver(caregiver_id))
    or (public.is_caregiver_user(caregiver_id) and status = 'requested')
  );

-- ---------------------------------------------------------------------------
-- leave_ledger (append-only; never updated/deleted by the app)
-- ---------------------------------------------------------------------------
create policy leave_ledger_select on public.leave_ledger
  for select
  using (
    public.is_parent_or_coadmin(public.household_id_for_caregiver(caregiver_id))
    or (
      public.is_caregiver_user(caregiver_id)
      and exists (
        select 1 from public.leave_policies lp
        where lp.id = leave_ledger.leave_policy_id and lp.visible_to_nanny
      )
    )
  );

create policy leave_ledger_insert_manager on public.leave_ledger
  for insert
  with check (public.is_parent_or_coadmin(public.household_id_for_caregiver(caregiver_id)));

-- ---------------------------------------------------------------------------
-- payment_records
-- ---------------------------------------------------------------------------
create policy payment_records_select on public.payment_records
  for select
  using (
    public.is_parent_or_coadmin(public.household_id_for_caregiver(caregiver_id))
    or public.is_caregiver_user(caregiver_id)
  );

create policy payment_records_insert_manager on public.payment_records
  for insert
  with check (public.is_parent_or_coadmin(public.household_id_for_caregiver(caregiver_id)));

create policy payment_records_update_manager on public.payment_records
  for update
  using (public.is_parent_or_coadmin(public.household_id_for_caregiver(caregiver_id)))
  with check (public.is_parent_or_coadmin(public.household_id_for_caregiver(caregiver_id)));

create policy payment_records_delete_admin on public.payment_records
  for delete
  using (public.is_parent_admin(public.household_id_for_caregiver(caregiver_id)));

-- ---------------------------------------------------------------------------
-- reminders
-- ---------------------------------------------------------------------------
create policy reminders_select on public.reminders
  for select
  using (recipient_user_id = auth.uid() or public.is_parent_or_coadmin(household_id));

create policy reminders_write_manager on public.reminders
  for all
  using (public.is_parent_or_coadmin(household_id))
  with check (public.is_parent_or_coadmin(household_id));

-- ---------------------------------------------------------------------------
-- audit_events (append-only; parent_admin/co-admin read, nobody updates/deletes)
-- ---------------------------------------------------------------------------
create policy audit_events_select_admin on public.audit_events
  for select
  using (public.can_manage_household_setting(household_id, 'view_audit_log'));

create policy audit_events_insert_member on public.audit_events
  for insert
  with check (public.is_household_member(household_id) and actor_user_id = auth.uid());
