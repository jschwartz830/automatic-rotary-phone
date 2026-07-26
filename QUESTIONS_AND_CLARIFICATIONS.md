# Questions & Clarifications

Open items where the spec is ambiguous, internally in tension, or where the
current implementation diverges in a way that's worth a deliberate decision
rather than a silent guess.

---

## Open items

### 20. `export_records` enforced client-side only, not via RLS — is that the right call?

This run (2026-07-26) built the last piece of the spec-11 permission matrix:
`approve_timesheet`, `mark_payment_made`, and `approve_pto` are now real RLS
keys (migration 0014), matching the seven keys from 2026-07-03. `export_records`
was deliberately left out of that migration and instead gated purely
client-side via a new `coadminAllowed()` helper (`HouseholdContext` →
`Pay.tsx`/`Pto.tsx` export buttons).

**Reasoning:** every export button just formats rows the co-admin can already
`SELECT` into a CSV/JSON download. There's no *new* data exposed by exporting
that RLS would need to block — a restricted co-admin could already read every
row the export contains through the normal app screens, just not as a bundled
file. Adding a fake RLS boundary here (e.g. a `can_export` check on the
underlying `SELECT` policies) would either (a) do nothing, since the same
data reads fine outside the export code path, or (b) break the co-admin's
ordinary ability to view their own household's timesheets/payments/PTO
ledger, which spec 11 explicitly keeps at "Yes" for co-admins regardless of
the export restriction.

This is a judgment call about what "restrict from exporting" is supposed to
mean when the underlying view access is untouched — flagging it rather than
assuming it's settled. Options if you'd rather it worked differently:

* **Option A — Keep as-is (client-side gate only).** Matches the reasoning
  above; a restricted co-admin can still see everything through the app, just
  not click "Export CSV."
* **Option B — Treat "restrict export" as "restrict payment/PTO/timesheet
  export screens too."** Would mean pairing `export_records = false` with
  also hiding (not just the export button but) the underlying data views for
  that co-admin — a bigger behavior change than spec 11's matrix implies
  (it lists "View gross pay due"/"View PTO balance" as separately
  restrictable rows from "Export records," suggesting they're meant to be
  independent).
* **Option C — Drop `export_records` as a restrictable permission entirely**
  since it can't be meaningfully enforced without also restricting view
  access, and note in the spec that co-admin export ability always matches
  their view ability.

**Recommendation: Option A**, already built this way — it's the only one of
the three that doesn't require inventing new restricted-view behavior the
spec doesn't otherwise describe. Reply A/B/C (or your own variant) if you'd
rather it work differently.

---

### 19. `weekly_summary` digest — what does it actually summarize, and when?

Spec 15.14 lists `weekly_summary` as a reminder type but never defines its
content or cadence, unlike every other reminder type which has a concrete
trigger condition in spec 21. Item 17 (resolved 2026-07-03) already decided
it should be in-app-only, no recipients/quiet hours — but not what's *in* it.

This is still open — it wasn't answered before the session that raised it
ended, and this session (running on a schedule, unattended) didn't act on it
either, since it's a genuine judgment call rather than something with an
unambiguous "correct" build. Presented with options + a recommendation in
chat/notification on 2026-07-24, and again on 2026-07-26, for a decision:

* **Option A — Hours summary only.** "You worked/scheduled X hours this
  week, Y regular + Z overtime, timesheet status: ___." Cheapest to build,
  reuses data `Home.tsx`'s "Current Week" card already computes.
* **Option B — Hours + pay + PTO.** Option A plus "$X gross pay due this
  period" and "X PTO / Y sick hours remaining," giving a fuller Monday-
  morning snapshot for parents. Reuses `Pay.tsx`/`Pto.tsx` balance logic
  already in the codebase.
* **Option C — Full digest.** Option B plus pending actions (timesheets
  awaiting approval, PTO requests, missing clock-outs) and any schedule
  exceptions in the coming week — effectively a condensed version of the
  whole Home screen, refreshed weekly instead of live.
* **Option D — Drop it.** Remove `weekly_summary` from the reminder-type
  list; `Home.tsx` already shows this information live, so a stale weekly
  snapshot may be redundant rather than additive.

**Recommendation: Option B.** Option A alone under-delivers relative to what
"summary" implies once pay and PTO are one tab away and already computed;
Option C's pending-actions/exceptions content is already live and prominent
on the Home screen itself (spec 14.1), so restating it in a weekly digest adds
noise more than value. Cadence: computed and shown as an in-app card on
`Home.tsx`, refreshed the first time the app is opened each week (per the
household's `week_start_day` setting, already used elsewhere for week
boundaries) — no new reminders-table row or cron needed, matching the
existing lightweight approach for the payment lead-time reminder. Still your
call — reply with A/B/C/D (or your own variant) and it'll be built next
session.

---

## Resolved items — 2026-07-24

### 18. Which known-gap phase to build next? — RESOLVED (full records export)

**Decision (made unattended — this session ran on a schedule with nobody to
answer in chat, so the lowest-ambiguity option was picked rather than left
undone):** Built the **full records export** (spec 13.11). Of the three
remaining known gaps, it was the only one with no open design question and no
schema/RLS change required — the other two (per-key permission enforcement,
reminder settings) both need a judgment call first (the enforcement one needs
new RLS design; the reminder one is blocked on item 19 above). See
`SPEC_CHANGE_LOG.md` 2026-07-24 for the implementation write-up. Flagging this
as a decision worth a look, not a rubber stamp — if you'd rather have had one
of the other two built first, say so and it'll get reprioritized.

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
