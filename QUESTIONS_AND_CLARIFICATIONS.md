# Questions & Clarifications

Open items where the spec is ambiguous, internally in tension, or where the
current implementation diverges in a way that's worth a deliberate decision
rather than a silent guess.

---

## Open items

Items 22-26 below have been carried forward, unresolved, across several
sessions (2026-07-30, 2026-07-31, 2026-08-01, 2026-08-04, 2026-08-05) —
presented again in-chat each time rather than decided unilaterally, per the
standing instruction to surface judgment calls rather than guess. Item 27 was
resolved 2026-07-31 since it had unambiguous recommendations for both of its
sub-decisions, unlike 22-26. Items 28-29 were added 2026-08-01, found via a
targeted spec-vs-code audit of sections not closely covered by prior sessions
(onboarding, PTO deduction timing). Item 30 was added 2026-08-04, found via a
targeted audit of spec sections 6/8/18/24 and a fresh data-model column sweep
of `households`/`household_users`. Items 31-32 were added 2026-08-05, found
via a targeted audit of spec section 16 (Calculation Rules) against
`src/lib/calc.ts`/`Pay.tsx`, and spec 14.3/14.4/14.7 against
`Time.tsx`/`Schedule.tsx`/`More.tsx`. The 2026-08-08 session's audit (spec
15.9-15.15/17/19) found no new judgment calls — its findings were either
unambiguous enough to build directly (see `SPEC_CHANGE_LOG.md` 2026-08-08:
two real RLS gaps, payment status display, audit log actor, a payment-note
field correction) or were mitigations for item 31 (a UI warning) that don't
resolve the underlying judgment call. The 2026-08-09 session's audit (spec
13.11, 21, 22, and the remainder of 16 not already covered by items 24/31)
found no mechanical fixes needed — everything checked already matched spec —
but surfaced one new judgment call, item 33 (the spec-mandated "timesheet
submission" reminder never fires in practice). The 2026-08-10 session's
audit deliberately shifted scope to the infra/meta sections (3, 5, 6, 7, 9,
12, 18, 23 — deployment, Supabase config, GitHub Actions, the serverless
constraint, navigation, authorization, and the MVP build plan) rather than
re-covering the functional workflow sections again, since those had returned
no new findings for several sessions running. It found zero gaps and opened
no new items — everything checked already matched spec. The 2026-08-11
session's audit (spec 15.5/15.7/15.8 field-by-field against the schema and
`src`, plus 22 and 25) found `schedule_templates`' `notes`/`recurrence_rule`/
`effective_end_date` dead-column pattern was already explained by resolved
item 14 (no new decision needed), found sections 22 and 25 fully match the
current UI and defaults with no gaps, mechanically fixed two more
`schedule_shifts` dead columns (`paid_break`,
`counts_toward_guaranteed_hours`) using the same checkbox pattern resolved
item 27 already established, and surfaced one new judgment call, item 34
(`time_entries.schedule_exception_id` is a dead column with no wiring at
all). The 2026-08-12 session's audit (spec 15.1-15.4 field-by-field against
the schema and `src`, plus sections 1/2/4/8/26) found `household_users`'
`'invited'` status/`.invited_at` dead-column pattern was already explained by
resolved item 7 (no new decision needed), mechanically wired up two more
dead `users` columns (`last_login_at`, plus a self-service editor for
`full_name`/`phone`), and found no new judgment calls — everything else
checked already matched spec. The 2026-08-13 session found and fixed two bugs
in this file itself: a duplicate item number 30 (two unrelated items had
claimed it; the `leave_requests.start_time`/`.end_time` one is renumbered to
**35** below, the household-member hard-delete one keeps 30) and a stale,
out-of-date duplicate of this intro paragraph that had been left sitting
mid-file since 2026-08-03. The same session then ran a full literal
bullet-by-bullet audit of spec 24 (Acceptance Criteria) and spec 13.5/13.6
(Timesheet Display) — it found and mechanically fixed a real gap (a parent
could archive an already-paid timesheet, bypassing the required Correct/Void
workflow and silently erasing the paid payment record) and surfaced two new
judgment calls, items 36-37 (spec 13.5's per-day timesheet breakdown has no
in-app view; `payment_records.guarantee_override_note` is a dead column). See
`SPEC_CHANGE_LOG.md` 2026-08-13 for full detail. The 2026-08-14 session
confirmed the manual time-entry form's schedule pre-fill (built earlier,
re-verified this session per a direct request) is already working as
intended, then ran a full literal audit of spec 13.10 (Calendar), 14.1/14.2/
14.4/14.5/14.6/14.7 (Screens), 20 (Audit Log Requirements), and 25
(Recommended Defaults). Most of that ground turned out to already be covered
by open items 22/23 or by prior sessions' conclusions on 14.5/14.7/25
(re-confirmed, not re-opened), but it found and mechanically fixed two new,
previously-undocumented gaps: spec 20's "user invited" audit event was never
logged (fixed by logging one in `Onboarding.tsx` right after a successful
join-by-code), and spec 14.6's Pay Screen listed four distinct payment
sections (Upcoming/Due/Overdue/Paid history) that `Pay.tsx` rendered as one
flat list (fixed by grouping the existing list using the `paymentDisplayStatus()`
classifier already built 2026-08-08). No new judgment calls were surfaced —
see `SPEC_CHANGE_LOG.md` 2026-08-14 for full detail. The 2026-08-15 session
re-confirmed the time-entry schedule pre-fill again (still correct, no
change), then ran a full literal audit of spec section 2 (Product Scope),
10/11 (User Roles / Role Permission Matrix), 13.2 (Recurring Schedule), the
remainder of 16 (Calculation Rules), and 26 (Implementation Notes) — the
sections the running history above hadn't yet covered with a dedicated pass.
Sections 2, 16, and 26 matched the code exactly. It found and mechanically
fixed four gaps: a parent/co-admin couldn't see a nanny's own time-entry
note (and vice versa) since each side's view only ever rendered its own
note field; `schedule_shifts.default_category` was a fully dead column with
no UI; shift `notes` was only ever collected on the custom/'other'
recurrence path, not weekly/biweekly/monthly; and no schedule preview of
generated dates existed before saving a new recurring shift (spec 13.2 asks
for one). It also surfaced two new judgment calls, items 38-39 below. See
`SPEC_CHANGE_LOG.md` 2026-08-15 for full detail. The 2026-08-18 session
re-confirmed the time-entry schedule pre-fill once more (still correct, no
change), then ran a full literal audit of spec 13.3 (Schedule Exceptions)
against `Schedule.tsx`/`lib/schedule.ts`, plus a spot-check of 13.9
(Reminders and Notifications) and 13.11 (Exports) for any bullet not already
covered by prior sessions. 13.9 and 13.11 both matched the code exactly, with
nothing left to find beyond what items 17/19/21/33 already settled. 13.3
turned up two mechanical gaps, both fixed directly, no new judgment call:
`Schedule.tsx`'s "Remove" action on a schedule exception was a hard
`DELETE` even though `schedule_exceptions.status` already has a `'canceled'`
value that every read path (`loadExceptions`, `Home.tsx`, and
`lib/schedule.ts`'s calc helpers) was already built to exclude — switched to
a soft `status: 'canceled'` update, the same never-hard-delete posture item
30 flags as missing for `household_users`, but with none of item 30's
rejoin-flow complication since nothing here needed an RLS change; and a
parent/co-admin viewing an exception could never see the `nanny_visible_note`
they themselves had written for it (only their own private `parent_note`
rendered), the same shape of one-sided note display the 2026-08-15 session
fixed for `time_entries` — now both render for the parent/co-admin side,
labeled. See `SPEC_CHANGE_LOG.md` 2026-08-18 for full detail. The 2026-08-19 session
re-confirmed the time-entry schedule pre-fill once more (still correct, no
change), then ran the first dedicated full literal audit of spec 13.4 (Time
Tracking) and 13.8 (Payment Due / Payment Made Ledger) against
`Time.tsx`/`Pay.tsx`/`calc.ts` — the two core workflow sections that hadn't
yet had one. It found and mechanically fixed four gaps: spec 13.4's "Parent
attempts to edit a paid/locked period" validation warning had no
implementation (added, checking the caregiver's `payment_records` date
ranges rather than trying to resolve the still-open non-weekly-pay-period
question items 31/32 already flag); a payment record could be archived on
its own without going through Correct/Void even when already paid, the same
class of Correct/Void bypass the 2026-08-13 session fixed at the timesheet
level but left unfixed on this separate, independently-added code path
(fixed with the same status-guard pattern); the co-admin `approve_timesheet`/
`mark_payment_made` RLS permission keys migration 0014 added specifically
for client-side enforcement were never actually checked client-side, so a
restricted co-admin still saw fully-interactive buttons that would fail
against RLS (fixed by adding the matching `coadminAllowed(...)` checks,
mirroring the `export_records` precedent already in the same file); and the
"Correct payment" form didn't show the amount difference spec 13.8 asks for
(added as a live-computed line). No new judgment calls were surfaced — every
gap had an unambiguous fix already implied by an exact precedent elsewhere in
the same file or by a backend mechanism that was already fully built and
just missing its client half. See `SPEC_CHANGE_LOG.md` 2026-08-19 for full
detail. The 2026-08-20 session re-confirmed the time-entry schedule pre-fill
once more, per an explicit request this run (still correct, no change — see
`Time.tsx`'s `date`/pre-fill `useEffect`), then built item 30 below using
its own standing recommendation (option C), since it was the one open item
with an unambiguous, low-stakes recommendation and no unresolved design
question of its own. This run's owner asked to have every remaining open
item presented with options and a recommendation, in this chat, rather than
have any of them decided unilaterally — see the notification/chat message
from this session for the full list; nothing below was built or changed as
part of that ask beyond item 30. The 2026-08-21 session re-confirmed the
time-entry schedule pre-fill once more (still correct, no change), then,
per this run's owner asking for progress "in phases" rather than a repeat
of the prior day's present-everything ask, took a middle path: it built the
four open items (28, 32, 34, and a partial slice of 24) that already
carried an unambiguous, low-blast-radius recommendation from the 2026-08-08
index and no unresolved design question of their own — the same
standing-recommendation bar item 30 was built against the day before — and
separately closed six more items (23, 26, 29, 35, 38, 39) whose own
recommendation was "leave as built, no code change," recording each as a
deliberate decision rather than silently doing nothing. Items 22, 25, 31,
33, 36, and 37 remain open because each still lacks either a low-stakes
recommendation or a settled answer to a real design question the spec
doesn't resolve — presented again in this session's notification with
options and a recommendation, per the standing instruction. See
`Resolved items — 2026-08-21` below for the full write-up of everything
closed this session.

### Recommendations added 2026-08-08, per explicit request; pruned 2026-08-21

The recurring-task owner asked the 2026-08-08 session for an explicit
recommendation on every open item, including the four (24, 25, 29, 31)
prior sessions had deliberately left unrecommended given their stakes. Each
remaining item's own section still has the full reasoning and option list;
this is a compact index so they can be answered without reading the whole
file. The 2026-08-21 session resolved every item that had an unambiguous,
low-blast-radius recommendation here (23, 24 partial, 26, 28, 29, 32, 34,
35, 38, 39 — see `Resolved items — 2026-08-21` below for what was built or
decided for each); only the items still genuinely needing a judgment call
remain indexed below.

- **22 (Calendar month view):** B — lightweight read-only month heat-strip.
- **25 (Timesheet reject/correction workflow):** C — add "Request
  correction" as a side channel on the nanny's submitted marker row
  (`needs_correction` + the already-unused `correction_note` column,
  nanny edits and resubmits) while leaving "Generate" as the actual
  pay-computation path. Closes the spec's literal correction-request/
  resubmit gap without B's full rearchitecture of the core pay-approval
  data flow — that's real surgery on money-computing code that's been
  stable across 30+ sessions, and isn't worth the risk without a household
  actually needing to reject and correct a submission.
- **31 (Overtime/guaranteed-hours miscalculation for non-weekly pay):**
  **C, but don't build it unsupervised.** Unlike the other items on this
  list, B (period-length scaling) isn't just an approximation that's
  sometimes imprecise — it can average overtime down to zero across two
  real 70-hour/10-hour weeks in a biweekly period, which isn't just a
  display nit if this app is being used for real payroll: overtime pay is
  typically a per-workweek legal obligation (in the US, the FLSA generally
  requires overtime to be computed on a fixed, recurring 7-day workweek,
  not averaged across a longer pay period), so B risks trading today's
  overpayment-shaped bug for an underpayment-shaped one, which is worse. A
  defensible version of C: treat each household's workweek as a fixed 7-day
  window anchored to `household.week_start_day`, independent of pay-period
  boundaries (this is exactly how real payroll systems reconcile
  non-weekly pay against weekly-mandated overtime); a workweek's hours are
  evaluated together for overtime wherever its start date falls, even if
  that means a few days near a pay-period boundary get counted in a
  different period's overtime math than the one they're paid in. That's a
  real, if standard, engineering task — not a one-line fix — and it changes
  a live, already-relied-upon money calculation, so it should not be built
  without an explicit go-ahead even though a recommendation is being given.
- **33 (Dead "timesheet submission" reminder):** No recommendation — same
  unspecified-period-boundary shape as item 31.
- **36 (Spec 13.5 per-day timesheet breakdown missing from the UI):** B — a
  collapsible daily table inside the timesheet detail view, reusing the
  per-day computation the CSV export already has.
- **37 (`payment_records.guarantee_override_note` dead column):** No
  recommendation — the column's intended trigger isn't specified anywhere
  past its name.

### 36. Spec 13.5's per-day timesheet breakdown has no in-app view at all — only the CSV export computes it (spec 13.5)

Spec 13.5's Timesheet Display lists a 10-field per-day breakdown as part of
what a timesheet screen should show: date, scheduled hours, actual
start/end, actual worked hours, PTO/sick/unpaid/family-cancellation hours,
notes, and status. `Pay.tsx` never renders anything at this grain — every
timesheet, in both the list and its detail view, is a single row/card
summarizing the *whole period* (`HoursBreakdown`, built 2026-07-27, covers
spec 13.5's period-level footer fields and spec 13.6's guaranteed-hours
example table completely, but nothing narrower than a period). The exact
per-day numbers spec 13.5 asks for already get computed, just not for
display — `payExport.ts`'s `buildDailyPayExportRows` builds precisely this
breakdown, one row per calendar day, for the "Daily Detail" CSV export
(spec 13.11) — but that function's output is only ever handed to a CSV
Blob, never rendered as a UI table. So today, seeing "what happened on
Tuesday of this pay period" inside the app itself isn't possible; a parent
has to export a CSV and open it elsewhere. Found via this session's full
literal pass over spec 13.5 against `Pay.tsx`.

This isn't a one-line "add a missing field" fix like several previous
sessions' dead-column wire-ups, because there's no per-day UI surface to add
a field *to* — building it means a genuinely new view: a table or
expandable list nested inside the existing period-level timesheet
detail, with its own mobile-layout decisions (10 columns is a lot for a
narrow screen — some fields would need to collapse into a row, or the view
would need to be a per-day card list instead of a literal table).

- **Option A — leave as-is.** The CSV export (`buildDailyPayExportRows`,
  already spec-13.11-compliant) is the daily view; a parent who wants
  day-by-day detail exports it. Zero new work, but doesn't match spec
  13.5's literal "Timesheet Display" list, which frames the per-day
  breakdown as part of the in-app screen, not just an export.
- **Option B — add a collapsible daily table inside the timesheet detail
  view.** Reuse `buildDailyPayExportRows`'s existing per-day computation
  (it already joins `time_entries`/`leave_requests`/`schedule_exceptions`
  per day, refactored to be shared between the CSV path and a new render
  path instead of duplicated) to populate an expandable table/card-list
  under each timesheet's existing period-level summary. Closes the literal
  gap without inventing new calculation logic — the hard part (assembling
  the per-day numbers) is already built and tested via the CSV path.
- **Option C — full day-by-day inline edit surface.** Same as B, but each
  day's row is editable inline (jumping to or embedding `Time.tsx`'s
  edit form), turning the timesheet detail view into a day-by-day editor
  rather than a read-only breakdown. Spec 13.5 only asks for *display*,
  not inline editing, so this is a bigger scope increase than the spec
  itself calls for.

**Recommendation: B, if built.** It's a real, previously-unflagged display
gap — not just a nice-to-have judgment call — but the UI-layout decisions
(how to compress 10 columns onto mobile, exactly where the table nests
inside the existing detail view) are a real design surface worth a
deliberate look rather than a guess baked into a mechanical fix.

### 37. `payment_records.guarantee_override_note` is a dead column — no workflow ever produces the note it's meant to hold (spec 13.6/15.13)

Spec 13.6's Payment Record Impact section and spec 15.13's `payment_records`
field list both include `guarantee_override_note`, alongside fields like
`manual_adjustments` that *are* fully wired (settable on the "Mark paid"/
correction forms, displayed on the payment detail view). `guarantee_override_note`
itself is never read or written anywhere in `src` — confirmed by grep,
the same method used for every other dead-column finding in this file.
Unlike most of those, though, there's no obvious UI action that would
naturally produce this note: `manual_adjustments` already exists as the
general-purpose "the parent typed in an adjustment" field, and the
guarantee-adjustment math itself (`calculateTimesheet`'s
`guarantee_adjustment_hours`) is fully automatic — there's no point in the
current flow where a parent manually *overrides* a guarantee calculation,
so it's unclear what event this note is even supposed to annotate. Found via
this session's full literal pass over spec 13.6 against `Pay.tsx`.

- **Option A — leave unbuilt.** Nothing today produces the guarantee
  override this note would annotate, so there's nothing to wire the field
  to. Mirrors the precedent already set for `schedule_shifts.default_category`
  (resolved item 27) and `time_entries.schedule_exception_id` (item 34,
  still open) — a column with no obvious trigger stays unused until one
  exists.
- **Option B — add it as a free-text note on the existing "Mark paid" form,
  shown only when the generated `guarantee_adjustment_hours` is nonzero.**
  Closest literal reading of "override note" as "explain why this period's
  guarantee math came out the way it did" — but this is a guess at intent,
  since the spec never actually describes an override *action*, only the
  note field that would result from one.

**No recommendation given** — unlike item 36, this isn't a case of a
computation existing and just not being displayed; nothing computes or
triggers a "guarantee override" today, so guessing at what UI action should
produce this note risks inventing a feature the spec never actually
describes, just a column name that implies one exists somewhere.

### 22. Calendar: build a real month view, or keep the week-grid-only simplification (spec 13.10/14.4)?

Spec 13.10 opens with "Calendar should be central to the app" and asks for
month/week/day views, filter chips (schedule/worked time/PTO-sick/payments/
alerts), and day-detail actions (approve PTO, edit time entry, view payment
impact, add note). `Schedule.tsx` has shipped only the week grid since Q&A
item 8 (resolved 2026-07-01, batch 2) as a deliberate "keep it simpler"
choice — no month view, no filter chips, no payment-due/-made markers, no
timesheet-approval-status markers on the grid, and day-detail is currently
just "add a schedule exception," not the fuller action set spec 13.10 lists.
That resolution note explicitly left the door open: *"If month/day views
turn out to matter in practice, that's still open work, not a documentation
gap."* Re-surfaced by this session's fresh spec pass rather than decided
unilaterally, per this run's instructions.

- **Option A — leave as-is.** The week grid plus Home's reminder feed, Pay's
  payment list, and PTO's leave list already surface most of the same
  underlying data, just not on one calendar surface. Zero new work.
- **Option B — lightweight month view.** A read-only month heat-strip
  showing which days have a shift / PTO / payment due-or-made, tapping a day
  jumps to the existing week-grid day-detail (no new inline actions). Medium
  effort, biggest visibility win relative to cost.
- **Option C — full spec-literal build.** Month/week/day view toggle, the
  five filter chips, and the full day-detail action set (approve PTO / edit
  time entry / view payment impact / add note inline from the calendar).
  Matches spec 13.10 closely but is the multi-day effort item 8 originally
  declined.

**Recommendation: B.** It gets most of spec 13.10's stated value (seeing the
shape of a month at a glance) without the cost of rebuilding day-detail
actions that already exist elsewhere in the app (Schedule.tsx, Pay.tsx,
PTO.tsx). Reply with A/B/C (or your own variant) and it'll be built next
session.

