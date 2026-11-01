import {manufacturingFamilies,technicalFields,applicableTechnicalFields,validateTechnicalValues,technicalSupplyBasis as v1Basis,technicalSupplyRoute as v1Route} from './product-technical-schema.js';
import {technicalFieldsV2,applicableTechnicalFieldsV2,validateTechnicalValuesV2} from './product-technical-schema-v2.js';
import {stableProductJson} from './product-catalog-snapshot.js';
type Row=Record<string,unknown>;
const obj=(value:unknown):Row=>value&&typeof value==='object'&&!Array.isArray(value)?value as Row:{};
export const technicalNamespace=(profile:Row)=>obj(obj(profile.extra_dimensions).technical_attributes);
export const supportedTechnicalVersion=(value:unknown):value is 1|2=>value===1||value===2;
export function validateVersionedTechnicalValues(version:unknown,family:string,input:unknown){if(version===1)return validateTechnicalValues(family,input);if(version===2)return validateTechnicalValuesV2(family,input);throw new Error('Phiên bản đặc điểm không hỗ trợ.');}
export function versionedTechnicalFields(version:1|2){return version===1?technicalFields.map(field=>({...field,kind:'ENUM' as const,advanced:false,parents:field.key==='microfiber_weight'?[{field:'material',value:'MICROFIBER'}]:field.key==='joining_detail'?[{field:'joining',value:'YES'}]:field.key==='elastic_type'?[{field:'elastic',value:'YES'}]:undefined})):technicalFieldsV2;}
export const versionedApplicableFields=(version:1|2,family:string,values:Row)=>version===1?applicableTechnicalFields(family,values):applicableTechnicalFieldsV2(family,values);
export function technicalMetadata(version:1|2){return{schema_version:version,available_versions:[1,2],families:manufacturingFamilies,fields:versionedTechnicalFields(version)};}
export function canonicalTechnicalValues(profile:Row){
 const attributes=technicalNamespace(profile),version=attributes.schema_version,family=String(profile.manufacturing_type||'');
 if(!supportedTechnicalVersion(version)||!manufacturingFamilies.some(([key])=>key===family))throw new Error('Hồ sơ chưa có schema hợp lệ.');
 if(!['MM','CM','METER'].includes(String(profile.dimension_unit))||typeof profile.is_active!=='boolean'||['finished_width','finished_length','finished_height'].some(key=>profile[key]!==null&&(typeof profile[key]!=='number'||!Number.isFinite(profile[key])||Number(profile[key])<=0||Number(profile[key])>10000000)))throw new Error('Trường hồ sơ không đúng dạng chuẩn.');
 const values=validateVersionedTechnicalValues(version,family,attributes.values);
 if(stableProductJson(values)!==stableProductJson(attributes.values))throw new Error('Đặc điểm lưu không đúng dạng chuẩn của schema.');
 return {version,values};
}
export function hasVersionedTechnicalProof(profile:Row,confirmed:Row|null|undefined){
 if(!confirmed)return false;try{const snapshot=obj(confirmed.snapshot),current=canonicalTechnicalValues(profile),audit=canonicalTechnicalValues(snapshot),attributes=technicalNamespace(profile);
  const auditAttributes=technicalNamespace(snapshot);
  return current.version===audit.version&&attributes.status==='CONFIRMED'&&auditAttributes.status==='CONFIRMED'&&Number.isSafeInteger(attributes.confirmed_version)&&Number(attributes.confirmed_version)>0&&attributes.confirmed_version===auditAttributes.confirmed_version&&confirmed.source_fingerprint===attributes.confirmed_raw_source_fingerprint&&confirmed.source_fingerprint===auditAttributes.confirmed_raw_source_fingerprint
   &&['manufacturing_type','finished_width','finished_length','finished_height','dimension_unit','is_active'].every(field=>stableProductJson(profile[field])===stableProductJson(snapshot[field]))
   &&stableProductJson(current.values)===stableProductJson(audit.values);
 }catch{return false;}
}
export function technicalSupplyBasisVersioned(profile:unknown){
 if(!profile||typeof profile!=='object'||Array.isArray(profile))return null;try{const row=profile as Row,{version}=canonicalTechnicalValues(row);if(version===1)return v1Basis(row);
  const attributes=technicalNamespace(row);return v1Basis({...row,extra_dimensions:{technical_attributes:{...attributes,schema_version:1}}});
 }catch{return null;}
}
export function technicalSupplyRouteVersioned(profile:unknown):'SEW'|'PURCHASE'|null{const basis=technicalSupplyBasisVersioned(profile);if(!basis)return null;return v1Route({...basis,extra_dimensions:{technical_attributes:{schema_version:1,values:{material:basis.material}}}});}
