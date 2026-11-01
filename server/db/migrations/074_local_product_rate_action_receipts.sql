-- Temporal action receipts only; local_product_rates remains the price authority.
CREATE TABLE local_product_rate_action_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE CHECK (length(idempotency_key) BETWEEN 8 AND 200 AND idempotency_key ~ '^[A-Za-z0-9._:-]+$'),
  actor_id text NOT NULL CHECK (length(btrim(actor_id)) > 0),
  action text NOT NULL CHECK (action IN ('CREATE','UPDATE','APPROVE','DISCARD')),
  record_id uuid NOT NULL REFERENCES local_product_rates(id),
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  response_status integer NOT NULL CHECK ((action='CREATE' AND response_status=201) OR (action<>'CREATE' AND response_status=200)),
  response_body jsonb NOT NULL CHECK (jsonb_typeof(response_body)='object'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX local_product_rate_action_receipts_record_idx ON local_product_rate_action_receipts(record_id,created_at,id);
CREATE FUNCTION local_product_rate_action_receipts_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Product rate action receipts are immutable';
END;
$$;
CREATE TRIGGER local_product_rate_action_receipts_immutable
BEFORE UPDATE OR DELETE ON local_product_rate_action_receipts
FOR EACH ROW EXECUTE FUNCTION local_product_rate_action_receipts_immutable();
