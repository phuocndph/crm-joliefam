

# Kế hoạch: Sửa lỗi EditCustomerCareDialog không load đúng dữ liệu đã lưu

## Nguyên nhân gốc

Có **3 vấn đề chính** khiến form chỉnh sửa không hiển thị đúng dữ liệu:

### 1. `assignedTo` đọc sai cột
- **Create** lưu vào `assignee_id` (đúng)
- **Edit** đọc từ `customer.manager_id` (sai) --> nên đọc từ `customer.assignee_id`
- **Edit** update cũng ghi vào `manager_id` (sai) --> nên ghi vào `assignee_id`

### 2. `followUpType` không được load lại
- **Create** lưu vào `auto_tags[0]` 
- **Edit** đọc từ `customer.follow_up_type` (cột không tồn tại) --> nên đọc từ `customer.auto_tags[0]`
- **Edit** không lưu `auto_tags` khi update

### 3. `closingScore` và `nextAction` bị nhúng trong notes
- **Create** nhúng closingScore, nextAction vào chuỗi `notes`
- **Edit** đọc từ `customer.closing_score` và `customer.next_action` (không tồn tại) --> cần parse ngược từ notes

### 4. `last_care_date` không được lưu khi update
- **Edit** đọc `lastUpdateDate` từ `updated_at` thay vì `last_care_date`
- **Edit** không ghi `last_care_date` khi update

---

## Giải pháp

### File: `src/components/EditCustomerCareDialog.tsx`

**A. Sửa Customer interface** - thêm các trường thiếu:
```typescript
interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  manager_id: string | null;
  assignee_id: string | null;     // THÊM
  tags: string[] | null;
  auto_tags: string[] | null;     // THÊM
  notes: string | null;
  current_status: string | null;  // THÊM
  last_care_date: string | null;  // THÊM
  created_at: string;
  updated_at: string;
}
```

**B. Sửa useEffect load dữ liệu** (dòng 88-101):
- `assignedTo`: đọc từ `customer.assignee_id` thay vì `customer.manager_id`
- `followUpType`: đọc từ `customer.auto_tags[0]` thay vì `customer.follow_up_type`
- `closingScore` và `nextAction`: parse từ `customer.notes` bằng regex
- `lastUpdateDate`: đọc từ `customer.last_care_date` thay vì `customer.updated_at`
- `notes`: chỉ lấy phần ghi chú thực, bỏ phần structured data

**C. Sửa handleSubmit update** (dòng 146-155):
Thêm các trường thiếu vào update:
```typescript
.update({
  name: formData.customerName,
  notes: structuredNotes,        // Ghi notes có cấu trúc giống Create
  assignee_id: formData.assignedTo,  // Sửa từ manager_id
  tags: formData.source ? [formData.source] : null,
  current_status: formData.currentStatus,
  auto_tags: [formData.followUpType],  // THÊM
  last_care_date: lastUpdateDate?.toISOString(),  // THÊM
})
```

---

## Kết quả mong đợi

| Trường | Trước (lỗi) | Sau (đúng) |
|--------|------------|-----------|
| Người phụ trách | Đọc/ghi sai cột `manager_id` | Đọc/ghi đúng `assignee_id` |
| Theo dõi KH | Luôn mặc định "Liên hệ lần đầu" | Load đúng từ `auto_tags` |
| Điểm đánh giá | Luôn trống | Parse từ notes |
| Hành động tiếp theo | Luôn trống | Parse từ notes |
| Ngày cập nhật cuối | Hiện `updated_at` | Hiện đúng `last_care_date` |
| Khi lưu | Mất auto_tags, last_care_date | Lưu đầy đủ tất cả |

