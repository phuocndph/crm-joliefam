

## Sửa lỗi PDF xuất bị méo dấu/chữ ký và sai khoảng cách dòng

### Nguyên nhân gốc

1. **PDF tạo ra 1 trang dài thay vì A4 chuẩn** — code hiện tại tính `pdfHeight` theo tỉ lệ ảnh, tạo ra trang PDF có chiều cao tùy ý (không phải A4 297mm). Điều này làm nội dung bị co/giãn khi xem trên các trình đọc PDF.

2. **html2canvas scale + JPEG compression** — `scale: 2` tạo canvas lớn, nhưng khi ép vào 1 trang duy nhất với kích thước tùy ý, ảnh con dấu/chữ ký bị biến dạng.

3. **Khoảng cách dòng** — Container HTML dùng `line-height: 1.7` nhưng padding `p-8` (32px) quá lớn, khi html2canvas chụp toàn bộ và scale xuống PDF thì khoảng cách bị thay đổi.

### Giải pháp

#### 1. PDF xuất đúng khổ A4 với phân trang tự động

Thay vì tạo 1 trang dài, chia canvas thành nhiều trang A4 (210x297mm):

```
A4: width=210mm, height=297mm, margin=15mm
→ contentWidth = 180mm, contentHeight = 267mm
→ Tính số trang = ceil(totalImageHeight / pageContentHeight)
→ Mỗi trang crop đúng phần canvas tương ứng
```

#### 2. Cải thiện html2canvas options

- Dùng `scale: 3` để tăng độ nét
- Dùng `image/png` thay `image/jpeg` để giữ chất lượng ảnh con dấu/chữ ký (không bị artifact JPEG)
- Thêm `allowTaint: false`, `logging: false`

#### 3. Chuẩn hóa khoảng cách trong preview HTML

- Giảm padding container từ `p-8` xuống `p-6` cho vừa khổ A4
- Đảm bảo `line-height: 1.6` đồng nhất
- Thêm `font-size: 13px` cố định cho toàn bộ nội dung

### Files thay đổi

| File | Thay đổi |
|------|----------|
| `ContractPreviewDialog.tsx` | Sửa `handleDownloadPDF` — phân trang A4, PNG, scale 3 |
| `AdvanceRequestDialog.tsx` | Sửa `handleDownloadPDF` — cùng logic phân trang A4 |
| `HandoverReportDialog.tsx` | Sửa `handleDownloadPDF` — cùng logic |
| `PaymentRequestDialog.tsx` | Sửa `handleDownloadPDF` — cùng logic |
| `FrameworkContractDialog.tsx` | Sửa `handleDownloadPDF` — cùng logic |

Logic phân trang A4 sẽ được tách thành hàm helper dùng chung cho tất cả dialog.

