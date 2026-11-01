import {isProductRateISODate} from './product-rate-display';

export type ProductLaborFocus={productId:string;date:string};
export type ProductLaborRequirementPrefillSource={code_key:string;name:string;unit:string;semantic_fingerprint:string;pending_draft_count?:number};
export type ProductLaborRequirementHandoff={code:string;requirementDate:string;productId:string;returnDate:string;prefillSource?:ProductLaborRequirementPrefillSource};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function productLaborSetupLink(productId:unknown,date:unknown):string|null{
 if(typeof productId!=='string'||!uuid.test(productId)||!isProductRateISODate(date))return null;
 return '/payroll-settings?'+new URLSearchParams({tab:'mappings',mapping_view:'products',product_id:productId,mapping_date:date}).toString();
}
export function productLaborFocusFromParams(params:URLSearchParams):ProductLaborFocus|null{
 if(params.get('tab')!=='mappings'||params.get('mapping_view')==='requirements'||params.getAll('product_id').length!==1||params.getAll('mapping_date').length!==1)return null;
 const productId=params.get('product_id'),date=params.get('mapping_date');
 return productLaborSetupLink(productId,date)?{productId:productId!,date:date!}:null;
}
export function withoutProductLaborFocus(params:URLSearchParams):URLSearchParams{
 const next=new URLSearchParams(params);next.delete('product_id');next.delete('mapping_date');return next;
}
export function productLaborRequirementParams(params:URLSearchParams,handoff:ProductLaborRequirementHandoff):URLSearchParams|null{
 if(typeof handoff.code!=='string'||!handoff.code||handoff.code!==handoff.code.trim()||Array.from(handoff.code).some(char=>char.charCodeAt(0)<32||char.charCodeAt(0)===127)||!isProductRateISODate(handoff.requirementDate)||!productLaborSetupLink(handoff.productId,handoff.returnDate))return null;
 const next=new URLSearchParams(params);next.set('tab','mappings');next.set('mapping_view','requirements');next.set('requirement_code',handoff.code);next.set('req_date',handoff.requirementDate);next.set('product_id',handoff.productId);next.set('mapping_date',handoff.returnDate);return next;
}
export function productLaborReturnParams(params:URLSearchParams):URLSearchParams|null{
 if(params.get('tab')!=='mappings'||params.get('mapping_view')!=='requirements'||params.getAll('product_id').length!==1||params.getAll('mapping_date').length!==1||!productLaborSetupLink(params.get('product_id'),params.get('mapping_date')))return null;
 const next=new URLSearchParams(params);next.set('mapping_view','products');next.delete('requirement_code');return next;
}
