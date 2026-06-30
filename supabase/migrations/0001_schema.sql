-- Nanny Ledger: core schema
-- All tables per product spec section 15. RLS is enabled here but policies
-- live in 0002_rls.sql so schema and authorization stay easy to review separately.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 15.1 users
-- Mirrors auth.users 1:1. Row is created by a trigger on auth.users insert.
-- ---------------------------------------------------------------------------
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text unique not null,
  full_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);

-- ---------------------------------------------------------------------------
-- 15.2 households
-- ---------------------------------------------------------------------------
create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timezone text not null default 'America/New_York',
  week_start_day text not null default 'monday'
    check (week_start_day in ('sunday', 'monday')),
  created_by uuid references public.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 15.3 household_users
-- ---------------------------------------------------------------------------
create table public.household_users (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  role text not null check (role in ('parent_admin', 'parent_co_admin', 'nanny')),
  permissions jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('invited', 'active', 'removed')),
  invited_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, user_id)
);

-- ---------------------------------------------------------------------------
-- 15.4 caregiver_profiles
-- ---------------------------------------------------------------------------
create table public.caregiver_profiles (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid references public.users (id),
  name text not null,
  email text,
  phone text,
  start_date date,
  employment_status text not null default 'active'
    check (employment_status in ('active', 'inactive', 'terminated')),
  default_hourly_rate numeric(10, 2),
  overtime_threshold_hours numeric(6, 2) not null default 40,
  overtime_multiplier numeric(4, 2) not null default 1.5,
  payment_method_label text
    check (payment_method_label in (
      'zelle', 'venmo', 'check', 'bank_transfer', 'payroll_provider', 'cash', 'other'
    )),
  nanny_can_view_pay_rate boolean not null default false,
  nanny_can_view_gross_pay boolean not null default true,
  nanny_can_view_pto_balance boolean not null default true,
  nanny_can_view_guaranteed_hours boolean not null default true,
  -- guaranteed hours settings
  guaranteed_hours_enabled boolean not null default true,
  guaranteed_hours_basis text not null default 'linked_to_schedule'
    check (guaranteed_hours_basis in (
      'linked_to_schedule', 'fixed_weekly', 'fixed_pay_period', 'manual_by_pay_period'
    )),
  fixed_weekly_guaranteed_hours numeric(6, 2),
  fixed_pay_period_guaranteed_hours numeric(6, 2),
  unpaid_time_off_reduces_guarantee boolean not null default true,
  family_cancellation_counts_toward_guarantee boolean not null default true,
  pto_counts_toward_guarantee boolean not null default true,
  sick_counts_toward_guarantee boolean not null default true,
  holiday_counts_toward_guarantee boolean not null default true,
  -- pay settings (13.8)
  pay_frequency text not null default 'weekly'
    check (pay_frequency in ('weekly', 'biweekly', 'semi_monthly', 'monthly')),
  pay_period_start_day int not null default 1 check (pay_period_start_day between 0 and 6),
  payday_rule text not null default 'days_after_period_end'
    check (payday_rule in ('same_day_each_week', 'days_after_period_end', 'manual')),
  payday_day_of_week int check (payday_day_of_week between 0 and 6),
  payday_days_after_period_end int default 5,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Parent-only private notes about the caregiver. Kept in a separate table
-- (rather than a column on caregiver_profiles) so RLS can fully exclude the
-- nanny role -- Postgres RLS cannot restrict individual columns within a row.
create table public.caregiver_private_notes (
  caregiver_id uuid primary key references public.caregiver_profiles (id) on delete cascade,
  notes text,
  updated_by uuid references public.users (id),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 15.5 schedule_templates
-- ---------------------------------------------------------------------------
create table public.schedule_templates (
  id uuid primary key default gen_random_uuid(),
  caregiver_id uuid not null references public.caregiver_profiles (id) on delete cascade,
  name text not null,
  recurrence_type text not null
    check (recurrence_type in (
      'weekly', 'biweekly', 'monthly_by_date', 'monthly_by_weekday', 'custom'
    )),
  recurrence_rule jsonb not null default '{}'::jsonb,
  effective_start_date date not null,
  effective_end_date date,
  active boolean not null default true,
  notes text,
  created_by uuid references public.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 15.6 schedule_shifts
-- ---------------------------------------------------------------------------
create table public.schedule_shifts (
  id uuid primary key default gen_random_uuid(),
  schedule_template_id uuid not null references public.schedule_templates (id) on delete cascade,
  day_of_week int check (day_of_week between 0 and 6),
  monthly_day int check (monthly_day between 1 and 31),
  monthly_week text check (monthly_week in ('first', 'second', 'third', 'fourth', 'last')),
  start_time time not null,
  end_time time not null,
  break_minutes int not null default 0,
  paid_break boolean not null default false,
  counts_toward_guaranteed_hours boolean not null default true,
  paid_if_family_canceled boolean not null default true,
  default_category text not null default 'regular'
    check (default_category in ('regular', 'holiday', 'special', 'occasional')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 15.7 schedule_exceptions
-- ---------------------------------------------------------------------------
create table public.schedule_exceptions (
  id uuid primary key default gen_random_uuid(),
  caregiver_id uuid not null references public.caregiver_profiles (id) on delete cascade,
  date date not null,
  exception_type text not null
    check (exception_type in (
      'added_shift', 'removed_shift', 'shortened_shift', 'extended_shift',
      'family_cancellation', 'pto', 'sick', 'unpaid_time_off', 'holiday',
      'weather_emergency', 'other'
    )),
  original_schedule_shift_id uuid references public.schedule_shifts (id),
  start_time time,
  end_time time,
  paid_hours numeric(6, 2),
  affects_pay boolean not null default true,
  affects_pto boolean not null default false,
  counts_toward_guaranteed_hours boolean not null default false,
  status text not null default 'approved'
    check (status in ('draft', 'requested', 'approved', 'rejected', 'canceled')),
  parent_note text,
  nanny_visible_note text,
  created_by uuid references public.users (id),
  approved_by uuid references public.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 15.8 time_entries
-- ---------------------------------------------------------------------------
create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  caregiver_id uuid not null references public.caregiver_profiles (id) on delete cascade,
  date date not null,
  schedule_shift_id uuid references public.schedule_shifts (id),
  schedule_exception_id uuid references public.schedule_exceptions (id),
  clock_in_at timestamptz,
  clock_out_at timestamptz,
  manual_start_time time,
  manual_end_time time,
  break_minutes int not null default 0,
  paid_hours numeric(6, 2),
  method text not null check (method in ('clock', 'manual', 'parent_adjustment', 'correction')),
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'approved', 'rejected', 'corrected', 'locked')),
  nanny_note text,
  parent_note text,
  created_by uuid references public.users (id),
  updated_by uuid references public.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 15.9 timesheets
-- ---------------------------------------------------------------------------
create table public.timesheets (
  id uuid primary key default gen_random_uuid(),
  caregiver_id uuid not null references public.caregiver_profiles (id) on delete cascade,
  period_start date not null,
  period_end date not null,
  status text not null default 'draft'
    check (status in (
      'draft', 'submitted', 'needs_correction', 'approved', 'payment_due', 'paid', 'locked'
    )),
  submitted_at timestamptz,
  submitted_by uuid references public.users (id),
  approved_at timestamptz,
  approved_by uuid references public.users (id),
  correction_note text,

  scheduled_hours numeric(6, 2) not null default 0,
  guaranteed_hours numeric(6, 2) not null default 0,
  actual_worked_hours numeric(6, 2) not null default 0,
  regular_worked_hours numeric(6, 2) not null default 0,
  overtime_worked_hours numeric(6, 2) not null default 0,
  paid_pto_hours numeric(6, 2) not null default 0,
  paid_sick_hours numeric(6, 2) not null default 0,
  paid_holiday_hours numeric(6, 2) not null default 0,
  family_cancellation_hours numeric(6, 2) not null default 0,
  unpaid_time_off_hours numeric(6, 2) not null default 0,
  guarantee_adjustment_hours numeric(6, 2) not null default 0,
  payable_regular_hours numeric(6, 2) not null default 0,
  payable_overtime_hours numeric(6, 2) not null default 0,

  hourly_rate numeric(10, 2),
  overtime_rate numeric(10, 2),
  gross_pay_due numeric(10, 2) not null default 0,
  reimbursements numeric(10, 2) not null default 0,
  manual_adjustments numeric(10, 2) not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (caregiver_id, period_start, period_end)
);

-- ---------------------------------------------------------------------------
-- 15.10 leave_policies
-- ---------------------------------------------------------------------------
create table public.leave_policies (
  id uuid primary key default gen_random_uuid(),
  caregiver_id uuid not null references public.caregiver_profiles (id) on delete cascade,
  leave_type text not null check (leave_type in ('pto', 'sick', 'holiday', 'unpaid', 'other_paid')),
  enabled boolean not null default true,
  paid boolean not null default true,
  accrual_method text not null
    check (accrual_method in (
      'front_loaded_annual', 'per_hour_worked', 'per_pay_period', 'monthly', 'manual_only', 'none'
    )),
  annual_allowance_hours numeric(6, 2),
  accrual_rate_hours_per_hour_worked numeric(8, 4),
  accrual_rate_hours_per_period numeric(6, 2),
  monthly_accrual_hours numeric(6, 2),
  balance_cap_hours numeric(6, 2),
  carryover_cap_hours numeric(6, 2),
  negative_balance_allowed boolean not null default false,
  waiting_period_days int,
  reset_month int check (reset_month between 1 and 12),
  reset_day int check (reset_day between 1 and 31),
  visible_to_nanny boolean not null default true,
  counts_toward_guarantee boolean not null default true,
  counts_toward_payable_hours boolean not null default true,
  counts_toward_overtime boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (caregiver_id, leave_type)
);

-- ---------------------------------------------------------------------------
-- 15.11 leave_requests
-- ---------------------------------------------------------------------------
create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  caregiver_id uuid not null references public.caregiver_profiles (id) on delete cascade,
  leave_policy_id uuid references public.leave_policies (id),
  leave_type text not null check (leave_type in ('pto', 'sick', 'holiday', 'unpaid', 'other_paid')),
  start_date date not null,
  end_date date not null,
  start_time time,
  end_time time,
  hours_requested numeric(6, 2),
  status text not null default 'requested'
    check (status in ('requested', 'approved', 'rejected', 'canceled', 'used')),
  nanny_note text,
  parent_note text,
  requested_by uuid references public.users (id),
  reviewed_by uuid references public.users (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 15.12 leave_ledger
-- ---------------------------------------------------------------------------
create table public.leave_ledger (
  id uuid primary key default gen_random_uuid(),
  caregiver_id uuid not null references public.caregiver_profiles (id) on delete cascade,
  leave_policy_id uuid not null references public.leave_policies (id),
  event_date date not null,
  event_type text not null
    check (event_type in (
      'opening_balance', 'accrual', 'used', 'manual_adjustment', 'carryover',
      'expiration', 'correction', 'reversal'
    )),
  hours_delta numeric(6, 2) not null,
  balance_after numeric(6, 2) not null,
  related_timesheet_id uuid references public.timesheets (id),
  related_leave_request_id uuid references public.leave_requests (id),
  related_schedule_exception_id uuid references public.schedule_exceptions (id),
  created_by uuid references public.users (id),
  notes text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 15.13 payment_records
-- ---------------------------------------------------------------------------
create table public.payment_records (
  id uuid primary key default gen_random_uuid(),
  caregiver_id uuid not null references public.caregiver_profiles (id) on delete cascade,
  timesheet_id uuid not null references public.timesheets (id),
  period_start date not null,
  period_end date not null,
  due_date date not null,
  status text not null default 'upcoming'
    check (status in (
      'upcoming', 'due', 'overdue', 'partially_paid', 'paid', 'corrected', 'voided'
    )),

  actual_worked_hours numeric(6, 2) not null default 0,
  regular_worked_hours numeric(6, 2) not null default 0,
  overtime_worked_hours numeric(6, 2) not null default 0,
  guaranteed_hours numeric(6, 2) not null default 0,
  guarantee_adjustment_hours numeric(6, 2) not null default 0,
  payable_regular_hours numeric(6, 2) not null default 0,
  payable_overtime_hours numeric(6, 2) not null default 0,
  paid_pto_hours numeric(6, 2) not null default 0,
  paid_sick_hours numeric(6, 2) not null default 0,
  paid_holiday_hours numeric(6, 2) not null default 0,
  family_cancellation_hours numeric(6, 2) not null default 0,

  hourly_rate numeric(10, 2),
  overtime_rate numeric(10, 2),
  gross_pay_due numeric(10, 2) not null default 0,
  reimbursements numeric(10, 2) not null default 0,
  manual_adjustments numeric(10, 2) not null default 0,
  amount_paid numeric(10, 2),
  payment_method_label text,
  paid_at timestamptz,
  marked_paid_by uuid references public.users (id),
  parent_note text,
  nanny_visible_note text,
  guarantee_override_note text,
  attachment_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 15.14 reminders
-- ---------------------------------------------------------------------------
create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  caregiver_id uuid references public.caregiver_profiles (id),
  type text not null
    check (type in (
      'missing_clock_out', 'unsubmitted_timesheet', 'pending_timesheet_approval',
      'pending_pto_request', 'payment_due', 'payment_overdue', 'upcoming_pto',
      'schedule_change', 'pto_balance_low', 'weekly_summary'
    )),
  recipient_user_id uuid not null references public.users (id),
  enabled boolean not null default true,
  channel text not null default 'in_app' check (channel in ('in_app', 'email')),
  trigger_rule jsonb not null default '{}'::jsonb,
  last_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 15.15 audit_events
-- ---------------------------------------------------------------------------
create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  actor_user_id uuid references public.users (id),
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  before_json jsonb,
  after_json jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index idx_household_users_household on public.household_users (household_id);
create index idx_household_users_user on public.household_users (user_id);
create index idx_caregiver_profiles_household on public.caregiver_profiles (household_id);
create index idx_caregiver_profiles_user on public.caregiver_profiles (user_id);
create index idx_schedule_templates_caregiver on public.schedule_templates (caregiver_id);
create index idx_schedule_shifts_template on public.schedule_shifts (schedule_template_id);
create index idx_schedule_exceptions_caregiver_date on public.schedule_exceptions (caregiver_id, date);
create index idx_time_entries_caregiver_date on public.time_entries (caregiver_id, date);
create index idx_timesheets_caregiver_period on public.timesheets (caregiver_id, period_start, period_end);
create index idx_leave_policies_caregiver on public.leave_policies (caregiver_id);
create index idx_leave_requests_caregiver on public.leave_requests (caregiver_id);
create index idx_leave_ledger_caregiver on public.leave_ledger (caregiver_id, leave_policy_id);
create index idx_payment_records_caregiver on public.payment_records (caregiver_id);
create index idx_reminders_household on public.reminders (household_id);
create index idx_audit_events_household on public.audit_events (household_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at trigger helper
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'users', 'households', 'household_users', 'caregiver_profiles',
      'schedule_templates', 'schedule_shifts', 'schedule_exceptions',
      'time_entries', 'timesheets', 'leave_policies', 'leave_requests',
      'payment_records', 'reminders', 'caregiver_private_notes'
    ])
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at();',
      t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- New auth.users -> public.users profile sync
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- Enable RLS on every table (policies defined in 0002_rls.sql)
-- ---------------------------------------------------------------------------
alter table public.users enable row level security;
alter table public.households enable row level security;
alter table public.household_users enable row level security;
alter table public.caregiver_profiles enable row level security;
alter table public.caregiver_private_notes enable row level security;
alter table public.schedule_templates enable row level security;
alter table public.schedule_shifts enable row level security;
alter table public.schedule_exceptions enable row level security;
alter table public.time_entries enable row level security;
alter table public.timesheets enable row level security;
alter table public.leave_policies enable row level security;
alter table public.leave_requests enable row level security;
alter table public.leave_ledger enable row level security;
alter table public.payment_records enable row level security;
alter table public.reminders enable row level security;
alter table public.audit_events enable row level security;
