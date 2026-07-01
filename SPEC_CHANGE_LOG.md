# Spec Change Log

Tracks decisions made while implementing against `APPLICATION_SPEC.md`: where an
implementation detail wasn't fully specified, where two parts of the spec were
in tension, or where a deliberate simplification was made. This is a running
log, newest entries on top. See `QUESTIONS_AND_CLARIFICATIONS.md` for open
items that need your decision rather than ones already resolved.

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
