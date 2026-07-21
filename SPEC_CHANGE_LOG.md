# Spec Change Log

Tracks decisions made while implementing against `APPLICATION_SPEC.md`: where an
implementation detail wasn't fully specified, where two parts of the spec were
in tension, or where a deliberate simplification was made. This is a running
log, newest entries on top. See `QUESTIONS_AND_CLARIFICATIONS.md` for open
items that need your decision rather than ones already resolved.

---

## 2026-07-20 — PTO ledger + annual summary exports (spec 13.11), biweekly recurrence UI (spec 13.2)

**PTO ledger CSV export built (spec 13.11, closes part of a "Known gap").**
`Pto.tsx`'s "Balances" card now has an "Export ledger CSV" action, visible to
Parent Admin/Co-Admin only (spec 13.11: "Nanny should not have export access
in MVP"). Exports every `leave_ledger` row for the selected caregiver — event
date, leave type (joined from `leave_policies`), event type, hours delta,
running balance, and notes — using the same `downloadCsv` helper the existing
timesheet/payment exports use.

**Annual summary CSV export built (spec 13.11, closes the rest of that "Known
gap").** `Pay.tsx` has a new "Annual summary" card (parent/co-admin only) with
a year field and an export button. Produces one summary row for the selected
caregiver and year: total actual/regular/overtime worked hours, PTO/sick/
holiday/family-cancellation hours, guaranteed hours and guarantee adjustment
hours (all summed from `timesheets`), gross pay due, gross amount actually
paid, reimbursements, manual adjustments, and a semicolon-separated list of
payment dates (all summed/collected from `payment_records`), plus PTO and sick
balance as of Dec 31 of the selected year (computed directly from
`leave_ledger`, not the live "today" balance `Pto.tsx` shows). A period is
bucketed into the year its `period_start` falls in, matching how the rest of
the app already treats pay periods as belonging to their start date.
**Known limitation:** for years before the leave ledger existed for a given
caregiver (i.e. before migration 0010's backfill or before the policy was
created), the year-end balance will read as 0/empty rather than reflecting
pre-ledger history — there's no historical ledger to sum. This only affects
caregivers with leave history predating this app's use, not caregivers whose
PTO has always been tracked here.

**Biweekly recurring schedule UI built (spec 13.2, closes the rest of the
"recurring schedule types" known gap).** The `biweekly` recurrence type has
had full data-model and shift-generation support (`matchesRecurrence` in
`src/lib/schedule.ts`) since the schedule-exceptions phase, but no form path
ever created a `biweekly` template — only `weekly`, `monthly_by_date`,
`monthly_by_weekday`, and `custom` got UI in the shift-creation modal redesign
(2026-07-06, PR #41). `Schedule.tsx`'s "Add shift" modal now has an "Every
other week" option alongside "Weekly," reusing the same multi-day-of-week
picker. Because biweekly parity is anchored to the template's
`effective_start_date` (`matchesRecurrence` computes `weeksSinceStart` from
it), a new "First on-week starts" date field controls which week is the "on"
week — weekly/monthly/custom templates don't need this since their recurrence
doesn't depend on an anchor date. This closes out spec 13.2's five recurrence
types (`weekly`, `biweekly`, `monthly_by_date`, `monthly_by_weekday`,
`custom`) as all now buildable from the UI; only "manual one-off schedule" was
already covered by the existing one-off `added_shift` exception path.

### Catching up undocumented interim work (PRs #40–42, 2026-07-06)

Three PRs landed on `main` between the last log entry and this session without
a corresponding change-log write-up. Recorded here for continuity, no new
decisions of note beyond what's in their commit messages:

- **PR #40 — Caregiver profile editing and removal.** `More.tsx` gained a
  "Caregiver profile" section to edit a caregiver's name/contact/start
  date/employment status, and a remove-caregiver action (with a warning about
  cascading history and a nudge toward marking inactive instead).
- **PR #41 — Shift/caregiver UI redesign.** Fixed clipped date/time inputs at
  larger text sizes across Schedule/Time/Pto/Pay/More by stacking field pairs
  vertically instead of a 50/50 row. Added a `Modal` component and moved "Add
  shift" into it with the recurrence picker (weekly multi-day, monthly by
  date/weekday, one-time, custom) described above. Split caregiver settings
  out of `More.tsx` into a new per-caregiver `CaregiverDetail.tsx` page.
- **PR #42 — PTO settings moved into caregiver detail.** Annual PTO/sick
  allowance editing moved from the PTO tab into `CaregiverDetail.tsx`;
  `Pto.tsx` now shows balances/requests only. Added a Time/PTO segmented
  toggle to both tabs since the PTO tab is no longer on the bottom dock.

### Known gaps for next phase (not ambiguous, just not built yet)

- **Per-key enforcement for the remaining permission matrix rows** (spec 11)
  — approve timesheet / mark payment / approve PTO / export records are
  co-admin-allowed by default with no restrict toggle; would need new RLS
  policies + migration + UI, unlike the 7 keys already enforced.
- **Reminder settings** (13.9) — only payment lead-time is configurable; no
  per-type enable/disable, recipients, or quiet hours (recipients/quiet hours
  deferred by decision, item 17 — no delivery channel to target yet).
- **`weekly_summary` reminder / digest** (15.14) — needs its own design (what
  it summarizes, cadence) before it's buildable; scope decided to be in-app
  only (item 17) but content/timing still undefined.
- **Full records export CSV/JSON** (13.11) — the export type list also
  includes a household-wide "full records" dump; timesheets, payments, PTO
  ledger, and annual summary now each export individually, but nothing
  bundles everything into one combined export.

---

## 2026-07-03 (batch 2) — Co-admin permission management UI (spec 10/11)

**Household members / co-admin permissions UI built (spec 10/11, closes a
"Known gap"; resolves Q&A item 16 — user chose this phase).** `More.tsx` has a
new parent-admin-only "Household members" card that lists every member (name,
email, role) and, for each `parent_co_admin`, exposes checkboxes for the
permissions the database actually enforces. Unchecking one writes
`household_users.permissions[key] = false`, which the existing RLS
(`can_manage_household_setting` / `coadmin_permission_allowed`) and the
`caregiver_profiles` restriction trigger already honor server-side — so the UI
is a real control surface, not a cosmetic one.

Only the **seven enforced keys** are shown, matching what has a backend effect:
`edit_pay_rate`, `edit_pto_policy`, `edit_guaranteed_hours_policy`,
`edit_schedule`, `edit_household`, `manage_users`, `view_audit_log`. The spec's
role matrix (11) lists more optionally-restrictable rows (approve timesheet,
mark payment, approve PTO, export records), but those are gated by
`is_parent_or_coadmin` in RLS with no per-key check, so a co-admin can't be
restricted from them today without new policies. Rather than show toggles that
do nothing, they're omitted; adding real per-key enforcement for them is future
work. The card is gated to **parent admin only** (not co-admins) so a co-admin
can't lift their own restrictions, matching spec 10's "Change permissions" as
an admin capability. Members can also be removed (with an inline confirm);
permission changes and removals are audit-logged.

**Co-parent join code — landed independently on `main` via PR #38.** This
branch originally added its own co-parent join code (a separate
`coadmin_join_code` column + generalized `join_household_by_code`), but PR #38
merged the same feature to `main` first, using `parent_join_code`. On rebase,
this branch's duplicate migration and "Co-parent access" card were dropped in
favor of main's implementation to avoid a colliding `0013` migration and a
double card. The members UI below builds on top of main's co-parent card. Net
effect is the same: a household can add a second parent via a distinct code
that grants `parent_co_admin`, and the onboarding join copy is role-agnostic.

**Deferred by decision (Q&A item 17):** `weekly_summary` digest + per-type
reminder settings will be built in-app-only when reached (no recipients / quiet
hours until there's an email/SMS backend). Recorded so the dropped spec fields
are a conscious choice, not an oversight.

### Known gaps for next phase (not ambiguous, just not built yet)

- **Recurring schedule types beyond `weekly`** (13.2) — `biweekly`,
  `monthly_by_date`, `monthly_by_weekday`, `custom` have DB + generation
  support but no form UI to create them.
- **Per-key enforcement for the remaining matrix rows** (11) — approve
  timesheet / mark payment / approve PTO / export records are co-admin-allowed
  by default with no restrict toggle (would need new RLS keys + UI).
- **Reminder settings + `weekly_summary` digest** (13.9 / 15.14) — in-app-only
  scope decided (item 17); not yet built.
- **Additional exports** (13.11) — only timesheets and payments CSV export
  exist; PTO ledger and annual-summary exports don't.

---

## 2026-07-03 — Time-entry validation warnings (spec 13.4)

**Time-entry validation built (spec 13.4 "Validation", closes a "Known gap").**
`Time.tsx`'s manual add form and the inline edit form now show live, advisory
warnings as the user fills them in, powered by a new pure helper
`src/lib/timeValidation.ts` (`validateTimeEntry`). Warnings are non-blocking,
matching the spec's "warn when" wording — the save still goes through. Covered
cases from the spec's list:

- **End time before start / crosses midnight** — the data model has no explicit
  overnight flag, so an end earlier than the start is interpreted as a midnight
  crossing (consistent with `hoursBetween`); the warning surfaces that
  assumption so a typo isn't silently accepted. Also flags a zero-length entry
  when start == end.
- **Break longer than shift** — unpaid break ≥ the raw shift span.
- **Time overlaps another entry** — checks the caregiver's other active entries
  on the same date (using their manual times, falling back to clock
  timestamps), with midnight-crossing normalization on both sides.
- **Actual hours materially differ from scheduled** — compares logged paid
  hours to the summed scheduled-shift hours for that date. "Materially" isn't
  defined by the spec; chosen band is the larger of 1 hour or 25% of the
  scheduled total, so both short and long shifts get a sensible tolerance.
- **Weekly worked hours exceed overtime threshold** — sums the draft plus the
  caregiver's other entries in the same week bucket (household `week_start_day`)
  against `overtime_threshold_hours`.
- **Editing a submitted (nanny) / approved (parent) entry** — advisory notice
  that the entry has already progressed past the freely-editable state.

Not handled here by design: **clock-out missing** stays in the reminders engine
(`missing_clock_out`), since it's a background condition rather than a property
of a form being filled in; and the hard blocks for **editing a paid/locked
period** remain enforced by the existing `canEdit`/`canArchive` gates and RLS,
not downgraded to a warning.

No schema or spec-text change — 13.4 already specifies these warnings; this is
implementation of an existing requirement.

**Scheduled-hours pre-fill confirmed already in place.** The requested
"default time entry to the scheduled hours (still defaulting to the current
day)" was already implemented on 2026-06-30 (`Time.tsx` pre-fills
start/end/break from the selected date's scheduled shift, date defaults to
today). No change needed; noted here for traceability.

### Known gaps for next phase (not ambiguous, just not built yet)

- **Recurring schedule types beyond `weekly`** (13.2) — `biweekly`,
  `monthly_by_date`, `monthly_by_weekday`, `custom` have DB + generation
  support but no form UI to create them.
- **Co-admin permission management UI** (10/11) — RLS already enforces
  restricted permissions server-side; there's no screen to view household
  members or toggle a co-admin's restrictions.
- **Reminder settings** (13.9) — only payment lead-time is configurable;
  no per-type enable/disable, recipients, or quiet hours.
- **`weekly_summary` reminder / digest** (15.14) — needs its own design
  (what it summarizes, cadence) before it's buildable.
- **Additional exports** (13.11) — only timesheets and payments CSV export
  exist; PTO ledger and annual-summary exports don't.

---

## 2026-07-02 (batch 2) — Weather-emergency exceptions now affect pay

**Resolved Q&A item 15 (option A).** `weather_emergency` exceptions with
`affects_pay = true` are now summed into `family_cancellation_hours` in
`Pay.tsx`'s `doGenerate`, alongside `family_cancellation` exceptions — both
represent guarantee-protected non-worked pay, and there was no separate
schema column to route weather-day hours through. Still gated on the
caregiver's `family_cancellation_counts_toward_guarantee` setting, the only
toggle that exists for this bucket. `holiday` exceptions remain calendar-only
(paid holidays go through the existing `leave_requests` holiday leave type,
which has real accrual/balance tracking); `other` exceptions are intentionally
excluded as too broad a catch-all to assume guarantee-protected. The
generate-timesheet form's helper text was updated to mention both hour types.

---

## 2026-07-02 — Schedule Exceptions UI, schedule-linked guarantee wiring, schedule_change reminder

**Schedule Exceptions UI built (spec 13.3).** `Schedule.tsx`'s weekly calendar
grid now supports the previously-unbuilt `schedule_exceptions` table end to
end. Parents/co-admins can, from a day's expanded detail panel, add an
exception of type `added_shift`, `removed_shift`, `shortened_shift`,
`extended_shift`, `family_cancellation`, `holiday`, `weather_emergency`, or
`other` — with an optional link to that day's scheduled shift, a new
start/end time where relevant, an hours override (auto-computed otherwise),
`affects_pay` / `counts_toward_guaranteed_hours` flags, and separate
private/nanny-visible notes. Exceptions are created directly as `approved`
(matching the existing recurring-shift pattern, where parent actions take
effect immediately) and are audit-logged on create/delete. The calendar now
shows an exception pill per day and strikes through a recurring occurrence
that a `removed_shift` exception targets, without deleting the recurring
template shift itself.

**PTO/sick/unpaid_time_off intentionally excluded from this UI.** Spec 13.3
lists `pto`, `sick`, and `unpaid_time_off` as exception types, but spec 13.7's
`leave_requests`/`leave_ledger` flow already fully owns those (balances,
accrual, approval) and is what `Pto.tsx` and the rest of the app read from.
Building a second UI against the same three types on `schedule_exceptions`
would create two disconnected records of the same leave with no balance
impact from the second. Kept leave requests as the single source for those
three types; `schedule_exceptions` here only covers the other eight types,
which have no equivalent elsewhere. RLS already reflected this split (nanny
can only insert `pto`/`sick`/`unpaid_time_off` rows on `schedule_exceptions`,
which this UI doesn't exercise) — no migration needed.

**Family cancellation hours now computed automatically (closes the batch-3
stopgap, Q&A item 12).** `Pay.tsx`'s "Family cancellation hours this period"
manual number input is gone. `doGenerate` now sums hours from approved
`family_cancellation` exceptions (`affects_pay = true`) in the pay period
directly from `schedule_exceptions`, exactly as the exceptions UI intends. The
generate-timesheet form links to the Calendar instead so the parent can add
any cancellations before generating.

**`linked_to_schedule` guaranteed hours now account for one-off exceptions
(spec 13.6 "Schedule-Linked Guarantee").** Previously `computeGuaranteedHoursBase`
only summed recurring template shift hours. It now also applies the net
effect of approved `added_shift`/`removed_shift`/`shortened_shift`/
`extended_shift` exceptions marked `counts_toward_guaranteed_hours = true` —
matching the spec text that one-off changes should *not* move the guarantee
unless explicitly flagged. New helpers `exceptionHours`,
`sumExceptionHoursByType`, and `scheduleExceptionHoursDelta` in
`src/lib/schedule.ts` do this math and are shared by the calendar and pay
calc so both agree on the same numbers.

**`timesheets.scheduled_hours` populated for the first time (spec 16.2).**
This column existed since migration 0001 but `doGenerate` never wrote to it
(always left at the default of 0). It's now `sum(recurring shift hours) +`
net exception delta for the period, using the same helpers above.

**`schedule_change` reminder implemented (spec 15.14, closes a "Known gap").**
`computeReminders` now takes an optional `scheduleExceptions` array and emits
a `schedule_change` card for any approved shift-modifying exception
(`added_shift`/`removed_shift`/`shortened_shift`/`extended_shift`) dated today
or later that was created in the last 3 days — an arbitrary but reasonable
"still fresh" window the spec doesn't define. `family_cancellation`/`holiday`/
`weather_emergency`/`other` don't generate this reminder since they aren't
schedule *changes* in the same sense. `Home.tsx` now loads upcoming approved
exceptions for the dashboard's caregivers and passes them through.

### Known gaps for next phase (not ambiguous, just not built yet)

- **Recurring schedule types beyond `weekly`** (13.2) — `biweekly`,
  `monthly_by_date`, `monthly_by_weekday`, `custom` have DB support but no
  form UI.
- **Co-admin permission management UI** (10/11) — RLS already enforces
  restricted permissions server-side; there's no screen to view household
  members or toggle a co-admin's restrictions.
- **Reminder settings** (13.9) — only payment lead-time is configurable;
  no per-type enable/disable, recipients, or quiet hours.
- **`weekly_summary` reminder / digest** (15.14) — needs its own design
  (what it summarizes, cadence) before it's buildable.
- **Additional exports** (13.11) — only timesheets and payments CSV export
  exist; PTO ledger and annual-summary exports don't.
- **Time entry validation** (13.4) — no warnings for overlapping entries,
  break-longer-than-shift, or actual-vs-scheduled variance.

---

## 2026-07-01 (batch 3) — Mobile PWA fit, multi-caregiver, payment lifecycle, leave enforcement, household settings

**Mobile home-screen fit fixed.** The bottom tab bar (`Layout.tsx`) didn't
account for `env(safe-area-inset-bottom)` when installed as an iOS home-screen
app, and its padding was oversized (py-2.5, text-lg icons). It now reserves
just the safe-area inset plus a tightened layout (py-1.5, smaller icons/text),
and the scrollable content area's bottom padding matches. Every full-screen
view (`Layout`, `App`'s loading screen, `Login`, `SetupRequired`,
`Onboarding`'s three modes) now also pads for `env(safe-area-inset-top)` so
content isn't drawn under the iPhone status bar / Dynamic Island. In
`More.tsx`, the "Overtime threshold (hrs/wk)" field label was wrapping to two
lines next to its neighbor; shortened to "OT after (hrs/wk)" / "OT
multiplier" and tightened the row gap.

**Multi-caregiver UI (Q&A item 10).** `More.tsx` has a new "Caregivers" card
with an "+ Add caregiver" form (name + optional hourly rate) so a household
isn't limited to the single profile created during onboarding.

**Family cancellation hours wired into guaranteed-hours calc (Q&A item 12).**
`family_cancellation_hours` was hardcoded to `0` in both timesheet-generation
paths in `Pay.tsx`, so the "family cancellations count toward guarantee"
setting could never actually apply. The parent's generate-timesheet form now
shows a "Family cancellation hours this period" input (only when that
caregiver setting is on), which flows into `calculateTimesheet` and both the
`timesheets` and `payment_records` inserts.

**`manual_by_pay_period` guaranteed-hours basis removed (Q&A item 13).** It
was never buildable as specified (no per-period override field existed) and
had zero UI. Removed from `GuaranteedHoursBasis`, the spec text (13.6, 16.3,
15.4), and the DB check constraint (migration 0012, which also backfills any
existing rows to `fixed_pay_period`).

**Schedule shift deletions now audit-logged (Q&A item 14).** Additions
already wrote to `audit_events`; deletions in `Schedule.tsx` didn't. Kept the
existing simple add/remove model (no effective-dated template versioning)
but closed this gap.

**Partial payments and voided payments (spec 13.8).** `payment_records` had
`partially_paid` and `voided` statuses in the type/spec with no UI path to
reach them. `Pay.tsx`'s "Mark paid" now opens a form for the amount actually
paid — entering less than `gross_pay_due` sets status to `partially_paid`
(and pre-fills the remaining balance next time); entering the full amount
sets `paid`. A new "Void" action requires a note and sets status to `voided`
without deleting the record, mirroring the existing correction workflow.

**Leave policy enforcement: waiting period and negative balance (spec 13.7).**
`negative_balance_allowed` and `waiting_period_days` were typed columns that
were never read. `Pto.tsx`'s request form now blocks submission (with an
explanatory message) if the leave start date falls inside the caregiver's
waiting period, or if the requested hours would take a `negative_balance_allowed
= false` policy negative.

**Household timezone / week-start-day settings (spec 15.2).** Both were
real columns with no Settings UI to change them from their defaults.
`More.tsx` has a new "Household settings" card (name, timezone from a list of
US zones, week start day) gated to parent/co-admin.

**`pto_balance_low` reminder (spec 15.14).** `computeReminders` now accepts
an optional `leaveBalances` summary and emits a card when a PTO/sick balance
with an annual allowance drops to 8 hours or less (one workday — the spec
names the reminder type but doesn't define "low"; documented here as the
chosen threshold). `Home.tsx` fetches `leave_policies` + `leave_ledger` for
the household's caregivers and computes balances the same way `Pto.tsx` does.

### Known gaps for next phase (not ambiguous, just not built yet)

- **Schedule Exceptions UI (13.3)** — no screen exists to record family
  cancellations/holidays/added-removed-shortened-extended shifts as their own
  records; the family-cancellation quick-entry above is a stopgap, not a
  replacement.
- **Recurring schedule types beyond `weekly`** (13.2) — `biweekly`,
  `monthly_by_date`, `monthly_by_weekday`, `custom` have DB support but no
  form UI.
- **Co-admin permission management UI** (10/11) — RLS already enforces
  restricted permissions server-side; there's no screen to view household
  members or toggle a co-admin's restrictions.
- **Reminder settings** (13.9) — only payment lead-time is configurable;
  no per-type enable/disable, recipients, or quiet hours.
- **`schedule_change` reminder** (15.14) — blocked on Schedule Exceptions
  existing as a source of "what changed."
- **`weekly_summary` reminder / digest** (15.14) — needs its own design
  (what it summarizes, cadence) before it's buildable.
- **Additional exports** (13.11) — only timesheets and payments CSV export
  exist; PTO ledger and annual-summary exports don't.
- **Time entry validation** (13.4) — no warnings for overlapping entries,
  break-longer-than-shift, or actual-vs-scheduled variance.

---

## 2026-07-01 (batch 2) — Weekly calendar grid, nanny join flow, nanny timesheet submission, PTO ledger reads

**Weekly calendar grid replaces flat shift list (spec Phase 2, Q&A item 2).**
`Schedule.tsx` now shows a Mon–Sun week grid with previous/next week navigation
instead of the prior flat recurring-shift list. Each day row shows scheduled shift
times and hours, leave request pills, and a total hours count. Tapping a day
expands an inline detail panel showing shift breakdown and, for parents, a
per-shift "Remove" button. Leave (approved or requested) pulled from
`leave_requests` for the visible week range is displayed per day as colored pills
with the leave type. The existing recurring-schedule management section (add/remove
shifts) is retained below the grid. Uses `generateShiftsForRange` to materialize
template occurrences for the week.

**Household join code flow (spec Phase 1 nanny invite, Q&A item 1).**
`More.tsx` now has a "Nanny access" card (parent/co-admin only). Parents can
generate a random 6-character alphanumeric code, which is stored in
`households.join_code`. The code displays in a large mono font with Regenerate
and Revoke buttons. The `Onboarding.tsx` flow now has a three-mode structure:
choose → create / join. The "join" path calls the `join_household_by_code` SQL
function (migration 0011) which handles RLS via SECURITY DEFINER, inserts the
user as `'nanny'`, and redirects on success. No backend Edge Function required.

**PTO ledger balance reads switched to event-sourced (spec 13.7, Q&A item 1 — complete).**
`Pto.tsx` now reads balance from `leave_ledger` when rows exist for a policy
(`computeLeaveBalanceFromLedger`), falling back to `computeLeaveBalance` from
`leave_requests` when not. The ledger-based function tracks `currentBalance` as
`sum(hours_delta)` and `usedInPeriod` as the sum of negative deltas in the
current policy year. Migration 0010 backfills existing approved requests into
the ledger. New approvals and allowance changes write ledger events immediately,
so the balance reads are always fresh.

**Nanny timesheet submission (spec 13.5, Q&A item 3).**
`Pay.tsx` now shows a "Submit timesheet" button for nanny users. The form asks
for period start/end, then creates a `timesheets` row with `status: 'submitted'`,
`submitted_at`, and actual worked hours summed from approved time entries in the
period. The timesheet then appears in the parent's view so they can generate the
official pay calculation. Gross pay is set to 0 at submission time; the parent
flow calculates the real amounts when they generate and approve.

---

## 2026-07-01 — Phase: guaranteed-hours wiring, schedule-aware reminders, payment corrections, PTO ledger

**`linked_to_schedule` guaranteed hours fully wired (spec 13.6, 16.3, Q&A item 2).**
`More.tsx` previously saved `guaranteed_hours_basis = 'fixed_weekly'` whenever the
guarantee checkbox was on, and `'linked_to_schedule'` when it was off — backwards
from the spec. Now: the checkbox enables/disables the guarantee; a new select
chooses the basis (`linked_to_schedule`, `fixed_weekly`, `fixed_pay_period`). When
`linked_to_schedule` is selected, `Pay.tsx`'s `doGenerate` calls
`generateShiftsForRange` over the pay period and sums shift hours where
`counts_toward_guaranteed_hours = true`, exactly as spec 16.3 requires.
Previously it always used the fixed numeric field regardless of basis.

**Schedule-aware missing-clock-out grace period (spec 21, Q&A item 3).**
`computeReminders` in `reminders.ts` now accepts an optional `scheduleOccurrences`
array. When occurrences exist for the entry's date, the threshold is the latest
scheduled shift end time on that day + 30 minutes, matching spec 21 ("after
scheduled shift end plus grace period"). The 12-hour fallback is kept for days
with no scheduled shift. `Home.tsx` now loads schedule templates and shifts for
the past 2 days and passes the generated occurrences into `computeReminders`.

**Payment correction workflow (spec 13.8, Q&A item 4).**
`Pay.tsx` now has a "Correct" button on paid payment records. Clicking it opens
an inline form requiring a corrected amount and a mandatory note. On submit:
the original record's status is set to `'corrected'`; a new payment record is
created with `status: 'due'`, the corrected amount, and a parent_note explaining
the correction and original amount; the correction is logged to `audit_events`.
The original record is never deleted, per spec 13.8.

**PTO ledger event writes (spec 13.7, Q&A item 1 — partial).**
`Pto.tsx` now writes `leave_ledger` rows for two operations:
(1) When a parent approves a PTO request, a `'used'` event is written with
`hours_delta = -hours_requested` and the running `balance_after`.
(2) When a parent sets or changes an annual allowance, an `'opening_balance'`
(new policy) or `'manual_adjustment'` (change to existing) event is written.
The balance display in `Pto.tsx` still reads from `leave_requests` directly for
now (so existing requests without ledger rows aren't broken); migrating the
balance read to `sum(leave_ledger.hours_delta)` is the next step and will be
cleaner once all accrual paths write ledger rows.

---

## 2026-06-30 — Phase: nanny-facing gaps closed

**Manual time entry now pre-fills from the scheduled shift (spec 13.4, 13.2).**
`src/routes/Time.tsx` previously hardcoded the manual entry form to
09:00–17:00 regardless of date. It now looks up the caregiver's generated
schedule occurrence for the selected date (via `generateShiftsForRange`) and
pre-fills start time, end time, and break minutes from that shift, falling
back to 09:00–17:00 only when nothing is scheduled that day. The date field
still defaults to today, as before. Values remain fully editable — this only
changes the starting point, consistent with spec 13.4's manual-entry fields
list, which doesn't mandate a particular default but implies the common case
is "log the shift as worked."

**Clock in / clock out implemented (spec 13.4, 14.2, role matrix).** This was
schema-ready (`time_entries.clock_in_at`/`clock_out_at`, `missing_clock_out`
status chip, reminder type) but had no UI anywhere — the role matrix lists
clock in/out as the nanny's primary mechanism and `14.2` lists it as a primary
home-screen button, so this was a real gap, not a future phase. Added to
`src/routes/Time.tsx`, visible to nanny only (parents/co-admins use manual
entry per the role matrix). Clock-in inserts a `method: 'clock'` entry with
`status: 'draft'`; clock-out fills `clock_out_at`, computes `paid_hours` from
the elapsed time, accepts an optional note, and moves status to `submitted` —
mirroring how manual entries already move straight to `submitted`.

**Audit log viewer added (spec 13.7/14.7/19/20).** `audit_events` rows were
already being written from every sensitive action, but nothing read them back
— the spec requires Parent Admin (and optionally co-admin) be able to view
the audit log, and `19`/`20` describe it as a first-class requirement, not
optional polish. Added `src/routes/AuditLog.tsx`, linked from More, gated to
`isParentOrCoAdmin` in the UI; the existing RLS policy
(`can_manage_household_setting(household_id, 'view_audit_log')`) already
enforces the co-admin-can-be-restricted rule server-side, so the UI gate is a
convenience, not the security boundary.

**Missing-clock-out reminder no longer fires immediately on clock-in.**
`src/lib/reminders.ts` previously flagged `missing_clock_out` for *any* entry
with `clock_in_at` set and no `clock_out_at` — which, once clock-in/out
shipped, meant every nanny would see a "clock-out missing" warning the moment
they clocked in. Spec 21 says this should fire "after scheduled shift end
plus grace period." `computeReminders` doesn't currently receive schedule
data, so as a stand-in I used a flat 12-hour-since-clock-in threshold instead
of computing the actual scheduled end time. This is good enough to stop false
positives but isn't the schedule-aware version the spec describes — see
`QUESTIONS_AND_CLARIFICATIONS.md`.

---

## Earlier history (pre-existing, not made by this session)

Recovered from git log for context — not authored in this pass, listed so
the change log has continuity:

- Build Nanny Ledger Phase 1: schema, RLS, and parent-facing PWA
- Fix onboarding household-creation RLS bug and surface real error messages
- Navigate to dashboard after successful household creation
- Reject invalid calendar dates; add PTO/sick annual balance tracking; sort
  and link dashboard reminders
- Allow parents/co-admins to delete generated timesheets
- Soft-delete timesheets, dashboard-style Home, payment cadence settings
