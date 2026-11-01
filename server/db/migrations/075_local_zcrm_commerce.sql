-- ZCRM is an adapter/ACL over the canonical customer, product and order tables.
-- No historical ownership, approval, money or stock is inferred by this migration.
CREATE SCHEMA zcrm;
REVOKE ALL ON SCHEMA zcrm FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA zcrm REVOKE ALL ON TABLES FROM PUBLIC;
CREATE TABLE zcrm.connections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id text NOT NULL UNIQUE CHECK(length(org_id) BETWEEN 1 AND 128),
 tenant_id text NOT NULL CHECK(length(btrim(tenant_id)) BETWEEN 1 AND 128), name text NOT NULL,
 origin text NOT NULL DEFAULT 'https://zcrm.joliefam.vn', enabled boolean NOT NULL DEFAULT false,
 token_hash text NOT NULL UNIQUE, token_encrypted text NOT NULL, webhook_encrypted text NOT NULL,
 revision integer NOT NULL DEFAULT 1, created_by text NOT NULL, updated_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE zcrm.actor_mappings (
 connection_id uuid REFERENCES zcrm.connections(id) ON DELETE CASCADE, zcrm_user_id text NOT NULL,
 crm_user_id text NOT NULL REFERENCES local_user_profiles(user_id), PRIMARY KEY(connection_id,zcrm_user_id),
 UNIQUE(connection_id,crm_user_id)
);
ALTER TABLE local_customers ADD COLUMN commerce_kind text CHECK(commerce_kind IN ('hotel','individual'));
ALTER TABLE local_customers ADD COLUMN commerce_contacts jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(commerce_contacts)='array');
ALTER TABLE local_products ADD COLUMN commerce_kind text CHECK(commerce_kind IN ('stock','custom'));
ALTER TABLE local_products ADD COLUMN commerce_unit text;
ALTER TABLE local_products ADD COLUMN commerce_variant text NOT NULL DEFAULT '';
ALTER TABLE local_products ADD COLUMN commerce_required_fields jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(commerce_required_fields)='array');
CREATE TABLE zcrm.customer_grants (
 connection_id uuid REFERENCES zcrm.connections(id) ON DELETE CASCADE,
 customer_id text REFERENCES local_customers(id), PRIMARY KEY(connection_id,customer_id)
);
CREATE TABLE zcrm.product_grants (
 connection_id uuid REFERENCES zcrm.connections(id) ON DELETE CASCADE,
 product_id uuid REFERENCES local_products(id), warehouse_ids uuid[] NOT NULL DEFAULT '{}',
 PRIMARY KEY(connection_id,product_id)
);
ALTER TABLE local_orders ADD COLUMN intake_source text;
ALTER TABLE local_orders ADD COLUMN intake_created_by text;
ALTER TABLE local_orders ADD COLUMN intake_submitted_by text;
ALTER TABLE local_orders ADD COLUMN intake_connection_id uuid REFERENCES zcrm.connections(id);
ALTER TABLE local_orders ADD COLUMN approval_status text CHECK(approval_status IN ('pending','approved','returned','rejected'));
ALTER TABLE local_orders ADD COLUMN approval_revision integer NOT NULL DEFAULT 0;
ALTER TABLE local_orders ADD COLUMN approval_reason text;
ALTER TABLE local_orders ADD COLUMN reviewed_by text;
ALTER TABLE local_orders ADD COLUMN reviewed_at timestamptz;
ALTER TABLE local_orders ADD COLUMN ordered_by text;
ALTER TABLE local_orders ADD COLUMN recipient_snapshot jsonb;
ALTER TABLE local_orders ADD COLUMN desired_delivery_date date;
ALTER TABLE local_orders ADD COLUMN confirmed_delivery_date date;
ALTER TABLE local_orders ADD COLUMN intake_draft jsonb;
ALTER TABLE local_orders ADD COLUMN commercial_snapshot jsonb;
ALTER TABLE local_orders ADD COLUMN integration_version bigint NOT NULL DEFAULT 1;
CREATE INDEX local_orders_zcrm_review_idx ON local_orders(approval_status,manager_id,created_at) WHERE intake_source='ZCRM';
CREATE TABLE zcrm.quotes (
 token text PRIMARY KEY,connection_id uuid NOT NULL REFERENCES zcrm.connections(id),customer_id text NOT NULL REFERENCES local_customers(id),
 actor_id text NOT NULL,fingerprint text NOT NULL,draft jsonb NOT NULL,product_signature text NOT NULL,
 result jsonb NOT NULL,expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE zcrm.requests (
 connection_id uuid NOT NULL REFERENCES zcrm.connections(id),request_key text NOT NULL,
 operation text NOT NULL CHECK(operation IN ('customer','draft')),fingerprint text NOT NULL,
 order_id text REFERENCES local_orders(id),result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(connection_id,request_key)
);
CREATE TABLE zcrm.attachments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id text NOT NULL REFERENCES local_orders(id),revision integer NOT NULL,
 media_id text NOT NULL,name text NOT NULL,mime text NOT NULL,size integer NOT NULL CHECK(size BETWEEN 0 AND 15728640),
 sha256 text NOT NULL,content bytea NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(order_id,revision,media_id),CHECK(octet_length(content)=size)
);
CREATE TABLE zcrm.audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,connection_id uuid REFERENCES zcrm.connections(id),actor_id text,
 action text NOT NULL,entity_id text,detail jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE zcrm.human_receipts (
 actor_id text NOT NULL,request_key text NOT NULL,fingerprint text NOT NULL,result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(actor_id,request_key)
);
-- These are canonical CRM business ledgers; they are not ZCRM copies of orders.
CREATE TABLE local_order_returns (
 id text PRIMARY KEY,order_id text NOT NULL REFERENCES local_orders(id),credit_amount numeric(18,0) NOT NULL CHECK(credit_amount>=0),
 lines jsonb NOT NULL CHECK(jsonb_typeof(lines)='array'),reason text NOT NULL,
 reversal_of text UNIQUE REFERENCES local_order_returns(id),created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE local_order_refunds (
 id text PRIMARY KEY,order_id text NOT NULL REFERENCES local_orders(id),payment_id text NOT NULL REFERENCES local_order_payments(id),
 return_id text REFERENCES local_order_returns(id),amount numeric(18,0) NOT NULL CHECK(amount>0),reason text NOT NULL,
 reversal_of text UNIQUE REFERENCES local_order_refunds(id),created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX local_order_returns_order_idx ON local_order_returns(order_id);
CREATE INDEX local_order_refunds_order_idx ON local_order_refunds(order_id);
CREATE TABLE zcrm.outbox (
 event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),connection_id uuid NOT NULL REFERENCES zcrm.connections(id),
 customer_id text NOT NULL,order_id text,version bigint NOT NULL,raw_body text NOT NULL,
 attempts integer NOT NULL DEFAULT 0,next_attempt_at timestamptz NOT NULL DEFAULT now(),lease_until timestamptz,
 delivered_at timestamptz,last_error text,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX zcrm_outbox_pending_idx ON zcrm.outbox(next_attempt_at) WHERE delivered_at IS NULL;
CREATE TABLE zcrm.quotas (
 connection_id uuid REFERENCES zcrm.connections(id),minute timestamptz,requests integer NOT NULL,PRIMARY KEY(connection_id,minute)
);
CREATE FUNCTION zcrm.immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 RAISE EXCEPTION 'ZCRM_IMMUTABLE: append a correction/reversal instead'; END $$;
CREATE TRIGGER zcrm_receipts_immutable BEFORE UPDATE OR DELETE ON zcrm.requests FOR EACH ROW EXECUTE FUNCTION zcrm.immutable();
CREATE TRIGGER zcrm_audit_immutable BEFORE UPDATE OR DELETE ON zcrm.audit FOR EACH ROW EXECUTE FUNCTION zcrm.immutable();
CREATE TRIGGER zcrm_refunds_immutable BEFORE UPDATE OR DELETE ON local_order_refunds FOR EACH ROW EXECUTE FUNCTION zcrm.immutable();
CREATE TRIGGER zcrm_returns_immutable BEFORE UPDATE OR DELETE ON local_order_returns FOR EACH ROW EXECUTE FUNCTION zcrm.immutable();
CREATE FUNCTION zcrm.guard_order() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.intake_source='ZCRM' THEN RAISE EXCEPTION 'ZCRM_GUARD: preserve integrated orders and request receipts'; END IF;
  RETURN OLD;
 END IF;
 IF (TG_OP='INSERT' AND NEW.intake_source='ZCRM') OR (TG_OP='UPDATE' AND (OLD.intake_source='ZCRM' OR NEW.intake_source='ZCRM')) THEN
  IF coalesce(current_setting('zcrm.authorized_write',true),'')<>'on' THEN
   IF TG_OP='INSERT' OR NEW.approval_status IS DISTINCT FROM OLD.approval_status OR NEW.approval_revision IS DISTINCT FROM OLD.approval_revision
    OR NEW.intake_source IS DISTINCT FROM OLD.intake_source OR NEW.intake_connection_id IS DISTINCT FROM OLD.intake_connection_id
    OR NEW.intake_draft IS DISTINCT FROM OLD.intake_draft OR NEW.commercial_snapshot IS DISTINCT FROM OLD.commercial_snapshot
    OR NEW.items IS DISTINCT FROM OLD.items OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
    OR NEW.customer_id IS DISTINCT FROM OLD.customer_id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.manager_id IS DISTINCT FROM OLD.manager_id OR NEW.intake_created_by IS DISTINCT FROM OLD.intake_created_by
    OR NEW.intake_submitted_by IS DISTINCT FROM OLD.intake_submitted_by OR NEW.recipient_snapshot IS DISTINCT FROM OLD.recipient_snapshot
    OR NEW.ordered_by IS DISTINCT FROM OLD.ordered_by OR NEW.desired_delivery_date IS DISTINCT FROM OLD.desired_delivery_date
    OR NEW.confirmed_delivery_date IS DISTINCT FROM OLD.confirmed_delivery_date THEN
    RAISE EXCEPTION 'ZCRM_GUARD: use the authorized order review workflow';
   END IF;
  END IF;
  IF NEW.approval_status<>'approved' AND NEW.status NOT IN ('pending','cancelled') THEN
   RAISE EXCEPTION 'ZCRM_GUARD: order has not been approved';
  END IF;
 END IF;
 IF TG_OP='UPDATE' THEN NEW.integration_version=OLD.integration_version+1; NEW.updated_at=now(); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER zcrm_guard_order BEFORE INSERT OR UPDATE OR DELETE ON local_orders FOR EACH ROW EXECUTE FUNCTION zcrm.guard_order();
CREATE FUNCTION zcrm.order_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 INSERT INTO zcrm.outbox(connection_id,customer_id,order_id,version,raw_body)
 SELECT c.id,NEW.customer_id,NEW.id,NEW.integration_version,
  jsonb_build_object('customerId',NEW.customer_id,'orderId',NEW.id,'version',NEW.integration_version)::text
 FROM zcrm.connections c JOIN zcrm.customer_grants g ON g.connection_id=c.id AND g.customer_id=NEW.customer_id
 WHERE c.tenant_id=NEW.tenant_id;
 RETURN NEW;
END $$;
CREATE TRIGGER zcrm_order_event AFTER INSERT OR UPDATE ON local_orders FOR EACH ROW EXECUTE FUNCTION zcrm.order_event();
CREATE TABLE zcrm.customer_versions(customer_id text PRIMARY KEY REFERENCES local_customers(id),version bigint NOT NULL);
CREATE FUNCTION zcrm.customer_event() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE v bigint; BEGIN
 INSERT INTO zcrm.customer_versions VALUES(NEW.id,1) ON CONFLICT(customer_id) DO UPDATE SET version=zcrm.customer_versions.version+1 RETURNING version INTO v;
 INSERT INTO zcrm.outbox(connection_id,customer_id,version,raw_body)
 SELECT c.id,NEW.id,v,jsonb_build_object('customerId',NEW.id,'version',v)::text
 FROM zcrm.connections c JOIN zcrm.customer_grants g ON g.connection_id=c.id AND g.customer_id=NEW.id
 WHERE c.tenant_id=NEW.tenant_id OR NEW.tenant_id IS NULL;
 RETURN NEW; END $$;
CREATE TRIGGER zcrm_customer_event AFTER INSERT OR UPDATE ON local_customers FOR EACH ROW EXECUTE FUNCTION zcrm.customer_event();
CREATE FUNCTION zcrm.touch_related_order() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r jsonb; oid text; poid text; old_oid text;
BEGIN
 r=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 oid=r->>'order_id'; poid=r->>'production_order_id';
 IF TG_TABLE_NAME='local_production_shipment_lines' THEN SELECT order_id INTO oid FROM local_production_shipments WHERE id::text=r->>'shipment_id'; END IF;
 IF TG_TABLE_NAME='local_inventory_movements' THEN SELECT d.production_order_id::text INTO poid FROM local_inventory_documents d WHERE d.id::text=r->>'document_id'; END IF;
 IF oid IS NULL AND poid IS NOT NULL THEN SELECT order_id INTO oid FROM local_production_orders WHERE id::text=poid; END IF;
 IF TG_TABLE_NAME='local_projection_tombstones' THEN
  IF r->>'source_table'='order_payments' THEN SELECT order_id INTO oid FROM local_order_payments WHERE id=r->>'source_key';
  ELSIF r->>'source_table'='orders' THEN oid=r->>'source_key'; END IF;
 END IF;
 IF TG_OP<>'DELETE' AND oid IS NOT NULL AND TG_TABLE_NAME<>'local_projection_tombstones' AND EXISTS(SELECT 1 FROM local_orders WHERE id=oid AND approval_status IS NOT NULL AND approval_status<>'approved') THEN
  RAISE EXCEPTION 'ZCRM_GUARD: order must be approved before execution';
 END IF;
 IF oid IS NOT NULL THEN UPDATE local_orders SET integration_version=integration_version WHERE id=oid; END IF;
 IF TG_OP='UPDATE' THEN old_oid=to_jsonb(OLD)->>'order_id'; IF old_oid IS NOT NULL AND old_oid IS DISTINCT FROM oid THEN UPDATE local_orders SET integration_version=integration_version WHERE id=old_oid; END IF; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE FUNCTION zcrm.lock_execution_order() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r jsonb; oid text; poid text; previous_oid text;
BEGIN
 r=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 oid=r->>'order_id';poid=r->>'production_order_id';
 IF TG_TABLE_NAME='local_production_shipment_lines' THEN SELECT order_id INTO oid FROM local_production_shipments WHERE id::text=r->>'shipment_id'; END IF;
 IF TG_TABLE_NAME='local_inventory_movements' THEN SELECT production_order_id::text INTO poid FROM local_inventory_documents WHERE id::text=r->>'document_id'; END IF;
 IF oid IS NULL AND poid IS NOT NULL THEN SELECT order_id INTO oid FROM local_production_orders WHERE id::text=poid; END IF;
 IF oid IS NOT NULL THEN
  PERFORM id FROM local_orders WHERE id=oid FOR UPDATE;
  IF TG_OP<>'DELETE' AND EXISTS(SELECT 1 FROM local_orders WHERE id=oid AND approval_status IS NOT NULL AND approval_status<>'approved') THEN RAISE EXCEPTION 'ZCRM_GUARD: order must be approved before execution'; END IF;
 END IF;
 IF TG_OP='UPDATE' THEN previous_oid=to_jsonb(OLD)->>'order_id';IF previous_oid IS NOT NULL AND previous_oid IS DISTINCT FROM oid THEN PERFORM id FROM local_orders WHERE id=previous_oid FOR UPDATE; END IF; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['local_order_payments','local_order_refunds','local_order_returns','local_production_orders','local_production_order_items','local_production_stage_events','local_production_shipments','local_production_shipment_lines','local_inventory_documents','local_inventory_movements','local_ghn_tracking','local_production_sales_requests','local_projection_tombstones','local_contracts'] LOOP
  EXECUTE format('CREATE TRIGGER zcrm_related_event AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION zcrm.touch_related_order()',t);
  IF t<>'local_projection_tombstones' THEN EXECUTE format('CREATE TRIGGER zcrm_execution_lock BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION zcrm.lock_execution_order()',t); END IF;
 END LOOP;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA zcrm FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA zcrm FROM PUBLIC;
REVOKE ALL ON local_order_refunds,local_order_returns FROM PUBLIC;
DO $$ DECLARE t text; BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='zcrm' LOOP EXECUTE format('ALTER TABLE zcrm.%I ENABLE ROW LEVEL SECURITY',t); END LOOP;
END $$;
ALTER TABLE local_order_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE local_order_refunds ENABLE ROW LEVEL SECURITY;
