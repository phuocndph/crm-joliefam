-- Update existing data to assign manager_id for current users
-- First, let's get the current users and their roles
DO $$
DECLARE
    admin_user_id uuid;
    manager_user_id uuid;
BEGIN
    -- Get the admin user
    SELECT user_id INTO admin_user_id 
    FROM user_roles 
    WHERE role = 'admin' 
    LIMIT 1;
    
    -- Get the manager user
    SELECT user_id INTO manager_user_id 
    FROM user_roles 
    WHERE role = 'manager' 
    LIMIT 1;
    
    -- If we have a manager, assign half of existing data to manager
    IF manager_user_id IS NOT NULL THEN
        -- Update products - assign half to manager
        UPDATE products 
        SET manager_id = manager_user_id::text
        WHERE manager_id IS NULL 
        AND id IN (
            SELECT id FROM products 
            WHERE manager_id IS NULL 
            ORDER BY created_at 
            LIMIT (SELECT COUNT(*)/2 FROM products WHERE manager_id IS NULL)
        );
        
        -- Update remaining products to admin if admin exists
        IF admin_user_id IS NOT NULL THEN
            UPDATE products 
            SET manager_id = admin_user_id::text
            WHERE manager_id IS NULL;
        END IF;
        
        -- Do the same for other tables if they have data
        -- Update customers
        UPDATE customers 
        SET manager_id = manager_user_id::text
        WHERE manager_id IS NULL 
        AND id IN (
            SELECT id FROM customers 
            WHERE manager_id IS NULL 
            ORDER BY created_at 
            LIMIT (SELECT COUNT(*)/2 FROM customers WHERE manager_id IS NULL)
        );
        
        UPDATE customers 
        SET manager_id = admin_user_id::text
        WHERE manager_id IS NULL AND admin_user_id IS NOT NULL;
        
        -- Update quotes
        UPDATE quotes 
        SET manager_id = manager_user_id::text
        WHERE manager_id IS NULL 
        AND id IN (
            SELECT id FROM quotes 
            WHERE manager_id IS NULL 
            ORDER BY created_at 
            LIMIT (SELECT COUNT(*)/2 FROM quotes WHERE manager_id IS NULL)
        );
        
        UPDATE quotes 
        SET manager_id = admin_user_id::text
        WHERE manager_id IS NULL AND admin_user_id IS NOT NULL;
        
        -- Update orders
        UPDATE orders 
        SET manager_id = manager_user_id::text
        WHERE manager_id IS NULL 
        AND id IN (
            SELECT id FROM orders 
            WHERE manager_id IS NULL 
            ORDER BY created_at 
            LIMIT (SELECT COUNT(*)/2 FROM orders WHERE manager_id IS NULL)
        );
        
        UPDATE orders 
        SET manager_id = admin_user_id::text
        WHERE manager_id IS NULL AND admin_user_id IS NOT NULL;
        
        -- Update finance_data
        UPDATE finance_data 
        SET manager_id = manager_user_id::text
        WHERE manager_id IS NULL 
        AND id IN (
            SELECT id FROM finance_data 
            WHERE manager_id IS NULL 
            ORDER BY created_at 
            LIMIT (SELECT COUNT(*)/2 FROM finance_data WHERE manager_id IS NULL)
        );
        
        UPDATE finance_data 
        SET manager_id = admin_user_id::text
        WHERE manager_id IS NULL AND admin_user_id IS NOT NULL;
        
        -- Update transactions
        UPDATE transactions 
        SET manager_id = manager_user_id::text
        WHERE manager_id IS NULL 
        AND id IN (
            SELECT id FROM transactions 
            WHERE manager_id IS NULL 
            ORDER BY created_at 
            LIMIT (SELECT COUNT(*)/2 FROM transactions WHERE manager_id IS NULL)
        );
        
        UPDATE transactions 
        SET manager_id = admin_user_id::text
        WHERE manager_id IS NULL AND admin_user_id IS NOT NULL;
        
    ELSE
        -- If no manager, assign all to admin
        IF admin_user_id IS NOT NULL THEN
            UPDATE products SET manager_id = admin_user_id::text WHERE manager_id IS NULL;
            UPDATE customers SET manager_id = admin_user_id::text WHERE manager_id IS NULL;
            UPDATE quotes SET manager_id = admin_user_id::text WHERE manager_id IS NULL;
            UPDATE orders SET manager_id = admin_user_id::text WHERE manager_id IS NULL;
            UPDATE finance_data SET manager_id = admin_user_id::text WHERE manager_id IS NULL;
            UPDATE transactions SET manager_id = admin_user_id::text WHERE manager_id IS NULL;
        END IF;
    END IF;
END $$;

-- Set default manager_id for new records to be the current user's ID
-- This will be handled in the application code when creating new records