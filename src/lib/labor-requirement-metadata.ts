import type {LaborRequirementDefinition,RequirementAuthoringSchema} from './product-labor-requirement-types';

export type RequirementSchemaVersion=LaborRequirementDefinition['schema_version'];
export interface RequirementMetadataQuery {
 data?:RequirementAuthoringSchema;
 isPending:boolean;
 isFetching:boolean;
 isError:boolean;
 isPlaceholderData?:boolean;
 fetchStatus:string;
 refetch:()=>unknown;
}
export const requirementSchemaKey=(userId:string,admin:boolean,canManage:boolean,version:RequirementSchemaVersion)=>['labor-requirement-schema',userId,admin,canManage,version] as const;

/** A cached or placeholder catalogue from another version cannot authorize review. */
export function exactRequirementSchema(query:RequirementMetadataQuery,version:RequirementSchemaVersion){
 if(query.isPending||query.isFetching||query.isError||query.isPlaceholderData||query.fetchStatus==='paused'||query.data?.schema_version!==version)return undefined;
 return query.data;
}

/** Review only facts whose labels are present; decimal facts remain numeric. */
export function requirementDefinitionSchema(query:RequirementMetadataQuery,value:LaborRequirementDefinition){
 const schema=exactRequirementSchema(query,value.schema_version);
 if(!schema)return undefined;
 const disposition=schema.dispositions.find(item=>item.value===value.disposition);
 if(!disposition?.label||!disposition.stages.find(item=>item.value===value.stage)?.label)return undefined;
 const family=schema.families.find(item=>item.key===value.family);
 if(value.family&&!family?.label)return undefined;
 const field=(key:string)=>family?.fields.find(item=>item.key===key);
 const labeled=(key:string)=>key==='manufacturing_type'?!!family?.label:!!field(key)?.label;
 const labeledValue=(key:string,raw:string)=>key==='manufacturing_type'?!!schema.families.find(item=>item.key===raw)?.label:field(key)?.kind==='DECIMAL'||!!field(key)?.values.find(item=>item.value===raw)?.label;
 if(value.required_fields.some(key=>!labeled(key)))return undefined;
 if(value.conditional_fields.some(rule=>!labeled(rule.field)||!labeledValue(rule.field,rule.value)||rule.required.some(key=>!labeled(key))))return undefined;
 for(const [key,predicate] of Object.entries(value.conditions)){
  if(!labeled(key))return undefined;
  if(predicate.op==='eq'&&!labeledValue(key,predicate.value)||predicate.op==='in'&&predicate.values.some(raw=>!labeledValue(key,raw)))return undefined;
 }
 return schema;
}
