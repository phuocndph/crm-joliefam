

## Nâng cấp form GHN giống giao diện chính thức

### Tổng quan
Redesign `CreateGHNOrderDialog` theo layout GHN chính thức: 2 cột (form trái + cước phí phải), section "Bên gửi" hiển thị thông tin shop, section "Bên nhận" với dialog chọn địa chỉ riêng (như ảnh tham khảo), và pickup option.

### Thay đổi trong `src/components/CreateGHNOrderDialog.tsx`

**1. Layout 2 cột:**
- Cột trái (2/3): Form nhập liệu
- Cột phải (1/3): Sidebar cước phí luôn hiển thị, sticky

**2. Section "Bên gửi":**
- Hiển thị tên shop, SĐT, địa chỉ shop đã chọn (text, không phải dropdown nữa khi chỉ có 1 shop)
- Radio: "Lấy hàng tận nơi" / "Gửi hàng tại bưu cục"
- Dropdown "Chọn ca lấy hàng" (placeholder)

**3. Section "Bên nhận" - Address dialog:**
- Hiển thị: SĐT, Họ tên, nút "Địa chỉ người nhận" mở sub-dialog
- Sub-dialog (như ảnh 95): Input "Địa chỉ nhận" (text tự do) + 3 dropdown Tỉnh/Quận/Phường bên dưới
- Toggle "Địa chỉ mới" 
- Nút Hủy / Xong để xác nhận
- Auto-match vẫn hoạt động bên trong sub-dialog

**4. Sidebar cước phí (cột phải):**
- Hiển thị "Tổng phí: XX đ" lớn ở trên
- Info: "Tổng phí đã bao gồm phụ phí xăng dầu 10%..."
- Cước phí tự động cập nhật khi đủ thông tin

**5. Giữ nguyên:**
- Section hàng hóa (weight, dimensions)
- Section dịch vụ & thanh toán
- Logic auto-match, auto-calculate fee
- Success screen sau tạo đơn

### Chi tiết kỹ thuật

```text
Dialog max-w-4xl
├── Grid 2 cols (lg:grid-cols-3)
│   ├── Col span 2 (scrollable)
│   │   ├── Bên gửi: shop info + pickup radio
│   │   ├── Bên nhận: phone, name, address button → opens sub-dialog
│   │   │   └── AddressDialog: textarea + province/district/ward selects
│   │   ├── Hàng hóa: weight, dimensions, content
│   │   └── Dịch vụ & Thanh toán: service, payment, COD, note
│   └── Col span 1 (sticky sidebar)
│       ├── Tổng phí (large text)
│       ├── Fee breakdown
│       └── Nút "Tạo đơn GHN"
```

- Address sub-dialog: sử dụng state `showAddressDialog` boolean
- Khi bấm "Xong" trong address dialog → đóng dialog, giữ province/district/ward đã chọn
- Auto-match chạy khi address dialog mở và có sẵn address text

