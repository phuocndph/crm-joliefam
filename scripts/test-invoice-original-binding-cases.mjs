// Explicit XML/API namespace binding. Synthetic identities; disposable DB only.
import assert from 'node:assert/strict';
import {tsImport} from 'tsx/esm/api';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';

export async function runOriginalBindingChecks(c){
  const {check,pool,prefix,must,call,key,company,manager,foreign,principal,detail,xml,file,actor,storage}=c;
  const {ViettelReadAdapter,normalizeInvoice,digest,parseInvoiceFiles}=await tsImport('../server/invoice-import.ts',import.meta.url).then(async i=>({...i,...await tsImport('../server/viettel-read-adapter.ts',import.meta.url)}));
  const {ingestInvoice}=await tsImport('../server/invoice-workspace.ts',import.meta.url);
  const {originalBindingTarget}=await tsImport('../server/invoice-original-binding.ts',import.meta.url);
  let serial=710000;
  const settings={username:'QA_BINDING',password:'QA_BINDING_ONLY',supplier_tax_code:company.tax_code,page_start:1,company_name:company.legal_name,company_address:'QA'};
  const seed=async(input,source='VIETTEL',owner=principal)=>{const db=await pool.connect();try{await db.query('begin');const result=await ingestInvoice(db,owner,company,input,source);await db.query('commit');return result;}catch(e){await db.query('rollback');throw e;}finally{db.release();}};
  const fixture=async({sourcePatch={},mappedPatch={},xmlPatch={},owner=principal}={})=>{
    const n=String(++serial),source={invoiceId:'QA-BIND-'+key(),invoiceNumber:n.padStart(7,'0'),invoiceNo:'C26TQA'+n,invoiceSeri:'C26TQA',templateCode:'1/001',invoiceType:'1',supplierTaxCode:company.tax_code,buyerTaxCode:'0100000002',buyerUnitName:'QA XML source buyer',issueDateStr:'2015-06-29',currency:'VND',state:'1',adjustmentType:'1',totalBeforeTax:'100.000000000',taxAmount:'10.000000000',total:'110.000000000',listProduct:JSON.stringify({itemInfo:[{itemName:'QA binding source item',quantity:'1',unitPrice:'100',vatPercentage:'10',itemTotalAmountWithoutVat:'100',vatAmount:'10',itemTotalAmountWithVat:'110'}]}),...sourcePatch};
    const adapter=new ViettelReadAdapter(settings,async()=>new Response(JSON.stringify({totalRows:1,invoices:[source]})),false);
    const mapped=(await adapter.page({company_tax_code:company.tax_code,from:'2015-06-01',to:'2015-06-30',cursor:null,signal:AbortSignal.timeout(5000)})).invoices[0];
    Object.assign(mapped,mappedPatch);const input=normalizeInvoice(mapped);input.source_identity=String(mapped.provider_id);
    const seeded=await seed(input,'VIETTEL',owner);
    const xmlInput={...input,template_code:'1',invoice_number:n,lines:[{name:'QA binding source item',quantity:'1',unit_price:'100',vat_rate:'10'}],...xmlPatch};
    const content=xml(xmlInput),parsed=(await parseInvoiceFiles([file('source.xml',content)])).invoices[0];
    const body={company_id:company.id,invoice_id:seeded.id,source:'VIETTEL_FILE',request_key:key(),reason:'QA explicit namespace binding',files:[file('source.xml',content),file('source.pdf','%PDF-1.4\nQA source '+source.invoiceId)]};
    return{id:seeded.id,input,source,xmlInput,parsed,content,body};
  };
  const snapshot=async f=>({invoice:(await pool.query('select * from local_einvoices where id=$1',[f.id])).rows[0],lines:(await pool.query('select * from local_invoice_lines where invoice_id=$1 order by id',[f.id])).rows,observations:(await pool.query('select * from local_invoice_observations where invoice_id=$1 order by id',[f.id])).rows,evidence:(await pool.query('select * from local_invoice_source_evidence where invoice_id=$1 order by id',[f.id])).rows,files:(await pool.query('select * from local_invoice_files where invoice_id=$1 order by id',[f.id])).rows});
  const preview=f=>must(prefix+'/import/preview','POST',f.body);
  const commit=(p,body={confirm_original_binding:true})=>call(prefix+'/import/'+p.job_id+'/commit','POST',body);
  const rejectPreview=async f=>{const before=await snapshot(f),r=await call(prefix+'/import/preview','POST',f.body);assert.equal(r.status,409);assert.deepEqual(await snapshot(f),before);return r;};
  const assertImmutable=(before,after)=>{for(const field of ['total_amount','vat_amount','total_with_vat','source_snapshot','invoice_number','invoice_series','template_code','status','direction','source_kind'])assert.deepEqual(after.invoice[field],before.invoice[field]);assert.deepEqual(after.lines,before.lines);for(const row of before.observations)assert.deepEqual(after.observations.find(v=>v.id===row.id),row);for(const row of before.evidence)assert.deepEqual(after.evidence.find(v=>v.id===row.id),row);};

  await check('original binding preview carries server proof and explicit confirmation cannot be replaced by client supplied proof',async()=>{
    const f=await fixture(),before=await snapshot(f),p=await preview(f);assert.equal(p.binding.kind,'VIETTEL_TT78_EXPLICIT_TYPE');assert.equal(p.binding.target_id,f.id);assert.equal(p.binding.xml_sha256,digest(Buffer.from(f.content)));assert.equal(p.binding.target_identity.template_code,'1/001');assert.equal(p.binding.xml_identity.template_code,'1');assert.deepEqual(await snapshot(f),before);
    for(const body of [{},{confirm_original_binding:false},{confirm_original_binding:'true'},{binding:p.binding},{original_binding:p.binding}]){assert.equal((await commit(p,body)).status,422);assert.deepEqual(await snapshot(f),before);}
    assert.throws(()=>originalBindingTarget({proof:p.binding},company.id,f.parsed),e=>e.status===409);
  });
  await check('original binding explicit commit appends exact XML evidence without rewriting API canonical facts or clearing legal review',async()=>{
    const f=await fixture(),before=await snapshot(f),p=await preview(f),staged=(await pool.query('select staged_payload from local_invoice_import_jobs where id=$1',[p.job_id])).rows[0].staged_payload.invoices[0],r=await commit(p);assert.equal(r.status,200);const after=await snapshot(f);assertImmutable(before,after);assert.equal(after.observations.length,2);assert.equal(after.files.length,2);const appended=after.observations.find(o=>o.source==='VIETTEL_FILE');assert.deepEqual(appended.payload,JSON.parse(JSON.stringify(f.parsed)));assert.equal(appended.source_identity,f.parsed.source_identity);assert.equal(appended.payload.raw.content_hash,digest(Buffer.from(f.content)));assert.equal(appended.content_hash,digest(staged));assert.equal(after.invoice.review_state,'needs_review');assert.ok(after.invoice.discrepancy.some(v=>v.includes('Trạng thái/quan hệ pháp lý')));assert.ok(!after.invoice.discrepancy.some(v=>/snapshot chuẩn:.*(template_code|invoice_number|status)/.test(v)));const audit=(await pool.query("select snapshot from local_invoice_audit where invoice_id=$1 and action='BIND_ORIGINAL_XML'",[f.id])).rows;assert.equal(audit.length,1);assert.equal(audit[0].snapshot.xml_sha256,p.binding.xml_sha256);
  });
  await check('original binding commit request replay and fresh preview key dedupe one invoice originals and XML observation',async()=>{
    const f=await fixture(),p=await preview(f);assert.equal((await commit(p)).status,200);const before=await snapshot(f);const replay=await commit(p);assert.equal(replay.status,200);assert.equal(replay.body.reused,true);assert.deepEqual(await snapshot(f),before);f.body.request_key=key();const next=await preview(f);assert.equal((await commit(next)).status,200);const after=await snapshot(f);assert.equal(after.files.length,2);assert.equal(after.observations.length,2);assertImmutable(before,after);assert.equal((await pool.query('select count(*)::int n from local_einvoices where company_id=$1 and id=$2',[company.id,f.id])).rows[0].n,1);
  });
  await check('original binding stale canonical revision fails commit atomically',async()=>{
    const f=await fixture(),p=await preview(f),d=await detail(f.id);await must(prefix+'/invoices/'+f.id+'/notes','POST',{expected_revision:d.invoice.revision,notes:'QA later change',reason:'QA stale original preview'});const before=await snapshot(f);assert.equal((await commit(p)).status,409);assert.deepEqual(await snapshot(f),before);
  });
  await check('original binding a later equal API observation invalidates captured proof even with unchanged canonical revision',async()=>{
    const f=await fixture(),p=await preview(f),changed=structuredClone(f.input);changed.raw.qa_fresh_observation=key();await seed(changed);const before=await snapshot(f);assert.equal((await commit(p)).status,409);assert.deepEqual(await snapshot(f),before);
  });
  await check('original binding explicit type is mandatory strict string family and never inferred from publication template',async()=>{
    for(const invoiceType of [undefined,null,'01','0','7','1/001',' 1','1 '])await rejectPreview(await fixture({sourcePatch:{invoiceType}}));
    const numeric=await fixture(),changed=structuredClone(numeric.input);changed.raw.source_record.invoiceType=1;await seed(changed);await rejectPreview(numeric);
    await rejectPreview(await fixture({sourcePatch:{invoiceType:'2'}}));
  });
  await check('original binding source identifiers seller buyer currency and canonical publication fields must be explicit and consistent',async()=>{
    for(const sourcePatch of [{supplierTaxCode:undefined},{buyerTaxCode:undefined},{currency:undefined},{invoiceId:''},{templateCode:''}]){if(sourcePatch.invoiceId===''){const f=await fixture();const changed=structuredClone(f.input);delete changed.raw.source_record.invoiceId;await seed(changed);await rejectPreview(f);}else await rejectPreview(await fixture({sourcePatch}));}
    await rejectPreview(await fixture({sourcePatch:{invoiceSeri:'OTHER'},xmlPatch:{invoice_series:'C26TQA'}}));
    for(const [field,value]of [['provider_id','QA_WRONG'],['full_invoice_no','QA_WRONG']]){const f=await fixture(),changed=structuredClone(f.input);changed.raw[field]=value;await seed(changed);await rejectPreview(f);}
  });
  await check('original binding number parser refuses symbolic zero signed scientific and overlong invoice numbers',async()=>{
    for(const invoice_number of ['0','+1','-1','1e3','1.0','A12','1'.repeat(33)])await rejectPreview(await fixture({xmlPatch:{invoice_number}}));
  });
  await check('original binding full invoice identifier must preserve exact series and numeric suffix',async()=>{
    for(const mode of ['wrong-series','different-number','trailing-data','padded-suffix','blank']){const f=await fixture(),changed=structuredClone(f.input),n=f.xmlInput.invoice_number;const full=mode==='wrong-series'?'BAD'+n:mode==='different-number'?'C26TQA'+(BigInt(n)+1n):mode==='trailing-data'?'C26TQA'+n+'x':mode==='padded-suffix'?'C26TQA'+'0'+n:'';changed.raw.full_invoice_no=full;changed.raw.source_record.invoiceNo=full;await seed(changed);await rejectPreview(f);}
  });
  await check('original binding buyer currency source and XML exact money mismatches fail closed',async()=>{
    for(const xmlPatch of [{buyer_tax_code:'0100000003'},{currency:'USD'},{total_amount:'101',total_with_vat:'111'},{vat_amount:'11',total_with_vat:'111'}])await rejectPreview(await fixture({xmlPatch}));
    for(const [field,value]of [['buyerTaxCode','0100000003'],['currency','USD'],['totalBeforeTax','100.000000001'],['taxAmount','10.000000001'],['total','110.000000001']]){const f=await fixture(),changed=structuredClone(f.input);changed.raw.source_record[field]=value;await seed(changed);await rejectPreview(f);}
  });
  await check('original binding normalized business day and raw date agree including Vietnam milliseconds fallback',async()=>{
    const f=await fixture({sourcePatch:{issueDateStr:null,issueDate:String(Date.parse('2015-06-28T17:00:00Z'))}}),p=await preview(f);assert.equal((await commit(p)).status,200);
    for(const patch of [{issueDateStr:'2015-06-28'},{issueDateStr:null,issueDate:'invalid'},{issueDateStr:null,issueDate:String(Date.parse('2015-06-27T17:00:00Z'))}]){const f=await fixture(),changed=structuredClone(f.input);Object.assign(changed.raw.source_record,patch);await seed(changed);await rejectPreview(f);}
  });
  await check('original binding pending adjusted draft inbound and non Viettel source never gain binding privileges',async()=>{
    for(const patch of [{state:'2'},{adjustmentType:'9'}])await rejectPreview(await fixture({sourcePatch:patch}));
    const f=await fixture();f.body.source='USER_FILE';const p=await preview(f);assert.equal(p.binding,null);assert.equal((await commit(p)).status,409);
  });
  await check('original binding hidden canonical numeric identity collision blocks without revealing restricted identifiers',async()=>{
    const f=await fixture(),other=structuredClone(f.input);other.template_code='2/999';other.invoice_number=f.xmlInput.invoice_number;other.raw.provider_id='QA-HIDDEN-'+key();other.raw.source_record.invoiceId=other.raw.provider_id;other.source_identity=other.raw.provider_id;const hidden=await seed(other,'VIETTEL',{actor:foreign.id,role:'manager',assigned:null});await pool.query('update local_einvoices set source_owner_restricted=true where id=$1',[hidden.id]);assert.equal((await call(prefix+'/invoices/'+hidden.id)).status,403);const r=await rejectPreview(f);assert.ok(!JSON.stringify(r).includes(hidden.id));
  });
  await check('original binding competing immutable XML observation identity and hash block a second target',async()=>{
    for(const mode of ['identity','hash','numeric']){const f=await fixture(),other=await fixture({owner:{actor:foreign.id,role:'manager',assigned:null}}),payload=structuredClone(other.input);await pool.query('update local_einvoices set source_owner_restricted=true where id=$1',[other.id]);assert.equal((await call(prefix+'/invoices/'+other.id)).status,403);if(mode==='identity')payload.source_identity=f.parsed.source_identity;else if(mode==='hash')payload.raw.content_hash=digest(Buffer.from(f.content));else{payload.seller_tax_code=f.parsed.seller_tax_code;payload.invoice_series=f.parsed.invoice_series;payload.invoice_number=f.parsed.invoice_number;}await pool.query('insert into local_invoice_observations(company_id,invoice_id,source,source_identity,content_hash,payload,actor_id)values($1,$2,$3,$4,$5,$6::jsonb,$7)',[company.id,other.id,'QA_BIND_COLLISION',payload.source_identity,digest(payload),JSON.stringify(payload),foreign.id]);const r=await rejectPreview(f);assert.ok(!JSON.stringify(r).includes(other.id));}
  });
  await check('original binding any original file hash bound elsewhere or unassigned blocks target even when hidden',async()=>{
    for(const unassigned of [false,true]){const f=await fixture(),other=await fixture();await pool.query("insert into local_invoice_files(id,company_id,invoice_id,storage_key,name,media_type,sha256,size_bytes,source,original,actor_id)values($1,$2,$3,$4,'hidden.xml','application/xml',$5,$6,'VIETTEL_FILE',true,$7)",[key(),company.id,unassigned?null:other.id,key(),digest(Buffer.from(f.content)),Buffer.byteLength(f.content),foreign.id]);await rejectPreview(f);}
  });
  await check('original binding collision appearing after preview invalidates commit and preserves source evidence',async()=>{
    const f=await fixture(),p=await preview(f),other=structuredClone(f.input);other.template_code='2/999';other.invoice_number=f.xmlInput.invoice_number;other.source_identity='QA-LATE-'+key();other.raw.provider_id=other.source_identity;other.raw.source_record.invoiceId=other.source_identity;await seed(other);const before=await snapshot(f);assert.equal((await commit(p)).status,409);assert.deepEqual(await snapshot(f),before);
  });
  await check('original binding files capability is rechecked on preview and commit and client proof cannot bypass revoked access',async()=>{
    const f=await fixture(),user=await actor('original-binding-'+key(),'employee',manager.id);const grant=capabilities=>must(prefix+'/companies/'+company.id+'/grants','POST',{user_id:user.id,capabilities,reason:'QA original file capability boundary'});await grant(['view','import']);const denied=await call(prefix+'/import/preview','POST',f.body,user.token);assert.equal(denied.status,403);await grant(['view','import','files']);const p=(await call(prefix+'/import/preview','POST',{...f.body,request_key:key()},user.token));assert.equal(p.status,200);await grant(['view','import']);const before=await snapshot(f),r=await call(prefix+'/import/'+p.body.job_id+'/commit','POST',{confirm_original_binding:true,binding:p.body.binding},user.token);assert.equal(r.status,403);assert.deepEqual(await snapshot(f),before);
  });
  await check('original binding bound XML cannot create independent duplicates under another file source label',async()=>{
    const f=await fixture(),p=await preview(f);assert.equal((await commit(p)).status,200);const before=await snapshot(f),count=(await pool.query('select count(*)::int n from local_einvoices where company_id=$1',[company.id])).rows[0].n;
    for(const source of ['USER_FILE','TAX_FILE','VIETTEL_FILE']){const body={...f.body,source,invoice_id:undefined,request_key:key()},standalone=await must(prefix+'/import/preview','POST',body),r=await commit(standalone,{});assert.equal(r.status,409);assert.deepEqual(await snapshot(f),before);assert.equal((await pool.query('select count(*)::int n from local_einvoices where company_id=$1',[company.id])).rows[0].n,count);}
  });
  await check('original binding provider snapshot metadata and ordinary published outbound canonical state are required',async()=>{
    // A non-Viettel append does not supersede the latest trusted Viettel observation.
    const unrelated=await fixture(),unrelatedInput=structuredClone(unrelated.input);unrelatedInput.raw.provider='OTHER';await seed(unrelatedInput);assert.equal((await preview(unrelated)).binding.kind,'VIETTEL_TT78_EXPLICIT_TYPE');
    const wrongSnapshot=await fixture(),snapshot=structuredClone(wrongSnapshot.input);snapshot.raw.provider='OTHER';await pool.query('update local_einvoices set source_snapshot=$2::jsonb where id=$1',[wrongSnapshot.id,JSON.stringify(snapshot)]);await rejectPreview(wrongSnapshot);
    for(const [field,value]of [['spec','2.53'],['provider_id','QA_OTHER_ID']]){const f=await fixture(),changed=structuredClone(f.input);changed.raw[field]=value;await seed(changed);await rejectPreview(f);}
    for(const update of ["is_draft=true","direction='IN'","status='cancelled'"]){const f=await fixture();await pool.query('update local_einvoices set '+update+' where id=$1',[f.id]);await rejectPreview(f);}
    const f=await fixture();f.body.files.push(file('second.xml',f.content));await rejectPreview(f);
  });
  await check('original binding module and target owner ACL cannot be bypassed by company grants or client proof',async()=>{
    const f=await fixture({owner:{actor:foreign.id,role:'manager',assigned:null}});await pool.query('update local_einvoices set source_owner_restricted=true where id=$1',[f.id]);const before=await snapshot(f);assert.equal((await call(prefix+'/import/preview','POST',f.body)).status,403);assert.deepEqual(await snapshot(f),before);
    const own=await fixture(),user=await actor('original-no-module-'+key(),'employee',manager.id);await must(prefix+'/companies/'+company.id+'/grants','POST',{user_id:user.id,capabilities:['view','import','files'],reason:'QA no module cannot import'});await pool.query("update local_employee_permissions set enabled=false where user_id=$1 and permission_type='contracts'",[user.id]);assert.equal((await call(prefix+'/import/preview','POST',own.body,user.token)).status,403);
  });
  await check('original binding staged original bytes remain hash guarded before any evidence or files commit',async()=>{
    const f=await fixture(),p=await preview(f),staged=(await pool.query('select staged_payload from local_invoice_import_jobs where id=$1',[p.job_id])).rows[0].staged_payload,original=staged.files.find(v=>v.media_type==='application/xml'),target=path.resolve(storage,'invoice-originals',original.storage_key);assert.equal(path.dirname(target),path.resolve(storage,'invoice-originals'));const bytes=await readFile(target);await writeFile(target,Buffer.concat([bytes,Buffer.from(' ')]));const before=await snapshot(f);assert.equal((await commit(p)).status,409);assert.deepEqual(await snapshot(f),before);
  });
  await check('original binding independent alternate XML number padding cannot bypass cross source duplicate guard',async()=>{
    const f=await fixture(),p=await preview(f);assert.equal((await commit(p)).status,200);const before=await snapshot(f),count=(await pool.query('select count(*)::int n from local_einvoices where company_id=$1',[company.id])).rows[0].n,variant=f.content.replace('<SHDon>'+f.xmlInput.invoice_number+'</SHDon>','<SHDon>00'+f.xmlInput.invoice_number+'</SHDon>'),parsed=(await parseInvoiceFiles([file('variant.xml',variant)])).invoices[0];assert.notEqual(parsed.source_identity,f.parsed.source_identity);assert.notEqual(parsed.raw.content_hash,f.parsed.raw.content_hash);assert.equal(BigInt(parsed.invoice_number),BigInt(f.parsed.invoice_number));
    for(const source of ['USER_FILE','TAX_FILE','VIETTEL_FILE']){const independent=await must(prefix+'/import/preview','POST',{company_id:company.id,request_key:key(),source,reason:'QA alternate padding cannot duplicate bound original',files:[file('variant.xml',variant)]}),r=await commit(independent,{});assert.equal(r.status,409);assert.deepEqual(await snapshot(f),before);assert.equal((await pool.query('select count(*)::int n from local_einvoices where company_id=$1',[company.id])).rows[0].n,count);}
  });
  await check('original binding publication template must be nonempty bounded trimmed explicit source text',async()=>{
    for(const templateCode of ['', ' ', ' 1/001', '1/001 ', '1/'.repeat(30)])await rejectPreview(await fixture({sourcePatch:{templateCode}}));
  });
  await check('original binding other invoice historical provider identifier aliases block without hidden record disclosure',async()=>{
    await must(prefix+'/companies/'+company.id+'/grants','POST',{user_id:foreign.id,capabilities:['view','import'],reason:'QA hidden owner can append their own later source observation'});
    for(const alias of ['provider_id','source_record_invoice_id']){const f=await fixture(),other=await fixture({owner:{actor:foreign.id,role:'manager',assigned:null}}),payload=structuredClone(other.input);await pool.query('update local_einvoices set source_owner_restricted=true where id=$1',[other.id]);if(alias==='provider_id')payload.raw.provider_id=f.input.raw.provider_id;else payload.raw.source_record.invoiceId=f.input.raw.provider_id;await pool.query('insert into local_invoice_observations(company_id,invoice_id,source,source_identity,content_hash,payload,actor_id)values($1,$2,\'VIETTEL\',$3,$4,$5::jsonb,$6)',[company.id,other.id,'QA_ALIAS_'+key(),digest(payload),JSON.stringify(payload),foreign.id]);const later=structuredClone(other.input);later.raw.qa_later_unrelated=key();await seed(later,'VIETTEL',{actor:foreign.id,role:'manager',assigned:null});const r=await rejectPreview(f);assert.ok(!JSON.stringify(r).includes(other.id));assert.ok(!JSON.stringify(r).includes(payload.raw.provider_id));}
  });
  await check('original binding other invoice historical full invoice aliases block without hidden record disclosure',async()=>{
    await must(prefix+'/companies/'+company.id+'/grants','POST',{user_id:foreign.id,capabilities:['view','import'],reason:'QA hidden owner can append their own later source observation'});
    for(const alias of ['full_invoice_no','source_record_invoice_no']){const f=await fixture(),other=await fixture({owner:{actor:foreign.id,role:'manager',assigned:null}}),payload=structuredClone(other.input);await pool.query('update local_einvoices set source_owner_restricted=true where id=$1',[other.id]);if(alias==='full_invoice_no')payload.raw.full_invoice_no=f.input.raw.full_invoice_no;else payload.raw.source_record.invoiceNo=f.input.raw.full_invoice_no;await pool.query('insert into local_invoice_observations(company_id,invoice_id,source,source_identity,content_hash,payload,actor_id)values($1,$2,\'VIETTEL\',$3,$4,$5::jsonb,$6)',[company.id,other.id,'QA_FULL_ALIAS_'+key(),digest(payload),JSON.stringify(payload),foreign.id]);const later=structuredClone(other.input);later.raw.qa_later_unrelated=key();await seed(later,'VIETTEL',{actor:foreign.id,role:'manager',assigned:null});const r=await rejectPreview(f);assert.ok(!JSON.stringify(r).includes(other.id));assert.ok(!JSON.stringify(r).includes(f.input.raw.full_invoice_no));}
  });
  await check('original binding provider marker in an unrelated source observation cannot grant Viettel authority',async()=>{
    const f=await fixture(),fake=structuredClone(f.input);fake.raw.provider_id='QA_FAKE_'+key();fake.raw.source_record.invoiceId=fake.raw.provider_id;fake.source_identity=fake.raw.provider_id;fake.invoice_number=String(++serial).padStart(7,'0');fake.raw.source_record.invoiceNumber=fake.invoice_number;fake.raw.source_record.invoiceNo='C26TQA'+BigInt(fake.invoice_number);fake.raw.full_invoice_no=fake.raw.source_record.invoiceNo;const other=await seed(fake,'USER_FILE'),content=xml({...f.xmlInput,invoice_number:BigInt(fake.invoice_number).toString()}),body={...f.body,invoice_id:other.id,request_key:key(),files:[file('source.xml',content)]};const before=await snapshot({id:other.id});const r=await call(prefix+'/import/preview','POST',body);assert.equal(r.status,409);assert.deepEqual(await snapshot({id:other.id}),before);
  });
}
