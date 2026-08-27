-- Add packages_count column to fabric_inventory table
ALTER TABLE fabric_inventory 
ADD COLUMN packages_count INTEGER DEFAULT 0;

-- Add packages_count column to fabric_transactions table  
ALTER TABLE fabric_transactions
ADD COLUMN packages_count INTEGER DEFAULT 0;

-- Add comment to explain the new columns
COMMENT ON COLUMN fabric_inventory.packages_count IS 'Number of fabric packages/rolls stored in inventory';
COMMENT ON COLUMN fabric_transactions.packages_count IS 'Number of fabric packages/rolls in transaction';