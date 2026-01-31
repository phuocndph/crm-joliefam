

## Đơn giản hóa Dropdown chọn loại vải

### Vấn đề hiện tại

Từ hình ảnh bạn cung cấp, dropdown đang hiển thị trùng lặp:
- Heading danh mục: "110g - kem" 
- Tên biến thể bên dưới: "110g - kem"

Điều này gây rối mắt và không cần thiết vì tên danh mục và tên biến thể thường giống nhau.

### Giải pháp

Bỏ hoàn toàn phần nhóm theo danh mục (`CommandGroup` với heading), chỉ hiển thị danh sách phẳng các loại vải.

### Kết quả mong đợi

**Trước:**
```
110g - kem              ← heading danh mục
  110g - kem    638.51m ← item
  
110g Trắng              ← heading danh mục  
  110g Trắng       0m   ← item
```

**Sau:**
```
110g - kem       638.51m
110g Trắng           0m
120g Trắng           0m
Chống thấm chần      0m
...
```

---

### Chi tiết kỹ thuật

#### File cần chỉnh sửa

| File | Thay đổi |
|------|----------|
| `src/components/ui/searchable-fabric-select.tsx` | Bỏ grouping, hiển thị danh sách phẳng |

#### Thay đổi logic:

**Trước:** Nhóm variants theo `fabric_types.name`, render mỗi nhóm trong `CommandGroup` với heading

**Sau:** Render trực tiếp tất cả variants trong một `CommandGroup` duy nhất không có heading

```tsx
// Thay vì groupedVariants và nhiều CommandGroup
// Chỉ cần một danh sách phẳng đã sắp xếp

const sortedVariants = useMemo(() => {
  if (!fabricVariants) return [];
  
  const normalizedSearch = removeAccents(searchTerm.toLowerCase().trim());
  
  return fabricVariants
    .filter((variant) => {
      if (!normalizedSearch) return true;
      const normalizedName = removeAccents(variant.variant_name.toLowerCase());
      return normalizedName.includes(normalizedSearch);
    })
    .sort((a, b) => a.variant_name.localeCompare(b.variant_name, 'vi'));
}, [fabricVariants, searchTerm]);
```

---

### Tiêu chí hoàn thành

1. Dropdown hiển thị danh sách phẳng, không có heading danh mục
2. Mỗi item chỉ hiển thị: **Tên loại vải** + **Badge số lượng tồn**
3. Danh sách được sắp xếp theo alphabet
4. Tìm kiếm vẫn hoạt động bình thường

---

### Kiểm tra sau triển khai

1. Mở form "Ghi nhận sử dụng vải"
2. Click dropdown chọn loại vải
3. Xác nhận không còn heading danh mục trùng lặp
4. Thử tìm kiếm loại vải để đảm bảo vẫn hoạt động

