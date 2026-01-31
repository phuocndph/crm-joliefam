

## Tổng quan vấn đề

Dropdown chọn loại vải trong form **"Ghi nhận sử dụng vải"** (`FabricUsageRecording.tsx`) hiện tại có 2 vấn đề:

1. **Thiếu thông tin loại vải (fabric type)**: Chỉ hiển thị tên biến thể (`variant_name`) + số lượng còn lại, không hiển thị loại vải gốc
2. **Khó tìm kiếm**: Danh sách dài (20+ loại vải) nhưng không có chức năng tìm kiếm, phải cuộn để tìm

---

## Giải pháp đề xuất

Thay thế component `<Select>` hiện tại bằng **Searchable Combobox** sử dụng `cmdk` (đã có sẵn trong project qua `@/components/ui/command.tsx`).

### Tính năng mới:
- Hiển thị **[Loại vải] - [Tên biến thể] - [Khổ vải] - Còn lại: XXm**
- Ô tìm kiếm hỗ trợ tiếng Việt có dấu và không dấu
- Nhóm theo loại vải để dễ tìm
- Click để mở dropdown, gõ để tìm kiếm

---

## Chi tiết kỹ thuật

### File cần thay đổi

| File | Thay đổi |
|------|----------|
| `src/components/FabricUsageRecording.tsx` | Thay `<Select>` bằng Searchable Combobox, hiển thị thêm fabric type name |
| `src/components/ui/searchable-fabric-select.tsx` | Tạo component mới - Searchable Fabric Select |

### Cấu trúc dữ liệu hiện có

Từ `useFabricVariants()`, mỗi variant đã có:
```
{
  id: string
  variant_name: string          // "T300t - K305"
  fabric_type_id: string
  width_code: string | null     // "K280", "K260"
  fabric_types: {               // JOIN từ fabric_types
    name: string                // "Vải Cotton", "Lụa tổng hợp"
    description: string | null
  }
}
```

### Định dạng hiển thị mới

```
[Loại vải] - [Tên biến thể] - Còn lại: XXm
```

Ví dụ:
- `Vải T300 - T300t - K305 - Còn lại: 150m`
- `Lụa tổng hợp - Lụa tổng hợp sọc be - Còn lại: 390m`

### Component SearchableFabricSelect

```tsx
// Props
interface SearchableFabricSelectProps {
  value: string;                    // fabric_variant_id đã chọn
  onValueChange: (value: string) => void;
  fabricVariants: FabricVariant[];
  fabricInventory: FabricInventory[];
  warehouseId: string;
  placeholder?: string;
  disabled?: boolean;
}

// Tính năng
- Sử dụng Popover + Command từ shadcn/ui
- Tìm kiếm hỗ trợ tiếng Việt (removeAccents)
- Nhóm theo fabric_types.name
- Hiển thị số lượng tồn kho theo warehouse đã chọn
- Highlight kết quả tìm kiếm
```

### Logic tìm kiếm

```ts
// Sử dụng hàm removeAccents đã có từ src/lib/searchUtils.ts
const matchesSearch = (variant, searchTerm) => {
  const normalizedSearch = removeAccents(searchTerm.toLowerCase());
  const normalizedName = removeAccents(variant.variant_name.toLowerCase());
  const normalizedType = removeAccents(variant.fabric_types?.name?.toLowerCase() || '');
  
  return normalizedName.includes(normalizedSearch) || 
         normalizedType.includes(normalizedSearch);
};
```

---

## Kết quả mong đợi

### Trước:
```
[Select dropdown]
├── T300t - K305 - Còn lại: 0m
├── T300t - K260 - Còn lại: 0m
├── T250t - K280 - Còn lại: 0m
└── ... (cuộn để tìm)
```

### Sau:
```
[🔍 Tìm kiếm loại vải...]

Vải T300
├── Vải T300 - T300t - K305 - Còn lại: 0m
├── Vải T300 - T300t - K260 - Còn lại: 0m

Vải T250  
├── Vải T250 - T250t - K280 - Còn lại: 0m
├── Vải T250 - T250t - K260 - Còn lại: 0m

Lụa tổng hợp
├── Lụa tổng hợp - Lụa tổng hợp sọc be - Còn lại: 390m
├── Lụa tổng hợp - Lụa tổng hợp xanh lá - Còn lại: 100m
└── ...
```

---

## Tiêu chí hoàn thành

1. Dropdown hiển thị đầy đủ: **Loại vải - Tên biến thể - Số lượng tồn**
2. Có ô tìm kiếm hoạt động tốt với tiếng Việt có dấu và không dấu
3. Kết quả được nhóm theo loại vải
4. Chọn được vải và giá trị được lưu đúng (fabric_variant_id)
5. Hiển thị số lượng tồn kho đúng theo kho đã chọn

---

## Kiểm tra sau triển khai

1. Mở form "Ghi nhận sử dụng vải"
2. Click vào dropdown chọn loại vải → thấy ô tìm kiếm
3. Gõ "lụa" hoặc "lua" → thấy kết quả lọc đúng
4. Gõ "T300" → thấy các loại vải T300 hiện lên
5. Chọn 1 loại vải → dropdown đóng lại, hiển thị tên đã chọn
6. Xác nhận số lượng tồn kho hiển thị đúng

