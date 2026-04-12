

## Phân tích lỗi logic chọn Shop theo cân nặng

### Các lỗi phát hiện

**1. Pattern "dưới Xkg" bị sai boundary**
- Code: `max: parseInt(underMatch[1]) - 1` → "dưới 5kg" → max=4
- Lỗi: đơn 4.5kg sẽ không khớp vì 4.5 > 4
- Sửa: dùng `max: parseInt(underMatch[1]) - 0.01` hoặc đổi logic so sánh thành `< max` thay vì `<= max`

**2. Pattern "10-19kg" không cover số lẻ**
- Code: max=19, nhưng đơn 19.5kg sẽ không match (19.5 > 19)
- Thực tế "10-19kg" nghĩa là từ 10 đến dưới 20kg
- Sửa: `max: parseInt(rangeMatch[2]) + 0.99` hoặc đổi thành `< max + 1`

**3. Pattern "Xkg" đơn lẻ quá hẹp**
- Code: min=max=5, chỉ match chính xác 5.000kg
- Sửa: bỏ pattern này hoặc cho range rộng hơn

**4. Không có fallback khi không match**
- Nếu cân nặng rơi vào khoảng trống giữa các shop, shop cũ vẫn giữ nguyên (có thể sai)
- Sửa: chọn shop gần nhất nếu không có exact match

**5. `parseWeightRange` tạo mới mỗi render**
- Nên đưa ra ngoài component hoặc wrap bằng `useCallback`

### Giải pháp

**File: `src/components/CreateGHNOrderDialog.tsx`**

1. Đưa `parseWeightRange` ra ngoài component (pure function)
2. Sửa logic boundary:
   - Range "10-19kg" → `{ min: 10, max: 19.99 }`
   - "dưới 5kg" → `{ min: 0, max: 4.99 }`
   - Bỏ pattern singleMatch hoặc cho margin ±0.5
3. Thêm fallback: nếu không exact match, chọn shop có min gần nhất nhưng <= effectiveWeight (shop lớn nhất mà đơn vượt qua ngưỡng min)
4. Log console.warn khi không tìm được shop phù hợp

### Code minh hoạ

```typescript
// Ngoài component
const parseWeightRange = (name: string): { min: number; max: number } => {
  const n = name.toLowerCase().replace(/\s+/g, ' ');
  const rangeMatch = n.match(/(\d+)\s*[-–]\s*(\d+)\s*kg/);
  if (rangeMatch) return { min: parseInt(rangeMatch[1]), max: parseInt(rangeMatch[2]) + 0.99 };
  const fromMatch = n.match(/(?:từ|>=?|trên)\s*(\d+)\s*kg/);
  if (fromMatch) return { min: parseInt(fromMatch[1]), max: Infinity };
  const underMatch = n.match(/(?:dưới|<=?|under)\s*(\d+)\s*kg/);
  if (underMatch) return { min: 0, max: parseInt(underMatch[1]) - 0.01 };
  return { min: 0, max: Infinity };
};
```

Fallback: nếu không match chính xác, sort shops theo min descending, chọn shop đầu tiên có `min <= effectiveWeightKg`.

