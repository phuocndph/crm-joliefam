

## Plan: Sửa file Word xuất ra

### Vấn đề
1. **Word thiếu phần ký**: Đã ẩn hoàn toàn phần chữ ký trong Word — cần giữ lại text "ĐẠI DIỆN BÊN A" / "ĐẠI DIỆN BÊN B" và "(Ký, ghi rõ họ tên)" nhưng không có khung/border.
2. **Align Left cho tổng cộng**: Các dòng TỔNG CỘNG, VAT, TỔNG GIÁ TRỊ HỢP ĐỒNG trong Word đang `AlignmentType.RIGHT` — cần đổi sang `AlignmentType.LEFT`.

### Thay đổi trong `src/components/ContractPreviewDialog.tsx`

**1. Thêm lại phần chữ ký (text only, không khung) vào Word export** (dòng ~260, trước khi tạo Document):
- Thêm 2 cột text dùng `DocxTable` không border:
  - Cột trái: "ĐẠI DIỆN BÊN A" + "(Ký, ghi rõ họ tên)"
  - Cột phải: "ĐẠI DIỆN BÊN B" + "(Ký, ghi rõ họ tên)"
  - Khoảng trống bên dưới mỗi cột để ký

**2. Đổi alignment các dòng tổng trong bảng sản phẩm Word** (dòng 153-185):
- Các cell chứa text "TỔNG CỘNG:", "VAT (x%):", "TỔNG GIÁ TRỊ HỢP ĐỒNG:" → đổi `alignment: AlignmentType.RIGHT` thành `AlignmentType.LEFT`

