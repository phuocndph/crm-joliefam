import {technicalFields as v1Fields,validateTechnicalValues} from './product-technical-schema.js';
import {applicableTechnicalFieldsV2,extensionKeys,knownTechnicalValue} from './product-technical-schema-v2.js';
import {canonicalTechnicalValues,versionedTechnicalFields} from './product-technical-versioned.js';
import {LABOR_CONTRACT_VERSION,normalizedLaborFacts,requiredLaborFields,conditionsFromFacts,validateLaborConditions,laborConditionsMatch,laborCandidateState,scaledDecimal,type LaborConditions,type Predicate} from './product-labor-resolver.js';
export const FACT_PROJECTION_V2='2026-10-29.facts2';
export const V1_TECHNICAL_KEYS=Object.freeze(v1Fields.map(field=>field.key));
export function projectV1FactsFromV2(profile:Record<string,unknown>){
 const {values}=canonicalTechnicalValues(profile),family=String(profile.manufacturing_type),oldInput=Object.fromEntries(V1_TECHNICAL_KEYS.map(key=>[key,values[key]]));
 const oldValues=validateTechnicalValues(family,oldInput);
 return normalizedLaborFacts({...profile,extra_dimensions:{technical_attributes:{schema_version:1,values:oldValues}}});
}
export function versionedLaborFacts(profile:Record<string,unknown>){const {version}=canonicalTechnicalValues(profile);return{version,facts:normalizedLaborFacts(profile),legacyFacts:version===1?normalizedLaborFacts(profile):projectV1FactsFromV2(profile)};}
export function knownV2Extensions(facts:Record<string,string|null>){return applicableTechnicalFieldsV2(String(facts.manufacturing_type),facts).filter(field=>extensionKeys.includes(field.key)&&knownTechnicalValue(facts[field.key])).map(field=>field.key);}
export function requiredLaborFieldsV2(facts:Record<string,string|null>){
 let base:string[];
 if(facts.manufacturing_type==='GENERIC_SEWN_PRODUCT')base=['manufacturing_type','article_kind','material','joining','quilting','topstitch','sewing_method',...(applicableTechnicalFieldsV2('GENERIC_SEWN_PRODUCT',facts).some(field=>field.key==='closure')?['closure']:[])];else base=requiredLaborFields(facts);
 if(facts.joining==='YES'&&!base.includes('joining_detail'))base.push('joining_detail');
 if(facts.elastic==='YES'&&applicableTechnicalFieldsV2(String(facts.manufacturing_type),facts).some(field=>field.key==='elastic_type')&&!base.includes('elastic_type'))base.push('elastic_type');
 if(facts.lining==='YES')base.push('lining_type');return base;
}
export const missingVersionedLaborFacts=(version:1|2,facts:Record<string,string|null>)=>(version===1?requiredLaborFields(facts):requiredLaborFieldsV2(facts)).filter(key=>!knownTechnicalValue(facts[key]));
export function validateLaborConditionsV2(input:unknown,facts:Record<string,string|null>):LaborConditions{
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Điều kiện schema 2 không hợp lệ.');
 const conditions=input as LaborConditions,fields=applicableTechnicalFieldsV2(String(facts.manufacturing_type),facts),allowed=new Set(['manufacturing_type','width_mm','length_mm','height_mm',...fields.map(field=>field.key)]);
 for(const key of requiredLaborFieldsV2(facts))if(!conditions[key])throw new Error('Thiếu điều kiện đóng: '+key);
 for(const[key,p]of Object.entries(conditions)){
  if(!allowed.has(key)||!p||typeof p!=='object'||Array.isArray(p))throw new Error('Thuộc tính schema 2 không áp dụng: '+key);
  const keys=p.op==='eq'?['op','value']:p.op==='in'?['op','values']:p.op==='range'?['op','min','max','min_inclusive','max_inclusive']:[];
  if(!keys.length||Object.keys(p).some(key=>!keys.includes(key)))throw new Error('Toán tử schema 2 không hỗ trợ.');
  const dimension=key.endsWith('_mm');
  if(p.op==='eq'||p.op==='in'){const values=p.op==='eq'?[p.value]:p.values;if(!Array.isArray(values)||!values.length||values.length>30||values.some(value=>!knownTechnicalValue(value)))throw new Error('Giá trị schema 2 chưa rõ: '+key);
   for(const value of values){if(dimension){if(scaledDecimal(value)<=0n)throw new Error('Kích thước MM phải dương.');}else if(key==='manufacturing_type'?value!==facts.manufacturing_type:!fields.find(field=>field.key===key)?.values.some(([known])=>known===value))throw new Error('Giá trị ngoài schema 2: '+key);}
  }else{if(!dimension||p.min===undefined&&p.max===undefined||typeof p.min_inclusive!=='boolean'||typeof p.max_inclusive!=='boolean')throw new Error('Khoảng schema 2 không hợp lệ.');for(const bound of[p.min,p.max])if(bound!==undefined&&(typeof bound!=='string'||scaledDecimal(bound)<=0n))throw new Error('Giới hạn MM không hợp lệ.');if(p.min!==undefined&&p.max!==undefined&&(scaledDecimal(p.min)>scaledDecimal(p.max)||scaledDecimal(p.min)===scaledDecimal(p.max)&&(!p.min_inclusive||!p.max_inclusive)))throw new Error('Khoảng MM rỗng.');}
 }
 for(const parent of['joining','elastic','material','lining','article_kind'])if(conditions[parent]&&conditions[parent].op!=='eq')throw new Error('Nhánh cha cần một giá trị đóng: '+parent);
 return conditions;
}
export const versionedConditionsFromFacts=(version:1|2,facts:Record<string,string|null>)=>version===1?conditionsFromFacts(facts):Object.fromEntries([...new Set([...requiredLaborFieldsV2(facts),...Object.keys(facts).filter(key=>knownTechnicalValue(facts[key])&&(key.endsWith('_mm')||key==='manufacturing_type'||applicableTechnicalFieldsV2(String(facts.manufacturing_type),facts).some(field=>field.key===key)))])].map(key=>[key,{op:'eq',value:String(facts[key])}])) as LaborConditions;
export const validateVersionedLaborConditions=(version:1|2,input:unknown,facts:Record<string,string|null>)=>version===1?validateLaborConditions(input,facts):validateLaborConditionsV2(input,facts);
const accepts=(key:string,p:Predicate,value:string)=>p.op==='eq'?(key.endsWith('_mm')?scaledDecimal(value)===scaledDecimal(p.value):value===p.value):p.op==='in'?p.values.some(option=>key.endsWith('_mm')?scaledDecimal(value)===scaledDecimal(option):value===option):(p.min===undefined||(p.min_inclusive?scaledDecimal(value)>=scaledDecimal(p.min):scaledDecimal(value)>scaledDecimal(p.min)))&&(p.max===undefined||(p.max_inclusive?scaledDecimal(value)<=scaledDecimal(p.max):scaledDecimal(value)<scaledDecimal(p.max)));
export function versionedLaborConditionsMatch(version:1|2,input:unknown,facts:Record<string,string|null>){if(version===1)return laborConditionsMatch(input as LaborConditions,facts);try{const conditions=validateLaborConditionsV2(input,facts);return !missingVersionedLaborFacts(2,facts).length&&Object.entries(conditions).every(([key,p])=>knownTechnicalValue(facts[key])&&accepts(key,p,String(facts[key])));}catch{return false;}}
export function snapshotFactVersion(snapshot:Record<string,unknown>):1|2|null{if(snapshot.contract_version!==LABOR_CONTRACT_VERSION)return null;if(snapshot.fact_schema_version===undefined&&snapshot.fact_projection_version===undefined)return 1;if(snapshot.fact_schema_version===2&&snapshot.fact_projection_version===FACT_PROJECTION_V2)return 2;return null;}
/** A malformed predicate is never evidence that an old rule is unrelated.
 * Validate individual closed predicates, not today's complete required-field set. */
