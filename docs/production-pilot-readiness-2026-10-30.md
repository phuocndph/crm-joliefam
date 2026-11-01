# Hồ sơ chuẩn bị chạy thử sản xuất — dữ liệu local 30/10/2026

Chưa có dòng nào trong mẫu đủ căn cứ để giao may ngay. Ưu tiên chuẩn bị **đơn ORD-1786266621718**, gồm bốn cỡ ga tấm phủ và một vỏ chăn; cần người phụ trách xác nhận đơn còn thực sự mở và ngày cần hàng trước khi chọn làm pilot. Đơn 2882 là điểm đối chiếu nguồn cung/quy cách riêng, chưa tự coi là hàng nhập.

## Nguồn và giới hạn

- Đọc trực tiếp `crm_local` lúc **18:01:18 ngày 30/10/2026 (Asia/Bangkok)**, ngày xét mã **30/10/2026**; cùng snapshot `REPEATABLE READ READ ONLY`, kết thúc `ROLLBACK`.
- Có **33 đơn** sau khi loại trạng thái cancelled/returned/completed/delivered/shipped. Chọn tám dòng gần nhất khớp **chính xác ID sản phẩm đang hoạt động**, không ghép bằng tên/SKU, không dùng dữ liệu thử dựng mới. Trạng thái `pending` là dữ liệu hệ thống, chưa chứng minh nhu cầu còn hiệu lực ngoài thực tế.
- Bằng chứng: `.local-staging-runtime/pilot-readiness-20261030/snapshot.json`; script đọc `read.mjs` cùng thư mục. Không đọc `.env`, không tạo phiên đăng nhập, không gọi API ghi, không thay dữ liệu nguồn, không chạy test/build.
- Nguồn có **0 bản ghi phân loại cách đáp ứng**. Có **10 sự kiện APPROVE yêu cầu mã** trong lịch sử; con số này không phải mười yêu cầu hiện còn hiệu lực và không chứng minh sản phẩm đã mapping. Không dùng số 0 duyệt của ghi nhận cũ làm hiện trạng hôm nay.

## Tám dòng cần quyết định cụ thể

Tất cả tám dòng dưới đây có cùng kết quả chính thức: **cách đáp ứng UNCLASSIFIED V0, kỹ thuật EMPTY V0, resolver SUPPLY_REVIEW** (“Cần xác nhận lại cách đáp ứng sản phẩm”). Chưa có mã được resolver chọn; yêu cầu mã và đơn giá runtime **chưa đánh giá được**, không đồng nghĩa mã/giá không tồn tại. Resolver dừng tại cổng nguồn cung nên chưa được phép khẳng định mapping phù hợp hoặc thiếu riêng đặc điểm nào sau cổng này.

| Ưu tiên / đơn / dòng | SKU — sản phẩm | SL | Quy cách danh mục / quy cách đơn | Việc người phụ trách cần xác nhận |
| --- | --- | ---: | --- | --- |
| P1 / ORD-1786266621718 / 1 | GATPT300-T-1M2 — Ga tấm phủ T300 trơn 210x280 (dùng cho đệm 1m2) | 1 | 210x280cm / 210x280cm | Đơn còn mở; tự may hay nhập. Nếu may: xác nhận loại ga phủ, chất liệu thật, can/chần/diễu và cách may; không suy chất liệu chỉ từ T300. |
| P1 / cùng đơn / 2 | GATPT300-T-1M4 — Ga tấm phủ T300 trơn 230x280 (dùng cho đệm 1m4) | 1 | 230x280cm / 230x280cm | Xác nhận riêng cỡ này và các đặc điểm ảnh hưởng công; không tự dùng lại mapping cỡ 1m2. |
| P1 / cùng đơn / 3 | GATPT300-T-1M6 — Ga tấm phủ T300 trơn 250x280 (dùng cho đệm 1m6) | 1 | 250x280cm / 250x280cm | Xác nhận riêng kích thước thành phẩm và đặc điểm; chọn đúng mã/giá hiệu lực sau khi đủ dữ kiện. |
| P1 / cùng đơn / 4 | GATPT300-T-1M8 — Ga tấm phủ T300 trơn 270x280 (dùng cho đệm 1m8) | 1 | 270x280cm / 270x280cm | Xác nhận riêng kích thước, can nối nếu có và phương pháp may; không tự gán cùng công với cỡ khác. |
| P1 / cùng đơn / 5 | VCT300-1M2-T — Vỏ chăn T300 trơn 190*235 | 1 | 190*235cm / 190*235cm | Xác nhận chất liệu, can/chần/diễu, kiểu đóng và cách may. Dấu `*` cần nhập kích thước thủ công theo giới hạn parser hiện tại. |
| P2 / 2882 / 1 | DBE120X9F-C — Đệm bông ép cứng | 20 | 120x190x9cm / 120x190cm | Xác nhận nguồn cung; đối chiếu chiều cao 9cm bị thiếu trên dòng đơn. Chưa tự coi đây là sai hàng hoặc tự sửa đơn. |
| Không chọn mặc định / test8889989 / 1 | TOPPER160-MICRO — Topper Microfiber 160x7F | 1 | 160x7cm / 160x7cm | Tên đơn có chữ test: xác minh có phải nhu cầu thật. Quy cách hai số chưa nói rõ chiều dài/chiều cao, không bấm điền rồi coi 7 là chiều dài đã xác nhận. |
| Không chọn mặc định / test8889989 / 2 | GACTCS160x25 — Ga chống thấm sao su non 160x25F | 1 | 160x200x25cm / 160x200x25cm | Chỉ xét sau khi xác minh đơn thật; xác nhận nguồn cung, loại ga/cấu tạo chống thấm và chất liệu, không suy từ tên. |

