-- Explicit sewing-code choice belongs to this production line, not the product master.
alter table local_production_order_items add column sewing_code_selection jsonb;
alter table local_production_order_items add constraint production_item_sewing_selection_shape check (
 sewing_code_selection is null or (
  jsonb_typeof(sewing_code_selection)='object'
  and sewing_code_selection->>'version'='1'
  and sewing_code_selection->>'kind'='ORDER_SELECTION'
  and sewing_code_selection->>'rate_unit'='PIECE'
  and length(sewing_code_selection->>'piece_rate_code') between 1 and 200
  and sewing_code_selection->>'item_fingerprint' ~ '^[a-f0-9]{64}$'
  and sewing_code_selection->>'code_semantic_fingerprint' ~ '^[a-f0-9]{64}$'
  and ((sewing_code_selection->>'requirement_id' is null and sewing_code_selection->>'requirement_version' is null and sewing_code_selection->>'requirement_content_hash' is null) or (sewing_code_selection->>'requirement_id' is not null and (sewing_code_selection->>'requirement_version')::integer>0 and sewing_code_selection->>'requirement_content_hash' ~ '^[a-f0-9]{64}$'))
  and sewing_code_selection ?& array['selected_by','selected_for_date','requirement_id','requirement_version']
 ) is true
);
create function protect_production_item_sewing_selection() returns trigger language plpgsql as $$
begin
 if new.sewing_code_selection is distinct from old.sewing_code_selection then
  raise exception 'Sewing-code selection is immutable; create a new production line for a changed choice';
 end if;
 return new;
end $$;
create trigger production_item_sewing_selection_immutable before update of sewing_code_selection
 on local_production_order_items for each row execute function protect_production_item_sewing_selection();
revoke all on function protect_production_item_sewing_selection() from public;
