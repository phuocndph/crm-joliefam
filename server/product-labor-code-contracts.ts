import {codeKey,scaledDecimal,type LaborConditions,type Predicate} from './product-labor-resolver.js';

// Validated capability constraints only. Names, units, prices and identities
// continue to come exclusively from local_product_rates. Fingerprints below
// bind the read-only audited catalog meaning, never a product/rate UUID.
export const LABOR_CODE_CONTRACT_VERSION='2026-10-29.1';
export type CodeContract={id:string;semantic:string;conditions:LaborConditions};
const eq=(value:string):Predicate=>({op:'eq',value});
const pillow=(material:string,ruffle:string):LaborConditions=>({manufacturing_type:eq('PILLOW_CASE'),pillow_subtype:eq('BOLSTER'),material:eq(material),ruffle:eq(ruffle),joining:eq('NO'),quilting:eq('NO'),topstitch:eq('NO'),sewing_method:eq('STANDARD')});
const fitted=(material:string,joining:string,small=false):LaborConditions=>({manufacturing_type:eq('FITTED_SHEET'),material:eq(material),elastic:eq('YES'),elastic_type:eq('LUON'),joining:eq(joining),...(joining==='YES'?{joining_detail:{op:'in',values:['ONE_SIDE','TWO_SIDES']} as Predicate}:{}),quilting:eq('NO'),topstitch:eq('NO'),straps:eq('NO'),waterproof:eq('NO'),ruffle:eq('NO'),sewing_method:eq('STANDARD'),width_mm:small?{op:'range',max:'1000',min_inclusive:true,max_inclusive:false}:{op:'range',min:'1000',min_inclusive:true,max_inclusive:true}});
const micro=(method:string):LaborConditions=>({manufacturing_type:eq('DUVET_INSERT'),material:eq('MICROFIBER'),sewing_method:eq(method)});
const entry=(code:string,semantic:string,conditions:LaborConditions):CodeContract=>({id:'labor-code/'+code,semantic,conditions});
const contracts:Record<string,CodeContract>={
 vgo:entry('vgo','8101a7371c1f1b5b4786bded85bc31ecdd9b681c2a0f0b0e33aa6c7c578001a4',pillow('COTTON','NO')),
 vgol:entry('vgol','8b98d0a7ec1d158dcc51fc6f7429d6422d492e79db99a0b1a4fdd11335587e7a',pillow('SILK','NO')),
 vgolb:entry('vgolb','079da57d948f35612f027867bc113d18fd6c10c63c86fab9589c81a3fb3dc660',pillow('SILK','YES')),
 gcl:entry('gcl','a3c794540efa893384ba635d4822fa2adf07f2c955afafa5408d994a38d45d11',fitted('COTTON','NO')),
 gclc:entry('gclc','70de4d7e3e51bc5e8e181ee6485e34ff9813560936f5d7302ae2ae9b3711545e',fitted('COTTON','YES')),
 gcll:entry('gcll','f469cffe5cb7a9748257a5eb50c36d813167f1062d916b0da8912c47e376010e',fitted('SILK','NO')),
 gcb1:entry('gcb1','8da78dcd5d64da9bad0a82a0436ec06cc819fa18d2eb987b47725c794b08ebdf',fitted('COTTON','NO',true)),
 gcb1c:entry('gcb1c','38fdf492135e23bcc04f147180a7e0668f9d95efce9b52cd2eb5de34eb05cd4d',fitted('COTTON','YES',true)),
 chm:entry('chm','a90649292bf5add324507c0a8d9fb2fddf22f055cf66f55565b64d1e7c83873b',micro('STANDARD')),
 chanhecm:entry('chanhecm','855d640389203b7b7f51c31d07ac3e0234a21a4da56baead175c7404772d10fb',micro('MACHINE_T233')),
};
// Seed/legacy parity reference only. Runtime support is selected from the
// immutable database requirement store; never call this as a fallback.
export const reviewedLaborCodeSeeds=Object.entries(contracts).map(([code,contract])=>({code,...contract}));
export function laborCodeContract(code:unknown,semantic:string):CodeContract|null {
 const contract=contracts[codeKey(code)];return contract?.semantic===semantic?contract:null;
}
const accepts=(key:string,p:Predicate,value:string)=>{
 if(p.op==='eq')return key.endsWith('_mm')?scaledDecimal(value)===scaledDecimal(p.value):value===p.value;
 if(p.op==='in')return key.endsWith('_mm')?p.values.some(v=>scaledDecimal(value)===scaledDecimal(v)):p.values.includes(value);
 const n=scaledDecimal(value);return(p.min===undefined||(p.min_inclusive?n>=scaledDecimal(p.min):n>scaledDecimal(p.min)))&&(p.max===undefined||(p.max_inclusive?n<=scaledDecimal(p.max):n<scaledDecimal(p.max)));
};
export function laborPredicateSubset(key:string,candidate:Predicate|undefined,required:Predicate){
 if(!candidate)return false;
 if(candidate.op==='eq')return accepts(key,required,candidate.value);
 if(candidate.op==='in')return candidate.values.length>0&&candidate.values.every(value=>accepts(key,required,value));
 if(required.op!=='range'||!key.endsWith('_mm'))return false;
 if(required.min!==undefined){if(candidate.min===undefined)return false;const c=scaledDecimal(candidate.min),r=scaledDecimal(required.min);if(c<r||c===r&&candidate.min_inclusive&&!required.min_inclusive)return false;}
 if(required.max!==undefined){if(candidate.max===undefined)return false;const c=scaledDecimal(candidate.max),r=scaledDecimal(required.max);if(c>r||c===r&&candidate.max_inclusive&&!required.max_inclusive)return false;}
 return true;
}
export function laborCodeFits(contract:CodeContract,facts:Record<string,string|null>,conditions:LaborConditions):boolean {
 try{return Object.entries(contract.conditions).every(([key,required])=>{const value=facts[key];return !!value&&!['UNKNOWN','NOT_APPLICABLE','OTHER'].includes(value)&&accepts(key,required,value)&&laborPredicateSubset(key,conditions[key],required);});}catch{return false;}
}
