export const integrationCatalog = [
 { id: 'products.read', label: 'Sản phẩm', resource: 'products', path: 'products', tool: 'search_products' },
 { id: 'customers.read', label: 'Khách hàng', resource: 'customers', path: 'customers', tool: 'search_customers' },
 { id: 'orders.read', label: 'Đơn hàng', resource: 'orders', path: 'orders', tool: 'search_orders' },
 { id: 'quotes.read', label: 'Báo giá', resource: 'quotes', path: 'quotes', tool: 'search_quotes' },
 { id: 'production.read', label: 'Tiến độ sản xuất', resource: 'production-orders', path: 'production-orders', tool: 'get_production_progress' },
 { id: 'inventory.read', label: 'Tồn kho theo sổ kho', resource: 'warehouses', secondary: 'inventory-items', path: 'inventory', tool: 'get_inventory_on_hand' },
 { id: 'attendance.read', label: 'Tổng hợp chấm công', resource: 'workers', path: 'attendance', tool: 'get_attendance_summary' },
] as const;
export const unsupportedIntegrationModules = ['Tạo/sửa/xóa dữ liệu', 'Duyệt sản xuất và kho', 'Hợp đồng', 'Hóa đơn điện tử', 'Tiền lương', 'Tài chính', 'Giá vốn và giá thành', 'Vải chuyên sâu', 'Chăm sóc khách hàng', 'Vận chuyển', 'Tri thức và AI', 'Tài khoản và phân quyền', 'Đồng bộ và sao lưu', 'Báo cáo tổng hợp'];
export type IntegrationCapability = typeof integrationCatalog[number]['id'];
export type IntegrationGrant = { capability: IntegrationCapability; resource_ids: string[]; secondary_ids: string[]; contact_access: boolean };
export const resourceCatalog: Record<string, { table: string; code: string; name: string; source: string; active?: string; idType: 'uuid' | 'text' }> = {
 products: { table: 'local_products', code: 'sku', name: 'name', source: 'products', active: 'is_active', idType: 'uuid' },
 customers: { table: 'local_customers', code: 'customer_code', name: 'name', source: 'customers', active: 'is_active', idType: 'text' },
 orders: { table: 'local_orders', code: 'order_number', name: 'display_order_number', source: 'orders', idType: 'text' },
 quotes: { table: 'local_quotes', code: 'quote_number', name: 'quote_number', source: 'quotes', idType: 'text' },
 'production-orders': { table: 'local_production_orders', code: 'production_order_number', name: 'production_batch_number', source: 'production_orders', idType: 'uuid' },
 warehouses: { table: 'local_inventory_warehouses', code: 'code', name: 'name', source: 'inventory_warehouses', active: 'is_active', idType: 'uuid' },
 'inventory-items': { table: 'local_inventory_items', code: 'code', name: 'name', source: 'inventory_items', active: 'is_active', idType: 'uuid' },
 workers: { table: 'local_workers', code: 'employee_code', name: 'display_name', source: 'workers', active: 'is_active', idType: 'uuid' },
};
