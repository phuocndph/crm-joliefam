

## Fix thanh cuộn ngang bảng đơn hàng - luôn hiển thị ở cuối viewport

### Vấn đề
Bảng đơn hàng có `max-h-[600px] overflow-auto` → thanh cuộn ngang nằm ở đáy bảng. Khi đang ở đầu bảng, phải cuộn dọc xuống cuối mới thấy thanh cuộn ngang.

### Giải pháp
Tách overflow-x và overflow-y riêng biệt bằng cách dùng 2 wrapper lồng nhau:

1. **Wrapper ngoài**: chỉ cuộn ngang (`overflow-x-auto overflow-y-hidden`) + dùng CSS `position: sticky; bottom: 0` để thanh cuộn ngang luôn dính ở cuối viewport.

2. **Wrapper trong**: chỉ cuộn dọc (`overflow-y-auto overflow-x-hidden max-h-[600px]`), giữ header sticky.

### Thay đổi file `src/components/InlineOrderEditTable.tsx`

Thay container hiện tại (line 400):
```tsx
// Trước:
<div className="rounded-md border max-h-[600px] overflow-auto">

// Sau:
<div className="rounded-md border overflow-x-auto" style={{ position: 'sticky', bottom: 0 }}>
  <div className="max-h-[600px] overflow-y-auto">
```

Thêm đóng `</div>` tương ứng ở cuối component.

Ngoài ra, thêm CSS cho scrollbar luôn hiển thị:
```css
.overflow-x-auto::-webkit-scrollbar {
  height: 12px;
}
```

### Kết quả
- Thanh cuộn ngang luôn nhìn thấy được mà không cần kéo xuống đáy bảng
- Cuộn dọc trong bảng vẫn hoạt động bình thường với header sticky

