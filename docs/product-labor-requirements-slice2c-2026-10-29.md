# Mục 5/5A — slice 2C.1 kiểm kê và nguồn mã công

Phạm vi: kiểm kê chỉ đọc, nguồn an toàn và đối soát tệp đã lưu. Theo `architect-slice2c-contract.md` cùng điều chỉnh `root-slice2c-execution-scope.md`; không thêm phân công, migration hoặc ghi chú production. Slice 2B V5 được root nghiệm thu riêng mã/QA cách ly; các freeze và thất bại cũ giữ nguyên.

## Giao diện và API

- Trong `Yêu cầu mã công` hiện có: `Xuất danh mục rà soát` tải JSON toàn bộ tại ngày nguồn; `Nguồn cần rà soát` mở chi tiết chỉ đọc. Không thêm tab cấp trang. Dòng tổng ghi rõ kết quả lọc, tách dòng nguồn đã duyệt và mã chuẩn; “Đã duyệt yêu cầu may” không đồng nghĩa sẵn sàng tính lương.
- `GET /api/payroll/labor-code-requirements/inventory?date=YYYY-MM-DD` dùng chính principal/capability hiện có (admin/manager với quyền xem/quản lý đơn giá), một client REPEATABLE READ READ ONLY và một truy vấn canonical nguồn + requirement. Chỉ nhận ngày, từ chối tham số lọc/phân trang thay vì xuất thiếu. Tối đa 20.000 dòng nguồn/mã; vượt giới hạn trả lỗi rõ ràng, không cắt cụt.
- DTO: schema1, ngày/tạo lúc, hash kiểm kê độc lập, counts không lọc (source_rows/canonical_codes/blank_rows và bảy trạng thái giữ nguyên), các mã chuẩn sắp xếp cùng tất cả nguồn APPROVED, requirement id/version/hash/ngày/disposition/stage hiện hành, và source_issues truy được ID dòng. Không tạo mã giả cho dòng trống. Chưa đánh giá khả năng biểu diễn/ánh xạ, `pay_ready=false`.
- List/detail thêm provenance an toàn, giữ nguyên sourceGuard và payload writer. Nguồn cùng nghĩa được giữ từng dòng; mâu thuẫn chứa mọi dòng cạnh tranh; nguồn tương lai và quá hạn phân biệt theo ngày. Chi tiết nguồn thu gọn; link bảng đơn giá hiện có chỉ mở khi không dirty/busy/uncertain/committed, không thêm writer sửa nguồn.
- Label nguồn chỉ nhận basename tài liệu bị giới hạn; bỏ đường dẫn, URL credentials/query/fragment, không đọc file hay tải URL. Tên nguồn không nhận dạng được thành “Nguồn đơn giá”. Projection không chứa số tiền, private proposals/counts/notes hoặc mapping proof. Các ghi chú/quyền xem proposal hiện có không bị mở rộng.
- Hash kiểm kê từ schema/ngày, semantic/status, nguồn an toàn và requirement identity đã chọn, sắp xếp ổn định. Không chứa generated_at, số tiền hoặc private proposals; không thay hash hợp đồng/source/mapping hiện có. GET không nâng cấp hoặc ghi dữ liệu.

## Đối soát tệp đã lưu

`node scripts/reconcile-product-labor-coverage.mjs --old saved-old.json --new saved-inventory.json --out .local-staging-runtime/evidence-new.json`

Chỉ đọc JSON cục bộ (giới hạn 20MB), đầu ra mới trong staging; không DB/network/seed/approval. Bản mới phải là inventory schema1 có hash hợp lệ và cùng ngày so sánh. Bản cũ nhận inventory hoặc đúng snapshot lịch sử SHA256 `1223bd781413f388d7c004129545fee840fb9441915e7e80ffbac8bd83105cc3`.

Nguồn lịch sử thô **130 dòng / 126 mã / 4 dòng thiếu mã**, trong đó **129 APPROVED / 126 mã / 3 dòng thiếu mã**, một dòng trống RETIRED bị loại với lý do riêng. Đối soát giữ cả 130 identity; không đổi filter canonical để cố giữ dòng RETIRED. Các số này không phải số lượng runtime hiện tại. Requirement lịch sử chưa có chứng cứ được đánh dấu chưa đánh giá, không suy business approval từ seed/tên/mã.

Mỗi code key có đúng một dòng trong hợp hợp nhất trước/sau: không đổi, mới, thiếu, đổi semantic, vấn đề nguồn hoặc đổi requirement; có thể có nhiều dấu hiệu, một classification chính để tổng đếm không trùng. Mã thiếu vẫn là chênh lệch lịch sử, tên giống không gộp mã khác. Không thừa kế hoàn tất, không tự duyệt hoặc bật pay-ready. Dữ kiện nghiệp vụ/nhận xét và tệp rà soát bound hash là lượt tiếp theo do root giao riêng; chưa làm trong 2C.1.

