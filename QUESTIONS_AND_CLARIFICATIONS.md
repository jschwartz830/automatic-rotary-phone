# Questions & Clarifications

Open items where the spec is ambiguous, internally in tension, or where the
current implementation diverges in a way that's worth a deliberate decision
rather than a silent guess.

---

## Open items — added 2026-07-01

### 7. Nanny invite / login flow

The spec says parents can invite nannies by email (spec 13.1 step 10), and the
`household_users` table has `invited_at`/`accepted_at` fields. There is currently
no invite UI anywhere in the app. Three options:

- **A — Supabase magic-link invite:** Parent enters nanny's email; app calls
  `supabase.auth.admin.inviteUserByEmail()` from a Supabase Edge Function
  (can't call admin API from the frontend safely); nanny gets an email with a
  sign-in link. Cleanest UX but requires a small Edge Function.
- **B — Self-signup with household code:** Generate a short join code for the
  household; nanny signs up with their own email and enters the code to join.
  Fully client-side, no Edge Function needed.
- **C — Defer:** Parent-only mode works fine for now; add nanny login later.

**Which approach do you want?** Leaning toward B (household join code) since it
avoids a backend function and keeps the app fully static, but A is cleaner UX.

### 8. Calendar view

The `/calendar` route is currently a flat list of recurring shifts (no month/week
view, no day detail, no filtering by worked time / PTO / payments). The spec
(section 13.10, 14.4) calls for month, week, and day views with all event types
overlaid. Building a full calendar is significant work.

**Options:**
- **A — Build a real month/week/day calendar** (2–3 days of work). Would add
  a proper calendar grid, day-tap → detail sheet, filter chips per spec 14.4.
- **B — Keep the flat list, add a weekly summary view** (few hours). Show
  shifts grouped by week with a day-by-day breakdown — much simpler, still
  useful.
- **C — Defer calendar polish to Phase 5.**

**What do you prefer?**

### 9. Nanny timesheet submission workflow

Currently nannies add time entries and they go directly to `status: 'submitted'`.
There is no "Submit my timesheet for this week" button that groups entries into a
formal `timesheets` record. The spec (13.5) describes a nanny-initiated submission
step: nanny reviews the week, then presses Submit, which creates a timesheet
with `status: 'submitted'` for the parent to approve.

With the current flow, the parent generates the timesheet from entries. The nanny
never initiates a timesheet record.

**Options:**
- **A — Add a "Submit Week" button in the nanny's Pay view** that creates a
  `timesheets` row for the current (or last) pay period with `status: 'submitted'`.
  Parent reviews and approves. Both parent and nanny can generate timesheets.
- **B — Keep parent-generated timesheets only.** The nanny's entries are the
  submission signal; the parent reviews entries and generates the timesheet.
  Simpler but diverges from the spec's nanny workflow.

**Which do you prefer?**

### 10. Multiple caregivers UI

The data model supports multiple caregiver profiles per household, but there's
no "Add caregiver" button in the app (nanny profiles are only created during
onboarding). If a household has two nannies or wants to add a second caregiver
later, they currently can't.

**Do you need multi-caregiver support now, or is single-caregiver sufficient?**
If yes, I can add an "Add caregiver" form to More.tsx.

### 11. PTO balance read source

PTO balances are currently computed by summing `leave_requests` (approved/used
within the policy year). The `leave_ledger` table now gets write events (see
SPEC_CHANGE_LOG 2026-07-01), but balance reads haven't been migrated yet.

**Should I migrate the balance display to read from `sum(leave_ledger.hours_delta)`?**
This is spec-correct and gives a fully auditable trail, but any existing approved
requests that predate the ledger writes will show a wrong balance until
backfilled. Options:
- **A — Migrate now, backfill via a one-time migration.** I can write a SQL
  migration that inserts `used` ledger rows for all existing approved
  `leave_requests` that don't already have one.
- **B — Defer until all accrual paths write ledger rows,** then switch the read.

---

## Resolved items — 2026-06-30

All six items below were resolved in chat on 2026-06-30. Decisions are
recorded here for reference; see `SPEC_CHANGE_LOG.md` for the implementation
write-ups as each is built.

---

## 1. PTO/leave balances aren't event-sourced through `leave_ledger` yet — RESOLVED

**Decision:** Build the real ledger. Every accrual/use/manual-adjustment
event writes a `leave_ledger` row; balance becomes `sum(hours_delta)` instead
of a live recompute. All accrual methods (`front_loaded_annual`,
`per_hour_worked`, `per_pay_period`, `monthly`, `manual_only`) get computed,
not just front-loaded. Touches PTO requests, timesheet approval, and a new
manual-adjustment UI — largest item in this batch.

## 2. "Linked to schedule" guaranteed-hours basis isn't selectable — RESOLVED

**Decision:** Add `linked_to_schedule` as a real selectable option in
`More.tsx`, alongside `fixed_weekly`. The calc engine reads summed shift
hours (where `counts_toward_guaranteed_hours = true`) when that basis is
selected.

## 3. Missing-clock-out grace period is a flat 12 hours, not schedule-aware — RESOLVED

**Decision:** Wire `computeReminders` to actual scheduled shift end times,
firing at shift end + 30 min grace. Requires passing generated schedule
occurrences into the reminders computation, and `Home.tsx` loading schedule
templates (it currently only loads entries/timesheets/leave/payments).

## 4. Payment corrections have no workflow — RESOLVED

**Decision:** Build the full workflow now, per spec 13.8: a "correct this
paid payment" action creates a correction event (not a delete), shows
original vs. corrected amount and the difference, requires a note, and logs
to the audit trail. Void gets the same treatment.

## 5. Email reminders (spec Phase 4) — RESOLVED

**Decision:** Stay in-app only for now. No Supabase Edge Function scaffolding
yet; revisit once the above phases land.

## 6. Schedule exceptions, PTO requests, and time entries: nanny_note/parent_note routing — RESOLVED

**Decision:** Keep as-is. One note field, owner decided by who's submitting
the form (`nanny_note` for nanny-submitted entries, `parent_note` for
parent/co-admin-submitted entries).
