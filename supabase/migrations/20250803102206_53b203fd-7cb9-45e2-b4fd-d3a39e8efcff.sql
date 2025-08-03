-- Thêm nhiều fabric variants với các loại vải khác nhau
INSERT INTO public.fabric_variants (fabric_type_id, variant_name, width_code, weight, color, origin, unit, cost_price, selling_price, fabric_width_id) VALUES
-- T233 variants
((SELECT id FROM fabric_types WHERE name = 'T233'), 'T233 trắng', 'K260', '180g', 'trắng', 'TQ', 'kg', 85000, 120000, (SELECT id FROM fabric_widths WHERE width_code = 'K260')),
((SELECT id FROM fabric_types WHERE name = 'T233'), 'T233 xanh', 'K280', '180g', 'xanh nhạt', 'TQ', 'kg', 85000, 120000, (SELECT id FROM fabric_widths WHERE width_code = 'K280')),

-- T250 variants  
((SELECT id FROM fabric_types WHERE name = 'T250'), 'T250 trắng', 'K260', '200g', 'trắng', 'TQ', 'kg', 95000, 135000, (SELECT id FROM fabric_widths WHERE width_code = 'K260')),
((SELECT id FROM fabric_types WHERE name = 'T250'), 'T250 be', 'K280', '200g', 'be nhạt', 'TQ', 'kg', 95000, 135000, (SELECT id FROM fabric_widths WHERE width_code = 'K280')),

-- T300 variants
((SELECT id FROM fabric_types WHERE name = 'T300'), 'T300 trắng', 'K260', '250g', 'trắng', 'TQ', 'kg', 110000, 155000, (SELECT id FROM fabric_widths WHERE width_code = 'K260')),
((SELECT id FROM fabric_types WHERE name = 'T300'), 'T300 xám', 'K280', '250g', 'xám nhạt', 'TQ', 'kg', 110000, 155000, (SELECT id FROM fabric_widths WHERE width_code = 'K280')),
((SELECT id FROM fabric_types WHERE name = 'T300'), 'T300 hồng', 'K305', '250g', 'hồng phấn', 'TQ', 'kg', 110000, 155000, (SELECT id FROM fabric_widths WHERE width_code = 'K305')),

-- LTH (cotton) variants
((SELECT id FROM fabric_types WHERE name = 'LTH'), 'LTH trắng', 'K260', '160g', 'trắng', 'VN', 'kg', 120000, 170000, (SELECT id FROM fabric_widths WHERE width_code = 'K260')),
((SELECT id FROM fabric_types WHERE name = 'LTH'), 'LTH xanh dương', 'K280', '160g', 'xanh dương', 'VN', 'kg', 125000, 175000, (SELECT id FROM fabric_widths WHERE width_code = 'K280')),

-- Chống thấm variants
((SELECT id FROM fabric_types WHERE name = 'Chống thấm'), 'CT trắng', 'K240', '220g', 'trắng', 'TQ', 'kg', 75000, 110000, (SELECT id FROM fabric_widths WHERE width_code = 'K240')),
((SELECT id FROM fabric_types WHERE name = 'Chống thấm'), 'CT xanh', 'K260', '220g', 'xanh nhạt', 'TQ', 'kg', 75000, 110000, (SELECT id FROM fabric_widths WHERE width_code = 'K260')),

-- 110g variants
((SELECT id FROM fabric_types WHERE name = '110g'), '110g trắng', 'K240', '110g', 'trắng', 'TQ', 'kg', 55000, 85000, (SELECT id FROM fabric_widths WHERE width_code = 'K240')),
((SELECT id FROM fabric_types WHERE name = '110g'), '110g kem', 'K260', '110g', 'kem', 'TQ', 'kg', 55000, 85000, (SELECT id FROM fabric_widths WHERE width_code = 'K260')),

-- 120g variants
((SELECT id FROM fabric_types WHERE name = '120g'), '120g trắng', 'K260', '120g', 'trắng', 'TQ', 'kg', 65000, 95000, (SELECT id FROM fabric_widths WHERE width_code = 'K260')),
((SELECT id FROM fabric_types WHERE name = '120g'), '120g be', 'K280', '120g', 'be', 'TQ', 'kg', 65000, 95000, (SELECT id FROM fabric_widths WHERE width_code = 'K280'));

