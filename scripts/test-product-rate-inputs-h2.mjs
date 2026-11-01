import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,cp,mkdtemp,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import ExcelJS from 'exceljs';
import * as inputs from '../server/product-rate-inputs.mjs';

const transpile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
export async function loadActualWorkbookParser(){
 const source=await readFile('src/components/PayrollExcelImport.tsx','utf8'),ast=ts.createSourceFile('parser.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const selected=ast.statements.filter(node=>ts.isFunctionDeclaration(node)&&['cellValue','canonicalHeader','readWorkbook'].includes(node.name?.text)||ts.isVariableStatement(node)&&node.declarationList.declarations.some(d=>d.name.getText(ast)==='headerAliases')).map(node=>node.getText(ast)).join('\n');
 return new Function('ExcelJS','rateCellValue',transpile(selected)+'\nreturn {readWorkbook,cellValue};')(ExcelJS,inputs.rateCellValue);
}
export async function workbookFile(rows,{sheet='BANG_GIA_CONG_MAY',headers=['__example','ma_sp','ten_sp','don_gia','tu_ngay','den_ngay','don_vi','ly_do']}={}){
 const book=new ExcelJS.Workbook(),tab=book.addWorksheet(sheet);tab.addRow(headers);for(const row of rows)tab.addRow(row);
 const bytes=await book.xlsx.writeBuffer();return{name:'synthetic-h2.xlsx',arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
}
async function officialFunctions(){
 const source=await readFile('server/product-rate-authoring.ts','utf8'),ast=ts.createSourceFile('official.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 const names=['fail','productRateText','productRateDate','productRateExact'];
 const selected=ast.statements.filter(node=>ts.isFunctionDeclaration(node)&&names.includes(node.name?.text)||ts.isVariableStatement(node)&&node.declarationList.declarations.some(d=>names.includes(d.name.getText(ast)))).map(node=>node.getText(ast)).join('\n');
 const resolver=await readFile('server/product-labor-resolver.ts','utf8'),ra=ts.createSourceFile('resolver.ts',resolver,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS),key=ra.statements.find(node=>ts.isVariableStatement(node)&&node.declarationList.declarations.some(d=>d.name.getText(ra)==='codeKey')).getText(ra);
 return import('data:text/javascript,'+encodeURIComponent(transpile(selected+'\n'+key)));
}
export async function runPure(){
 const passed=[],check=async(name,fn)=>{await fn();passed.push(name);console.log('PASS '+name);};
 const official=await officialFunctions();
 await check('P01 exact18,2 strings and15digit integer-only compatibility',()=>{
  for(const[a,b]of [['0.01','0.01'],['12500.25','12500.25'],['9999999999999999.99','9999999999999999.99'],['00012500.2','12500.20'],[1,'1.00'],[999999999999999,'999999999999999.00']])assert.equal(inputs.rateInput(a),b);
  for(const value of ['0','0.00','-1','+1','.1','1.','1e3','1,000','1.000,50',' 1','1 ','1 000','1\u00a0000','1 VND','10000000000000000','0.001',0,-1,12500.25,0.30000000000000004,1000000000000000,9007199254740992,true,false,{},[],null,undefined,NaN,Infinity])assert.throws(()=>inputs.rateInput(value),String(value));
  for(let n=1;n<=1000;n++){const value=String(n)+'.'+String(n%100).padStart(2,'0');assert.equal(inputs.rateInput(value),official.productRateExact(value));}
 });
 await check('P02 real Gregorian dates identical to official parser',()=>{
  for(const value of ['0001-01-01','0099-12-31','2000-02-29','9999-12-31'])assert.equal(inputs.rateDate(value),official.productRateDate(value));
  for(const value of ['0000-01-01','10000-01-01','1900-02-29','2100-02-29','2026-02-30','2026-00-01','2026-13-01','2026-01-00','2026-1-01','2026-01-1','infinity','0001-01-01 BC','2026-01-01T00:00:00Z',' 2026-01-01',new Date()])assert.throws(()=>inputs.rateDate(value));
 });
 await check('P03 CLI bridge actual resolver Unicode differential and literal text',()=>{
  const corpus=['ĐỆM','ĐE\u0323\u0302M','İ','i\u0307','ΟΣ','ος','Σ','ς','  001Ab  ','A  B','A B','😀','\u0000','\ud800',''];
  for(let i=1;i<=2500;i++)corpus.push(String.fromCodePoint(i)+(i%2?'İ':'ΟΣ')+' \u0301');
  for(const value of corpus)assert.equal(inputs.cliRateCodeKey(value),official.codeKey(value));
  const parsed=inputs.rateFields({code:'  001A  B  ',name:'  Công  may  ',rate:'0.01',effective_from:'0001-01-01'});assert.equal(parsed.code,'001A  B');assert.equal(parsed.name,'Công  may');
  for(const value of ['',' ','\u0000','A\u0000B','\ud800','\udc00',1,true,{},null])assert.throws(()=>inputs.rateText(value,'Mã',1,120));
  for(const unit of [undefined,'PIECE','PRODUCT','CÁI','SẢN PHẨM',' product '])assert.equal(inputs.rateUnit(unit),'PIECE');for(const unit of ['SET','BỘ','HOUR','METER','UNKNOWN'])assert.throws(()=>inputs.rateUnit(unit));
  assert.throws(()=>inputs.catalogRateFields({rate:'1',piece_rate_code:'A',pieceRateCode:'B',piece_rate_name:'Công'},'2026-01-01'));
  assert.throws(()=>inputs.catalogRateFields({rate:'1',piece_rate_code:'A',name:'Sale product'},'2026-01-01'));
  for(const [patch,field]of [[{code:''},'ma_sp'],[{code:'İ'.repeat(120)},'ma_sp'],[{name:''},'ten_sp'],[{rate:'0'},'don_gia'],[{unit:'HOUR'},'don_vi'],[{effective_from:'1900-02-29'},'tu_ngay'],[{effective_to:'2025-01-01'},'den_ngay']])assert.throws(()=>inputs.rateFields({code:'CODE',name:'Name',rate:'1',effective_from:'2026-01-01',...patch}),error=>error.field===field);
 });
 await check('P04 canonical source matching rejects unsafe history and never chooses winner',()=>{
  const value=inputs.rateFields({code:'ĐỆM',name:'Công may',rate:'12500.25',effective_from:'2026-01-01'}),source={id:'source-1',piece_rate_code:'đe\u0323\u0302m',piece_rate_name:'Công may',rate_exact:'12500.25',rate_unit:'PIECE',effective_from:'2027-01-01',effective_to:null,status:'APPROVED'};
  assert.throws(()=>inputs.assertRateInsertAllowed([source],value,official.codeKey),/source-1/);
  assert.deepEqual(inputs.matchingRateSources([{...source,piece_rate_code:'OTHER',rate_exact:'bad'}],value.code,official.codeKey),[]);
  for(const patch of [{rate_exact:'0'},{rate_unit:'HOUR'},{piece_rate_name:null},{effective_from:'infinity'},{effective_to:'2025-01-01'},{status:'DISCARDED'}])assert.throws(()=>inputs.matchingRateSources([{...source,...patch}],value.code,official.codeKey),/source-1/);
  assert.throws(()=>inputs.assertRateInsertAllowed([{...source,status:'DRAFT'}],value,official.codeKey,{draft:true}),/source-1/);
  assert.doesNotThrow(()=>inputs.assertRateInsertAllowed([{...source,effective_from:'0001-01-01',effective_to:'2025-12-31'}],value,official.codeKey));
  assert.throws(()=>inputs.assertRateInsertAllowed([{...source,piece_rate_name:'Công  may',effective_to:'2027-02-01'}],value,official.codeKey));
 });
 await check('P05 actual browser workbook parser preserves exact strings and rejects raw objects',async()=>{
  const parser=await loadActualWorkbookParser();
  const file=await workbookFile([['NHẬP','001İ','Công  may','9999999999999999.99','0001-01-01','','PIECE','Synthetic'],['NHẬP','B','Công may',12500,'0099-12-31','','PRODUCT','Synthetic']]);
  const rows=await parser.readWorkbook(file);assert.equal(rows[0].values.don_gia,'9999999999999999.99');assert.equal(rows[0].values.ma_sp,'001İ');assert.equal(rows[1].values.don_gia,'12500.00');assert.equal(rows[0].values.tu_ngay,'0001-01-01');
  for(const cell of [12500.25,1000000000000000,{formula:'1+1',result:2},{error:'#DIV/0!'},{richText:[{text:'12500.25'}]},new Date('2026-01-01')])await assert.rejects(async()=>parser.readWorkbook(await workbookFile([['NHẬP','C','Công may',cell,'2026-01-01','','PIECE','Synthetic']])),/dòng 2/);
  assert.throws(()=>inputs.rateCellValue({sharedFormula:'D2',result:2},'don_gia','Bảng giá công may · dòng 2'),/dòng 2/);
  for(const column of [1,2,4,5]){const row=['NHẬP','C','Công may','1','2026-01-01','','PIECE','Synthetic'];row[column]={formula:'"A"',result:'A'};await assert.rejects(async()=>parser.readWorkbook(await workbookFile([row])),/dòng 2/);}
  assert.equal((await parser.readWorkbook(await workbookFile([['NHẬP','W',{formula:'1+1',result:2}]],{sheet:'NHAN_SU',headers:['__example','ma_nv','ho_ten']})))[0].values.ho_ten,2);
  assert.equal((await parser.readWorkbook(await workbookFile([['DEMO','C','Công may',{formula:'1+1',result:2},'2026-01-01','','PIECE','Synthetic']]))).length,0);
 });
 await check('P06 runtime helper has no side effects and server build copies real helper',async()=>{
  const helper=await readFile('server/product-rate-inputs.mjs','utf8');assert(!/\b(?:import|require|process|window|document)\b/.test(helper.replace(/^\/\/.*$/gm,'')));
  const build=await readFile('scripts/build-server.mjs','utf8');assert(build.includes("await cp('server/product-rate-inputs.mjs', 'server-dist/product-rate-inputs.mjs')"));
  const dir=await mkdtemp(path.join(tmpdir(),'h2-runtime-pure-'));try{
   await mkdir(path.join(dir,'server/db/migrations'),{recursive:true});await writeFile(path.join(dir,'server/db/migrations/000_owned.sql'),'select 1;\n');
   await cp('server/product-rate-inputs.mjs',path.join(dir,'server/product-rate-inputs.mjs'));
   const built=spawnSync(process.execPath,[path.resolve('scripts/build-server.mjs')],{cwd:dir,encoding:'utf8',windowsHide:true});assert.equal(built.status,0,built.stderr);
   const dest=path.join(dir,'server-dist/product-rate-inputs.mjs');assert.equal(await readFile(dest,'utf8'),helper);assert.equal(await readFile(path.join(dir,'server-dist/db/migrations/000_owned.sql'),'utf8'),'select 1;\n');
   await cp('server/product-rate-inputs.d.mts',path.join(dir,'server-dist/product-rate-inputs.d.mts'));
   const bridge=path.join(dir,'server-dist/runtime-bridge.mts');await writeFile(bridge,"import {rateInput} from './product-rate-inputs.mjs'; console.log(rateInput('9999999999999999.99'));\n");
   const compiled=spawnSync(process.execPath,[path.resolve('node_modules/typescript/bin/tsc'),bridge,'--module','NodeNext','--moduleResolution','NodeNext','--target','ES2022','--skipLibCheck','true'],{encoding:'utf8',windowsHide:true});assert.equal(compiled.status,0,compiled.stdout+compiled.stderr);
   const executed=spawnSync(process.execPath,[path.join(dir,'server-dist/runtime-bridge.mjs')],{encoding:'utf8',windowsHide:true});assert.equal(executed.status,0,executed.stderr);assert.equal(executed.stdout.trim(),'9999999999999999.99');
   const packed=await import(pathToFileURL(dest));assert.equal(packed.rateInput('0.01'),'0.01');
  }finally{await rm(dir,{recursive:true,force:true});}
 });
 return{status:'PASS',groups:passed.length,passed,unicode_cases:2515,scope:'pure actual helper differential and actual parser compiled from component; not browser interaction'};
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)console.log(JSON.stringify(await runPure()));
