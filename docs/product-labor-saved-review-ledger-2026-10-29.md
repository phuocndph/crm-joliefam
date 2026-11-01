# Tệp rà soát mã công từ bản kiểm kê đã lưu

Phạm vi riêng trong mục5/5A sau root nghiệm thu2C.1V3: công cụ saved-file, không thêm chức năng runtime, phân công, bảng dữ liệu hoặc migration. Chỉ ba tệp mới: script tạo ledger, test tập trung và tài liệu này; staging chứa freeze/bằng chứng đầu ra. Không sửa accepted2C.1, schema/resolver/proof/seed, source writer, API hoặc UI.

## Cách dùng

`node scripts/build-product-labor-review-ledger.mjs --inventory saved-inventory.json --out-prefix .local-staging-runtime/ma-cong-review`

Thêm `--reviews supplied-reviews.json` khi đã có dữ kiện được con người cung cấp. Tạo mới hai tệp `.json` và `.md`; không ghi đè input hoặc output có sẵn. Chỉ đường dẫn file cục bộ, inventory tối đa20MB, review tối đa2MB; output bên trong staging sau kiểm đường dẫn thật. Không DB, network, auth, .env, source import hoặc approval. Runtime không đọc tệp này.

Inventory phải là saved schema1 của2C.1, có hash/date/identities/counts/provenance/sourceissues nhất quán. Hash chỉ chứng minh tính nhất quán nội bộ, **không xác thực máy chủ, nguồn xuất hoặc trạng thái live**. Tiêu đề MD ghi “Theo bản kiểm kê đã lưu”; tệp không kiểm tra database đang chạy. Người dùng chịu trách nhiệm lấy bản xuất được cấp quyền. Không nhận historical130row source-facts như inventory hiện tại; công cụ reconcile đã nghiệm thu xử lý lịch sử riêng.

## Nhận xét được cung cấp

```json
{
  "review_schema_version": 1,
  "inventory_hash": "<hash của inventory>",
  "date": "2026-10-29",
  "reviews": [
    {
      "code_key": "<mã chuẩn trong snapshot>",
      "semantic_fingerprint": "<semantic chính xác trong snapshot>",
      "gap": "BUSINESS_FACTS_MISSING",
      "missing_facts": ["Cần xác nhận đơn vị thực tế"],
      "note": "Nội dung được cung cấp, không suy từ tên mã",
      "evidence": [{"reference": "Mã tài liệu được cung cấp", "sha256": "<checksum nếu có>"}],
      "next_action": "Quản lý xác nhận thông tin trước khi soạn đề xuất",
      "reviewer_label": "Tên được người nhập cung cấp",
      "reviewed_on": "2026-10-29"
    }
  ],
  "source_issues": [
    {
      "rate_id": "<ID issue chính xác trong inventory>",
      "semantic_fingerprint": "<semantic issue>",
      "gap": "SOURCE_FIX_REQUIRED",
      "note": "Đối chiếu dòng gốc",
      "next_action": "Sửa trong bảng đơn giá hiện có"
    }
  ]
}
```

Checksum bằng chứng không bắt buộc; nếu có phải SHA256. Toàn bộ reviewer/ngày/bằng chứng đều được gắn nhãn **nhập tay, chưa xác thực**; tool không mở tài liệu hay tải URL. Không cho ghi các trường source/requirement/coverage/mapping/pay vào nhận xét. Binding khác snapshot/ngày/code/semantic/issueID, unknown hoặc trùng bị từ chối toàn bộ, không thừa kế hoàn tất. Thay riêng nguồn cũng đổi inventory hash và cần ghi nhận mới.

Loại thiếu: `NOT_REVIEWED`, `BUSINESS_FACTS_MISSING`, `DICTIONARY_GAP`, `SOURCE_FIX_REQUIRED`, `READY_TO_AUTHOR`. Không có nhận xét thì NOT_REVIEWED và representability NOT_ASSESSED; có câu hỏi/phần thông tin thì vẫn là gap. Không tự sinh định nghĩa từ tên/mã/SKU hoặc đơn vị từ tên công.

