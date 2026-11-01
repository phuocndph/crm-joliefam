import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {laborRequirementSeedManifest,laborRequirementSeedHash} from '../server/product-labor-requirement-seeds.js';
import {productDigest} from '../server/product-catalog-snapshot.js';
import {laborRequirementHistoryOrigin,laborRequirementHistoryProjection,installationQuarantineEventIds,installationQuarantineActor,installationQuarantineReason} from '../server/product-labor-requirement-history.js';

let assertions=0;
const equal=(actual:unknown,expected:unknown)=>{assert.deepEqual(actual,expected);assertions++;};
equal(productDigest(laborRequirementSeedManifest),laborRequirementSeedHash);
const migration=readFileSync(new URL('../server/db/migrations/077_local_labor_requirement_seed_quarantine.sql',import.meta.url),'utf8');
const manifest=JSON.parse(migration.split('$manifest$')[1]) as Array<{code_key:string;quarantine_event_id:string}>;
equal(manifest.length,10);
equal(installationQuarantineReason,'Tạm ngưng mẫu kỹ thuật do cài đặt: chưa xác nhận phê duyệt nghiệp vụ của người có trách nhiệm; chờ cấu hình và duyệt theo quy trình.');
equal(installationQuarantineActor,'SYSTEM_INSTALL_QUARANTINE');
for(const seed of laborRequirementSeedManifest){
 const stream={id:seed.stream_id,code_key:seed.code_key,created_by:'REVIEWED_SEED',created_at:new Date('2026-10-29T00:00:00Z')};
 const v1={...seed,id:'00000000-0000-4000-8000-000000000001',version:1,action:'APPROVE',effective_to:null,author_id:'REVIEWED_SEED',reviewer_id:'REVIEWED_SEED',reason:'Nhập đúng mười hợp đồng đã được rà soát',proposal_id:null,proposal_revision:null,seed_manifest_hash:laborRequirementSeedHash,created_at:new Date('2026-10-29T00:00:00Z')};
 const v2={...v1,id:installationQuarantineEventIds[seed.code_key],version:2,action:'RETIRE',author_id:installationQuarantineActor,reviewer_id:installationQuarantineActor,reason:installationQuarantineReason};
 equal(v2.id,manifest.find(entry=>entry.code_key===seed.code_key)!.quarantine_event_id);
 equal(laborRequirementHistoryOrigin(v1,stream),'TECHNICAL_INSTALL_TEMPLATE');
 equal(laborRequirementHistoryOrigin(v2,stream),'SYSTEM_INSTALL_QUARANTINE');
 for(const [field,value] of Object.entries({id:'bad',stream_id:'00000000-0000-4000-8000-000000000001',version:3,action:'APPROVE',effective_from:'2026-10-29',effective_to:'2026-10-30',semantic_fingerprint:'0'.repeat(64),content_hash:'0'.repeat(64),definition:{...seed.definition,family:'OTHER'},legacy_id:'other',legacy_version:'other',seed_manifest_hash:'0'.repeat(64),proposal_id:'00000000-0000-4000-8000-000000000001',proposal_revision:1,author_id:'admin',reviewer_id:'admin',reason:'SYSTEM_INSTALL_QUARANTINE',created_at:'infinity'}))equal(laborRequirementHistoryOrigin({...v2,[field]:value},stream),'USER_EVENT');
 for(const [field,value] of Object.entries({id:'wrong',code_key:'unknown',created_by:'manager',created_at:'infinity'}))equal(laborRequirementHistoryOrigin(v2,{...stream,[field]:value}),'USER_EVENT');
 for(const event of [v1,v2,{...v2,version:3,proposal_id:'00000000-0000-4000-8000-000000000001',proposal_revision:1,seed_manifest_hash:null,legacy_id:null,legacy_version:null,author_id:'manager',reviewer_id:'admin'}]){
  const manager=laborRequirementHistoryProjection(event,stream,false),admin=laborRequirementHistoryProjection(event,stream,true);
  equal(manager.history_origin,admin.history_origin);
  for(const key of ['author_id','reviewer_id','reason','proposal_id','proposal_revision','created_at','legacy_id','legacy_version','seed_manifest_hash'])equal(Object.hasOwn(manager,key),false);
  equal(admin.author_id,event.author_id);
 }
 equal(laborRequirementHistoryOrigin({...v2,id:'00000000-0000-4000-8000-000000000001'},stream),'USER_EVENT');
 equal(laborRequirementHistoryOrigin(v1,undefined),'USER_EVENT');
}
console.log(JSON.stringify({status:'PASS',assertions,source_calls:0,source_writes:0,bootstrap_started:false}));
