-- Manual confirmation metadata only. This does not move money or modify payroll history.
CREATE TABLE local_payroll_monthly_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE,
  actor_id text NOT NULL,
  request_hash text NOT NULL,
  command_kind text NOT NULL CHECK(command_kind IN ('ADJUSTMENT','PAYMENT')),
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE local_payroll_payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  command_id uuid NOT NULL REFERENCES local_payroll_monthly_commands(id),
  month date NOT NULL CHECK(extract(day from month)=1),
  worker_id uuid NOT NULL REFERENCES local_workers(id),
  run_id uuid NOT NULL REFERENCES local_payroll_runs(id),
  record_id uuid NOT NULL REFERENCES local_payroll_records(id),
  payment_amount numeric(20,2) NOT NULL CHECK(payment_amount>0),
  source_fingerprint text NOT NULL,
  prior_event_id uuid REFERENCES local_payroll_payment_events(id),
  status text NOT NULL CHECK(status IN ('PAID','VOID')),
  reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 1000),
  actor_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(command_id,worker_id)
);
CREATE INDEX local_payroll_payment_events_latest_idx ON local_payroll_payment_events(month,worker_id,created_at DESC,id DESC);
CREATE UNIQUE INDEX local_payroll_payment_event_chain_idx ON local_payroll_payment_events(prior_event_id) WHERE prior_event_id IS NOT NULL;
CREATE FUNCTION local_monthly_payroll_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Monthly payroll commands and payment confirmations are immutable.'; END; $$;
CREATE TRIGGER monthly_command_immutable BEFORE UPDATE OR DELETE ON local_payroll_monthly_commands FOR EACH ROW EXECUTE FUNCTION local_monthly_payroll_immutable();
CREATE TRIGGER monthly_payment_immutable BEFORE UPDATE OR DELETE ON local_payroll_payment_events FOR EACH ROW EXECUTE FUNCTION local_monthly_payroll_immutable();
REVOKE ALL ON local_payroll_monthly_commands,local_payroll_payment_events FROM PUBLIC;
REVOKE ALL ON FUNCTION local_monthly_payroll_immutable() FROM PUBLIC;