Có thể thêm `candidate_definition` **hoàn chỉnh do con người cung cấp** vào một review mã. Chỉ gọi validator có phiên bản hiện có; hợp lệ nghĩa là biểu diễn được cấu trúc ứng viên, luôn UNAPPROVED, không chứng minh dữ kiện nghiệp vụ đúng. Sai schema/trường/toán tử/đặc điểm UNKNOWN giữ nguyên ứng viên và lỗi `INVALID_OR_UNSUPPORTED`, không coi ready. `READY_TO_AUTHOR` bị hạ về gap nếu chưa có candidate hợp lệ, còn missing_facts hoặc nguồn mâu thuẫn/thiếu/hết hiệu lực. Không đổi requirement đã duyệt của snapshot nếu ứng viên có ý kiến khác. Required-known giữ nguyên nghĩa; không chuyển UNKNOWN thành NO/NONE hoặc tự thêm equality.

## Kết quả và giới hạn

Mỗi mã theo tệp kiểm kê có đúng một dòng ledger, binding inventory hash/ngày/code/semantic/IDnguồn, source và requirement nguyên trạng. Nhận xét/candidate ở phần riêng. Mỗi issue nguồn có một dòng riêng kể cả blank, không tạo mã giả hoặc cộng vào canonical count. MD thu gọn đọc được, escape text/link/HTML được cung cấp; JSON giữ đầy đủ nguồn/definition/lỗi/bằng chứng. Ledger hash loại thời điểm tạo, không có tác dụng thay token mapping/source/requirement.

Counts yêu cầu được ghi là theo inventory đã lưu, tách gap và candidate validation. Mapping luôn NOT_ASSESSED và pay_readyfalse. Requirement đã có không cần duyệt lại chỉ để điền ledger; proposal mới vẫn phải theo quản lý soạn→gửi→admin duyệt→xác nhận lại ánh xạ rõ ràng. Công cụ không đóng business approval, không tạo proposal, không phê duyệt hàng loạt.

Historical130raw/126codes/4blank và APPROVED129/126/3 giữ trong bằng chứng/reconcile riêng, không nhập thành current inventory hoặc thừa kế10 approval lịch sử. Phần rà soát phần mềm có thể hoàn chỉnh khi mọi mã được đối soát, nhưng toàn5A nghiệp vụ còn thiếu nếu chưa có dữ kiện/định nghĩa thật. Còn sáu nhóm đơn giá, cấu hình người làm và readiness trong mục5/5A; không mở mục6, không activation/deployment.

## Kiểm thử và bàn giao

Freeze trước ownQA; test tập trung savedinput/CLI gồm: đầy đủ currentcodes/issues; partialnote và binding negatives; candidateV1/V2/unknown/unsupported; actualapproved identity nguyên bên cạnh candidate khác; source problems không ready; checksum/date/count/identity validation; Markdown escape; outputmới/khôngghiđè/URL/symlink escape; acceptedruntime bytes trước/sau không đổi. Không lặp API/GUI/build vì không đổi runtime; tái dùng validator/domain2B theo đúng hash, không báo đã chạy lại các suite cũ.

Chưa có kết quả nghiệm thu trước khi chạy. Root/reviewer/tester kiểm cùng freeze; root có thể tạo ledger từ file tải GUI được cấp quyền và gắn nhãn synthetic rõ ràng. Không coi fixture synthetic hoặc ledger có đủ hàng là phê duyệt mã thật.

## Lịch sử ownQA V1 và test-only V2

V1 đã đóng freeze SHA256 `50bbae17457894122082e78caffe0e4f229c9773086d1a8b6edb753bc4bde99a` trước ownQA. Node syntax/focused lint đạt. Own suite dừng sau11 nhóm đạt ở assertion Markdown đòi `BLANK_CODE` nguyên văn; output escape dấu gạch dưới thành `BLANK\_CODE` đúng với mọi plain text Markdown. Đây là oracle formatting sai, không thiếu issue. Các nhóm CLI sau đó chưa chạy trong suiteV1, không báo toàn suite đã đạt. Giữ freeze/logV1 nguyên trạng.

Root đối chiếu regex escape và cho phép V2 chỉ sửa test kỳ vọng literal đã escape cùng tài liệu này, không sửa build script/runtime hoặc yêu cầu source. V2 phải có freeze riêng trước chạy lại toàn own suite. Một lần CLI riêng trên savedfixture synthetic đã tạo138mã/7issues, tất cả NOT_REVIEWED và payfalse; output ghi rõ khônglive/không xác thực và không phải approval. Không dùng thành bằng chứng fullsuiteV1 hoặc phê duyệt dữ liệu thật. Không chạy build/API/DB rộng vì accepted runtime không đổi.

## V3 — đóng hai phát hiện độc lập trước nghiệm thu

