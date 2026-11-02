# MCP nghiệp vụ CRM local

MCP: `POST /api/mcp`. Bảy công cụ đọc cũ giữ nguyên phạm vi ID và định dạng.
Các công cụ `crm_*` chỉ gọi API nghiệp vụ cố định; không nhận URL, SQL, RPC hoặc tên bảng tùy ý.

## Thiết lập quản trị rõ ràng

1. Tạo kết nối trong **API & kết nối Agent**.
2. **Danh tính thực thi**: chọn vai trò và các quyền bổ sung; lưu với lý do.
3. Chọn quyền `business.<module>.read`, `.write` hoặc `.provider` và xác nhận phạm vi toàn mô-đun.
4. Cấp khóa với tập quyền bằng hoặc hẹp hơn kết nối. Không có khóa hay quyền tự tạo khi nâng cấp.

Danh tính dùng UUID riêng và nhãn `agent:<connection_id>`, không có mật khẩu hoặc phiên người dùng;
không kế thừa chủ sở hữu của người cấu hình. Quyền chuẩn, chủ sở hữu, đơn vị và đối soát của từng API vẫn áp dụng.
`tools/list` chỉ trả công cụ thuộc quyền khóa/kết nối và vai trò dịch vụ hiện tại.

## Tham số

Mỗi công cụ công bố method, đường dẫn cố định, quyền, các tham số đường dẫn và gợi ý trường body/query.
Các gợi ý lấy từ handler chuẩn; không thay cho kiểm tra nghiệp vụ. Trường bắt buộc cụ thể vẫn do API chuẩn kiểm tra.

```json
{"params":{"id":"id-ho-so"},"query":{},"body":{},"idempotency_key":"ma-duy-nhat-cho-thao-tac","reason":"Lý do nghiệp vụ"}
```

Tra cứu không cần khóa thao tác/lý do. Mọi ghi (kể cả ghi nhà cung cấp) cần hai trường đó.
Khóa được lưu bền theo kết nối. Cùng khóa/nội dung trả lại kết quả đã lưu; khác nội dung trả 409.
`IN_FLIGHT` hoặc `UNKNOWN` không được tự gửi lại. Khi mất kết nối hoặc tiến trình chết có khoảng trống kết quả,
không tuyên bố exactly-once; dùng đối soát chuẩn. Không coi preview là đã tạo vận đơn.

Ví dụ tạo khách hàng:
```json
{"body":{"name":"Khách hàng mẫu","phone":"0900000000"},"idempotency_key":"customer-sample-001","reason":"Bổ sung hồ sơ khách hàng"}
```
Tạo đơn: `crm_post_orders`, body gồm `customer_id`, `items`, `order_number` và các trường đơn hàng chuẩn.
Tạo báo giá: `crm_post_quotes`, body gồm nội dung báo giá, danh sách sản phẩm, thuế và khách hàng chuẩn.
Tạo GHN: `crm_post_ghn_orders`, body giữ `shopId`, `provinceId`, `orderData`, `entryMode`...
Khóa `idempotencyKey` chuẩn do kết nối gán từ mã thao tác bền, không tự suy dịch vụ từ cân nặng.
Tổng hợp lương: `crm_post_payroll_monthly_sync`, body `{"month":"2026-11"}` (theo hợp đồng chuẩn).

Danh mục GHN có công cụ riêng `crm_ghn_get_shops`, `crm_ghn_get_provinces`, `crm_ghn_get_districts`,
`crm_ghn_get_wards`, `crm_ghn_get_new_provinces`, `crm_ghn_get_new_wards`, `crm_ghn_get_services`,
`crm_ghn_calculate_fee`; mỗi công cụ khóa cứng action, không nhận tên hàm/action khác.
AI cũng có công cụ riêng cho từng luồng, quyền `.provider` tách biệt vì có thể gọi dịch vụ tính phí.

## Kết quả, tệp, giới hạn

Dữ liệu JSON được loại các trường mật khẩu/token/khóa bí mật/stack; tối đa 1 MB và mảng tối đa 1000 dòng.
Yêu cầu MCP tối đa 32 KB; query phân trang tối đa 100 dòng, bộ lọc phụ vẫn bị API chuẩn giới hạn.
Tệp nhị phân xuất qua handler chuẩn được giữ riêng tối đa 16 MB, một giờ; kết quả trả metadata
và `download_path`. Tải bằng cùng khóa qua `/api/integrations/v1/artifacts/:id`.
Đổi quyền/vai trò/khóa hoặc hết hạn sẽ làm tệp cũ không tải được; không có đường dẫn tệp máy chủ tùy ý.

Không mở công cụ đăng nhập/phiên/mật khẩu, generic adapter, tự quản trị Agent hoặc sao lưu vật lý chưa có API.
Phát hành hóa đơn và provider draft hiện bị API chuẩn chặn 409; công cụ phản ánh đúng lỗi đó.

## Danh sách API cố định

