-- Spec review 2026-07-01: manual_by_pay_period was never buildable as specified
-- (16.3 called for "a manually entered value for that pay period" but no field
-- ever existed to store a per-period override -- only the caregiver-level
-- fixed_weekly/fixed_pay_period settings). Decision: drop it as redundant.
-- See QUESTIONS_AND_CLARIFICATIONS.md and SPEC_CHANGE_LOG.md.

update caregiver_profiles
  set guaranteed_hours_basis = 'fixed_pay_period'
  where guaranteed_hours_basis = 'manual_by_pay_period';

alter table caregiver_profiles drop constraint if exists caregiver_profiles_guaranteed_hours_basis_check;

alter table caregiver_profiles
  add constraint caregiver_profiles_guaranteed_hours_basis_check
  check (guaranteed_hours_basis in ('linked_to_schedule', 'fixed_weekly', 'fixed_pay_period'));
