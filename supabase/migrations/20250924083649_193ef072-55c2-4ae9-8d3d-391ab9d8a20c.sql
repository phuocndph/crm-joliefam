-- Fix invalid manager_id assignments across all tables
-- Update customers with invalid manager_id to nguyenducphuoc@company.com's current ID
UPDATE customers 
SET manager_id = '6a1faecc-8571-46ca-a035-01efe09c919b'
WHERE manager_id = 'd86fb91f-223c-45a1-976d-e6c871cbbe25';

-- Update orders with invalid manager_id
UPDATE orders 
SET manager_id = '6a1faecc-8571-46ca-a035-01efe09c919b'
WHERE manager_id = 'd86fb91f-223c-45a1-976d-e6c871cbbe25';

-- Update assignees with invalid manager_id
UPDATE assignees 
SET manager_id = '6a1faecc-8571-46ca-a035-01efe09c919b'
WHERE manager_id = 'd86fb91f-223c-45a1-976d-e6c871cbbe25';

-- Update quotes with invalid manager_id
UPDATE quotes 
SET manager_id = '6a1faecc-8571-46ca-a035-01efe09c919b'
WHERE manager_id = 'd86fb91f-223c-45a1-976d-e6c871cbbe25';

-- Update expenses with invalid manager_id
UPDATE expenses 
SET manager_id = '6a1faecc-8571-46ca-a035-01efe09c919b'
WHERE manager_id = 'd86fb91f-223c-45a1-976d-e6c871cbbe25';

-- Update transactions with invalid manager_id
UPDATE transactions 
SET manager_id = '6a1faecc-8571-46ca-a035-01efe09c919b'
WHERE manager_id = 'd86fb91f-223c-45a1-976d-e6c871cbbe25';

-- Update finance_data with invalid manager_id
UPDATE finance_data 
SET manager_id = '6a1faecc-8571-46ca-a035-01efe09c919b'
WHERE manager_id = 'd86fb91f-223c-45a1-976d-e6c871cbbe25';

-- Update fabric related tables with invalid manager_id
UPDATE fabric_types 
SET manager_id = '6a1faecc-8571-46ca-a035-01efe09c919b'
WHERE manager_id = 'd86fb91f-223c-45a1-976d-e6c871cbbe25';

UPDATE fabric_widths 
SET manager_id = '6a1faecc-8571-46ca-a035-01efe09c919b'
WHERE manager_id = 'd86fb91f-223c-45a1-976d-e6c871cbbe25';

UPDATE fabric_inventory 
SET manager_id = '6a1faecc-8571-46ca-a035-01efe09c919b'
WHERE manager_id = 'd86fb91f-223c-45a1-976d-e6c871cbbe25';

UPDATE fabric_transactions 
SET manager_id = '6a1faecc-8571-46ca-a035-01efe09c919b'
WHERE manager_id = 'd86fb91f-223c-45a1-976d-e6c871cbbe25';

UPDATE ghn_tracking 
SET manager_id = '6a1faecc-8571-46ca-a035-01efe09c919b'
WHERE manager_id = 'd86fb91f-223c-45a1-976d-e6c871cbbe25';