-- Cập nhật manager_id cho tất cả dữ liệu hiện có cho manager này
UPDATE customers 
SET manager_id = '0a1026f0-5c35-4b20-ae9f-0688b0df4ee4'
WHERE manager_id IS NULL OR manager_id = '';

UPDATE orders 
SET manager_id = '0a1026f0-5c35-4b20-ae9f-0688b0df4ee4'
WHERE manager_id IS NULL OR manager_id = '';

UPDATE quotes 
SET manager_id = '0a1026f0-5c35-4b20-ae9f-0688b0df4ee4'
WHERE manager_id IS NULL OR manager_id = '';

UPDATE products 
SET manager_id = '0a1026f0-5c35-4b20-ae9f-0688b0df4ee4'
WHERE manager_id IS NULL OR manager_id = '';

UPDATE transactions 
SET manager_id = '0a1026f0-5c35-4b20-ae9f-0688b0df4ee4'
WHERE manager_id IS NULL OR manager_id = '';

UPDATE finance_data 
SET manager_id = '0a1026f0-5c35-4b20-ae9f-0688b0df4ee4'
WHERE manager_id IS NULL OR manager_id = '';