## Tham chiếu mở đúng dữ liệu

| Đơn | ID / trạng thái / lần sửa cuối / ngày cần hàng |
| --- | --- |
| ORD-1786266621718 | `09916cfb-f6db-4192-9a5c-b8d8d0e0fa24` · pending · 09/08/2026 · chưa có ngày giao |
| 2882 / ORD-1790733750451 | `99b9eaf9-025b-4b84-b41f-3663f8d40263` · pending · 30/09/2026 · chưa có ngày giao |
| test8889989 / ORD-1786331250603 | `f8c0c2fb-2c6b-46ab-a11b-1240268fa97f` · pending · 22/08/2026 · chưa có ngày giao |

ID sản phẩm theo thứ tự năm dòng P1: `810b4b14-0783-44ed-bca0-7246975b0a5d`, `f9e7f7ed-f049-48af-9d0b-005dcb499db7`, `993162e9-e1ef-4caf-a212-e645658040b0`, `e101993c-a050-4ac9-9ef5-05e1d072b338`, `7e260bee-139f-47a6-822e-3290c8726d87`. Đệm 2882: `3984c6ae-e06f-4c41-93af-ecf3d93bb9ca`. Hai dòng đơn test: `566a2838-c9e6-494e-91b6-0e172c5ef8d7`, `c3ffa317-4bd7-48af-aa69-5884607704d9`.

## Điều kiện để bắt đầu pilot P1

1. Sale xác nhận đơn còn hiệu lực, số lượng và ngày cần hàng; quản lý quyết định cách đáp ứng từng sản phẩm. Nếu nhập sẵn thì đi luồng giữ tồn/mua, không cố mapping mã may.
2. Với dòng được xác nhận may, người phụ trách nhập/kiểm tra hồ sơ kỹ thuật và kích thước thành phẩm. Các danh sách đặc điểm ở bảng là câu hỏi nghiệp vụ cần trả lời, chưa phải tập thiếu do resolver đã đánh giá.
3. Rà đúng yêu cầu mã công và phiên bản hiệu lực, mapping sản phẩm/cỡ cùng quy đổi đơn vị; sau đó chạy lại diagnostics ở ngày giao thật. Chỉ đi tiếp khi resolver trả RESOLVED và đơn giá runtime hợp lệ; hiện cả hai bước còn chưa được chứng minh cho tám dòng.
4. Xác nhận BOM/vải, kho, nhân sự đúng tổ và mức công hiệu lực trước khi phát hành/giao việc. Hồ sơ này chưa truy vấn các dữ liệu đó, không coi chúng đã sẵn sàng.

## Thiếu dữ kiện và giới hạn phần mềm

**Thiếu dữ kiện hiện được chứng minh:** tám dòng chưa phân loại nguồn cung, chưa có hồ sơ kỹ thuật; tất cả thiếu ngày giao trên đơn, và đơn P1 đã lâu chưa cập nhật. Đơn 2882 có khác biệt độ đầy đủ quy cách; đơn test cần xác minh mục đích thật. Chưa có bằng chứng mapping/yêu cầu/giá đủ dùng, chưa được tự duyệt hoặc chọn mã thay doanh nghiệp.

**Giới hạn phần mềm cụ thể:** nút Điền quy cách chỉ nhận x/X/× nên chuỗi `190*235cm` phải nhập thủ công; đây là giới hạn nhập nhanh, không chặn nhập/xác nhận kỹ thuật thủ công. Chuỗi `160x7cm` có cú pháp hợp lệ nhưng parser không biết nghĩa nghiệp vụ từng số, cần người phụ trách kiểm tra. Chưa xác minh giao diện trọn chuỗi trên đơn thật; bằng chứng API chuỗi tổng hợp trước đây không thay nghiệm thu pilot này. Không phát hiện lỗi phần mềm mới từ lượt đọc dữ liệu này.
