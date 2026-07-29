// Guaranteed hours / overtime / gross pay calculation engine.
// Implements product spec section 16 exactly, including the worked examples
// in section 13.6. Pure functions only -- no I/O -- so they're easy to test
// and safe to re-run for an unlocked pay period without side effects.

export interface TimesheetCalcInput {
  actualWorkedHours: number
  paidPtoHours: number
  paidSickHours: number
  paidHolidayHours: number
  familyCancellationHours: number
  unpaidTimeOffHours: number
  guaranteedHoursBase: number
  unpaidTimeOffReducesGuarantee: boolean
  // Spec 13.6 "Whether PTO/sick/holiday counts toward guaranteed hours" --
  // gates whether each category offsets the guarantee shortfall (i.e. is
  // included in actual_paid_hours per spec 16.4, "whether each leave/family
  // cancellation category counts should depend on policy settings"). This is
  // independent of payability: PTO/sick/holiday hours are always payable
  // (added to payableRegularHours below) whether or not they count toward
  // the guarantee -- the flag only affects how much guarantee-adjustment
  // top-up is needed. Defaults to true to match the caregiver_profiles
  // column defaults and the spec's "Recommended Default" ("PTO/sick can be
  // configured separately", implying on-by-default).
  ptoCountsTowardGuarantee: boolean
  sickCountsTowardGuarantee: boolean
  holidayCountsTowardGuarantee: boolean
  overtimeThresholdHours: number
  overtimeMultiplier: number
  hourlyRate: number
  reimbursements: number
  manualAdjustments: number
}

export interface TimesheetCalcResult {
  guaranteedHours: number
  actualPaidHours: number
  guaranteeAdjustmentHours: number
  regularWorkedHours: number
  overtimeWorkedHours: number
  payableRegularHours: number
  payableOvertimeHours: number
  overtimeRate: number
  grossPayDue: number
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function calculateTimesheet(input: TimesheetCalcInput): TimesheetCalcResult {
  const {
    actualWorkedHours,
    paidPtoHours,
    paidSickHours,
    paidHolidayHours,
    familyCancellationHours,
    unpaidTimeOffHours,
    guaranteedHoursBase,
    unpaidTimeOffReducesGuarantee,
    ptoCountsTowardGuarantee,
    sickCountsTowardGuarantee,
    holidayCountsTowardGuarantee,
    overtimeThresholdHours,
    overtimeMultiplier,
    hourlyRate,
    reimbursements,
    manualAdjustments,
  } = input

  // 16.4 Actual Paid Hours -- per spec, "whether each leave/family
  // cancellation category counts should depend on policy settings"; a
  // category excluded here still gets paid (see payableRegularHours below),
  // it just doesn't offset how much guarantee top-up is owed.
  const actualPaidHours =
    actualWorkedHours +
    (ptoCountsTowardGuarantee ? paidPtoHours : 0) +
    (sickCountsTowardGuarantee ? paidSickHours : 0) +
    (holidayCountsTowardGuarantee ? paidHolidayHours : 0) +
    familyCancellationHours

  // 16.5 Guarantee Adjustment
  const adjustedGuaranteedHours = unpaidTimeOffReducesGuarantee
    ? Math.max(guaranteedHoursBase - unpaidTimeOffHours, 0)
    : guaranteedHoursBase
  const guaranteeAdjustmentHours = Math.max(adjustedGuaranteedHours - actualPaidHours, 0)

  // 16.6 Overtime -- based on actual worked hours only, never suppressed by
  // the guarantee.
  const regularWorkedHours = Math.min(actualWorkedHours, overtimeThresholdHours)
  const overtimeWorkedHours = Math.max(actualWorkedHours - overtimeThresholdHours, 0)

  // 16.7 Payable Hours
  const payableRegularHours =
    regularWorkedHours +
    paidPtoHours +
    paidSickHours +
    paidHolidayHours +
    familyCancellationHours +
    guaranteeAdjustmentHours
  const payableOvertimeHours = overtimeWorkedHours

  // 16.8 Gross Pay Due
  const overtimeRate = hourlyRate * overtimeMultiplier
  const grossPayDue =
    payableRegularHours * hourlyRate +
    payableOvertimeHours * overtimeRate +
    reimbursements +
    manualAdjustments

  return {
    guaranteedHours: round2(guaranteedHoursBase),
    actualPaidHours: round2(actualPaidHours),
    guaranteeAdjustmentHours: round2(guaranteeAdjustmentHours),
    regularWorkedHours: round2(regularWorkedHours),
    overtimeWorkedHours: round2(overtimeWorkedHours),
    payableRegularHours: round2(payableRegularHours),
    payableOvertimeHours: round2(payableOvertimeHours),
    overtimeRate: round2(overtimeRate),
    grossPayDue: round2(grossPayDue),
  }
}

/** 16.1 Paid Hours for a single time entry. No rounding by default. */
export function hoursBetween(start: string, end: string, breakMinutes: number): number {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  let minutes = eh * 60 + em - (sh * 60 + sm)
  if (minutes < 0) minutes += 24 * 60 // shift crosses midnight
  minutes -= breakMinutes
  return round2(Math.max(minutes, 0) / 60)
}
