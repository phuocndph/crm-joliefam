INSERT INTO local_workers (employee_code, display_name, worker_type, position_title, employment_type)
VALUES
  ('DAY-001', 'Nguyễn Thị Mai', 'HELPER', 'Phụ chuyền', 'MONTHLY_HELPER'),
  ('HOUR-001', 'Trần Văn Nam', 'CUTTER', 'Thợ cắt', 'HOURLY'),
  ('PIECE-001', 'Lê Thị Hoa', 'SEWER', 'Thợ may', 'PIECE_RATE'),
  ('DEMO-LOCAL', 'Nhân viên Demo Local', 'GENERIC', 'Nhân viên thử nghiệm', 'HOURLY')
ON CONFLICT (employee_code) DO NOTHING;

INSERT INTO local_worker_rates (worker_id, compensation_type, attendance_method, rate_amount, effective_from, unit_basis, reason)
SELECT id, 'MONTHLY_HELPER', 'DAY', 350000, CURRENT_DATE - 30, 'DAY', 'Demo local - ngày công'
FROM local_workers WHERE employee_code = 'DAY-001'
  AND NOT EXISTS (SELECT 1 FROM local_worker_rates r WHERE r.worker_id = local_workers.id AND r.attendance_method = 'DAY');
INSERT INTO local_worker_rates (worker_id, compensation_type, attendance_method, rate_amount, effective_from, unit_basis, reason)
SELECT id, 'HOURLY', 'HOUR', 45000, CURRENT_DATE - 30, 'HOUR', 'Demo local - giờ công'
FROM local_workers WHERE employee_code = 'HOUR-001'
  AND NOT EXISTS (SELECT 1 FROM local_worker_rates r WHERE r.worker_id = local_workers.id AND r.attendance_method = 'HOUR');
INSERT INTO local_worker_rates (worker_id, compensation_type, attendance_method, rate_amount, effective_from, unit_basis, reason)
SELECT id, 'PIECE_RATE', 'OUTPUT', 18000, CURRENT_DATE - 30, 'PIECE', 'Demo local - sản lượng'
FROM local_workers WHERE employee_code = 'PIECE-001'
  AND NOT EXISTS (SELECT 1 FROM local_worker_rates r WHERE r.worker_id = local_workers.id AND r.attendance_method = 'OUTPUT');
INSERT INTO local_worker_rates (worker_id, compensation_type, attendance_method, rate_amount, effective_from, unit_basis, reason)
SELECT id, 'HOURLY', 'HOUR', 40000, CURRENT_DATE - 30, 'HOUR', 'Demo local - giờ công'
FROM local_workers WHERE employee_code = 'DEMO-LOCAL'
  AND NOT EXISTS (SELECT 1 FROM local_worker_rates r WHERE r.worker_id = local_workers.id AND r.attendance_method = 'HOUR');

-- SKU is not globally unique: the same product can exist in multiple price lists.
-- Keep demo rows separate from the imported snapshot and make this seed idempotent.
INSERT INTO local_products (sku, name, category, rate_unit, is_snapshot_record)
SELECT v.sku, v.name, v.category, v.rate_unit, false
FROM (VALUES
  ('AO-SO-MI-001', 'Áo sơ mi demo', 'May mặc', 'PIECE'),
  ('QUAN-001', 'Quần demo', 'May mặc', 'PIECE')
) AS v(sku, name, category, rate_unit)
WHERE NOT EXISTS (
  SELECT 1 FROM local_products p
  WHERE p.sku = v.sku AND p.price_list_id IS NULL AND NOT p.is_snapshot_record
);
INSERT INTO local_product_rates (product_id, rate, rate_unit, effective_from, reason)
SELECT id, 18000, 'PIECE', CURRENT_DATE - 30, 'Demo local - đơn giá sản phẩm'
FROM local_products WHERE sku = 'AO-SO-MI-001' AND price_list_id IS NULL AND NOT is_snapshot_record
  AND NOT EXISTS (SELECT 1 FROM local_product_rates r WHERE r.product_id = local_products.id);
INSERT INTO local_product_rates (product_id, rate, rate_unit, effective_from, reason)
SELECT id, 22000, 'PIECE', CURRENT_DATE - 30, 'Demo local - đơn giá sản phẩm'
FROM local_products WHERE sku = 'QUAN-001' AND price_list_id IS NULL AND NOT is_snapshot_record
  AND NOT EXISTS (SELECT 1 FROM local_product_rates r WHERE r.product_id = local_products.id);

