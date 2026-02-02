

# Cải thiện tìm kiếm đa năng cho dropdown chọn vải

## Vấn đề hiện tại

Chức năng tìm kiếm hiện chỉ tìm theo `variant_name` (tên biến thể) và yêu cầu chuỗi ký tự phải nằm liên tục trong tên. Điều này gây khó khăn khi:
- Muốn tìm theo tên loại vải (fabric type)
- Gõ không đầy đủ hoặc gõ tắt
- Nhớ không chính xác thứ tự các từ

## Giải pháp

Mở rộng tìm kiếm để:
1. Tìm trong cả **tên biến thể** (`variant_name`) và **tên loại vải** (`fabric_types.name`)
2. Hỗ trợ tìm kiếm theo **từng từ riêng lẻ** - chỉ cần các từ xuất hiện trong tên (không cần đúng thứ tự)
3. Hỗ trợ **fuzzy matching** - cho phép bỏ qua một số ký tự

## Thay đổi cần thực hiện

### File: `src/components/ui/searchable-fabric-select.tsx`

Cập nhật logic filter trong `sortedVariants`:

```typescript
const sortedVariants = useMemo(() => {
  if (!fabricVariants) return [];

  const normalizedSearch = removeAccents(searchTerm.toLowerCase().trim());
  
  // Không có từ khóa => trả về tất cả
  if (!normalizedSearch) {
    return fabricVariants.sort((a, b) => 
      a.variant_name.localeCompare(b.variant_name, 'vi')
    );
  }

  // Tách từ khóa thành các từ riêng lẻ
  const searchWords = normalizedSearch.split(/\s+/).filter(w => w.length > 0);

  return fabricVariants
    .filter((variant) => {
      // Gộp tất cả text có thể tìm kiếm
      const variantText = removeAccents(variant.variant_name.toLowerCase());
      const typeText = removeAccents(
        (variant.fabric_types?.name || '').toLowerCase()
      );
      const combinedText = `${variantText} ${typeText}`;

      // Kiểm tra TẤT CẢ các từ đều xuất hiện trong text
      return searchWords.every(word => combinedText.includes(word));
    })
    .sort((a, b) => a.variant_name.localeCompare(b.variant_name, 'vi'));
}, [fabricVariants, searchTerm]);
```

## Ví dụ hoạt động

| Từ khóa gõ | Kết quả tìm được |
|------------|------------------|
| `cotton` | Tất cả vải có chữ "cotton" trong tên biến thể HOẶC loại vải |
| `trang 160` | Vải có cả "trắng" và "160" (không cần đúng thứ tự) |
| `lua` | Tìm được "Lụa" (bỏ dấu) |
| `160 trang` | Vẫn tìm được "Trắng 160cm" |

## Chi tiết kỹ thuật

| Thay đổi | Mô tả |
|----------|-------|
| Mở rộng phạm vi tìm kiếm | Thêm `fabric_types.name` vào text tìm kiếm |
| Tách từ khóa | Dùng `split(/\s+/)` để tách thành mảng các từ |
| Logic matching | Dùng `every()` để đảm bảo tất cả từ đều match |
| Giữ nguyên | Vẫn dùng `removeAccents` để hỗ trợ tiếng Việt |

## Kết quả mong đợi

- Tìm kiếm linh hoạt hơn, không cần gõ chính xác
- Tìm được cả theo tên biến thể và loại vải
- Gõ nhiều từ theo bất kỳ thứ tự nào đều tìm được
- Vẫn hỗ trợ tiếng Việt có dấu và không dấu

