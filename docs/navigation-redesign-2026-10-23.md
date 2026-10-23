# Menu theo nhóm công việc — 23/10/2026

## Phạm vi đã được duyệt

Đổi cách tổ chức điều hướng, không xóa chức năng, đổi URL, thay quyền hoặc logic
nghiệp vụ. Giữ nguyên thay đổi có sẵn trong working tree. Không migration, sửa
database, gọi provider, commit, push hoặc deploy.

Một danh mục dùng chung cho sidebar desktop, trang menu và ngăn menu điện thoại:

| Vị trí | Chức năng |
| --- | --- |
| Trên cùng | Tổng quan, Báo cáo, Tìm chức năng |
| Bán hàng | Khách hàng, Báo giá, Đơn hàng, Chăm sóc khách hàng, Hợp đồng, Sản phẩm |
| Kho & sản xuất | Lệnh sản xuất, Kho vải, Kho & vật tư |
| Giao hàng | Theo dõi GHN, Đơn vị vận chuyển |
| Nhân sự & lương | Chấm công xưởng, Tiền lương, Duyệt hồ sơ |
| Tài chính | Thu chi, Giao dịch, Hóa đơn điện tử, Chi phí & giá thành |
| Hệ thống | Tài khoản & phân quyền, Cài đặt API, Kết nối Agent, Cài đặt AI, Kho tri thức, Thu thập dữ liệu web |
| Tài khoản, dưới cùng | Công & thu nhập của tôi, Hồ sơ của tôi |

Nhóm mặc định thu gọn, tự mở nhóm chứa trang hiện tại. Dòng menu một hàng; không
hiển thị mô tả dài. Sidebar thu nhỏ dùng biểu tượng nhóm và menu con, không quay
lại danh sách 28 biểu tượng. Mục chưa được cấp quyền không xuất hiện trong nhóm,
tìm kiếm, ghim hoặc truy cập nhanh.

Tìm chức năng có tên/alias không dấu và thao tác bàn phím. Đây không phải tìm
khách hàng/đơn hàng toàn hệ thống. Người dùng ghim tối đa 4 chức năng; lưu ID menu
tại trình duyệt theo tài khoản, backend và origin, không lưu khóa hay dữ liệu
nghiệp vụ. Các mục không còn quyền bị lọc trước khi hiển thị. Tự chấm công/hồ sơ
chỉ ở khu vực tài khoản. Truy cập nhanh điện thoại ưu tiên mục ghim được phép rồi
đến mặc định phù hợp công việc; không cấp thêm quyền qua menu.

## Thực hiện và kiểm chứng

Theo `crm-orchestrator`: explorer và architect kiểm tra chỉ đọc; một implementer
duy nhất sửa production; reviewer và tester độc lập kiểm tra cùng hash cố định.
Tối đa hai vòng sửa sau bản cố định đầu.

- Giữ nguyên API và cách quyết định quyền. Hook quyền chỉ bổ sung tín hiệu đọc
  thành công cho điều hướng, để lỗi mạng không xóa mục ghim; không cấp thêm quyền.
  Cài đặt API và Agent vẫn chỉ admin local thật.
- Kiểm tra danh mục đủ 28 URL, sáu nhóm chính và hai mục tài khoản; không nhân bản
  danh mục trên mobile/desktop.
- Kiểm tra vai trò/quyền, loading, quyền bị thu hồi, ghim đủ/vượt giới hạn, dữ
  liệu lưu hỏng hoặc storage bị chặn, đổi tài khoản, tìm kiếm rỗng/không có kết quả.
- Browser QA bằng SPA thật với API giả lập trong bộ nhớ, không `.env`, database
  hoặc provider: desktop, sidebar thu nhỏ, mobile, bàn phím, nhóm tự mở, ghim và
  tìm kiếm. Không thao tác dữ liệu vận hành để thử.
