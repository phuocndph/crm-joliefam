-- Add tables to supabase_realtime publication for real-time sync
-- These tables were missing from the publication, causing CHANNEL_ERROR

-- Fabric management tables (HIGH priority)
ALTER PUBLICATION supabase_realtime ADD TABLE fabric_inventory;
ALTER PUBLICATION supabase_realtime ADD TABLE fabric_transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE fabric_usage;
ALTER PUBLICATION supabase_realtime ADD TABLE fabric_variants;
ALTER PUBLICATION supabase_realtime ADD TABLE fabric_transfers;

-- Fabric reference tables (MEDIUM priority)
ALTER PUBLICATION supabase_realtime ADD TABLE fabric_types;
ALTER PUBLICATION supabase_realtime ADD TABLE fabric_widths;
ALTER PUBLICATION supabase_realtime ADD TABLE warehouses;

-- Order/Payment tables (HIGH priority)
ALTER PUBLICATION supabase_realtime ADD TABLE order_payments;

-- Other important tables
ALTER PUBLICATION supabase_realtime ADD TABLE assignees;
ALTER PUBLICATION supabase_realtime ADD TABLE ghn_tracking;
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE expenses;
ALTER PUBLICATION supabase_realtime ADD TABLE price_lists;