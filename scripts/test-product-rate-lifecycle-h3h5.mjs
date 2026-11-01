// Local pure/extracted-handler/HTTP transport checks. No PostgreSQL or business data.
import assert from 'node:assert/strict';
import {readFile,mkdir,mkdtemp,rm,copyFile,writeFile} from 'node:fs/promises';
import {createHash,randomUUID,randomBytes} from 'node:crypto';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import path from 'node:path';
import ts from 'typescript';
import ExcelJS from 'exceljs';
import {parseArgs,loopbackOrigin,sessionText,canonicalJson,fingerprint,importBody,readRates} from './import-local-piece-rates.mjs';
const stage=path.resolve('.local-staging-runtime/item5h3h5-baseline');await mkdir(stage,{recursive:true});
const temporary=await mkdtemp(path.join(stage,'pure-owned-')),checks=[];
const token='synthetic-'+randomBytes(32).toString('hex'),actor=randomUUID();
const check=async(name,fn)=>{await fn();checks.push(name);console.log('PASS '+name);};
const source=(await readFile('server/index.ts','utf8')).replaceAll('\r\n','\n');
const compile=text=>ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const serializerMatch=source.match(/const canonicalJson\s*=\s*\(value:\s*unknown\):\s*string\s*=>\s*\{[\s\S]*?const payloadFingerprint[\s\S]*?\.digest\("hex"\);/);
assert(serializerMatch,'Actual server canonical serializer not found');
const serializer=new Function('createHash',compile(serializerMatch[0])+';return {canonicalJson,payloadFingerprint};')(createHash);
const cleanEnv=Object.fromEntries(['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','COMSPEC','PATHEXT'].filter(key=>process.env[key]).map(key=>[key,process.env[key]]));
let server,base,mode='preview',requests=[],redirectHits=0;const deadlines=[];
async function workbook(file,rows){const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('don-gia-moi');sheet.addRow(['ma_sp','ten_sp','don_gia','ghi_chu']);for(const row of rows)sheet.addRow(row);await book.xlsx.writeFile(file);}
async function cli(file,extra=[],input=token+'\n'){
  const args=['scripts/import-local-piece-rates.mjs','--file='+file,'--api-url='+base,'--session-stdin',...extra];assert(!args.some(value=>value.includes(token)));
  const child=spawn(process.execPath,args,{env:cleanEnv,windowsHide:true,stdio:['pipe','pipe','pipe']});let stdout='',stderr='',killed=false;const started=Date.now(),watchdog=setTimeout(()=>{killed=true;child.kill();},40000);child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);child.stdin.on('error',()=>{});child.stdin.end(input);const[exit]=await once(child,'exit');clearTimeout(watchdog);assert(!stdout.includes(token)&&!stderr.includes(token),'Secret in controlled CLI output');return{exit,stdout,stderr,killed,elapsed_ms:Date.now()-started};
}
try{
  await check('H3 flags origins and bounded opaque stdin',async()=>{
    const args=['--file=synthetic.xlsx','--api-url=http://127.0.0.1:80','--session-stdin'];assert.equal(parseArgs(args).effectiveFrom,'2026-01-01');
    for(const bad of [['--session='+token],['--file='],['--price-list='+token],['--api-url=http://127.0.0.1:5','--api-url=http://127.0.0.1:6'],['--effective-from='],['--apply=true'],['--wat='+token]])assert.throws(()=>parseArgs([...args,...bad]),error=>!error.message.includes(token));
    for(const origin of ['http://127.0.0.1:80','http://[::1]:65535/','http://127.0.0.1:1/'])assert(loopbackOrigin(origin));
    for(const origin of ['http://127.0.0.1','http://localhost:80','http://127.1:80','http://2130706433:80','https://127.0.0.1:80','http://user@127.0.0.1:80','http://127.0.0.1:0','http://127.0.0.1:65536','http://[::1]:80/path','http://127.0.0.1:80?x','http://127.0.0.1:80#x','http://example.com:80'])assert.throws(()=>loopbackOrigin(origin));
    for(const suffix of ['','\n','\r\n'])assert.equal(sessionText(Buffer.from(token+suffix)),token);
    assert.equal(sessionText(Buffer.from('a'.repeat(8192))).length,8192);
    for(const value of ['',token+'\n\n',token+'\0','a'.repeat(8193),'x\ry'])assert.throws(()=>sessionText(Buffer.from(value)));
  });
  await check('H3 actual catalog handlers gate every intent before connect and retain products',async()=>{
    const start=source.indexOf('const catalogRateCanonicalRequired ='),end=source.indexOf('app.patch("/api/catalog/products/:id",',start),standaloneStart=source.indexOf('app.post("/api/catalog/products/:id/rate",'),standaloneEnd=source.indexOf('app.post("/api/catalog/products/:id/active",',standaloneStart);
    const handlers=new Map();let connects=0;const calls=[];
    const client={query:async(sql,args)=>{calls.push({sql,args});return{rows:[{id:actor}]};},release(){}};
    const pool={connect:async()=>{connects++;return client;},query:async()=>({rows:[{id:actor,price:'12',cost_price:'3',current_rate:null}]})};
    new Function('app','pool','catalogProductSelect','asNumber','sendError',compile(source.slice(start,end)+source.slice(standaloneStart,standaloneEnd)))({post:(route,handler)=>handlers.set(route,handler)},pool,'select products',Number,(_res,error)=>{throw error;});
    const response=()=>({code:200,status(code){this.code=code;return this;},json(body){this.body=body;return this;}});
    const fields=['rate','piece_rate_code','pieceRateCode','piece_rate_name','pieceRateName','effective_from','effectiveFrom','effective_to','effectiveTo','rate_reason','rateReason','source_reference','sourceReference'];
    for(const field of fields)for(const value of [0,false,' ',[],{}]){const res=response(),before=connects;await handlers.get('/api/catalog/products')({body:{sku:'S',name:'N',[field]:value}},res);assert.equal(res.code,409);assert.equal(connects,before);assert.equal(res.body.code,'PRODUCT_RATE_CANONICAL_REQUIRED');}
    for(const field of fields)for(const value of [undefined,null,'']){const res=response();await handlers.get('/api/catalog/products')({body:{sku:'S',name:'N',[field]:value}},res);assert.equal(res.code,201);}
    for(const body of [{rate_unit:'SET',reason:'Product note',price:12,cost_price:3},{rateUnit:'HOUR'}]){const res=response();await handlers.get('/api/catalog/products')({body:{sku:'S',name:'N',...body}},res);assert.equal(res.code,201);assert.equal(calls.findLast(row=>row.sql.startsWith('insert into local_products')).args[8],body.rate_unit||'PIECE');}
    for(let n=0;n<3;n++){const before=connects,res=response();await handlers.get('/api/catalog/products/:id/rate')({body:{}},res);assert.equal(res.code,409);assert.equal(connects,before);}
    assert(!calls.some(row=>row.sql.includes('local_product_rates')||row.sql.includes('payroll-product-rate-config')));
  });
  const file=path.join(temporary,'original.xlsx'),rename=path.join(temporary,'renamed.xlsx');
  await workbook(file,[['  001É  ','Công  hoàn thành','9999999999999999.99','Ghi chú',null,'Ghi chú cột F'],[],['B','Công khác',12345,'']]);await copyFile(file,rename);
  await check('H4 actual server canonical serializer and semantic workbook determinism',async()=>{
    const rates=await readRates(file,'don-gia-moi'),body=importBody(rates,'0001-01-01');assert.equal(body.rows[0].values.ma_sp,'001É');assert.equal(body.rows[0].values.ten_sp,'Công  hoàn thành');assert.equal(body.rows[0].values.don_gia,'9999999999999999.99');assert.equal(body.rows[1].row,4);assert.equal(rates[0].note,'Ghi chú | Ghi chú cột F');assert(body.rows.every(row=>row.values.don_vi==='PIECE'));
    const payloads=[body,{...body,fingerprint:fingerprint(body)},undefined,{z:1,a:undefined,'Đ':null,'é':[1,{foo:'b',bar:'a'}]}];
    for(const value of payloads){assert.equal(canonicalJson(value),serializer.canonicalJson(value));assert.equal(fingerprint(value),serializer.payloadFingerprint(value));}
    assert.deepEqual(importBody(await readRates(rename,'don-gia-moi'),'0001-01-01'),body);
    for(const changed of [rates.map((row,i)=>i?row:{...row,note:'Changed'}),rates.slice().reverse(),rates.map((row,i)=>i?row:{...row,rowNumber:3})])assert.notEqual(fingerprint(importBody(changed,'0001-01-01')),fingerprint(body));
    assert.notEqual(fingerprint(importBody(rates,'0099-01-01')),fingerprint(body));
    for(const rate of [12500.25,{formula:'1+1',result:2},new Date('2026-01-01')]){const bad=path.join(temporary,'bad.xlsx');await workbook(bad,[['BAD','Invalid',rate]]);await assert.rejects(readRates(bad,'don-gia-moi'));}
    assert.throws(()=>importBody(Array(10001).fill(rates[0]),'2026-01-01'));
  });
  server=createServer(async(req,res)=>{
    const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=chunks.length?JSON.parse(Buffer.concat(chunks)):undefined;
    requests.push({path:req.url,body,authorized:req.headers.authorization==='Bearer '+token});res.setHeader('content-type','application/json');
    if(mode==='timeout-headers')return;
    if(mode==='timeout-body'||mode==='timeout-apply'&&req.url==='/api/payroll/import/apply'){res.writeHead(200);res.write('{"pending":');return;}
    if(req.url==='/redirect-target'){redirectHits++;res.end('{}');return;}
    if(mode==='redirect'){res.writeHead(307,{location:base+'/redirect-target'});res.end(token);return;}
    if(req.url==='/api/local-auth/me'){
      const me=mode==='reserved'?{user_id:'local-admin',role:'admin'}:mode==='accountant'?{user_id:actor,role:'accountant'}:mode==='nonuuid'?{user_id:'invalid',role:'manager'}:{user_id:actor,role:'manager'};res.end(JSON.stringify(me));return;
    }
    if(mode==='error'){res.statusCode=500;res.end(JSON.stringify({message:token}));return;}
    if(mode==='invalid'){res.end(token);return;}
    if(mode==='oversize'){res.end('"'+'x'.repeat(2*1024*1024)+'"');return;}
    if(mode==='wrong-fingerprint'){res.end(JSON.stringify({fingerprint:'0'.repeat(64),valid_rows:2,invalid_rows:0,errors:[]}));return;}
    if(mode==='lost'){res.destroy();return;}
    if(req.url==='/api/payroll/import/preview')res.end(JSON.stringify({fingerprint:serializer.payloadFingerprint(body),valid_rows:body.rows.length,invalid_rows:0,errors:[],message:token}));
    else res.end(JSON.stringify({ok:true,imported:body.rows.length,status:'DRAFT_OR_SUBMITTED',results:body.rows.map(row=>({sheet:row.sheet,row:row.row,id:randomUUID(),ignored:token})),reused:mode==='replay',message:token}));
  });server.listen(0,'127.0.0.1');await once(server,'listening');base='http://127.0.0.1:'+server.address().port;
  await check('H4 CLI default preview verifies fingerprint and rename same body',async()=>{
    requests=[];const a=await cli(file),b=await cli(rename);assert.equal(a.exit,0);assert.equal(b.exit,0);assert.equal(JSON.parse(a.stdout).status,'CHUA_NHAP');assert.deepEqual(requests.map(row=>row.path),['/api/local-auth/me','/api/payroll/import/preview','/api/local-auth/me','/api/payroll/import/preview']);assert.deepEqual(requests[1].body,requests[3].body);assert(requests.every(row=>row.authorized));
  });
  await check('H4 CLI direct apply and historical receipt never preview or approve',async()=>{
    for(const value of ['apply','replay']){mode=value;requests=[];const result=await cli(file,['--apply']);assert.equal(result.exit,0);const report=JSON.parse(result.stdout);assert.equal(report.status,'DRAFT_OR_SUBMITTED');assert.equal(report.reused,value==='replay');assert.deepEqual(requests.map(row=>row.path),['/api/local-auth/me','/api/payroll/import/apply']);const{fingerprint:sent,...rest}=requests[1].body;assert.equal(sent,serializer.payloadFingerprint(rest));}
  }).catch(error=>{throw error;});
  await check('H5 rejects nonpersonal authority before workbook request',async()=>{
    for(const value of ['reserved','accountant','nonuuid']){mode=value;requests=[];assert.equal((await cli(file)).exit,1);assert.equal(requests.length,1);}
  });
  await check('H4 transport redirect errors invalid JSON stream max and uncertain no retry',async()=>{
    for(const value of ['redirect','error','invalid','oversize','wrong-fingerprint','lost']){mode=value;requests=[];const result=await cli(file,value==='lost'?['--apply']:[]);assert.equal(result.exit,1);assert.equal(requests.length,value==='redirect'?1:2);if(value==='lost')assert.match(result.stderr,/lặp lại đúng lệnh --apply/);}
    assert.equal(redirectHits,0);
  });
  await check('H4 native current Node 30s deadline bounds headers body and uncertain apply',async()=>{
    for(const value of ['timeout-headers','timeout-body','timeout-apply']){mode=value;requests=[];const result=await cli(file,value==='timeout-apply'?['--apply']:[]);assert.equal(result.exit,1);assert.equal(result.killed,false,'Owned40s watchdog must not terminate CLI');assert(result.elapsed_ms>=29000&&result.elapsed_ms<35000,'Native request must fail around30s');assert.equal(result.stdout,'');assert.match(result.stderr,/Không thể hoàn tất kết nối API local/);assert.equal(requests.length,value==='timeout-apply'?2:1);if(value==='timeout-apply')assert.match(result.stderr,/lặp lại đúng lệnh --apply/);deadlines.push({case:value,elapsed_ms:result.elapsed_ms,exit:result.exit,killed:false,requests:requests.length,stderr_fixed:true});console.log('PASS native deadline '+value+' '+result.elapsed_ms+'ms');}
  });
  await writeFile(path.join(stage,'own-pure-proof.json'),JSON.stringify({status:'PASS',groups:checks,native_deadline_cases:deadlines,node_version:process.version,server_serializer_actual:true,postgres_operations:0,token_saved:false,no_business_data:true},null,2)+'\n');
  console.log(JSON.stringify({status:'PASS',groups:checks.length}));
}finally{
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  const target=path.resolve(temporary);assert(target.startsWith(stage+path.sep)&&path.basename(target).startsWith('pure-owned-'));await rm(target,{recursive:true,force:true});
}
