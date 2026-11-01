export type LocalProductRateUnit='PIECE'|'SET'|'HOUR'|'METER';
export type LocalProductRateRow={
  id:string;tenant_id:string;product_id:string|null;piece_rate_code:string|null;piece_rate_name:string|null;
  product_sku:string|null;display_name:string|null;unit:LocalProductRateUnit;rate:number;rate_exact:string;basis:string;
  currency_code:string;effective_from:string;effective_to:string|null;status:'DRAFT'|'APPROVED'|'RETIRED';reason:string;
  source_reference:string|null;source_row:number|null;continued_from_id:string|null;
  created_by:null;approved_by:null;approved_at:null;created_at:string;updated_at:string;
};
export type LocalProductRateCreate={product_id:string|null;piece_rate_code:string;piece_rate_name:string;rate:string;unit:LocalProductRateUnit;effective_from:string;effective_to:string|null;source_reference:string|null;reason:string;idempotency_key:string};
export type LocalProductRateUpdate=LocalProductRateCreate&{expected_basis:string};
export type LocalProductRateAction={reason:string;idempotency_key:string;expected_basis:string};
