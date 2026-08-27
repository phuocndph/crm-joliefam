-- Add assignee_id field to customers table to properly track assignee assignments
ALTER TABLE customers ADD COLUMN assignee_id uuid REFERENCES assignees(id);