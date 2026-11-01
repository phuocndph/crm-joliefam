import {localApiUrl} from './runtime-config';
import type {RequirementCommand,RequirementCommandResult} from './product-labor-requirement-types';

export type RequirementReceiptAction='proposals'|'approve'|'retire';
export interface RequirementReceipt {
 readonly token:string;
 readonly actor:string;
 readonly backend:string;
 readonly code:string;
 readonly action:RequirementReceiptAction;
 readonly payload:RequirementCommand;
 readonly sourceDate:string;
 readonly phase:'SENDING'|'UNCERTAIN'|'COMMITTED';
 readonly result?:RequirementCommandResult;
}
export interface RequirementReceiptState {
 readonly receipt:RequirementReceipt|null;
 readonly blocked:boolean;
 readonly warning:string|null;
}
type ObjectValue=Record<string,unknown>;
interface Slot {
 actor:string;backend:string;code:string;key:string;
 state:RequirementReceiptState;
 // Only previously observed/attempted bytes may be replaced. Foreign changes fail closed.
 raw:Set<string|null>;
 listeners:Set<()=>void>;
}
interface SharedStore {realm:string;serial:number;slots:Map<string,Slot>}
const namespace='crm:requirement-receipt:v1:';
const sharedKey=Symbol.for('crm.requirement-receipts.session.v1');
const host=globalThis as typeof globalThis&{[sharedKey]?:SharedStore};
function randomRealm(){const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');}
// HMR keeps the same store, listeners and token issuer, including in old async closures.
const store=host[sharedKey]||(host[sharedKey]={realm:randomRealm(),serial:0,slots:new Map()});
function freeze<T>(value:T):T{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
const record=(value:unknown):value is ObjectValue=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
const owns=(value:ObjectValue,key:string)=>Object.prototype.hasOwnProperty.call(value,key);
const keys=(value:ObjectValue,allowed:string[],required:string[]=allowed)=>Object.keys(value).every(key=>allowed.includes(key))&&required.every(key=>owns(value,key));
const text=(value:unknown,max=200,min=1):value is string=>typeof value==='string'&&value.length>=min&&value.length<=max&&Array.from(value).every(char=>char.charCodeAt(0)>=32&&char.charCodeAt(0)!==127);
const revision=(value:unknown)=>Number.isSafeInteger(value)&&Number(value)>=0;
function date(value:unknown):value is string {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<'0001-01-01'||value>'9999-12-31')return false;
 const parsed=new Date(value+'T00:00:00.000Z');return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value;
}
function definition(value:unknown){
 if(!record(value)||!keys(value,['schema_version','disposition','stage','family','required_fields','conditional_fields','conditions']))return false;
 if(![1,2].includes(Number(value.schema_version))||typeof value.schema_version!=='number'||!['SEWING_APPLICABLE','OTHER_STAGE','NOT_APPLICABLE'].includes(String(value.disposition))||!['SEWING','CUTTING','REPAIR','NONE'].includes(String(value.stage))||value.family!==null&&!text(value.family,100))return false;
 const fields=(v:unknown)=>Array.isArray(v)&&v.length<=100&&v.every(x=>text(x,100))&&new Set(v).size===v.length;
 if(!fields(value.required_fields)||!Array.isArray(value.conditional_fields)||value.conditional_fields.length>100||!value.conditional_fields.every(v=>record(v)&&keys(v,['field','value','required'])&&text(v.field,100)&&text(v.value,200)&&fields(v.required))||!record(value.conditions)||Object.keys(value.conditions).length>100)return false;
 return Object.entries(value.conditions).every(([key,p])=>{
  if(!text(key,100)||!record(p))return false;
  if(p.op==='eq')return keys(p,['op','value'])&&text(p.value,200);
  if(p.op==='in')return keys(p,['op','values'])&&Array.isArray(p.values)&&p.values.length>0&&p.values.length<=100&&p.values.every(v=>text(v,200));
  const decimal=(v:unknown)=>typeof v==='string'&&v.length<=100&&/^-?\d+(?:\.\d+)?$/.test(v);
  return p.op==='range'&&keys(p,['op','min','max','min_inclusive','max_inclusive'],['op','min_inclusive','max_inclusive'])&&typeof p.min_inclusive==='boolean'&&typeof p.max_inclusive==='boolean'&&(p.min!==undefined||p.max!==undefined)&&(p.min===undefined||decimal(p.min))&&(p.max===undefined||decimal(p.max));
 });
}
function command(value:unknown,action:RequirementReceiptAction,code:string,sourceDate:string):value is RequirementCommand {
 if(!['proposals','approve','retire'].includes(action)||!record(value))return false;
 const common=['idempotency_key','code_key','semantic_fingerprint','source_hash','expected_stream_revision','expected_proposal_revision','reason'];
 const extra=action==='proposals'?['source_date','definition','submitted','proposal_id','create_if_no_proposals']:action==='approve'?['proposal_id','proposal_hash','effective_from','effective_to']:['effective_from'];
 const required=action==='proposals'?['source_date','definition','submitted']:action==='approve'?['proposal_id','proposal_hash','effective_from','effective_to']:['effective_from'];
 if(!keys(value,[...common,...extra],[...common,...required])||value.code_key!==code||!text(value.idempotency_key)||!text(value.semantic_fingerprint,256)||!text(value.source_hash,256)||!text(value.reason,1000,3)||!revision(value.expected_stream_revision)||!revision(value.expected_proposal_revision))return false;
 if(action==='proposals')return value.source_date===sourceDate&&definition(value.definition)&&typeof value.submitted==='boolean'&&(value.proposal_id===undefined||text(value.proposal_id))&&(value.create_if_no_proposals===undefined||value.create_if_no_proposals===true&&value.submitted===false&&value.proposal_id===undefined);
 if(!date(value.effective_from))return false;
 if(action==='retire')return value.expected_proposal_revision===0;
 return text(value.proposal_id)&&text(value.proposal_hash,256)&&(value.effective_to===null||date(value.effective_to)&&value.effective_to>=value.effective_from);
}
function result(value:unknown,action:RequirementReceiptAction):value is RequirementCommandResult {
 if(!record(value)||!text(value.stream_id)||!revision(value.stream_revision)||typeof value.reused!=='boolean')return false;
 if(action==='proposals')return keys(value,['stream_id','stream_revision','proposal_id','proposal_revision','proposal_hash','reused'],['stream_id','stream_revision','proposal_id','proposal_revision','reused'])&&text(value.proposal_id)&&revision(value.proposal_revision)&&Number(value.proposal_revision)>0&&(value.proposal_hash===undefined||text(value.proposal_hash,256));
 return keys(value,['stream_id','stream_revision','action','content_hash','reused'],['stream_id','stream_revision','action','reused'])&&Number(value.stream_revision)>0&&value.action===(action==='approve'?'APPROVE':'RETIRE')&&(value.content_hash===undefined||text(value.content_hash,256));
}
function receipt(value:unknown,slot:Slot):value is RequirementReceipt {
 if(!record(value)||!keys(value,['token','actor','backend','code','action','payload','sourceDate','phase','result'],['token','actor','backend','code','action','payload','sourceDate','phase']))return false;
 if(!text(value.token,300)||value.actor!==slot.actor||value.backend!==slot.backend||value.code!==slot.code||!['proposals','approve','retire'].includes(String(value.action))||!date(value.sourceDate)||!['SENDING','UNCERTAIN','COMMITTED'].includes(String(value.phase)))return false;
 return command(value.payload,value.action as RequirementReceiptAction,slot.code,value.sourceDate)&&(value.phase==='COMMITTED'?result(value.result,value.action as RequirementReceiptAction):!owns(value,'result'));
}
const storage=()=>globalThis.sessionStorage;
function publish(slot:Slot,next:RequirementReceiptState){slot.state=freeze(next);for(const listener of slot.listeners)listener();}
function block(slot:Slot,warning='Không lưu được trạng thái thao tác. Tạm khóa thay đổi; hãy thử khôi phục.'){
 publish(slot,{receipt:slot.state.receipt,blocked:true,warning});
}
function decode(raw:string,slot:Slot):RequirementReceipt {
 if(raw.length>131072)throw new Error('RECEIPT_TOO_LARGE');
 const wire:unknown=JSON.parse(raw);
 if(!record(wire)||!keys(wire,['version','receipt'])||wire.version!==1||!receipt(wire.receipt,slot))throw new Error('INVALID_RECEIPT');
 return freeze({...wire.receipt,...(wire.receipt.phase==='SENDING'?{phase:'UNCERTAIN' as const}:{})});
}
function validBackend(value:string){try{const url=new URL(value);return text(value,2048)&&['http:','https:'].includes(url.protocol)&&!url.username&&!url.password&&!url.search&&!url.hash;}catch{return false;}}
function getSlot(actor:string,code:string){
 let backend='';try{backend=localApiUrl();}catch{/* Invalid config is blocked; never persist raw configuration. */}
 const valid=validBackend(backend)&&text(actor)&&text(code),safeBackend=valid?backend:'INVALID_PUBLIC_BACKEND';
 const key=namespace+JSON.stringify([actor,safeBackend,code]);
 const existing=store.slots.get(key);if(existing)return existing;
 const slot:Slot={actor,backend:safeBackend,code,key,state:freeze({receipt:null,blocked:false,warning:null}),raw:new Set(),listeners:new Set()};store.slots.set(key,slot);
 if(!valid){block(slot,'Chưa xác định được kết nối hoặc tài khoản. Tạm khóa thay đổi.');return slot;}
 try{const raw=storage().getItem(key);slot.raw.add(raw);if(raw!==null)slot.state=freeze({receipt:decode(raw,slot),blocked:false,warning:null});}
 catch{block(slot,'Chưa đọc được trạng thái thao tác. Tạm khóa thay đổi để giữ nguyên yêu cầu trước.');}
 return slot;
}
function encode(value:RequirementReceipt){const raw=JSON.stringify({version:1,receipt:value});if(raw.length>131072)throw new Error('RECEIPT_TOO_LARGE');return raw;}
function persist(slot:Slot,value:RequirementReceipt|null){
 const raw=storage().getItem(slot.key);if(!slot.raw.has(raw))throw new Error('RECEIPT_CHANGED');
 const next=value?encode(value):null;
 // A failing implementation may have completed its write: retain both exact candidates.
 slot.raw.add(next);
 if(next===null)storage().removeItem(slot.key);else storage().setItem(slot.key,next);
 if(storage().getItem(slot.key)!==next)throw new Error('RECEIPT_NOT_PERSISTED');
 slot.raw=new Set([next]);
}
export const getRequirementReceipt=(actor:string,code:string)=>getSlot(actor,code).state.receipt;
export const getRequirementReceiptState=(actor:string,code:string)=>getSlot(actor,code).state;
export function subscribeRequirementReceipt(actor:string,code:string,listener:()=>void){const slot=getSlot(actor,code);slot.listeners.add(listener);return()=>{slot.listeners.delete(listener);};}

/** Explicit storage recovery only. It never sends a request or silently discards bytes. */
export function recoverRequirementReceiptStorage(actor:string,code:string){
 const slot=getSlot(actor,code);if(slot.backend==='INVALID_PUBLIC_BACKEND')return false;
 try{
  const raw=storage().getItem(slot.key);
  if(slot.raw.size===0){slot.raw.add(raw);const value=raw===null?null:decode(raw,slot);publish(slot,{receipt:value,blocked:false,warning:null});return true;}
  if(!slot.raw.has(raw))throw new Error('RECEIPT_CHANGED');
  if(!slot.state.receipt&&raw!==null){const value=decode(raw,slot);publish(slot,{receipt:value,blocked:false,warning:null});return true;}
  persist(slot,slot.state.receipt);publish(slot,{receipt:slot.state.receipt,blocked:false,warning:null});return true;
 }catch{block(slot);return false;}
}
/** Persist before exposing a sendable command. Retries use only the frozen original. */
export function beginRequirementReceipt(actor:string,code:string,action:RequirementReceiptAction,payload:RequirementCommand,sourceDate:string,retry?:RequirementReceipt){
 const slot=getSlot(actor,code),current=slot.state.receipt;
 if(slot.state.blocked||current&&(!retry||current!==retry||current.phase!=='UNCERTAIN')||!current&&retry)return null;
 const original=current&&retry?current:{action,payload,sourceDate};
 if(!date(original.sourceDate)||!command(original.payload,original.action,code,original.sourceDate)){publish(slot,{receipt:current,blocked:!!current,warning:'Nội dung yêu cầu chưa hợp lệ. Chưa gửi; hãy kiểm tra và sửa nội dung.'});return null;}
 const next=freeze({token:store.realm+':'+(++store.serial),actor,backend:slot.backend,code,action:original.action,payload:structuredClone(original.payload),sourceDate:original.sourceDate,phase:'SENDING' as const});
 try{persist(slot,next);publish(slot,{receipt:next,blocked:false,warning:null});return next;}
 catch{publish(slot,{receipt:freeze({...next,phase:'UNCERTAIN' as const}),blocked:true,warning:'Chưa gửi yêu cầu vì không lưu được trạng thái. Nội dung vẫn được giữ; hãy thử khôi phục.'});return null;}
}
export function transitionRequirementReceipt(saved:RequirementReceipt,phase:'UNCERTAIN'|'COMMITTED',response?:RequirementCommandResult){
 const slot=getSlot(saved.actor,saved.code),current=slot.state.receipt;
 if(current!==saved||current.phase!=='SENDING'||saved.backend!==slot.backend)return null;
 if(phase==='COMMITTED'&&!result(response,saved.action)){
  const uncertain=freeze({...current,phase:'UNCERTAIN' as const});
  try{persist(slot,uncertain);publish(slot,{receipt:uncertain,blocked:false,warning:'Phản hồi chưa hợp lệ; cần kiểm tra lại đúng yêu cầu đã gửi.'});}
  catch{publish(slot,{receipt:uncertain,blocked:true,warning:'Chưa xác định được kết quả và chưa lưu được trạng thái thao tác. Tạm khóa thay đổi.'});}
  return null;
 }
 const next=freeze({...current,phase,...(phase==='COMMITTED'?{result:structuredClone(response!)}:{})});
 try{persist(slot,next);publish(slot,{receipt:next,blocked:false,warning:null});return next;}
 catch{publish(slot,{receipt:next,blocked:true,warning:phase==='COMMITTED'?'Đã ghi nhận trên máy chủ nhưng chưa lưu được trạng thái thao tác. Hãy khôi phục trước khi tải kết quả.':'Chưa xác định kết quả và chưa lưu được trạng thái thao tác. Đã giữ nguyên yêu cầu và tạm khóa thay đổi.'});return null;}
}
export function clearRequirementReceipt(saved:RequirementReceipt){
 const slot=getSlot(saved.actor,saved.code);
 if(slot.state.blocked||slot.state.receipt!==saved||saved.backend!==slot.backend)return false;
 try{persist(slot,null);publish(slot,{receipt:null,blocked:false,warning:null});return true;}
 catch{block(slot,'Chưa kết thúc được thao tác đã đối chiếu. Tạm khóa thay đổi; hãy thử khôi phục.');return false;}
}