## Đường cơ sở kiểm thử và bàn giao

Các test mới bao phủ projection/hash/privacy/bound, historical 130→129, tất cả bảy counts, source issues; fixture API mới dùng database/role tổng hợp riêng không superuser, chỉ loopback. Instrumentation kiểm inventory 1 so với 126+ mã có cùng số query, forced interleave nguồn/requirement giữa snapshot, detail/history/proposals không trộn; hồi quy lifecycle/seed/sourceGuard và ACL, read-only digest các bảng cấu hình/vận hành. Suite yêu cầu manifest freeze trước khi khởi chạy.

Prefreeze app/server TypeScript và focused lint đạt. Sau freeze chạy pure/API, types/lint và fresh build không .env, ghi log và manifest artifact riêng. Chưa có kết quả PASS trước khi chạy; root/reviewer/tester nghiệm thu cùng freeze, root CUA desktop1280/mobile390 kiểm nguồn, export/hash/count/download, lọc so với toàn danh mục và lỗi phục hồi. DOM và tải file không được thay bằng source markers.

## Giới hạn

Đây chỉ là inventory/provenance, chưa hoàn thành toàn 2C, toàn mục5/5A hoặc phê duyệt danh mục thật. Chưa làm tệp ghi nhận rà soát tối thiểu sau điều chỉnh scope; còn sáu nhóm đơn giá, cấu hình nhóm người làm và readiness phát việc/ghi tiền công. Giữ `pay_ready=false`/`GROUP_CHECK_PENDING`, chưa mở mục6, không migration/activation, không businessDB/Supabase/deployment. Không đổi schema/resolver/proof/seed hoặc lịch sử. Fixtures/helpers giữ phục vụ nghiệm thu, không coi cleanup hoàn tất.

## V1 và điều chỉnh test V2

Own V1 pure23/23, app/server TypeScript, focused lint và no-env build đạt. Build V1 artifact `3d7ab4860b7f32700dd3cb7ef84f7912ee039d129fd8edb61080de81c50ddbc6`, 496 nguồn, 173 file. API V1 8/9: kiểm inventory/query/snapshot/provenance/privacy/lifecycle/đối soát và read-only đạt, một kỳ vọng ACL sai (manager có false grant bị cho là phải403). Giữ freeze V1 `58a6d93666e621c2b0eb62e2db6dfcec6121a2eefa4d1cab68a17bc04bf44935`, log và lỗi nguyên trạng; fixture thất bại đã cleanup, không dùng làm nghiệm thu UI.

Root đối chiếu `permission-policy.ts`: manager có quyền nhạy cảm theo vai trò, false grant cá nhân không thu hồi được quyền này; `requireLocalCapability` hiện có cũng cho admin/manager qua. V2 chỉ sửa test để manager vẫn200 sau false grants và kiểm mất quyền thật bằng đổi vai trò sang accountant403, cùng anonymous/employee bị từ chối. Không sửa quyền production. Root cho phép đóng freeze V2 mới chỉ đổi test cách ly và báo cáo này, các production bytes V1 giữ nguyên. Artifact V1 chỉ tái dùng sau đối chiếu đúng toàn bộ 496 source hashes; pure tương ứng chỉ tái dùng trong phạm vi hash không đổi. API V2 phải chạy fixture cách ly mới và chỉ giữ lại khi đạt; chưa ghi kết quả trước khi chạy.

## Root nghiệm thu 2C.1 V3 — chỉ mã và QA cách ly

Root quyết định **ACCEPTED_CODE_AND_ISOLATED_QA** riêng 2C.1 tại `.local-staging-runtime/item5-baseline/root-slice2c1-v3-acceptance.md` và `root-slice2c1-v3-final-proof.json`. Freeze V3 SHA256 `95ea15cf1fcdfd48a09643f7959c31e71a13ca5dcb3feadd661d9e49ecfd0230`: 196/196 khớp sau DOM, drift0; 145 backend nguyên byte. Không coi là hoàn thành toàn 2C/5A hoặc duyệt định nghĩa mã thật.

