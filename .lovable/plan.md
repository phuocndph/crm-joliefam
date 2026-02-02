

# Cải thiện bảng tồn kho vải - Gọn gàng, dễ nhìn hơn

## Vấn đề hiện tại

Bảng tồn kho vải đang hiển thị dưới dạng **grid cards 3 cột**:
- Mỗi loại vải chiếm 1 card riêng biệt với CardHeader + CardContent
- Với 47+ loại vải → Tốn rất nhiều diện tích màn hình
- Phải cuộn nhiều để xem hết
- Khó so sánh tồn kho giữa các loại vải

## Giải pháp: Chuyển sang dạng bảng (Table) compact

Thay vì grid cards, sử dụng **Table dạng spreadsheet** với các hàng compact:

```text
Trước (Cards):
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Vải T200t    │  │ Vải T250t    │  │ Vải T300t    │
│ Tồn: 1,608m  │  │ Tồn: 403m    │  │ Tồn: 568m    │
│ [Chuyển kho] │  │ [Chuyển kho] │  │ [Chuyển kho] │
└──────────────┘  └──────────────┘  └──────────────┘
... (47+ cards, tốn nhiều diện tích)

Sau (Table compact):
┌───┬─────────────────────────────┬──────────────┬────────────┐
│ # │ Tên vải                     │ Tồn kho      │ Thao tác   │
├───┼─────────────────────────────┼──────────────┼────────────┤
│ 1 │ Vải T200t - K280            │ 1,608m       │ [Chuyển]   │
│ 2 │ Vải T250t - K260            │ 403m (⚠️)    │ [Chuyển]   │
│ 3 │ Vải T300t - K280            │ 568m         │ [Chuyển]   │
│...│ ...                         │ ...          │ ...        │
└───┴─────────────────────────────┴──────────────┴────────────┘
```

## Chi tiết thay đổi

### File: `src/components/FabricControlByWarehouse.tsx`

**Thay thế grid cards (dòng 407-451) bằng Table compact:**

1. Sử dụng component `Table` thay vì grid cards
2. Mỗi hàng chỉ chiếm 1 dòng với các cột:
   - STT
   - Tên vải
   - Tồn kho (có highlight màu theo mức cảnh báo)
   - Nút "Chuyển kho" (nhỏ gọn)
3. Thêm tính năng sắp xếp theo tồn kho (cao → thấp hoặc thấp → cao)
4. Ẩn các loại vải có tồn = 0 (với toggle để hiện/ẩn)

### Cải tiến thêm:

1. **Thêm bộ lọc nhanh**:
   - Toggle "Chỉ hiện vải còn hàng" 
   - Tìm kiếm theo tên vải

2. **Hiển thị màu theo mức tồn**:
   - Đỏ: < 500m (cảnh báo)
   - Vàng: 500-1000m (chú ý)
   - Bình thường: > 1000m

3. **Responsive**:
   - Desktop: Bảng đầy đủ 4 cột
   - Mobile: Ẩn cột STT, thu gọn nút

---

## Thông tin kỹ thuật

### File cần sửa

| File | Thay đổi |
|------|----------|
| `src/components/FabricControlByWarehouse.tsx` | Thay grid cards bằng Table compact, thêm filter/sort |

### Code structure mới

```typescript
// Thêm state cho filter và sort
const [showZeroStock, setShowZeroStock] = useState(false);
const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
const [fabricSearch, setFabricSearch] = useState('');

// Filter và sort data
const displayedFabrics = useMemo(() => {
  let filtered = fabricSummaryArray;
  
  if (!showZeroStock) {
    filtered = filtered.filter(f => f.currentWarehouse > 0);
  }
  
  if (fabricSearch) {
    filtered = filtered.filter(f => 
      f.fabricName.toLowerCase().includes(fabricSearch.toLowerCase())
    );
  }
  
  return filtered.sort((a, b) => 
    sortOrder === 'desc' 
      ? b.currentWarehouse - a.currentWarehouse 
      : a.currentWarehouse - b.currentWarehouse
  );
}, [fabricSummaryArray, showZeroStock, sortOrder, fabricSearch]);
```

### Kết quả mong đợi

- Giảm ~70% diện tích so với grid cards
- Dễ so sánh tồn kho giữa các loại vải
- Nhanh chóng tìm thấy vải cần thiết
- Vẫn giữ đầy đủ chức năng chuyển kho

