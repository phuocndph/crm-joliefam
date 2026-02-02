
# Kế hoạch: Đảm bảo quyền nhân viên và quản lý với báo giá

## Tóm tắt vấn đề

Hiện tại hệ thống đã có RLS policies đúng, nhưng cần đảm bảo:
1. Nhân viên có thể **xem và chọn** bảng giá khi tạo báo giá
2. Nhân viên có thể **tạo và xem** báo giá (không xóa)
3. Quản lý có toàn quyền với báo giá của mình

---

## Phân tích RLS hiện tại

### Bảng `price_lists`:
| Role | SELECT | INSERT | UPDATE | DELETE |
|------|--------|--------|--------|--------|
| Admin | ✅ Tất cả | ✅ | ✅ | ✅ |
| Manager | ✅ Của mình | ✅ Của mình | ✅ Của mình | ✅ Của mình |
| Employee | ✅ Của manager | ❌ | ❌ | ❌ |
| Accountant | ✅ Tất cả | ❌ | ❌ | ❌ |

### Bảng `quotes`:
| Role | SELECT | INSERT | UPDATE | DELETE |
|------|--------|--------|--------|--------|
| Admin | ✅ Tất cả | ✅ | ✅ | ✅ |
| Manager | ✅ Của mình | ✅ Của mình | ✅ Của mình | ✅ Của mình |
| Employee | ✅ Của manager | ✅ Của manager | ✅ Của manager | ✅ Của manager |
| Accountant | ✅ Tất cả | ✅ | ✅ | ✅ |

---

## Các thay đổi cần thực hiện

### Thay đổi 1: Giới hạn quyền DELETE của nhân viên với quotes

Hiện tại nhân viên có thể xóa báo giá - cần loại bỏ quyền này để chỉ manager/admin mới có thể xóa.

**SQL Migration:**
```sql
-- Drop existing employee delete policy
DROP POLICY IF EXISTS "Employees can delete their manager's quotes" ON quotes;

-- Không tạo lại policy delete cho employee
-- Employees chỉ có thể: SELECT, INSERT, UPDATE
```

### Thay đổi 2: Cập nhật UI để ẩn nút xóa với nhân viên

Trong `QuotesPage.tsx`, thêm kiểm tra role trước khi hiển thị các action buttons:

| Action | Admin | Manager | Employee |
|--------|-------|---------|----------|
| Xem | ✅ | ✅ | ✅ |
| Nhân bản | ✅ | ✅ | ✅ |
| Báo giá phụ | Theo permission | Theo permission | Theo permission |
| Duyệt báo giá | ✅ | ✅ | ❌ |
| Từ chối | ✅ | ✅ | ❌ |
| Sửa | ✅ | ✅ | ✅ |
| Sửa ngày & trạng thái | ✅ | ✅ | ❌ |
| Xóa | ✅ | ✅ | ❌ |

### Thay đổi 3: Ẩn nút cài đặt template với nhân viên

Chỉ manager/admin mới có thể thay đổi template settings.

---

## Chi tiết file thay đổi

### File 1: `supabase/migrations/[new].sql`
- Xóa policy "Employees can delete their manager's quotes"
- Đảm bảo employee không có quyền delete quotes

### File 2: `src/pages/QuotesPage.tsx`
Thêm logic kiểm tra role để ẩn/hiện các action:

```tsx
// Kiểm tra xem user có phải manager hoặc admin không
const isManagerOrAdmin = userRole === 'manager' || userRole === 'admin';

// Trong dropdown menu:
{isManagerOrAdmin && quote.status === 'draft' && (
  <DropdownMenuItem onClick={() => handleApproveQuote(quote)}>
    <CheckCircle className="mr-2 h-4 w-4" />
    Duyệt báo giá
  </DropdownMenuItem>
)}

{isManagerOrAdmin && (
  <DropdownMenuItem onClick={() => handleDeleteQuote(quote.id)}>
    <Trash2 className="mr-2 h-4 w-4" />
    Xóa
  </DropdownMenuItem>
)}
```

Ẩn nút "Cài đặt Template" với nhân viên:
```tsx
{isManagerOrAdmin && (
  <Button variant="outline" onClick={() => setShowTemplateSettings(true)}>
    <Settings className="h-4 w-4" />
    Cài đặt Template
  </Button>
)}
```

---

## Kết quả mong đợi

| Chức năng | Nhân viên | Quản lý |
|-----------|-----------|---------|
| Xem danh sách báo giá | ✅ | ✅ |
| Chọn bảng giá khi tạo báo giá | ✅ | ✅ |
| Tạo báo giá mới | ✅ | ✅ |
| Sửa nội dung báo giá | ✅ | ✅ |
| Nhân bản báo giá | ✅ | ✅ |
| Duyệt báo giá | ❌ | ✅ |
| Từ chối báo giá | ❌ | ✅ |
| Sửa ngày & trạng thái | ❌ | ✅ |
| Xóa báo giá | ❌ | ✅ |
| Cài đặt template | ❌ | ✅ |

---

## Thứ tự thực hiện

1. **Migration** - Xóa policy delete của employee trên quotes
2. **QuotesPage.tsx** - Cập nhật UI ẩn/hiện actions theo role
3. **Kiểm tra** - Test với tài khoản employee và manager

---

## Lưu ý kỹ thuật

- RLS policy cho price_lists đã đúng: employee chỉ có SELECT
- Trigger `set_manager_id` sẽ tự động set manager_id đúng khi employee tạo báo giá
- Không cần thay đổi CreateQuoteForm vì logic đã đúng
