// Read-only evidence projection. Never a requirement, mapping or payroll token.
import {productDigest} from './product-catalog-snapshot.js';
import {codeKey,laborSemanticFingerprint,semanticText,type LaborRow} from './product-labor-resolver.js';

export const coverageStatuses=['SUPPORTED','PENDING','CONFLICT','INCOMPLETE','SOURCE_EXPIRED','OTHER_STAGE','NOT_APPLICABLE'] as const;
export const coverageInventoryBound=20000;
type CatalogRow={key:string;code:string;name:string;unit:string;semantic_fingerprint:string;status:string;coverage_status:string;requirement:null|{stream_id:string;version:number;content_hash:string;semantic_fingerprint:string;effective_from:string;effective_to:string|null;definition:{disposition:string;stage:string}}};
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;

// A source_reference is untrusted free text, not a link or a path to read. Only
// recognize a bounded document basename; all other notes collapse to a label.
export function safeLaborSourceLabel(value:unknown){
 let text=String(value??'').trim().replace(/^Excel:/i,'');
 if(/^[a-z][a-z\d+.-]*:\/\//i.test(text)){try{text=new URL(text).pathname;}catch{return 'Nguồn đơn giá';}}
 text=text.split(/[?#]/,1)[0].replaceAll('\\','/').split('/').at(-1)||'';
 try{text=decodeURIComponent(text);}catch{return 'Nguồn đơn giá';}
 return /^[\p{L}\p{N} _().-]{1,150}\.(?:xlsx?|csv|json|ods)$/iu.test(text)&&!text.includes('..')?text:'Nguồn đơn giá';
}
export function safeLaborSource(row:LaborRow,at:string){
 const key=codeKey(row.piece_rate_code),from=String(row.effective_from),to=row.effective_to?String(row.effective_to):null;
 return {rate_id:String(row.id),code_key:key||null,code:String(row.piece_rate_code??'').trim(),name:String(row.piece_rate_name??''),unit:String(row.rate_unit??''),semantic_fingerprint:laborSemanticFingerprint(row.piece_rate_code,row.piece_rate_name,row.rate_unit),source_label:safeLaborSourceLabel(row.source_reference),source_row:Number.isSafeInteger(row.source_row)&&Number(row.source_row)>0?Number(row.source_row):null,effective_from:from,effective_to:to,temporal_status:from>at?'FUTURE' as const:to&&to<at?'EXPIRED' as const:'CURRENT' as const};
}
export function laborCoverageSources(rows:LaborRow[],at:string){return rows.map(row=>safeLaborSource(row,at)).sort((a,b)=>compare(a.rate_id,b.rate_id));}
export function laborCoverageIssues(rows:LaborRow[],codes:CatalogRow[],at:string){
 const byCode=new Map(codes.map(row=>[row.key,row])),currentKeys=new Set(rows.filter(row=>String(row.effective_from)<=at&&(!row.effective_to||String(row.effective_to)>=at)).map(row=>codeKey(row.piece_rate_code)));
 return laborCoverageSources(rows,at).flatMap(source=>{
  const code=source.code_key?byCode.get(source.code_key):null,reasons:string[]=[];
  if(!source.code_key)reasons.push('BLANK_CODE');
  if(!semanticText(source.name)||!['PIECE','SET','HOUR','METER'].includes(source.unit))reasons.push('INCOMPLETE_SOURCE');
  // Current conflicts list all competing active rows. If none is current the
  // canonical selector compares history; retain all those source identities.
  if(code?.status==='CONFLICT'&&(source.temporal_status==='CURRENT'||!currentKeys.has(source.code_key!)))reasons.push('SEMANTIC_CONFLICT');
  if(source.temporal_status==='FUTURE')reasons.push('FUTURE_SOURCE');
  if(source.temporal_status==='EXPIRED')reasons.push('EXPIRED_SOURCE');
  return reasons.length?[{...source,reasons}]:[];
 });
}
export function laborCoverageInventory(catalog:{rows:CatalogRow[];source_rows:LaborRow[];blank_rows:number},at:string,generatedAt=new Date().toISOString()){
 if(catalog.source_rows.length>coverageInventoryBound||catalog.rows.length>coverageInventoryBound)throw Object.assign(new Error('Danh mục vượt giới hạn xuất 20.000 dòng nguồn. Không xuất bản thiếu.'),{status:413});
 const sources=laborCoverageSources(catalog.source_rows,at),byKey=new Map<string,typeof sources>();
 for(const source of sources)if(source.code_key){const group=byKey.get(source.code_key)||[];group.push(source);byKey.set(source.code_key,group);}
 const rows=catalog.rows.map(row=>({code_key:row.key,code:row.code,name:row.name,unit:row.unit,semantic_fingerprint:row.semantic_fingerprint,source_status:row.status,coverage_status:row.coverage_status,provenance:byKey.get(row.key)||[],requirement:row.requirement?{stream_id:row.requirement.stream_id,version:row.requirement.version,content_hash:row.requirement.content_hash,semantic_fingerprint:row.requirement.semantic_fingerprint,effective_from:row.requirement.effective_from,effective_to:row.requirement.effective_to,disposition:row.requirement.definition.disposition,stage:row.requirement.definition.stage}:null,review_status:'NOT_REVIEWED' as const,software_representability:'NOT_ASSESSED' as const,mapping_status:'NOT_ASSESSED' as const,pay_ready:false as const})).sort((a,b)=>compare(a.code_key,b.code_key));
 const counts={source_rows:sources.length,canonical_codes:rows.length,blank_rows:catalog.blank_rows,...Object.fromEntries(coverageStatuses.map(status=>[status,rows.filter(row=>row.coverage_status===status).length]))};
 const evidence={inventory_schema_version:1 as const,date:at,counts,rows,source_issues:laborCoverageIssues(catalog.source_rows,catalog.rows,at)};
 return {...evidence,generated_at:generatedAt,inventory_hash:productDigest(evidence)};
}
