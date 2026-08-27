-- Remove duplicate customers, keeping the oldest record for each normalized name
WITH duplicates AS (
  SELECT 
    LOWER(TRIM(name)) as normalized_name,
    id,
    created_at,
    ROW_NUMBER() OVER (PARTITION BY LOWER(TRIM(name)) ORDER BY created_at ASC) as rn
  FROM customers
),
to_delete AS (
  SELECT id FROM duplicates WHERE rn > 1
)
DELETE FROM customers 
WHERE id IN (SELECT id FROM to_delete);