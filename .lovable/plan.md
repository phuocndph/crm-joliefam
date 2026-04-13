

## Gộp sản phẩm thành 1 dòng duy nhất

### Vấn đề
Hiện tại mỗi sản phẩm trong đơn hàng tạo thành 1 productItem riêng → GHN tính thành nhiều kiện hàng. Cần gộp tất cả thành 1 item duy nhất với tên ngắn gọn.

### Thay đổi

**File: `src/components/CreateGHNOrderDialog.tsx`** (line 195-204)

Thay logic map từng item thành logic gộp:

```typescript
const parsedItems = Array.isArray(order.items) ? order.items : [];
if (parsedItems.length > 0) {
  const summary = parsedItems.map((item: any) => item.name).join(' - ');
  const totalQty = parsedItems.reduce((sum: number, item: any) => sum + (item.quantity || 1), 0);
  setProductItems([{
    name: summary,
    weight: 200,
    quantity: totalQty
  }]);
} else {
  setProductItems([{ name: `Đơn hàng ${displayNum}`, weight: 200, quantity: 1 }]);
}
```

Kết quả: Thay vì 3 dòng riêng, chỉ còn 1 dòng duy nhất ví dụ: `"Vỏ chăn LTH sọc 200x220 - Ga chun ks T225 sọc 150x190 - Vỏ gối 45x65"` với tổng số lượng.

