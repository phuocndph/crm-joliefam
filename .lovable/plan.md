

## Cập nhật "Đề nghị tạm ứng" theo mẫu file DOCX

### Vấn đề hiện tại
Đề nghị tạm ứng hiện tại là mẫu **nội bộ** (gửi Ban Giám đốc, nhân viên tự nhập số tiền). Nhưng theo file mẫu thực tế, đây là tài liệu **gửi khách hàng** để yêu cầu tạm ứng tiền trước khi thực hiện hợp đồng — giống với "Đề nghị thanh toán" nhưng cho đợt tạm ứng.

### Thay đổi chính

**File: `src/components/AdvanceRequestDialog.tsx`** — Viết lại hoàn toàn theo mẫu file DOCX

1. **Dữ liệu tự động từ hợp đồng** (không nhập tay):
   - Tổng giá trị hợp đồng: `contract.total_amount`
   - Số tiền tạm ứng: `contract.deposit_amount` (tiền đặt cọc theo hợp đồng)
   - Tên khách hàng (Kính gửi): `buyer_info.company_name`
   - Ngày ký HĐ: `contract.contract_date`
   - Thông tin chuyển khoản: `seller_info` (tên công ty, MST, ngân hàng)

2. **Bố cục mẫu mới** (theo file DOCX):
   - Header: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM" (không có tên công ty ở trên)
   - Tiêu đề: **"ĐỀ NGHỊ TẠM ỨNG"**
   - Kính gửi: **Tên khách hàng** (không phải Ban Giám đốc)
   - Căn cứ: "Căn cứ Hợp đồng số ... ngày ... giữa [Bên A] và [Bên B]..."
   - Bảng tổng hợp: Tổng giá trị HĐ + Số tiền đề nghị tạm ứng
   - Thông tin chuyển khoản: Tên, MST, STK ngân hàng
   - Ký: Chỉ 1 cột bên phải — **CÔNG TY TNHH GIA LỘC HƯNG PHÁT**

3. **Form nhập liệu đơn giản hóa**:
   - Ngày đề nghị (mặc định hôm nay)
   - Số tiền tạm ứng (mặc định = deposit_amount, cho phép chỉnh)
   - Ghi chú thêm (tùy chọn)
   - Bỏ: requesterName, requesterTitle, reason, repayDeadline

4. **Xuất PDF/Word**: Cập nhật theo layout mới

### Tóm tắt

| Thay đổi | Chi tiết |
|----------|----------|
| Đối tượng gửi | Ban Giám đốc → Khách hàng |
| Số tiền | Nhập tay → Tự động từ deposit_amount |
| Bảng | STT/Nội dung/Số tiền → Tổng HĐ + Số tiền tạm ứng |
| Thông tin CK | Không có → Thêm đầy đủ |
| Chữ ký | 3 cột nội bộ → 1 cột bên phải (công ty) |

