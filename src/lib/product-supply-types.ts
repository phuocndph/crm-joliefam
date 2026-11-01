export type ProductSupplyRoute = 'SEW' | 'PURCHASE' | 'UNCLASSIFIED';
export interface ProductSupplyRow {
 id: string; sku: string; name: string; category: string | null; specifications: string | null;
 price_list_id: string | null; price_list_name: string | null; is_active: boolean;
 route: ProductSupplyRoute; status: 'CONFIRMED' | 'UNCLASSIFIED' | 'REVIEW'; revision: number;
 source_fingerprint: string; read_only: boolean; read_only_reason: string | null;
 suggestion: {route: ProductSupplyRoute;reason: string;requires_split: boolean};
 confirmed_at: string | null; confirmed_by: string | null;
}
export interface ProductSupplyPage {
 rows: ProductSupplyRow[]; total: number;
 counts: {all: number;confirmed: number;unclassified: number;review: number};
 price_lists: Array<{id: string;name: string}>; rule_version: string;
}
export interface ProductSupplyDecision {
 product_id: string; expected_revision: number; source_fingerprint: string;
 route: ProductSupplyRoute; use_suggestion?: boolean;
}
export interface ProductSupplyHistory {
 id: string; version: number; route: ProductSupplyRoute; reason: string; created_by: string;
 created_at: string; source_fingerprint: string; rule_version: string;
}