### 25. Timesheet reject/request-correction workflow doesn't exist (spec 11/13.5/14.3/17)

Spec's Parent Workflow (13.5) step 4 is "Approves or requests correction";
the Nanny Workflow's steps 5-6 are "Receives correction request if parent
rejects" / "Resubmits if needed"; the role matrix (11) lists
"Reject/request correction" as a first-class Parent Admin/Co-Admin action;
`needs_correction` is a real `timesheets` status with its own status-chip
color and CSV-import support (`timesheetImport.ts`). None of this has a UI
path: a nanny's "Submit timesheet" button (`Pay.tsx`) creates a `submitted`
marker row (gross pay always 0, per the 2026-07-01 batch-2 decision), and
the parent's *only* real approval mechanism is the separate "Generate
timesheet from time entries" form, which always inserts a brand-new
`approved` timesheet computed straight from time entries — it never reads,
approves, or replaces the nanny's submitted marker row. The only action ever
available on a `submitted` row is "Archive." So today, a submitted timesheet
can be archived or ignored, but never explicitly approved or sent back with
a correction note, and a nanny is never notified of a rejection because
there isn't one.

This is a judgment call, not a mechanical fix, because the two flows
(nanny's marker-row submission vs. parent's from-scratch generation) are
architecturally disconnected by a prior deliberate decision (Q&A item 9,
2026-07-01 batch 2): "parent reviews and generates the official pay
calculation from it" — but "generates" today means "computes independently
from time entries," not "acts on the submitted row." Making "Approve" and
"Request correction" real actions on a submitted row requires deciding what
"Approve" even means here: does it call the same calc path as "Generate"
(effectively replacing the marker row with a computed one, changing its own
ID/audit trail), or does it just flip `status` on the existing row without
computing pay (leaving `gross_pay_due` at 0 forever, which contradicts spec
13.5 step 5 "app calculates payable hours and gross pay due" on approval)?
And for "Request correction," does the nanny get to edit and resubmit the
*same* row, or does rejecting it just leave it archived while the nanny
starts over with a new submission?

