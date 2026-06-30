-- Migration 0006 added pay_period_anchor, pay_period_end_day, and
-- payment_reminder_days_before to caregiver_profiles but the co-admin
-- restriction trigger (created in 0002) was not updated to guard those
-- columns. A co-admin without edit_pay_rate permission could silently
-- overwrite them. This migration re-creates the trigger function with the
-- missing columns included.
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
      or new.pay_period_anchor is distinct from old.pay_period_anchor
      or new.pay_period_end_day is distinct from old.pay_period_end_day
      or new.payday_rule is distinct from old.payday_rule
      or new.payday_day_of_week is distinct from old.payday_day_of_week
      or new.payday_days_after_period_end is distinct from old.payday_days_after_period_end
      or new.payment_reminder_days_before is distinct from old.payment_reminder_days_before
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
