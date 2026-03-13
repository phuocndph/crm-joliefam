

## Plan: Thêm tính năng Biên bản Bàn giao & Đề nghị Thanh toán

### Tổng quan
Thêm 2 loại tài liệu mới có thể tạo từ hợp đồng đã có:
1. **Biên bản bàn giao** (BBBG) — xác nhận hoàn thành giao hàng/lắp đặt
2. **Đề nghị thanh toán** (ĐNTT) — yêu cầu thanh toán các đợt theo hợp đồng

Cả hai tài liệu đều **tự động lấy dữ liệu từ hợp đồng** (Bên A, Bên B, sản phẩm, giá trị, đợt thanh toán) — người dùng chỉ cần bổ sung thông tin cụ thể.

### Cách tiếp cận
Không tạo bảng DB mới. Tài liệu được **generate trực tiếp từ dữ liệu hợp đồng** dưới dạng preview + xuất PDF/Word/In, tương tự cách ContractPreviewDialog hoạt động hiện tại.

### Chi tiết kỹ thuật

#### 1. Component `HandoverReportDialog.tsx` — Biên bản Bàn giao
- Props: `contract` (dữ liệu hợp đồng), `open`, `onOpenChange`
- Tự động điền từ hợp đồng: số HĐ, Bên A (seller_info), Bên B (buyer_info/customers), danh sách sản phẩm (items), ngày ký
- Cho phép user nhập thêm: ngày bàn giao, ghi chú tình trạng, người đại diện ký
- Nội dung chuẩn: Căn cứ HĐ → Nội dung bàn giao (bảng SP) → Kết luận (đạt/không đạt) → Chữ ký 2 bên
- Hỗ trợ: In, xuất PDF, xuất Word (docx)

#### 2. Component `PaymentRequestDialog.tsx` — Đề nghị Thanh toán
- Props: `contract` (dữ liệu hợp đồng), `open`, `onOpenChange`
- Tự động tính từ hợp đồng: tổng giá trị, tiền đặt cọc (deposit_amount), số tiền còn lại, đợt thanh toán (từ payment_terms trong template)
- Cho phép user chọn: đợt thanh toán nào, ngày đề nghị, thông tin chuyển khoản
- Nội dung chuẩn: Kính gửi → Căn cứ HĐ → Bảng tổng hợp thanh toán → Thông tin chuyển khoản Bên A → Chữ ký
- Hỗ trợ: In, xuất PDF, xuất Word

#### 3. Tích hợp vào `ContractManagement.tsx`
- Thêm 2 menu item mới vào DropdownMenu của mỗi hợp đồng:
  - "Biên bản bàn giao" (icon: ClipboardCheck)
  - "Đề nghị thanh toán" (icon: Receipt)
- Thêm state: `handoverContract`, `paymentRequestContract`
- Render 2 dialog mới

#### 4. Tích hợp vào `ContractPreviewDialog.tsx`
- Thêm 2 nút action ở header: "Tạo BB bàn giao", "Đề nghị thanh toán" để mở trực tiếp từ preview

### Không thay đổi
- Database — không cần bảng mới, dữ liệu lấy trực tiếp từ contracts
- Edge functions — không cần
- RLS — không thay đổi

