

# Sửa lỗi: Ghi chú tự động nhảy khi nhập số đơn hàng

## Nguyên nhân

Trong `src/components/FabricUsageRecording.tsx`, hàm `handleOrderNumberChange` (dòng 72-91) tự động điền vào ô ghi chú mỗi khi nhập số đơn hàng:

- Dòng 80: `notes: 'Xuất vải cho đơn hàng ${orderNumber} - ${order.customers?.name}'` (khi tìm thấy đơn)
- Dòng 86: `notes: 'Xuất vải cho đơn hàng ${orderNumber}'` (khi không tìm thấy)

## Giải pháp

Xóa việc tự động điền `notes` trong hàm `handleOrderNumberChange`. Ghi chú mặc định đã được tạo khi submit (dòng 176) nên không cần điền trước.

### File: `src/components/FabricUsageRecording.tsx`

**Dòng 78-81** - Khi tìm thấy đơn hàng, bỏ trường `notes`:
```typescript
// Trước:
setFormData(prev => ({
  ...prev,
  order_id: order.id,
  customer_name: order.customers?.name || '',
  notes: `Xuất vải cho đơn hàng ${orderNumber} - ${order.customers?.name || 'Khách hàng'}`
}));

// Sau:
setFormData(prev => ({
  ...prev,
  order_id: order.id,
  customer_name: order.customers?.name || '',
}));
```

**Dòng 83-88** - Khi không tìm thấy đơn, bỏ trường `notes`:
```typescript
// Trước:
setFormData(prev => ({
  ...prev,
  order_id: '',
  customer_name: '',
  notes: `Xuất vải cho đơn hàng ${orderNumber}`
}));

// Sau:
setFormData(prev => ({
  ...prev,
  order_id: '',
  customer_name: '',
}));
```

Người dùng vẫn có thể tự nhập ghi chú nếu muốn, và khi submit nếu ghi chú trống sẽ tự động tạo ghi chú mặc định.
