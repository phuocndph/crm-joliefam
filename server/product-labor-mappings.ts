import type express from 'express';
import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {pool} from './db/bootstrap.js';
import {productDigest,productEffectiveOwner,rawProductFingerprint} from './product-catalog-snapshot.js';
import {productSupplySelection,productSupplyFingerprint,isLaborProduct} from './product-fulfillment-classification.js';
import {currentTechnicalProfile,currentTechnicalProfiles,technicalProfileStatus} from './product-technical-profiles.js';
import {LABOR_CONTRACT_VERSION,codeKey,semanticText,laborSemanticFingerprint,scaledDecimal,normalizedLaborFacts,conditionsFromFacts,validateLaborConditions,laborConditionsMatch,laborCandidateState,legacyLaborCandidatePotential,missingLaborFacts,effectiveLaborVersions,latestLaborEvents,laborContractName,type LaborRow,type LaborConditions} from './product-labor-resolver.js';
import {canonicalLaborCatalog,requirementAllows,requirementSnapshotMatches} from './product-labor-requirements.js';
import {FACT_PROJECTION_V2,versionedLaborFacts,knownV2Extensions,missingVersionedLaborFacts,versionedConditionsFromFacts,validateVersionedLaborConditions,versionedLaborConditionsMatch,snapshotFactVersion,versionedCandidateState} from './product-labor-facts-versioned.js';
import {payrollCapability} from './permission-policy.js';

