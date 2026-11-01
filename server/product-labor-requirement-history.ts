// Pure history presentation only. This never selects or approves a requirement.
import {productDigest} from './product-catalog-snapshot.js';
import {laborRequirementSeedHash,laborRequirementSeedManifest} from './product-labor-requirement-seeds.js';

type Row=Record<string,unknown>;
export type LaborRequirementHistoryOrigin='TECHNICAL_INSTALL_TEMPLATE'|'SYSTEM_INSTALL_QUARANTINE'|'USER_EVENT';
export const installationQuarantineActor='SYSTEM_INSTALL_QUARANTINE';
export const installationQuarantineReason='Tạm ngưng mẫu kỹ thuật do cài đặt: chưa xác nhận phê duyệt nghiệp vụ của người có trách nhiệm; chờ cấu hình và duyệt theo quy trình.';
export const installationQuarantineEventIds:Readonly<Record<string,string>>=Object.freeze({
 vgo:'ede69329-8b84-47a0-a962-196459f0d13d',vgol:'68587073-2dc8-4e31-9f23-61b07bfcf73a',vgolb:'d25df346-f029-4542-99c9-fd0aeb4214f4',
 gcl:'c4bf1f0e-73cb-4ee0-8f86-8ebc77e38bc6',gclc:'f28214e7-6059-4d01-924d-b9f9182ad090',gcll:'a2d7f4d6-c7f6-4bf7-9946-72f14dad4f28',
 gcb1:'e19b91d3-4333-4146-a4d2-f78f4b818844',gcb1c:'8c26e912-36a6-46bd-a2ff-8e8bd4ac274f',chm:'5592c9ec-15d8-4059-9864-5823730e0abf',chanhecm:'02741cc2-afbf-4094-845e-57bf377c2fd4'
});
const uuid=/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
const timestamp=(value:unknown)=>value instanceof Date?Number.isFinite(value.getTime()):typeof value==='string'&&value.length>0&&Number.isFinite(Date.parse(value));
export function laborRequirementHistoryOrigin(row:Row,stream:Row|undefined):LaborRequirementHistoryOrigin{
 const seed=laborRequirementSeedManifest.find(entry=>entry.code_key===stream?.code_key);
 if(!seed||productDigest(laborRequirementSeedManifest)!==laborRequirementSeedHash||stream?.id!==seed.stream_id||stream.created_by!=='REVIEWED_SEED'||!timestamp(stream.created_at)
  ||row.stream_id!==seed.stream_id||!uuid.test(String(row.id))||!timestamp(row.created_at)
  ||row.effective_from!==seed.effective_from||row.effective_to!==null
  ||row.semantic_fingerprint!==seed.semantic_fingerprint||row.content_hash!==seed.content_hash||productDigest(row.definition)!==productDigest(seed.definition)
  ||row.legacy_id!==seed.legacy_id||row.legacy_version!==seed.legacy_version||row.seed_manifest_hash!==laborRequirementSeedHash||row.proposal_id!==null||row.proposal_revision!==null)return'USER_EVENT';
 if(row.version===1&&row.action==='APPROVE'&&row.author_id==='REVIEWED_SEED'&&row.reviewer_id==='REVIEWED_SEED'&&row.reason==='Nhập đúng mười hợp đồng đã được rà soát')return'TECHNICAL_INSTALL_TEMPLATE';
 if(row.version===2&&row.action==='RETIRE'&&row.id===installationQuarantineEventIds[seed.code_key]&&row.author_id===installationQuarantineActor&&row.reviewer_id===installationQuarantineActor&&row.reason===installationQuarantineReason)return'SYSTEM_INSTALL_QUARANTINE';
 return'USER_EVENT';
}
export const laborRequirementHistoryProjection=(row:Row,stream:Row|undefined,admin=false)=>({
 stream_id:row.stream_id,version:row.version,action:row.action,effective_from:row.effective_from,effective_to:row.effective_to,
 semantic_fingerprint:row.semantic_fingerprint,definition:row.definition,content_hash:row.content_hash,history_origin:laborRequirementHistoryOrigin(row,stream),
 ...(admin?{author_id:row.author_id,reviewer_id:row.reviewer_id,reason:row.reason,proposal_id:row.proposal_id,proposal_revision:row.proposal_revision,created_at:row.created_at}:{})
});
