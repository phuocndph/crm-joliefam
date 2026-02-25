

# Sửa lỗi: Web production không cập nhật code mới sau khi Publish

## Nguyên nhân

Service Worker (SW) trên production (`crm-joliefam.lovable.app`) cache các file JS/CSS cũ. Mặc dù SW dùng chiến lược "network-first", có 2 vấn đề:

1. **Không kiểm tra cập nhật SW**: Code đăng ký SW trong `index.html` chỉ gọi `register()` mà không gọi `registration.update()` để kiểm tra phiên bản mới
2. **Không xử lý khi SW mới sẵn sàng**: Khi SW mới được tải về, trình duyệt không tự động kích hoạt nó - cần gửi lệnh `SKIP_WAITING` và reload trang
3. **Không lắng nghe sự kiện `SW_UPDATED`**: SW v3 đã gửi message `SW_UPDATED` khi activate, nhưng client không lắng nghe và xử lý

## Giải pháp

### File: `index.html` - Cập nhật script đăng ký Service Worker

Thay thế phần script đăng ký SW (dong 52-79) bang code moi:

```javascript
(function() {
  const isProduction = window.location.hostname === 'crm-joliefam.lovable.app';
  
  if ('serviceWorker' in navigator) {
    if (isProduction) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
          .then((registration) => {
            console.log('SW registered:', registration);
            
            // Kiem tra cap nhat moi khi trang tai
            registration.update();
            
            // Kiem tra dinh ky moi 60 giay
            setInterval(() => registration.update(), 60 * 1000);
            
            // Khi phat hien SW moi da san sang
            registration.addEventListener('updatefound', () => {
              const newWorker = registration.installing;
              if (newWorker) {
                newWorker.addEventListener('statechange', () => {
                  if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    console.log('New SW installed, sending SKIP_WAITING');
                    newWorker.postMessage({ type: 'SKIP_WAITING' });
                  }
                });
              }
            });
          })
          .catch((err) => {
            console.log('SW registration failed:', err);
          });
      });
      
      // Khi SW moi nam quyen dieu khien -> tu dong reload trang
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('New SW active, reloading for latest version...');
        window.location.reload();
      });
      
      // Lang nghe message SW_UPDATED tu SW
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'SW_UPDATED') {
          console.log('SW updated to', event.data.version, '- reloading');
          window.location.reload();
        }
      });
    } else {
      // Unregister SW va xoa cache trong moi truong preview/dev
      navigator.serviceWorker.getRegistrations().then(registrations => {
        registrations.forEach(reg => reg.unregister());
      });
      if ('caches' in window) {
        caches.keys().then(names => names.forEach(name => caches.delete(name)));
      }
    }
  }
})();
```

### File: `public/sw.js` - Tang phien ban SW

Doi `CACHE_NAME` tu `joliefam-crm-v3` thanh `joliefam-crm-v4` de buoc trinh duyet nhan dien day la phien ban moi va kich hoat quy trinh cap nhat.

## Ket qua mong doi

| Van de | Truoc | Sau |
|--------|-------|-----|
| Kiem tra cap nhat | Khong kiem tra | Kiem tra khi load + moi 60s |
| SW moi san sang | Khong xu ly | Tu dong SKIP_WAITING |
| Sau khi SW cap nhat | Khong lam gi | Tu dong reload trang |
| Cache cu | Giu lai | Xoa sach khi SW moi activate |

Sau khi publish, nguoi dung chi can doi toi da 60 giay de trang tu dong cap nhat phien ban moi nhat.
