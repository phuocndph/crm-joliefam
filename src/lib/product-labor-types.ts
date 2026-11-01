export interface LaborCode {key:string;code:string;name:string;unit:string;semantic_fingerprint:string;status:'AVAILABLE'|'CONFLICT'|'INCOMPLETE';contract_status?:'SUPPORTED'|'CODE_REQUIREMENTS_REVIEW';contract_reason?:string;requirement?:Pick<import('./product-labor-requirement-types').LaborRequirement,'stream_id'|'version'|'content_hash'>|null;provenance:Array<{rate_id:string;source_reference:string|null}>}
export type LaborPredicate={op:'eq';value:string}|{op:'in';values:string[]}|{op:'range';min?:string;max?:string;min_inclusive:boolean;max_inclusive:boolean};
export type LaborIssue='SUPPLY_REVIEW'|'TECHNICAL_REVIEW'|'MISSING_FACTS'|'UNMAPPED'|'AMBIGUOUS'|'EXPIRED_REVIEW'|'CONTRACT_REVIEW'|'CODE_REVIEW'|'CODE_REQUIREMENTS_REVIEW'|'UNSUPPORTED'|'ADMIN_REVIEW'|'REVIEW'|'OVERRIDE_REVIEW';
export interface LaborCandidate {decision_id:string;version:number;revision:number;kind:'EXACT'|'RULE';action:'APPROVE'|'RETIRE';effective_from:string;effective_to:string|null;template_product_id:string;template_product_name:string|null;conditions:Record<string,LaborPredicate>;piece_rate_code:string|null;piece_rate_name:string|null;labor_unit:string|null;source_unit:string|null;conversion_factor:string|null;conversion_confirmed:boolean;can_reconfirm:boolean;can_retire:boolean;capability:'MANAGE'|'READ_ONLY'}
export interface LaborDiagnostics {issue:LaborIssue|null;missing_fact_keys:string[];next_action:'SUPPLY'|'TECHNICAL'|'MAPPING'|'ADMIN_REVIEW'|'COMPLETE';can_edit_source:boolean;can_edit_mapping:boolean;candidate_count:number;inaccessible_candidate_count:number;candidates:LaborCandidate[]}
export interface LaborProductPage {rows:LaborResolution[];total:number;date:string;price_lists:Array<{id:string;name:string}>;counts?:{all:number;attention:number;resolved:number;issues:Record<LaborIssue,number>}}
export interface LaborResolution {
 product:{id:string;name:string;sku:string|null;price_list_name:string|null};owner:string;gate:string;reason:string;
 fact_schema_version?:1|2;facts:Record<string,string|null>;template_conditions:Record<string,LaborPredicate>;proof:Record<string,unknown>;source_fingerprint:string;context_fingerprint:string;facts_fingerprint:string;
 read_only:boolean;ownership_review?:boolean;exact_decision_id:string|null;exact_revision:number;code_status:string;pay_ready:false;pay_status:'GROUP_CHECK_PENDING';
 diagnostics?:LaborDiagnostics;
 match:{approval_snapshot?:Record<string,unknown>;current_context?:Record<string,unknown>;current_source_fingerprint?:string;current_context_fingerprint?:string;current_facts_fingerprint?:string;current_fact_schema_version?:2;piece_rate_code:string;piece_rate_name:string;labor_unit:string;source_unit:string;conversion_factor:string;conversion_confirmed:boolean;code_semantic_fingerprint:string;requirement_id?:string;requirement_version?:number;requirement_content_hash?:string;decision_id:string;decision_version:number;conditions:Record<string,LaborPredicate>}|null;
}
export interface LaborDecisionVersion {decision_id:string;version:number;kind:'EXACT'|'RULE';action:'DRAFT'|'APPROVE'|'RETIRE';product_id:string|null;owner_id:string|null;template_product_name?:string|null;effective_from:string;effective_to:string|null;reason:string;created_at:string;snapshot:{template_product_id:string;piece_rate_code:string;conditions:Record<string,LaborPredicate>;[key:string]:unknown}}
export interface LaborDecisionInput {
 decision_id?:string;kind:'EXACT'|'RULE';template_product_id:string;expected_revision:number;source_fingerprint:string;
 action:'DRAFT'|'APPROVE'|'RETIRE';effective_from:string;effective_to?:string|null;reason:string;idempotency_key:string;
 piece_rate_code:string;code_semantic_fingerprint:string;source_unit:string;conversion_factor:string;conversion_confirmed:boolean;
 expected_requirement_id?:string;expected_requirement_version?:number;expected_requirement_content_hash?:string;
 global?:boolean;conditions?:Record<string,LaborPredicate>;
}
