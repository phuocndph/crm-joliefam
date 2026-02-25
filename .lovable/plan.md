

# Kế hoạch: Sửa lỗi "Ngày Cập Nhật Cuối" luôn trả về ngày hiện tại

## Nguyên nhân

Trong `CreateCustomerCareForm.tsx`, khi insert khách hàng (dòng 103-112), trường `last_care_date` **không được truyền vào**. Do đó database sử dụng giá trị mặc định là `now()` (ngày hiện tại), bất kể người dùng chọn ngày nào.

Ngày mà người dùng chọn (`lastUpdateDate`) chỉ được ghi vào `notes` dưới dạng text, không được lưu vào cột `last_care_date`.

## Giải pháp

### File: `src/components/CreateCustomerCareForm.tsx` (Dòng 103-112)

Thêm `last_care_date` vào object insert, sử dụng ngày người dùng đã chọn:

**Trước:**
```typescript
const { data, error } = await supabase
  .from('customers')
  .insert({
    name: formData.customerName,
    notes: structuredNotes,
    assignee_id: formData.assignedTo,
    current_status: formData.currentStatus,
    tags: [formData.source],
    auto_tags: [formData.followUpType],
  });
```

**Sau:**
```typescript
const { data, error } = await supabase
  .from('customers')
  .insert({
    name: formData.customerName,
    notes: structuredNotes,
    assignee_id: formData.assignedTo,
    current_status: formData.currentStatus,
    tags: [formData.source],
    auto_tags: [formData.followUpType],
    last_care_date: lastUpdateDate ? lastUpdateDate.toISOString() : new Date().toISOString(),
  });
```

Nếu người dùng chọn ngày, dùng ngày đó. Nếu không chọn, mặc định là ngày hiện tại.

## Kết quả mong đợi

| Trước | Sau |
|-------|-----|
| Luôn lưu ngày hiện tại (do DB default) | Lưu đúng ngày người dùng đã chọn |

