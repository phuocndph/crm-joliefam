import {validateRequirementDefinition as v1,requirementAuthoringSchema as schema1,missingRequirementFacts as missing1,type RequirementDefinition} from './product-labor-requirement-schema.js';
import {validateRequirementDefinitionV2,requirementAuthoringSchemaV2,type RequirementDefinitionV2} from './product-labor-requirement-schema-v2.js';
import {productDigest} from './product-catalog-snapshot.js';
import {laborCodeFits} from './product-labor-code-contracts.js';
import {knownTechnicalValue} from './product-technical-schema-v2.js';
import type {LaborConditions} from './product-labor-resolver.js';
export type VersionedRequirementDefinition=RequirementDefinition|RequirementDefinitionV2;
export function validateVersionedRequirement(input:unknown):VersionedRequirementDefinition{return(input as {schema_version?:unknown})?.schema_version===2?validateRequirementDefinitionV2(input):v1(input);}
export const versionedRequirementContentHash=(definition:VersionedRequirementDefinition,semantic:string)=>productDigest({definition,semantic});
export const versionedRequirementSchema=(version:unknown)=>{if(version===undefined||version===1)return schema1();if(version===2)return requirementAuthoringSchemaV2();throw new Error('Schema yêu cầu không hỗ trợ.');};
export function missingVersionedRequirementFacts(definition:VersionedRequirementDefinition,facts:Record<string,string|null>){if(definition.schema_version===1)return missing1(definition,facts);return[...new Set([...definition.required_fields,...definition.conditional_fields.filter(rule=>facts[rule.field]===rule.value).flatMap(rule=>rule.required)])].filter(key=>!knownTechnicalValue(facts[key]));}
export function versionedRequirementFits(definition:VersionedRequirementDefinition,semantic:string,facts:Record<string,string|null>,conditions:LaborConditions){return definition.disposition==='SEWING_APPLICABLE'&&!missingVersionedRequirementFacts(definition,facts).length&&laborCodeFits({id:'db',semantic,conditions:definition.conditions},facts,conditions);}
