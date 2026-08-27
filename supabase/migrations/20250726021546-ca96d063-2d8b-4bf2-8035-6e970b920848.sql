-- Update the employee record to have correct assigned_by
UPDATE user_roles 
SET assigned_by = '0a1026f0-5c35-4b20-ae9f-0688b0df4ee4'
WHERE user_id = 'c7390165-a66f-4e34-a676-3ced3c941317' AND role = 'employee';