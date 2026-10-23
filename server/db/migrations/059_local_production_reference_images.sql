-- Additive only: historical production snapshots are deliberately not backfilled.
ALTER TABLE local_production_order_items ADD COLUMN reference_images jsonb;
ALTER TABLE local_production_order_items ADD CONSTRAINT local_production_reference_images_array
 CHECK (reference_images IS NULL OR
   (jsonb_typeof(reference_images)='array' AND jsonb_array_length(reference_images)<=8
    AND NOT jsonb_path_exists(reference_images,'$[*] ? (@.type() != "string")')));