| Công cụ | API | Mô-đun | Loại | Chỉ admin |
|---|---|---|---|---|
| `crm_get_ai_my_settings` | `GET /api/ai/my-settings` | ai | read |  |
| `crm_get_ai_providers` | `GET /api/ai/providers` | ai | read | Có |
| `crm_get_ai_providers_provider_models` | `GET /api/ai/providers/:provider/models` | ai | read | Có |
| `crm_post_ai_providers_provider_models` | `POST /api/ai/providers/:provider/models` | ai | provider | Có |
| `crm_post_ai_providers_provider_test` | `POST /api/ai/providers/:provider/test` | ai | provider | Có |
| `crm_get_attendance` | `GET /api/attendance` | attendance | read |  |
| `crm_post_attendance` | `POST /api/attendance` | attendance | write |  |
| `crm_post_attendance_id_reverse` | `POST /api/attendance/:id/reverse` | attendance | write |  |
| `crm_post_attendance_approve_close` | `POST /api/attendance/approve-close` | attendance | write |  |
| `crm_post_attendance_bulk_preview` | `POST /api/attendance/bulk-preview` | attendance | read |  |
| `crm_post_attendance_bulk_workflow` | `POST /api/attendance/bulk-workflow` | attendance | write |  |
| `crm_get_attendance_closures` | `GET /api/attendance/closures` | attendance | read |  |
| `crm_post_attendance_closures` | `POST /api/attendance/closures` | attendance | write |  |
| `crm_get_attendance_day_status` | `GET /api/attendance/day-status` | attendance | read |  |
| `crm_post_attendance_day_status` | `POST /api/attendance/day-status` | attendance | write |  |
| `crm_get_attendance_day_summary` | `GET /api/attendance/day-summary` | attendance | read |  |
| `crm_get_attendance_history` | `GET /api/attendance/history` | attendance | read |  |
| `crm_post_attendance_hour` | `POST /api/attendance/hour` | attendance | write |  |
| `crm_get_attendance_overtime` | `GET /api/attendance/overtime` | attendance | read |  |
| `crm_post_attendance_overtime` | `POST /api/attendance/overtime` | attendance | write |  |
| `crm_post_attendance_overtime_status` | `POST /api/attendance/overtime/status` | attendance | write |  |
| `crm_post_attendance_status` | `POST /api/attendance/status` | attendance | write |  |
| `crm_get_production_attendance` | `GET /api/production-attendance` | attendance | read |  |
| `crm_post_production_attendance` | `POST /api/production-attendance` | attendance | write |  |
| `crm_post_production_attendance_id_reverse` | `POST /api/production-attendance/:id/reverse` | attendance | write |  |
| `crm_post_production_attendance_assignment_enforcement` | `POST /api/production-attendance/assignment-enforcement` | attendance | write |  |
| `crm_get_production_attendance_assignments` | `GET /api/production-attendance/assignments` | attendance | read |  |
| `crm_post_production_attendance_assignments` | `POST /api/production-attendance/assignments` | attendance | write |  |
| `crm_patch_production_attendance_assignments_id` | `PATCH /api/production-attendance/assignments/:id` | attendance | write |  |
| `crm_get_catalog_price_lists` | `GET /api/catalog/price-lists` | catalog | read |  |
| `crm_post_catalog_price_lists` | `POST /api/catalog/price-lists` | catalog | write |  |
| `crm_delete_catalog_price_lists_id` | `DELETE /api/catalog/price-lists/:id` | catalog | write |  |
| `crm_patch_catalog_price_lists_id` | `PATCH /api/catalog/price-lists/:id` | catalog | write |  |
| `crm_get_catalog_products` | `GET /api/catalog/products` | catalog | read |  |
| `crm_post_catalog_products` | `POST /api/catalog/products` | catalog | write |  |
| `crm_delete_catalog_products_id` | `DELETE /api/catalog/products/:id` | catalog | write |  |
| `crm_patch_catalog_products_id` | `PATCH /api/catalog/products/:id` | catalog | write |  |
| `crm_post_catalog_products_id_active` | `POST /api/catalog/products/:id/active` | catalog | write |  |
| `crm_post_catalog_products_id_rate` | `POST /api/catalog/products/:id/rate` | catalog | write |  |
| `crm_delete_catalog_products_by_price_list_priceListId` | `DELETE /api/catalog/products/by-price-list/:priceListId` | catalog | write |  |
| `crm_get_contract_templates` | `GET /api/contract-templates` | contracts | read |  |
| `crm_post_contract_templates` | `POST /api/contract-templates` | contracts | write |  |
| `crm_get_contracts` | `GET /api/contracts` | contracts | read |  |
| `crm_post_contracts` | `POST /api/contracts` | contracts | write |  |
| `crm_delete_contracts_id` | `DELETE /api/contracts/:id` | contracts | write |  |
| `crm_patch_contracts_id` | `PATCH /api/contracts/:id` | contracts | write |  |
| `crm_get_contracts_id_payment_summary` | `GET /api/contracts/:id/payment-summary` | contracts | read |  |
| `crm_get_cost_audit` | `GET /api/cost/audit` | cost | read |  |
| `crm_get_cost_business_transactions` | `GET /api/cost/business-transactions` | cost | read |  |
| `crm_post_cost_business_transactions` | `POST /api/cost/business-transactions` | cost | write |  |
| `crm_post_cost_business_transactions_id_confirm` | `POST /api/cost/business-transactions/:id/confirm` | cost | write |  |
| `crm_post_cost_business_transactions_id_void` | `POST /api/cost/business-transactions/:id/void` | cost | write |  |
| `crm_get_cost_categories` | `GET /api/cost/categories` | cost | read |  |
| `crm_post_cost_categories` | `POST /api/cost/categories` | cost | write |  |
| `crm_patch_cost_categories_id` | `PATCH /api/cost/categories/:id` | cost | write |  |
| `crm_post_cost_categories_id_active` | `POST /api/cost/categories/:id/active` | cost | write |  |
| `crm_get_cost_centers` | `GET /api/cost/centers` | cost | read |  |
| `crm_post_cost_centers` | `POST /api/cost/centers` | cost | write |  |
| `crm_patch_cost_centers_id` | `PATCH /api/cost/centers/:id` | cost | write |  |
| `crm_post_cost_centers_id_active` | `POST /api/cost/centers/:id/active` | cost | write |  |
| `crm_get_cost_objects` | `GET /api/cost/objects` | cost | read |  |
| `crm_post_cost_objects` | `POST /api/cost/objects` | cost | write |  |
| `crm_post_cost_objects_id_active` | `POST /api/cost/objects/:id/active` | cost | write |  |
| `crm_get_cost_transaction_types` | `GET /api/cost/transaction-types` | cost | read |  |
| `crm_get_cost_users` | `GET /api/cost/users` | cost | read |  |
| `crm_get_assignees` | `GET /api/assignees` | customers | read |  |
| `crm_post_assignees` | `POST /api/assignees` | customers | write |  |
| `crm_delete_assignees_id` | `DELETE /api/assignees/:id` | customers | write |  |
| `crm_patch_assignees_id` | `PATCH /api/assignees/:id` | customers | write |  |
| `crm_get_customers` | `GET /api/customers` | customers | read |  |
| `crm_post_customers` | `POST /api/customers` | customers | write |  |
| `crm_delete_customers_id` | `DELETE /api/customers/:id` | customers | write |  |
| `crm_get_customers_id` | `GET /api/customers/:id` | customers | read |  |
| `crm_patch_customers_id` | `PATCH /api/customers/:id` | customers | write |  |
| `crm_post_fabric_inventory_mappings` | `POST /api/fabric-inventory-mappings` | fabric | write |  |
| `crm_get_fabrics_inventory` | `GET /api/fabrics/inventory` | fabric | read |  |
| `crm_post_fabrics_inventory` | `POST /api/fabrics/inventory` | fabric | write |  |
| `crm_get_fabrics_transactions` | `GET /api/fabrics/transactions` | fabric | read |  |
| `crm_post_fabrics_transactions` | `POST /api/fabrics/transactions` | fabric | write |  |
| `crm_patch_fabrics_transactions_id` | `PATCH /api/fabrics/transactions/:id` | fabric | write |  |
| `crm_get_fabrics_transfers` | `GET /api/fabrics/transfers` | fabric | read |  |
| `crm_post_fabrics_transfers` | `POST /api/fabrics/transfers` | fabric | write |  |
| `crm_patch_fabrics_transfers_id_status` | `PATCH /api/fabrics/transfers/:id/status` | fabric | write |  |
| `crm_get_fabrics_types` | `GET /api/fabrics/types` | fabric | read |  |
| `crm_post_fabrics_types` | `POST /api/fabrics/types` | fabric | write |  |
| `crm_delete_fabrics_types_id` | `DELETE /api/fabrics/types/:id` | fabric | write |  |
| `crm_patch_fabrics_types_id` | `PATCH /api/fabrics/types/:id` | fabric | write |  |
| `crm_get_fabrics_usage` | `GET /api/fabrics/usage` | fabric | read |  |
| `crm_delete_fabrics_usage_id` | `DELETE /api/fabrics/usage/:id` | fabric | write |  |
| `crm_patch_fabrics_usage_id` | `PATCH /api/fabrics/usage/:id` | fabric | write |  |
| `crm_post_fabrics_usage_batch` | `POST /api/fabrics/usage/batch` | fabric | write |  |
| `crm_get_fabrics_variants` | `GET /api/fabrics/variants` | fabric | read |  |
| `crm_post_fabrics_variants` | `POST /api/fabrics/variants` | fabric | write |  |
| `crm_get_fabrics_warehouses` | `GET /api/fabrics/warehouses` | fabric | read |  |
| `crm_get_fabrics_widths` | `GET /api/fabrics/widths` | fabric | read |  |
| `crm_post_fabrics_widths` | `POST /api/fabrics/widths` | fabric | write |  |
| `crm_get_expenses` | `GET /api/expenses` | finance | read |  |
| `crm_post_expenses` | `POST /api/expenses` | finance | write |  |
| `crm_delete_expenses_id` | `DELETE /api/expenses/:id` | finance | write |  |
| `crm_patch_expenses_id` | `PATCH /api/expenses/:id` | finance | write |  |
| `crm_get_order_payments` | `GET /api/order-payments` | finance | read |  |
| `crm_post_order_payments` | `POST /api/order-payments` | finance | write |  |
| `crm_delete_order_payments_orderId` | `DELETE /api/order-payments/:orderId` | finance | write |  |
| `crm_delete_order_payments_by_id_id` | `DELETE /api/order-payments/by-id/:id` | finance | write |  |
| `crm_post_order_payments_record` | `POST /api/order-payments/record` | finance | write |  |
| `crm_get_order_payments_summary` | `GET /api/order-payments/summary` | finance | read |  |
| `crm_get_transactions` | `GET /api/transactions` | finance | read |  |
| `crm_post_transactions` | `POST /api/transactions` | finance | write |  |
| `crm_delete_transactions_id` | `DELETE /api/transactions/:id` | finance | write |  |
| `crm_delete_transactions_by_order_orderId` | `DELETE /api/transactions/by-order/:orderId` | finance | write |  |
| `crm_get_inventory_audit` | `GET /api/inventory/audit` | inventory | read |  |
| `crm_get_inventory_balances` | `GET /api/inventory/balances` | inventory | read |  |
| `crm_get_inventory_business_transactions` | `GET /api/inventory/business-transactions` | inventory | read |  |
| `crm_get_inventory_documents` | `GET /api/inventory/documents` | inventory | read |  |
| `crm_post_inventory_documents` | `POST /api/inventory/documents` | inventory | write |  |
| `crm_post_inventory_documents_id_confirm` | `POST /api/inventory/documents/:id/confirm` | inventory | write |  |
| `crm_post_inventory_documents_id_void` | `POST /api/inventory/documents/:id/void` | inventory | write |  |
| `crm_get_inventory_items` | `GET /api/inventory/items` | inventory | read |  |
| `crm_post_inventory_items` | `POST /api/inventory/items` | inventory | write |  |
| `crm_patch_inventory_items_id` | `PATCH /api/inventory/items/:id` | inventory | write |  |
| `crm_post_inventory_items_id_active` | `POST /api/inventory/items/:id/active` | inventory | write |  |
| `crm_get_inventory_movements` | `GET /api/inventory/movements` | inventory | read |  |
| `crm_get_inventory_production_orders` | `GET /api/inventory/production-orders` | inventory | read |  |
| `crm_get_inventory_reconciliation` | `GET /api/inventory/reconciliation` | inventory | read |  |
| `crm_get_inventory_return_sources` | `GET /api/inventory/return-sources` | inventory | read |  |
| `crm_get_inventory_summary` | `GET /api/inventory/summary` | inventory | read |  |
| `crm_get_inventory_warehouses` | `GET /api/inventory/warehouses` | inventory | read |  |
| `crm_get_einvoice_settings` | `GET /api/einvoice-settings` | invoices | read |  |
| `crm_post_einvoice_settings` | `POST /api/einvoice-settings` | invoices | write |  |
| `crm_get_einvoice_templates` | `GET /api/einvoice-templates` | invoices | read |  |
| `crm_get_einvoices` | `GET /api/einvoices` | invoices | read |  |
| `crm_delete_einvoices_id` | `DELETE /api/einvoices/:id` | invoices | write |  |
| `crm_post_einvoices_id_issue` | `POST /api/einvoices/:id/issue` | invoices | provider |  |
| `crm_post_einvoices_id_preview` | `POST /api/einvoices/:id/preview` | invoices | read |  |
| `crm_post_einvoices_draft` | `POST /api/einvoices/draft` | invoices | write |  |
| `crm_post_invoice_workspace_adoption_commit` | `POST /api/invoice-workspace/adoption/commit` | invoices | write |  |
| `crm_post_invoice_workspace_adoption_preview` | `POST /api/invoice-workspace/adoption/preview` | invoices | read |  |
| `crm_get_invoice_workspace_companies` | `GET /api/invoice-workspace/companies` | invoices | read |  |
| `crm_post_invoice_workspace_companies` | `POST /api/invoice-workspace/companies` | invoices | write | Có |
| `crm_get_invoice_workspace_companies_id_grants` | `GET /api/invoice-workspace/companies/:id/grants` | invoices | read |  |
| `crm_post_invoice_workspace_companies_id_grants` | `POST /api/invoice-workspace/companies/:id/grants` | invoices | write | Có |
| `crm_get_invoice_workspace_contracts` | `GET /api/invoice-workspace/contracts` | invoices | read |  |
| `crm_get_invoice_workspace_contracts_id_summary` | `GET /api/invoice-workspace/contracts/:id/summary` | invoices | read |  |
| `crm_post_invoice_workspace_drafts` | `POST /api/invoice-workspace/drafts` | invoices | write |  |
| `crm_delete_invoice_workspace_drafts_id` | `DELETE /api/invoice-workspace/drafts/:id` | invoices | write |  |
| `crm_patch_invoice_workspace_drafts_id` | `PATCH /api/invoice-workspace/drafts/:id` | invoices | write |  |
| `crm_get_invoice_workspace_export` | `GET /api/invoice-workspace/export` | invoices | read |  |
| `crm_post_invoice_workspace_export_documents` | `POST /api/invoice-workspace/export-documents` | invoices | write |  |
| `crm_post_invoice_workspace_import_id_commit` | `POST /api/invoice-workspace/import/:id/commit` | invoices | write |  |
| `crm_post_invoice_workspace_import_preview` | `POST /api/invoice-workspace/import/preview` | invoices | read |  |
| `crm_get_invoice_workspace_invoices` | `GET /api/invoice-workspace/invoices` | invoices | read |  |
| `crm_get_invoice_workspace_invoices_id` | `GET /api/invoice-workspace/invoices/:id` | invoices | read |  |
| `crm_post_invoice_workspace_invoices_id_attach_file` | `POST /api/invoice-workspace/invoices/:id/attach-file` | invoices | write |  |
| `crm_post_invoice_workspace_invoices_id_contracts` | `POST /api/invoice-workspace/invoices/:id/contracts` | invoices | write |  |
| `crm_post_invoice_workspace_invoices_id_documents` | `POST /api/invoice-workspace/invoices/:id/documents` | invoices | write |  |
| `crm_delete_invoice_workspace_invoices_id_documents_linkId` | `DELETE /api/invoice-workspace/invoices/:id/documents/:linkId` | invoices | write |  |
| `crm_post_invoice_workspace_invoices_id_issue` | `POST /api/invoice-workspace/invoices/:id/issue` | invoices | provider |  |
| `crm_post_invoice_workspace_invoices_id_notes` | `POST /api/invoice-workspace/invoices/:id/notes` | invoices | write |  |
| `crm_get_invoice_workspace_invoices_id_payment_candidates` | `GET /api/invoice-workspace/invoices/:id/payment-candidates` | invoices | read |  |
| `crm_get_invoice_workspace_invoices_id_payment_source` | `GET /api/invoice-workspace/invoices/:id/payment-source` | invoices | read |  |
| `crm_post_invoice_workspace_invoices_id_payments` | `POST /api/invoice-workspace/invoices/:id/payments` | invoices | write |  |
| `crm_delete_invoice_workspace_invoices_id_payments_allocationId` | `DELETE /api/invoice-workspace/invoices/:id/payments/:allocationId` | invoices | write |  |
| `crm_post_invoice_workspace_invoices_id_preview` | `POST /api/invoice-workspace/invoices/:id/preview` | invoices | read |  |
| `crm_post_invoice_workspace_invoices_id_provider_draft` | `POST /api/invoice-workspace/invoices/:id/provider-draft` | invoices | provider |  |
| `crm_post_invoice_workspace_invoices_id_review` | `POST /api/invoice-workspace/invoices/:id/review` | invoices | write |  |
| `crm_get_invoice_workspace_periods` | `GET /api/invoice-workspace/periods` | invoices | read |  |
| `crm_get_invoice_workspace_periods_id_export` | `GET /api/invoice-workspace/periods/:id/export` | invoices | read |  |
| `crm_post_invoice_workspace_periods_id_reopen` | `POST /api/invoice-workspace/periods/:id/reopen` | invoices | write |  |
| `crm_post_invoice_workspace_periods_close` | `POST /api/invoice-workspace/periods/close` | invoices | write |  |
| `crm_get_invoice_workspace_sources` | `GET /api/invoice-workspace/sources` | invoices | read |  |
| `crm_get_invoice_workspace_sources_type_id` | `GET /api/invoice-workspace/sources/:type/:id` | invoices | read |  |
| `crm_get_invoice_workspace_sync_jobs` | `GET /api/invoice-workspace/sync-jobs` | invoices | read |  |
| `crm_get_invoice_workspace_unassigned_files` | `GET /api/invoice-workspace/unassigned-files` | invoices | read |  |
| `crm_get_invoice_workspace_users` | `GET /api/invoice-workspace/users` | invoices | read |  |
| `crm_post_knowledge_chat` | `POST /api/knowledge/chat` | knowledge | provider |  |
| `crm_get_knowledge_chat_history` | `GET /api/knowledge/chat-history` | knowledge | read |  |
| `crm_post_knowledge_chat_history` | `POST /api/knowledge/chat-history` | knowledge | write |  |
| `crm_get_knowledge_documents` | `GET /api/knowledge/documents` | knowledge | read |  |
| `crm_post_knowledge_documents` | `POST /api/knowledge/documents` | knowledge | write |  |
| `crm_delete_knowledge_documents_id` | `DELETE /api/knowledge/documents/:id` | knowledge | write |  |
| `crm_patch_knowledge_documents_id` | `PATCH /api/knowledge/documents/:id` | knowledge | write |  |
| `crm_post_manufacturing_bom_drafts` | `POST /api/manufacturing/bom/drafts` | manufacturing | write |  |
| `crm_put_manufacturing_bom_versions_versionId` | `PUT /api/manufacturing/bom/versions/:versionId` | manufacturing | write |  |
| `crm_post_manufacturing_bom_versions_versionId_approve` | `POST /api/manufacturing/bom/versions/:versionId/approve` | manufacturing | write |  |
| `crm_get_manufacturing_bom_versions_versionId_lines` | `GET /api/manufacturing/bom/versions/:versionId/lines` | manufacturing | read |  |
| `crm_get_manufacturing_cutting_profiles_profileId_versions` | `GET /api/manufacturing/cutting-profiles/:profileId/versions` | manufacturing | read |  |
| `crm_post_manufacturing_cutting_profiles_drafts` | `POST /api/manufacturing/cutting-profiles/drafts` | manufacturing | write |  |
| `crm_put_manufacturing_cutting_versions_versionId` | `PUT /api/manufacturing/cutting-versions/:versionId` | manufacturing | write |  |
| `crm_post_manufacturing_cutting_versions_versionId_approve` | `POST /api/manufacturing/cutting-versions/:versionId/approve` | manufacturing | write |  |
| `crm_post_manufacturing_cutting_versions_versionId_calculate` | `POST /api/manufacturing/cutting-versions/:versionId/calculate` | manufacturing | read |  |
| `crm_post_manufacturing_material_requirements_calculate` | `POST /api/manufacturing/material-requirements/calculate` | manufacturing | read |  |
| `crm_get_manufacturing_products` | `GET /api/manufacturing/products` | manufacturing | read |  |
| `crm_get_manufacturing_products_productId_bom` | `GET /api/manufacturing/products/:productId/bom` | manufacturing | read |  |
| `crm_get_manufacturing_products_productId_cutting_profiles` | `GET /api/manufacturing/products/:productId/cutting-profiles` | manufacturing | read |  |
| `crm_get_manufacturing_products_productId_profile` | `GET /api/manufacturing/products/:productId/profile` | manufacturing | read |  |
| `crm_put_manufacturing_products_productId_profile` | `PUT /api/manufacturing/products/:productId/profile` | manufacturing | write |  |
| `crm_get_manufacturing_products_productId_routing` | `GET /api/manufacturing/products/:productId/routing` | manufacturing | read |  |
| `crm_post_manufacturing_routing_drafts` | `POST /api/manufacturing/routing/drafts` | manufacturing | write |  |
| `crm_put_manufacturing_routing_versions_versionId` | `PUT /api/manufacturing/routing/versions/:versionId` | manufacturing | write |  |
| `crm_post_manufacturing_routing_versions_versionId_approve` | `POST /api/manufacturing/routing/versions/:versionId/approve` | manufacturing | write |  |
| `crm_get_manufacturing_routing_versions_versionId_operations` | `GET /api/manufacturing/routing/versions/:versionId/operations` | manufacturing | read |  |
| `crm_get_orders` | `GET /api/orders` | orders | read |  |
| `crm_post_orders` | `POST /api/orders` | orders | write |  |
| `crm_delete_orders_id` | `DELETE /api/orders/:id` | orders | write |  |
| `crm_get_orders_id` | `GET /api/orders/:id` | orders | read |  |
| `crm_patch_orders_id` | `PATCH /api/orders/:id` | orders | write |  |
| `crm_get_orders_duplicates` | `GET /api/orders/duplicates` | orders | read |  |
| `crm_get_orders_stats` | `GET /api/orders/stats` | orders | read |  |
| `crm_get_payroll_adjustments` | `GET /api/payroll/adjustments` | payroll | read |  |
| `crm_post_payroll_adjustments` | `POST /api/payroll/adjustments` | payroll | write |  |
| `crm_patch_payroll_adjustments_id` | `PATCH /api/payroll/adjustments/:id` | payroll | write |  |
| `crm_post_payroll_adjustments_id_approve` | `POST /api/payroll/adjustments/:id/approve` | payroll | write |  |
| `crm_post_payroll_adjustments_id_reject` | `POST /api/payroll/adjustments/:id/reject` | payroll | write |  |
| `crm_post_payroll_adjustments_id_submit` | `POST /api/payroll/adjustments/:id/submit` | payroll | write |  |
| `crm_get_payroll_bank_accounts` | `GET /api/payroll/bank-accounts` | payroll | read |  |
| `crm_post_payroll_bank_accounts` | `POST /api/payroll/bank-accounts` | payroll | write |  |
| `crm_patch_payroll_bank_accounts_id` | `PATCH /api/payroll/bank-accounts/:id` | payroll | write |  |
| `crm_post_payroll_bank_accounts_id_discard` | `POST /api/payroll/bank-accounts/:id/discard` | payroll | write |  |
| `crm_post_payroll_bank_accounts_id_verify` | `POST /api/payroll/bank-accounts/:id/verify` | payroll | write |  |
| `crm_get_payroll_bank_accounts_proposal` | `GET /api/payroll/bank-accounts/proposal` | payroll | read |  |
| `crm_get_payroll_capabilities` | `GET /api/payroll/capabilities` | payroll | read |  |
| `crm_get_payroll_compensation_assignments` | `GET /api/payroll/compensation-assignments` | payroll | read |  |
| `crm_post_payroll_compensation_assignments` | `POST /api/payroll/compensation-assignments` | payroll | write |  |
| `crm_patch_payroll_compensation_assignments_id` | `PATCH /api/payroll/compensation-assignments/:id` | payroll | write |  |
| `crm_post_payroll_compensation_assignments_id_approve` | `POST /api/payroll/compensation-assignments/:id/approve` | payroll | write |  |
| `crm_post_payroll_compensation_assignments_id_discard` | `POST /api/payroll/compensation-assignments/:id/discard` | payroll | write |  |
| `crm_post_payroll_import_apply` | `POST /api/payroll/import/apply` | payroll | write |  |
| `crm_post_payroll_import_preview` | `POST /api/payroll/import/preview` | payroll | read |  |
| `crm_get_payroll_insurance` | `GET /api/payroll/insurance` | payroll | read |  |
| `crm_post_payroll_insurance` | `POST /api/payroll/insurance` | payroll | write |  |
| `crm_patch_payroll_insurance_id` | `PATCH /api/payroll/insurance/:id` | payroll | write |  |
| `crm_post_payroll_insurance_id_approve` | `POST /api/payroll/insurance/:id/approve` | payroll | write |  |
| `crm_post_payroll_insurance_id_discard` | `POST /api/payroll/insurance/:id/discard` | payroll | write |  |
| `crm_post_payroll_monthly_adjustments` | `POST /api/payroll/monthly/adjustments` | payroll | write |  |
| `crm_post_payroll_monthly_export` | `POST /api/payroll/monthly/export` | payroll | write |  |
| `crm_post_payroll_monthly_payments` | `POST /api/payroll/monthly/payments` | payroll | write |  |
| `crm_post_payroll_monthly_sync` | `POST /api/payroll/monthly/sync` | payroll | write |  |
| `crm_get_payroll_policy_groups` | `GET /api/payroll/policy-groups` | payroll | read |  |
| `crm_post_payroll_policy_groups` | `POST /api/payroll/policy-groups` | payroll | write |  |
| `crm_get_payroll_preflight` | `GET /api/payroll/preflight` | payroll | read |  |
| `crm_get_payroll_product_rates` | `GET /api/payroll/product-rates` | payroll | read |  |
| `crm_get_payroll_product_rates_quote` | `GET /api/payroll/product-rates/quote` | payroll | read |  |
| `crm_get_payroll_products` | `GET /api/payroll/products` | payroll | read |  |
| `crm_get_payroll_rates` | `GET /api/payroll/rates` | payroll | read |  |
| `crm_post_payroll_rates` | `POST /api/payroll/rates` | payroll | write |  |
| `crm_patch_payroll_rates_id` | `PATCH /api/payroll/rates/:id` | payroll | write |  |
| `crm_post_payroll_rates_id_approve` | `POST /api/payroll/rates/:id/approve` | payroll | write |  |
| `crm_post_payroll_rates_id_discard` | `POST /api/payroll/rates/:id/discard` | payroll | write |  |
| `crm_get_payroll_runs` | `GET /api/payroll/runs` | payroll | read |  |
| `crm_post_payroll_runs` | `POST /api/payroll/runs` | payroll | write |  |
| `crm_get_payroll_runs_id` | `GET /api/payroll/runs/:id` | payroll | read |  |
| `crm_get_payroll_runs_id_export_csv` | `GET /api/payroll/runs/:id/export.csv` | payroll | read |  |
| `crm_post_payroll_runs_id_lock` | `POST /api/payroll/runs/:id/lock` | payroll | write |  |
| `crm_get_payroll_runs_id_reconciliation` | `GET /api/payroll/runs/:id/reconciliation` | payroll | read |  |
| `crm_get_payroll_team_assignments` | `GET /api/payroll/team-assignments` | payroll | read |  |
| `crm_post_payroll_team_assignments` | `POST /api/payroll/team-assignments` | payroll | write |  |
| `crm_post_payroll_team_assignments_id_retire` | `POST /api/payroll/team-assignments/:id/retire` | payroll | write |  |
| `crm_post_payroll_worker_profile_bundle` | `POST /api/payroll/worker-profile-bundle` | payroll | write |  |
| `crm_get_payroll_worker_profiles` | `GET /api/payroll/worker-profiles` | payroll | read |  |
| `crm_post_payroll_worker_profiles` | `POST /api/payroll/worker-profiles` | payroll | write |  |
| `crm_patch_payroll_worker_profiles_id` | `PATCH /api/payroll/worker-profiles/:id` | payroll | write |  |
| `crm_post_payroll_worker_profiles_id_approve` | `POST /api/payroll/worker-profiles/:id/approve` | payroll | write |  |
| `crm_post_payroll_worker_profiles_id_discard` | `POST /api/payroll/worker-profiles/:id/discard` | payroll | write |  |
| `crm_get_payroll_workers` | `GET /api/payroll/workers` | payroll | read |  |
| `crm_patch_payroll_workers_id` | `PATCH /api/payroll/workers/:id` | payroll | write |  |
| `crm_get_rates` | `GET /api/rates` | payroll | read |  |
| `crm_post_rates` | `POST /api/rates` | payroll | write |  |
| `crm_get_worker_methods` | `GET /api/worker-methods` | payroll | read |  |
| `crm_post_worker_methods` | `POST /api/worker-methods` | payroll | write |  |
| `crm_get_workers` | `GET /api/workers` | payroll | read |  |
| `crm_post_workers` | `POST /api/workers` | payroll | write |  |
| `crm_post_cutting_estimates_id_material_issue` | `POST /api/cutting-estimates/:id/material-issue` | production | write |  |
| `crm_post_cutting_estimates_id_review` | `POST /api/cutting-estimates/:id/review` | production | write |  |
| `crm_post_cutting_estimates_id_submit` | `POST /api/cutting-estimates/:id/submit` | production | write |  |
| `crm_get_legacy_production_orders` | `GET /api/legacy-production-orders` | production | read |  |
| `crm_post_legacy_production_orders` | `POST /api/legacy-production-orders` | production | write |  |
| `crm_get_legacy_production_orders_id` | `GET /api/legacy-production-orders/:id` | production | read |  |
| `crm_post_legacy_production_orders_id_complete` | `POST /api/legacy-production-orders/:id/complete` | production | write |  |
| `crm_post_legacy_production_orders_id_release` | `POST /api/legacy-production-orders/:id/release` | production | write |  |
| `crm_post_legacy_production_orders_id_status` | `POST /api/legacy-production-orders/:id/status` | production | write |  |
| `crm_post_legacy_production_orders_group` | `POST /api/legacy-production-orders/group` | production | write |  |
| `crm_post_production_batches_id_status` | `POST /api/production-batches/:id/status` | production | write |  |
| `crm_get_production_dispatch` | `GET /api/production-dispatch` | production | read |  |
| `crm_post_production_dispatch_assignments` | `POST /api/production-dispatch/assignments` | production | write |  |
| `crm_get_production_dispatch_assignments_id_pay_preview` | `GET /api/production-dispatch/assignments/:id/pay-preview` | production | read |  |
| `crm_post_production_dispatch_assignments_id_reconcile_labor` | `POST /api/production-dispatch/assignments/:id/reconcile-labor` | production | write |  |
| `crm_post_production_dispatch_assignments_id_reports` | `POST /api/production-dispatch/assignments/:id/reports` | production | write |  |
| `crm_post_production_dispatch_batches_id_split` | `POST /api/production-dispatch/batches/:id/split` | production | write |  |
| `crm_get_production_dispatch_labor_preview` | `GET /api/production-dispatch/labor-preview` | production | read |  |
| `crm_get_production_dispatch_mine` | `GET /api/production-dispatch/mine` | production | read |  |
| `crm_get_production_dispatch_publications` | `GET /api/production-dispatch/publications` | production | read |  |
| `crm_post_production_dispatch_publications` | `POST /api/production-dispatch/publications` | production | write |  |
| `crm_post_production_dispatch_publications_id_claim` | `POST /api/production-dispatch/publications/:id/claim` | production | write |  |
| `crm_post_production_dispatch_publications_id_close` | `POST /api/production-dispatch/publications/:id/close` | production | write |  |
| `crm_get_production_dispatch_rates` | `GET /api/production-dispatch/rates` | production | read |  |
| `crm_get_production_dispatch_received_work` | `GET /api/production-dispatch/received-work` | production | read |  |
| `crm_post_production_dispatch_reports_id_repair` | `POST /api/production-dispatch/reports/:id/repair` | production | write |  |
| `crm_get_production_dispatch_review_queue` | `GET /api/production-dispatch/review-queue` | production | read |  |
| `crm_get_production_dispatch_sewing_codes` | `GET /api/production-dispatch/sewing-codes` | production | read |  |
| `crm_post_production_operations_id_complete` | `POST /api/production-operations/:id/complete` | production | write |  |
| `crm_get_production_operations_id_logs` | `GET /api/production-operations/:id/logs` | production | read |  |
| `crm_post_production_operations_id_logs` | `POST /api/production-operations/:id/logs` | production | write |  |
| `crm_post_production_operations_id_start` | `POST /api/production-operations/:id/start` | production | write |  |
| `crm_get_production_orders` | `GET /api/production-orders` | production | read |  |
| `crm_post_production_orders` | `POST /api/production-orders` | production | write |  |
| `crm_get_production_orders_id` | `GET /api/production-orders/:id` | production | read |  |
| `crm_get_production_orders_id_batches` | `GET /api/production-orders/:id/batches` | production | read |  |
| `crm_post_production_orders_id_complete` | `POST /api/production-orders/:id/complete` | production | write |  |
| `crm_get_production_orders_id_cutting_estimates` | `GET /api/production-orders/:id/cutting-estimates` | production | read |  |
| `crm_post_production_orders_id_cutting_estimates` | `POST /api/production-orders/:id/cutting-estimates` | production | write |  |
| `crm_get_production_orders_id_fabric_allocations` | `GET /api/production-orders/:id/fabric-allocations` | production | read |  |
| `crm_get_production_orders_id_items` | `GET /api/production-orders/:id/items` | production | read |  |
| `crm_get_production_orders_id_labor_cost` | `GET /api/production-orders/:id/labor-cost` | production | read |  |
| `crm_get_production_orders_id_material_requirements` | `GET /api/production-orders/:id/material-requirements` | production | read |  |
| `crm_get_production_orders_id_operations` | `GET /api/production-orders/:id/operations` | production | read |  |
| `crm_get_production_orders_id_outputs` | `GET /api/production-orders/:id/outputs` | production | read |  |
| `crm_post_production_orders_id_release` | `POST /api/production-orders/:id/release` | production | write |  |
| `crm_get_production_orders_id_stage_events` | `GET /api/production-orders/:id/stage-events` | production | read |  |
| `crm_post_production_orders_id_transition` | `POST /api/production-orders/:id/transition` | production | write |  |
| `crm_post_production_orders_groups` | `POST /api/production-orders/groups` | production | write |  |
| `crm_get_production_sales_requests` | `GET /api/production-sales/requests` | production | read |  |
| `crm_post_production_sales_requests` | `POST /api/production-sales/requests` | production | write |  |
| `crm_post_production_sales_requests_id_allocate` | `POST /api/production-sales/requests/:id/allocate` | production | write |  |
| `crm_post_production_sales_requests_id_change_request` | `POST /api/production-sales/requests/:id/change-request` | production | write |  |
| `crm_post_production_sales_requests_id_review` | `POST /api/production-sales/requests/:id/review` | production | write |  |
| `crm_post_production_stage_events` | `POST /api/production-stage-events` | production | write |  |
| `crm_post_production_stage_events_id_reverse` | `POST /api/production-stage-events/:id/reverse` | production | write |  |
| `crm_post_production_stage_events_id_status` | `POST /api/production-stage-events/:id/status` | production | write |  |
| `crm_get_production_workspace` | `GET /api/production-workspace` | production | read |  |
| `crm_post_production_workspace_id_cancel_uncut` | `POST /api/production-workspace/:id/cancel-uncut` | production | write |  |
| `crm_post_production_workspace_id_complete` | `POST /api/production-workspace/:id/complete` | production | write |  |
| `crm_get_production_workspace_id_details` | `GET /api/production-workspace/:id/details` | production | read |  |
| `crm_post_production_workspace_id_draft_reference` | `POST /api/production-workspace/:id/draft-reference` | production | write |  |
| `crm_post_production_workspace_id_receive` | `POST /api/production-workspace/:id/receive` | production | write |  |
| `crm_post_production_workspace_id_repair_tickets` | `POST /api/production-workspace/:id/repair-tickets` | production | write |  |
| `crm_post_production_workspace_id_ship` | `POST /api/production-workspace/:id/ship` | production | write |  |
| `crm_get_production_workspace_reference_images` | `GET /api/production-workspace/reference-images` | production | read |  |
| `crm_post_production_workspace_shipments_id_deliver` | `POST /api/production-workspace/shipments/:id/deliver` | production | write |  |
| `crm_post_production_workspace_workers_id_type` | `POST /api/production-workspace/workers/:id/type` | production | write |  |
| `crm_get_production_entries` | `GET /api/production/entries` | production | read |  |
| `crm_post_production_entries` | `POST /api/production/entries` | production | write |  |
| `crm_post_production_entries_id_reverse` | `POST /api/production/entries/:id/reverse` | production | write |  |
| `crm_post_production_entries_status` | `POST /api/production/entries/status` | production | write |  |
| `crm_post_production_fabric_allocations` | `POST /api/production/fabric-allocations` | production | write |  |
| `crm_post_production_fabric_allocations_id_adjust` | `POST /api/production/fabric-allocations/:id/adjust` | production | write |  |
| `crm_get_production_fabric_stock` | `GET /api/production/fabric-stock` | production | read |  |
| `crm_get_production_fabric_variants` | `GET /api/production/fabric-variants` | production | read |  |
| `crm_get_production_products` | `GET /api/production/products` | production | read |  |
| `crm_post_production_rework` | `POST /api/production/rework` | production | write |  |
| `crm_post_production_scrap` | `POST /api/production/scrap` | production | write |  |
| `crm_get_production_source_orders` | `GET /api/production/source-orders` | production | read |  |
| `crm_post_production_source_orders_id_create` | `POST /api/production/source-orders/:id/create` | production | write |  |
| `crm_get_purchase_fulfillment` | `GET /api/purchase-fulfillment` | production | read |  |
| `crm_post_purchase_fulfillment_plans` | `POST /api/purchase-fulfillment/plans` | production | write |  |
| `crm_post_purchase_fulfillment_plans_id_release` | `POST /api/purchase-fulfillment/plans/:id/release` | production | write |  |
| `crm_post_purchase_fulfillment_shortages_id_receipts` | `POST /api/purchase-fulfillment/shortages/:id/receipts` | production | write |  |
| `crm_get_quote_template_settings` | `GET /api/quote-template-settings` | quotes | read |  |
| `crm_put_quote_template_settings` | `PUT /api/quote-template-settings` | quotes | write |  |
| `crm_get_quotes` | `GET /api/quotes` | quotes | read |  |
| `crm_post_quotes` | `POST /api/quotes` | quotes | write |  |
| `crm_delete_quotes_id` | `DELETE /api/quotes/:id` | quotes | write |  |
| `crm_patch_quotes_id` | `PATCH /api/quotes/:id` | quotes | write |  |
| `crm_post_quotes_id_approve` | `POST /api/quotes/:id/approve` | quotes | write |  |
| `crm_get_quotes_id_quote_data` | `GET /api/quotes/:id/quote-data` | quotes | read |  |
| `crm_get_quotes_customer_suggestions` | `GET /api/quotes/customer-suggestions` | quotes | read |  |
| `crm_get_quotes_stats` | `GET /api/quotes/stats` | quotes | read |  |
| `crm_get_dashboard_stats` | `GET /api/dashboard/stats` | reports | read |  |
| `crm_get_external_integrations_ghn` | `GET /api/external-integrations/ghn` | settings | read | Có |
| `crm_put_external_integrations_ghn` | `PUT /api/external-integrations/ghn` | settings | write | Có |
| `crm_post_external_integrations_ghn_shops_discovery` | `POST /api/external-integrations/ghn/shops-discovery` | settings | read | Có |
| `crm_post_external_integrations_ghn_test` | `POST /api/external-integrations/ghn/test` | settings | read | Có |
| `crm_get_external_integrations_goong` | `GET /api/external-integrations/goong` | settings | read | Có |
| `crm_put_external_integrations_goong` | `PUT /api/external-integrations/goong` | settings | write | Có |
| `crm_get_external_integrations_status` | `GET /api/external-integrations/status` | settings | read | Có |
| `crm_post_ghn_edit_attempts_id_reconcile` | `POST /api/ghn-edit-attempts/:id/reconcile` | shipping | write |  |
| `crm_post_ghn_edit_code` | `POST /api/ghn-edit/:code` | shipping | provider |  |
| `crm_get_ghn_edit_code_detail` | `GET /api/ghn-edit/:code/detail` | shipping | read |  |
| `crm_post_ghn_orders` | `POST /api/ghn-orders` | shipping | provider |  |
| `crm_get_ghn_orders_key` | `GET /api/ghn-orders/:key` | shipping | read |  |
| `crm_post_ghn_orders_key_print` | `POST /api/ghn-orders/:key/print` | shipping | write |  |
| `crm_post_ghn_orders_key_reconcile` | `POST /api/ghn-orders/:key/reconcile` | shipping | write |  |
| `crm_post_ghn_orders_preview` | `POST /api/ghn-orders/preview` | shipping | read |  |
| `crm_get_ghn_orders_recent` | `GET /api/ghn-orders/recent` | shipping | read |  |
| `crm_get_ghn_tracking` | `GET /api/ghn-tracking` | shipping | read |  |
| `crm_post_ghn_tracking` | `POST /api/ghn-tracking` | shipping | write |  |
| `crm_delete_ghn_tracking_id` | `DELETE /api/ghn-tracking/:id` | shipping | write |  |
| `crm_delete_ghn_tracking_by_order_orderId` | `DELETE /api/ghn-tracking/by-order/:orderId` | shipping | write |  |
| `crm_get_ghn_tracking_by_order_orderId` | `GET /api/ghn-tracking/by-order/:orderId` | shipping | read |  |
| `crm_put_ghn_tracking_by_order_orderId` | `PUT /api/ghn-tracking/by-order/:orderId` | shipping | write |  |
| `crm_post_ghn_tracking_connection_check` | `POST /api/ghn-tracking/connection-check` | shipping | read |  |
| `crm_post_ghn_tracking_import_codes` | `POST /api/ghn-tracking/import-codes` | shipping | write |  |
| `crm_post_ghn_tracking_import_page` | `POST /api/ghn-tracking/import-page` | shipping | write |  |
| `crm_post_ghn_tracking_print` | `POST /api/ghn-tracking/print` | shipping | write |  |
| `crm_post_ghn_tracking_refresh` | `POST /api/ghn-tracking/refresh` | shipping | write |  |
| `crm_get_order_shipments` | `GET /api/order-shipments` | shipping | read |  |
| `crm_post_order_shipments` | `POST /api/order-shipments` | shipping | write |  |
| `crm_post_order_shipments_id_deliver` | `POST /api/order-shipments/:id/deliver` | shipping | write |  |
| `crm_get_shipping_companies` | `GET /api/shipping-companies` | shipping | read |  |
| `crm_post_shipping_companies` | `POST /api/shipping-companies` | shipping | write |  |
| `crm_delete_shipping_companies_id` | `DELETE /api/shipping-companies/:id` | shipping | write |  |
| `crm_patch_shipping_companies_id` | `PATCH /api/shipping-companies/:id` | shipping | write |  |
| `crm_get_local_sync_runs` | `GET /api/local-sync/runs` | sync | read | Có |
| `crm_get_local_sync_snapshots` | `GET /api/local-sync/snapshots` | sync | read | Có |
| `crm_post_local_sync_start` | `POST /api/local-sync/start` | sync | write | Có |
| `crm_get_users` | `GET /api/users` | users | read | Có |
| `crm_delete_users_id` | `DELETE /api/users/:id` | users | write | Có |
| `crm_patch_users_id` | `PATCH /api/users/:id` | users | write | Có |
| `crm_get_users_id_permissions` | `GET /api/users/:id/permissions` | users | read | Có |
| `crm_put_users_id_permissions` | `PUT /api/users/:id/permissions` | users | write | Có |
| `crm_get_users_id_worker_link` | `GET /api/users/:id/worker-link` | users | read | Có |
| `crm_patch_users_id_worker_link` | `PATCH /api/users/:id/worker-link` | users | write | Có |
| `crm_get_payroll_labor_mappings_catalog` | `GET /api/payroll/labor-mappings/catalog` | payroll | read |  |
| `crm_get_payroll_labor_mappings_products` | `GET /api/payroll/labor-mappings/products` | payroll | read |  |
| `crm_get_payroll_labor_mappings_products_id` | `GET /api/payroll/labor-mappings/products/:id` | payroll | read |  |
| `crm_get_payroll_labor_mappings_decisions` | `GET /api/payroll/labor-mappings/decisions` | payroll | read |  |
| `crm_get_payroll_labor_mappings_decisions_id_history` | `GET /api/payroll/labor-mappings/decisions/:id/history` | payroll | read |  |
| `crm_post_payroll_labor_mappings_decisions` | `POST /api/payroll/labor-mappings/decisions` | payroll | write |  |
| `crm_post_payroll_labor_mappings_batch_confirm` | `POST /api/payroll/labor-mappings/batch-confirm` | payroll | write |  |
| `crm_post_payroll_labor_mappings_batch_preview` | `POST /api/payroll/labor-mappings/batch-preview` | payroll | read |  |
| `crm_get_payroll_labor_code_requirements_schema` | `GET /api/payroll/labor-code-requirements/schema` | payroll | read |  |
| `crm_post_payroll_labor_code_requirements_validate` | `POST /api/payroll/labor-code-requirements/validate` | payroll | read |  |
| `crm_get_payroll_labor_code_requirements_inventory` | `GET /api/payroll/labor-code-requirements/inventory` | payroll | read |  |
| `crm_get_payroll_labor_code_requirements` | `GET /api/payroll/labor-code-requirements` | payroll | read |  |
| `crm_get_payroll_labor_code_requirements_code_code` | `GET /api/payroll/labor-code-requirements/code/:code` | payroll | read |  |
| `crm_post_payroll_labor_code_requirements` | `POST /api/payroll/labor-code-requirements/` | payroll | write |  |
| `crm_get_product_technical_profiles_catalog` | `GET /api/product-technical-profiles/catalog` | manufacturing | read |  |
| `crm_get_product_technical_profiles_id_history` | `GET /api/product-technical-profiles/:id/history` | manufacturing | read |  |
| `crm_get_product_technical_profiles_id` | `GET /api/product-technical-profiles/:id` | manufacturing | read |  |
| `crm_put_product_technical_profiles_id` | `PUT /api/product-technical-profiles/:id` | manufacturing | write |  |
| `crm_get_product_supply_classifications` | `GET /api/product-supply-classifications` | manufacturing | read |  |
| `crm_get_product_supply_classifications_id` | `GET /api/product-supply-classifications/:id` | manufacturing | read |  |
| `crm_get_product_supply_classifications_id_history` | `GET /api/product-supply-classifications/:id/history` | manufacturing | read |  |
| `crm_post_product_supply_classifications_confirm` | `POST /api/product-supply-classifications/confirm` | manufacturing | write |  |
| `crm_post_payroll_labor_code_requirements_proposals` | `POST /api/payroll/labor-code-requirements/proposals` | payroll | write |  |
| `crm_post_payroll_labor_code_requirements_approve` | `POST /api/payroll/labor-code-requirements/approve` | payroll | write |  |
| `crm_post_payroll_labor_code_requirements_retire` | `POST /api/payroll/labor-code-requirements/retire` | payroll | write |  |
| `crm_get_payroll_rule_versions` | `GET /api/payroll/rule-versions` | payroll | read |  |
| `crm_post_payroll_rule_versions` | `POST /api/payroll/rule-versions` | payroll | write |  |
| `crm_patch_payroll_rule_versions_id` | `PATCH /api/payroll/rule-versions/:id` | payroll | write |  |
| `crm_post_payroll_rule_versions_id_approve` | `POST /api/payroll/rule-versions/:id/approve` | payroll | write |  |
| `crm_delete_payroll_rule_versions_id` | `DELETE /api/payroll/rule-versions/:id` | payroll | write |  |
| `crm_get_payroll_calendar_versions` | `GET /api/payroll/calendar-versions` | payroll | read |  |
| `crm_post_payroll_calendar_versions` | `POST /api/payroll/calendar-versions` | payroll | write |  |
| `crm_patch_payroll_calendar_versions_id` | `PATCH /api/payroll/calendar-versions/:id` | payroll | write |  |
| `crm_post_payroll_calendar_versions_id_approve` | `POST /api/payroll/calendar-versions/:id/approve` | payroll | write |  |
| `crm_delete_payroll_calendar_versions_id` | `DELETE /api/payroll/calendar-versions/:id` | payroll | write |  |
| `crm_post_payroll_worker_profile_bundle_review` | `POST /api/payroll/worker-profile-bundle/review` | payroll | write |  |
| `crm_post_payroll_worker_profile_bundle_approve` | `POST /api/payroll/worker-profile-bundle/approve` | payroll | write |  |
| `crm_post_payroll_product_rates` | `POST /api/payroll/product-rates` | payroll | write |  |
| `crm_patch_payroll_product_rates_id` | `PATCH /api/payroll/product-rates/:id` | payroll | write |  |
| `crm_post_payroll_product_rates_id_approve` | `POST /api/payroll/product-rates/:id/approve` | payroll | write |  |
| `crm_post_payroll_product_rates_id_discard` | `POST /api/payroll/product-rates/:id/discard` | payroll | write |  |
| `crm_post_production_dispatch_assignments_id_accept` | `POST /api/production-dispatch/assignments/:id/accept` | production | write |  |
| `crm_post_production_dispatch_assignments_id_return` | `POST /api/production-dispatch/assignments/:id/return` | production | write |  |
| `crm_post_production_dispatch_assignments_id_reject` | `POST /api/production-dispatch/assignments/:id/reject` | production | write |  |
| `crm_post_production_dispatch_reports_id_review` | `POST /api/production-dispatch/reports/:id/review` | production | write |  |
| `crm_post_production_dispatch_reports_id_reverse` | `POST /api/production-dispatch/reports/:id/reverse` | production | write |  |
| `crm_patch_contract_templates_id` | `PATCH /api/contract-templates/:id` | contracts | write |  |
| `crm_delete_contract_templates_id` | `DELETE /api/contract-templates/:id` | contracts | write |  |
| `crm_post_users` | `POST /api/users` | users | write | Có |
| `crm_put_ai_providers_provider` | `PUT /api/ai/providers/:provider` | ai | write | Có |
| `crm_delete_ai_providers_provider_key` | `DELETE /api/ai/providers/:provider/key` | ai | write | Có |
| `crm_get_profile_requests` | `GET /api/profile-requests` | users | read | Có |
| `crm_post_profile_requests_userId_review` | `POST /api/profile-requests/:userId/review` | users | write | Có |
| `crm_post_production_dispatch_batches` | `POST /api/production-dispatch/batches` | production | write |  |
| `crm_patch_production_dispatch_batches_id` | `PATCH /api/production-dispatch/batches/:id` | production | write |  |

Các wrapper AI/GHN cụ thể được công bố trong catalog và tools/list cùng fixed_fields.