INSERT INTO local_attendance (worker_id, attendance_method, work_date, day_units, rate_amount, calculated_amount, workflow_status, idempotency_key, notes)
SELECT id, 'DAY', CURRENT_DATE - 1, 1, 350000, 350000, 'APPROVED', 'seed-day-001', 'Demo ngày công đã duyệt'
FROM local_workers WHERE employee_code = 'DAY-001'
ON CONFLICT (idempotency_key) DO NOTHING;
INSERT INTO local_attendance (worker_id, attendance_method, work_date, work_hours, check_in_time, check_out_time, break_minutes, rate_amount, calculated_amount, workflow_status, idempotency_key, notes)
SELECT id, 'HOUR', CURRENT_DATE - 1, 8, '08:00', '17:00', 60, 45000, 360000, 'SUBMITTED', 'seed-hour-001', 'Demo giờ công chờ duyệt'
FROM local_workers WHERE employee_code = 'HOUR-001'
ON CONFLICT (idempotency_key) DO NOTHING;
INSERT INTO local_attendance (worker_id, attendance_method, work_date, output_quantity, rate_amount, calculated_amount, workflow_status, idempotency_key, notes)
SELECT id, 'OUTPUT', CURRENT_DATE - 1, 42, 18000, 756000, 'APPROVED', 'seed-output-001', 'Demo sản lượng đã duyệt'
FROM local_workers WHERE employee_code = 'PIECE-001'
ON CONFLICT (idempotency_key) DO NOTHING;
INSERT INTO local_attendance (worker_id, attendance_method, work_date, day_units, rate_amount, calculated_amount, workflow_status, idempotency_key, notes)
SELECT id, 'DAY', CURRENT_DATE, 1, 350000, 350000, 'APPROVED', 'seed-today-day-001', 'Hôm nay: ngày công đã duyệt'
FROM local_workers WHERE employee_code = 'DAY-001'
ON CONFLICT (idempotency_key) DO NOTHING;
INSERT INTO local_attendance (worker_id, attendance_method, work_date, work_hours, check_in_time, check_out_time, break_minutes, rate_amount, calculated_amount, workflow_status, idempotency_key, notes)
SELECT id, 'HOUR', CURRENT_DATE, 8, '08:00', '17:00', 60, 45000, 360000, 'SUBMITTED', 'seed-today-hour-001', 'Hôm nay: giờ công chờ duyệt'
FROM local_workers WHERE employee_code = 'HOUR-001'
ON CONFLICT (idempotency_key) DO NOTHING;
INSERT INTO local_attendance (worker_id, attendance_method, work_date, output_quantity, rate_amount, calculated_amount, workflow_status, idempotency_key, notes)
SELECT id, 'OUTPUT', CURRENT_DATE, 30, 18000, 540000, 'APPROVED', 'seed-today-output-001', 'Hôm nay: sản lượng đã duyệt'
FROM local_workers WHERE employee_code = 'PIECE-001'
ON CONFLICT (idempotency_key) DO NOTHING;

INSERT INTO local_day_statuses (worker_id, work_date, status, meal_eligible, reason, idempotency_key)
SELECT id, CURRENT_DATE - 2, 'ABSENT', false, 'Demo trường hợp nghỉ/vắng', 'seed-day-status-001'
FROM local_workers WHERE employee_code = 'DEMO-LOCAL'
ON CONFLICT (idempotency_key) DO NOTHING;
INSERT INTO local_day_closures (worker_id, work_date, status, reason, idempotency_key)
SELECT id, CURRENT_DATE - 1, 'LEADER_CONFIRMED', 'Demo ngày công đã chốt', 'seed-closure-001'
FROM local_workers WHERE employee_code = 'DAY-001'
ON CONFLICT (idempotency_key) DO NOTHING;
INSERT INTO local_overtime (worker_id, work_date, overtime_type, overtime_minutes, reason, status, idempotency_key)
SELECT id, CURRENT_DATE, 'NORMAL_OVERTIME', 120, 'Đơn hàng cần hoàn thiện gấp', 'SUBMITTED', 'seed-overtime-001'
FROM local_workers WHERE employee_code = 'HOUR-001'
ON CONFLICT (idempotency_key) DO NOTHING;
INSERT INTO local_production_entries (worker_id, product_id, work_date, quantity, rate_amount, calculated_amount, workflow_status, idempotency_key, notes)
SELECT w.id, p.id, CURRENT_DATE - 1, 36, 18000, 648000, 'SUBMITTED', 'seed-entry-001', 'Demo sản lượng sản phẩm chờ duyệt'
FROM local_workers w CROSS JOIN local_products p WHERE w.employee_code = 'PIECE-001' AND p.sku = 'AO-SO-MI-001' AND p.price_list_id IS NULL AND NOT p.is_snapshot_record
ON CONFLICT (idempotency_key) DO NOTHING;
INSERT INTO local_production_entries (worker_id, product_id, work_date, quantity, rate_amount, calculated_amount, workflow_status, idempotency_key, notes)
SELECT w.id, p.id, CURRENT_DATE, 24, 18000, 432000, 'APPROVED', 'seed-entry-approved-001', 'Sản lượng đã duyệt'
FROM local_workers w CROSS JOIN local_products p WHERE w.employee_code = 'PIECE-001' AND p.sku = 'AO-SO-MI-001' AND p.price_list_id IS NULL AND NOT p.is_snapshot_record
ON CONFLICT (idempotency_key) DO NOTHING;
INSERT INTO local_production_entries (worker_id, product_id, work_date, quantity, rate_amount, calculated_amount, workflow_status, workflow_reason, idempotency_key, notes)
SELECT w.id, p.id, CURRENT_DATE, 5, 22000, 110000, 'REJECTED', 'Sai số lượng kiểm hàng', 'seed-entry-rejected-001', 'Sản lượng bị từ chối'
FROM local_workers w CROSS JOIN local_products p WHERE w.employee_code = 'DEMO-LOCAL' AND p.sku = 'QUAN-001' AND p.price_list_id IS NULL AND NOT p.is_snapshot_record
ON CONFLICT (idempotency_key) DO NOTHING;

