

## Sửa lỗi con dấu & chữ ký bị méo khi xuất PDF

### Nguyên nhân
`html2canvas` không render chính xác CSS `object-fit: contain` trên thẻ `<img>`. Khi chuyển sang canvas, ảnh bị kéo giãn theo kích thước container thay vì giữ tỷ lệ gốc → méo hình.

### Giải pháp

**File: `OnlineStampSignature.tsx`**

Thay `className="w-full h-full object-contain"` bằng inline style trực tiếp:
- Đặt `width` và `height` bằng pixel cụ thể trên thẻ `<img>` 
- Dùng `object-fit: "contain"` dạng inline style (html2canvas xử lý inline style tốt hơn class)
- Thêm `crossOrigin="anonymous"` để html2canvas load ảnh cross-origin không bị lỗi

Thay đổi cụ thể cho cả 2 ảnh (stamp + signature):
```
// Trước
<img className="w-full h-full object-contain pointer-events-none" />

// Sau  
<img style={{ width: "100%", height: "100%", objectFit: "contain" }} 
     crossOrigin="anonymous" />
```

Chỉ sửa 1 file `OnlineStampSignature.tsx`, ảnh hưởng tất cả các dialog dùng component này.

