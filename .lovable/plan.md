

# Fix gia tri mac dinh "Thep" trong chi tiet don hang

## Nguyen nhan

Dong 659 trong `src/pages/OrderManagement.tsx`:
```typescript
{item.material || "Thép"}
```
Khi san pham trong don hang khong co truong `material`, he thong hien thi "Thep" lam gia tri mac dinh. Day la gia tri khong phu hop voi nganh rem/noi that.

## Giai phap

### File: `src/pages/OrderManagement.tsx`

Thay doi dong 659: doi fallback tu `"Thép"` thanh `"-"` (giong cac truong khac nhu specifications, notes):

```typescript
// Truoc:
{item.material || "Thép"}

// Sau:
{item.material || "-"}
```

Chi thay doi 1 dong, khong anh huong den bat ky logic nao khac.
