/** Module permissions enforced before routes, including legacy adapter paths.
 * null delegates to existing payroll/production/self-account domain checks.
 * [] requires an administrator/manager. Arrays are explicit ANY-of module rights.
 */
export type ModuleRequirement = readonly string[] | null | false;
const tablePermissions: Record<string, readonly string[]> = {
  customers: ['customers', 'customer_care'], customer_predictions: ['customer_care'],
  products: ['products'], products_public: ['products'], price_lists: ['products'],
  quotes: ['quotes'], quote_template_settings: ['quotes'], orders: ['orders'],
  contracts: ['contracts'], contract_templates: ['contracts'], einvoices: ['contracts'], einvoice_settings: ['contracts'], einvoice_templates: ['contracts'],
  expenses: ['cash_flow'], finance_data: ['cash_flow'], transactions: ['transactions'],
  order_payments: ['orders','cash_flow','transactions'], payment_summary: ['orders','cash_flow','transactions'],
  shipping_companies: ['shipping_companies'], ghn_tracking: ['ghn_tracking'],
  knowledge_chat_history: ['knowledge_base'], knowledge_documents: ['knowledge_base'],
  cost_categories: ['cost_categories'], cost_centers: ['cost_centers'], cost_objects: ['cost_objects'],
  transaction_types: ['transaction_types'], business_transactions: ['cost_transactions'], business_transaction_lines: ['cost_transactions'], audit_events: ['cost_audit'],
  inventory_items: ['inventory_view'], bom_headers: ['bom_view'], bom_lines: ['bom_view'], bom_versions: ['bom_view'], product_manufacturing_profiles: ['bom_view'],
  cutting_profiles: ['cutting_profiles'], cutting_profile_versions: ['cutting_profiles'], routing_headers: ['production_view'], routing_versions: ['production_view'], routing_operations: ['production_view'],
  production_orders: ['production_view'], production_operation_logs: ['production_view'], production_order_material_requirements: ['production_view'], production_order_operations: ['production_view'], production_outputs: ['production_view'],
  ai_settings: [], profiles: [], user_roles: [], employee_permissions: [], password_reset_logs: [], ai_config: [],
};
for (const table of ['fabric_inventory','fabric_transactions','fabric_transfers','fabric_types','fabric_usage','fabric_variants','fabric_widths','warehouses']) tablePermissions[table] = ['fabric_management'];
const lookupRights = ['customers','customer_care','quotes','orders','contracts','reports'];
const productLookupRights = ['products','quotes','orders','bom_view','production_view','reports','cash_flow'];
const canonicalTables = new Set(['customers','products','products_public','price_lists','quotes','orders','contracts','contract_templates','einvoices','expenses','transactions','order_payments','inventory_items','bom_headers','bom_lines','bom_versions','production_orders','production_outputs','production_order_operations','production_operation_logs']);
for (const table of ['assignees','shipping_companies','ghn_tracking','fabric_types','fabric_variants','fabric_widths','fabric_inventory','fabric_transactions','fabric_transfers','knowledge_documents']) canonicalTables.add(table);
export function moduleRequirement(method: string, requestPath: string, body: Record<string, unknown> = {}): ModuleRequirement {
  let decodedPath: string;
  try { decodedPath = decodeURIComponent(requestPath); } catch { return false; }
  const path = decodedPath.toLowerCase().replace(/\/+$/, '');
  if (path.startsWith('/api/zcrm-admin')) return null; // Dedicated real-session role/owner checks.
  if (/^\/api\/local-(?:snapshot|table|rpc|functions)\/.*zcrm/.test(path)) return false;
  if (/^\/api\/local-(?:snapshot|table|rpc|functions)\/(?:local[_.-])?(?:order[_.-](?:refunds|returns))(?:[._/-]|$)/.test(path)) return false;
  const read = method === 'GET' || method === 'HEAD';
  // Canonical payroll prices have one API. Adapter handlers trim table aliases;
  // apply the same normalization before denying raw and action aliases.
  const rateAliasPath = path.replace(/^(\/api\/local-(?:snapshot|table|rpc|functions)\/)([^/]+)/, (_match, prefix: string, alias: string) => prefix + alias.trim());
  if (/^\/api\/local-(?:snapshot|table|rpc|functions)\/(?:(?:local|list|get|create|update|save|set|upsert|delete|approve|discard|retire|resolve|count|search|export|preview|history)[_./-])*product[_.-]rate[_.-]action[_.-]receipts(?:[._/-]|$)/.test(rateAliasPath)) return false;
  if (/^\/api\/local-(?:snapshot|table|rpc|functions)\/(?:(?:local|list|get|create|update|save|set|upsert|delete|approve|discard|retire|resolve|count|search|export|preview|history)[_./-])*product[_.-]rates(?:[._/-]|$)/.test(rateAliasPath)) return false;
  if (/^\/api\/local-(?:snapshot|table|rpc|functions)\/(?:local_)?product_supply/.test(path)) return false;
  if (path.startsWith('/api/product-supply-classifications')) return [];
   // Purchase fulfillment applies its own request ownership and inventory
   // capability checks.  Do not turn this into an administrator-only route.
   if (path.startsWith('/api/purchase-fulfillment')) return null;
  // Shipment handlers check current grants and order ownership before replay.
  if (path === '/api/order-shipments' || path.startsWith('/api/order-shipments/')) return null;
  if (path.startsWith('/api/product-technical-profiles')) return [];
  if (path.startsWith('/api/payroll/labor-mappings')) return [];
  if (path.startsWith('/api/payroll/labor-code-requirements')) return [];
  if (/^\/api\/local-(?:snapshot|table|rpc|functions)\/(?:(?:local|list|get|create|update|save|set|upsert|delete|approve|retire|submit|discard|resolve|count|search|export|preview|history)[_.-])*(?:labor[_.-]requirements?|labor[_.-]code[_.-]requirements?)(?:[._/-]|s|$)/.test(path)) return false;
  if (/^\/api\/local-(?:snapshot|table|rpc|functions)\/(?:local[_.-])?(?:(?:list|get|create|update|save|set|upsert|delete|approve|retire)[_.-])?(?:labor[_.-]mapping|product[_.-]labor)(?:[._/-]|s|$)/.test(path)) return false;
  // Profile facts and confirmation history have one versioned writer. Generic
  // aliases must never create a shadow master or forge confirmed metadata.
  if (/^\/api\/local-(?:snapshot|table|rpc|functions)\/(?:local[_.-])?(?:(?:list|get|create|update|save|set|upsert|delete)[_.-])?(?:product[_.-]technical|product[_.-]manufacturing[_.-]profiles?|manufacturing[_.-](?:profiles?|records))(?:[._/-]|$)/.test(path)) return false;
  // Payroll data has action and worker scope checks in canonical routes. Never
  // expose raw imported versions through a compatibility alias, even to a
  // manager whose role intentionally excludes bank/insurance management.
  if (/^\/api\/local-(?:snapshot|table|rpc|functions)\/(?:local_)?(?:(?:list_|get_|create_|update_|approve_|discard_|resolve_|retire_|upsert_)?(?:payroll|worker_(?:rates|payroll|compensation)|product_piece_rate|employee_social_insurance|social_insurance|bank_accounts|production_workers)|factory_attendance)/.test(path)) return false;
  // Private service credentials are never available through generic adapters,
  // including to browser administrators. Reserved aliases fail closed.
  if (/^\/api\/local-(?:snapshot|table|rpc|functions)\/(?:local_)?(?:integration|hermes)[_.-]/.test(path)) return false;
  if (/^\/api\/local-(?:snapshot|table|rpc|functions)\/(?:local[_.-])?(?:(?:list|get|create|update|save|set|upsert|delete)[_.-])?goong[_.-]?(?:settings|config)(?:[._/-]|$)/.test(path)) return false;
  if (/^\/api\/local-(?:snapshot|table|rpc|functions)\/(?:local[_.-])?(?:(?:integration|external)[_.-]?(?:private|settings)|external[_.-]?integration[_.-]?(?:private|settings)?|(?:ghn|goong)[_.-]?(?:settings|config)|einvoice[_.-]?settings)(?:[._/-]|$)/.test(path)) return false;
  if (/^\/api\/local-(?:snapshot|table|rpc|functions)\/(?:local[_.-])?(?:ai[_.-]private|ai[_.-]provider|f5quota|beeknoee)(?:[._/-]|$)/.test(path)) return false;
  if (/^\/api\/local-(?:snapshot|table|rpc|functions)\/(?:local[_.-])?(?:(?:list|get|create|update|save|set|upsert|delete)[_.-])?invoice[_.-]/.test(path)) return false;
  if(path.startsWith('/api/invoice-workspace'))return ['contracts'];
  if (path.startsWith('/api/ai/providers')) return [];
  if (path === '/api/ai/my-settings') return null;
  const adapter = path.match(/^\/api\/local-(snapshot|table)\/([^/]+)/);
  if (adapter) {
    const [,kind,rawTable] = adapter;
    const table = rawTable.replace(/^local[_.-]/, '');
    if (['einvoice_settings','integration_private','external_integration_settings','ghn_settings','goong_settings','ghn_order_attempts'].includes(table)) return false;
    if(table==='ai_config'&&!read)return null; // Handler enforces administrator, not manager.
    if (kind === 'snapshot' && ['contracts','contract_templates','einvoices'].includes(table)) return false;
    if (kind === 'snapshot' && read && table === 'user_roles') return null;
    if (kind === 'table' && canonicalTables.has(table)) return false;
    if (table === 'assignees') return read ? lookupRights : [];
    if (read && ['products','products_public','price_lists'].includes(table)) return productLookupRights;
    if (read && table === 'customers') return lookupRights;
    return tablePermissions[table] ?? [];
  }
  const rpc = path.match(/^\/api\/local-rpc\/([^/]+)/)?.[1];
  if (rpc) {
    if (rpc === 'get_dashboard_revenue') return ['dashboard','reports'];
    if (rpc === 'get_order_stats' || rpc === 'get_duplicate_display_order_numbers') return ['orders','reports'];
    if (rpc === 'get_quote_stats') return ['quotes','reports'];
    if (rpc === 'get_products_catalog') return productLookupRights;
    if (rpc === 'get_products_cost_prices') return ['products','inventory_cost_view'];
    if (rpc === 'list_inventory_audit_events') return ['inventory_audit'];
    if (['list_inventory_warehouses','get_inventory_dashboard_summary','list_inventory_balances','list_inventory_documents','list_inventory_movements','list_inventory_return_sources','list_production_orders_for_issue'].includes(rpc)) return ['inventory_view'];
    return [];
  }
  const fn = path.match(/^\/api\/local-functions\/([^/]+)/)?.[1];
  if (fn) {
    if (fn === 'change-password') return null;
    if (['create-user','delete-user','save-employee-permissions'].includes(fn)) return [];
    if (fn === 'lookup-tax-code') {
      const type = String(body.type || '');
      if (['refresh_ai_config','list_models','ai_quote_debug'].includes(type)) return [];
      if (type === 'ai_quote_fill') return ['quotes'];
      if (type.startsWith('parse_order_')) return ['orders'];
      return ['customers','contracts','quotes','orders'];
    }
    if (['ai-customer-suggestions','predictive-analytics'].includes(fn)) return ['customer_care'];
    if (fn === 'extract-document') return ['knowledge_base'];
    if (fn === 'import-products') return ['products'];
    if (fn === 'web-scraper') return ['customers'];
    if (fn === 'ghn-tracking') return ['ghn_tracking','orders'];
    if (fn === 'vinvoice-api') return ['contracts'];
    return [];
  }
  if (path.startsWith('/api/local-sync')) return [];
  if (path.startsWith('/api/dashboard')) return ['dashboard'];
  if (/^\/api\/quotes\/[^/]+\/approve$/.test(path)) return ['quote_approval'];
  if (method === 'PATCH' && /^\/api\/quotes\/[^/]+$/.test(path) && body.status === 'rejected') return ['quote_approval'];
  if (path.startsWith('/api/quotes') || path.startsWith('/api/quote-template-settings')) return read ? ['quotes','reports'] : ['quotes'];
  if (path.startsWith('/api/customers')) return read ? lookupRights : ['customers','customer_care'];
  if (path.startsWith('/api/catalog/')) return read ? productLookupRights : ['products'];
  if (path.startsWith('/api/orders')) return read ? ['orders','reports','cash_flow','transactions'] : ['orders'];
  if (path.startsWith('/api/contracts') || path.startsWith('/api/contract-templates') || path.startsWith('/api/einvoice')) return ['contracts'];
  if (path.startsWith('/api/expenses') || path.startsWith('/api/finance-data')) return read ? ['cash_flow','reports'] : ['cash_flow'];
  if (path.startsWith('/api/transactions')) return ['transactions'];
  if (path.startsWith('/api/order-payments')) return ['orders','cash_flow','transactions'];
  if (path.startsWith('/api/assignees')) return read ? lookupRights : [];
  if (path.startsWith('/api/shipping-companies')) return ['shipping_companies'];
  if (path.startsWith('/api/ghn-tracking') || path.startsWith('/api/ghn-orders') || path.startsWith('/api/ghn-edit')) return ['ghn_tracking','orders'];
  if (path.startsWith('/api/knowledge/')) return ['knowledge_base'];
  if (path.startsWith('/api/fabrics/')) return ['fabric_management'];
  if (path.startsWith('/api/cost/')) {
    if (path.endsWith('/confirm')) return ['cost_transaction_confirm'];
    if (path.endsWith('/void')) return ['cost_transaction_void'];
    const key = path.split('/')[3];
    return ({ categories:['cost_categories'], centers:['cost_centers'], objects:['cost_objects'], 'transaction-types':['transaction_types'], 'business-transactions':['cost_transactions'], audit:['cost_audit'] } as Record<string,string[]>)[key] ?? [];
  }
  if (path.startsWith('/api/inventory/')) {
    if (path.endsWith('/confirm')) return ['inventory_confirm'];
    if (path.endsWith('/void')) return ['inventory_confirm'];
    if (path.includes('/audit') || path.includes('/reconciliation')) return ['inventory_audit'];
    if (read) return ['inventory_view'];
    if (path.includes('/items')) return ['inventory_items'];
    return ['inventory_documents'];
  }
  if (path.startsWith('/api/local-storage/')) {
    const bucket = path.split('/')[3];
    if (bucket === 'knowledge-files') return ['knowledge_base'];
    if (bucket === 'product-images') return read ? productLookupRights : ['products','quotes'];
    if (bucket === 'logos') return read ? ['quotes'] : [];
    return [];
  }
  // These domains already apply per-worker/action/capability checks in their handlers.
  if(read&&/^\/api\/production-dispatch\/assignments\/[^/]+\/pay-preview$/.test(path))return null; // Handler verifies the assignment belongs to the authenticated worker.
  if (read && path.startsWith('/api/manufacturing/')) {
    if (path.endsWith('/routing')) return ['production_view','production_manage','bom_view'];
    if (path.endsWith('/profile') || path.endsWith('/bom')) return ['bom_view','bom_manage','cutting_profiles','production_view'];
    return [...productLookupRights, 'bom_manage', 'cutting_profiles', 'production_manage'];
  }
  if(read&&path==='/api/production/source-orders')return null; // Domain checks sales rights and source ownership.
  if(read&&/^\/api\/production-orders\/[^/]+\/cutting-estimates$/.test(path))return null; // Planner's scoped domain capability is checked by handler.
  if (read && /^\/api\/production(?:-orders|-operations|-batches|-stage-events|\/(?:source-orders|fabric-variants|fabric-stock|fabric-allocations|scrap|rework))/.test(path)) return ['production_view','production_manage','production_operations'];
  if (read && /^\/api\/(?:bom|cutting|routing)(?:\/|-|$)/.test(path)) {
    if (path.startsWith('/api/cutting')) return ['cutting_profiles','cutting_approve','bom_view','production_view','production_cutting_plan'];
    if (path.startsWith('/api/routing')) return ['production_view','production_manage','bom_view'];
    return ['bom_view','bom_manage','cutting_profiles','production_view'];
  }
  if (/^\/api\/(?:local-auth|users|my-profile|profile-requests|my-attendance|payroll|workers|worker-methods|rates|attendance|production|dispatch|bom|cutting|routing|manufacturing|local-realtime)(?:\/|-|$)/.test(path)) return null;
  return path.startsWith('/api/') ? [] : null;
}

