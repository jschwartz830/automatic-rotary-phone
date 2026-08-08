# Spec Change Log

Tracks decisions made while implementing against `APPLICATION_SPEC.md`: where an
implementation detail wasn't fully specified, where two parts of the spec were
in tension, or where a deliberate simplification was made. This is a running
log, newest entries on top. See `QUESTIONS_AND_CLARIFICATIONS.md` for open
items that need your decision rather than ones already resolved.

---

## 2026-08-08 — RLS gaps closed on nanny inserts and caregiver_profiles read scope (spec 19, security fix); payment status now shows upcoming/overdue (spec 17, mechanical); audit log shows actor (spec 20, mechanical); payment note field corrected to nanny_visible_note (spec 15.13, mechanical); non-weekly pay warning added for item 31; time-entry schedule pre-fill re-verified; items 22-26/28-32 re-presented, no new judgment calls

**This session's scope, per the standing recurring-task instructions plus the
recurring-task owner's explicit ask this run:** re-verify the time-entry
schedule pre-fill (already built 2026-06-30, working as intended — see
below), then a fresh targeted audit of spec 15.9-15.15 (timesheets through
audit_events), spec 17 (Status Rules), and spec 19 (RLS Requirements)
against `supabase/migrations/*.sql`, `src/lib/types.ts`, and
`Pay.tsx`/`PTO.tsx`/`AuditLog.tsx`/`More.tsx` — areas prior sessions hadn't
closely covered. Full audit method and findings in the session transcript;
summarized below by what got fixed vs. left open.

**Time entry pre-fill from the caregiver's schedule (the explicit ask this
run) was already built and has been re-verified working (spec 13.4/13.2).**
`Time.tsx`'s manual-entry form (`useEffect` around the `date`/`templates`/
`shiftsByTemplate` state) already looks up the scheduled shift for whatever
date is selected and pre-fills start time, end time, and break minutes from
it, falling back to a 09:00-17:00 default only when nothing's scheduled that
day — and the date field still defaults to today. This has shipped since
2026-06-30 and been re-verified in five sessions since (2026-08-03, -04,
-05, and now); no change was needed. See `SPEC_CHANGE_LOG.md`'s 2026-06-30
entry for the original build.

**Two real RLS gaps closed (spec 19, security fix, built directly — not a
judgment call).** `time_entries_insert`, `timesheets_insert`, and
`leave_requests_insert` each restrict a parent/co-admin's insert branch by
status, but their caregiver-user (nanny) branch had no status restriction at
all — unlike each table's sibling *update* policy, and unlike
`schedule_exceptions_insert`, which got this right from the start. In
practice this meant a nanny calling the Supabase client directly (not
through the app UI, which never offers this) could insert a `time_entries`
row already `status: 'approved'`, a `leave_requests` row already
`status: 'approved'`, or a `timesheets` row already `status: 'paid'` with a
fabricated `gross_pay_due` — all of which `Pay.tsx`'s payroll calculations
read via a plain status filter with no other server-side safeguard.
`0018_rls_nanny_insert_status_and_profile_scope.sql` adds the same
status allow-list each table's update policy already enforces
(`'draft'`/`'submitted'` for time_entries/timesheets, `'requested'` for
leave_requests) to the matching insert policy's caregiver-user branch. The
same migration also tightens `caregiver_profiles_select_member`, which let
any household member — nanny included — read every caregiver's full profile
row (pay rate, guaranteed-hours settings, every `nanny_can_view_*`-gated
field), not just their own; the app UI never uses another caregiver's row
for a nanny viewer, so this only closes the network-layer gap to match.
Parent/co-admin visibility is unchanged in both cases.

**Payment status now correctly shows upcoming/due/overdue instead of always
"due" (spec 15.13/17, mechanical).** Every `payment_records` insert site
hardcoded `status: 'due'` regardless of how far off `due_date` was — so a
payment three weeks out and one three weeks overdue showed the identical
amber "Due" chip, and `'upcoming'`/`'overdue'` (two of spec 17's seven
statuses) were dead values nothing ever wrote. Added
`paymentDisplayStatus()` to `src/lib/payPeriod.ts` (reuses the same
`due_date`-vs-today comparison `reminders.ts` already does for the reminder
feed) and applied it wherever a payment's `StatusChip` renders in `Pay.tsx`.
Purely a display fix — the stored `status` column and the `PAYABLE_STATUSES`
gating logic are unchanged, since `'due'` was already in that set.

**Audit log now shows who took each action, not just what and when (spec
15.15/20, mechanical).** `AuditLog.tsx` already had `actor_user_id` on every
row (every `logAuditEvent()` call site writes it faithfully) but never
displayed it, despite the screen's own subtitle claiming to show "who, what,
and when." Now joins against `users` (same `id`/`full_name`/`email` lookup
pattern `More.tsx`'s member list already uses) and shows the actor's name or
email next to the timestamp.

**Payment void/correction notes moved from `parent_note` to
`nanny_visible_note` (spec 15.13, mechanical, zero behavior change).** The
void-reason and correction-reason text was being written into `parent_note`
but displayed unconditionally on the Payments list and detail sheet with no
role gate — i.e., already nanny-visible in practice, just under the field
name meant for internal-only notes. Switched the two write sites in
`Pay.tsx` to `nanny_visible_note` (matches what was already happening) and
the two display sites to prefer `nanny_visible_note`, falling back to
`parent_note` so notes written before this change still show. `parent_note`
is now free to become a genuinely internal-only field if that UI gets built
later.

**Non-weekly-pay-frequency warning added to the timesheet-generation form
(mitigates item 31's impact, doesn't fix the underlying bug).** Item 31
(overtime/`fixed_weekly` guaranteed hours computed once per whole pay
period instead of per calendar week — a real miscalculation for any
caregiver not on weekly pay) was found and left unbuilt last session
pending a product decision on partial-week handling (see
`QUESTIONS_AND_CLARIFICATIONS.md`). Rather than leave a household silently
trusting a wrong number in the meantime, `Pay.tsx`'s "Generate timesheet"
form now shows an amber warning whenever the active caregiver's
`pay_frequency` isn't `'weekly'`, telling the parent to double-check any
week over 40 hours before approving. This is a pure UI addition — it
doesn't touch `calc.ts`, `schedule.ts`, or the stored calculation at all, so
it carries none of the risk a real fix would.

**Audit also checked and found no new issues in:** every spec 15.9-15.12
field (timesheets, leave_policies, leave_requests, leave_ledger) against
`0001_schema.sql` plus every later migration that touches those tables —
schema matches spec's literal field list, with the only additions being
already-documented soft-delete/archive columns from prior sessions;
`leave_ledger.event_type` coverage (already-open item 24, not re-described);
the `reminders` table's read/write usage; spec 17's time-entry/timesheet
status transitions elsewhere (the only two never-reached values,
`'corrected'` and `'locked'`, are fully subsumed by already-open item 25);
and the remaining spec 19 RLS bullets (household-boundary scoping,
parent-admin/co-admin full access, payment_records nanny-read/no-write,
leave_requests nanny-create-only-for-self) all matched actual policy on
inspection.

**Health check:** `npm install`, `npx tsc -b`, `npx oxlint`, and `npx vite
build` all clean — no new TypeScript errors, no new lint warnings beyond the
same pre-existing handful prior sessions have already noted.

Q&A items 22-26 and 28-32 were not resolved unilaterally (unchanged from
prior sessions) — re-presented in `QUESTIONS_AND_CLARIFICATIONS.md`, this
time with an explicit recommendation attached to every open item per this
session's request, including ones prior sessions deliberately left
unrecommended given the stakes (items 24/25/29/31).

---

## 2026-08-06 — Archiving a timesheet didn't actually free its period for a redo (bug fix, no spec change)

`timesheets` carries a plain `unique (caregiver_id, period_start, period_end)`
constraint from `0001_schema.sql`. `0005_soft_delete_timesheets.sql` later
made archiving a timesheet a soft delete (`deleted_at` set, row kept), but
never revisited that constraint -- Postgres doesn't know `deleted_at`-set rows
are supposed to be inactive, so it kept rejecting a new `insert` for the same
`(caregiver_id, period_start, period_end)` even after the old row was
archived. `Pay.tsx` had grown a workaround (`timesheetErrorMessage` catching
the `23505` and telling the user to "adjust the dates instead") and a comment
on `lastPeriodEnd` explicitly noting the constraint "still blocks
regenerating an archived period" -- both papering over the underlying bug
rather than fixing it. Net effect: once a timesheet was archived (directly,
or after voiding its payment and then archiving the now-unpaid timesheet),
that pay period was stuck forever -- no new timesheet could ever be generated
for it again.

`0017_timesheet_period_unique_excludes_archived.sql` drops that constraint
and replaces it with a partial unique index scoped to
`where deleted_at is null`, matching how `deleted_at` is already treated as
"inactive" everywhere else in the app (payment records, leave requests).
Archiving a timesheet -- including the void-payment-then-archive-timesheet
path -- now genuinely clears its period for a fresh timesheet. Updated the
now-stale `timesheetErrorMessage` copy and `lastPeriodEnd` comment in
`Pay.tsx` to match; left `lastPeriodEnd` itself including archived timesheets
unchanged, since it's still the right "most recent period" to suggest
catch-up from.

## 2026-08-05 — Time screen now shows scheduled-vs-actual per row (spec 14.3, mechanical); targeted audit of sections 14/16 finds two new judgment calls (Q&A items 31-32, one a real financial-calc bug); items 22-26/28-30 re-presented

