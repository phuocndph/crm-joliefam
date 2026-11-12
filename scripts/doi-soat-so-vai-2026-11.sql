-- Doi soat so vai 11/2026: chay duoc nhieu lan (idempotent).
-- 1) Gan lai fabric_usage_id cho giao dich xuat cu khop dung 1-1 voi phieu xuat.
-- 2) Lap phieu dieu chinh "chi so cai" cho 11 dong ton da ro nguyen nhan: KHONG doi so ton,
--    chi them giao dich de tong giao dich = ton dang hien.
-- 3) Danh dau 41 phieu chuyen kho cu "pending" la "completed" (ton da doi luc lap phieu).
BEGIN;

with u as (
  select x.id, x.fabric_variant_id, x.warehouse_id, x.quantity_used, coalesce(x.order_number,'') ref,
         row_number() over (partition by x.fabric_variant_id, x.warehouse_id, round(x.quantity_used,4), coalesce(x.order_number,'') order by x.usage_date nulls last, x.id) rn
  from local_fabric_usage x
  where not exists (select 1 from local_fabric_transactions t where t.fabric_usage_id = x.id)
), t as (
  select t.id, t.fabric_variant_id, t.warehouse_id, -t.quantity q, coalesce(t.reference_number,'') ref,
         row_number() over (partition by t.fabric_variant_id, t.warehouse_id, round(-t.quantity,4), coalesce(t.reference_number,'') order by t.transaction_date nulls last, t.id) rn
  from local_fabric_transactions t
  where t.fabric_usage_id is null and t.transaction_type = 'outbound'
), pair as (
  select u.id usage_id, t.id tx_id from u join t
    on t.fabric_variant_id = u.fabric_variant_id and t.warehouse_id = u.warehouse_id
   and round(t.q,4) = round(u.quantity_used,4) and t.ref = u.ref and t.rn = u.rn
)
update local_fabric_transactions tx set fabric_usage_id = pair.usage_id, local_modified_at = now(), updated_at = now()
from pair where tx.id = pair.tx_id;

with reasons(inventory_id, reason) as (values
  ('df05752f-dbf2-40bc-b3bc-3ba3f2e18317', 'Phiếu "chốt lại vải" 06/07 (1.938,18 m) đã xoá ở sổ xuất nhưng giao dịch còn; đơn 4824 sửa 16,5 thành 165; đơn 4010/4040 sửa 500 thành 501'),
  ('0f24dfe9-8526-46b7-948e-344f3aee0698', 'Phiếu nhập 442 m ngày 02/07 bị ghi 2 giao dịch, tồn chỉ cộng 1 lần'),
  ('ed411a80-29d8-428e-9ed0-cc553c568303', 'Giao dịch xuất đơn "2" ngày 22/06 (227 m) còn, dòng xuất đã xoá'),
  ('10519a03-4492-4e7c-9a3e-b4da1eb83a78', 'Chuyển 100 m sang Bắc Ninh 23/01 không ghi giao dịch; xuất đơn 2831 (182 m) đã xoá ở sổ xuất nhưng giao dịch còn'),
  ('2b6cc5f2-d669-44a2-b21b-5d93fc637172', 'Đơn 4730 sửa 28,3 thành 76,4, giao dịch giữ số cũ'),
  ('94c1d967-d05d-42c6-aef8-092b8f73d645', 'Đơn 3982 sửa 8 thành 13, giao dịch giữ số cũ'),
  ('261e6449-9a92-40b0-bbfc-28b587002581', 'Xuất đơn 2862 (4,3 m) đã xoá nhưng giao dịch còn; đơn 4054 sửa 8,5 thành 8,05'),
  ('02010fe3-9b87-43d2-8f4d-ffc4299662a2', 'Xuất đơn 2862 (4,3 m) đã xoá nhưng giao dịch còn'),
  ('44854da5-5cee-4237-bce2-dc229b13d86c', 'Đơn 2700 sửa 38 thành 39, giao dịch giữ số cũ'),
  ('3093f425-edd3-4004-a5e3-ccfb418d1d71', 'Đơn 4588 sửa 36 thành 37, giao dịch giữ số cũ'),
  ('4fa268a2-012d-4803-b426-cb948e1fe9e9', 'Đơn 2415 sửa 44,4 thành 44, giao dịch giữ số cũ')
), gap as (
  select i.id inventory_id, i.fabric_variant_id, i.warehouse_id, r.reason,
         i.current_stock - coalesce((select sum(t.quantity) from local_fabric_transactions t
           where t.fabric_variant_id = i.fabric_variant_id and t.warehouse_id = i.warehouse_id), 0) diff
  from local_fabric_inventory i join reasons r on r.inventory_id = i.id
)
insert into local_fabric_transactions(id,fabric_variant_id,warehouse_id,transaction_type,quantity,packages_count,unit_price,total_amount,reference_number,notes,transaction_date,manager_id,tenant_id,is_snapshot_record,local_modified_at,created_at,updated_at)
select gen_random_uuid()::text, g.fabric_variant_id, g.warehouse_id, 'adjustment', round(g.diff,4), 0, null, null,
       'DOI-SOAT-2026-11', 'Đối soát sổ cái, không đổi tồn: ' || g.reason, now(), 'javis-doi-soat', 'local-tenant', false, now(), now(), now()
from gap g
where abs(g.diff) > 0.0001
  and not exists (select 1 from local_fabric_transactions t where t.reference_number = 'DOI-SOAT-2026-11'
                  and t.fabric_variant_id = g.fabric_variant_id and t.warehouse_id = g.warehouse_id);

update local_fabric_transfers
   set status = 'completed',
       notes = coalesce(notes || ' ', '') || '(11/11/2026: đánh dấu hoàn tất, tồn đã đổi lúc lập phiếu)',
       local_modified_at = now(), updated_at = now()
 where status = 'pending';

COMMIT;
