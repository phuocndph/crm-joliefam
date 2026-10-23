# Thiết kế hủy phần chưa cắt — batch060 dự kiến

Kiến trúc tiếp nối kế hoạch UX20, chưa chứng nhận đã triển khai.
Không thay nút hủy toàn lệnh cho việc hủy phần dư khi lệnh đang chạy.

## Nguồn ghi nhận và giới hạn

Thêm ledger append-only `local_production_uncut_cancellations`: id, order,
batch, item, quantity numeric(18,4)>0, reason, actor, time, idempotency_key
unique; FK/index và revoke PUBLIC theo migration058. Không backfill.

Giữ nguyên original planned, Sale allocation/request/ordered, báo cáo, tiền
công và movement kho. Tổng hủy đọc từ ledger, không có bộ đếm thứ hai.
Chỉ hủy phần chưa cắt, không hủy WIP của phần đã cắt.

## Giao dịch

`POST /api/production-workspace/:id/cancel-uncut` tái sử dụng mutate/manage,
shared payroll guard, idempotency lock, parent lock rồi batch lock. Kiểm đúng
WORKFLOW_V3, quyền quản lý, batch/item cùng lệnh và trạng thái chưa chốt.

Review060 vòng1 chốt chỉ cho hủy phần chưa cắt ở RELEASED/IN_PROGRESS/ON_HOLD.
Không cho DRAFT: hủy hết khi chưa có BOM có thể làm lệnh không phát hành hoặc
đóng được. Lệnh nháp chưa phát sinh dùng quy trình hủy toàn lệnh; không ghi
ledger hủy-chưa-cắt hoặc audit thành công khi API từ chối DRAFT.

Không tự đóng việc mở hoặc trả assignment: mục tiêu còn OPEN cắt chưa nhận,
PENDING cắt, ACCEPTED còn chưa xử lý/trả, hoặc báo cắt SUBMITTED thì trả409
với hướng dẫn xử lý trước. Không chặn may/gấp–là/QC của phần đã cắt.
Ghi ledger và audit cùng giao dịch, không ghi kho/lương.

R = sum(coalesce(accepted,allocated)-returned) cutting assignment không rejected.
P = sum(quantity_received) cutting báo gốc có hiệu lực, gồm đạt/sửa/hỏng.
C = tổng đã hủy. O = publication cắt còn mở.

Hạn mức mới <= original plan - C - greatest(R,P) - O, kiểm SQL numeric ở cả
batch và tổng item qua các batch. Không cộng R+P vì trùng; nếu P>R cần từ
chối để đối chiếu dữ liệu. Không dùng cutting-good làm số đã thực hiện.

## Các điểm phải cập nhật đồng bộ

- CUTTING capacity ở available/cuttingPlanCapacity và projection trừ hủy.
  Các bước sau vẫn lấy predecessor approved-good, không trừ hủy lần nữa.
- Bảng/type/nextStep hiện kế hoạch gốc, hủy chưa cắt và còn thực hiện.
- Chặn split/resize lô có cancellation; không chuyển ledger hủy sang lô khác.
- Dự toán/BOM đã duyệt giữ nguyên. Nhu cầu còn thực hiện dùng helper
  cuttingRequirementForOutput, không chia tỷ lệ tùy tiện. MANUAL_MEASURED
  giữ nhu cầu đã duyệt, ghi cần đối chiếu nếu muốn giảm; không tự hoàn vải.
- Chốt: received-good + actual-scrap + cancelled-uncut = original planned.
  Không dùng planned-good làm scrap vì sẽ biến số hủy thành phế phẩm.
- Vẫn chặn chốt khi còn việc dở, pendingreport, repair/remake chưa xử lý hoặc
  phiếu kho nháp. Chốt không tạo thêm output.
- Phần đã làm vẫn nhập/giao được. Hủy sản xuất không đồng nghĩa khách hủy;
  Sale còn nghĩa vụ giao theo lượng đặt. Không tự giải phóng allocation.

## Kiểm thử bắt buộc

1. Plan10/cắt đạt4/hủy6 → may4→QC4→nhập4→chốt: good4/scrap0/cancel6.
2. Plan10/cắt4 cóhỏng1 → chỉ hủy6, không7; good3/scrap1/cancel6.
3. OPEN/PENDING/acceptedremaining/SUBMITTED cắt chặn hủy; dọn xong cho phép.
4. WIP may/gấp/QC của4 không chặn hủy6 và tiếp tục được.
5. Hai hủy đồng thời hoặc đua publish/assign/claim/report không vượt quota.
6. Replay cùngkey/body mộtrecord/audit; khácbody/actor bị chặn.
7. Saiquyền/generation/batch/item/quantity bị chặn, không để residue.
8. Nhiều batch kiểm tổngitem; split/resize không né cancellation.
9. Không đổi wage/movement/valuation/lockedpayroll; hoàn vải cần chứng từ.
10. Sale ordered/allocated không đổi; giao4 được nhưng chưa delivered nếuđặt10.
11. Restart giữ cancellation/audit/capacity; upgrade chỉ thêm cấu trúc được
    duyệt, đối chiếu dữ liệu cũ và lịch sử migration.
12. UI không nhầm canceled với scrap, không yêu cầu cắt/cấp vải phần đã hủy;
    nhãn ngoại lệ MANUAL_MEASURED rõ ràng.

Triển khai sau batch059 review/test đóng; migration060 riêng, không sửa
058/059 đã diễn tập. Cần helper phù hợp boundary hiện tại trước live.
