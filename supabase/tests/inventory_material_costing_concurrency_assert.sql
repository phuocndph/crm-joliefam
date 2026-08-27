\set ON_ERROR_STOP on

SELECT set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000001', false);

DO $$
DECLARE
  v_issue_balance jsonb := public.inventory_test_balance_json(
    '60000000-0000-0000-0000-000000000006',
    '50000000-0000-0000-0000-000000000001'
  );
  v_receipt_balance jsonb := public.inventory_test_balance_json(
    '60000000-0000-0000-0000-000000000007',
    '50000000-0000-0000-0000-000000000001'
  );
BEGIN
  IF (
    SELECT count(*)
    FROM public.inventory_documents d
    JOIN public.inventory_test_state s ON s.value::uuid = d.id
    WHERE s.key IN ('concurrent_issue_a', 'concurrent_issue_b') AND d.status = 'CONFIRMED'
  ) <> 1 THEN
    RAISE EXCEPTION 'Concurrent issues did not serialize to one success';
  END IF;
  IF (
    SELECT count(*)
    FROM public.inventory_documents d
    JOIN public.inventory_test_state s ON s.value::uuid = d.id
    WHERE s.key IN ('concurrent_issue_a', 'concurrent_issue_b') AND d.status = 'DRAFT'
  ) <> 1 THEN
    RAISE EXCEPTION 'Concurrent issue loser did not remain an unposted draft';
  END IF;
  IF (v_issue_balance->>'quantity_on_hand')::numeric <> 400
     OR (v_issue_balance->>'inventory_value')::numeric <> 16000000 THEN
    RAISE EXCEPTION 'Concurrent issue final balance is incorrect';
  END IF;

  IF (
    SELECT count(*)
    FROM public.inventory_documents d
    JOIN public.inventory_test_state s ON s.value::uuid = d.id
    WHERE s.key IN ('concurrent_receipt_a', 'concurrent_receipt_b') AND d.status = 'CONFIRMED'
  ) <> 2 THEN
    RAISE EXCEPTION 'Concurrent receipts did not both succeed';
  END IF;
  IF (v_receipt_balance->>'quantity_on_hand')::numeric <> 2000
     OR (v_receipt_balance->>'average_unit_cost')::numeric <> 42500
     OR (v_receipt_balance->>'inventory_value')::numeric <> 85000000 THEN
    RAISE EXCEPTION 'Concurrent receipt valuation is incorrect';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.reconcile_inventory_balances()
    WHERE quantity_difference <> 0 OR value_difference <> 0
  ) THEN
    RAISE EXCEPTION 'Concurrency ledger/balance reconciliation failed';
  END IF;
END $$;

SELECT 'inventory_material_costing_concurrency_test: PASS' AS result;
