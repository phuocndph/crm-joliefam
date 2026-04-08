

## Làm lại nội dung Đề nghị Thanh toán cho chuyên nghiệp

### Các thay đổi nội dung

Hiện tại văn bản thiếu số hiệu công văn, thiếu thông tin địa chỉ/đại diện bên mua-bán, câu từ chưa theo đúng mẫu công văn hành chính. Sẽ cải thiện toàn diện cả phần preview HTML và phần xuất Word.

**File sửa: `src/components/PaymentRequestDialog.tsx`**

#### 1. Bổ sung header công ty bên trái + quốc hiệu bên phải (đúng mẫu công văn VN)

```text
[Bên trái]                              [Bên phải]
CÔNG TY TNHH GIA LỘC HƯNG PHÁT        CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
Số: .../ĐNTT-GLHP                       Độc lập – Tự do – Hạnh phúc
                                         ————————
                                         TP.HCM, ngày ... tháng ... năm ...
```

#### 2. Cải thiện phần thân văn bản
- Thêm "V/v: Đề nghị thanh toán theo Hợp đồng số ..."
- Thêm đoạn giới thiệu bên đề nghị: tên công ty, MST, địa chỉ, người đại diện
- Thêm thông tin bên được đề nghị: tên công ty, địa chỉ
- Câu dẫn chuyên nghiệp hơn: "Căn cứ Hợp đồng kinh tế số ... ký ngày ... giữa hai bên về việc cung cấp hàng hóa, Bên A kính đề nghị Bên B thanh toán khoản tiền theo bảng chi tiết dưới đây:"

#### 3. Bảng thanh toán - thêm cột STT và mở rộng
| STT | Nội dung | Thành tiền |
|-----|----------|------------|
| 1 | Tổng giá trị hợp đồng | ... |
| 2 | Đã thanh toán đợt 1 (đặt cọc X%) | ... |
| 3 | **Số tiền đề nghị thanh toán đợt này** | ... |

#### 4. Phần thông tin chuyển khoản - format rõ ràng hơn
- Tách riêng: Tên TK, Số TK, Ngân hàng, Chi nhánh (parse từ `sellerBank`)
- "Nội dung chuyển khoản" thay cho "Nội dung CK"

#### 5. Phần kết - câu từ đúng mực
- "Kính đề nghị Quý Công ty/Đơn vị sắp xếp thanh toán theo thông tin nêu trên. Mọi thắc mắc xin vui lòng liên hệ theo số điện thoại: ... để được hỗ trợ."
- "Trân trọng cảm ơn sự hợp tác của Quý khách hàng./"

#### 6. Phần ký - đúng mẫu
- Bên trái: "ĐẠI DIỆN BÊN A" (Ký, đóng dấu, ghi rõ họ tên)
- Bên phải: "ĐẠI DIỆN BÊN B" (Ký, đóng dấu, ghi rõ họ tên)

#### 7. Thêm state cho số công văn
- Thêm input `documentNumber` trong phần editable fields để nhập số công văn

#### 8. Đồng bộ Word export
- Cập nhật `handleDownloadWord` với cùng nội dung mới, bao gồm header 2 cột, bảng có STT, câu từ mới

### Kết quả
Văn bản Đề nghị thanh toán sẽ theo đúng chuẩn công văn hành chính Việt Nam, chuyên nghiệp, đầy đủ thông tin pháp lý, phù hợp gửi cho đối tác/khách hàng.

