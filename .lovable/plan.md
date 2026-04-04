

## Căn chỉnh con dấu & chữ ký online

### Vấn đề
- **Opacity quá thấp**: Con dấu 0.85, chữ ký 0.9 → nhợt nhạt, không giống ảnh gốc
- **Chữ ký quá bé**: Chỉ 100x70px, cần tăng lên
- **Con dấu nhỏ**: 120x120px, cần tăng để rõ ràng hơn

### Thay đổi (1 file: `OnlineStampSignature.tsx`)

| Thuộc tính | Hiện tại | Sửa thành |
|-----------|----------|-----------|
| Chiều cao vùng ký | 120px | 160px |
| Con dấu size | 120x120 | 160x160 |
| Con dấu opacity | 0.85 | 1.0 |
| Chữ ký size | 100x70 | 140x100 |
| Chữ ký opacity | 0.9 | 1.0 |
| Vị trí con dấu | left 15% | left 5% |
| Vị trí chữ ký | left 35% | left 30% |

Bỏ hoàn toàn opacity để giữ nguyên màu sắc như ảnh gốc đã upload.

