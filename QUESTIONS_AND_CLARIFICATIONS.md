# Questions & Clarifications

Open items where the spec is ambiguous, internally in tension, or where the
current implementation diverges in a way that's worth a deliberate decision
rather than a silent guess.

---

## Open items

None right now. See `SPEC_CHANGE_LOG.md`'s "Known gaps" notes for build-out
work that's scoped but not yet done — those aren't ambiguous, just not built.

---

## Resolved items — 2026-07-03

### 16. Which known-gap phase to build next? — RESOLVED (co-admin permissions UI)

**Decision (chosen in chat):** Build the **co-admin permission management UI**
next. Delivered: a parent-admin-only "Household members" card in `More.tsx`
listing members and exposing per-co-admin toggles for the seven RLS-enforced
permission keys. The "add a co-admin" path (a separate co-parent join code)
landed independently on `main` via PR #38; this branch builds its members UI on
top of it. See `SPEC_CHANGE_LOG.md` 2026-07-03 (batch 2).

### 17. `weekly_summary` digest + reminder settings scope (13.9 / 15.14) — RESOLVED (in-app only, deferred)

**Decision (chosen in chat):** When this phase is built, do the **in-app pieces
only** — a weekly in-app summary card plus per-reminder-type enable/disable
toggles. Defer "recipients" and "quiet hours" until there's an email/SMS
backend, since they have no delivery channel today (consistent with resolved
item 5). Not yet built; tracked under "Known gaps."

---

## Resolved items — 2026-07-02 (batch 2)

### 15. Do holiday / weather-emergency schedule exceptions affect pay? — RESOLVED (option A)

**Decision:** `weather_emergency` exceptions with `affects_pay = true` are now
folded into the same `family_cancellation_hours` bucket as
`family_cancellation` exceptions — both represent "caregiver didn't work, but
is paid because of the guarantee." `Pay.tsx`'s `doGenerate` now sums both
types (still gated on the caregiver's `family_cancellation_counts_toward_guarantee`
setting, the only toggle available for this bucket). `holiday` exceptions
remain calendar-only markers — paid holidays continue to flow through the
existing `leave_requests` holiday leave type (13.7), which already has
accrual/balance tracking that a bare calendar marker doesn't. `other`
exceptions are intentionally excluded from the pay bucket — too broad a
catch-all to assume it should always be guarantee-protected pay; households
that need it reflected in gross pay can use `manual_adjustments` on the
payment record. Accepted tradeoff: the `family_cancellation_hours` line item
label is no longer 100% literal once it includes weather-day hours too.

---

## Resolved items — 2026-07-02

### PTO/sick/unpaid_time_off kept out of the Schedule Exceptions UI — RESOLVED (keep leave_requests as the single source)

Spec 13.3 lists `pto`, `sick`, `unpaid_time_off` as `schedule_exceptions`
types, but spec 13.7's `leave_requests`/`leave_ledger` flow (already fully
built, with balances and accrual) covers the same three types. Building a
second entry point for the same leave with no balance impact would create
two disconnected records. The new Schedule Exceptions UI in `Schedule.tsx`
only handles the other eight exception types (`added_shift`, `removed_shift`,
`shortened_shift`, `extended_shift`, `family_cancellation`, `holiday`,
`weather_emergency`, `other`); PTO/sick/unpaid stay exclusively in
`Pto.tsx`/`leave_requests`, as they already were.

### One-off shift exceptions affecting the schedule-linked guarantee — RESOLVED (delta model, gated by the existing flag)

Spec 13.6 says one-off added/removed shifts shouldn't move the guarantee
"unless marked as guaranteed"/"unless marked as unpaid/non-guaranteed," but
doesn't specify the mechanism. Used the exception's existing
`counts_toward_guaranteed_hours` flag for both directions: an `added_shift`
or `extended_shift` marked true adds its hours to the guarantee base, a
`removed_shift` or `shortened_shift` marked true subtracts its hours. Left
unmarked (the DB default is `false`), exceptions have no effect on the
guarantee, matching the spec's default behavior.

---

