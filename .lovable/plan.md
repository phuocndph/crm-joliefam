

# Hien thi chat lieu tu bao gia trong chi tiet don hang

## Nguyen nhan

Cot "Chat lieu" trong bang chi tiet don hang (dong 659 file `OrderManagement.tsx`) dang doc `item.material` - mot truong **khong ton tai** trong du lieu san pham. 

Du lieu items luu trong don hang (tu bao gia) chi co cac truong: `name`, `specifications`, `description`, `price`, `quantity`, `sku`, `total`, `originalProductId`. Khong co truong `material`.

Thong tin chat lieu nhu "Vai T250 trang soc 65% Cotton 35% Polyester..." duoc nhap trong truong `description` (mo ta) khi tao bao gia.

## Giai phap

### File: `src/pages/OrderManagement.tsx`

Thay doi dong 659: doc `item.description` thay vi `item.material`:

```typescript
// Truoc:
{item.material || "-"}

// Sau:
{item.description || "-"}
```

Truong `description` chinh la noi nguoi dung nhap thong tin chat lieu khi tao bao gia, vi du: "Vai T250 trang soc 65% Cotton 35% Polyester, mat do soi 250 soi / inch vuong".

Chi thay doi 1 dong, khong anh huong logic nao khac.