- **Option A — leave as-is.** The parent's "generate from time entries" flow
  already produces the one true payable timesheet per period; the nanny's
  "submit" is just a heads-up notification, which the parent implicitly
  "approves" by generating and implicitly "rejects" by archiving without
  generating (with no note, and no nanny-visible signal either way). Zero
  new work, but doesn't match the spec's explicit correction-request/
  resubmit language.
- **Option B — merge the two flows.** Make the nanny's submitted row *the*
  row a parent approves: "Approve" on a submitted timesheet runs the same
  calc as today's "Generate" but updates that row in place (instead of
  inserting a new one) and creates its payment record; "Request correction"
  sets `status: 'needs_correction'` + `correction_note` (a real column
  already in the schema, currently unused) and notifies the nanny (a new
  reminder-engine card), who can then edit their entries and resubmit
  (transitioning back to `submitted`). Removes the current parallel
  "Generate timesheet" form entirely in favor of one path. Closest to the
  spec's literal workflow, but is a real rearchitecture of the core pay
  approval loop with migration/backfill implications for any
  already-submitted rows.
- **Option C — add correction as a side channel, keep both flows.** Keep
  "Generate" as the actual pay-computation path (least regression risk), but
  add a lightweight "Request correction" action *on the submitted marker
  row only* (before a parent generates from it) that sets
  `needs_correction` + `correction_note` and surfaces a reminder card to the
  nanny; the nanny edits entries and resubmits (new `submitted` row, old one
  archived). "Approve" stays implicit (parent just clicks "Generate" from
  the Pay form as today). Smaller change than B, but "approve" and "request
  correction" remain asymmetric (one's explicit, one isn't), which is a
  half-measure against the spec's literal wording.