- TypeScript app, lint các file thay đổi, build local; ghi rõ lỗi nền nếu có.
- Sau build, kiểm tra web8083 phục vụ đúng bundle; không cần restart API vì không
  đổi backend. Chưa coi đây là cập nhật bản chính.

## Rà soát độc lập

Bản cố định đầu qua 22 nhóm kiểm thử logic. Reviewer phát hiện thêm bốn điểm ở
ranh giới tích hợp: lỗi đọc quyền có thể xóa ghim đã lưu, loading làm remount và
mất ghim chỉ lưu bộ nhớ, tablet thiếu nút tìm kiếm, và chọn kết quả bằng bàn phím
không cuộn theo. Đã chuyển các điểm này cho implementer duy nhất.

Vòng kiểm tra tiếp theo chặn một thay đổi không mong muốn: gom hai nguồn quyền
hosted làm lỗi quyền lương ảnh hưởng quyền bán hàng và chờ tín hiệu thành công
gây loading không kết thúc. Vòng sửa cuối yêu cầu giữ hai nguồn quyền độc lập như
trước, chỉ dùng metadata thành công để bảo vệ thao tác lưu ghim, không chặn cả
ứng dụng khi API quyền lỗi. Không phát hành bản trung gian.

## Kết quả bản cuối — Freeze 3

Hai vòng sửa đã hoàn tất. Reviewer không còn finding chặn có bằng chứng trong
phạm vi điều hướng. Tester độc lập và main cùng chạy đạt 30/30 nhóm kiểm thử.

Lệnh đã chạy tại thư mục dự án (Node tại `C:\Program Files\nodejs\node.exe`):

```powershell
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json
node scripts/test-navigation-independent.mjs
node node_modules/eslint/bin/eslint.js src/lib/navigation-catalog.ts src/hooks/useNavigationFavorites.ts src/components/navigation src/components/ui/app-sidebar.tsx src/components/layout/MainLayout.tsx src/components/layout/MobileLayout.tsx src/pages/MobileMenu.tsx src/hooks/useEmployeePermissions.tsx
$env:VITE_BACKEND_MODE='local'
$env:VITE_LOCAL_API_URL='http://127.0.0.1:8787'
node node_modules/vite/bin/vite.js build --mode crmdev
```

- TypeScript: PASS. Kiểm thử: 30/30 PASS. Scoped ESLint: 0 lỗi, 1 cảnh báo
  `react-refresh/only-export-components` ở context dùng chung; không chặn build.
- Build: PASS, 4322 modules; còn cảnh báo dữ liệu Browserslist cũ và chunk lớn.
  Không cài thêm dependency hoặc sửa cấu hình để che cảnh báo.
- `git diff --check` phạm vi sửa: PASS, chỉ có nhắc LF/CRLF.
- Web `http://127.0.0.1:8083/menu`: HTTP 200; script
  `/assets/index-DAqyO8q4.js` có SHA256 giống file trong dist. API health8787:
  HTTP 200. Không restart API, không chạy bootstrap/migration.

Browser QA bằng SPA thật, API giả lập trong bộ nhớ, cổng ngẫu nhiên loopback:

- Desktop: sáu nhóm thu gọn; `/customer-care` tự mở Bán hàng và đánh dấu đúng
  dòng hiện tại; sidebar thu nhỏ có popover theo nhóm, chọn link đóng popover.
- Ghim bốn mục và thử mục thứ năm: thông báo giới hạn đúng. Trang menu và drawer
  dùng chung trạng thái ghim, không cần reload.
- Search không dấu `cham cong`: trả về Chấm công xưởng; Escape đóng. ArrowDown
  18 lần cuộn tới Hóa đơn điện tử (`scrollTop=436`, dòng được chọn nằm trong
  viewport danh sách). Input điều khiển đúng ID kết quả và có live selection.
- Tablet800px: nút tìm chức năng hiện hữu. Mobile375×844: không tràn ngang;
  truy cập nhanh tối đa năm nút; nhóm và drawer hoạt động.
