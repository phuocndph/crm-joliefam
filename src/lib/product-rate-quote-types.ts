export type ProductRateQuoteRequest = {code:string;date:string;quantity:string};
export type ProductRateQuoteBlocker = 'MISSING_RATE'|'AMBIGUOUS_RATE'|'INVALID_RATE_SOURCE'|'ZERO_RATE_UNSUPPORTED';

/** Configuration inspection only; this is never approval to pay a worker. */
export type ProductRateQuote = {
  quote_schema_version:1;
  kind:'CONFIG_PRICE_INSPECTION';
  status:'AVAILABLE'|'BLOCKED';
  code_key:string;
  date:string;
  quantity:string;
  recorded_unit:'PIECE'|'SET'|'HOUR'|'METER'|null;
  selected_rate_id:string|null;
  effective_from:string|null;
  effective_to:string|null;
  unit_rate:string|null;
  line_amount:string|null;
  candidate_count:number;
  blockers:ProductRateQuoteBlocker[];
  quantity_basis:'RECORDED_UNIT';
  unit_confirmation:'NOT_ASSESSED';
  mapping_status:'NOT_ASSESSED';
  pay_ready:false;
  operational_activation:'DISABLED';
};