**This session's scope, per the standing recurring-task instructions:** a
fresh, targeted audit of two spec areas prior sessions had covered less
closely than others — section 16 "Calculation Rules" (16.1-16.9) checked
formula-by-formula against `src/lib/calc.ts` and `Pay.tsx`'s
`computePeriodTotals`, and spec 14.3 (Time Screen)/14.4 (Calendar
Screen)/14.7 (Settings Screen) checked bullet-by-bullet against
`Time.tsx`/`Schedule.tsx`/`More.tsx`. 14.4 was skipped once its gaps were
confirmed to be the same already-open Q&A item 22 (week-grid-only calendar);
nothing new was added there per this run's instructions not to re-describe an
already-tracked gap.

**Time screen now shows scheduled hours next to actual, per row (spec 14.3,
mechanical, built).** Spec 14.3 lists "Scheduled vs actual" under the Time
screen's "Show" bullets; `Time.tsx`'s entry rows previously showed only
actual worked hours (`entry.paid_hours`), with the caregiver's scheduled
hours for that date computed only transiently inside the add/edit form's
validation warnings (`scheduledHoursFor`, already existed) and never
displayed on the saved row itself. Each active entry row now shows
"(scheduled X.XX hrs)" next to the actual hours whenever a shift was
scheduled that date, reusing the same `scheduledHoursFor` helper the form
already had — no new schedule query, no new design surface, a direct
"read a value that's already computed and just wasn't shown" fix. Left the
collapsed Archived list unchanged (lower-traffic view, already visually
de-emphasized) to keep the change surgical.

**Two new judgment calls found, not built — see
`QUESTIONS_AND_CLARIFICATIONS.md` items 31-32.**

- **Item 31 (the significant one) — overtime and `fixed_weekly` guaranteed
  hours are computed once per whole pay period, not per calendar week, in
  `calc.ts`/`Pay.tsx`/`schedule.ts`.** Spec 16.6 is explicit that the
  overtime threshold is "40 actual worked hours per **week**," and spec
  16.3's `fixed_weekly` guaranteed-hours basis is a distinct sibling of
  `fixed_pay_period` specifically because it's meant to represent a week's
  worth, not a period's. But `pay_frequency` (a real, selectable
  `caregiver_profiles` setting — weekly/biweekly/semi_monthly/monthly) is
  never consulted by the calc engine: `computePeriodTotals` sums worked
  hours across the *entire* pay period and runs them through
  `calculateTimesheet` exactly once against a flat, unscaled
  `overtime_threshold_hours` (default 40) and, separately,
  `computeGuaranteedHoursBase` returns `fixed_weekly_guaranteed_hours` as-is
  regardless of how long the period being computed actually is. For a
  biweekly caregiver working 38 hours in each of two weeks (76 total, zero
  overtime under any real weekly rule), today's code computes 36 hours of
  overtime — a real miscalculation of `gross_pay_due`, not a cosmetic gap.
  Not fixed directly because the "correct" fix requires an unspecified
  product decision about how to bucket weeks inside a period that frequently
  doesn't align to week boundaries (partial weeks at a semi-monthly or
  monthly period's edges have no spec'd threshold-proration rule), and a
  wrong-in-a-different-way fix is a real risk given this touches
  already-relied-upon pay math for every non-weekly household. See the Q&A
  entry for the three options considered (leave as-is / approximate
  period-length scaling / true per-calendar-week bucketing) — no
  recommendation given, deliberately, given the stakes.
- **Item 32 — Time screen is a single flat, unscoped list of every entry
  ever logged, not spec 14.3's This Week / Previous Weeks / Corrections tab
  structure.** `Time.tsx`'s `loadEntries` has no date filter at all and
  renders the full result as one reverse-chronological list. Not built
  directly because the "Corrections" third of the ask has nothing to show
  until Q&A item 25 (reject/request-correction workflow) is decided, and the
  "This Week"/"Previous Weeks" split needs its own navigation-model decision
  plus the same pay-period-vs-calendar-week question item 31 raises for
  money, just for display instead. Recommendation given (option B — add
  week grouping/paging, skip Corrections until item 25 lands) but not
  built unilaterally, matching the bar items 22/23 already set for
  screen-structure decisions.

**Audit also checked and found no new issues in:** every other 16.x formula
(16.1 paid-hours, 16.2 scheduled-hours, 16.4 actual-paid-hours gating, 16.5
guarantee adjustment, 16.7 payable-hours capping, 16.8 gross pay) matches the
spec's stated formulas and worked examples (13.6 Examples 1-4) exactly for a
single-week period, which is the only case the code was ever exercised
against; 16.9's per-hour-worked/per-pay-period/monthly accrual gap is the
same already-open item 24, not re-described here. 14.7 Settings: every listed
section (Household settings, User permissions, Nanny profile, Pay settings,
Guaranteed hours settings, PTO/sick settings, Schedule templates, Reminder
settings, Export records, Audit log) is reachable from `More.tsx` or one tap
away from it (Audit Log via its bottom link, Export via Pay.tsx, Schedule
templates via Schedule.tsx) — same "everything reachable, just not funneled
into one screen" pattern already accepted for item 28's onboarding gap, not
a new finding.

**Health check:** `npm install`, `npx tsc -b`, `npx oxlint`, and `npx vite
build` all clean — no new TypeScript errors, no new lint warnings beyond the
same pre-existing handful (`react-hooks/exhaustive-deps` in `Schedule.tsx`,
`react-refresh/only-export-components` in the context files and
`Card.tsx`) prior sessions have already noted.

Q&A items 22-26 and 28-30 were not resolved unilaterally (unchanged from
prior sessions) — re-presented in `QUESTIONS_AND_CLARIFICATIONS.md` alongside
the two new items above (31-32) for a decision.

---

## 2026-08-04 — PWA manifest duplication/inconsistency fixed (spec 8, mechanical); targeted audit of sections 6/7/8/18/24 plus a households/household_users column sweep finds one new judgment call (Q&A item 30); time-entry pre-fill re-verified; items 22-26/28-29 re-presented

**This session's scope, per the standing recurring-task instructions:**
re-verify the time-entry schedule pre-fill (asked for again by name), run a
fresh targeted audit aimed at spec sections prior sessions covered less
closely — section 6 (Supabase schema vs. spec), section 7 (GitHub Actions
deploy config), section 8 (PWA requirement), section 18 (Authorization —
session handling, auth guards), section 24 (Acceptance Criteria, checked
literally) — plus a fresh grep-every-column-name sweep of two data-model
tables not recently swept (`households`, `household_users`). No session ran
2026-08-02 or 2026-08-03.

