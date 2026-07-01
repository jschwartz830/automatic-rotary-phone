-- Backfill leave_ledger for existing approved/used leave_requests so the
-- balance display can switch from live-recomputed (leave_requests) to
-- event-sourced (sum of leave_ledger.hours_delta).
--
-- Safe to re-run: the NOT EXISTS guard prevents duplicate rows.

INSERT INTO leave_ledger (
  caregiver_id,
  leave_policy_id,
  event_date,
  event_type,
  hours_delta,
  balance_after,
  related_leave_request_id,
  created_by,
  notes
)
SELECT
  lr.caregiver_id,
  lp.id,
  lr.start_date,
  'used',
  -COALESCE(lr.hours_requested, 0),
  0, -- recomputed below
  lr.id,
  lr.reviewed_by,
  'Backfilled from existing approved leave request'
FROM leave_requests lr
JOIN leave_policies lp
  ON lp.caregiver_id = lr.caregiver_id
  AND lp.leave_type = lr.leave_type
WHERE lr.status IN ('approved', 'used')
  AND COALESCE(lr.hours_requested, 0) > 0
  AND NOT EXISTS (
    SELECT 1 FROM leave_ledger ll WHERE ll.related_leave_request_id = lr.id
  );

-- Recompute balance_after as a running sum partitioned by caregiver + policy,
-- ordered by event_date then insertion order.
WITH running AS (
  SELECT
    id,
    SUM(hours_delta) OVER (
      PARTITION BY caregiver_id, leave_policy_id
      ORDER BY event_date, created_at
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS balance
  FROM leave_ledger
)
UPDATE leave_ledger ll
SET balance_after = running.balance
FROM running
WHERE ll.id = running.id;
