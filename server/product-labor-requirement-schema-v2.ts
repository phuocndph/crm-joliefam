import {productDigest} from './product-catalog-snapshot.js';
import {manufacturingFamilies} from './product-technical-schema.js';
import {technicalFieldsV2,applicableTechnicalFieldsV2,knownTechnicalValue,articleOptions} from './product-technical-schema-v2.js';
import {requiredLaborFieldsV2,validateLaborConditionsV2} from './product-labor-facts-versioned.js';
import {conditionalRequirementFacts} from './product-labor-requirement-schema.js';
import type {LaborConditions} from './product-labor-resolver.js';
export type RequirementDefinitionV2={schema_version:2;disposition:'SEWING_APPLICABLE'|'OTHER_STAGE'|'NOT_APPLICABLE';stage:'SEWING'|'CUTTING'|'REPAIR'|'NONE';family:string|null;required_fields:string[];conditional_fields:Array<{field:string;value:string;required:string[]}>;conditions:LaborConditions};
export const conditionalRequirementFactsV2=[...conditionalRequirementFacts,{field:'lining',value:'YES',required:['lining_type']}];
export function requirementV2Base(family:string,article?:string){return requiredLaborFieldsV2({manufacturing_type:family,article_kind:article||null,material:'COTTON',joining:'NO',elastic:'NO',lining:'NO'});}
export function requirementV2Conditional(family:string){const fields=technicalFieldsV2.filter(field=>field.families.includes(family));return conditionalRequirementFactsV2.filter(rule=>fields.some(field=>field.key===rule.field)&&rule.required.every(key=>fields.some(field=>field.key===key)));}
export function validateRequirementDefinitionV2(input:unknown):RequirementDefinitionV2{
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Yêu cầu schema 2 không hợp lệ.');const v=input as RequirementDefinitionV2;
 if(Object.keys(v).some(key=>!['schema_version','disposition','stage','family','required_fields','conditional_fields','conditions'].includes(key))||v.schema_version!==2||!['SEWING_APPLICABLE','OTHER_STAGE','NOT_APPLICABLE'].includes(v.disposition)||!Array.isArray(v.required_fields)||!Array.isArray(v.conditional_fields)||!v.conditions||typeof v.conditions!=='object'||Array.isArray(v.conditions))throw new Error('Cấu trúc schema 2 không hợp lệ.');
 if(v.disposition!=='SEWING_APPLICABLE'){if(v.family!==null||v.required_fields.length||v.conditional_fields.length||Object.keys(v.conditions).length||!(v.disposition==='NOT_APPLICABLE'?v.stage==='NONE':['CUTTING','REPAIR'].includes(v.stage)))throw new Error('Mã ngoài may không nhận điều kiện may.');return v;}
 if(v.stage!=='SEWING'||!v.family)throw new Error('Thiếu loại hàng schema 2.');
 for(const[key,p]of Object.entries(v.conditions))if(!p||typeof p!=='object'||Array.isArray(p)||!['eq','in','range'].includes(p.op))throw new Error('Predicate schema 2 sai định dạng: '+key);
 const article=v.conditions.article_kind?.op==='eq'?v.conditions.article_kind.value:undefined;
 if(v.family==='GENERIC_SEWN_PRODUCT'&&(!article||!articleOptions.some(([key])=>key===article)))throw new Error('Hàng may khác phải chọn một loại hàng đóng.');
 const base=requirementV2Base(v.family,article),expected=requirementV2Conditional(v.family),facts:Record<string,string|null>={manufacturing_type:v.family,article_kind:article||null};
 for(const[key,p]of Object.entries(v.conditions))facts[key]=p.op==='eq'?p.value:p.op==='in'?p.values?.[0]||null:p.min||p.max||null;
 const fields=applicableTechnicalFieldsV2(v.family,facts),allowed=new Set(['manufacturing_type','width_mm','length_mm','height_mm',...fields.map(field=>field.key)]);
 if(v.required_fields.some(key=>typeof key!=='string'||!allowed.has(key))||new Set(v.required_fields).size!==v.required_fields.length||base.some(key=>!v.required_fields.includes(key))||productDigest(v.conditional_fields)!==productDigest(expected))throw new Error('Đặc điểm nền/nhánh schema 2 không đầy đủ.');
 for(const rule of expected)for(const child of rule.required)if(v.required_fields.includes(child)||Object.prototype.hasOwnProperty.call(v.conditions,child)){const parent=v.conditions[rule.field];if(parent?.op!=='eq'||parent.value!==rule.value)throw new Error('Đặc điểm con thiếu nhánh cha: '+child);}
 if(v.conditions.manufacturing_type?.op!=='eq'||v.conditions.manufacturing_type.value!==v.family)throw new Error('Phải khóa đúng loại hàng schema 2.');
 const validation={...v.conditions};for(const key of requiredLaborFieldsV2(facts))if(!Object.prototype.hasOwnProperty.call(validation,key)){const field=fields.find(field=>field.key===key),known=field?.values.find(([key])=>knownTechnicalValue(key))?.[0];validation[key]={op:'eq',value:key==='manufacturing_type'?v.family:key.endsWith('_mm')?'1':known||''};}
 validateLaborConditionsV2(validation,facts);return v;
}
export function requirementAuthoringSchemaV2(){
 const families=manufacturingFamilies.flatMap(([key,label])=>{try{const base=requirementV2Base(key),conditional=requirementV2Conditional(key),fields=[...technicalFieldsV2.filter(field=>field.families.includes(key)).map(field=>({key:field.key,label:field.label,kind:field.kind,values:field.values.filter(([value])=>knownTechnicalValue(value)).map(([value,label])=>({value,label})),operators:['joining','elastic','material','lining','article_kind'].includes(field.key)?['eq']:['eq','in'],parents:field.parents,articles:field.articles,advanced:field.advanced})),...['width_mm','length_mm','height_mm'].map((key,index)=>({key,label:['Rộng (mm)','Dài (mm)','Cao (mm)'][index],kind:'DECIMAL',values:[],operators:['eq','in','range'],advanced:true}))];
  return[{key,label,fields,base_required_fields:base,...(key==='GENERIC_SEWN_PRODUCT'?{article_required_fields:Object.fromEntries(articleOptions.map(([article])=>[article,requirementV2Base(key,article)]))}:{}),conditional_fields:conditional,template:{schema_version:2,disposition:'SEWING_APPLICABLE',stage:'SEWING',family:key,required_fields:base,conditional_fields:conditional,conditions:{manufacturing_type:{op:'eq',value:key}}} as RequirementDefinitionV2}];}catch{return[];}});
 return{schema_version:2 as const,families,dispositions:[{value:'SEWING_APPLICABLE',label:'Áp dụng may',stages:[{value:'SEWING',label:'May'}]},{value:'OTHER_STAGE',label:'Công đoạn khác',stages:[{value:'CUTTING',label:'Cắt'},{value:'REPAIR',label:'Sửa hàng'}]},{value:'NOT_APPLICABLE',label:'Không áp dụng công may',stages:[{value:'NONE',label:'Không áp dụng'}]}]};
}
