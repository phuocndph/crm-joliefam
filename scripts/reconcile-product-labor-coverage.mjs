// Saved JSON evidence only. No DB client, source writes, URL fetch or approvals.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {tsImport} from 'tsx/esm/api';
const {productDigest}=await tsImport('../server/product-catalog-snapshot.ts',import.meta.url);
const {codeKey,laborSemanticFingerprint}=await tsImport('../server/product-labor-resolver.ts',import.meta.url);
const {coverageStatuses,laborCoverageSources}=await tsImport('../server/product-labor-coverage.ts',import.meta.url);
export const historicalLaborSourceHash='1223bd781413f388d7c004129545fee840fb9441915e7e80ffbac8bd83105cc3';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const sorted=values=>[...new Set(values)].sort();
export function savedCoverageSnapshot(value,sourceHash,at){
 assert.match(at,/^\d{4}-\d{2}-\d{2}$/);
 if(value.inventory_schema_version===1){
  const {generated_at,inventory_hash,...evidence}=value;void generated_at;
  assert.equal(productDigest(evidence),inventory_hash,'Saved inventory hash mismatch');
  assert.equal(value.date,at,'Compare inventories at the same source date');
  assert.ok(Array.isArray(value.rows)&&Array.isArray(value.source_issues));
  const keys=value.rows.map(row=>codeKey(row.code_key));assert.ok(keys.every(Boolean));assert.equal(new Set(keys).size,keys.length,'Duplicate canonical identity in inventory');
  assert.equal(value.counts.canonical_codes,keys.length);assert.equal(coverageStatuses.reduce((n,status)=>n+value.counts[status],0),keys.length);
  const sources=[...value.rows.flatMap(row=>row.provenance),...value.source_issues.filter(row=>!row.code_key)],ids=sources.map(row=>row.rate_id);assert.equal(new Set(ids).size,ids.length,'Duplicate source identity');assert.equal(sources.length,value.counts.source_rows);assert.equal(value.source_issues.filter(row=>!row.code_key).length,value.counts.blank_rows);
  return {kind:'SAVED_INVENTORY',source_sha256:sourceHash,inventory_hash,date:at,counts:value.counts,excluded_sources:[],source_accounting:sources.map(row=>({rate_id:row.rate_id,code_key:row.code_key,included:true,reason:'APPROVED_SOURCE'})),issues:value.source_issues.map(row=>({rate_id:row.rate_id,code_key:row.code_key,reasons:row.reasons})),rows:value.rows.map(row=>{assert.ok(coverageStatuses.includes(row.coverage_status));const active=row.provenance.filter(source=>source.temporal_status==='CURRENT'),sources=active.length?active:row.provenance;return {code_key:codeKey(row.code_key),semantics:sorted(sources.map(source=>source.semantic_fingerprint)),coverage_status:row.coverage_status,requirement:row.requirement?{stream_id:row.requirement.stream_id,version:row.requirement.version,content_hash:row.requirement.content_hash,effective_from:row.requirement.effective_from,effective_to:row.requirement.effective_to}:null,provenance:row.provenance};})};
 }
 // The only legacy input is the exact recorded snapshot, not arbitrary live SQL
 // output. Preserve all raw rows, including the retired blank source exclusion.
 assert.equal(sourceHash,historicalLaborSourceHash,'Unrecognized historical JSON; expected pinned saved source');
 assert.ok(value.read_only&&Array.isArray(value.rates));assert.equal(value.rates.length,130);
 const raw=value.rates,eligible=raw.filter(row=>row.status==='APPROVED'),groups=new Map();
 for(const row of eligible){const key=codeKey(row.piece_rate_code);if(key){const group=groups.get(key)||[];group.push(row);groups.set(key,group);}}
 const rows=[...groups].map(([key,history])=>{const active=history.filter(row=>String(row.effective_from)<=at&&(!row.effective_to||String(row.effective_to)>=at)),values=active.length?active:history;return {code_key:key,semantics:sorted(values.map(row=>laborSemanticFingerprint(row.piece_rate_code,row.piece_rate_name,row.rate_unit))),coverage_status:'NOT_ASSESSED',requirement:undefined,provenance:laborCoverageSources(history,at)};});
 assert.equal(groups.size,126);assert.equal(raw.filter(row=>!codeKey(row.piece_rate_code)).length,4);assert.equal(eligible.length,129);assert.equal(eligible.filter(row=>!codeKey(row.piece_rate_code)).length,3);
 return {kind:'PINNED_HISTORICAL_RAW_SOURCE',source_sha256:sourceHash,date:at,counts:{raw_source_rows:raw.length,raw_canonical_codes:new Set(raw.map(row=>codeKey(row.piece_rate_code)).filter(Boolean)).size,raw_blank_rows:4,eligible_source_rows:eligible.length,eligible_canonical_codes:rows.length,eligible_blank_rows:3,excluded_source_rows:raw.length-eligible.length},source_accounting:raw.map(row=>({rate_id:String(row.id),code_key:codeKey(row.piece_rate_code)||null,included:row.status==='APPROVED',reason:row.status==='APPROVED'?'APPROVED_SOURCE':'EXCLUDED_SOURCE_STATUS_'+String(row.status)})),excluded_sources:raw.filter(row=>row.status!=='APPROVED').map(row=>({rate_id:String(row.id),code_key:codeKey(row.piece_rate_code)||null,reason:'EXCLUDED_SOURCE_STATUS_'+String(row.status)})),issues:eligible.filter(row=>!codeKey(row.piece_rate_code)).map(row=>({rate_id:String(row.id),code_key:null,reasons:['BLANK_CODE']})),rows};
}
export function reconcileCoverage(oldSnapshot,newSnapshot){
 const oldByKey=new Map(oldSnapshot.rows.map(row=>[row.code_key,row])),newByKey=new Map(newSnapshot.rows.map(row=>[row.code_key,row]));
 const rows=sorted([...oldByKey.keys(),...newByKey.keys()]).map(code_key=>{const before=oldByKey.get(code_key),after=newByKey.get(code_key),changes=[];
  if(!before)changes.push('ADDED');else if(!after)changes.push('MISSING');else{
   if(JSON.stringify(before.semantics)!==JSON.stringify(after.semantics))changes.push('SEMANTIC_CHANGED');
   if(['CONFLICT','INCOMPLETE','SOURCE_EXPIRED'].includes(after.coverage_status))changes.push('SOURCE_PROBLEM');
   if(before.requirement!==undefined&&productDigest(before.requirement)!==productDigest(after.requirement))changes.push('REQUIREMENT_CHANGED');
  }
  if(!changes.length)changes.push('UNCHANGED');
  return {code_key,classification:changes[0],changes,before_semantics:before?.semantics||[],after_semantics:after?.semantics||[],before_requirement:before?.requirement||null,after_requirement:after?.requirement||null,requirement_comparison:before?.requirement===undefined?'NOT_ASSESSED':'COMPARED',provenance:after?.provenance||before?.provenance||[],review_completion_inherited:false,unresolved_business_owner:null,unresolved_business_evidence:null,mapping_status:'NOT_ASSESSED',pay_ready:false};
 });
 const counts=Object.fromEntries(['UNCHANGED','ADDED','MISSING','SEMANTIC_CHANGED','SOURCE_PROBLEM','REQUIREMENT_CHANGED'].map(key=>[key,rows.filter(row=>row.classification===key).length]));
 return {reconciliation_schema_version:1,date:newSnapshot.date,generated_at:new Date().toISOString(),saved_json_only:true,no_live_database:true,no_business_approvals:true,before:{...oldSnapshot,rows:undefined},after:{...newSnapshot,rows:undefined},counts,rows};
}
async function main(){
 const args=process.argv.slice(2),options={};for(let n=0;n<args.length;n+=2){assert.ok(['--old','--new','--out'].includes(args[n])&&args[n+1]&&!options[args[n]],'Use --old saved.json --new inventory.json --out .local-staging-runtime/evidence.json');options[args[n]]=args[n+1];}
 assert.ok(options['--old']&&options['--new']&&options['--out']);
 const filenames=['--old','--new'].map(key=>{const name=options[key];assert.ok(!/^[a-z]+:\/\//i.test(name)&&path.extname(name).toLowerCase()==='.json','Saved local JSON files only');return path.resolve(name);});
 const output=path.resolve(options['--out']),staging=path.resolve('.local-staging-runtime');assert.ok(output.startsWith(staging+path.sep)&&!filenames.includes(output),'Output must be a new staging evidence file');
 const bytes=await Promise.all(filenames.map(file=>readFile(file)));assert.ok(bytes.every(value=>value.length<20*1024*1024),'Saved JSON bound20MB');const values=bytes.map(value=>JSON.parse(value));assert.equal(values[1].inventory_schema_version,1,'New input must be an inventory export');
 const snapshots=values.map((value,index)=>savedCoverageSnapshot(value,hash(bytes[index]),values[1].date)),result=reconcileCoverage(...snapshots);await mkdir(path.dirname(output),{recursive:true});await writeFile(output,JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify({saved_json_only:true,rows:result.rows.length,counts:result.counts,output:path.relative(process.cwd(),output)}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