-- Thêm dữ liệu tồn kho mẫu
INSERT INTO public.fabric_inventory (fabric_variant_id, warehouse_id, current_stock, reserved_stock, minimum_stock, maximum_stock) VALUES
-- Kho Hà Nội
((SELECT id FROM fabric_variants WHERE variant_name = 'T233 trắng'), (SELECT id FROM warehouses WHERE name = 'Kho Hà Nội'), 1500.5, 100, 200, 3000),
((SELECT id FROM fabric_variants WHERE variant_name = 'T233 xanh'), (SELECT id FROM warehouses WHERE name = 'Kho Hà Nội'), 890.25, 50, 150, 2500),
((SELECT id FROM fabric_variants WHERE variant_name = 'T250 trắng'), (SELECT id FROM warehouses WHERE name = 'Kho Hà Nội'), 2100.75, 200, 300, 4000),
((SELECT id FROM fabric_variants WHERE variant_name = 'T250 be'), (SELECT id FROM warehouses WHERE name = 'Kho Hà Nội'), 1250.0, 80, 200, 3000),
((SELECT id FROM fabric_variants WHERE variant_name = 'T300 trắng'), (SELECT id FROM warehouses WHERE name = 'Kho Hà Nội'), 3250.5, 300, 500, 5000),
((SELECT id FROM fabric_variants WHERE variant_name = 'T300 xám'), (SELECT id FROM warehouses WHERE name = 'Kho Hà Nội'), 1875.25, 150, 300, 4000),
((SELECT id FROM fabric_variants WHERE variant_name = 'LTH trắng'), (SELECT id FROM warehouses WHERE name = 'Kho Hà Nội'), 950.75, 100, 200, 2000),
((SELECT id FROM fabric_variants WHERE variant_name = 'CT trắng'), (SELECT id FROM warehouses WHERE name = 'Kho Hà Nội'), 675.5, 50, 100, 1500),

-- Kho Bắc Ninh  
((SELECT id FROM fabric_variants WHERE variant_name = 'T233 trắng'), (SELECT id FROM warehouses WHERE name = 'Kho Bắc Ninh'), 800.25, 50, 150, 2000),
((SELECT id FROM fabric_variants WHERE variant_name = 'T250 trắng'), (SELECT id FROM warehouses WHERE name = 'Kho Bắc Ninh'), 1200.0, 100, 200, 2500),
((SELECT id FROM fabric_variants WHERE variant_name = 'T300 trắng'), (SELECT id FROM warehouses WHERE name = 'Kho Bắc Ninh'), 1850.75, 150, 300, 3500),
((SELECT id FROM fabric_variants WHERE variant_name = 'T300 hồng'), (SELECT id FROM warehouses WHERE name = 'Kho Bắc Ninh'), 450.5, 30, 100, 1000),
((SELECT id FROM fabric_variants WHERE variant_name = 'LTH xanh dương'), (SELECT id FROM warehouses WHERE name = 'Kho Bắc Ninh'), 325.25, 25, 80, 800),
((SELECT id FROM fabric_variants WHERE variant_name = 'CT xanh'), (SELECT id FROM warehouses WHERE name = 'Kho Bắc Ninh'), 590.0, 40, 100, 1200),
((SELECT id FROM fabric_variants WHERE variant_name = '110g trắng'), (SELECT id FROM warehouses WHERE name = 'Kho Bắc Ninh'), 1100.5, 80, 200, 2000),
((SELECT id FROM fabric_variants WHERE variant_name = '120g trắng'), (SELECT id FROM warehouses WHERE name = 'Kho Bắc Ninh'), 750.25, 60, 150, 1500);

-- Thêm các giao dịch mẫu (nhập kho, xuất kho)
INSERT INTO public.fabric_transactions (fabric_variant_id, warehouse_id, transaction_type, quantity, unit_price, total_amount, reference_number, supplier_name, recipient_name, notes, transaction_date) VALUES
-- Giao dịch nhập kho tháng trước
((SELECT id FROM fabric_variants WHERE variant_name = 'T233 trắng'), (SELECT id FROM warehouses WHERE name = 'Kho Hà Nội'), 'inbound', 500.0, 85000, 42500000, 'NK001', 'Công ty TNHH Vải Minh Phát', NULL, 'Nhập kho định kỳ tháng 7', '2025-07-15'),
((SELECT id FROM fabric_variants WHERE variant_name = 'T250 trắng'), (SELECT id FROM warehouses WHERE name = 'Kho Hà Nội'), 'inbound', 800.0, 95000, 76000000, 'NK002', 'Công ty TNHH Vải Minh Phát', NULL, 'Nhập kho định kỳ tháng 7', '2025-07-15'),
((SELECT id FROM fabric_variants WHERE variant_name = 'T300 trắng'), (SELECT id FROM warehouses WHERE name = 'Kho Hà Nội'), 'inbound', 1000.0, 110000, 110000000, 'NK003', 'Xưởng Dệt Hà Đông', NULL, 'Nhập kho đặt hàng mới', '2025-07-20'),

