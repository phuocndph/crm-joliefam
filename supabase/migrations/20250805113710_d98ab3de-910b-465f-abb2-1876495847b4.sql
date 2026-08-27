-- Update the trigger function to format fabric usage notes with proper line breaks and bullet points
CREATE OR REPLACE FUNCTION update_order_notes_on_fabric_usage()
RETURNS TRIGGER AS $$
DECLARE
    order_rec RECORD;
    fabric_text TEXT := '';
    fabric_rec RECORD;
BEGIN
    -- Get order information
    SELECT * INTO order_rec FROM orders WHERE id = NEW.order_id;
    
    -- Build formatted fabric usage text with bullet points
    FOR fabric_rec IN 
        SELECT 
            ft.name as fabric_name,
            fw.width,
            fv.color,
            fu.quantity_used,
            w.name as warehouse_name
        FROM fabric_usage fu
        JOIN fabric_variants fv ON fu.fabric_variant_id = fv.id
        JOIN fabric_types ft ON fv.fabric_type_id = ft.id
        JOIN fabric_widths fw ON fv.fabric_width_id = fw.id
        JOIN warehouses w ON fu.warehouse_id = w.id
        WHERE fu.order_id = NEW.order_id
        ORDER BY ft.name, fv.color
    LOOP
        -- Add bullet point and format each fabric line
        fabric_text := fabric_text || '• ' || fabric_rec.fabric_name || ' ' || fabric_rec.color || 
                      ' K' || fabric_rec.width || '=' || fabric_rec.quantity_used || 'm' ||
                      ' (' || fabric_rec.warehouse_name || ')' || E'\n';
    END LOOP;
    
    -- Remove the last newline character
    fabric_text := rtrim(fabric_text, E'\n');
    
    -- Update order notes if we have fabric usage
    IF fabric_text != '' THEN
        UPDATE orders 
        SET notes = fabric_text,
            updated_at = NOW()
        WHERE id = NEW.order_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;