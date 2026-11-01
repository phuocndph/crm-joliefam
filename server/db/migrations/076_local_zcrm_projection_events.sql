-- Append-only repair: invalidate logical deletes/restores and both ends of
-- indirect association changes. No business rows are backfilled or reclassified.
CREATE FUNCTION zcrm.related_order_ids(table_name text,r jsonb) RETURNS SETOF text LANGUAGE plpgsql AS $$
DECLARE oid text;poid text;
BEGIN
 oid=r->>'order_id';poid=r->>'production_order_id';
 IF table_name='local_production_shipment_lines' THEN SELECT order_id INTO oid FROM local_production_shipments WHERE id::text=r->>'shipment_id'; END IF;
 IF table_name='local_inventory_movements' THEN SELECT production_order_id::text INTO poid FROM local_inventory_documents WHERE id::text=r->>'document_id'; END IF;
 IF oid IS NULL AND poid IS NOT NULL THEN SELECT order_id::text INTO oid FROM local_production_orders WHERE id::text=poid; END IF;
 IF table_name='local_projection_tombstones' THEN
  CASE r->>'source_table'
   WHEN 'order_payments' THEN SELECT order_id INTO oid FROM local_order_payments WHERE id=r->>'source_key';
   WHEN 'orders' THEN oid=r->>'source_key';
   WHEN 'ghn_tracking' THEN SELECT order_id::text INTO oid FROM local_ghn_tracking WHERE id=r->>'source_key';
   WHEN 'contracts' THEN SELECT order_id INTO oid FROM local_contracts WHERE id=r->>'source_key';
   WHEN 'production_orders' THEN SELECT order_id::text INTO oid FROM local_production_orders WHERE id::text=r->>'source_key';
   ELSE NULL;
  END CASE;
 END IF;
 IF nullif(oid,'') IS NOT NULL THEN RETURN NEXT oid; END IF;
END $$;
REVOKE ALL ON FUNCTION zcrm.related_order_ids(text,jsonb) FROM PUBLIC;
CREATE OR REPLACE FUNCTION zcrm.touch_related_order() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_row jsonb;previous_row jsonb;oid text;customer_key text;
BEGIN
 current_row=CASE WHEN TG_OP='DELETE' THEN '{}'::jsonb ELSE to_jsonb(NEW) END;
 previous_row=CASE WHEN TG_OP='INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
 FOR oid IN SELECT DISTINCT x FROM (
  SELECT zcrm.related_order_ids(TG_TABLE_NAME,current_row) x UNION ALL
  SELECT zcrm.related_order_ids(TG_TABLE_NAME,previous_row) x
 ) ids WHERE x IS NOT NULL ORDER BY x LOOP
  IF TG_OP<>'DELETE' AND TG_TABLE_NAME<>'local_projection_tombstones'
   AND EXISTS(SELECT 1 FROM local_orders WHERE id=oid AND approval_status IS NOT NULL AND approval_status<>'approved')
  THEN RAISE EXCEPTION 'ZCRM_GUARD: order must be approved before execution'; END IF;
  UPDATE local_orders SET integration_version=integration_version WHERE id=oid;
  -- A deleted order cannot be fetched. A customer-only invalidation tells ZCRM
  -- to refresh its visible order list without exposing a deleted order ID.
  IF TG_TABLE_NAME='local_projection_tombstones' AND (current_row->>'source_table'='orders' OR previous_row->>'source_table'='orders') THEN
   UPDATE local_customers SET updated_at=now() WHERE id=(SELECT customer_id FROM local_orders WHERE id=oid);
  END IF;
 END LOOP;
 IF TG_TABLE_NAME='local_projection_tombstones' THEN
  FOR customer_key IN SELECT DISTINCT x FROM (
   SELECT CASE WHEN current_row->>'source_table'='customers' THEN current_row->>'source_key' END x UNION ALL
   SELECT CASE WHEN previous_row->>'source_table'='customers' THEN previous_row->>'source_key' END x
  ) keys WHERE x IS NOT NULL ORDER BY x LOOP
   -- Existing customer_event emits a minimal customerId/version notification.
   -- It intentionally also emits while the profile is logically unavailable.
   UPDATE local_customers SET updated_at=now() WHERE id=customer_key;
  END LOOP;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE OR REPLACE FUNCTION zcrm.lock_execution_order() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_row jsonb;previous_row jsonb;oid text;
BEGIN
 current_row=CASE WHEN TG_OP='DELETE' THEN '{}'::jsonb ELSE to_jsonb(NEW) END;
 previous_row=CASE WHEN TG_OP='INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
 FOR oid IN SELECT DISTINCT x FROM (
  SELECT zcrm.related_order_ids(TG_TABLE_NAME,current_row) x UNION ALL
  SELECT zcrm.related_order_ids(TG_TABLE_NAME,previous_row) x
 ) ids WHERE x IS NOT NULL ORDER BY x LOOP
  PERFORM id FROM local_orders WHERE id=oid FOR UPDATE;
  IF TG_OP<>'DELETE' AND EXISTS(SELECT 1 FROM local_orders WHERE id=oid AND approval_status IS NOT NULL AND approval_status<>'approved') THEN
   RAISE EXCEPTION 'ZCRM_GUARD: order must be approved before execution';
  END IF;
 END LOOP;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
