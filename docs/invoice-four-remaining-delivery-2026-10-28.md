# Kết quả bốn phần hóa đơn và tham khảo GitHub — 28/10/2026

## Trạng thái hiện tại — xác minh 12:29 ngày 28/10/2026 (UTC+7)

Bản local đang chạy tại [Quản lý hóa đơn](http://127.0.0.1:8083/einvoices), API 8787. **Đồng bộ thật tháng 06/2026 đã hoàn thành 2 trang, 34 hóa đơn Viettel** cho Công Ty TNHH Gia Lộc Hưng Phát, MST 0108652480. Chưa hoàn tất nghiệm thu cả bốn phần: tải XML/PDF gốc bị nhà cung cấp từ chối và chưa có tệp thật xuất từ cổng thuế.

| Phần | Kết quả đã kiểm chứng | Việc còn thiếu |
|---|---|---|
| 1. Chia tiền cho hợp đồng | Mở phần chia đã lưu, sửa/lưu/tải lại, xử lý revision và xóa chủ động có lý do; API và mobile đã kiểm tra. | Không còn finding mở trong phạm vi này. |
| 2. Doanh nghiệp và truy cập | Đúng một pháp nhân đang hoạt động; quyền cấu hình/nhập/tệp có sẵn; danh sách hoạt động. | 502 hóa đơn lịch sử chưa được tự gán vào pháp nhân khi chưa có bằng chứng MST. |
| 3. Viettel | Đọc được nguồn thật; job `c53d8ed8-aca0-4e0d-8a75-03c6e0896e52` COMPLETE, 2 trang, 34 hóa đơn, `last_error=null`. 34/34 bộ tổng tiền khớp chính xác nguồn. | **0 tệp XML/PDF gốc**; 34 phản hồi tải tệp thuộc nhóm `PROVIDER_REJECTED`. Chưa đủ bằng chứng kết luận do quyền hay tham số nghiệp vụ. Các hóa đơn vẫn cần kiểm tra hồ sơ. |
| 4. Tệp thuế và mobile | Preview XML có tên/MST hai bên, chiều hóa đơn, dòng hàng, tiền và cảnh báo; tiếp nhận mẫu vào DB thử đạt. Giao diện 360–390px đã kiểm; đối chiếu dòng hóa đơn thật ở 360px không tràn ngang, các chênh lệch tiền bằng 0. | Chưa có XML/Excel/ZIP thật tải từ cổng thuế của doanh nghiệp để nghiệm thu định dạng, chống trùng và tổng tiền. Chưa triển khai đăng nhập/đồng bộ tự động cổng thuế. |

### Tham khảo GitHub đã áp dụng

- [vn-einvoice — MIT](https://github.com/ngoquangthanhphu/vn-einvoice/tree/78e72e6416663170bae2351eb718d86ad11bd602): trình bày preview XML có cấu trúc, dữ liệu thiếu và cảnh báo.
- [demo-api-gdt — MIT](https://github.com/cassostation8/demo-api-gdt/tree/f6d43d9e0b7acaf9afb0345e9a20d91ef2363ee5): tách kết nối, tiến độ đồng bộ và độ đầy đủ; chống phản hồi cũ.
- `gdt-invoice-hub` chỉ tham khảo hành vi vì chưa xác nhận được license. Không sao chép/chạy mã ngoài, thêm Casso hoặc gửi dữ liệu doanh nghiệp sang dịch vụ đó. Mẫu GitHub không thay thế tệp thuế thật hay chứng minh tính hợp lệ pháp lý.

Chi tiết nguồn ở `invoice-github-pattern-references-2026-10-28.md`.

### Kiểm thử và bảo toàn dữ liệu

- Manifest hiện tại `compatibility-20261028-v1.json`, SHA256 `BA2DAC2B090200FC80722766B00EB41386A0ECF5AFCFBB19E7EA01429148B203`; kiểm cuối **49/49 hash khớp** (45 tệp production/dependency, 4 tài liệu cố định).
- Reviewer độc lập đạt; tester **102/102 nhóm đạt**, gồm 13 nhóm tương thích decimal Viettel. TypeScript app/server, lint theo phạm vi, build app/server và diff-check đạt. Vẫn có cảnh báo build chunk lớn đã biết.
- Sửa riêng Viettel để bỏ số 0 thập phân dư trước kiểm tra scale; không làm tròn hoặc thay parser tiền toàn cục. 102 trường tổng tiền nguồn ở 34 hóa đơn thật có phần thập phân mà parser cũ từ chối; cả 34 bộ tổng tiền sau sửa đều khớp chính xác nguồn.
- Đọc kiểm chứng cuối: 502 hóa đơn lịch sử, fingerprint tiền `af836efc96c86a4c584c17a3da4e7420`, 50 hợp đồng đều giữ nguyên. 34 hóa đơn mới từ lần đồng bộ thật được lưu riêng theo pháp nhân.
- Bằng chứng tổng hợp: `.local-staging-runtime/invoice-20261027/real-sync-compatibility-proof.json`; log kiểm thử `test-invoice-compatibility-20261028-v1-rerun.log`. Không lưu credentials/raw response trong báo cáo.
- Ảnh: `invoice-live-june-sync-complete-34.png`, `invoice-live-mobile-360-exact-deltas.png`. Viewport mobile đã được khôi phục sau kiểm thử.
- API PID 50780, UI PID 51520 đã xác minh ownership cổng; `/health` trả `ok:true`, trang hóa đơn HTTP 200. Luôn kiểm lại ownership trước khi dừng tiến trình.
- Backup trước lần đồng bộ: `backups/invoice-workspace-before-remaining-20261028-2026-10-28T04-56-48-567Z/`, dump SHA256 `98a08c577bcf51dbe879df0f197285ff5934fec6155295c1c84ab98b628ac2dd`; đã restore thử thành công. Snapshot này có 502 hóa đơn cũ, chưa có 34 hóa đơn đồng bộ sau đó.
- **Backup sau đồng bộ, 12:33 UTC+7:** `backups/invoice-workspace-before-remaining-20261028-2026-10-28T05-33-44-158Z/`, dump 8.227.469 byte, SHA256 `46a40b1dd2ce0777ef7bb266eec9c15a367b670ac9df368a4c8bc9fe6cfda062`. Đã phục hồi thật bằng `verify-backup-v5-restore.mjs` vào DB QA riêng: **536 hóa đơn, 50 hợp đồng**, fingerprint tổng tiền `795a41cec1d8d4e371676f2ce9c9322c`, và hash đủ **53 tệp storage** khớp bản sao. DB phục hồi được dọn sau kiểm tra. 53 tệp này vẫn không phải XML/PDF gốc của 34 hóa đơn mới; số tệp gốc của sổ hóa đơn vẫn là 0.
- Không sửa migration 064–069, ký/phát hành, gán dữ liệu lịch sử, commit/push hoặc cập nhật VPS.

### Các bước nghiệm thu tiếp theo

1. Người dùng đăng nhập trực tiếp [Viettel](https://vinvoice.viettel.vn/account/login) trên tab đang chờ. Kiểm tra tải ZIP gốc của **một** hóa đơn hiện có (ví dụ 0000165, ký hiệu C26TAA) để phân biệt khả năng tải trên portal và API. Không cần gửi mật khẩu trong chat.
2. Nếu portal tải được nhưng API vẫn từ chối, đối chiếu với Viettel theo tài liệu chính thức: POST `InvoiceAPI/InvoiceUtilsWS/getInvoiceRepresentationFile`, MST người bán 0108652480, số hóa đơn gốc và template tương ứng, định dạng ZIP. Cần nhà cung cấp xác nhận quyền/định danh; không tự suy ra từ `PROVIDER_REJECTED`, không thử endpoint/xác thực khác hoặc lặp tải cả 34 hóa đơn. Chưa gửi thông tin hỗ trợ ra ngoài.
3. Khi tải nguồn đã được giải quyết, tạo yêu cầu đồng bộ mới cùng kỳ để nhận tệp; job COMPLETE hiện tại không gọi lại nhà cung cấp khi resume. Cơ chế chống trùng/retry đã kiểm trong DB thử; nghiệm thu phải xác nhận có tệp và mở/tải được trong CRM.
4. Có tệp thật xuất từ cổng thuế: preview, đối chiếu MST/chiều/tổng tiền và kiểm tra nhập lặp trong DB thử trước khi nhập vào sổ thật. Không dùng tệp tổng hợp thay dữ liệu thật để kết luận hoàn tất.

## Báo cáo ban đầu V3 — chỉ lưu lịch sử

Các kết quả dưới đây ghi nhận thời điểm trước bản tương thích và lần đồng bộ thành công ở trên; các lỗi HTTP/schema và PID cũ không mô tả trạng thái hiện tại.

Đã cập nhật bản local tại `http://127.0.0.1:8083/einvoices`, API 8787. Chưa hoàn thành toàn bộ bốn điều kiện nghiệm thu: kết nối Viettel thật đang lỗi HTTP; chưa nhận được tệp xuất thật từ cổng thuế để đối chiếu.

## Kết quả theo phần

| Phần | Đã hoàn thành | Chưa hoàn thành |
|---|---|---|
| 1. Chia tiền cho hợp đồng | Tải phần chia đã lưu; giữ revision; phân biệt tải/lỗi/rỗng; không ghi đè rỗng ngầm; xóa chủ động có xác nhận và lý do. API và UI lưu/tải lại/đổi khoản/xóa đã kiểm tra. | Không còn finding mở trong phạm vi sửa này. |
| 2. Doanh nghiệp và truy cập | Xác nhận đúng một pháp nhân Gia Lộc Hưng Phát, MST 0108652480; quyền cấu hình có sẵn. Sửa binding SQL admin; danh sách không còn lỗi. UI lịch sử tháng 06/2026 hiển thị 205 hóa đơn, khớp DB. | 502 hóa đơn cũ vẫn ở phạm vi lịch sử, chưa tự nhận vào pháp nhân. Việc đối chiếu từng hóa đơn cần bằng chứng MST. |
| 3. Viettel | Chẩn đoán theo mã an toàn; ghi trạng thái trước khi trả kết quả; chống response cũ/config race; lọc lỗi lịch sử trên DTO; giữ nguyên dữ liệu/hash bằng chứng. | Kiểm tra đọc thật 28/10/2026 04:35:50 UTC (11:35:50 Việt Nam) trả FAILED/HTTP_ERROR. Chưa chứng minh được đồng bộ kỳ thật hoặc tải XML/PDF gốc. Không suy đoán nguyên nhân là sai mật khẩu từ mã này. |
| 4. Tệp thuế và mobile | Preview hiển thị hai bên/MST/chiều hóa đơn/tiền/dòng hàng/cảnh báo. Form chi tiết và nhập tệp không tràn ngang ở 360–390px. XML tổng hợp đã preview và tiếp nhận vào DB thử riêng. | Chưa có XML/Excel/ZIP doanh nghiệp tải từ cổng thuế để nghiệm thu định dạng và đối chiếu thật. Không có kết nối tự động tới cổng thuế trong đợt này. |

## Áp dụng từ GitHub

- [vn-einvoice — MIT](https://github.com/ngoquangthanhphu/vn-einvoice/tree/78e72e6416663170bae2351eb718d86ad11bd602): tham khảo preview XML có cấu trúc và cảnh báo. CRM giữ chuỗi decimal chính xác, không tự biến dữ liệu thiếu thành số 0.
- [demo-api-gdt — MIT](https://github.com/cassostation8/demo-api-gdt/tree/f6d43d9e0b7acaf9afb0345e9a20d91ef2363ee5): tham khảo phân biệt trạng thái kết nối, đồng bộ và độ đầy đủ; chống phản hồi cũ. Không thêm dịch vụ Casso hoặc gửi dữ liệu doanh nghiệp sang đó.
- [gdt-invoice-hub](https://github.com/thuanhuynh247/gdt-invoice-hub/tree/c55313e0ffeea5c59e1d8b27585b5ca71af2bc38): tham khảo hành vi; không sao chép nguồn vì chưa xác nhận được license repository.

Không cài/chạy mã ngoài, không đổi giao thức Viettel theo API nội bộ không được kiểm chứng. Không ký/phát hành hóa đơn.

## Kiểm thử và bản cố định

Manifest `.local-staging-runtime/invoice-20261027/phase-20261028-v3.json`, SHA256 `BA8A810C29D256DE3498F27BB1EFC03845816A1EFE89BFF5F7B407D5A856B028`. Reviewer và tester độc lập xác nhận 44/44 tệp production cùng 3 tài liệu khớp trước/sau. Một vòng sửa đã đóng hai finding: DTO lỗi lịch sử và race phân loại timeout.

- `INVOICE_QA_SPLIT_EDITOR=1 INVOICE_QA_PROVIDER_DIAGNOSTICS=1 node scripts/test-invoice-workspace-isolated.mjs`: **89/89 nhóm đạt**, log `test-invoice-phase-20261028-v3.log`.
- 15/15 nhóm hợp đồng đạt ở phase1; không chạy lặp lại vì dependency hợp đồng không đổi trong V2/V3.
- TypeScript app/server, lint theo phạm vi, build app/server, diff-check đạt. Build local cuối đạt; vẫn có cảnh báo chunk lớn của Vite.
- UI fixture: 60/40 mở đúng; lưu/tải lại 70/30; mobile lưu/tải lại 75/25; xóa chủ động cho kết quả rỗng thật. DB xác nhận hai phiếu thu tổng 200, tiền phân bổ 200 và hóa đơn 220 giữ nguyên.
- XML tổng hợp `QA-GITHUB-PREVIEW-20261028`: preview đúng đầu vào, tổng 220; tiếp nhận đúng một hóa đơn trong DB thử. Không dùng kết quả này thay nghiệm thu tệp thật.

Ảnh bằng chứng trong `.local-staging-runtime/invoice-20261027/`: `invoice-mobile-360-split-v2.png`, `invoice-mobile-360-import-v2.png`, `invoice-live-viettel-check-v3.png`, `invoice-live-legacy-june-v3.png`. V3 chỉ thay ba tệp server so với V2; CSS/preview giữ nguyên đã kiểm UI.

## An toàn dữ liệu và runtime

Backup trước thay đổi đã restore thử thành công: `backups/invoice-workspace-before-remaining-20261028-2026-10-28T03-52-56-928Z/`. Dump SHA256 `014fc035e8d1acb36defdf8034cbc118324616ad91cf97ccec22e5b099a08421`.

Trước/sau kích hoạt: 502 hóa đơn, 50 hợp đồng, fingerprint tiền `af836efc96c86a4c584c17a3da4e7420` không đổi; bản ghi tệp hóa đơn gốc vẫn 0. Backup bảo toàn 53 tệp storage; số này không phải số XML/PDF gốc trong sổ hóa đơn mới. Không chạy migration; 064–069 giữ nguyên. Không commit/push/cập nhật VPS.

Runtime mới: API PID 28924, giao diện PID 19240; `/health` trả `ok:true`, trang trả HTTP 200. Khi dừng/khởi động lại phải kiểm ownership thực tế, không dùng PID này nếu đã thay đổi.

Đã dừng ba tiến trình UI/API thử 11196/22716/46088; xóa đúng DB `invoice_workspace_qa_32068_1793160177496` và role tương ứng. Bộ kiểm duyệt tự động từ chối xóa thư mục tệp tổng hợp `C:/Users/Lenovo/AppData/Local/Temp/invoice-workspace-owned-GKqrim` với lý do `blocked by policy`; giữ nguyên thư mục, không thử lại bằng cách khác. Các đường dẫn từng bị từ chối ở đợt trước không bị tác động.

Việc tiếp theo: xác minh phản hồi HTTP từ dịch vụ/tài khoản API Viettel để đọc thành công, sau đó đồng bộ một kỳ và đối chiếu tệp gốc; nhận tệp xuất hợp lệ thật từ cổng thuế để nghiệm thu nhập và chống trùng. Đây là phần còn thiếu, chưa được đánh dấu hoàn thành.
