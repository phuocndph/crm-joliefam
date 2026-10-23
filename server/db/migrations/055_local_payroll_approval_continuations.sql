-- Preserve provenance for bounded continuations of immutable approved payroll versions.
ALTER TABLE local_worker_compensation_assignments ADD COLUMN IF NOT EXISTS continued_from_id uuid REFERENCES local_worker_compensation_assignments(id);
CREATE INDEX IF NOT EXISTS local_worker_compensation_assignments_continued_idx ON local_worker_compensation_assignments(continued_from_id) WHERE continued_from_id IS NOT NULL;
ALTER TABLE local_worker_payroll_profiles ADD COLUMN IF NOT EXISTS continued_from_id uuid REFERENCES local_worker_payroll_profiles(id);
CREATE INDEX IF NOT EXISTS local_worker_payroll_profiles_continued_idx ON local_worker_payroll_profiles(continued_from_id) WHERE continued_from_id IS NOT NULL;
ALTER TABLE local_worker_rates ADD COLUMN IF NOT EXISTS continued_from_id uuid REFERENCES local_worker_rates(id);
CREATE INDEX IF NOT EXISTS local_worker_rates_continued_idx ON local_worker_rates(continued_from_id) WHERE continued_from_id IS NOT NULL;
ALTER TABLE local_social_insurance_versions ADD COLUMN IF NOT EXISTS continued_from_id uuid REFERENCES local_social_insurance_versions(id);
CREATE INDEX IF NOT EXISTS local_social_insurance_versions_continued_idx ON local_social_insurance_versions(continued_from_id) WHERE continued_from_id IS NOT NULL;
ALTER TABLE local_product_rates ADD COLUMN IF NOT EXISTS continued_from_id uuid REFERENCES local_product_rates(id);
CREATE INDEX IF NOT EXISTS local_product_rates_continued_idx ON local_product_rates(continued_from_id) WHERE continued_from_id IS NOT NULL;