export function versionedRulePotential(input:unknown,facts:Record<string,string|null>,version:1|2){
 if(!input||typeof input!=='object'||Array.isArray(input))return true;
 const conditions=input as Record<string,unknown>,registry=versionedTechnicalFields(version),families=['FITTED_SHEET','FLAT_SHEET','DUVET_COVER','PILLOW_CASE','PILLOW_INSERT','DUVET_INSERT',...(version===2?['GENERIC_SEWN_PRODUCT']:[])];
 const closedEq=(raw:unknown)=>{if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;const p=raw as Record<string,unknown>;return p.op==='eq'&&Object.keys(p).every(key=>['op','value'].includes(key))&&knownTechnicalValue(p.value)?String(p.value):null;};
 const family=closedEq(conditions.manufacturing_type),article=closedEq(conditions.article_kind);
 for(const[key,raw]of Object.entries(conditions)){
  const current=facts[key];if(!knownTechnicalValue(current)||!raw||typeof raw!=='object'||Array.isArray(raw))continue;
  const p=raw as Predicate,dimension=['width_mm','length_mm','height_mm'].includes(key),field=registry.find(field=>field.key===key);
  if(!dimension&&key!=='manufacturing_type'&&!field)continue;
  if(field){if(family&&!(field.families as readonly string[]).includes(family))continue;if('articles'in field&&field.articles&&(!family||family==='GENERIC_SEWN_PRODUCT'&&(!article||!field.articles.includes(article))))continue;if(field.parents?.some(parent=>closedEq(conditions[parent.field])!==parent.value))continue;}
  const allowed=p.op==='eq'?['op','value']:p.op==='in'?['op','values']:p.op==='range'?['op','min','max','min_inclusive','max_inclusive']:[];
  if(!allowed.length||Object.keys(p).some(key=>!allowed.includes(key)))continue;
  try{
   if(p.op==='eq'||p.op==='in'){const values=p.op==='eq'?[p.value]:p.values;if(!Array.isArray(values)||!values.length||values.length>30||values.some(value=>!knownTechnicalValue(value)))continue;
    if(values.some(value=>dimension?scaledDecimal(value)<=0n:key==='manufacturing_type'?!families.includes(value):!field?.values.some(([known])=>known===value)))continue;
   }else{if(!dimension||p.min===undefined&&p.max===undefined||typeof p.min_inclusive!=='boolean'||typeof p.max_inclusive!=='boolean')continue;if([p.min,p.max].some(bound=>bound!==undefined&&(typeof bound!=='string'||scaledDecimal(bound)<=0n)))continue;if(p.min!==undefined&&p.max!==undefined&&(scaledDecimal(p.min)>scaledDecimal(p.max)||scaledDecimal(p.min)===scaledDecimal(p.max)&&(!p.min_inclusive||!p.max_inclusive)))continue;}
   if(!accepts(key,p,String(current)))return false;
  }catch{ /* Unsupported numeric/value grammar contributes no mismatch proof. */ }
 }
 return true;
}
export function versionedCandidateState(snapshot:Record<string,unknown>,profileVersion:1|2,facts:Record<string,string|null>,legacyFacts:Record<string,string|null>):'MATCH'|'MISSING'|'NO_MATCH'|'CONTRACT_REVIEW'{
 const version=snapshotFactVersion(snapshot),conditions=snapshot.conditions as LaborConditions;
 if(version!==2){if(!versionedRulePotential(conditions,legacyFacts,1))return'NO_MATCH';if(version!==1||profileVersion===2&&knownV2Extensions(facts).length)return'CONTRACT_REVIEW';return laborCandidateState(conditions,legacyFacts)==='NO_MATCH'?'CONTRACT_REVIEW':laborCandidateState(conditions,legacyFacts);}
 if(profileVersion!==2)return versionedRulePotential(conditions,facts,2)?'CONTRACT_REVIEW':'NO_MATCH';
 if(!versionedRulePotential(conditions,facts,2))return'NO_MATCH';
 try{validateLaborConditionsV2(conditions,facts);}catch{return'CONTRACT_REVIEW';}
 const missing=Object.keys(conditions).some(key=>!knownTechnicalValue(facts[key]));return missing?'MISSING':versionedLaborConditionsMatch(2,conditions,facts)?'MATCH':'NO_MATCH';
}