Architect V1 tái hiện L01: tệp có checksum tự tính lại, hai nguồn đang hiệu lực khác semantic nhưng tự khai AVAILABLE và bỏ conflictissues vẫn được tool nhận, khiến candidate có thể READY_TO_AUTHOR. L02: CLI đã trả lỗi escape nhưng recursive mkdir trước kiểm realpath có thể tạo thư mục con ngoài staging qua junction. Bằng chứng `architect-ledger-v1-independent-evidence.json` giữ nguyên. Root dừng V2 test-only trước own suite; freeze V2 chỉ là checkpoint, không phải nghiệm thu hoặc QA toàn bộ.

Root cho phép V3 sửa riêng script ledger/test/tài liệu. Validator nay tự tính source status từ các nguồn được chọn đúng canonical: có current thì chỉ current, không có thì toàn history; thiếu tên/đơn vị ưu tiên INCOMPLETE, sau đó semantic khác nhau là CONFLICT. Coverage phải khớp status/hiệu lực/requirement, sourceissues phải khớp lý do được suy lại, không tin nhãn AVAILABLE của tệp dù checksum hợp lệ. Đây vẫn là kiểm nhất quán savedfile, không xác thực máy chủ.

Đầu ra kiểm nearestexistingancestor bằng lstat/realpath và containment trước mọi mkdir. Từng thư mục mới được tạo dưới parent thật đã kiểm trong staging; không đi tiếp qua đường dẫn junction lexical chưa tin cậy. Tệp mới mở exclusive sau kiểm input path. Test bổ sung forgedconflict/blankname/invalidunit với checksum hợp lệ, current-vs-history/incomplete-first và nestedjunction escape không được tạo cả thư mục ngoài, đồng thời đường dẫn nested hợp lệ vẫn tạo đủ JSON/MD. Giữ sửa oracle escape đã được cho phép. Không sửa acceptedruntime/2C.1/schema/DB; V3 freeze trước ownQA mới.

## Root nghiệm thu ledger V3 — phần mềm và QA saved-file cách ly

Root quyết định **ACCEPTED_CODE_AND_ISOLATED_SAVED_FILE_QA** tại `.local-staging-runtime/item5-baseline/root-ledger-v3-acceptance.md/.json`; SHA256 JSON `687f51efd1e13178c4383c7e22db58495db42a6c0ecb5ead2bea9c4906a801a9`. Freeze V3 `ff516fcd3854dbc63693e52aad3c6544258064d3c82ff2cf7ea62f4daeb936b5` có199/199 khớp, drift0 trước quyết định. Own17/17, reviewer độc lập19/19 và tester độc lập10/10 đạt cùng nguồn cố định; syntax/lint đạt. Không báo chạy lại build/API/browser/DB vì không sửa runtime.

Root chạy CLI thật trên tệp tải browser synthetic, đủ138mã/7issues, tất cả NOT_REVIEWED/candidate chưa cung cấp/payfalse; source và requirement giữ nguyên. L01/L02 có repro lỗi cũ và kiểm sửa độc lập. Không đồng nhất ledger hash từ hai file xuất khác nhau: cùng inventory content hash nhưng generated_at/file SHA khác có thể tạo ledger khác do binding tệp; root oracle ban đầu sai đã giữ script/output gốc và chỉ sửa kiểm digest/source thật. Giữ cả ownV1 Markdown oracle, freezeV1/V2 và mọi finding lịch sử; không đổi thành PASS cũ.

Sau nghiệm thu chỉ cập nhật tài liệu này, báo cáo2C và implementation-log; đó là đúng ba docs drift ngoài freeze bất biến, không sửa builder/test/runtime. Đây là phần mềm kiểm kê/đối soát/ledger đã được nghiệm thu, **không phải hoàn thành định nghĩa/approval nghiệp vụ toàn5A**. Không có dữ kiện thật thì vẫn thiếu; không suy đơn vị, kỹ thuật hoặc nhóm giá từ tên mã.

Root đã tìm thấy file `Copy of luong_2026 (1).xlsx` trong Downloads và kiểm chỉ đọc header hai sheet `don-gia`/`don-gia-moi`: có cộtC `don_gia` đơn, chưa phải bằng chứng sáu cột nhóm giá. Chưa xác minh toàn bộ source facts/ý nghĩa/đơn vị/nhóm; không tự sao chép một giá sang sáu nhóm. Còn sáu nhóm đơn giá, cấu hình nhóm người làm và readiness trong mục5; chưa mở mục6, nghiệp vụ8/11/13 hoặc activation/deployment. Không businessDB/Supabase/network; fixture/bằng chứng giữ đối chiếu.
