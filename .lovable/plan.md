

## Cải thiện giao diện Dropdown chọn loại vải

### Vấn đề hiện tại

Dropdown chọn loại vải trong form "Ghi nhận sử dụng vải" có giao diện rối mắt:
- Mỗi item hiển thị 2 dòng riêng biệt (tên biến thể + số lượng tồn) khiến danh sách dài và khó đọc
- Thiếu phân tách rõ ràng giữa các nhóm loại vải
- Styling chưa tối ưu cho việc scan nhanh

### Giải pháp

Cải thiện UI của `SearchableFabricSelect` component để dễ nhìn và chuyên nghiệp hơn:

**1. Đổi layout từ 2 dòng sang 1 dòng:**

Thay vì:
```
120g Trắng
Còn lại: 0m
```

Thành:
```
120g Trắng • 0m
```

**2. Thêm visual indicators:**
- Badge màu cho số lượng tồn (xanh nếu > 0, đỏ nếu = 0)
- Icon check rõ ràng hơn cho item đã chọn
- Separator giữa các nhóm

**3. Cải thiện typography:**
- Tăng font weight cho tên vải
- Màu sắc phân biệt rõ giữa tên và số lượng
- Padding và spacing đồng đều hơn

---

### Chi tiết kỹ thuật

#### File cần chỉnh sửa

| File | Thay đổi |
|------|----------|
| `src/components/ui/searchable-fabric-select.tsx` | Cải thiện layout và styling |

#### Thay đổi cụ thể trong CommandItem:

**Trước:**
```tsx
<div className="flex flex-col">
  <span className="font-medium">{variant.variant_name}</span>
  <span className="text-xs text-muted-foreground">
    Còn lại: {stock}m
  </span>
</div>
```

**Sau:**
```tsx
<div className="flex items-center justify-between w-full">
  <span className="font-medium text-foreground">
    {variant.variant_name}
  </span>
  <span className={cn(
    "ml-2 text-xs font-medium px-2 py-0.5 rounded-full",
    stock > 0 
      ? "bg-green-100 text-green-700" 
      : "bg-red-100 text-red-700"
  )}>
    {stock}m
  </span>
</div>
```

#### Thêm separator giữa các nhóm:

```tsx
<CommandGroup key={typeName} heading={typeName} className="border-b last:border-b-0">
```

#### Cải thiện heading style:

```tsx
// Trong CommandGroup styling
className="[&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-primary [&_[cmdk-group-heading]]:bg-muted/50 [&_[cmdk-group-heading]]:py-2"
```

---

### Kết quả mong đợi

**Trước:**
```
Vải T300
├── 120g Trắng
│   Còn lại: 0m
├── 120g Xanh
│   Còn lại: 50m
```

**Sau:**
```
━━━ Vải T300 ━━━
├── 120g Trắng                    [0m]  ← badge đỏ
├── 120g Xanh                    [50m]  ← badge xanh
━━━ Lụa tổng hợp ━━━
├── Lụa sọc be                  [390m]  ← badge xanh
```

---

### Tiêu chí hoàn thành

1. Mỗi item vải hiển thị trên **1 dòng** thay vì 2 dòng
2. Số lượng tồn kho hiển thị dạng **badge màu** ở bên phải
3. Tên nhóm loại vải có **background màu nhạt** để phân biệt
4. **Border/separator** giữa các nhóm
5. Dễ scan nhanh và tìm kiếm

---

### Kiểm tra sau triển khai

1. Mở form "Ghi nhận sử dụng vải"
2. Click dropdown chọn loại vải
3. Xác nhận giao diện mới gọn gàng, dễ nhìn
4. Kiểm tra màu badge: xanh cho vải có tồn, đỏ cho vải hết
5. Thử tìm kiếm để đảm bảo vẫn hoạt động tốt

