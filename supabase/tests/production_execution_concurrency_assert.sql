\set ON_ERROR_STOP on

DO $$
BEGIN
  IF (
    SELECT count(*) FROM public.inventory_documents
    WHERE idempotency_key IN ('prod-concurrent-tolerance-a', 'prod-concurrent-tolerance-b')
      AND status = 'CONFIRMED'
  ) <> 1 THEN
    RAISE EXCEPTION 'Concurrent tolerance issues did not serialize to one success';
  END IF;
  IF (
    SELECT count(*) FROM public.inventory_documents
    WHERE idempotency_key IN ('prod-concurrent-tolerance-a', 'prod-concurrent-tolerance-b')
      AND status = 'DRAFT'
  ) <> 1 THEN
    RAISE EXCEPTION 'Concurrent tolerance loser did not remain a draft';
  END IF;
END $$;

SELECT 'production_execution_concurrency_test: PASS' AS result;
