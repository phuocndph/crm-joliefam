import type {TechnicalProfileInput} from './product-technical-types';
// Transient receipt recovery only; never product/profile truth. Separate actor/target
// slots survive host authority remounts without exposing one actor's request to another.
const pending=new Map<string,TechnicalProfileInput>();
const slot=(actor:string,product:string)=>actor+'|'+product;
export function pendingTechnicalRequest(actor:string,product:string){return pending.get(slot(actor,product))||null;}
export function rememberTechnicalRequest(actor:string,product:string,body:TechnicalProfileInput){pending.set(slot(actor,product),structuredClone(body));}
export function settleTechnicalRequest(actor:string,product:string,key:string){const current=pending.get(slot(actor,product));if(current?.idempotency_key===key)pending.delete(slot(actor,product));}
