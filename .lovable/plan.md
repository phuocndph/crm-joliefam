

## Sửa logic tự động chọn shop theo KG đơn hàng

### Vấn đề gốc
Khi tạo đơn GHN, trọng lượng mỗi sản phẩm được hardcode = 200g. Nếu đơn có 3 sản phẩm → tổng = 600g → hệ thống chọn shop "0-2kg" thay vì shop đúng theo trọng lượng thực tế.

Ngoài ra, khi người dùng thay đổi trọng lượng (KL gram) thủ công, auto-select shop PHẢI chạy lại và cập nhật shop hiển thị. Logic hiện tại đã có useEffect đúng dependencies `[effectiveWeightKg, shops]`, nhưng cần đảm bảo:
1. Trọng lượng pre-fill phản ánh đúng hơn thực tế
2. Khi user thay đổi weight, shop phải cập nhật rõ ràng

### Thay đổi

**File: `src/components/CreateGHNOrderDialog.tsx`**

1. **Bỏ sync weight từ totalItemWeight** (line 154-158): Effect `setWeight(totalItemWeight)` ghi đè trọng lượng user nhập thủ công mỗi khi productItems thay đổi. Thay vào đó, chỉ sync 1 lần khi pre-fill.

2. **Cải thiện pre-fill weight**: Trong useEffect pre-fill (line 196-207), tính tổng weight từ items và set `weight` trực tiếp thay vì phụ thuộc vào sync effect. Nếu order không có weight data, giữ default 500g.

3. **Thêm toast/indicator khi shop tự chuyển**: Trong auto-select shop useEffect, thêm thông báo nhỏ cho user biết shop đã thay đổi (ví dụ: banner text cập nhật).

4. **Hiển thị shop được chọn rõ ràng hơn**: Thêm badge hiển thị shop hiện tại kèm trọng lượng tính cước ngay tại phần "Bên gửi", không chỉ dưới phần kích thước.

### Chi tiết kỹ thuật

```typescript
// Bỏ useEffect sync weight (line 154-158)
// Thay bằng set weight 1 lần trong pre-fill:

// Pre-fill (line 196+)
const parsedItems = Array.isArray(order.items) ? order.items : [];
if (parsedItems.length > 0) {
  const summary = parsedItems.map((item: any) => item.name).join(' - ');
  const totalQty = parsedItems.reduce((sum: number, item: any) => sum + (item.quantity || 1), 0);
  setProductItems([{ name: summary, weight: 200, quantity: totalQty }]);
  // Set weight dựa trên số lượng sản phẩm (ước tính ~1kg/sản phẩm)
  setWeight(totalQty * 1000);
} else {
  setProductItems([{ name: `Đơn hàng ${displayNum}`, weight: 200, quantity: 1 }]);
  setWeight(500);
}

// Auto-select shop - thêm visual feedback
useEffect(() => {
  if (shops.length === 0) return;
  const matchingShop = shops.find(shop => {
    const { min, max } = parseWeightRange(shop.name);
    return effectiveWeightKg >= min && effectiveWeightKg < max;
  });
  // ... (giữ logic cũ + thêm console.log debug)
}, [effectiveWeightKg, shops]);
```

5. **Hiển thị thông tin shop rõ ràng hơn trong phần Bên gửi**: Thêm dòng text nhỏ "KL tính cước: X kg → Shop: Y" ngay dưới Select shop, để user thấy rõ shop đang được chọn theo KG nào.