- Own API V2 mới9/9; independent saved/pure7/7 và API7/7, reviewer source/projection28 ca và V3 bounded addendum đạt. Root matrix C01–C04/C12–C14 nêu rõ bằng chứng mới/tái sử dụng theo hash; không báo đã chạy lại tất cả suite 2B trên bản CSS V3.
- Root actual SPA mới artifact `347c9aa97345f280c888986d513de0c277a011d88e4607ea70b118a35712acd1`, 496 nguồn xác nhận, khác own V3 `73df462f…`. Desktop1280/mobile390 tải file thật đủ138mã/142nguồn/1blank dù lọc1mã; cả hai có inventory hash `81b462fbcafb13b7063c2917bdf11f824e128211deaa6b1745b6d78e03cd79bb`. Đây là fixture synthetic, không phải count runtime đang dùng.
- Source dialog: mobile action340×44, desktop207.47×44, close44×44, không cắt chữ/tràn ngang. Blank/conflict/future/expired có identity/dòng/basename an toàn. V2 recovery503→200, giữ filter, disabled trong khi tải, dirty link/Escape giữ nội dung được tái dùng sau xác nhận hai literal CSS V3 không đổi handlers. Escape sau transition được quan sát DOM đã tháo.
- Independent read-only digest mọi bảng/cột giữ nguyên trừ duy nhất `auth_sessions.last_seen_at` middleware cũ; config và48bảng vận hành không đổi. Root business POST bằng0; không businessDB/Supabase/activation. Source snapshot lịch sử130/126/4 và APPROVED129/126/3 vẫn tách rõ, retired blank có lý do loại trừ.

Giữ nguyên lỗi own V1 ACL, independent V2 oracle last_seen_at và actualGUI V2 nút tải44px bị cắt. V3 chỉ sửa selector close và width nút thường. Root proof đầu quan sát closing transition vẫn giữ cùng script ban đầu, không sửa phần mềm để làm assertion xanh. Sau nghiệm thu chỉ cập nhật báo cáo này và implementation-log; drift tài liệu có chủ đích ngoài freeze bất biến. Fixtures/helpers giữ đối chiếu, chưa cleanup hoàn tất.

Lượt tiếp theo chỉ là công cụ tệp rà soát từ inventory đã lưu và dữ kiện thủ công được cung cấp, không runtime/assignment/table/migration. Chưa hoàn tất toàn2C/5A; còn sáu nhóm giá, cấu hình nhóm người làm và readiness. `pay_ready=false`/`GROUP_CHECK_PENDING`, chưa mở mục6 hoặc kích hoạt vận hành.

## Cập nhật — công cụ saved review ledger V3 đã được nghiệm thu

Root quyết định `ACCEPTED_CODE_AND_ISOLATED_SAVED_FILE_QA` cho ledger tại `root-ledger-v3-acceptance.md/.json`, SHA256 JSON `687f51efd1e13178c4383c7e22db58495db42a6c0ecb5ead2bea9c4906a801a9`. Freeze199/199 nguyên trước nghiệm thu, SHA `ff516fcd3854dbc63693e52aad3c6544258064d3c82ff2cf7ea62f4daeb936b5`; own17/review19/tester10 và root actual savedCLI138mã/7issues đạt. Runtime2C.1/schema/seed/writers không đổi; không lặp build/API/DB hoặc nhận định GUI mới cho công cụ saved-only.

Ledger ràng buộc inventory hash/ngày/code/semantic/issueID, giữ nguyên source/requirement, tách nhận xét nhập tay và candidate UNAPPROVED. Khôngfacts thì NOT_REVIEWED/NOT_ASSESSED, mapping chưa đánh giá/payfalse. Source inconsistent dù checksum hợp lệ bị chặn; output junction bị từ chối trước tạo thư mục ngoài. Chỉ là kiểm nhất quán savedfile, không xác thực nguồn xuất/live database và không tạo approval/mapping/import.

Giữ lỗi V1 Markdown oracle, L01/L02, checkpointV2 và root oracle so hash hai file xuất khác timestamp/fileSHA; root chỉ sửa assertion theo digest/source thật, không sửa phần mềm để che lỗi. Sau nghiệm thu chỉ ba docs báo cáo/log có drift có chủ đích, freeze bất biến. Tình trạng phần mềm inventory/provenance/đối soát/ledger đã nghiệm thu riêng; coverage định nghĩa thật toàn5A còn thiếu khi chưa có dữ kiện được cung cấp.

Nguồn workbook root kiểm chỉ đọc `Copy of luong_2026 (1).xlsx`: headers hai sheet don-gia/don-gia-moi có cộtC don_gia đơn; chưa xác minh sáu cột nhóm giá hoặc toàn bộ ngữ nghĩa/đơn vị. Không suy giá/nhóm hoặc nhân bản giá mặc định. Còn sáu nhóm đơn giá, cấu hình người làm và readiness trong mục5/5A; không mở mục6/8/11/13 hoặc activation/deployment. Xem báo cáo `product-labor-saved-review-ledger-2026-10-29.md` cho giới hạn và bằng chứng.
