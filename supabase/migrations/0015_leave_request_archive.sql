-- Parents/co-admins need to edit or archive an approved leave_requests row
-- without disturbing the leave_ledger balance math (spec 13.7's ledger is
-- append-only -- see 0002_rls.sql's leave_ledger policies -- so "editing" an
-- approved request's hours/dates happens by reversing the original 'used'
-- ledger entry and inserting a corrected one, both already provided for by
-- the 'reversal'/'correction' event_types in 0001_schema.sql).
--
-- Archiving is a display-only concept -- it hides a settled request from the
-- default list without touching status or the ledger, so balances/exports
-- stay correct. A plain nullable timestamp (not a status value) keeps it
-- orthogonal to the existing requested/approved/rejected/canceled/used
-- workflow.
alter table public.leave_requests
  add column archived_at timestamptz,
  add column archived_by uuid references public.users (id);

-- Same actors who can already update the row (parent/co-admin always; nanny
-- only while status = 'requested', per leave_requests_update) can toggle
-- archived_at -- no separate policy needed since it's a plain column update
-- covered by the existing leave_requests_update policy from migration 0014.
