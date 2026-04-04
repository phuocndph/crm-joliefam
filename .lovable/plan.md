

## Sửa PDF xuất bị sai khoảng cách dòng và méo dấu/chữ ký

### Nguyên nhân gốc

Container preview có chiều rộng thay đổi theo cửa sổ trình duyệt (fluid width). Khi `html2canvas` chụp element này rồi scale vào khổ A4, tỉ lệ width/height không khớp → nội dung bị co/giãn, khoảng cách dòng sai, con dấu méo.

### Giải pháp

**File: `src/lib/pdfUtils.ts`**

Trước khi chụp `html2canvas`, tạm thời:
1. **Clone element** ra ngoài viewport (để không ảnh hưởng UI người dùng đang thấy)
2. **Đặt width cố định = 794px** (tương đương A4 ở 96dpi) cho clone
3. Chụp `html2canvas` trên clone → canvas có tỉ lệ đúng A4
4. Xóa clone sau khi chụp xong

Điều này đảm bảo text wrap, line-height, và kích thước ảnh con dấu/chữ ký đều đúng tỉ lệ khi đưa vào PDF.

```text
Luồng hiện tại:
  Element (width tùy ý) → html2canvas → scale vào A4 → méo

Luồng mới:
  Element → Clone (width=794px, off-screen) → html2canvas → scale vào A4 → đúng tỉ lệ
```

### Chi tiết kỹ thuật

Chỉ sửa 1 file `src/lib/pdfUtils.ts`:

- Clone element với `element.cloneNode(true)`
- Đặt `position: absolute, left: -9999px, width: 794px` 
- Append vào `document.body`, chụp canvas, rồi remove
- Giữ nguyên logic phân trang A4 đã có (crop canvas thành từng trang)
- Không cần sửa bất kỳ dialog nào khác vì tất cả đều gọi `exportElementToPDF`

