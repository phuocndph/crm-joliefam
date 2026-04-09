

## Nâng cấp cột Ghi chú

### Thay đổi trong `src/components/InlineOrderEditTable.tsx`

**1. Bỏ text mặc định** (line 377)
- Thay `if (!notes) return "Thêm ghi chú...";` → `if (!notes) return null;` để ô trống khi chưa có ghi chú.

**2. Hiển thị đầy đủ text, không bị cắt** (line 392)
- Bỏ `max-w-48` khỏi div hiển thị ghi chú để text không bị giới hạn chiều rộng.

**3. Mở rộng textarea khi edit** (line 314)
- Thay `w-48` → `w-full` để textarea edit cũng hiển thị đầy đủ nội dung.

