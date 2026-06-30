-- Lets a household anchor a caregiver's pay period to either the start day
-- (existing behavior) or the end day / payday -- e.g. a nanny who works
-- Mon-Thu and is paid at the end of her last shift wants the period and
-- reminder anchored to Thursday, not the week's start.
alter table public.caregiver_profiles
  add column if not exists pay_period_anchor text not null default 'start_day'
    check (pay_period_anchor in ('start_day', 'end_day'));

alter table public.caregiver_profiles
  add column if not exists pay_period_end_day int check (pay_period_end_day between 0 and 6);

-- Multiple configurable lead-time reminders before a payment's due date
-- (0 = due date itself, 1 = one day before, etc.), so a parent can be
-- reminded with enough notice to pull cash or set up a transfer.
alter table public.caregiver_profiles
  add column if not exists payment_reminder_days_before int[] not null default '{0,1}';
