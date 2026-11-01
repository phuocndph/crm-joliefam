import {codeKey} from './product-labor-resolver.js';
import type {VersionedRequirementDefinition} from './product-labor-requirement-versioned.js';

/** Code-specific governance only; source names and prices never determine usage. */
export function laborCodeUsagePolicy(code:unknown){
 return ['srem','srem1h'].includes(codeKey(code))?{kind:'REPAIR_ONLY' as const,source_unit:'PIECE' as const,quantity_basis:'COMPLETED_PIECE' as const,selection:'MANUAL' as const}:null;
}
export function laborRequirementUsageAllowed(code:unknown,definition:VersionedRequirementDefinition,sourceUnit?:unknown){
 if(!laborCodeUsagePolicy(code))return true;
 return sourceUnit==='PIECE'&&definition.disposition==='OTHER_STAGE'&&definition.stage==='REPAIR'&&definition.family===null&&definition.required_fields.length===0&&definition.conditional_fields.length===0&&Object.keys(definition.conditions).length===0;
}
