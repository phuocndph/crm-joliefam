import type {RequirementCommandResult,RequirementDetail} from './product-labor-requirement-types';
import type {RequirementReceiptAction} from './labor-requirement-receipts';

/** Match the saved version in history; a later current version does not invalidate it. */
export function requirementResultCompatible(saved:{code:string;action:RequirementReceiptAction;result?:RequirementCommandResult},detail:RequirementDetail){
 const result=saved.result;
 if(!result||detail.code_key!==saved.code||!result.stream_id||detail.stream_id!==result.stream_id||!Number.isSafeInteger(result.stream_revision)||result.stream_revision<0||!Number.isSafeInteger(detail.stream_revision)||detail.stream_revision<result.stream_revision)return false;
 if(saved.action==='proposals'){
  if(!result.proposal_id||!Number.isSafeInteger(result.proposal_revision)||(result.proposal_revision??0)<1||!Array.isArray(detail.proposals))return false;
  const matches=detail.proposals.filter(proposal=>proposal.id===result.proposal_id&&proposal.revision===result.proposal_revision);
  return matches.length===1&&(result.proposal_hash===undefined||matches[0].content_hash===result.proposal_hash);
 }
 const action=saved.action==='approve'?'APPROVE':saved.action==='retire'?'RETIRE':null;
 if(!action||result.action!==action||result.stream_revision<1||!Array.isArray(detail.history))return false;
 const matches=detail.history.filter(event=>event.stream_id===result.stream_id&&event.version===result.stream_revision&&event.action===action);
 return matches.length===1&&(result.content_hash===undefined||matches[0].content_hash===result.content_hash);
}