type DB=Pick<PoolClient,'query'>;
async function laborReadSnapshot<T>(work:(client:PoolClient)=>Promise<T>){const client=await pool.connect();try{await client.query('begin isolation level repeatable read read only');const result=await work(client);await client.query('commit');return result;}catch(error){await client.query('rollback');throw error;}finally{client.release();}}
type Dependencies={actor:()=>string;role:()=>string;capability:(write:boolean)=>Promise<void>;transaction:<T>(fn:(c:PoolClient)=>Promise<T>)=>Promise<T>;sendError:(r:express.Response,e:unknown)=>void};
const fail=(message:string,status=400):never=>{throw Object.assign(new Error(message),{status});};
const obj=(v:unknown):LaborRow=>v&&typeof v==='object'&&!Array.isArray(v)?v as LaborRow:{};
const uuid=/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
const searchText=(v:unknown)=>semanticText(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d');
const dateKey=(v:unknown)=>{const s=String(v||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||Number.isNaN(Date.parse(s+'T00:00:00Z'))||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s)fail('Ngày hiệu lực không hợp lệ.');return s;};
const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Ho_Chi_Minh'});
const factNames:Record<string,string>={manufacturing_type:'loại hàng',material:'chất liệu',pillow_subtype:'loại gối',microfiber_weight:'loại Microfiber',joining:'can nối',joining_detail:'kiểu can',quilting:'chần',topstitch:'diễu',elastic:'chun',elastic_type:'kiểu chun',straps:'đai',closure:'kiểu đóng',sewing_method:'phương pháp may',waterproof:'chống thấm',ruffle:'bèo',width_mm:'chiều rộng',length_mm:'chiều dài',height_mm:'chiều cao'};
export async function laborCatalog(db:DB,date:string){return (await canonicalLaborCatalog(db,date)).rows;}
type ContextSources={product:LaborRow;technical:Awaited<ReturnType<typeof currentTechnicalProfile>>;classification:LaborRow|undefined};
async function context(db:DB,id:string,lock=false,sources?:ContextSources){
 if(!uuid.test(id))fail('Sản phẩm không hợp lệ.');
 if(lock){const p=(await db.query('select price_list_id from local_products where id=$1 for update',[id])).rows[0];if(p?.price_list_id)await db.query('select id from local_price_lists where id=$1 for share',[p.price_list_id]);}
 const found=sources?.product||(await db.query(productSupplySelection+' where p.id=$1',[id])).rows[0] as LaborRow|undefined;if(!found||isLaborProduct(found))return fail('Không tìm thấy sản phẩm vật lý.',404);const product:LaborRow=found;
 const technical=sources?.technical||await currentTechnicalProfile(db,id,lock),classification=sources?sources.classification:(await db.query('select * from local_product_supply_classifications where product_id=$1 order by version desc limit 1',[id])).rows[0];
 const rawfp=rawProductFingerprint(product),supplyfp=productSupplyFingerprint(product),technicalStatus=technicalProfileStatus(technical.profile,rawfp,technical.confirmed),owner=productEffectiveOwner(product);
 let gate='READY',reason='Đủ căn cứ để xét mã may.';
 if(product.is_active!==true){gate='PRODUCT_INACTIVE';reason='Sản phẩm đang ngừng dùng.';}
 else if(!classification||classification.source_fingerprint!==supplyfp||classification.route==='UNCLASSIFIED'){gate='SUPPLY_REVIEW';reason='Cần xác nhận lại cách đáp ứng sản phẩm.';}
 else if(classification.route==='PURCHASE'){gate='NOT_APPLICABLE';reason='Hàng nhập sẵn không gán mã may.';}
 else if(technicalStatus!=='CONFIRMED'){gate='TECHNICAL_REVIEW';reason='Cần hồ sơ kỹ thuật hiện hành đã xác nhận.';}
 let facts:Record<string,string|null>={},legacyFacts:Record<string,string|null>={},factVersion:1|2=1;if(gate==='READY'&&technical.profile)try{const normalized=versionedLaborFacts(technical.profile);facts=normalized.facts;legacyFacts=normalized.legacyFacts;factVersion=normalized.version;}catch{gate='TECHNICAL_REVIEW';reason='Kích thước hoặc đơn vị chưa hợp lệ.';}
 if(gate==='READY')try{const missing=missingVersionedLaborFacts(factVersion,facts);if(missing.length){gate='MISSING_FACTS';reason='Thiếu đặc điểm: '+missing.map(key=>factNames[key]||'đặc điểm kỹ thuật').join(', ');}}catch(error){gate='UNSUPPORTED';reason=error instanceof Error?error.message:'Chưa hỗ trợ loại hàng.';}
 const proof={product_id:id,raw_source_fingerprint:rawfp,owner,classification_version:Number(classification?.version||0),classification_fingerprint:supplyfp,technical_profile_id:technical.profile?.id||null,technical_revision:technical.revision,technical_confirmed_version:obj(obj(technical.profile?.extra_dimensions).technical_attributes).confirmed_version||null,technical_status:technicalStatus,facts};
 return {product:{id,name:product.name,sku:product.sku,price_list_name:product.price_list_name},owner,gate,reason,facts,fact_schema_version:factVersion,legacy_facts:legacyFacts,legacy_context_fingerprint:productDigest({product_id:id,raw_source_fingerprint:rawfp,owner,classification_fingerprint:supplyfp,facts:legacyFacts}),template_conditions:gate==='READY'?versionedConditionsFromFacts(factVersion,facts):{},proof,source_fingerprint:productDigest(proof),context_fingerprint:productDigest({product_id:id,raw_source_fingerprint:rawfp,owner,classification_fingerprint:supplyfp,facts}),facts_fingerprint:productDigest(facts)};
}
const allVersions=async(db:DB)=>(await db.query("select v.*,v.effective_from::text,v.effective_to::text,d.kind,d.product_id,d.owner_id,p.name template_product_name from local_labor_mapping_versions v join local_labor_mapping_decisions d on d.id=v.decision_id left join local_products p on p.id::text=v.snapshot->>'template_product_id' order by v.version")).rows as LaborRow[];
const scope=(owner:string,actor:string,role:string,write=false)=>{if(role==='admin')return;if(owner&&owner!==actor)fail('Không tìm thấy dữ liệu trong phạm vi phụ trách.',404);if(write&&!owner)fail('Dữ liệu dùng chung chỉ quản trị viên được sửa.',403);};
const visible=(row:LaborRow,actor:string,role:string)=>role==='admin'||!row.owner_id||row.owner_id===actor;
type ResolutionTrace={candidates:LaborRow[];missing_fact_keys:string[];ownership_review:boolean};
export const laborIssues=['SUPPLY_REVIEW','TECHNICAL_REVIEW','MISSING_FACTS','UNMAPPED','AMBIGUOUS','EXPIRED_REVIEW','CONTRACT_REVIEW','CODE_REVIEW','CODE_REQUIREMENTS_REVIEW','UNSUPPORTED','ADMIN_REVIEW','REVIEW','OVERRIDE_REVIEW'] as const;
type LaborIssue=typeof laborIssues[number];
const issueOf=(row:{code_status:string;read_only:boolean;ownership_review:boolean}):LaborIssue|null=>row.code_status==='REVIEW'&&row.read_only&&row.ownership_review?'ADMIN_REVIEW':laborIssues.includes(row.code_status as LaborIssue)?row.code_status as LaborIssue:null;
// Queue rows need only current target facts and code summary, never a rule's
// writable decision handle. Detailed candidate access is checked separately.
const queueRow=(row:Awaited<ReturnType<typeof resolveProductLaborCode>>)=>({...row,match:row.match?Object.fromEntries(['piece_rate_code','piece_rate_name','labor_unit','source_unit','conversion_factor','conversion_confirmed','code_semantic_fingerprint','requirement_id','requirement_version','requirement_content_hash','conditions'].map(key=>[key,row.match![key]])):null});
async function resolveLaborCodeSnapshot(db:DB,id:string,date:string,actor:string,role:string,override=false,versions?:LaborRow[],catalog?:Awaited<ReturnType<typeof laborCatalog>>|(()=>Promise<Awaited<ReturnType<typeof laborCatalog>>>),sources?:ContextSources,trace?:ResolutionTrace,trustedDispatch=false){
  const c=await context(db,id,false,sources);if(!trustedDispatch)scope(c.owner,actor,role);const v=versions||await allVersions(db),events=effectiveLaborVersions(v,date).filter(row=>row.kind==='RULE'?(trustedDispatch?(!row.owner_id||row.owner_id===c.owner):visible(row,actor,role)&&(!row.owner_id||row.owner_id===c.owner)):row.product_id===id);
  const exactDecision=versions?(()=>{const found=versions.find(row=>row.kind==='EXACT'&&row.product_id===id);return found?{id:found.decision_id}:null;})():(await db.query("select id from local_labor_mapping_decisions where kind='EXACT' and product_id=$1",[id])).rows[0];
  const exactVersions=exactDecision?v.filter(row=>row.decision_id===exactDecision.id):[],revision=exactVersions.reduce((n,row)=>Math.max(n,Number(row.version)),0);
  const lastExactApproval=[...exactVersions].filter(row=>row.action==='APPROVE').sort((a,b)=>Number(b.version)-Number(a.version))[0],priorOwner=obj(obj(lastExactApproval?.snapshot).context).owner;
  const transferReview=!!priorOwner&&priorOwner!==c.owner;
  if(trace){trace.ownership_review=transferReview;trace.candidates=[];trace.missing_fact_keys=c.gate==='MISSING_FACTS'?missingVersionedLaborFacts(c.fact_schema_version,c.facts):[];}
  const common={...c,read_only:role!=='admin'&&(c.owner!==actor||transferReview),ownership_review:transferReview,exact_decision_id:exactDecision?.id||null,exact_revision:revision,code_status:c.gate,reason:c.reason,pay_ready:false,pay_status:'GROUP_CHECK_PENDING',match:null as LaborRow|null};
  if(c.gate!=='READY')return common;if(override)return {...common,code_status:'OVERRIDE_REVIEW',reason:'Quy cách riêng của đơn cần xác nhận trước khi gán mã.'};
  const exactLifecycle=latestLaborEvents(exactVersions,date)[0];if(exactLifecycle?.action==='APPROVE'&&exactLifecycle.effective_to&&String(exactLifecycle.effective_to)<date){if(trace)trace.candidates=[exactLifecycle];return {...common,code_status:'EXPIRED_REVIEW',reason:'Ánh xạ riêng hết hiệu lực; cần duyệt lại hoặc kết thúc để dùng quy tắc chung.'};}
  const exact=events.filter(row=>row.kind==='EXACT'),rules=events.filter(row=>row.kind==='RULE');
  if(trace)trace.candidates=exact;
  if(exact.some(row=>obj(row.snapshot).context_fingerprint!==(snapshotFactVersion(obj(row.snapshot))===1&&c.fact_schema_version===2?c.legacy_context_fingerprint:c.context_fingerprint)))return {...common,code_status:'REVIEW',reason:transferReview?'Sản phẩm đã chuyển quản lý. Quản trị viên cần xác nhận lại mã trước khi quản lý mới chỉnh sửa.':'Ánh xạ riêng đã đổi nguồn; cần xác nhận lại, không dùng quy tắc dự phòng.'};
  const candidateState=(row:LaborRow)=>versionedCandidateState(obj(row.snapshot),c.fact_schema_version,c.facts,c.legacy_facts);
  const candidates=exact.length?exact:rules.filter(row=>candidateState(row)!=='NO_MATCH');
  if(trace)trace.candidates=candidates;
  if(candidates.some(row=>candidateState(row)==='CONTRACT_REVIEW'))return {...common,code_status:'CONTRACT_REVIEW',reason:'Đặc điểm hoặc phiên bản hợp đồng cần được rà soát; không dùng quy tắc dự phòng.'};
  if(!exact.length&&candidates.some(row=>candidateState(row)==='MISSING')){if(trace)trace.missing_fact_keys=[...new Set(candidates.filter(row=>candidateState(row)==='MISSING').flatMap(row=>Object.keys(obj(obj(row.snapshot).conditions)).filter(key=>!c.facts[key]||['UNKNOWN','OTHER'].includes(String(c.facts[key])))))];return {...common,code_status:'MISSING_FACTS',reason:'Quy tắc ứng viên cần thêm đặc điểm đã xác nhận; không tự dùng quy tắc rộng hơn.'};}
  const matches=exact.length?exact:candidates.filter(row=>candidateState(row)==='MATCH');
  if(trace)trace.candidates=matches;
  if(matches.length===0)return {...common,code_status:'UNMAPPED',reason:'Chưa có ánh xạ hoặc quy tắc phù hợp.'};
  if(matches.length!==1)return {...common,code_status:'AMBIGUOUS',reason:'Có nhiều quy tắc cùng phù hợp; cần quản lý kiểm tra.'};
  const codes=typeof catalog==='function'?await catalog():catalog||await laborCatalog(db,date),row=matches[0],snapshot=obj(row.snapshot),code=codes.find(value=>value.key===codeKey(snapshot.piece_rate_code));
  if(!code||code.status!=='AVAILABLE'||code.semantic_fingerprint!==snapshot.code_semantic_fingerprint||code.unit!==snapshot.labor_unit)return {...common,code_status:'CODE_REVIEW',reason:'Mã công hết hiệu lực, thiếu nghĩa hoặc có thay đổi/mâu thuẫn tên và đơn vị.'};
  const contract=code.requirement;
  if(!contract||contract.definition.schema_version===2&&c.fact_schema_version!==2||contract.definition.schema_version===1&&c.fact_schema_version===2&&knownV2Extensions(c.facts).length>0||!requirementSnapshotMatches(snapshot,contract)||!requirementAllows(contract,c.facts,snapshot.conditions as LaborConditions))return {...common,code_status:'CODE_REQUIREMENTS_REVIEW',reason:'Mã công chưa có hợp đồng kỹ thuật phù hợp hiện hành; cần quản lý kiểm tra lại.'};
  if(!versionedLaborConditionsMatch(snapshotFactVersion(snapshot)||1,snapshot.conditions,snapshotFactVersion(snapshot)===1&&c.fact_schema_version===2?c.legacy_facts:c.facts))return {...common,code_status:'REVIEW',reason:'Dữ kiện không còn khớp hợp đồng đã duyệt.'};
  const bridge=snapshotFactVersion(snapshot)===1&&c.fact_schema_version===2;
  const publicSnapshot=row.kind==='RULE'?Object.fromEntries(Object.entries(snapshot).filter(([key])=>!['context','template_product_id','source_fingerprint','context_fingerprint','facts_fingerprint','provenance'].includes(key))):snapshot;
  return {...common,code_status:'RESOLVED',reason:row.kind==='EXACT'?'Khớp ánh xạ riêng đã duyệt.':'Khớp đúng một quy tắc đã duyệt.',match:{...publicSnapshot,product_id:id,...(bridge?{approval_snapshot:publicSnapshot,current_context:c.proof,current_source_fingerprint:c.source_fingerprint,current_context_fingerprint:c.context_fingerprint,current_facts_fingerprint:c.facts_fingerprint,current_fact_schema_version:2}:{context:c.proof,source_fingerprint:c.source_fingerprint}),decision_id:row.decision_id,decision_version:row.version,owner:row.owner_id,date,piece_rate_code:code.code,piece_rate_name:code.name,labor_unit:code.unit,contract_version:LABOR_CONTRACT_VERSION}};
 }

export async function resolveProductLaborCode(...args:Parameters<typeof resolveLaborCodeSnapshot>){const[db,...rest]=args;return db===pool?laborReadSnapshot(client=>resolveLaborCodeSnapshot(client,...rest)):resolveLaborCodeSnapshot(db,...rest);}

// Internal consumption only, called after dispatch authorization. Uses the
// product owner's rule scope without impersonating that owner or granting
// catalog configuration rights to the worker/dispatcher.
export async function resolveDispatchProductLabor(db:DB,id:string,date:string,override=false){
 const result=await resolveLaborCodeSnapshot(db,id,date,'','dispatch-consumer',override,undefined,undefined,undefined,undefined,true);
 if(result.ownership_review) return {...result,code_status:'REVIEW',reason:'Sản phẩm đã đổi người quản lý; cần đối soát ánh xạ trước khi giao việc.',match:null};
 return result;
}

export async function assertLaborMappingAuthority(db:DB,actor:string,requestRole:string){
 if(!actor)fail('Cần đăng nhập.',401);
 const current=(await db.query(`select r.role,array(select permission_type from local_employee_permissions where user_id=p.user_id and enabled) grants
  from local_user_profiles p join local_user_roles r on r.user_id=p.user_id where p.user_id=$1 and p.is_active and r.is_active
  order by case r.role when 'admin' then 1 when 'manager' then 2 when 'accountant' then 3 when 'team_leader' then 4 else 5 end limit 1`,[actor])).rows[0];
 const role=String(current?.role||''),grants=new Set<string>(current?.grants||[]);
 if(role!==requestRole||!['admin','manager'].includes(role)||!payrollCapability(role,'payroll_rate_manage',grants))fail('Chỉ quản lý được cấu hình mã may.',403);
}

const enforceGlobalMappingPolicy=(body:LaborRow,role:string)=>{if(String(body.action||'DRAFT')!=='RETIRE'&&body.global===true&&role!=='admin')fail('Chỉ quản trị viên duyệt quy tắc dùng chung.',403);};

export function registerProductLaborMappings(app:express.Express,d:Dependencies){
 const base='/api/payroll/labor-mappings';
 const read=(handler:(req:express.Request,res:express.Response,db:PoolClient)=>Promise<void>):express.RequestHandler=>async(req,res)=>{try{await laborReadSnapshot(db=>handler(req,res,db));}catch(error){d.sendError(res,error);}};
 async function principal(write=false){const actor=d.actor(),role=d.role();if(!actor)fail('Cần đăng nhập.',401);if(!['admin','manager'].includes(role))fail('Chỉ quản lý được cấu hình mã may.',403);await d.capability(write);return {actor,role};}
 async function decisionAccess(db:DB,decision:LaborRow,actor:string,role:string,write=false){
  if(role==='admin')return;
  const latest=(await db.query("select snapshot from local_labor_mapping_versions where decision_id=$1 order by version desc limit 1",[decision.id])).rows[0];
  const template=String(decision.product_id||obj(latest?.snapshot).template_product_id||'');
  if(!uuid.test(template))fail('Không tìm thấy dữ liệu trong phạm vi phụ trách.',404);
  const c=await context(db,template);scope(c.owner,actor,role,write);
  if(decision.kind==='RULE')scope(String(decision.owner_id||''),actor,role,write);
  else if(write){const approved=(await db.query("select snapshot from local_labor_mapping_versions where decision_id=$1 and action='APPROVE' order by version desc limit 1",[decision.id])).rows[0];scope(String(obj(obj(approved?.snapshot).context).owner||decision.owner_id||''),actor,role,true);}
 }
 async function versionReadable(db:DB,row:LaborRow,actor:string,role:string){
  if(role==='admin'||row.kind!=='RULE')return true;
  const template=String(obj(row.snapshot).template_product_id||'');if(!uuid.test(template))return false;
  try{const c=await context(db,template);scope(c.owner,actor,role);return true;}catch(error){if([403,404].includes(Number(obj(error).status)))return false;throw error;}
 }
 function publicVersion(row:LaborRow,role:string){
  if(role==='admin'||row.kind!=='RULE')return row;
  // Closed projection: approved conditions are shared configuration; all proof
  // origins (including a foreign retirement_source or historical owner) stay
  // in the immutable admin audit. Never grow this list by spreading snapshots.
  const fields=['template_product_id','conditions','contract_version','fact_schema_version','fact_projection_version','contract_name','code_contract_id','code_contract_version','requirement_id','requirement_version','requirement_content_hash','piece_rate_code','piece_rate_name','code_semantic_fingerprint','labor_unit','source_unit','conversion_factor','conversion_confirmed'];
  return {...row,snapshot:Object.fromEntries(fields.filter(key=>key in obj(row.snapshot)).map(key=>[key,obj(row.snapshot)[key]]))};
 }
 async function diagnostics(db:DB,id:string,date:string,actor:string,role:string,override=false){
  const versions=await allVersions(db),trace:ResolutionTrace={candidates:[],missing_fact_keys:[],ownership_review:false};
  const row=await resolveProductLaborCode(db,id,date,actor,role,override,versions,undefined,undefined,trace),issue=issueOf(row);
  const latest=new Map<string,LaborRow>();for(const version of versions){const key=String(version.decision_id),old=latest.get(key);if(!old||Number(old.version)<Number(version.version))latest.set(key,version);}
  const templates=[...new Set(trace.candidates.flatMap(v=>[String(v.product_id||obj(v.snapshot).template_product_id||''),String(latest.get(String(v.decision_id))?.product_id||obj(latest.get(String(v.decision_id))?.snapshot).template_product_id||'')]).filter(v=>uuid.test(v)))];
  const products=new Map((await db.query(productSupplySelection+' where p.id=any($1::uuid[])',[templates])).rows.map(p=>[String(p.id),p]));
  const readable=(v:LaborRow)=>{if(role==='admin')return true;const p=products.get(String(v.product_id||obj(v.snapshot).template_product_id||''));return !!p&&!isLaborProduct(p)&&(!productEffectiveOwner(p)||productEffectiveOwner(p)===actor)&&(v.kind!=='RULE'||visible(v,actor,role));};
  const candidates=[];let inaccessible=0;
  for(const version of trace.candidates){const current=latest.get(String(version.decision_id));if(!current||!readable(current)||!readable(version)){inaccessible++;continue;}
   const snapshot=obj(version.snapshot),template=String(version.product_id||snapshot.template_product_id||''),p=products.get(template),currentProduct=products.get(String(current.product_id||obj(current.snapshot).template_product_id||'')),lastApproval=versions.filter(v=>v.decision_id===version.decision_id&&v.action==='APPROVE').sort((a,b)=>Number(b.version)-Number(a.version))[0];
   const canEdit=role==='admin'||!!p&&!!currentProduct&&productEffectiveOwner(p)===actor&&productEffectiveOwner(currentProduct)===actor&&(version.kind==='RULE'?current.owner_id===actor:String(obj(obj(lastApproval?.snapshot).context).owner||current.owner_id||'')===actor);
   candidates.push({decision_id:version.decision_id,version:Number(version.version),revision:Number(current.version),kind:version.kind,action:version.action,effective_from:version.effective_from,effective_to:version.effective_to||null,
    template_product_id:template,template_product_name:p?.name||null,conditions:snapshot.conditions||{},piece_rate_code:snapshot.piece_rate_code||null,piece_rate_name:snapshot.piece_rate_name||null,labor_unit:snapshot.labor_unit||null,source_unit:snapshot.source_unit||null,conversion_factor:snapshot.conversion_factor||null,conversion_confirmed:snapshot.conversion_confirmed===true,
    can_reconfirm:canEdit,can_retire:canEdit,capability:canEdit?'MANAGE':'READ_ONLY'});
  }
  const next=issue==='SUPPLY_REVIEW'?'SUPPLY':issue==='TECHNICAL_REVIEW'||issue==='MISSING_FACTS'?'TECHNICAL':issue==='ADMIN_REVIEW'||issue==='UNSUPPORTED'||issue==='CODE_REQUIREMENTS_REVIEW'||inaccessible?'ADMIN_REVIEW':['NOT_APPLICABLE','PRODUCT_INACTIVE'].includes(row.code_status)?'COMPLETE':'MAPPING';
  return {...row,match:inaccessible?null:row.match,diagnostics:{issue,missing_fact_keys:trace.missing_fact_keys,next_action:next,can_edit_source:role==='admin'||row.owner===actor,can_edit_mapping:!row.read_only,candidate_count:trace.candidates.length,inaccessible_candidate_count:inaccessible,candidates}};
 }
 function page(req:express.Request){const search=String(req.query.search||'').trim(),offset=Number(req.query.offset||0),limit=Number(req.query.limit||50);if(search.length>200||!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>100)fail('Bộ lọc không hợp lệ.');return {search,offset,limit,date:dateKey(req.query.date||today())};}
 async function append(client:DB,body:LaborRow,actor:string,role:string){
  const allowed=new Set(['idempotency_key','decision_id','kind','product_id','template_product_id','expected_revision','source_fingerprint','action','effective_from','effective_to','reason','piece_rate_code','code_semantic_fingerprint','expected_requirement_id','expected_requirement_version','expected_requirement_content_hash','source_unit','conversion_factor','conversion_confirmed','global','conditions','rows']);for(const key of Object.keys(body))if(!allowed.has(key))fail('Trường cấu hình không hỗ trợ: '+key);
  const action=String(body.action||'DRAFT');if(!['DRAFT','APPROVE','RETIRE'].includes(action))fail('Thao tác gán mã không hợp lệ.');
  const id=String(body.template_product_id||body.product_id||''),c=await context(client,id,true);scope(c.owner,actor,role,true);
  if(body.decision_id&&!uuid.test(String(body.decision_id)))fail('Quyết định không hợp lệ.');
  let decision=body.decision_id?(await client.query('select * from local_labor_mapping_decisions where id=$1',[body.decision_id])).rows[0]:null;
  const kind=String(body.kind||decision?.kind||'EXACT');if(!['EXACT','RULE'].includes(kind))fail('Loại ánh xạ không hợp lệ.');
  if(!decision&&kind==='EXACT')decision=(await client.query("select * from local_labor_mapping_decisions where kind='EXACT' and product_id=$1",[id])).rows[0];
  if(body.decision_id&&!decision)fail('Không tìm thấy quyết định.',404);
  if(decision){await decisionAccess(client,decision,actor,role,true);if(decision.kind!==kind||kind==='EXACT'&&decision.product_id!==id)fail('Quyết định không thuộc sản phẩm/loại đã chọn.');}
  const oldVersions=decision?(await client.query('select * from local_labor_mapping_versions where decision_id=$1 order by version desc',[decision.id])).rows:[],revision=Number(oldVersions[0]?.version||0);
  if(!Number.isSafeInteger(body.expected_revision)||revision!==body.expected_revision||body.source_fingerprint!==c.source_fingerprint)fail('Ánh xạ hoặc nguồn đã thay đổi. Tải lại trước khi lưu.',409);
  const from=dateKey(body.effective_from),to=body.effective_to?dateKey(body.effective_to):null;if(to&&to<from)fail('Ngày kết thúc phải sau ngày bắt đầu.');
  const reason=String(body.reason||'').trim();if(reason.length<3||reason.length>1000)fail('Nhập lý do từ 3 đến 1.000 ký tự.');
  let snapshot:LaborRow;
  if(action==='RETIRE'){if(!decision||!oldVersions.some(v=>v.action==='APPROVE'))fail('Chưa có ánh xạ được duyệt để kết thúc.');snapshot={...obj(oldVersions[0].snapshot),retirement_source:c.proof};}
  else{
   if(c.gate!=='READY')fail(c.reason,409);
   const code=(await laborCatalog(client,from)).find(v=>v.key===codeKey(body.piece_rate_code));if(!code||code.status!=='AVAILABLE')return fail('Mã công chưa có nghĩa/đơn vị duy nhất đang hiệu lực.',409);
   if(code.semantic_fingerprint!==body.code_semantic_fingerprint)fail('Danh mục mã công đã thay đổi. Tải lại.',409);
   const sourceUnit=String(body.source_unit||''),factor=String(body.conversion_factor||'');if(!['PIECE','SET','METER','HOUR'].includes(sourceUnit)||scaledDecimal(factor)<=0n)fail('Cần đơn vị nguồn và hệ số quy đổi dương được xác nhận.');
   if(sourceUnit!==code.unit&&body.conversion_confirmed!==true)fail('Khác đơn vị phải xác nhận rõ hệ số quy đổi.');
   if(sourceUnit===code.unit&&scaledDecimal(factor)!==10000n&&body.conversion_confirmed!==true)fail('Hệ số khác 1 cần xác nhận quy đổi.');
   const conditions=kind==='EXACT'?versionedConditionsFromFacts(c.fact_schema_version,c.facts):validateVersionedLaborConditions(c.fact_schema_version,body.conditions||versionedConditionsFromFacts(c.fact_schema_version,c.facts),c.facts);
   if(!versionedLaborConditionsMatch(c.fact_schema_version,conditions,c.facts))fail('Mẫu sản phẩm không khớp điều kiện quy tắc.');
   const contract=code.requirement;if(!contract||contract.definition.schema_version===2&&c.fact_schema_version!==2||contract.definition.schema_version===1&&c.fact_schema_version===2&&knownV2Extensions(c.facts).length>0||!requirementAllows(contract,c.facts,conditions))return fail('Mã công chưa hỗ trợ các đặc điểm hoặc phạm vi quy tắc này. Cần bổ sung hợp đồng kỹ thuật trước khi duyệt.',409);
   const pinned=body.expected_requirement_id!==undefined||body.expected_requirement_version!==undefined||body.expected_requirement_content_hash!==undefined;
   // Only the immutable reviewed ten seeds accept legacy clients without tokens.
   // Every new/revised requirement must be explicitly selected and reconfirmed.
   if(pinned?body.expected_requirement_id!==contract.stream_id||body.expected_requirement_version!==contract.version||body.expected_requirement_content_hash!==contract.content_hash:!contract.legacy_id)fail('Yêu cầu kỹ thuật mã đã thay đổi. Chọn lại mã và xác nhận trước khi lưu.',409);
   const global=body.global===true;enforceGlobalMappingPolicy(body,role);
   if(decision&&((!decision.owner_id)!==global)&&kind==='RULE')fail('Không đổi phạm vi của quyết định hiện có.');
   snapshot={template_product_id:id,source_fingerprint:c.source_fingerprint,context_fingerprint:c.context_fingerprint,context:c.proof,facts_fingerprint:c.facts_fingerprint,conditions,contract_version:LABOR_CONTRACT_VERSION,...(c.fact_schema_version===2?{fact_schema_version:2,fact_projection_version:FACT_PROJECTION_V2}:{}),contract_name:c.fact_schema_version===2?String(c.facts.manufacturing_type)+'_'+(c.facts.article_kind||c.facts.pillow_subtype||'STANDARD')+'@'+FACT_PROJECTION_V2:laborContractName(c.facts),code_contract_id:contract.legacy_id||contract.stream_id,code_contract_version:contract.legacy_version||String(contract.version),requirement_id:contract.stream_id,requirement_version:contract.version,requirement_content_hash:contract.content_hash,piece_rate_code:code.code,piece_rate_name:code.name,code_semantic_fingerprint:code.semantic_fingerprint,provenance:code.provenance,labor_unit:code.unit,source_unit:sourceUnit,conversion_factor:factor,conversion_confirmed:body.conversion_confirmed===true};
  }
  if(!decision){const decisionId=randomUUID(),owner=kind==='RULE'&&body.global===true?null:c.owner||null;decision={id:decisionId,kind,product_id:kind==='EXACT'?id:null,owner_id:owner};await client.query('insert into local_labor_mapping_decisions(id,kind,product_id,owner_id,created_by)values($1,$2,$3,$4,$5)',[decisionId,kind,decision.product_id,owner,actor]);}
  const version=revision+1;await client.query('insert into local_labor_mapping_versions(decision_id,version,action,effective_from,effective_to,snapshot,reason,created_by)values($1,$2,$3,$4,$5,$6::jsonb,$7,$8)',[decision.id,version,action,from,to,JSON.stringify(snapshot),reason,actor]);
  return {decision_id:decision.id,version,action,kind,product_id:decision.product_id,snapshot};
 }
 async function command(body:LaborRow,batch=false){
  const {actor,role}=await principal(true),key=String(body.idempotency_key||'');if(!key||key.length>200)fail('Thiếu khóa chống gửi trùng.');
  const fingerprint=productDigest({body,batch});return d.transaction(async client=>{
   await client.query("select pg_advisory_xact_lock_shared(hashtextextended('local-attendance-payroll-source-guard',0))");
   await client.query("select pg_advisory_xact_lock(hashtextextended('labor-mapping-writer',0))");
   await client.query('lock table local_product_rates in share mode');
   await assertLaborMappingAuthority(client,actor,role);
   const rows=batch?body.rows as LaborRow[]:[body];if(!Array.isArray(rows)||!rows.length||rows.length>100)fail('Chọn từ 1 đến 100 sản phẩm.');
   const ids=rows.map(row=>String(row.template_product_id||row.product_id||''));if(new Set(ids).size!==ids.length)fail('Không được lặp sản phẩm trong cùng yêu cầu.');
   const contexts=[];for(const id of [...ids].sort()){const c=await context(client,id,true);scope(c.owner,actor,role,true);contexts.push(c);}
   // Decision ownership is checked before receipt replay, as product ownership may move.
   for(const row of rows)if(row.decision_id){if(!uuid.test(String(row.decision_id)))fail('Quyết định không hợp lệ.');const decision=(await client.query('select * from local_labor_mapping_decisions where id=$1',[row.decision_id])).rows[0];if(!decision)fail('Không tìm thấy quyết định.',404);await decisionAccess(client,decision,actor,role,true);}
   const effectiveRows=batch?rows.map(row=>({...body,...row,rows:undefined,decision_id:row.decision_id,product_id:undefined,template_product_id:row.template_product_id||row.product_id,expected_revision:row.expected_revision,source_fingerprint:row.source_fingerprint,kind:'EXACT',action:'APPROVE'})):rows;
   for(const row of effectiveRows)enforceGlobalMappingPolicy(row,role);
   const receipt=(await client.query('select * from local_labor_mapping_receipts where idempotency_key=$1',[key])).rows[0];if(receipt){if(receipt.actor_id!==actor||receipt.fingerprint!==fingerprint)fail('Khóa gửi trùng đã dùng cho nội dung khác.',409);return {...receipt.result,reused:true};}
   if(batch&&new Set(contexts.map(c=>c.facts_fingerprint)).size!==1)fail('Chỉ xác nhận hàng loạt nhóm có cùng đặc điểm/kích thước.',409);
   const results=[];for(const row of effectiveRows)results.push(await append(client,row,actor,role));
   const result={results,reused:false};await client.query('insert into local_labor_mapping_receipts(idempotency_key,actor_id,fingerprint,result)values($1,$2,$3,$4::jsonb)',[key,actor,fingerprint,JSON.stringify(result)]);return result;
  });
 }
 app.get(base+'/catalog',read(async(req,res,db)=>{try{await principal();const q=page(req),rows=(await laborCatalog(db,q.date)).filter(v=>searchText(v.code+' '+v.name).includes(searchText(q.search)));res.json({rows:rows.slice(q.offset,q.offset+q.limit),total:rows.length});}catch(e){d.sendError(res,e);}}));
 app.get(base+'/products',read(async(req,res,db)=>{try{const {actor,role}=await principal(),q=page(req),versions=await allVersions(db),status=String(req.query.status||'ALL'),priceList=String(req.query.price_list_id||''),view=req.query.view===undefined?null:String(req.query.view),issue=String(req.query.issue||'ALL');if(!['ALL','RESOLVED','UNMAPPED','REVIEW'].includes(status)||priceList&&!uuid.test(priceList)||view!==null&&!['ALL','ATTENTION'].includes(view)||issue!=='ALL'&&!laborIssues.includes(issue as LaborIssue)||view===null&&issue!=='ALL'||view!==null&&status!=='ALL')fail('Bộ lọc mã may không hợp lệ.');
  const scoped=(await db.query(productSupplySelection+" order by p.name,p.id")).rows.filter(row=>!isLaborProduct(row)&&(role==='admin'||!productEffectiveOwner(row)||productEffectiveOwner(row)===actor));
  const products=scoped.filter(row=>(!priceList||row.price_list_id===priceList)&&searchText([row.name,row.sku].join(' ')).includes(searchText(q.search))),rows=[];
  // Resolve before status pagination; the unfiltered default resolves only a page.
  const candidate=view!==null?products.filter(row=>row.is_active===true):status!=='ALL'?products:products.slice(q.offset,q.offset+q.limit);
  const ids=candidate.map(row=>String(row.id)),technical=await currentTechnicalProfiles(db,ids),classification=new Map((await db.query('select distinct on(product_id) * from local_product_supply_classifications where product_id=any($1::uuid[]) order by product_id,version desc',[ids])).rows.map(row=>[String(row.product_id),row]));
  let catalog:Promise<Awaited<ReturnType<typeof laborCatalog>>>|undefined;const codes=()=>catalog||(catalog=laborCatalog(db,q.date));
  for(const row of candidate){const id=String(row.id),value=await resolveProductLaborCode(db,id,q.date,actor,role,false,versions,codes,{product:row,technical:technical.get(id)!,classification:classification.get(id)});if(status==='ALL'||status===value.code_status||status==='REVIEW'&&!['RESOLVED','UNMAPPED','NOT_APPLICABLE'].includes(value.code_status))rows.push(value);}
  if(view!==null){const applicable=rows.filter(v=>!['PRODUCT_INACTIVE','NOT_APPLICABLE'].includes(v.code_status)),counts={all:applicable.length,attention:applicable.filter(v=>!!issueOf(v)).length,resolved:applicable.filter(v=>v.code_status==='RESOLVED').length,issues:Object.fromEntries(laborIssues.map(key=>[key,applicable.filter(v=>issueOf(v)===key).length]))},filtered=applicable.filter(v=>(view==='ALL'||!!issueOf(v))&&(issue==='ALL'||issueOf(v)===issue));res.json({rows:filtered.slice(q.offset,q.offset+q.limit).map(queueRow),total:filtered.length,counts,date:q.date,price_lists:[...new Map(scoped.filter(row=>row.price_list_id).map(row=>[String(row.price_list_id),{id:String(row.price_list_id),name:String(row.price_list_name)}])).values()]});return;}
  res.json({rows:status==='ALL'?rows:rows.slice(q.offset,q.offset+q.limit),total:status==='ALL'?products.length:rows.length,date:q.date,price_lists:[...new Map(scoped.filter(row=>row.price_list_id).map(row=>[String(row.price_list_id),{id:String(row.price_list_id),name:String(row.price_list_name)}])).values()]});
 }catch(e){d.sendError(res,e);}}));
 app.get(base+'/products/:id',read(async(req,res,db)=>{try{const {actor,role}=await principal(),id=String(req.params.id),date=dateKey(req.query.date||today()),override=req.query.custom_specifications==='true';res.json(req.query.diagnostics==='true'?await diagnostics(db,id,date,actor,role,override):await resolveProductLaborCode(db,id,date,actor,role,override));}catch(e){d.sendError(res,e);}}));
 app.get(base+'/decisions',read(async(req,res,db)=>{try{const {actor,role}=await principal(),rows=[];const decisions=new Map<string,boolean>();for(const row of await allVersions(db)){const id=String(row.decision_id);if(!decisions.has(id))try{await decisionAccess(db,{...row,id},actor,role);decisions.set(id,true);}catch(e){if(obj(e).status===404||obj(e).status===403)decisions.set(id,false);else throw e;}if(decisions.get(id)&&await versionReadable(db,row,actor,role))rows.push(publicVersion(row,role));}res.json(rows);}catch(e){d.sendError(res,e);}}));
 app.get(base+'/decisions/:id/history',read(async(req,res,db)=>{try{const {actor,role}=await principal();if(!uuid.test(String(req.params.id)))fail('Quyết định không hợp lệ.');const decision=(await db.query('select * from local_labor_mapping_decisions where id=$1',[req.params.id])).rows[0];if(!decision)fail('Không tìm thấy quyết định.',404);await decisionAccess(db,decision,actor,role);const rows=[];for(const row of(await db.query("select v.*,v.effective_from::text,v.effective_to::text,p.name template_product_name from local_labor_mapping_versions v left join local_products p on p.id::text=v.snapshot->>'template_product_id' where v.decision_id=$1 order by v.version desc",[req.params.id])).rows){const version={...row,kind:decision.kind};if(await versionReadable(db,version,actor,role))rows.push(publicVersion(version,role));}res.json(rows);}catch(e){d.sendError(res,e);}}));
 app.post(base+'/decisions',async(req,res)=>{try{res.json(await command(req.body||{}));}catch(e){d.sendError(res,e);}});
 app.post(base+'/batch-confirm',async(req,res)=>{try{res.json(await command(req.body||{},true));}catch(e){d.sendError(res,e);}});
 app.post(base+'/batch-preview',read(async(req,res,db)=>{try{const {actor,role}=await principal(),ids=req.body?.product_ids;if(!Array.isArray(ids)||!ids.length||ids.length>100||new Set(ids).size!==ids.length)fail('Chọn từ 1 đến 100 sản phẩm khác nhau.');const date=dateKey(req.body.date||today()),rows=[];for(const id of ids)rows.push(await resolveProductLaborCode(db,String(id),date,actor,role));res.json({rows,read_only:true});}catch(e){d.sendError(res,e);}}));
}
