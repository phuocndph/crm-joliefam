ALTER TABLE local_assignments ADD COLUMN labor_basis jsonb;
ALTER TABLE local_production_job_publications ADD COLUMN labor_basis jsonb;
ALTER TABLE local_production_entries ADD COLUMN standalone_reason text;
