import {productDigest} from './product-catalog-snapshot.js';
import {applicableTechnicalFields} from './product-technical-schema.js';

export type LaborRow=Record<string,unknown>;
export type Predicate={op:'eq';value:string}|{op:'in';values:string[]}|{op:'range';min?:string;max?:string;min_inclusive:boolean;max_inclusive:boolean};
export type LaborConditions=Record<string,Predicate>;
export const LABOR_CONTRACT_VERSION='2026-10-29.1';
export const codeKey=(value:unknown)=>String(value??'').normalize('NFC').trim().toLowerCase();
export const semanticText=(value:unknown)=>String(value??'').normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('vi');
export const laborSemanticFingerprint=(code:unknown,name:unknown,unit:unknown)=>productDigest({code:codeKey(code),name:semanticText(name),unit:String(unit||'').trim().toUpperCase()});
export function scaledDecimal(value:unknown):bigint {
 const text=String(value??'');if(!/^\d{1,10}(?:\.\d{1,4})?$/.test(text))throw new Error('Số thập phân không hợp lệ, tối đa 4 chữ số lẻ.');
 const [whole,fraction='']=text.split('.');return BigInt(whole)*10000n+BigInt(fraction.padEnd(4,'0'));
}
export function dimensionMM(value:unknown,unit:unknown):string|null {
 if(value===null||value===undefined||value==='')return null;
 const multiplier=unit==='MM'?1n:unit==='CM'?10n:unit==='METER'?1000n:null;
 if(!multiplier)throw new Error('Đơn vị kích thước chưa được hỗ trợ.');
 return decimalText(scaledDecimal(value)*multiplier);
}
const decimalText=(ticks:bigint)=>{const whole=ticks/10000n,fraction=(ticks%10000n).toString().padStart(4,'0').replace(/0+$/,'');return whole.toString()+(fraction?'.'+fraction:'');};
export function normalizedLaborFacts(profile:LaborRow){
 const extra=(profile.extra_dimensions||{}) as LaborRow,attributes=(extra.technical_attributes||{}) as LaborRow,values=(attributes.values||{}) as LaborRow;
 return {manufacturing_type:String(profile.manufacturing_type||'UNKNOWN'),...Object.fromEntries(Object.entries(values).map(([k,v])=>[k,String(v)])),
  width_mm:dimensionMM(profile.finished_width,profile.dimension_unit),length_mm:dimensionMM(profile.finished_length,profile.dimension_unit),height_mm:dimensionMM(profile.finished_height,profile.dimension_unit)} as Record<string,string|null>;
}
// Deliberately small, closed contracts: unsupported families remain explicit.
export function requiredLaborFields(facts:Record<string,string|null>):string[]{
 const family=facts.manufacturing_type;
 if(!['FITTED_SHEET','FLAT_SHEET','DUVET_COVER','PILLOW_CASE','DUVET_INSERT','PILLOW_INSERT'].includes(family||''))throw new Error('Loại hàng chưa có hợp đồng gán mã tự động; cần bổ sung quy tắc nghiệp vụ.');
 const fields=['manufacturing_type','material','joining','quilting','topstitch','sewing_method'];
 if(family==='FITTED_SHEET')fields.push('width_mm','elastic','straps','waterproof','ruffle');
 if(family==='FLAT_SHEET')fields.push('width_mm','straps','waterproof','ruffle');
 if(family==='PILLOW_CASE'||family==='PILLOW_INSERT')fields.push('pillow_subtype');
 if(family==='PILLOW_CASE'||family==='DUVET_COVER')fields.push('closure','ruffle');
 if(facts.joining==='YES')fields.push('joining_detail');
 if(facts.elastic==='YES'&&family==='FITTED_SHEET')fields.push('elastic_type');
 if(['DUVET_INSERT','PILLOW_INSERT'].includes(family||'')&&facts.material==='MICROFIBER')fields.push('microfiber_weight');
 return fields;
}
export function missingLaborFacts(facts:Record<string,string|null>):string[]{
 return requiredLaborFields(facts).filter(key=>!facts[key]||['UNKNOWN','NOT_APPLICABLE','OTHER'].includes(String(facts[key])));
}
export const laborContractName=(facts:Record<string,string|null>)=>String(facts.manufacturing_type)+'_'+(facts.pillow_subtype||facts.microfiber_weight||'STANDARD')+'@'+LABOR_CONTRACT_VERSION;
export function conditionsFromFacts(facts:Record<string,string|null>):LaborConditions {
 const missing=missingLaborFacts(facts);if(missing.length)throw new Error('Thiếu đặc điểm bắt buộc: '+missing.join(', '));
 return Object.fromEntries(requiredLaborFields(facts).map(key=>[key,{op:'eq',value:String(facts[key])}])) as LaborConditions;
}
export function validateLaborConditions(input:unknown,facts:Record<string,string|null>):LaborConditions {
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Điều kiện gán mã không hợp lệ.');
 const conditions=input as LaborConditions,required=requiredLaborFields(facts),applicable=new Set(['manufacturing_type','width_mm','length_mm','height_mm',...applicableTechnicalFields(String(facts.manufacturing_type),facts).map(f=>f.key)]);
 for(const key of required)if(!conditions[key])throw new Error('Thiếu điều kiện đóng: '+key);
 for(const [key,predicate]of Object.entries(conditions)){
  if(!applicable.has(key)||!predicate||typeof predicate!=='object')throw new Error('Thuộc tính không hỗ trợ: '+key);
  const allowed=predicate.op==='eq'?['op','value']:predicate.op==='in'?['op','values']:['op','min','max','min_inclusive','max_inclusive'];if(Object.keys(predicate).some(k=>!allowed.includes(k)))throw new Error('Toán tử hoặc dữ liệu điều kiện không hỗ trợ.');
  const dimension=key.endsWith('_mm');
  if(predicate.op==='eq'||predicate.op==='in'){
   const values=predicate.op==='eq'?[predicate.value]:predicate.values;
   if(!Array.isArray(values)||!values.length||values.length>30||values.some(v=>typeof v!=='string'||!v||['UNKNOWN','NOT_APPLICABLE','OTHER'].includes(v)))throw new Error('Giá trị điều kiện chưa xác định: '+key);
   if(dimension){for(const value of values)if(scaledDecimal(value)<=0n)throw new Error('Kích thước chuẩn MM không hợp lệ.');}
   else {const schema=applicableTechnicalFields(String(facts.manufacturing_type),facts).find(f=>f.key===key);for(const value of values)if(key==='manufacturing_type'?value!==facts.manufacturing_type:!schema?.values.some(([allowed])=>allowed===value))throw new Error('Giá trị điều kiện không hỗ trợ: '+key);}
  }else if(predicate.op==='range'&&dimension){
   if(predicate.min===undefined&&predicate.max===undefined)throw new Error('Khoảng kích thước cần ít nhất một giới hạn.');
   for(const bound of [predicate.min,predicate.max])if(bound!==undefined&&scaledDecimal(bound)<=0n)throw new Error('Giới hạn MM không hợp lệ.');
   if(typeof predicate.min_inclusive!=='boolean'||typeof predicate.max_inclusive!=='boolean')throw new Error('Cần xác định ranh giới đóng/mở.');
   if(predicate.min!==undefined&&predicate.max!==undefined&&(scaledDecimal(predicate.min)>scaledDecimal(predicate.max)||scaledDecimal(predicate.min)===scaledDecimal(predicate.max)&&(!predicate.min_inclusive||!predicate.max_inclusive)))throw new Error('Khoảng kích thước rỗng.');
  }else throw new Error('Chỉ hỗ trợ bằng, thuộc tập và khoảng kích thước.');
 }
 // Conditional children require closed parent conditions, not a wildcard union.
 for(const parent of ['joining','elastic','material'])if(conditions[parent]?.op==='in'&&conditions[parent].values.length>1)throw new Error('Thuộc tính cha cần một giá trị đóng: '+parent);
 return conditions;
}
export function laborConditionsMatch(conditions:LaborConditions,facts:Record<string,string|null>):boolean {
 try{if(missingLaborFacts(facts).length)return false;validateLaborConditions(conditions,facts);}catch{return false;}
 return Object.entries(conditions).every(([key,p])=>{
  const v=facts[key];if(!v||v==='UNKNOWN'||v==='NOT_APPLICABLE')return false;
  if(p.op==='eq')return key.endsWith('_mm')?scaledDecimal(v)===scaledDecimal(p.value):v===p.value;if(p.op==='in')return key.endsWith('_mm')?p.values.some(value=>scaledDecimal(v)===scaledDecimal(value)):p.values.includes(v);
  const n=scaledDecimal(v);return(p.min===undefined||(p.min_inclusive?n>=scaledDecimal(p.min):n>scaledDecimal(p.min)))&&(p.max===undefined||(p.max_inclusive?n<=scaledDecimal(p.max):n<scaledDecimal(p.max)));
 });
}
// A narrower viable rule with an unknown optional fact must block a broad rule.
// NOT_APPLICABLE is an actual excluded branch, never a missing fact.
export function laborCandidateState(conditions:LaborConditions,facts:Record<string,string|null>):'MATCH'|'MISSING'|'NO_MATCH' {
 try{validateLaborConditions(conditions,facts);}catch{return 'NO_MATCH';}
 const missing=Object.keys(conditions).filter(key=>!facts[key]||facts[key]==='UNKNOWN'||facts[key]==='OTHER');
 if(!missing.length)return laborConditionsMatch(conditions,facts)?'MATCH':'NO_MATCH';
 const known=Object.fromEntries(Object.entries(conditions).filter(([key])=>!missing.includes(key))) as LaborConditions;
 return laborConditionsMatch(known,facts)?'MISSING':'NO_MATCH';
}
/** Old contracts cannot be validated by today's required-field contract. Only
 * a provable mismatch in their explicit known predicates excludes review. */
