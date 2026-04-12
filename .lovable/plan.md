

## Cố định cột Ghi chú luôn hiển thị

### Vấn đề
Cột "Ghi chú" nằm gần cuối bảng (cột thứ 9/10), khi cuộn ngang sẽ bị ẩn. Người kiểm soát đơn cần luôn nhìn thấy ghi chú mà không phải cuộn.

### Giải pháp
Cố định (sticky) cột "Ghi chú" ở bên phải, ngay trước cột hành động "⋯" (đã sticky sẵn). Cả hai cột sẽ dính bên phải khi cuộn ngang.

### Chi tiết kỹ thuật

**File: `src/components/InlineOrderEditTable.tsx`**

1. **Header cột Ghi chú** (dòng 470): thêm `sticky right-[80px]` và `z-20` + shadow để tách biệt với phần cuộn
2. **Cell Ghi chú** (dòng 562): thêm `sticky right-[80px]` + background color match zebra striping để không bị trong suốt khi cuộn
3. **Cột hành động** (đã sticky `right-0`): giữ nguyên, nâng z-index nếu cần

Layout sticky bên phải:
```text
[... các cột cuộn tự do ...] | Ghi chú (sticky right-[80px]) | ⋯ (sticky right-0)
```

