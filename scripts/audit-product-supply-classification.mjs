// Read-only real-catalog audit. No .env, hosted access or classification writes.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {tsImport} from 'tsx/esm/api';

const result=spawnSync('docker',['exec','crm-joliefam-local-postgres','psql','-U','crm_local','-d','crm_local','-v','ON_ERROR_STOP=1','-At','-c',"begin read only; select coalesce(jsonb_agg(jsonb_build_object('id',id,'sku',sku,'name',name,'category',category,'description',description,'specifications',specifications)),'[]'::jsonb) from local_products; commit;"],{encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024});
assert.equal(result.status,0,result.stderr);
const json=result.stdout.split(/\r?\n/).find(line=>line.startsWith('['));assert.ok(json,'Read-only catalog JSON');
const rows=JSON.parse(json),{suggestProductSupply,isLaborProduct,SUPPLY_RULE_VERSION}=await tsImport('../server/product-fulfillment-classification.ts',import.meta.url);
const physical=rows.filter(row=>!isLaborProduct(row)),classified=physical.map(row=>({...row,suggestion:suggestProductSupply(row)}));
const split=classified.filter(row=>row.suggestion.requires_split);
const usage=classified.filter(row=>/(dùng cho|dành cho|dùng với|phù hợp với)/iu.test(row.name));
const protectors=classified.filter(row=>/bảo vệ (?:nệm|đệm)/iu.test(row.name));
const evidence={read_only:true,rule_version:SUPPLY_RULE_VERSION,total:rows.length,physical:physical.length,excluded_labor:rows.length-physical.length,
 routes:Object.fromEntries(['SEW','PURCHASE','UNCLASSIFIED'].map(route=>[route,classified.filter(row=>row.suggestion.route===route).length])),
 requires_split:split.map(({id,sku,name,category,suggestion})=>({id,sku,name,category,suggestion})),
 usage_references:{total:usage.length,split:usage.filter(row=>row.suggestion.requires_split).length,routes:Object.fromEntries(['SEW','PURCHASE','UNCLASSIFIED'].map(route=>[route,usage.filter(row=>row.suggestion.route===route).length]))},
 protectors:{total:protectors.length,split:protectors.filter(row=>row.suggestion.requires_split).length,routes:Object.fromEntries(['SEW','PURCHASE','UNCLASSIFIED'].map(route=>[route,protectors.filter(row=>row.suggestion.route===route).length]))}};
await mkdir('.local-staging-runtime/item2-baseline',{recursive:true});await writeFile('.local-staging-runtime/item2-baseline/catalog-audit-'+SUPPLY_RULE_VERSION+'.json',JSON.stringify(evidence,null,2));
console.log(JSON.stringify(evidence,null,2));
