

## Nhúng VinVoice trực tiếp trong CRM

Thay vì mở tab mới, nhúng trang `https://vinvoice.viettel.vn/` bằng iframe ngay trong trang Hoá đơn điện tử, kết hợp với tab chuyển đổi giữa "VinVoice" và "Lịch sử nội bộ".

**Lưu ý quan trọng:** Nhiều website chặn iframe bằng header `X-Frame-Options` hoặc `Content-Security-Policy`. Nếu VinVoice chặn, sẽ cần fallback mở trong tab mới. Plan này xử lý cả hai trường hợp.

### Thay đổi

**File: `src/pages/EInvoiceManagement.tsx`**

1. Thêm state `activeTab` với 2 tab: **"VinVoice"** (mặc định) và **"Lịch sử"**
2. Tab "VinVoice": hiển thị iframe full-width, chiều cao `calc(100vh - 200px)` để tận dụng không gian
3. Tab "Lịch sử": giữ nguyên bảng danh sách hoá đơn, stats, search hiện tại
4. Xử lý trường hợp iframe bị chặn: hiển thị thông báo kèm nút "Mở VinVoice trong tab mới"
5. Header: giữ tiêu đề, bỏ nút "Mở VinVoice" riêng (vì đã nhúng), giữ nút "Tạo hoá đơn (nội bộ)"
6. Bỏ card hướng dẫn nhanh (không cần nữa vì VinVoice đã ở ngay trong trang)

### Giao diện

```text
┌─────────────────────────────────────────┐
│ 📄 Hoá đơn điện tử     [Tạo HĐ nội bộ]│
│                                         │
│  [VinVoice]  [Lịch sử]                 │
│ ┌─────────────────────────────────────┐ │
│ │                                     │ │
│ │   iframe: vinvoice.viettel.vn       │ │
│ │   (hoặc fallback nếu bị chặn)      │ │
│ │                                     │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

### Không thay đổi
- Bảng `einvoices`, hooks, edge function giữ nguyên
- `CreateEInvoiceDialog` giữ nguyên