export function legacyLaborCandidatePotential(input:unknown,facts:Record<string,string|null>):boolean {
 if(!input||typeof input!=='object'||Array.isArray(input))return true;
 for(const [key,raw]of Object.entries(input)){
  const value=facts[key];if(!value||['UNKNOWN','OTHER'].includes(value))continue;
  if(!raw||typeof raw!=='object'||Array.isArray(raw))continue;
  const p=raw as Predicate;
  try{
   if(p.op==='eq'&&typeof p.value==='string'){if(key.endsWith('_mm')?scaledDecimal(value)!==scaledDecimal(p.value):value!==p.value)return false;}
   else if(p.op==='in'&&Array.isArray(p.values)&&p.values.length&&p.values.every(v=>typeof v==='string')){if(key.endsWith('_mm')?!p.values.some(v=>scaledDecimal(value)===scaledDecimal(v)):!p.values.includes(value))return false;}
   else if(p.op==='range'&&key.endsWith('_mm')){const n=scaledDecimal(value);if(p.min!==undefined&&(p.min_inclusive?n<scaledDecimal(p.min):n<=scaledDecimal(p.min)))return false;if(p.max!==undefined&&(p.max_inclusive?n>scaledDecimal(p.max):n>=scaledDecimal(p.max)))return false;}
  }catch{/* Malformed or no longer understood predicates require review. */}
 }
 return true;
}
export function latestLaborEvents(versions:LaborRow[],date:string):LaborRow[]{
 const current=new Map<string,LaborRow>();
 for(const row of versions){if(row.action==='DRAFT'||String(row.effective_from)>date)continue;const key=String(row.decision_id),old=current.get(key);if(!old||Number(row.version)>Number(old.version))current.set(key,row);}
 return [...current.values()];
}
export const effectiveLaborVersions=(versions:LaborRow[],date:string)=>latestLaborEvents(versions,date).filter(row=>row.action==='APPROVE'&&(!row.effective_to||String(row.effective_to)>=date));
