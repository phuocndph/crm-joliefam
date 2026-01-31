

## Vấn đề: Dropdown chọn vải không hiển thị đủ loại vải

### Phân tích nguyên nhân

Sau khi kiểm tra database và code, tôi phát hiện vấn đề sau:

**Cấu trúc dữ liệu hiện tại:**
- **`fabric_types`** (Tab "Loại vải"): **43 loại vải** - đây là danh mục định nghĩa các loại vải
- **`fabric_variants`** (Biến thể vải thực tế): **22 biến thể** - đây là vải thực tế trong kho

**Vấn đề:**
Dropdown chọn vải trong form "Ghi nhận sử dụng vải" đang lấy dữ liệu từ `fabric_variants` (22 biến thể), nhưng người dùng muốn thấy tất cả loại vải từ `fabric_types` (43 loại).

**21 loại vải bị thiếu** là những loại đã được tạo trong tab "Loại vải" nhưng chưa có biến thể tương ứng (chưa bao giờ nhập kho).

Ví dụ các loại vải thiếu:
- `T400t - K260`, `T400t - K280`, `T400t - K305`
- `T300ov - K260`, `T300ov - K280`
- `Chống thấm mỏng ghi`, `Chống thấm mỏng trắng`
- `T600`, `T233`
- ...

---

### Hai hướng giải quyết

#### Hướng 1: Tự động tạo biến thể cho tất cả loại vải (Đề xuất)

Khi có loại vải mới trong `fabric_types`, tự động tạo biến thể tương ứng trong `fabric_variants`. Điều này đảm bảo tất cả loại vải đều xuất hiện trong dropdown.

**Ưu điểm:**
- Giữ nguyên cấu trúc dữ liệu hiện tại
- Không cần thay đổi logic tồn kho
- Người dùng thấy tất cả loại vải ngay lập tức

**File cần chỉnh sửa:**
- `src/components/FabricTypeManagement.tsx` - Tự động tạo biến thể khi tạo loại vải mới
- `src/components/FabricInventoryOverview.tsx` - Thêm chức năng "Đồng bộ tất cả" để tạo biến thể cho các loại vải chưa có

#### Hướng 2: Cho phép dropdown hiển thị cả loại vải chưa có biến thể

Cập nhật `SearchableFabricSelect` để hiển thị **tất cả loại vải** từ `fabric_types`, không chỉ những loại có trong `fabric_variants`.

**Ưu điểm:**
- Người dùng có thể chọn bất kỳ loại vải nào
- Không cần tạo thêm dữ liệu

**Nhược điểm:**
- Cần xử lý logic phức tạp khi ghi nhận sử dụng vải chưa có biến thể
- Có thể gây lỗi tồn kho âm

---

### Giải pháp đề xuất: Kết hợp cả hai hướng

**Bước 1: Tạo chức năng đồng bộ biến thể**

Thêm nút "Đồng bộ tất cả loại vải" trong `FabricInventoryOverview.tsx` để tự động tạo biến thể cho những loại vải chưa có.

```typescript
// Tìm các loại vải chưa có biến thể
const missingVariants = fabricTypes.filter(type => 
  !fabricVariants.some(variant => variant.fabric_type_id === type.id)
);

// Tạo biến thể cho mỗi loại vải thiếu
for (const type of missingVariants) {
  await createFabricVariant.mutateAsync({
    fabric_type_id: type.id,
    variant_name: type.name,
    unit: 'm'
  });
}
```

**Bước 2: Tự động tạo biến thể khi tạo loại vải mới**

Cập nhật `FabricTypeManagement.tsx` để tự động tạo biến thể ngay sau khi tạo loại vải mới.

**Bước 3: Cập nhật dropdown hiển thị loại vải**

Cập nhật `SearchableFabricSelect.tsx` để hiển thị tên loại vải (`fabric_types.name`) thay vì tên biến thể nếu chúng trùng nhau.

---

### File cần chỉnh sửa

| File | Thay đổi |
|------|----------|
| `src/components/FabricInventoryOverview.tsx` | Thêm nút "Đồng bộ tất cả loại vải" để tạo biến thể cho các loại vải thiếu |
| `src/components/FabricTypeManagement.tsx` | Tự động tạo biến thể khi tạo loại vải mới |
| `src/components/ui/searchable-fabric-select.tsx` | Cải thiện hiển thị - ưu tiên tên loại vải rõ ràng hơn |

---

### Kết quả mong đợi

1. Dropdown chọn vải hiển thị **tất cả 43 loại vải** thay vì chỉ 22
2. Tất cả loại vải đều có biến thể tương ứng trong hệ thống
3. Không xảy ra lỗi khi ghi nhận sử dụng vải cho bất kỳ loại vải nào
4. Khi tạo loại vải mới, biến thể được tạo tự động

---

### Kiểm tra sau triển khai

1. Mở trang Quản lý vải → Tab "Tổng số lượng vải"
2. Click nút "Đồng bộ tất cả loại vải" (nếu có)
3. Mở form "Ghi nhận sử dụng vải"
4. Kiểm tra dropdown → phải thấy tất cả 43 loại vải
5. Thử tìm kiếm "T400" hoặc "T600" → phải thấy kết quả
6. Tạo loại vải mới trong tab "Loại vải" → kiểm tra nó xuất hiện ngay trong dropdown