**PWA manifest was duplicated and inconsistent (spec 8, mechanical, built).**
`index.html` hand-authored a `<link rel="manifest" href="/manifest.json">`
pointing at a static `public/manifest.json`, *in addition to* the
`<link rel="manifest">` that `vite-plugin-pwa` auto-injects pointing at its
own generated `manifest.webmanifest` — confirmed by building and inspecting
`dist/index.html`, which shipped both tags. The two manifests disagreed:
`public/manifest.json` had `theme_color: "#111827"` (matching the app's
`<meta name="theme-color">` and `PreferencesContext.tsx`'s light-mode value);
`vite.config.ts`'s `VitePWA({ manifest: {...} })` had `theme_color:
"#ffffff"`. Which one a browser actually honors when two `<link
rel="manifest">` tags are present is undefined/browser-dependent, so this was
a real (if subtle) "PWA install may pick up the wrong theme color"
correctness bug, not just untidiness. Similarly, `public/sw.js` was a
hand-written service worker that's been fully superseded by
`vite-plugin-pwa`'s generated `sw.js` (`registerSW` from
`virtual:pwa-register` is what `main.tsx` actually registers) — confirmed by
building and diffing `dist/sw.js` against `public/sw.js`: the workbox-
generated file always wins at `dist/sw.js` regardless of the static one, so
`public/sw.js` was dead code that could mislead a future reader into thinking
it's the real service worker. Fix: removed `public/manifest.json` and
`public/sw.js`, removed the manual manifest `<link>` from `index.html` (the
plugin still auto-injects one, confirmed post-fix by rebuilding — single
`<link rel="manifest" href=".../manifest.webmanifest">`, correctly base-path-
prefixed), and changed `vite.config.ts`'s `theme_color` to `#111827` to match
the rest of the app. Verified via a clean production build that
`dist/index.html` now has exactly one manifest link and `dist/manifest.webmanifest`
carries the correct theme color.

**One new judgment call found, not built — see `QUESTIONS_AND_CLARIFICATIONS.md` item 30.**
`household_users.status` has an unused `'removed'` enum value — every RLS
helper already checks `status = 'active'`, so soft-deleting would revoke
access identically to today's hard delete, and it looked at first glance like
a one-line "use the status column that already exists" fix. It isn't:
`join_household_by_code()` (the `SECURITY DEFINER` function backing the
join-code invite flow) blocks rejoining if *any* row exists for that
household/user pair regardless of status, and does a plain `INSERT` that
would violate the table's unique constraint against a leftover `'removed'`
row. Soft-deleting without also teaching the join function to handle a
`'removed'` row would permanently lock a removed member out of ever
rejoining via a join code again — worse than the gap it would fix — and
whether a removed member *should* be able to silently rejoin with an old
code is a real access-control call, not a mechanical one. Not built
unilaterally for that reason.

**Audit also checked and found no new issues in:** GitHub Actions deploy
workflow (matches spec 3/5/7 and goes further, with retry-on-failure logic
spec doesn't require); Vite base-path config; env var handling (only the
anon key reaches the frontend bundle, confirmed by grep); auth guards/session
handling (`Gate`/`RequireHousehold` in `App.tsx`, `AuthContext.tsx`'s
`onAuthStateChange` wiring); `caregiver_profiles.employment_status`
transitions (has real UI in `CaregiverDetail.tsx`); schedule exceptions
correctly feeding both the calendar grid and the timesheet's
`family_cancellation_hours` line item (this was a stale "known gap" in an
older log entry — already resolved by a prior session, reconfirmed current);
`manage_users` permission key properly gates both the RLS policy and the
`More.tsx` UI for household member management.

**Time-entry schedule pre-fill — re-verified, no change.** Same behavior
confirmed every session since 2026-06-30: `Time.tsx` defaults the manual-
entry date to today (`useState(new Date().toISOString().slice(0, 10))`) and
pre-fills start/end/break from the caregiver's scheduled shift for whichever
date is selected via a `useEffect` keyed on `date`/`templates`/
`shiftsByTemplate`, falling back to `09:00`–`17:00` when nothing's scheduled
that day. Asked for again by name in this run's prompt; nothing needed
building.

**Health check:** `npm install`, `npx tsc -b`, `npx oxlint`, and `npx vite
build` all clean — no new TypeScript errors, no new lint warnings beyond the
pre-existing handful unrelated to this session's change.

Q&A items 22-26 and 28-29 were not resolved unilaterally (unchanged from
prior sessions) — re-presented in `QUESTIONS_AND_CLARIFICATIONS.md` alongside
the new item 30 above for a decision.

---
## 2026-08-03 — PTO note/comment fields, `leave_policy_id`, and an in-app Ledger view wired up (spec 13.7/14.5/15.11); reminder copy now uses formatted dates (spec 13.9); time-entry pre-fill re-verified; items 22-26 re-presented, one new judgment call (item 30)

**This session's scope, per the standing recurring-task instructions:** make
progress against the spec in phases, re-verify the time-entry schedule
pre-fill (asked for again by name in this run's prompt), and present open
judgment calls rather than deciding them unilaterally. Ran a fresh, targeted
spec-vs-code audit of `APPLICATION_SPEC.md` §14.5 (PTO Screen), §14.6 (Pay
Screen), §14.7 (Settings Screen), and §13.9's "Example Reminder Copy" against
`src/lib/reminders.ts` — sections prior sessions' change-log entries hadn't
named explicitly — plus a column-usage grep of `leave_requests`/`leave_ledger`
against `src`, the same method item 24's `leave_policies` audit used.

**Four mechanical gaps found and fixed:**

1. **`leave_requests.nanny_note`/`parent_note` were never written.** Spec
   13.7 lists "Note" as a real request field and "Comment" as a real parent
   action; both columns existed in the schema but no form field captured
   either. `PTO.tsx`'s request form, edit form, and the request-detail modal
   now have a Note/Comment input, following the exact `isNanny ? {nanny_note}
   : {parent_note}` pattern `Time.tsx` already uses for its own note field.
   The note is shown on the list row and in the read-only detail view too,
   matching `Time.tsx`'s existing display convention (each viewer sees their
   own role's note, not the counterpart's — consistent with, not a fix to,
   that existing asymmetry).
2. **`leave_requests.leave_policy_id` was never written on insert.** The
   matching policy was already being looked up two lines above the insert
   (for the waiting-period/negative-balance checks) — `PTO.tsx`'s insert now
   sets `leave_policy_id: policy?.id ?? null`. Zero-risk data-completeness
   fix; nothing reads the column yet, but leaving a FK column permanently
   null makes future reporting/joins on it impossible after the fact.
3. **No in-app Ledger view existed**, despite spec 14.5 listing "Ledger" as
   its own bullet under the Parent view (distinct from "Current balance").
   `ledgerEntries` was already being loaded but only ever consumed for
   balance math or gated behind CSV export (nanny has no export access per
   spec 13.11, so a nanny never saw individual ledger lines, only the
   aggregate balance). Added a collapsible "Ledger" card on `PTO.tsx`,
   parent/co-admin only per the spec's view split, listing each entry's
   date, leave type, event type, hours delta, and running balance.
4. **Reminder copy used raw ISO dates**, not spec 13.9's "Example Reminder
   Copy" style ("Jun 22–28", "Aug 14"). `reminders.ts` interpolated
   `period_start`/`start_date`/etc. directly into every message despite the
   rest of the app formatting user-facing dates via `date-fns` (e.g.
   `Schedule.tsx`'s `format(weekStart, 'MMM d')`). Added `formatDate`/
   `formatDateRange` helpers to `reminders.ts` and applied them to every
   date-bearing message in `computeReminders`/`buildWeeklySummaryCards`.
   Cosmetic-only; message wording/logic is unchanged.

**One new judgment call found, not built — see `QUESTIONS_AND_CLARIFICATIONS.md` item 30.**
`leave_requests.start_time`/`end_time` (spec 15.11, optional per spec 13.7)
are dead columns — never set or read anywhere — so a partial-day PTO request
has no way to say *which* hours, only a typed total. Same shape as the
already-resolved-as-"skip for now" item 26 (payment attachment): an
explicitly optional field with a working fallback (a typed hours number) and
no signal yet that a household needs the finer granularity.

**Also checked, no new issue: manual adjustment reachability.** Spec 14.5's
"Manual adjustment" bullet is only reachable today via
`CaregiverDetail.tsx`'s "PTO settings" card, which conflates editing the
recurring policy amount with a one-time correction — the same overlap
already flagged and left open as item 24; not re-opened as a separate item.

**Built unilaterally, not flagged as a judgment call:** all four items above
were either implementing explicit, unambiguous spec text with an obvious
correct shape (the note fields, the FK write, the date formatting) or
directly reusing an already-loaded value with no new design surface (the
Ledger view reuses `ledgerEntries`, which was already being fetched) — same
bar past sessions used for unilateral vs. flagged work.

**Time-entry schedule pre-fill — re-verified, no change.** Same behavior
confirmed every session since 2026-06-30: `Time.tsx` defaults the manual-
entry date to today and pre-fills start/end/break from the caregiver's
scheduled shift for whichever date is selected (falling back to 9am-5pm when
nothing's scheduled that day). Asked for again by name in this run's prompt;
nothing needed building.

**Health check:** `npm install`, `npx tsc -b`, `npx oxlint`, and `npx vite
build` all clean — no new TypeScript errors, no new lint warnings beyond the
same handful of pre-existing `react-hooks/exhaustive-deps`/fast-refresh
warnings prior sessions have already noted.

Q&A items 22-26 were not resolved unilaterally (unchanged from the last three
sessions) — they're re-presented in `QUESTIONS_AND_CLARIFICATIONS.md` and in
the chat message from this session for a decision, alongside items 28-29
(still open from 2026-08-01) and the new item 30 above.

---
## 2026-08-04 — Archived leave requests still leaked into three read paths that weren't updated when 0015 added `archived_at` (bug fix, no spec change)

`Pay.tsx`'s `computePeriodTotals` (the pay-math path) already excluded archived
leave via `.is('archived_at', null)`, per the comment left when 0015 shipped.
Three other places that read `leave_requests` were never given the same
treatment, so an archived PTO/sick/unpaid entry kept showing up everywhere
except the paycheck it was archived to stop affecting:

- `Schedule.tsx`'s `loadLeave` (the weekly schedule view) still queried
  `status in ('approved','requested')` with no `archived_at` filter, so an
  archived request kept rendering its chip on the day it covered.
- `Home.tsx`'s dashboard balance fallback called `computeLeaveBalance` with
  the *unfiltered* `leave_requests` result (unlike `PTO.tsx`, which already
  pre-filters into `unarchivedRequests` before calling the same function) --
  only reachable for a policy with zero ledger rows yet, but wrong when hit.
- `Pay.tsx`'s `exportDetailedRecords` (the daily-detail CSV) queried leave for
  the export period without the filter, so the per-day PTO/sick/unpaid
  columns could show hours a payment record's own period totals no longer
  counted.

Fixed the root cause once instead of patching each call site again:
`computeLeaveBalance` (`lib/leave.ts`) now filters `!r.archived_at` itself, so
no caller can forget it (this also covers the `Home.tsx` case without
touching `Home.tsx`). `Schedule.tsx` and `Pay.tsx`'s CSV query each got the
same `.is('archived_at', null)` `Pay.tsx`'s pay-math query already used.

**Unpaid time off already zeroes out guaranteed-hours pay when it fully
covers the guarantee -- re-verified, not a bug.** A week scheduled/guaranteed
for 12 hours with 12 hours of approved unpaid leave and no other worked/leave
hours produces `guaranteeAdjustmentHours = 0` and `gross_pay_due = 0` today,
because `unpaid_time_off_reduces_guarantee` (`caregiver_profiles`, default
`true`) subtracts unpaid hours from the guarantee base before topping up pay
(`calc.ts`'s `calculateTimesheet`, 16.5). No code change was needed here.

## 2026-08-01 — Reminder cards scoped by role per spec 21 (mechanical fix); targeted audit of onboarding/PTO-timing/reminder-scoping finds two new judgment calls (Q&A items 28-29); time-entry pre-fill re-verified; items 22-26 re-presented

**This session's scope, per the standing recurring-task instructions:** make
progress against the spec in phases, re-verify the time-entry schedule
pre-fill (asked for again by name in this run's prompt), and present open
judgment calls rather than deciding them unilaterally. Ran a fresh, targeted
spec-vs-code audit first, deliberately aimed at spec sections prior sessions'
audits covered less closely (onboarding, PTO deduction timing, reminder
role-scoping, notification copy, validation edge cases) rather than
re-treading the well-covered sections (RLS, exports, guaranteed-hours calc,
PTO ledger mechanics, status chips) — see the audit's findings below.

**Reminder cards now scoped by role, per spec 21 (mechanical, built).** Spec
21 assigns `payment_due`/`payment_overdue`/`pending_timesheet_approval`/
`pending_pto_request` to "parent alert" only — no nanny mention for any of
the four, and each is a "the parent needs to act" case (pay someone, approve
a timesheet or PTO request). `computeReminders()` (`src/lib/reminders.ts`)
previously generated the same cards regardless of viewer role; a nanny
viewing `Home.tsx` after submitting a PTO request, for instance, saw the
"PTO request pending" card meant for the parent who needs to approve it.
Added a `viewerIsNanny` param that filters those four types out for a nanny
viewer (`PARENT_ONLY_REMINDER_TYPES` in `reminders.ts`); `missing_clock_out`/
`unsubmitted_timesheet` (spec grants both nanny-required and parent-optional)
and `upcoming_pto` (spec grants both explicitly) are unaffected, as are
`schedule_change`/`pto_balance_low`/`weekly_summary`, which spec 21 doesn't
scope at all. Low-risk, purely additive filter — built unilaterally since it
directly implements explicit, unambiguous spec text with no design choice
involved (unlike items 28-29 below).

**Two new judgment calls found, not built — see `QUESTIONS_AND_CLARIFICATIONS.md` items 28-29.**

- **Item 28 — onboarding.** Spec 13.1 specifies an 11-step guided parent
  setup (timezone, pay rate, pay frequency, guaranteed hours, PTO policy,
  schedule, reminders, etc.); `Onboarding.tsx` only ever collects household
  name and optionally nanny name + hourly rate. Every other setting has a
  real, working UI elsewhere in the app (`More.tsx`, `CaregiverDetail.tsx`,
  `Schedule.tsx`) — nothing is missing functionally, it's just not funneled
  into one first-run flow, so a new household lands on Home with mostly-
  default settings and has to discover each screen on its own.
- **Item 29 — PTO deduction timing.** Spec 13.7 lists deduction timing as
  configurable among three options and gives an explicit recommended
  default ("show pending impact on approval, finalize on timesheet
  approval"). `PTO.tsx`'s `applyUsedLedger()` instead makes an immediate,
  final ledger deduction at approval time, with no "pending" state, no
  timesheet-approval-triggered finalization, and no settings UI for the
  other two timing options at all — the configurability itself was never
  built, and the one behavior that exists doesn't match the spec's stated
  recommendation.

Neither was built unilaterally: item 28's fix has three genuinely different
shapes (do nothing / add a setup checklist / full wizard rebuild) and item 29
would change an already-relied-upon number's timing for every household
using the app today, which isn't a call to make without a response, unlike
last session's item 27 (unambiguous recommendation, zero-risk fill-in).

**Audit also checked and found no new issues in:** RLS/permissions, audit
log, exports, guaranteed-hours calc, pay settings/frequency, PTO ledger
mechanics, status chips, timezone/DST handling — these matched the spec
closely on inspection.

**Time-entry schedule pre-fill — re-verified, no change.** Same behavior
confirmed every session since 2026-06-30: `Time.tsx` defaults the manual-
entry date to today and pre-fills start/end/break from the caregiver's
scheduled shift for whichever date is selected (falling back to 9-5 when
nothing's scheduled that day). Asked for again by name in this run's prompt;
nothing needed building.

**Health check:** `npm install`, `npx tsc -b`, `npx oxlint`, and `npx vite
build` all clean — no new TypeScript errors, no new lint warnings beyond the
handful of pre-existing `react-hooks/exhaustive-deps`/fast-refresh warnings
unrelated to this change.

Q&A items 22-26 were not resolved unilaterally (unchanged from the last two
sessions) — they're re-presented in `QUESTIONS_AND_CLARIFICATIONS.md` and in
the chat message from this session for a decision, alongside the two new
items above.

---

## 2026-07-31 — `paid_if_family_canceled` template default wired up (spec 15.6), resolves Q&A item 27; time-entry pre-fill re-verified; items 22-26 re-presented

**This session's scope, per the standing recurring-task instructions:** make
progress against the spec in phases, re-verify the time-entry schedule
pre-fill (asked for again by name in this run's prompt), and present the
still-open Q&A items (22-26) for a decision rather than resolving them
unilaterally. Q&A item 27 (found in the 2026-07-30 audit) was the one
exception — see below for why.

**`schedule_shifts.paid_if_family_canceled` wired up (spec 15.6, Q&A item 27,
option B).** Built unattended (nobody available in chat this session) because
both of item 27's sub-decisions had an unambiguous, low-risk recommendation,
unlike items 22-26 which explicitly have none or call for a real product
choice. `Schedule.tsx`'s Add Shift form now has a "Paid if family cancels this
shift" checkbox (default on, matching the column default), written by all
four recurring shift-insert call sites (weekly/biweekly/monthly/custom — the
one-time option inserts a `schedule_exceptions` row directly, not a
`schedule_shifts` row, so it doesn't apply there). `family_cancellation` is
now one of the exception types that can reference an "Original shift" in the
day-detail exception form (previously only the shift-modification types
could); it auto-selects the day's shift when there's exactly one. Choosing
"Family cancellation" as the exception type, or changing which shift it
references, now defaults the exception's own "Affects pay" checkbox from that
shift's `paid_if_family_canceled` — still a plain checkbox the parent can
override per-exception afterward, so a household that always overrides isn't
worse off, and one that doesn't saves the tap. Linking the original shift
also lets `exceptionHours()` (`src/lib/schedule.ts`) fall back to the
canceled shift's own duration when no explicit hours or time range is given,
which family-cancellation exceptions couldn't do before (they had no shift
link at all). `default_category` was left unbuilt (option A) — nothing in the
spec defines what shift category should affect, so there's nothing to wire it
to yet; see `QUESTIONS_AND_CLARIFICATIONS.md` for the full resolution note.

**Time-entry schedule pre-fill — re-verified, no change.** Same behavior
confirmed every session since 2026-06-30: `Time.tsx` defaults the manual-entry
date to today and pre-fills start/end/break from the caregiver's scheduled
shift for whichever date is selected (falling back to 9-5 when nothing's
scheduled that day). Asked for again by name in this run's prompt; nothing
needed building.

**Health check:** `npm install`, `npx tsc -b`, `npx oxlint`, and `npx vite
build` all clean — no new TypeScript errors, no new lint warnings beyond the
handful of pre-existing `react-hooks/exhaustive-deps`/fast-refresh warnings
unrelated to this change.

Q&A items 22-26 were not resolved unilaterally — they're re-presented in
`QUESTIONS_AND_CLARIFICATIONS.md` and in the chat message from this session
for a decision.

---

## 2026-07-30 — Health check + targeted spec audit (reminders/RLS/audit-log/acceptance-criteria sections), one new gap found, no code changes

**This session's scope, per the standing recurring-task instructions:** verify
the app still builds cleanly, do a fresh but efficient audit pass (30 prior
sessions have already covered the spec close to exhaustively, so this one
targeted sections least recently touched rather than re-reading everything),
re-confirm the time-entry schedule pre-fill behavior once more (asked for
again in this run's prompt), and surface the 5 already-open Q&A items (22-26)
for a decision rather than resolving them unilaterally, since this run's
instructions asked to present them and wait rather than auto-pick the
recommended option as a couple of past unattended runs did.

**Health check:** `npm run build` (tsc -b && vite build) and `npm run lint`
both clean — no new TypeScript errors, no new lint errors (the handful of
existing `react-hooks/exhaustive-deps` / fast-refresh warnings predate this
session and are unrelated to spec compliance).

**Audit (delegated, sections 13.9/21 reminders, 17 status rules, 18/19
authorization/RLS, 20 audit log, 24 acceptance criteria, 25 recommended
defaults):** one genuinely new gap found —

**`schedule_shifts.paid_if_family_canceled` and `.default_category` (spec
15.6) are dead columns.** Both exist in the schema (migration 0001) and
`types.ts`, matching spec exactly, but nothing in `src` ever sets them on
insert (the four shift-insert call sites in `Schedule.tsx` all leave them at
the DB default) or reads them anywhere. In practice, family-cancellation pay
is decided per-exception via `schedule_exceptions.affects_pay` instead of a
per-shift-template default, and shift "category" (regular/holiday/special/
occasional) has no effect on pay rate or display anywhere. Not a crash or
regression — the feature these two columns imply (templated per-shift
defaults for cancellation pay and categorization) was simply never built.
Opened as Q&A item 27 rather than built blind: `default_category`'s allowed
values and intended effect aren't specified anywhere past the column
default, and `paid_if_family_canceled` overlaps with the existing per-
exception `affects_pay` flag in the same shape as the already-open item 24
redundancy (two settings, unclear precedence), so it's a judgment call, not
a mechanical fill-in.

Two more columns came back unused in the same sweep but are too minor to
warrant a Q&A item: `users.last_login_at` and `household_users.invited_at`
(migration 0001) — neither is tied to any spec acceptance-criteria bullet or
UI requirement, they just aren't populated. No action taken; noting for
completeness only.

Everything else checked (audit-log event coverage against spec 20's 13-item
list, RLS helper-function coverage against spec 18/19, status-rule handling
against spec 17, the spec 24 acceptance-criteria checklist, spec 25
recommended defaults) matched the current implementation with no new
discrepancies.

**Time-entry schedule pre-fill — re-confirmed once more, still no change
needed.** `Time.tsx:50` defaults the date field to today; the effect at
`Time.tsx:116-128` pre-fills start time, end time, break minutes, and
`schedule_shift_id` from the caregiver's scheduled shift for whatever date
is selected, falling back to a 9-5 default when nothing's scheduled. This is
the same behavior confirmed in essentially every session since it was first
built 2026-06-30 — flagging again here since this run's prompt asked for it
by name, but treating it as re-verification, not new work.

No code changes this session beyond documentation (this entry, plus Q&A item
27). The 5 already-open Q&A items (22-26) were not resolved unilaterally —
see `QUESTIONS_AND_CLARIFICATIONS.md` and the chat notification sent this
session for the decision to make.

---

## 2026-07-29 — iOS-style swipe actions on Time / PTO / Timesheets / Payments; PTO archivable from any status; timesheet approval creates its payment record

**Requested behaviour:** archive PTO even once it's approved, and give the
four record lists iOS list semantics — swipe left for archive, swipe right to
approve, tap for a detail sheet where the record can be edited.

**1. New `src/components/SwipeRow.tsx`.** One gesture component behind all
four lists rather than per-screen handlers. Drag left parks the row open over
its trailing actions (archive/restore) so the action still has to be tapped;
drag right reveals the leading action and a *full* swipe fires it outright,
matching iOS Mail. Notes on the implementation, all of which are load-bearing:

* `touch-action: pan-y` on the moving element — the component owns the
  horizontal axis and leaves vertical scrolling to the browser, so a list
  still scrolls normally when the finger starts on a row.
* An axis lock after 8px of travel decides swipe-vs-scroll once per gesture.
* `pointermove` fires for a hovering mouse with no button down, so the
  handler is gated on a `pressed` ref set at `pointerdown`. Without it,
  moving the cursor across a row dragged it open.
* The settle decision reads the offset from a ref, not from state, so it
  can't act on a value one render behind the last move.
* A module-level registry keeps only one row open at a time, list-wide.
* Actions are real `<button>`s in the DOM at all times (just clipped), and
  the row content carries `role="button"` + Enter/Space, so nothing here is
  reachable only by gesture. Every swipe action also stays available as a
  normal button inside the detail sheet.

**2. Tap-to-detail replaces the inline edit forms.** `Time.tsx` and `PTO.tsx`
previously swapped a list row in place for an edit form; both now open a
`Modal` detail sheet carrying the same form plus that record's actions.
Timesheets and payments previously expanded inline to show `HoursBreakdown`
and had no detail view at all; they now open the same kind of sheet.

**3. PTO can be archived from any status, and archiving now moves the
balance.** The Archive control used to be rendered only for `approved`
requests, and migration `0015_leave_request_archive.sql` deliberately defined
archiving as display-only ("hides a settled request … without touching status
or the ledger"). That reading doesn't survive the request here: if a parent
archives an approved PTO entry because the leave never happened, the hours
have to come back, otherwise the balance keeps counting leave that isn't on
the list any more and nothing on screen explains the difference. So archiving
an approved request now posts a balancing `reversal` to `leave_ledger`, and
unarchiving posts a `correction` that re-applies it. **This is a deliberate
departure from 0015's comment, not an oversight.** No migration is needed —
both event types already exist and the existing `leave_requests_update` /
`leave_ledger_insert_manager` policies already permit it.

The netting helper this introduced (`zeroOutLedgerForRequest`) sums *all* of
a request's ledger rows per policy and posts one balancing entry, replacing
the old `adjustLedgerForEdit`, which reversed each `used` row it found and so
double-reversed a request that was edited twice. Rejecting a
previously-approved request now returns its hours too — it didn't before.

Two consequences of archived leave no longer counting: `computeLeaveBalance`'s
request-based fallback is fed unarchived requests only, and `Pay.tsx`'s period
math filters approved leave with `.is('archived_at', null)`, so an archived
request is no longer paid out on the next timesheet.

**4. Approving a submitted timesheet now does what spec 13.5 says.** Swipe-right
on a timesheet needed a real approval to run, and there wasn't one: a
nanny-submitted timesheet (`Pay.tsx handleSubmitTimesheet`, which writes only
raw worked hours with zeros everywhere else) sat at `submitted` forever with no
UI path out. Spec 13.5's Parent Workflow steps 4-6 are explicit — approve,
recalculate payable hours and gross pay, create the payment record — so
`approveTimesheet` now recomputes the period from its time entries, leave and
schedule exceptions, writes the full hour breakdown onto the timesheet, and
inserts the payment record (skipped if a live one already exists, so
re-approving can't double-pay). `doGenerate`'s calculation was extracted to
`computePeriodTotals` + `timesheetHourFields`/`paymentRecordFields` so both
paths compute identically rather than by parallel copies.

**5. Payments can be archived independently.** `payment_records.deleted_at`
existed but was only ever set as a side effect of archiving the timesheet,
leaving no way to clear a payment raised in error without losing the timesheet
behind it. Added `setPaymentArchived` plus an "Archived payments" section
mirroring the timesheet one. Restoring a timesheet still restores its payments.

**6. Dropped the `window.confirm` on archiving a timesheet.** It was the only
one of the four lists that prompted, and a modal on every swipe defeats the
gesture. Archiving is a soft delete with a visible Restore in all four lists.

---

## 2026-07-29 — Guaranteed-hours policy settings, nanny visibility settings, payment method label, reimbursements/manual adjustments, private notes, schedule-shift linking (fresh line-by-line spec audit)

**Fresh line-by-line pass over `APPLICATION_SPEC.md` against current `src/`
and `supabase/`**, per this session's instructions to look past the
2026-07-28 entry's "no known gaps" and re-verify areas not explicitly
re-checked in several recent entries. Method: cross-referenced every table in
spec section 15 field-by-field against `src/lib/types.ts` and the
migrations, then grepped every resulting field name across `src` (excluding
`types.ts`) to find columns that are typed but never read or written
anywhere. This surfaced several real gaps that prior audits' spot-checks
("data model matches spec 15 field-for-field," 2026-07-28) hadn't caught
because the fields *exist* and match the spec's type/default — they're just
never wired into any calc or UI. Six unambiguous gaps closed this session;
three larger, judgment-call gaps opened as new Questions & Clarifications
items (24-26) rather than built.

**1. PTO/sick/holiday "counts toward guaranteed hours" now actually gates
the guarantee calc (spec 13.6, 16.4).** Spec 16.4 states outright: "Whether
each leave/family cancellation category counts should depend on policy
settings." `family_cancellation_counts_toward_guarantee` already worked this
way (`Pay.tsx`, zeroing `cancellationHours` when off, since 2026-07-02), but
`caregiver_profiles.pto_counts_toward_guarantee`/`sick_counts_toward_guarantee`/
`holiday_counts_toward_guarantee` were typed columns the calc engine never
read (confirmed via the grep sweep above) — `calculateTimesheet` always
summed `paidPtoHours + paidSickHours + paidHolidayHours` unconditionally
into `actual_paid_hours`, regardless of the flags. `src/lib/calc.ts:14-27`
adds `ptoCountsTowardGuarantee`/`sickCountsTowardGuarantee`/
`holidayCountsTowardGuarantee` to `TimesheetCalcInput`; `calc.ts:75-79` gates
each category's contribution to `actualPaidHours` (the number that offsets
how much guarantee top-up is owed) on its flag, while leaving
`payableRegularHours`'s unconditional inclusion of the same hours untouched
— a category excluded from the guarantee calc is still fully paid as its own
leave line, it just stops offsetting the guarantee shortfall. `Pay.tsx`'s
`doGenerate` (~line 313-324) now passes all three flags from
`activeCaregiver`.

**2. All five guaranteed-hours policy toggles now have settings UI for the
first time (spec 13.6).** Beyond the three above, `unpaid_time_off_reduces_guarantee`
and `family_cancellation_counts_toward_guarantee` were already *read* by the
calc engine but had **no UI anywhere** to change them away from their DB
defaults — confirmed by grepping for each field name being *assigned* (not
just read) anywhere in `src`; there were zero hits for any of the five.
`CaregiverDetail.tsx`'s "Pay settings" card now has a "What counts toward
meeting the guarantee" checkbox group (rendered inside the existing
`guaranteedEnabled` block) for all five flags, wired into `handleSave`'s
update payload. All five are already covered by the `edit_guaranteed_hours_policy`
RLS restriction trigger (migration `0002_rls.sql`'s
`enforce_caregiver_profile_restrictions`, which already checked
`unpaid_time_off_reduces_guarantee`/`family_cancellation_counts_toward_guarantee`/
`pto_counts_toward_guarantee`/`sick_counts_toward_guarantee`/
`holiday_counts_toward_guarantee` — the trigger was ahead of the UI), so no
RLS change was needed.

**3. Nanny visibility flags (`nanny_can_view_*`) are now actually settable
(spec 11/15.4).** The 2026-07-26 (part 2) session enforced these four flags
(gating what a nanny sees), but the same grep sweep found **none of them
were ever assigned anywhere except the DB column default** — there was no
settings surface at all, so a household could never turn any of them off (or
back on) after the row was created. `CaregiverDetail.tsx` has a new "Nanny
visibility" card (`toggleVisibilityFlag`, ~line 329) with one instant-toggle
checkbox per flag (`NANNY_VISIBILITY_FLAGS`, ~line 26-38), following the same
"toggle immediately + audit log" pattern as `More.tsx`'s co-admin permission
checkboxes rather than a buffered form, since each flag is independent.

**4. Payment method label + its nanny-visibility flag (spec 13.8).**
`caregiver_profiles.payment_method_label` and `payment_records.payment_method_label`
have existed since migration 0001 (with a check constraint and RLS coverage
under the `edit_pay_rate` restriction group) but were **never set or
displayed anywhere** — the only reference in `src` was reading it back out
in the full-records export. Spec 13.8 lists both "Payment method label" and
"Whether nanny can view payment method label" as Pay Settings, the latter of
which had no backing column at all. Closed both:
  - Migration `0016_nanny_can_view_payment_method.sql` adds
    `caregiver_profiles.nanny_can_view_payment_method boolean not null
    default true` (defaults true like `nanny_can_view_gross_pay`/
    `nanny_can_view_pto_balance`/`nanny_can_view_guaranteed_hours` — only
    `nanny_can_view_pay_rate` defaults false, since a payment-method label
    like "Zelle" isn't as sensitive as the raw dollar rate). Added to
    `NANNY_VISIBILITY_FLAGS` above.
  - `CaregiverDetail.tsx`'s Pay settings form gained a "Payment method"
    select (the 7 spec'd values + "Not set"), saved through the existing
    `edit_pay_rate`-gated update.
  - `Pay.tsx`'s `doGenerate` now copies `activeCaregiver.payment_method_label`
    onto every new `payment_records` row (and the correction-insert path
    carries it forward from the original, `Pay.tsx` ~line 654), and the
    Payments list row now shows it (gated by `showPaymentMethod`, `Pay.tsx:171`)
    next to the due date/amount. A shared `formatPaymentMethod` helper
    (`src/lib/payPeriod.ts`) replaces what would otherwise be a second
    display-label map, so `CaregiverDetail.tsx`'s select and `Pay.tsx`'s row
    can't drift out of sync on wording.

**5. Reimbursements and manual adjustments are now actually settable (spec
13.8, 14.6 "Add adjustment", 16.8).** `calc.ts`'s gross-pay formula has
always added `reimbursements + manualAdjustments` in (16.8's literal
formula), and both are real columns on `timesheets`/`payment_records` — but
`Pay.tsx`'s `doGenerate` hardcoded both to `0` at every call site, so neither
could ever be nonzero except by copying an already-nonzero value forward
during a payment correction (impossible to bootstrap — there was no path to
create the first nonzero value). `Pay.tsx`'s "Generate timesheet" form now
has two optional dollar inputs (~line 1006-1029) feeding `reimbursementsAmount`/
`manualAdjustmentsAmount` (~line 314) into `calculateTimesheet` and both
inserts. **Not built:** a standalone "Add adjustment" action on an
already-generated, not-yet-paid payment record (spec 14.6 lists it as its
own Pay Screen action, separate from generation time) — a parent who
discovers a reimbursement is owed after generating can still add it by
archiving and regenerating the timesheet (which cascades to its payment
record per the existing archive behavior), so this isn't a hard blocker, but
a direct "edit this due payment's adjustments" action wasn't added; flagged
here rather than assumed equivalent, though not judged ambiguous enough to
need its own Q&A item (it's a smaller, clearly-scoped follow-on to what
shipped here).

**6. `time_entries.schedule_shift_id` now populated (spec 15.8).** This
column has existed since migration 0001 as an explicit "Scheduled shift ID,
optional" field, but nothing in `src` ever wrote to it — confirmed via the
same grep sweep. `Time.tsx`'s existing schedule pre-fill effect (unchanged
logic, just now also captures the matched shift's id, `Time.tsx:58,111-125`)
threads it through to both the manual-entry insert (`Time.tsx:163`) and
clock-in (`Time.tsx:213-218`, which now also looks up today's scheduled
shift, something it never did before). The link is by date/occurrence match,
not by whether the logged times exactly equal the scheduled times — an
entry stays linked to "the shift scheduled for this date" even if the
nanny/parent edits the pre-filled hours, consistent with how the rest of the
app already treats manual edits as expected/normal (spec 13.4's validation
warnings, not blocks).

**7. Caregiver private notes now have a read/write UI (spec 15.4
`notes_private` / 18 "employer-only notes").** The dedicated
`caregiver_private_notes` table (a separate table rather than a column,
specifically so RLS can exclude the nanny role entirely — see its comment in
migration 0001) and its `CaregiverPrivateNote` TS type have existed with full
RLS since the beginning, but no screen ever read or wrote a row. Added a
"Private notes" card to `CaregiverDetail.tsx` (~line 532, parent/co-admin
only since the whole page already blocks nanny access) with a textarea
upserting the existing table — no migration needed, RLS was already correct.

### New Questions & Clarifications items opened (not built, by design)

Three larger areas turned up in the same audit that genuinely need a
decision rather than a silent pick — see `QUESTIONS_AND_CLARIFICATIONS.md`
for full option sets:

- **Item 24 — leave-policy accrual automation and per-policy settings**
  (`per_hour_worked`/`per_pay_period`/`monthly` accrual, balance/carryover
  caps, reset dates, and `leave_policies.counts_toward_guarantee`/
  `visible_to_nanny`, which appear to duplicate the caregiver-level flags
  item 1-3 above just wired up). Blocked on both a serverless-trigger design
  question (no cron for "monthly" accrual) and resolving the apparent
  two-settings-one-concept redundancy.
- **Item 25 — timesheet reject/request-correction workflow doesn't exist**
  at all (spec 11/13.5/14.3/17): the nanny's "submit" and the parent's
  "generate" are two disconnected flows, so there's no way to actually
  approve or send back a submitted timesheet with a correction note today.
  Fixing it properly means deciding whether to merge the two flows, which
  touches the core pay-approval data path.
- **Item 26 — payment record attachment/photo** (spec 13.8): the column has
  existed since migration 0001, but the app has zero Supabase Storage
  integration to build on; recommended to skip unless a household actually
  asks for it.

### Time-entry schedule pre-fill — re-verified with actual scenario testing, one small addition, no bugs found

Per this session's explicit instruction to exercise (not just re-read)
`Time.tsx`'s pre-fill effect: traced both the caregiver-switch case and the
overnight-shift case by hand.
- **Switching caregivers (parent view):** `CaregiverSelect` changes
  `caregiverId` → the `loadSchedule` effect (`Time.tsx:103-105`) re-fetches
  that caregiver's `schedule_templates`/`schedule_shifts` → since the
  pre-fill effect (`Time.tsx:111-125`) depends on `templates`/
  `shiftsByTemplate`, it re-runs automatically once the new caregiver's
  schedule loads and re-derives start/end/break for the already-selected
  date. Confirmed correct — no stale pre-fill from the previous caregiver.
- **Overnight shift (e.g. a shift scheduled 22:00-06:00):** the effect sets
  `startTime`/`endTime` directly from the shift's stored `start_time`/
  `end_time` with no duration math of its own; `hoursBetween` (`calc.ts:106`)
  already adds 24h when `end < start`, so the paid-hours preview and the
  saved `paid_hours` come out correct. Confirmed correct.
- **Multiple shifts scheduled the same day (e.g. a split shift):** the
  effect only pre-fills from `occurrences[0]`, silently ignoring any other
  shift scheduled for the same date. This is an inherent limitation of a
  single start/end/break form (there's nowhere to put a second shift's
  hours), not a bug in the pre-fill logic itself, and the spec's manual-entry
  field list (13.4) doesn't call for multi-segment entries either — not
  treated as a gap.
- **Missing link:** while tracing this, found `schedule_shift_id` (spec
  15.8) was computed as part of the pre-fill (the matched shift was right
  there) but never saved — closed as gap #6 above, since it's a direct,
  low-risk extension of code this verification pass was already reading
  closely.

No bug found in the core pre-fill/default-to-today behavior itself; the one
change made (`schedule_shift_id` linking) is additive and doesn't alter any
existing pre-fill value.

---

## 2026-07-28 — Home screen "Today" and "This Week" cards (spec 14.1/14.2), fresh spec-vs-app audit

**Fresh pass over `APPLICATION_SPEC.md` against the current app**, as invited
by the 2026-07-27 entry below ("no known gaps currently tracked... future
phases should come from a fresh pass"). Confirmed all previously-resolved
decisions are still correctly implemented (all 10 reminder types wired up,
all 6 export types present, time-entry schedule pre-fill still working, data
model matches spec 15 field-for-field on every table spot-checked, status
chip set matches spec 22). One real gap found and closed this session; one
already-known deliberate simplification (calendar month/day view) was
reconsidered but left as-is pending a decision — see
`QUESTIONS_AND_CLARIFICATIONS.md`.

**Home screen now has "Today" and "This Week" cards (spec 14.1/14.2),
closing a gap that had no prior write-up.** `Home.tsx` previously rendered
only a generic 2x2 stat-tile grid (Time/Schedule/PTO/Pay, each just a nav
shortcut) plus the reminder feed -- there was no surface anywhere showing
"is the caregiver clocked in right now," which spec 22 calls out as the
single thing a parent should see immediately, and no "Current Week" card at
all despite `StatusChip.tsx` already having unused `scheduled`/`clocked_in`/
`missing_clock_out` color variants defined for exactly this purpose.

- **"Today" card** -- one row per caregiver (just the caregiver's own row for
  a nanny), showing either "Clocked in since HH:MM" (green `clocked_in`
  chip, or amber `missing_clock_out` if the reminders engine has already
  flagged that same entry -- reused via entry ID rather than re-deriving the
  schedule-aware grace-period logic a second time), "Scheduled H:MM AM–H:MM
  PM" (blue `scheduled` chip) if a shift exists today but no active
  clock-in, or "No shift scheduled today" with no chip.
- **"This Week" card** -- one row per caregiver: scheduled hours (recurring
  shifts + net exception delta for the calendar week), actual hours logged,
  guaranteed hours, and a status chip for the timesheet whose period
  contains today (or none, if not yet generated). Guaranteed hours is
  intentionally omitted when `guaranteed_hours_basis = 'fixed_pay_period'`
  (a biweekly fixed guarantee shown as "this week's number" would overstate
  it -- there's no way to prorate a period guarantee onto a single week
  without inventing a rule the spec doesn't specify), and respects
  `nanny_can_view_guaranteed_hours` for a nanny viewer, same gating as the
  timesheet/payment breakdown added 2026-07-27.
- **Deliberately excluded: "estimated payable hours."** Spec 14.1 lists it as
  a Current Week field, but a real payable-hours number needs PTO/sick/
  holiday/family-cancellation hours and the overtime split, which are only
  authoritative once run through `calc.ts` over the caregiver's actual pay
  period (frequently biweekly, rarely aligned to a calendar week) -- the
  same reasoning that already kept a regular/OT split out of the
  `weekly_summary` digest (2026-07-25 entry). A second approximation here
  risked quietly disagreeing with Pay.tsx's number for the same caregiver.
- **Refactor:** `computeGuaranteedHoursBase` moved from a local function in
  `Pay.tsx` to an exported helper in `lib/schedule.ts` so Home.tsx's weekly
  estimate and Pay.tsx's authoritative per-period calc share one
  implementation instead of two copies that could drift.
- Home's data load now fetches schedule shifts/exceptions across the full
  current calendar week (previously just the trailing 2 days, sized only for
  the missing-clock-out reminder) -- widened to `min(week start, today - 2
  days)` through the week's end so both the existing reminders and the new
  cards share one fetch.

**Not built this session, flagged for a decision instead:** whether to
build a real month view for the Calendar (spec 13.10/14.4, still week-grid
only per Q&A item 8) and whether to take the Home screen further toward
spec 14.1/14.2's literal 5-card/primary-button layout beyond what shipped
above. Both re-opened as new Questions & Clarifications items rather than
decided unilaterally, since this session's instructions asked for open items
to be surfaced for a decision rather than picked silently.

**Time-entry schedule pre-fill -- re-verified once more, still no change
needed.** `Time.tsx:48` defaults the date field to today;
`Time.tsx:111-121`'s effect pre-fills start/end/break from the scheduled
occurrence for whatever date is selected. Unchanged since 2026-06-30.

### Known gaps for next phase

None beyond the two items above awaiting a decision in
`QUESTIONS_AND_CLARIFICATIONS.md`.

---

## 2026-07-27 — Guaranteed-hours line item on timesheets/payments (spec 13.6), closes the last tracked known gap

**Guaranteed-hours breakdown now rendered (spec 13.6 "Timesheet Display for
Guaranteed Hours").** `guaranteed_hours` and `guarantee_adjustment_hours` were
computed and stored on every `timesheets`/`payment_records` row since the
calc engine was built, but no screen ever displayed either number — flagged
as the last open "known gap" in the 2026-07-26 (part 2) entry. `Pay.tsx`'s
Timesheets and Payments cards are now tappable: tapping a row expands an
inline breakdown grid (actual worked, regular, overtime, paid PTO/sick/
holiday, family cancellation, guaranteed hours, guarantee adjustment, payable
regular/overtime — the fields spec 13.6's example table and 13.5's timesheet
footer both list) instead of adding a bespoke calendar/detail page, since the
data already lives on the row being tapped.

**Gating follows the existing `nanny_can_view_guaranteed_hours` flag (spec
11/15.4), not a blanket hide.** Only the "Guaranteed hours" and "Guarantee
adjustment" rows are omitted from the breakdown when a nanny's caregiver has
that flag off — every other row (worked/PTO/sick/holiday/family-cancellation/
payable hours) is spec'd as ordinary timesheet content, not gated by that
flag, so hiding the whole breakdown would have been an over-restriction.
Gross pay in the row header still follows the existing `showGrossPay`/
`nanny_can_view_gross_pay` gate, unchanged. `activeCaregiver` (used to read
both flags) already resolved correctly for both roles before this change.

**Time-entry schedule pre-fill — re-verified once more, still no change
needed.** This run's task again asked for time entries to default to the
caregiver's scheduled hours (falling back to the current day); `Time.tsx`
already does this (see 2026-06-30 and every re-check since). No gap.

**Housekeeping: prior branch had already merged as PR #49.** This session's
designated branch (`claude/practical-ramanujan-93an5c`) was found already
merged into `main` (its HEAD was exactly `main`'s merge commit for PR #49),
so per the standing instruction for that situation, the branch was reset to
restart from latest `main` before this phase's work rather than stacking new
commits on already-merged history. No functional change from this, just
noted for continuity of the branch/PR history in this log.

### Known gaps for next phase

None currently tracked. Every gap listed across prior "Known gaps" sections
(recurring schedule types, co-admin permission UI, per-key permission
enforcement, `nanny_can_view_*` enforcement, reminder settings + weekly
summary, additional exports, schedule exceptions UI, time-entry validation,
and now this guaranteed-hours display) has been closed. Future phases should
come from a fresh pass over `APPLICATION_SPEC.md` against the current app,
or from user-directed feature requests.

---

## 2026-07-26 (part 2) — Enforce `nanny_can_view_*` visibility flags (spec 11/15.4), resolves Q&A item 20

**Nanny visibility flags now enforced**, closing the gap flagged in the
2026-07-25 entry below and resolved as Q&A item 20 **option A** (enforce
them) in chat.

- **`nanny_can_view_pay_rate` and `nanny_can_view_guaranteed_hours`** — the
  only screen that ever displayed either value was `CaregiverDetail.tsx`
  (the pay-rate field and guaranteed-hours-basis settings), and it had no
  role gate at all: a nanny navigating directly to `/caregiver/:id` could see
  the full parent settings page (RLS already blocked their writes, but
  reads/UI were wide open). Rather than mask individual fields on what is
  fundamentally a parent-settings page, `CaregiverDetail.tsx` now redirects a
  nanny to `/` outright (`<Navigate to="/" replace />`, matching the existing
  `AuditLog.tsx` pattern) — this is also just correct per spec 11 ("Nanny
  cannot access settings for pay, PTO policy, guaranteed hours")
  independent of the specific flags. This was the only surface displaying
  either value, so blocking it fully resolves both flags.
- **`nanny_can_view_gross_pay`** — `Pay.tsx`'s Payments and Timesheets list
  cards showed `gross_pay_due` unconditionally to any viewer, nanny
  included. A new `showGrossPay` (`!isNanny ||
  activeCaregiver?.nanny_can_view_gross_pay !== false`) hides the dollar
  amount (replaced with "amount hidden" on the payments row; simply omitted
  on the timesheets row, where hours worked stays visible) when off.
  Parent/co-admin views are never gated by this flag — it only restricts the
  nanny's own view.
- **`nanny_can_view_pto_balance`** — `Pto.tsx`'s "Balances" card showed
  PTO/sick balances unconditionally. Same pattern: a `showPtoBalance` flag
  replaces the balance bars with a "Balance hidden by household settings."
  message for a restricted nanny.
- **Weekly summary card (`Home.tsx`, added 2026-07-25)** —
  `buildWeeklySummaryCards` now takes a `viewerIsNanny` flag and omits the
  gross-pay-due and PTO/sick-remaining parts of a caregiver's summary line
  when that caregiver's own flags say not to show them to their nanny. A
  parent/co-admin viewing the same card always sees the full summary.

**Not touched: guaranteed-hours *totals* (13.6's guarantee-adjustment line
item).** Beyond the settings page just blocked above, no screen in the app
currently renders a caregiver's computed guaranteed-hours or
guarantee-adjustment number anywhere — not to the nanny, not to the parent
either. There's nothing to gate yet for that half of
`nanny_can_view_guaranteed_hours` beyond the settings-page fix, since the
number itself isn't displayed anywhere. Flagged here rather than silently
assumed handled; building that display (spec 13.6's timesheet line item) is
its own known gap, independent of this visibility-flag work.

**Q&A item 21 (`export_records` enforcement) resolved as option A — no code
change.** Chosen in chat: keep the client-side-only gate built 2026-07-26
(see below), since it was already built that way and no alternative was
requested.

### Known gaps for next phase (unchanged)

- **Guaranteed-hours line item on timesheets/payments** (spec 13.6) —
  `guaranteed_hours`/`guarantee_adjustment_hours` are computed and stored on
  every timesheet/payment record but never rendered as a line item anywhere
  in the UI, for either role.

---

## 2026-07-25 — Reminder settings + weekly summary digest (spec 13.9/15.14), resolves Q&A item 19

**Weekly summary digest built.** `computeReminders`'s companion
`buildWeeklySummaryCards` (`src/lib/reminders.ts`) produces one `weekly_summary`
card per caregiver on `Home.tsx`, content per the option chosen for Q&A item
19 (option B, picked without a live chat round-trip since this session ran
unattended on a schedule -- see the Q&A file for the full option set and why
B was recommended): hours logged so far this calendar week, the status of
whatever timesheet's period contains today (or "not yet generated"), the
next unpaid payment's amount and due date, and PTO/sick balance remaining
(`pto`/`sick` leave types only, matching the existing balance card on
`Pto.tsx`). Recomputed live on every `Home.tsx` load rather than cached and
shown once per week -- since its numbers are already scoped to "the calendar
week containing today," they naturally roll over at the week boundary with
no extra state needed, so the "refreshed the first time the app is opened
each week" language in the recommendation didn't require any actual caching
mechanism once implemented.

**Deliberately excluded from the digest: a regular/overtime hours split.**
The recommendation's example copy ("Y regular + Z overtime") implied one,
but that split is only authoritative once run through the real payroll
engine (`calc.ts`) over a caregiver's actual pay period -- which can be
biweekly and doesn't line up with a calendar week for most households. Doing
a second, simplified regular/OT split here risked quietly disagreeing with
the number `Pay.tsx` shows for the same caregiver. Total hours logged this
week (unsplit) avoids that, at the cost of being a slightly thinner digest
than literally described.

**Per-reminder-type enable/disable settings built**, using the `reminders`
table exactly as already defined in migration 0001 -- no new migration
needed. Each row is scoped to `(household_id, recipient_user_id, type)`; a
new "Reminder settings" card in `More.tsx` (Parent Admin/Co-Admin only, per
spec 13.9 "Parent can configure") lists all ten reminder types from spec
15.14 with a checkbox each, defaulting to enabled when no row exists yet.
`recipient_user_id` is always the signed-in user making the change -- there's
no UI to configure reminders on behalf of someone else. This follows the
"recipients" concept (who else could receive a given type) already being out
of scope per item 17's resolution, which deferred it until there's an
email/SMS delivery channel to target; today, "recipients" collapses to just
"the person configuring their own view." `Home.tsx` now loads the signed-in
user's `reminders` rows alongside its other data and passes a `disabledTypes`
set into `computeReminders` (which filters its output by it) and skips
`buildWeeklySummaryCards` entirely when `weekly_summary` is disabled.

Closes both remaining pieces of the "Reminder settings" / "`weekly_summary`
digest" known gap. The other previously-listed known gap -- per-key
permission enforcement for the rest of the role matrix (approve timesheet /
mark payment / approve PTO / export records) -- is unchanged; see "Known
gaps" below.

### New gap noticed while building this: `nanny_can_view_*` flags are stored but never read

`caregiver_profiles` has `nanny_can_view_pay_rate`, `nanny_can_view_gross_pay`,
`nanny_can_view_pto_balance`, and `nanny_can_view_guaranteed_hours` columns
(spec 15.4, backing spec 11's "Optional" nanny visibility rows), but no
screen in the app -- `Pay.tsx`, `Pto.tsx`, or otherwise -- actually checks
them before showing a nanny that data; they're set during onboarding and then
ignored. The new weekly-summary card inherits this: a nanny viewing their own
`weekly_summary` card sees gross pay due and PTO balance unconditionally,
same as every other pay/PTO surface in the app today. Not a regression this
session introduced, but flagged since it's now visible in one more place.
Added to "Known gaps" below and to `QUESTIONS_AND_CLARIFICATIONS.md` as a new
item, since fixing it is a real (if mechanical) chunk of work across several
screens, not a one-line change.

### Known gaps for next phase (unchanged besides the addition above)

- **Per-key enforcement for the remaining permission matrix rows** (spec 11)
  — approve timesheet / mark payment / approve PTO / export records are
  co-admin-allowed by default with no restrict toggle; needs new RLS
  policies + a migration, not just UI.
- **`nanny_can_view_*` visibility flags are unenforced** (spec 15.4/11) — see
  above; would need gating added to `Pay.tsx`, `Pto.tsx`, `CaregiverDetail.tsx`
  (guaranteed hours display), and now `Home.tsx`'s weekly summary card.

---

## 2026-07-26 — Per-key permission enforcement for approve/mark-paid/PTO-approve/export (spec 10/11)

**Closes the last "known gap" from the permission matrix (spec 11).** Migration
`0014_approve_and_payment_permission_keys.sql` adds three new
`coadmin_permission_allowed` keys enforced server-side, the same pattern as
the seven keys from 2026-07-03 (`edit_pay_rate`, `edit_pto_policy`, etc.):

- **`approve_timesheet`** — gates `timesheets` rows landing in
  `approved`/`needs_correction`/`payment_due`/`paid`/`locked` (both the
  parent-generate-timesheet insert and any update that moves a row into one
  of those statuses; rows staying in `draft`/`submitted` — nanny submission,
  in-progress parent edits — don't need it). Also gates the accompanying
  `payment_records` insert (creating the payment record *is* the second half
  of "approve timesheet" in this app's flow), alongside `mark_payment_made`
  (see below) since a payment-correction record is also legitimately created
  outside the approval flow.
- **`mark_payment_made`** — gates `payment_records` updates: mark paid/
  partially paid, void, and marking the original record `corrected` during a
  correction.
- **`approve_pto`** — gates `leave_requests` rows landing in `approved` (both
  the parent "record leave" insert path in `Pto.tsx`, which creates a
  pre-approved request directly, and the review/approve/reject update on an
  existing `requested` row) or `rejected`. Also loosened `leave_ledger` insert
  to require *either* `approve_pto` or `edit_pto_policy`, since ledger rows
  come from both an approval (`used` events) and an allowance change
  (`opening_balance`/`manual_adjustment` events).

`More.tsx`'s `COADMIN_PERMISSIONS` list now shows all three as toggles in the
"Household members" card, following the existing pattern of no client-side
gating of the *editing* co-admin's own UI (a restricted co-admin still sees
the approve/reject buttons and gets the resulting RLS error surfaced through
the existing `errorMessage()` helper — same as the pre-existing `edit_schedule`/
`edit_pto_policy` keys, which never had bespoke friendly error messages
either). Server enforcement was the actual gap; the UI already showed these
actions to every parent/co-admin.

**`export_records` — deliberately *not* given a real RLS key.** Export
buttons only reformat rows the co-admin can already `SELECT` (timesheets,
payments, PTO ledger, full-records bundle) into a client-side download —
there's no additional data a restricted co-admin would gain by exporting that
they couldn't already read row-by-row in the app. Enforcing it at the
database layer would be security theater: a restricted co-admin could
reconstruct the same CSV/JSON by hand from data RLS already lets them read.
So `export_records` is gated **client-side only**, via a new
`coadminAllowed(key)` helper added to `HouseholdContext` (mirrors
`coadmin_permission_allowed()` in the DB for the one key that has no DB-side
counterpart) — it hides the four export surfaces in `Pay.tsx` (annual
summary, full records, per-tab daily-CSV buttons) and the one in `Pto.tsx`
(ledger CSV) when the current co-admin has been restricted. This is
recorded as a conscious exception to "RLS is the enforcement boundary, not
UI hiding" (spec 18/19), not an oversight — flagged in
`QUESTIONS_AND_CLARIFICATIONS.md` for a second look since it's a judgment
call about what counts as a real security boundary.

This closes the permission-matrix gap noted in every "Known gaps" section
since 2026-07-03; all role-matrix rows listed as co-admin-optionally-
restrictable (spec 11) now have either a real RLS key or a documented
client-side equivalent.

**Time-entry schedule pre-fill — re-verified, still no change needed.** This
run's task again asked for time entries to default to the caregiver's
scheduled hours (falling back to the current day). Re-read `Time.tsx:34-124`:
unchanged since 2026-07-24 — the date field defaults to today and an effect
pre-fills start/end/break from the scheduled shift for whatever date is
selected, falling back to 9am–5pm only when nothing is scheduled. No gap.

### Known gaps for next phase (unchanged, still not built)

- **Reminder settings** (13.9) — per-type enable/disable + the
  `weekly_summary` digest; blocked on the content/cadence design decision in
  `QUESTIONS_AND_CLARIFICATIONS.md` item 19, presented again this run.

---

## 2026-07-24 — Full records export (spec 13.11), time-entry schedule pre-fill verified

**Full records export built (spec 13.11, closes the last "known gap" export
item; resolves Q&A item 18 — see below).** `Pay.tsx` has a new "Full records
export" card (Parent Admin/Co-Admin only, matching spec 13.11's export
permissions) with **Export JSON** and **Export CSV** buttons. Both bundle
every record type for the selected caregiver — full history, not scoped to a
period — into one download: `schedule_templates`, `schedule_shifts`,
`schedule_exceptions`, `time_entries`, `timesheets`, `payments`,
`leave_requests`, and `leave_ledger`, plus the caregiver profile itself. The
spec doesn't define exact contents for this export type, so scope was chosen
as "every caregiver-scoped operational record type that has its own DB
table," which is a superset of what the individual timesheet/payment/PTO-
ledger/annual-summary exports already cover. `reminders` and `audit_events`
were left out — reminders are ephemeral computed state with no export
precedent elsewhere in the app, and the audit log has no export UI of its own
yet either, so including just it here would be inconsistent.

JSON keeps records nested by type (`{ time_entries: [...], timesheets: [...],
... }`) — the natural shape for "everything." CSV has no single shared column
set across schedule templates, time entries, payments, etc., so each record
becomes one row of `record_type, id, date, record_json` (a best-guess date-ish
column plus the full record as a JSON string) rather than inventing a lossy
common schema. Added a small `downloadBlob`/`downloadJson` helper alongside
the existing `downloadCsv` in `src/lib/csv.ts` (refactored to share the blob-
download logic) rather than duplicating it inline.

**Time-entry pre-fill from schedule — verified already built, no change
needed.** This session's task asked for time entries to default to the
caregiver's scheduled hours (falling back to the current day). `Time.tsx`
already does exactly this (added 2026-06-30, commit `c6a13c5`): the date field
defaults to today, and an effect looks up the scheduled shift(s) for whatever
date is selected and pre-fills start time, end time, and break minutes from
it, falling back to a 9am–5pm default only when nothing is scheduled that
day. Confirmed by reading `Time.tsx:34-124` — no gap found, so nothing was
built here.

### Q&A item 18 resolved — chose "full records export" as the next known-gap phase

Of the three remaining known gaps (per-key permission enforcement for the rest
of the role matrix, reminder settings + `weekly_summary` digest, full records
export), this session built the **full records export**: it needed no design
decision (unlike the other two, which are blocked on judgment calls — see
`QUESTIONS_AND_CLARIFICATIONS.md` item 19 for the still-open one) and no
schema/RLS changes, just new client-side export logic reusing existing
read access. This was decided without a live chat round-trip since this run
executed on a schedule with nobody watching; flagged in
`QUESTIONS_AND_CLARIFICATIONS.md` for review rather than assumed final.

### Known gaps for next phase (unchanged, still not built)

- **Per-key enforcement for the remaining permission matrix rows** (spec 11)
  — approve timesheet / mark payment / approve PTO / export records are
  co-admin-allowed by default with no restrict toggle; needs new RLS
  policies + a migration, not just UI.
- **Reminder settings** (13.9) — per-type enable/disable + the
  `weekly_summary` digest; blocked on the content/cadence design decision in
  `QUESTIONS_AND_CLARIFICATIONS.md` item 19.

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
