// Hand-maintained domain types matching supabase/migrations/0001_schema.sql.
// Keep in sync with the SQL schema when either changes.

export type HouseholdRole = 'parent_admin' | 'parent_co_admin' | 'nanny'

export interface AppUser {
  id: string
  email: string
  full_name: string | null
  phone: string | null
  created_at: string
  updated_at: string
  last_login_at: string | null
}

export interface Household {
  id: string
  name: string
  timezone: string
  week_start_day: 'sunday' | 'monday'
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface HouseholdUser {
  id: string
  household_id: string
  user_id: string
  role: HouseholdRole
  permissions: Record<string, boolean>
  status: 'invited' | 'active' | 'removed'
  invited_at: string | null
  accepted_at: string | null
  created_at: string
  updated_at: string
}

export type GuaranteedHoursBasis = 'linked_to_schedule' | 'fixed_weekly' | 'fixed_pay_period'

export type PayFrequency = 'weekly' | 'biweekly' | 'semi_monthly' | 'monthly'
export type PaydayRule = 'same_day_each_week' | 'days_after_period_end' | 'manual'
export type PayPeriodAnchor = 'start_day' | 'end_day'
export type PaymentMethodLabel =
  | 'zelle'
  | 'venmo'
  | 'check'
  | 'bank_transfer'
  | 'payroll_provider'
  | 'cash'
  | 'other'

export interface CaregiverProfile {
  id: string
  household_id: string
  user_id: string | null
  name: string
  email: string | null
  phone: string | null
  start_date: string | null
  employment_status: 'active' | 'inactive' | 'terminated'
  default_hourly_rate: number | null
  overtime_threshold_hours: number
  overtime_multiplier: number
  payment_method_label: PaymentMethodLabel | null
  nanny_can_view_pay_rate: boolean
  nanny_can_view_gross_pay: boolean
  nanny_can_view_pto_balance: boolean
  nanny_can_view_guaranteed_hours: boolean
  guaranteed_hours_enabled: boolean
  guaranteed_hours_basis: GuaranteedHoursBasis
  fixed_weekly_guaranteed_hours: number | null
  fixed_pay_period_guaranteed_hours: number | null
  unpaid_time_off_reduces_guarantee: boolean
  family_cancellation_counts_toward_guarantee: boolean
  pto_counts_toward_guarantee: boolean
  sick_counts_toward_guarantee: boolean
  holiday_counts_toward_guarantee: boolean
  pay_frequency: PayFrequency
  pay_period_start_day: number
  pay_period_anchor: PayPeriodAnchor
  pay_period_end_day: number | null
  payday_rule: PaydayRule
  payday_day_of_week: number | null
  payday_days_after_period_end: number | null
  payment_reminder_days_before: number[]
  created_at: string
  updated_at: string
}

export interface CaregiverPrivateNote {
  caregiver_id: string
  notes: string | null
  updated_by: string | null
  updated_at: string
}

export type RecurrenceType =
  | 'weekly'
  | 'biweekly'
  | 'monthly_by_date'
  | 'monthly_by_weekday'
  | 'custom'

export interface ScheduleTemplate {
  id: string
  caregiver_id: string
  name: string
  recurrence_type: RecurrenceType
  recurrence_rule: Record<string, unknown>
  effective_start_date: string
  effective_end_date: string | null
  active: boolean
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type ShiftCategory = 'regular' | 'holiday' | 'special' | 'occasional'

export interface ScheduleShift {
  id: string
  schedule_template_id: string
  day_of_week: number | null
  monthly_day: number | null
  monthly_week: 'first' | 'second' | 'third' | 'fourth' | 'last' | null
  start_time: string
  end_time: string
  break_minutes: number
  paid_break: boolean
  counts_toward_guaranteed_hours: boolean
  paid_if_family_canceled: boolean
  default_category: ShiftCategory
  notes: string | null
  created_at: string
  updated_at: string
}

export type ExceptionType =
  | 'added_shift'
  | 'removed_shift'
  | 'shortened_shift'
  | 'extended_shift'
  | 'family_cancellation'
  | 'pto'
  | 'sick'
  | 'unpaid_time_off'
  | 'holiday'
  | 'weather_emergency'
  | 'other'

export type ExceptionStatus = 'draft' | 'requested' | 'approved' | 'rejected' | 'canceled'

export interface ScheduleException {
  id: string
  caregiver_id: string
  date: string
  exception_type: ExceptionType
  original_schedule_shift_id: string | null
  start_time: string | null
  end_time: string | null
  paid_hours: number | null
  affects_pay: boolean
  affects_pto: boolean
  counts_toward_guaranteed_hours: boolean
  status: ExceptionStatus
  parent_note: string | null
  nanny_visible_note: string | null
  created_by: string | null
  approved_by: string | null
  created_at: string
  updated_at: string
}

export type TimeEntryMethod = 'clock' | 'manual' | 'parent_adjustment' | 'correction'
export type TimeEntryStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'corrected' | 'locked'

export interface TimeEntry {
  id: string
  caregiver_id: string
  date: string
  schedule_shift_id: string | null
  schedule_exception_id: string | null
  clock_in_at: string | null
  clock_out_at: string | null
  manual_start_time: string | null
  manual_end_time: string | null
  break_minutes: number
  paid_hours: number | null
  method: TimeEntryMethod
  status: TimeEntryStatus
  nanny_note: string | null
  parent_note: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type TimesheetStatus =
  | 'draft'
  | 'submitted'
  | 'needs_correction'
  | 'approved'
  | 'payment_due'
  | 'paid'
  | 'locked'

export interface Timesheet {
  id: string
  caregiver_id: string
  period_start: string
  period_end: string
  status: TimesheetStatus
  submitted_at: string | null
  submitted_by: string | null
  approved_at: string | null
  approved_by: string | null
  correction_note: string | null
  scheduled_hours: number
  guaranteed_hours: number
  actual_worked_hours: number
  regular_worked_hours: number
  overtime_worked_hours: number
  paid_pto_hours: number
  paid_sick_hours: number
  paid_holiday_hours: number
  family_cancellation_hours: number
  unpaid_time_off_hours: number
  guarantee_adjustment_hours: number
  payable_regular_hours: number
  payable_overtime_hours: number
  hourly_rate: number | null
  overtime_rate: number | null
  gross_pay_due: number
  reimbursements: number
  manual_adjustments: number
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export type LeaveType = 'pto' | 'sick' | 'holiday' | 'unpaid' | 'other_paid'
export type AccrualMethod =
  | 'front_loaded_annual'
  | 'per_hour_worked'
  | 'per_pay_period'
  | 'monthly'
  | 'manual_only'
  | 'none'

export interface LeavePolicy {
  id: string
  caregiver_id: string
  leave_type: LeaveType
  enabled: boolean
  paid: boolean
  accrual_method: AccrualMethod
  annual_allowance_hours: number | null
  accrual_rate_hours_per_hour_worked: number | null
  accrual_rate_hours_per_period: number | null
  monthly_accrual_hours: number | null
  balance_cap_hours: number | null
  carryover_cap_hours: number | null
  negative_balance_allowed: boolean
  waiting_period_days: number | null
  reset_month: number | null
  reset_day: number | null
  visible_to_nanny: boolean
  counts_toward_guarantee: boolean
  counts_toward_payable_hours: boolean
  counts_toward_overtime: boolean
  active: boolean
  created_at: string
  updated_at: string
}

export type LeaveRequestStatus = 'requested' | 'approved' | 'rejected' | 'canceled' | 'used'

export interface LeaveRequest {
  id: string
  caregiver_id: string
  leave_policy_id: string | null
  leave_type: LeaveType
  start_date: string
  end_date: string
  start_time: string | null
  end_time: string | null
  hours_requested: number | null
  status: LeaveRequestStatus
  nanny_note: string | null
  parent_note: string | null
  requested_by: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

export type LeaveLedgerEventType =
  | 'opening_balance'
  | 'accrual'
  | 'used'
  | 'manual_adjustment'
  | 'carryover'
  | 'expiration'
  | 'correction'
  | 'reversal'

export interface LeaveLedgerEntry {
  id: string
  caregiver_id: string
  leave_policy_id: string
  event_date: string
  event_type: LeaveLedgerEventType
  hours_delta: number
  balance_after: number
  related_timesheet_id: string | null
  related_leave_request_id: string | null
  related_schedule_exception_id: string | null
  created_by: string | null
  notes: string | null
  created_at: string
}

export type PaymentStatus =
  | 'upcoming'
  | 'due'
  | 'overdue'
  | 'partially_paid'
  | 'paid'
  | 'corrected'
  | 'voided'

export interface PaymentRecord {
  id: string
  caregiver_id: string
  timesheet_id: string
  period_start: string
  period_end: string
  due_date: string
  status: PaymentStatus
  actual_worked_hours: number
  regular_worked_hours: number
  overtime_worked_hours: number
  guaranteed_hours: number
  guarantee_adjustment_hours: number
  payable_regular_hours: number
  payable_overtime_hours: number
  paid_pto_hours: number
  paid_sick_hours: number
  paid_holiday_hours: number
  family_cancellation_hours: number
  hourly_rate: number | null
  overtime_rate: number | null
  gross_pay_due: number
  reimbursements: number
  manual_adjustments: number
  amount_paid: number | null
  payment_method_label: PaymentMethodLabel | null
  paid_at: string | null
  marked_paid_by: string | null
  parent_note: string | null
  nanny_visible_note: string | null
  guarantee_override_note: string | null
  attachment_url: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface AuditEvent {
  id: string
  household_id: string
  actor_user_id: string | null
  entity_type: string
  entity_id: string
  action: string
  before_json: Record<string, unknown> | null
  after_json: Record<string, unknown> | null
  created_at: string
}
