import type {LaborCoverageInventory,RequirementAuthoringSchema,RequirementCommand,RequirementCommandResult,RequirementDetail} from './product-labor-requirement-types';
import {suggestLaborRequirementFromName} from './labor-requirement-name-suggestion';
import {beginRequirementReceipt,clearRequirementReceipt,getRequirementReceiptState,transitionRequirementReceipt,type RequirementReceipt} from './labor-requirement-receipts';
import {requirementResultCompatible} from './labor-requirement-reconciliation';

type Source=LaborCoverageInventory['rows'][number];
export function bulkDraftEligible(source:Pick<Source,'code'|'name'|'unit'|'source_status'|'coverage_status'>,schema:RequirementAuthoringSchema){
 const suggestion=suggestLaborRequirementFromName(source,schema);
 return schema.schema_version===2&&source.unit==='PIECE'&&source.coverage_status==='PENDING'&&source.source_status==='AVAILABLE'&&!!suggestion.definition&&suggestion.warnings.length===0&&suggestion.unresolved.length===0;
}
export function bulkDraftSourceMatches(source:Source,detail:RequirementDetail){
 return source.code_key===detail.code_key&&source.code===detail.code&&source.name===detail.name&&source.unit===detail.unit&&source.semantic_fingerprint===detail.semantic_fingerprint;
}
export const bulkDraftReceipts={state:getRequirementReceiptState,begin:beginRequirementReceipt,transition:transitionRequirementReceipt,clear:clearRequirementReceipt};
type Dependencies={
 detail:(code:string,date:string)=>Promise<RequirementDetail>;
 validate:(definition:NonNullable<RequirementCommand['definition']>,semantic:string)=>Promise<{definition:NonNullable<RequirementCommand['definition']>}>;
 save:(payload:RequirementCommand)=>Promise<RequirementCommandResult>;
 assertCurrent:()=>void;
 isDefinitiveRejection?:(error:unknown)=>boolean;
 receipts?:typeof bulkDraftReceipts;
 newKey?:()=>string;
};
/** Each command is durably recorded before send; an unresolved row stops the batch. */
export async function runLaborBulkDrafts(actor:string,date:string,sources:Source[],schema:RequirementAuthoringSchema,deps:Dependencies){
 const receipts=deps.receipts||bulkDraftReceipts;
 let saved=0,skipped=0;
 const seen=new Set<string>();
 for(const source of sources){
  let pending:RequirementReceipt|null=null,sent=false;
  try{
   deps.assertCurrent();
   if(seen.has(source.code_key)||!bulkDraftEligible(source,schema)){skipped++;continue;}seen.add(source.code_key);
   let state=receipts.state(actor,source.code_key);
   if(state.receipt||state.blocked){skipped++;continue;}
   const detail=await deps.detail(source.code_key,date);deps.assertCurrent();
   if(!bulkDraftSourceMatches(source,detail)||!bulkDraftEligible(detail,schema)||detail.proposals.length||detail.requirement){skipped++;continue;}
   const suggestion=suggestLaborRequirementFromName(detail,schema);
   const validation=await deps.validate(suggestion.definition!,detail.semantic_fingerprint);deps.assertCurrent();
   if(validation.definition.schema_version!==schema.schema_version)throw new Error('Bộ đặc điểm trả về đã thay đổi. Chưa gửi dòng mới.');
   state=receipts.state(actor,source.code_key);if(state.receipt||state.blocked){skipped++;continue;}
   const payload:RequirementCommand={idempotency_key:(deps.newKey||(()=>crypto.randomUUID()))(),code_key:detail.code_key,semantic_fingerprint:detail.semantic_fingerprint,source_hash:detail.source_hash,expected_stream_revision:detail.stream_revision,expected_proposal_revision:0,source_date:date,definition:validation.definition,submitted:false,create_if_no_proposals:true,reason:'Tạo bản nháp từ tên Excel đã đối chiếu; quản lý kiểm tra trước khi gửi duyệt.'};
   pending=receipts.begin(actor,source.code_key,'proposals',payload,date);
   if(!pending)return {saved,skipped,stopped:source,error:'Chưa lưu được biên nhận. Mở mã để khôi phục trước khi tiếp tục.'};
   deps.assertCurrent();sent=true;
   const result=await deps.save(pending.payload);
   const committed=receipts.transition(pending,'COMMITTED',result);
   if(!committed)return {saved,skipped,stopped:source,error:'Chưa xác nhận được biên nhận. Mở mã để kiểm tra đúng yêu cầu đã gửi.'};
   deps.assertCurrent();
   const fresh=await deps.detail(source.code_key,date);deps.assertCurrent();
   if(!requirementResultCompatible(committed,fresh)||!receipts.clear(committed))return {saved,skipped,stopped:source,error:'Đã lưu nhưng chưa đối chiếu xong. Mở mã để tải lại kết quả.'};
   saved++;
  }catch(error){
   let definitive=false;
   try{deps.assertCurrent();definitive=!!deps.isDefinitiveRejection?.(error);}catch{/* A changed actor cannot disprove a write. */}
   if(pending&&receipts.state(actor,source.code_key).receipt===pending){if(sent&&!definitive)receipts.transition(pending,'UNCERTAIN');else receipts.clear(pending);}
   return {saved,skipped,stopped:source,error:error instanceof Error?error.message:'Chưa xác định được kết quả. Mở mã để kiểm tra.'};
  }
 }
 return {saved,skipped,stopped:null,error:null};
}
