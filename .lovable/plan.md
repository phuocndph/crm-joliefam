## Tình trạng hiện tại

Supabase client đã được cấu hình `persistSession: true` + `autoRefreshToken: true` (xem `src/integrations/supabase/client.ts`) — về mặt kỹ thuật **phiên đăng nhập đã được nhớ tự động** trong localStorage, refresh token sống tới 60 ngày.

Nguyên nhân thực tế user vẫn phải nhập lại tài khoản/mật khẩu trên PWA:
1. **Form chưa có `autocomplete` chuẩn** → trình duyệt/PWA (iOS Safari, Chrome Android) không gợi ý lưu hoặc autofill mật khẩu.
2. **Chưa có "Ghi nhớ email"** → mỗi lần phải gõ lại email dù đã đăng nhập trước đó.
3. **PWA iOS xoá localStorage** khi máy thiếu bộ nhớ → mất session. Cần fallback fill email.
4. Khi token refresh fail (mạng kém lúc mở app) bị đẩy về `/auth` → mất sạch state.

## Phạm vi

Chỉ frontend (`src/pages/Auth.tsx`). Không đổi cấu hình Supabase, không đổi DB. Không lưu mật khẩu plaintext (rủi ro bảo mật).

## Các thay đổi

### 1. Thêm thuộc tính `autocomplete` chuẩn cho 2 form
- Email input: `autoComplete="email"` + `name="email"`
- Password input (signin): `autoComplete="current-password"` + `name="password"`
- Password input (signup): `autoComplete="new-password"`
- Bọc form bằng `<form>` đúng cấu trúc + button `type="submit"` để trình duyệt nhận diện và đề nghị **Lưu mật khẩu**.

→ Sau lần đăng nhập đầu, Chrome/Safari/Edge sẽ hỏi "Bạn có muốn lưu mật khẩu cho site này?" và tự fill ở các lần sau (bao gồm cả PWA cài về home screen).

### 2. Checkbox "Ghi nhớ đăng nhập"
- Mặc định **bật**.
- Khi bật + đăng nhập thành công → lưu `remembered_email` vào localStorage.
- Khi tắt → xoá `remembered_email`.
- Lần mở Auth page sau: tự điền email vào ô.
- Không lưu password trong localStorage.

### 3. Cải thiện trải nghiệm session
- Trên Auth page, khi `getSession()` đang chạy → hiển thị skeleton/loader (tránh nháy form login rồi mới chuyển sang dashboard).
- Subscribe `onAuthStateChange` để auto-redirect sang `/dashboard` ngay khi session restore xong (kể cả async).

### 4. Hiển thị thông tin nhỏ dưới form
- Dòng nhỏ "🔒 Phiên đăng nhập được giữ trong 60 ngày trên thiết bị này" để user yên tâm không cần đăng nhập lại liên tục.

## Không làm

- Không thêm checkbox "Lưu mật khẩu" tự tạo (kém an toàn hơn trình duyệt gốc).
- Không đổi token expiry trên Supabase (đã 60 ngày).
- Không thêm OAuth (Google/Apple) trong phạm vi này.

## Kiểm thử

1. Mở PWA, đăng nhập 1 lần → trình duyệt hỏi lưu mật khẩu → Yes.
2. Đóng app, mở lại → vào thẳng dashboard (session còn).
3. Logout → mở lại Auth page → email được fill sẵn, ô mật khẩu được trình duyệt gợi ý autofill bằng 1 chạm.
4. Tick bỏ "Ghi nhớ đăng nhập" rồi login → lần sau email không fill sẵn.
