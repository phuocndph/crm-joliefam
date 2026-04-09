

## Sắp xếp lại thứ tự cột trong bảng đơn hàng

### Thứ tự mới (13 cột)

```text
1. Mã đơn hàng
2. Mã vận đơn
3. Ngày tạo đơn
4. Ngày hẹn trả
5. Tình trạng đơn
6. Tên khách
7. Giá trị đơn hàng
8. Thanh toán
9. Ghi chú
10. Người phụ trách
11. Quản lý
12. Vải đã sử dụng
13. Hành động (sticky)
```

### Thay đổi
- Sắp xếp lại thứ tự các `TableHead` và `TableCell` tương ứng trong `src/components/InlineOrderEditTable.tsx`
- Giữ nguyên cột **Vải đã sử dụng** (đặt sau Quản lý, trước Hành động)
- Không thêm/bỏ cột nào

### File sửa
- `src/components/InlineOrderEditTable.tsx`

