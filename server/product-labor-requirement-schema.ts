import {productDigest} from './product-catalog-snapshot.js';
import {laborCodeFits} from './product-labor-code-contracts.js';
import {requiredLaborFields,validateLaborConditions,scaledDecimal,type LaborConditions} from './product-labor-resolver.js';
import {technicalFields,manufacturingFamilies} from './product-technical-schema.js';

export type RequirementDefinition={schema_version:1;disposition:'SEWING_APPLICABLE'|'OTHER_STAGE'|'NOT_APPLICABLE';stage:'SEWING'|'CUTTING'|'REPAIR'|'NONE';family:string|null;required_fields:string[];conditional_fields:Array<{field:string;value:string;required:string[]}>;conditions:LaborConditions};
export const conditionalRequirementFacts=[{field:'joining',value:'YES',required:['joining_detail']},{field:'elastic',value:'YES',required:['elastic_type']},{field:'material',value:'MICROFIBER',required:['microfiber_weight']}];
export function baseRequirementFacts(family:string){return requiredLaborFields({manufacturing_type:family,joining:'NO',elastic:'NO',material:'COTTON'});}
const closedKeys=new Set(['schema_version','disposition','stage','family','required_fields','conditional_fields','conditions']);
export function validateRequirementDefinition(input:unknown):RequirementDefinition{
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Yêu cầu kỹ thuật không hợp lệ.');const value=input as RequirementDefinition;
 if(Object.keys(value).some(key=>!closedKeys.has(key))||value.schema_version!==1||!['SEWING_APPLICABLE','OTHER_STAGE','NOT_APPLICABLE'].includes(value.disposition))throw new Error('Schema hoặc trường yêu cầu không hỗ trợ.');
 if(!Array.isArray(value.required_fields)||!Array.isArray(value.conditional_fields)||!value.conditions||typeof value.conditions!=='object'||Array.isArray(value.conditions))throw new Error('Thiếu cấu trúc yêu cầu đóng.');
 if(value.disposition!=='SEWING_APPLICABLE'){
  if(value.family!==null||value.required_fields.length||value.conditional_fields.length||Object.keys(value.conditions).length||!(value.disposition==='NOT_APPLICABLE'?value.stage==='NONE':['CUTTING','REPAIR'].includes(value.stage)))throw new Error('Mã ngoài may không nhận điều kiện may.');return value;
 }
 if(value.stage!=='SEWING'||!value.family||!manufacturingFamilies.some(([key])=>key===value.family))throw new Error('Loại hàng hoặc công đoạn may chưa rõ.');
 const base=baseRequirementFacts(value.family),fields=new Set(['manufacturing_type','width_mm','length_mm','height_mm',...technicalFields.filter(field=>(field.families as readonly string[]).includes(value.family!)).map(field=>field.key)]);
 if(value.required_fields.some(key=>typeof key!=='string'||!fields.has(key))||new Set(value.required_fields).size!==value.required_fields.length||base.some(key=>!value.required_fields.includes(key)))throw new Error('Thiếu hoặc sai đặc điểm nền bắt buộc.');
 const expected=conditionalRequirementFacts.filter(rule=>fields.has(rule.field)&&rule.required.every(key=>fields.has(key)));
 if(productDigest(value.conditional_fields)!==productDigest(expected))throw new Error('Phải giữ đầy đủ điều kiện con theo loại hàng.');
 for(const rule of expected)for(const child of rule.required)if(value.required_fields.includes(child)||value.conditions[child]){
  const parent=value.conditions[rule.field];if(parent?.op!=='eq'||parent.value!==rule.value)throw new Error('Đặc điểm con phải có nhánh cha phù hợp: '+child);
 }
 // Only absent predicates may receive temporary required-known validation facts.
 // Explicit null/scalar/array entries are malformed, never missing restrictions.
 for(const [key,predicate]of Object.entries(value.conditions))if(!predicate||typeof predicate!=='object'||Array.isArray(predicate)||!['eq','in','range'].includes(predicate.op))throw new Error('Điều kiện không hợp lệ: '+key);
 const facts:Record<string,string|null>={manufacturing_type:value.family};
 for(const [key,predicate]of Object.entries(value.conditions)){if(predicate?.op==='eq')facts[key]=predicate.value;else if(predicate?.op==='in')facts[key]=predicate.values?.[0]||null;else if(predicate?.op==='range')facts[key]=predicate.min||predicate.max||null;}
 // Closed parent selection prevents applying a child to an unrelated branch.
 for(const parent of ['joining','elastic','material'])if(value.conditions[parent]&&value.conditions[parent].op!=='eq')throw new Error('Thuộc tính cha phải có một giá trị đóng.');
 // Validate capability predicates without inventing restrictions on mandatory
 // facts (e.g. pillow closure is known but not forced to ENVELOPE by Vgo).
 const validation={...value.conditions};for(const key of requiredLaborFields(facts))if(!Object.prototype.hasOwnProperty.call(validation,key)){
  const field=technicalFields.find(field=>field.key===key),known=field?.values.find(([v])=>!['UNKNOWN','OTHER','NOT_APPLICABLE'].includes(v))?.[0];
  validation[key]={op:'eq',value:key.endsWith('_mm')?'1':key==='manufacturing_type'?value.family:known||''};
 }
 validateLaborConditions(validation,facts);
 if(value.conditions.manufacturing_type?.op!=='eq'||value.conditions.manufacturing_type.value!==value.family)throw new Error('Điều kiện phải khóa đúng loại hàng.');
 for(const key of Object.keys(value.conditions))if(key.endsWith('_mm')){const p=value.conditions[key];for(const v of p.op==='eq'?[p.value]:p.op==='in'?p.values:[p.min,p.max].filter((v):v is string=>v!==undefined))scaledDecimal(v);}
 return value;
}
export function missingRequirementFacts(definition:RequirementDefinition,facts:Record<string,string|null>){
 const fields=[...definition.required_fields,...definition.conditional_fields.filter(rule=>facts[rule.field]===rule.value).flatMap(rule=>rule.required)];
 return [...new Set(fields)].filter(key=>!facts[key]||['UNKNOWN','OTHER','NOT_APPLICABLE'].includes(String(facts[key])));
}
export const requirementContentHash=(definition:RequirementDefinition,semantic:string)=>productDigest({definition,semantic});
export function requirementFits(definition:RequirementDefinition,semantic:string,facts:Record<string,string|null>,conditions:LaborConditions){
 return definition.disposition==='SEWING_APPLICABLE'&&!missingRequirementFacts(definition,facts).length&&laborCodeFits({id:'db',semantic,conditions:definition.conditions},facts,conditions);
}
/** Authoring metadata is derived from the same closed validator facts. No new
 * family, operator or default equality is introduced by the browser builder. */
