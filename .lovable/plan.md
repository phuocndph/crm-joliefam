

## Cải thiện thông tin sản phẩm & tên shop khi tạo đơn GHN

### Thay đổi

**File: `src/components/CreateGHNOrderDialog.tsx`**

1. **Pre-fill sản phẩm từ `order.items`** (line ~194): Thay vì hardcode `"Đơn hàng XXX"`, parse `order.items` (JSON array với `name`, `quantity`) để tạo danh sách productItems thực tế. Mỗi item hiển thị tên sản phẩm + số lượng. Fallback về "Đơn hàng XXX" nếu items rỗng.

2. **Thêm tên shop vào note** (line ~193): Đổi note từ `"Đơn hàng ${displayNum}"` thành `"Shop: Chăn ga gối Joliefam | Đơn hàng ${displayNum}"`. Tên shop hardcode theo yêu cầu.

3. **Cập nhật interface `order`** (line ~46-53): Thêm `items?: any` vào interface props để TypeScript không báo lỗi.

### Chi tiết logic pre-fill

```typescript
// Note
setNote(`Shop: Chăn ga gối Joliefam | Đơn hàng ${displayNum}`);

// Product items
const parsedItems = Array.isArray(order.items) ? order.items : [];
if (parsedItems.length > 0) {
  setProductItems(parsedItems.map(item => ({
    name: `${item.name} x${item.quantity}`,
    weight: 200,
    quantity: item.quantity || 1
  })));
} else {
  setProductItems([{ name: `Đơn hàng ${displayNum}`, weight: 200, quantity: 1 }]);
}
```