- Đổi admin sang employee: không lẫn ghim. Employee chỉ thấy ba mục bán hàng
  được cấp, không có Hệ thống/tiền lương không được cấp.
- Ghim Đơn hàng, bật lỗi503 quyền giả lập, reload: không spinner vô hạn và
  không hiển thị ghim chưa xác nhận. Tắt lỗi rồi reload: ghim Đơn hàng còn nguyên.
  Thu hồi quyền orders thành công rồi reload: mục biến mất khỏi ghim/truy cập nhanh.
- Không tạo/sửa đơn hay dữ liệu nghiệp vụ. Fixture ghi nhận 0 business mutations,
  0 provider calls, 0 database connections; endpoint ngoài phạm vi trả404 có chủ ý.

Ảnh bằng chứng (tài khoản giả lập, không có dữ liệu khách hàng thật):

- `C:/Users/Lenovo/.codex/tmp/navigation-desktop-20261023.jpg`
- `C:/Users/Lenovo/.codex/tmp/navigation-mobile-20261023.jpg`

## File và bản cố định

Production gồm catalog, favorites hook, bốn component navigation, sidebar,
hai layout, MobileMenu và metadata trong hook quyền. `App.tsx`, `useUserRole`,
`local-auth` và `runtime-config` giữ nguyên hash trước tác vụ. Hai script thêm
chỉ phục vụ kiểm thử và fixture.

| File | SHA256 Freeze3 |
| --- | --- |
| src/lib/navigation-catalog.ts | FE4BDC8D3B1F50B6DED169D3817D2856EBF5AB38C454016D0E9C47BF15DBF359 |
| src/hooks/useNavigationFavorites.ts | 2B7D5BFEB8088580AE528058B80E718ED05B5275FD940D26EE14CC4A1B4BADCE |
| src/components/navigation/NavigationContext.tsx | EB2A71238770B9872ACA07B7778963AA043CAE120BD7957BE1169455421A511E |
| src/components/navigation/NavigationItemRow.tsx | 1D417315AEA9264F24A7A592778AE40AE60286F3004BF557E8EC9B5931E499C4 |
| src/components/navigation/NavigationSearch.tsx | 8A49D9F6BF6E7B3B6F20674C433621D57CFB2AD7A49F88FFD1F16D308EE96F3B |
| src/components/navigation/MobileNavigationGroup.tsx | 00F1D7F210F61B8EA3439077576AB919DD47101AB0EF62E56DCA2C9ED870E075 |
| src/components/ui/app-sidebar.tsx | 516973FC45549265E5C82B63D61DC32BE6D4E014278F1D3D9B5FF1AC027373EC |
| src/components/layout/MainLayout.tsx | DC7FDB51AB2092781854331AD26055E800EA74FEC3002A5F9A8247EFFA972F0D |
| src/components/layout/MobileLayout.tsx | D3F78EC4B739F3B4788D6BFD44116EC8AAB94AA9BFB3EDEE98A3583676CED76E |
| src/pages/MobileMenu.tsx | E072420FF0B017EE9B1C188BBD0C3E5FF980AB0E33E597D1A6E41ACF3F2A3299 |
| src/hooks/useEmployeePermissions.tsx | E719927544AF15EA0E53EB6A0A3094435E97ACA09B7996125099D96E3380C916 |
| scripts/test-navigation-independent.mjs | 41ECA535E4C8663F0A22BDD7F3D59BF77E843D277F753944C4872EED4A8886BE |

Giới hạn: không kiểm thử Supabase/provider trực tiếp, không E2E toàn bộ nghiệp vụ,
không chạy global lint vì working tree có nhiều thay đổi có sẵn ngoài phạm vi.
Chưa commit, push hoặc deploy lên `crm.joliefam.vn`. Build local không đồng nghĩa
bản chính đã cập nhật. Ghim lưu tại trình duyệt này, không đồng bộ giữa thiết bị.