export function requirementAuthoringSchema(){
 const families=manufacturingFamilies.flatMap(([key,label])=>{try{
  const required=baseRequirementFacts(key),fields=[...technicalFields.filter(field=>(field.families as readonly string[]).includes(key)).map(field=>({key:field.key,label:field.label,kind:'ENUM' as const,values:field.values.filter(([value])=>!['UNKNOWN','OTHER','NOT_APPLICABLE'].includes(value)).map(([value,label])=>({value,label})),operators:(['joining','elastic','material'].includes(field.key)?['eq']:['eq','in']) as Array<'eq'|'in'|'range'>})),...(['width_mm','length_mm','height_mm'] as const).map((key,index)=>({key,label:['Rộng (mm)','Dài (mm)','Cao (mm)'][index],kind:'DECIMAL' as const,values:[] as Array<{value:string;label:string}>,operators:['eq','in','range'] as Array<'eq'|'in'|'range'>}))];
  const conditional=conditionalRequirementFacts.filter(rule=>fields.some(field=>field.key===rule.field)&&rule.required.every(child=>fields.some(field=>field.key===child)));
  return [{key,label,fields,base_required_fields:required,conditional_fields:conditional,template:{schema_version:1,disposition:'SEWING_APPLICABLE',stage:'SEWING',family:key,required_fields:required,conditional_fields:conditional,conditions:{manufacturing_type:{op:'eq',value:key}}} as RequirementDefinition}];
 }catch{return[];}});
 return {schema_version:1 as const,families,dispositions:[{value:'SEWING_APPLICABLE',label:'Áp dụng may',stages:[{value:'SEWING',label:'May'}]},{value:'OTHER_STAGE',label:'Công đoạn khác',stages:[{value:'CUTTING',label:'Cắt'},{value:'REPAIR',label:'Sửa hàng'}]},{value:'NOT_APPLICABLE',label:'Không áp dụng công may',stages:[{value:'NONE',label:'Không áp dụng'}]}]};
}
export {laborRequirementSeedManifest,laborRequirementSeedHash} from './product-labor-requirement-seeds.js';
