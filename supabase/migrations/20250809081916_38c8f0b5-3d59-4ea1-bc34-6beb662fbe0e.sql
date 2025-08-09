-- Update existing orders that were created from quotes to have the correct assignee
UPDATE orders 
SET assignee_id = quotes.assignee_id
FROM quotes 
WHERE orders.notes LIKE '%' || quotes.quote_number || '%' 
  AND quotes.assignee_id IS NOT NULL 
  AND orders.assignee_id != quotes.assignee_id;