

## Căn chỉnh Ký & Đóng dấu online theo đúng quy chuẩn

### Vấn đề hiện tại
Từ ảnh mẫu, bố cục chuẩn là:
- **Tên công ty** (bold, căn giữa)
- *(Ký, đóng dấu)* (italic)
- Con dấu bên **trái**, chữ ký **chồng lên bên phải** con dấu
- **Tên người đại diện** (bold, gạch chân) ở dưới cùng

### Thay đổi

**1. Component `OnlineStampSignature.tsx`** — Căn chỉnh lại:
- Tăng chiều cao vùng ký từ 100px → 120px
- Con dấu: dịch sang trái nhiều hơn, kích thước 120x120
- Chữ ký: đặt chồng lên phần phải con dấu, kích thước 100x70
- Hiển thị tên người đại diện + chức vụ (bold, gạch chân)

**2. Áp dụng đồng bộ 5 dialog** — Cập nhật inline styles tại:
- `ContractPreviewDialog.tsx`
- `FrameworkContractDialog.tsx`
- `PaymentRequestDialog.tsx`
- `AdvanceRequestDialog.tsx`
- `HandoverReportDialog.tsx`

Thay thế inline stamp/signature code bằng component `OnlineStampSignature` (đã có nhưng chưa dùng ở một số file), đảm bảo tất cả dùng chung 1 layout chuẩn.

**3. Layout chuẩn (theo ảnh mẫu):**

```text
    CÔNG TY TNHH GIA LỘC HƯNG PHÁT
           (Ký, đóng dấu)

      [CON DẤU]  [CHỮ KÝ]
       (trái)    (chồng phải)

       Trần Thị Thanh Hoan
            (gạch chân)
```

### Files thay đổi

| File | Thay đổi |
|------|----------|
| `OnlineStampSignature.tsx` | Căn chỉnh vị trí, thêm tên + gạch chân |
| `ContractPreviewDialog.tsx` | Dùng `OnlineStampSignature` thay inline |
| `FrameworkContractDialog.tsx` | Dùng `OnlineStampSignature` thay inline |
| `PaymentRequestDialog.tsx` | Dùng `OnlineStampSignature` thay inline |
| `AdvanceRequestDialog.tsx` | Dùng `OnlineStampSignature` thay inline |
| `HandoverReportDialog.tsx` | Dùng `OnlineStampSignature` thay inline |