INSERT INTO local_inventory_warehouses (code, name, address, warehouse_type)
VALUES
  ('WH-MAIN', 'Kho nguyên liệu chính', 'Xưởng Joliefam', 'RAW_MATERIAL'),
  ('WH-FG', 'Kho thành phẩm', 'Xưởng Joliefam', 'FINISHED_GOOD')
ON CONFLICT (code) DO NOTHING;

INSERT INTO local_inventory_items (code, name, item_type, base_unit, category)
VALUES
  ('FAB-COTTON-WHITE', 'Vải cotton trắng demo', 'RAW_MATERIAL', 'METER', 'Vải'),
  ('ZIPPER-20CM', 'Khóa kéo 20cm demo', 'SUPPLY', 'PIECE', 'Phụ liệu'),
  ('PACK-BOX-S', 'Thùng carton size S demo', 'PACKAGING', 'BOX', 'Bao bì')
ON CONFLICT (code) DO NOTHING;

INSERT INTO local_inventory_documents (
  document_number, document_type, status, transaction_at, warehouse_id, description,
  counterparty_name, subtotal, total_amount, confirmed_at, idempotency_key
)
SELECT 'PN-LOCAL-0001', 'OPENING_BALANCE', 'CONFIRMED', now() - interval '2 days', w.id,
  'Tồn đầu kỳ demo local', 'Kho local', 1590000, 1590000, now() - interval '2 days', 'seed-inventory-opening-001'
FROM local_inventory_warehouses w WHERE w.code = 'WH-MAIN'
ON CONFLICT (idempotency_key) DO NOTHING;

INSERT INTO local_inventory_document_lines (document_id, inventory_item_id, quantity, unit, input_unit_cost)
SELECT d.id, i.id, 100, 'METER', 12000
FROM local_inventory_documents d CROSS JOIN local_inventory_items i
WHERE d.idempotency_key = 'seed-inventory-opening-001' AND i.code = 'FAB-COTTON-WHITE'
  AND NOT EXISTS (SELECT 1 FROM local_inventory_document_lines l WHERE l.document_id = d.id AND l.inventory_item_id = i.id);
INSERT INTO local_inventory_document_lines (document_id, inventory_item_id, quantity, unit, input_unit_cost)
SELECT d.id, i.id, 50, 'PIECE', 6000
FROM local_inventory_documents d CROSS JOIN local_inventory_items i
WHERE d.idempotency_key = 'seed-inventory-opening-001' AND i.code = 'ZIPPER-20CM'
  AND NOT EXISTS (SELECT 1 FROM local_inventory_document_lines l WHERE l.document_id = d.id AND l.inventory_item_id = i.id);
INSERT INTO local_inventory_document_lines (document_id, inventory_item_id, quantity, unit, input_unit_cost)
SELECT d.id, i.id, 20, 'BOX', 4500
FROM local_inventory_documents d CROSS JOIN local_inventory_items i
WHERE d.idempotency_key = 'seed-inventory-opening-001' AND i.code = 'PACK-BOX-S'
  AND NOT EXISTS (SELECT 1 FROM local_inventory_document_lines l WHERE l.document_id = d.id AND l.inventory_item_id = i.id);

INSERT INTO local_inventory_movements (
  document_id, inventory_item_id, warehouse_id, movement_kind, quantity_delta, unit,
  unit_cost, value_delta, transaction_at
)
SELECT d.id, l.inventory_item_id, d.warehouse_id, 'OPENING_BALANCE', l.quantity, l.unit,
  l.input_unit_cost, l.quantity * l.input_unit_cost, d.transaction_at
FROM local_inventory_documents d
JOIN local_inventory_document_lines l ON l.document_id = d.id
WHERE d.idempotency_key = 'seed-inventory-opening-001'
  AND NOT EXISTS (SELECT 1 FROM local_inventory_movements m WHERE m.document_id = d.id);

INSERT INTO local_inventory_audit_events (entity_type, entity_id, action, reason)
SELECT 'inventory_documents', d.id, 'CONFIRM', 'Seed dữ liệu tồn kho demo local'
FROM local_inventory_documents d
WHERE d.idempotency_key = 'seed-inventory-opening-001'
  AND NOT EXISTS (SELECT 1 FROM local_inventory_audit_events a WHERE a.entity_id = d.id AND a.action = 'CONFIRM');