-- Giao dịch xuất kho
((SELECT id FROM fabric_variants WHERE variant_name = 'T233 trắng'), (SELECT id FROM warehouses WHERE name = 'Kho Hà Nội'), 'outbound', 200.0, 120000, 24000000, 'XK001', NULL, 'Xưởng Sản xuất A', 'Xuất vải cho đơn hàng DH001', '2025-07-25'),
((SELECT id FROM fabric_variants WHERE variant_name = 'T250 trắng'), (SELECT id FROM warehouses WHERE name = 'Kho Hà Nội'), 'outbound', 150.0, 135000, 20250000, 'XK002', NULL, 'Xưởng Sản xuất B', 'Xuất vải cho đơn hàng DH002', '2025-07-28'),

-- Giao dịch nhập kho tháng này
((SELECT id FROM fabric_variants WHERE variant_name = 'LTH trắng'), (SELECT id FROM warehouses WHERE name = 'Kho Hà Nội'), 'inbound', 400.0, 120000, 48000000, 'NK004', 'Công ty Vải Cotton Việt', NULL, 'Nhập kho vải cotton chất lượng cao', '2025-08-01'),
((SELECT id FROM fabric_variants WHERE variant_name = 'CT trắng'), (SELECT id FROM warehouses WHERE name = 'Kho Hà Nội'), 'inbound', 300.0, 75000, 22500000, 'NK005', 'Công ty TNHH Vải Chống Thấm', NULL, 'Nhập kho vải chống thấm', '2025-08-02'),

-- Giao dịch điều chỉnh
((SELECT id FROM fabric_variants WHERE variant_name = 'T300 xám'), (SELECT id FROM warehouses WHERE name = 'Kho Hà Nội'), 'adjustment', -25.0, 0, 0, 'DC001', NULL, NULL, 'Điều chỉnh do kiểm kê phát hiện hao hụt', '2025-08-03');

-- Thêm dữ liệu chuyển kho
INSERT INTO public.fabric_transfers (fabric_variant_id, from_warehouse_id, to_warehouse_id, quantity, notes, transfer_date, status, approved_by, received_by) VALUES
-- Chuyển kho đã hoàn thành
((SELECT id FROM fabric_variants WHERE variant_name = 'T233 trắng'), (SELECT id FROM warehouses WHERE name = 'Kho Hà Nội'), (SELECT id FROM warehouses WHERE name = 'Kho Bắc Ninh'), 300.0, 'Chuyển kho do nhu cầu sản xuất tại Bắc Ninh', '2025-07-18', 'completed', 'Nguyễn Văn A', 'Trần Thị B'),
((SELECT id FROM fabric_variants WHERE variant_name = 'T250 trắng'), (SELECT id FROM warehouses WHERE name = 'Kho Hà Nội'), (SELECT id FROM warehouses WHERE name = 'Kho Bắc Ninh'), 200.0, 'Bổ sung tồn kho Bắc Ninh', '2025-07-22', 'completed', 'Nguyễn Văn A', 'Trần Thị B'),

-- Chuyển kho đang trong quá trình
((SELECT id FROM fabric_variants WHERE variant_name = 'T300 trắng'), (SELECT id FROM warehouses WHERE name = 'Kho Hà Nội'), (SELECT id FROM warehouses WHERE name = 'Kho Bắc Ninh'), 400.0, 'Cân bằng tồn kho giữa các kho', '2025-08-02', 'in_transit', 'Nguyễn Văn A', NULL),

-- Chuyển kho chờ duyệt
((SELECT id FROM fabric_variants WHERE variant_name = 'LTH trắng'), (SELECT id FROM warehouses WHERE name = 'Kho Hà Nội'), (SELECT id FROM warehouses WHERE name = 'Kho Bắc Ninh'), 150.0, 'Chuyển vải cotton cho dự án mới', '2025-08-03', 'pending', NULL, NULL);