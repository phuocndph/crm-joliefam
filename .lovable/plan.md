

## Sửa lỗi không tìm được hình ảnh tự động khi AI điền báo giá

### Nguyên nhân

Trong `CreateQuoteForm.tsx`, logic phát hiện thư mục sai:
- **Hiện tại**: dùng `folder.id === null` để phân biệt thư mục vs file
- **ProductImageLibrary.tsx** (đang hoạt động đúng): dùng `!item.name.includes('.')` 

Kết quả: không có file nào được thêm vào `allImageFiles` → mảng trống → không match được ảnh nào.

### Giải pháp

Sửa logic fetch ảnh trong `CreateQuoteForm.tsx` để giống cách `ProductImageLibrary.tsx` đang làm:

1. Top-level files: lọc bằng regex ảnh (có extension `.jpg|png|...`)
2. Directories: lọc bằng `!item.name.includes('.')` 
3. Với mỗi directory, gọi `.list(dirName)` để lấy files bên trong
4. Thêm console.log debug để theo dõi số lượng ảnh tìm được và kết quả matching

### File thay đổi

| File | Thay đổi |
|------|----------|
| `src/components/CreateQuoteForm.tsx` | Sửa logic fetch ảnh từ bucket: dùng `!item.name.includes('.')` thay vì `folder.id === null`, copy pattern từ ProductImageLibrary |

### Chi tiết kỹ thuật

```typescript
// Sửa từ:
if (folder.id === null) { // SAI - không phải cách phát hiện thư mục

// Thành:
const topLevelFiles = folders.filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f.name));
const directories = folders.filter(f => !f.name.includes('.'));

for (const file of topLevelFiles) {
  allImageFiles.push({ name: file.name, folder: '' });
}
for (const dir of directories) {
  const { data: files } = await supabase.storage.from('product-images').list(dir.name, { limit: 200 });
  if (files) {
    for (const file of files) {
      if (/\.(jpg|jpeg|png|gif|webp)$/i.test(file.name)) {
        allImageFiles.push({ name: file.name, folder: dir.name });
      }
    }
  }
}
console.log('Found images for matching:', allImageFiles.length);
```