## Resolved items — 2026-07-01 (batch 3)

### 10. Multiple caregivers UI — RESOLVED (add it now)

**Decision:** Added an "Add caregiver" form (`More.tsx`), so a household can
create a second (or later) caregiver profile with its own pay/PTO settings,
not just during onboarding.

### 12. Family cancellation hours — RESOLVED (quick manual entry)

The spec lists "family cancellation" as a leave type (13.7) but the data
model routes it through `schedule_exceptions` (15.7) instead, which don't
have a UI yet — so `family_cancellation_hours` was hardcoded to `0` in both
timesheet-generation paths, meaning "guaranteed hours during a family
cancellation" never actually credited even when the caregiver setting was on.

**Decision:** Add a manual "Family cancellation hours this period" field to
the parent's generate-timesheet form (`Pay.tsx`), shown only when the
caregiver's `family_cancellation_counts_toward_guarantee` is on. Gets the
guaranteed-hours math correct without building the full exceptions calendar.
The full Schedule Exceptions UI (recording cancellations, holidays,
added/removed/shortened shifts as their own calendar-linked records) is still
unbuilt — see "Known gaps" in `SPEC_CHANGE_LOG.md`.

### 13. `manual_by_pay_period` guaranteed-hours basis — RESOLVED (dropped)

Spec 16.3 said this basis is "manually entered value for that pay period,"
but no field ever existed to store a per-period override — only a
caregiver-level setting (like `fixed_weekly`). Not buildable as literally
specified without inventing a new table/column the spec never named.

**Decision:** Removed as a redundant option. `fixed_weekly` /
`fixed_pay_period` already cover "a manually chosen number, set by the
parent." Spec text, TypeScript union, and the DB check constraint
(migration 0012) were all updated to drop it.

### 14. Schedule template editing model — RESOLVED (keep simple model)

Spec 13.2 implies schedule changes should be effective-dated (end the old
schedule, start a new one) so there's history of what was scheduled when.
`Schedule.tsx` just adds/deletes shift rows directly with no versioning.

**Decision:** Keep the current simple add/remove model — most households
don't need to look back at exactly what was scheduled on a past date.
Shift deletions now write an `audit_events` row (they previously didn't;
additions already did), so there's at least a "this shift existed and was
removed on this date" trail even without full effective-dating.

---

## Resolved items — 2026-07-01 (batch 2)

Items 7–9 and 11 below were opened in the previous session's batch but were
built in the same commit before anyone reviewed the open-items list — this
file just hadn't been updated to reflect it. Recorded here for continuity;
implementation details are in `SPEC_CHANGE_LOG.md`.

### 7. Nanny invite / login flow — RESOLVED (option B)

**Decision:** Household join code. Parents generate a 6-character code in
More.tsx (`households.join_code`); nannies self-signup and enter the code,
handled by the `join_household_by_code` SQL function (migration 0011). No
Edge Function required, keeps the app fully static.

### 8. Calendar view — RESOLVED (option B, weekly grid)

**Decision:** `Schedule.tsx` now shows a Mon–Sun week grid with prev/next
navigation, per-day shift and leave detail, and a weekly hours total, instead
of the prior flat shift list. A full month/day-view calendar (spec 13.10,
14.4's month/week/day filter chips) was not built — this is the "keep it
simpler" option, not the full 2–3 day build. If month/day views turn out to
matter in practice, that's still open work, not a documentation gap.

### 9. Nanny timesheet submission workflow — RESOLVED (option A)

**Decision:** Nannies get a "Submit timesheet" button in Pay.tsx that creates
a `timesheets` row (`status: 'submitted'`) for a chosen period, summing
approved time entries. Parent reviews and generates the official pay
calculation from it.

### 11. PTO balance read source — RESOLVED (option A)

**Decision:** Migrated. `Pto.tsx` reads balance via
`computeLeaveBalanceFromLedger` (`sum(leave_ledger.hours_delta)`) when ledger
rows exist for a policy, falling back to the old `leave_requests`-based
`computeLeaveBalance` otherwise. Migration 0010 backfilled existing approved
requests into the ledger.

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
