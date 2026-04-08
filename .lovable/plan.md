

## Sửa nội dung Đề nghị Thanh toán — Header & Câu từ

### Các vấn đề hiện tại

**Header/Quốc hiệu:**
- Quốc hiệu phải ở BÊN TRÁI (theo đúng mẫu công văn hành chính VN: đơn vị ban hành ở trái, quốc hiệu ở phải — nhưng thực tế mẫu ĐNTT doanh nghiệp thường đặt tên công ty trái, quốc hiệu phải). Tuy nhiên vấn đề chính: font size quá nhỏ (`text-sm`, `text-xs`), thiếu dòng kẻ phân cách, "Số: .../ĐNTT" nên có suffix tên viết tắt công ty
- Dòng "————————" nên thay bằng dòng kẻ thực sự dưới "Độc lập – Tự do – Hạnh phúc"
- Thiếu khoảng cách giữa header và title

**Câu từ/ngữ pháp:**
- "Bên đề nghị (Bên A)" — trong ĐNTT, bên gửi không tự gọi là "Bên A/B", đây không phải hợp đồng. Nên dùng: "Đơn vị đề nghị" và "Đơn vị được đề nghị thanh toán"
- Câu dẫn "Căn cứ Hợp đồng kinh tế số..." dùng "Bên A kính đề nghị Bên B" — sai ngữ cảnh vì ĐNTT là công văn đơn phương, không phải thỏa thuận 2 bên
- "Trân trọng cảm ơn sự hợp tác của Quý khách hàng./" — dấu "/" cuối câu không đúng chuẩn, nên là "Trân trọng./"
- Phần "Kính gửi" nên gộp thông tin bên được đề nghị vào đó, không tách riêng

### Thay đổi cụ thể

**File: `src/components/PaymentRequestDialog.tsx`**

#### 1. Header — cải thiện format
- Tăng font size cho tên công ty và quốc hiệu (14px thay vì text-sm)
- Thay "————————" bằng border-bottom thực trên dòng "Độc lập – Tự do – Hạnh phúc"
- Suffix số công văn: `Số: .../ĐNTT-GLHP` (lấy viết tắt từ tên công ty)

#### 2. Câu từ — sửa đúng ngữ cảnh ĐNTT
- Bỏ "Bên A/Bên B", thay bằng tên đơn vị cụ thể
- Sửa câu dẫn: "Căn cứ Hợp đồng số {số} ký ngày {ngày} giữa hai bên về việc cung cấp hàng hóa, {tên công ty} kính đề nghị Quý Công ty thanh toán số tiền theo bảng chi tiết dưới đây:"
- Sửa "Bên đề nghị (Bên A)" → "Đơn vị đề nghị thanh toán"
- Phần kết: "Kính đề nghị Quý Công ty/Đơn vị sắp xếp thanh toán đúng hạn theo thông tin nêu trên." + "Trân trọng./"
- Phần ký: "ĐẠI DIỆN BÊN BÁN" và "XÁC NHẬN BÊN MUA" thay cho "BÊN A/BÊN B"

#### 3. Đồng bộ Word export
- Cập nhật `handleDownloadWord` với cùng câu từ mới, format header mới

### Tóm tắt files thay đổi

| File | Thay đổi |
|------|----------|
| `src/components/PaymentRequestDialog.tsx` | Sửa header format, câu từ đúng ngữ cảnh ĐNTT, đồng bộ Word |