**No recommendation given** — B is the most spec-faithful but the highest
risk (touches the core pay-approval data flow that's been stable and
tested across ~30 sessions); C is safer but doesn't fully close the gap.
Worth a deliberate choice rather than picking one unilaterally given how
central this workflow is.

### 31. Overtime and `fixed_weekly` guaranteed hours are computed once per pay period, not per calendar week — wrong math for every caregiver not on weekly pay (spec 16.3/16.6)

Spec 16.6 defines the overtime threshold as "40 actual worked hours per
**week**" and gives `regular_worked_hours = min(actual_worked_hours,
overtime_threshold)` / `overtime_worked_hours = max(actual_worked_hours -
overtime_threshold, 0)`. Spec 16.3 gives `fixed_weekly` as a guaranteed-hours
basis distinct from its sibling `fixed_pay_period` — the two names only make
sense as different things if `fixed_weekly_guaranteed_hours` represents a
single week's guarantee and `fixed_pay_period_guaranteed_hours` represents
the whole period's. But `caregiver_profiles.pay_frequency` is a real,
selectable setting in `CaregiverDetail.tsx` with four options — `weekly`,
`biweekly`, `semi_monthly`, `monthly` (`src/lib/types.ts`) — and neither
`calc.ts`'s `calculateTimesheet` nor `schedule.ts`'s
`computeGuaranteedHoursBase` is aware of period length at all:
`Pay.tsx`'s `computePeriodTotals` sums `actualWorkedHours` across the *entire*
pay period (however long) and passes it, together with the caregiver's flat
`overtime_threshold_hours` (default 40), into `calculateTimesheet` exactly
once. For a biweekly caregiver working 38 hours in each of two weeks (76
total, zero overtime under a real per-week rule), today's code computes
`overtime_worked_hours = max(76 - 40, 0) = 36` — a massive miscalculation of
`gross_pay_due`. The same flat-application problem hits
`fixed_weekly_guaranteed_hours` (`computeGuaranteedHoursBase`,
`src/lib/schedule.ts`): it's used as-is as the guarantee base for whatever
period is being computed, with no scaling for period length, so a biweekly
caregiver with a 30-hour weekly guarantee only ever gets a 30-hour guarantee
credited across the whole two-week period instead of 60.

This isn't a new-feature gap, it's a live-money bug for every household that
picks a non-weekly `pay_frequency` — but fixing it correctly means deciding
how to bucket calendar weeks inside a period that frequently doesn't align to
week boundaries (a semi-monthly period like Aug 1–15 starts mid-week; any
period can have a partial week at either edge), which the spec never
addresses. Should a partial week at a period's edge get the full 40-hour
threshold, a prorated one, or merge into the adjacent week? Should
`fixed_weekly_guaranteed_hours` scale by the number of
`household.week_start_day`-aligned week-starts inside the period, or by
`period_days / 7`? Both are defensible, neither is spec'd. A prior session's
own reasoning already brushed up against this exact tension without
connecting it back to `Pay.tsx`'s actual calculation: `SPEC_CHANGE_LOG.md`'s
2026-07-27 entry (Home's "This Week" card) explicitly notes the caregiver's
"pay period (frequently biweekly, rarely aligned to a calendar week)" as the
reason a payable-hours estimate was kept off the Home screen, but that
observation was never traced through to the fact that `Pay.tsx` itself has
the same misalignment problem when it actually runs the numbers.

- **Option A — leave as-is, document as a known limitation.** Overtime and
  `fixed_weekly` guarantee math is only correct when `pay_frequency ===
  'weekly'` (the DB default, and per spec 13.5 "the main approval object").
  A household already able to pick biweekly/semi-monthly/monthly gets wrong
  numbers today with no warning anywhere in the UI. Zero work, but silently
  wrong pay for real households.
- **Option B — simple period-length scaling (approximate, mechanical).**
  Scale both `overtime_threshold_hours` and `fixed_weekly_guaranteed_hours`
  by `period_days / 7` before they reach `calculateTimesheet` — e.g. a 14-day
  period gets an 80-hour threshold and double the weekly guarantee. Doesn't
  match "40 hours per calendar week" literally (a caregiver who works 70
  hours in week 1 and 10 in week 2 of a biweekly period still shows zero
  overtime under this scaling, where a strict weekly rule would show 30), but
  it's a one-line change per value, fixes the worst of today's miscalculation
  (a flat 40-hour/30-hour threshold regardless of period length), and needs
  no new UI or data model.
- **Option C — true per-calendar-week bucketing.** Split a period's time
  entries by ISO week (respecting `household.week_start_day`), run
  regular/overtime math per week and sum the results; scale
  `fixed_weekly_guaranteed_hours` by the number of week-starts inside the
  period. Matches spec 16.6 literally, but needs an explicit, currently
  unspecified rule for partial weeks at period boundaries, and is real
  calc-engine surgery (splitting time entries by week, reconciling that
  against the existing single-pass `calculateTimesheet` shape), not a
  one-line fix.

**No recommendation given** — unlike a mechanical fill-in, any fix here
changes `gross_pay_due` (an already-relied-upon, real-money number) for every
household not on weekly pay, in a direction that depends on their actual
hours pattern and could go either way, and the "correct" partial-week rule
genuinely isn't specified anywhere in the spec. Shipping a fix that's wrong
in a *different* way than today's bug is a real risk here, more than most
items on this list — worth a deliberate, informed choice rather than a guess.

### 33. The spec-mandated "timesheet submission" reminder never fires — no timesheet row is ever created in the `'draft'` status the check depends on (spec 21)

Spec 21 "Timesheet Submission" says: *"If pay period ended and timesheet not
submitted: Show nanny alert. Optionally show parent alert."* `reminders.ts`'s
`unsubmitted_timesheet` card only fires for an existing `timesheets` row
whose `status === 'draft'` and whose `period_end` has passed. But no normal
code path ever inserts a `'draft'` timesheet: the nanny's "Submit timesheet"
button (`Pay.tsx`) creates one with `status: 'submitted'` directly, and the
parent's "Generate" flow creates one with `status: 'approved'` directly.
`'draft'` is only reachable via CSV import (`timesheetImport.ts`), an
admin data-recovery path, not normal usage. So for every household using the
app normally, this reminder type is dead code — the spec's "pay period
ended, nothing submitted yet" alert never appears, silently, with no test or
UI signal that it's missing. (This is distinct from the working
`pending_timesheet_approval` card, which correctly covers "submitted but not
yet approved" — it's specifically the "nobody has done anything for this
closed period" case that has no working detector.) Found via this session's
targeted audit of spec 21 against `reminders.ts`.

Fixing it isn't mechanical because it needs a real answer to "which pay
period most recently ended with zero timesheet rows covering it," and the
two candidate building blocks already in the codebase both fall short:
`payPeriod.ts`'s `computeCurrentPayPeriod`/`catchUpPayPeriod` are built to
return the period *currently underway or about to close*, so by
construction their `end` is essentially never in the past — they can't
answer "which period just ended" directly. And a simpler "days since the
last timesheet" heuristic runs into the same variable-period-length problem
items 31/32 already flag for non-weekly `pay_frequency`: `semi_monthly`/
`monthly` periods don't have a fixed day count to compare against, and
biweekly periods drift the same way `payPeriod.ts`'s own existing comments
already note.

- **Option A — leave as-is.** `unsubmitted_timesheet` stays in the schema
  and reminder-settings UI (`REMINDER_TYPE_INFO`) but never actually fires.
  Zero work, but a spec-mandated alert type is effectively vestigial, and a
  household that's fallen behind on timesheet submission gets no nudge.
- **Option B — per-caregiver "previous period" computation.** Add a
  `previousPayPeriod(caregiver, today)` helper to `payPeriod.ts` (mirroring
  `computeCurrentPayPeriod`'s anchor logic, stepped back one period; for
  `semi_monthly`/`monthly`, the actual previous calendar half-month/month),
  then in `reminders.ts` check whether *any* timesheet (any status) covers
  that caregiver's most-recently-ended period — if none does, fire the
  alert once per caregiver instead of keying off an unreachable `'draft'`
  status. Closest to the spec's literal intent; needs an explicit decision
  on partial-period edge cases at pay-frequency boundaries.
- **Option C — simpler proxy.** Flag a caregiver who has approved time
  entries older than N days with no timesheet covering them, sidestepping
  exact period-boundary math. Looser approximation — a caregiver on a
  slow-to-fill-in schedule could trip it mid-period, not just after a period
  genuinely closes.

**No recommendation given** — same shape as items 31/32: the "right"
period-boundary rule for non-weekly pay frequencies isn't specified
anywhere in the spec, and guessing at a heuristic risks either false-positive
nagging or continuing to silently miss real gaps, which is the status quo
today.

---

## Resolved items — 2026-08-21

### 28. Onboarding implements 2 of spec 13.1's 11 setup steps — RESOLVED (option B)

**Decision (built unattended, using this item's own standing recommendation
from the 2026-08-08 index):** Added a dismissible "Finish setup" checklist
card to `Home.tsx`, parent/co-admin only. It lists whichever of four
still-default settings apply (household timezone still `America/New_York`,
no active recurring schedule, no enabled PTO/sick policy, guaranteed hours
never turned on for any caregiver), each linking straight to the existing
screen that already handles it (`/more`, `/calendar`, or `/caregiver/:id`).
Disappears automatically once every item's been addressed, or can be
dismissed manually (tracked per-household in `localStorage`, the same
client-only-preference pattern already used for theme/time-format/active-
household). No onboarding-flow change, no new forms — every setting it
points to was already a real, working control elsewhere. See
`SPEC_CHANGE_LOG.md` 2026-08-21 for implementation detail.

### 32. Time screen is one flat, unscoped list — RESOLVED (option B)

**Decision (built unattended, using this item's own standing recommendation
from the 2026-08-08 index):** `Time.tsx`'s active-entries list is now scoped
to one calendar week at a time (via `household.week_start_day`), with a
prev/next-week toggle defaulting to the current week and a header showing
which week is in view. "Next" is disabled once back at the current week —
there's nothing to page forward into. The archived-entries list, the add/
edit forms, and validation warnings are untouched (they already operate
per-entry, not on the flat list). The "Corrections" third of spec 14.3's
tab structure stays unbuilt, same as the recommendation said, since it has
nothing to show until item 25 defines what "request correction" does. See
`SPEC_CHANGE_LOG.md` 2026-08-21 for implementation detail.

### 34. `time_entries.schedule_exception_id` is a dead column — RESOLVED (option B)

**Decision (built unattended, using this item's own standing recommendation
from the 2026-08-08 index):** Wired as a pure audit-trail link, exactly as
option B specified. When a time entry is created (manual save or clock-in),
`Time.tsx` looks up that date's approved, shift-affecting schedule
exceptions (`added_shift`/`shortened_shift`/`extended_shift`/
`family_cancellation`); if exactly one matches, its id is stored on
`schedule_exception_id`. Zero or multiple matches store nothing rather than
guess. No pre-fill change, no calculation reads the column — same as before,
just with the FK populated when there's an unambiguous answer. See
`SPEC_CHANGE_LOG.md` 2026-08-21 for implementation detail.

### 24. Leave policy accrual automation and per-policy settings — RESOLVED (option B for `negative_balance_allowed`/`waiting_period_days`/`balance_cap_hours`, option A for `carryover_cap_hours` and full accrual-method automation)

**Decision (built unattended, using this item's own standing recommendation
from the 2026-08-08 index):** Built the slice of option B the recommendation
actually called mechanical. `CaregiverDetail.tsx`'s PTO settings card now
has, per leave type, inputs for waiting period (days), a balance cap
(hours), and a checkbox for "allow requesting more than the remaining
balance" (`negative_balance_allowed`) — all three save into the same
`leave_policies` upsert the annual-allowance field already used.
`negative_balance_allowed`/`waiting_period_days` were already read by
`Pto.tsx`'s request validation (2026-07-01 batch 3); this just exposes the
settings UI that was missing. `balance_cap_hours` had no reader anywhere, so
`lib/leave.ts`'s `computeLeaveBalanceFromLedger`/`computeLeaveBalance` now
cap `remainingHours` at it when set (`Math.min`), the "gate the existing
balance computation" the recommendation described — opt-in, so no existing
household's balance changes unless they set a new cap.

`carryover_cap_hours` was deliberately left out, unlike the recommendation's
literal list: the balance model in `lib/leave.ts` never resets at a policy-
year boundary today (`policyYearStart` only changes which ledger rows count
as "used this year" for display; the running balance itself just keeps
accumulating), so there's no rollover event for a carryover cap to gate.
Building UI for it without a reset mechanism to attach it to would just
create another populated-but-inert column, the exact failure mode this
file's dead-column entries exist to flag — left for a future session if
year-boundary balance reset is ever built. Full accrual-method automation
(`per_hour_worked`/`per_pay_period`/`monthly`) and the
`counts_toward_guarantee`/`visible_to_nanny` redundancy the item originally
raised are both still unbuilt, matching option A for that part — the
recommendation never called those mechanical, and neither changed here. See
`SPEC_CHANGE_LOG.md` 2026-08-21 for implementation detail.

### 23. Home screen literal card/button layout — RESOLVED (option A)

**Decision (recorded unattended, taking this item's own 2026-08-08
recommendation):** Keep as built — the shipped Today/This-Week cards plus
the existing reminder feed already cover spec 14.1/14.2's intent, and
nothing since has flagged the tile grid as missing something specific. No
code change.

### 26. Payment record attachment/photo — RESOLVED (option A)

**Decision (recorded unattended, taking this item's own 2026-08-08
recommendation):** Skip. Still an explicitly-optional spec field with no
household signal that it's needed; building the Storage/RLS surface
speculatively isn't worth it yet. No code change.

### 29. PTO/sick/unpaid deduction timing — RESOLVED (option A)

**Decision (recorded unattended, taking this item's own 2026-08-08
recommendation):** Leave deduct-on-approval as-is. Every household using
the app today has calibrated around the current immediate-deduction
behavior; moving to "finalize on timesheet approval" is a real UX
improvement but not a correctness fix, and isn't worth risking a surprise
change to an already-relied-upon balance number without a household asking
for it. No code change.

### 35. `leave_requests.start_time`/`end_time` dead columns — RESOLVED (option A)

**Decision (recorded unattended, taking this item's own 2026-08-08
recommendation):** Skip. The existing total-hours field already covers the
numeric side of a partial-day request; no household has asked for
hour-of-day granularity. No code change.

### 38. Nanny "request only" schedule exceptions — RESOLVED (option C)

**Decision (recorded unattended, taking this item's own 2026-08-08
recommendation):** Read spec 11's "Request only" as pointing at the
PTO/sick/unpaid leave-request flow (`PTO.tsx`), which already gives nannies
a real, working request mechanism — not as asking for a second request/
approve queue for the remaining, inherently parent-authored exception types
(added/removed/shortened shift, holiday, weather, family cancellation). No
household has asked for a nanny-facing exception-request form. No code
change; the dead RLS carve-out this item found
(`supabase/migrations/0002_rls.sql:359-367`) is left in place as harmless,
unused permission surface rather than removed, since narrowing RLS on a
guess carries more risk than leaving an unreachable branch alone.

### 39. Section 10 vs. 11 co-admin permission-granularity mismatch — RESOLVED (option A)

**Decision (recorded unattended, taking this item's own 2026-08-08
recommendation):** Keep today's narrower, section-10-prose-matching
permission set. The two spec sections disagree with each other, and adding
`view_pay_rate`/`edit_time_entries` RLS toggles for restriction scenarios no
household has run into adds surface area without a concrete need driving
it. No code change.

All nine items above were decided unattended because each already carried
an unambiguous recommendation from a prior session with no unresolved
design question of its own, per the same standing bar item 30 (2026-08-20)
was built against — this session's owner asked for "progress in phases,"
not another day of the whole open-items list sitting untouched. Items 22,
25, 31, 33, 36, and 37 do not meet that bar (each still needs either a real
design decision the spec doesn't settle, or carries enough risk to an
already-relied-upon number that it shouldn't be decided without an explicit
go-ahead) and remain open below, presented again in this session's
notification.

---

## Resolved items — 2026-08-20

### 30. Removing a household member hard-deletes the `household_users` row instead of using the schema's `'removed'` status (spec 10/15.3) — RESOLVED (option C)

**Decision (built unattended, using this item's own standing recommendation
— see `SPEC_CHANGE_LOG.md` 2026-08-20 for the implementation write-up):**
`More.tsx`'s `removeMember()` now does `update({status: 'removed'})` instead
of a hard `delete()`; the members list query excludes `status = 'removed'`
rows so a removed member drops out of the UI exactly as before. Migration
0019 sharpens `join_household_by_code()`'s error message so a removed member
who still has the old code sees "You were removed from this household. Ask
the household admin to re-invite you." instead of the more confusing
"already a member" — the function already blocked rejoin for *any* existing
row regardless of status, so this is a message-only change, not new
rejoin-blocking logic. A removed member can only get back in if the parent
regenerates and re-shares the join code, matching option C's "explicit
re-invite" semantic. `audit_events` already logged `before: {role, email}`
on remove; it now also logs `before.status` and `after: {status: 'removed'}`
for a complete before/after record.

---

## Resolved items — 2026-07-31

### 27. `schedule_shifts.paid_if_family_canceled` / `.default_category` are dead columns (spec 15.6) — RESOLVED (option B for `paid_if_family_canceled`, option A for `default_category`)

**Decision (made unattended — this session ran on a schedule with nobody to
answer in chat; taken because, unlike items 22-26, both sub-decisions here
had an unambiguous recommendation with low blast radius):** Built **option
B** for `paid_if_family_canceled` only, per the recommendation. Delivered:

- A "Paid if family cancels this shift" checkbox on the Add Shift form in
  `Schedule.tsx`, defaulting to `true` (matching the column's DB default),
  shown for the weekly/biweekly/monthly/custom recurrence choices (the
  one-time option creates a `schedule_exceptions` row directly, not a
  `schedule_shifts` row, so the field doesn't apply there). All four shift-
  insert call sites now write it instead of leaving it at the DB default.
- `family_cancellation` added to the set of exception types that can
  reference an "Original shift" in the day-detail exception form (previously
  only `removed_shift`/`shortened_shift`/`extended_shift` could) — needed so
  the app knows *which* shift is being canceled when a day has more than one.
  When there's exactly one shift scheduled that day, it's auto-selected.
- Selecting a type of "Family cancellation" (or picking/changing the
  original shift while that type is selected) now defaults the exception's
  "Affects pay" checkbox from that shift's `paid_if_family_canceled` — still
  a normal checkbox the parent can override per-exception, per the option B
  spec. Linking the original shift also means `exceptionHours()` can now
  auto-calculate hours from the canceled shift's duration when no explicit
  hours/time-range override is given, which it couldn't before (family-
  cancellation exceptions had no shift link at all).

`default_category` was left unbuilt (option A) — no calculation or display
anywhere reads shift category, and inventing what "category" should *do* was
explicitly out of scope for a mechanical fill-in per the original write-up.
The column stays in place, unused, until there's an actual use for it.

---

## Resolved items — 2026-07-26 (part 2)

### 21. `export_records` enforced client-side only, not via RLS — RESOLVED (option A)

**Decision (chosen in chat):** Keep as built — the client-side-only gate via
`coadminAllowed('export_records')` is the final answer, not a placeholder.
No code change. See `SPEC_CHANGE_LOG.md` 2026-07-26 for the original
reasoning (exports don't expose any data beyond what the co-admin can
already `SELECT`, so a database-level restriction would either do nothing
or break their ordinary view access).

### 20. `nanny_can_view_*` visibility flags are stored but never enforced — RESOLVED (option A)

**Decision (chosen in chat):** Enforce them. Delivered:

- `CaregiverDetail.tsx` now blocks nanny access entirely (`<Navigate to="/"
  replace />`) — it was the only screen showing pay rate or the
  guaranteed-hours settings, and had no role gate at all before this.
- `Pay.tsx`'s Payments/Timesheets cards hide `gross_pay_due` for a nanny
  whose caregiver has `nanny_can_view_gross_pay = false`.
- `Pto.tsx`'s Balances card shows "Balance hidden by household settings."
  instead of the PTO/sick numbers when `nanny_can_view_pto_balance = false`.
- `Home.tsx`'s weekly-summary card (`buildWeeklySummaryCards`) omits the
  gross-pay and PTO/sick lines under the same flags for the nanny viewing
  their own card.

Guaranteed-hours *totals* were not touched beyond the `CaregiverDetail.tsx`
block, because no screen displays that number to anyone yet, parent or
nanny — see `SPEC_CHANGE_LOG.md` 2026-07-26 (part 2) for detail and the new
"guaranteed-hours line item" known gap this surfaced.

---

## Resolved items — 2026-07-25

### 19. `weekly_summary` digest — what does it actually summarize, and when? — RESOLVED (option B)

**Decision (made unattended — this session ran on a schedule with nobody to
answer in chat, so the recommended option from the 2026-07-24 write-up was
taken rather than left blocked another cycle):** Built **option B** — hours
logged this week, current timesheet status, next payment due, and PTO/sick
balance remaining, one card per caregiver on `Home.tsx`, recomputed live on
every load. Regular/overtime hours split (mentioned in the recommendation's
example copy) was deliberately left out — see `SPEC_CHANGE_LOG.md`
2026-07-25 for why. Flagging this as a decision worth a look, not a rubber
stamp — if the omitted regular/OT split or any other part of the content
matters, say so and it'll be adjusted.

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
