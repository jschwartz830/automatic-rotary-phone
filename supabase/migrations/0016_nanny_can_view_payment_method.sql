-- Spec 13.8 "Pay Settings" lists "Whether nanny can view payment method
-- label" alongside "Whether nanny can view gross pay details" (already
-- caregiver_profiles.nanny_can_view_gross_pay). No corresponding column ever
-- existed for the payment-method-label counterpart, and payment_method_label
-- itself (already a column since 0001_schema.sql) had no settings UI either
-- -- both closed together in this session's app-side change.
--
-- Defaults true, matching nanny_can_view_gross_pay/nanny_can_view_pto_balance/
-- nanny_can_view_guaranteed_hours (only nanny_can_view_pay_rate defaults
-- false, since the raw dollar rate is the more sensitive figure -- a payment
-- method label like "Zelle" or "Check" is not).
alter table public.caregiver_profiles
  add column nanny_can_view_payment_method boolean not null default true;
