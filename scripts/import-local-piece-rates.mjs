import { createHash } from 'node:crypto';
import path from 'node:path';
import { access } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import ExcelJS from 'exceljs';
import {rateText,rateInput,rateDate,rateCellValue,cliRateCodeKey} from '../server/product-rate-inputs.mjs';

const REVIEW_PATH='/production-attendance?tab=rates';
const MAX_RESPONSE=2*1024*1024,MAX_REQUEST=25*1024*1024;
class SafeError extends Error {}
const fail=message=>{throw new SafeError(message);};
export function parseArgs(argv) {
  const options={},seen=new Set();
  const values=new Map([['file','file'],['sheet','sheet'],['effective-from','effectiveFrom'],['api-url','apiUrl']]);
  for(const argument of argv){
    if(/^--price-list(?:=|$)/.test(argument))fail('Đã bỏ --price-list: nhập đơn giá chỉ tạo nháp công may, không sửa bảng giá bán.');
    const match=/^--([a-z-]+)(?:=([\s\S]*))?$/.exec(argument);
    if(!match)fail('Tham số không hợp lệ.');
    const[,key,value]=match;
    if(seen.has(key))fail('Tham số bị lặp.');
    seen.add(key);
    if(key==='apply'||key==='session-stdin'){
      if(value!==undefined)fail('Cờ thao tác không được kèm giá trị.');
      options[key==='apply'?'apply':'sessionStdin']=true;
    }else if(values.has(key)){
      if(value===undefined||value==='')fail('Tham số bắt buộc có giá trị không rỗng.');
      options[values.get(key)]=value;
    }else fail('Tham số không được hỗ trợ.');
  }
  if(!options.file||!options.apiUrl||!options.sessionStdin)fail('Cần --file, --api-url và --session-stdin. Có thể nhập Excel trong giao diện quản lý nếu chưa có phiên đăng nhập.');
  options.sheet??='don-gia-moi';options.effectiveFrom??='2026-01-01';
  try{rateDate(options.effectiveFrom,'Ngày hiệu lực');}catch{fail('Ngày hiệu lực không hợp lệ; dùng YYYY-MM-DD.');}
  options.apiUrl=loopbackOrigin(options.apiUrl);
  return options;
}

export function loopbackOrigin(value){
  const match=/^http:\/\/(127\.0\.0\.1|\[::1\]):([0-9]{1,5})\/?$/.exec(value);
  if(!match||Number(match[2])<1||Number(match[2])>65535)fail('API phải là HTTP loopback 127.0.0.1 hoặc [::1], có cổng rõ ràng từ 1 đến 65535.');
  return value.replace(/\/$/,'');
}

export function sessionText(buffer){
  let text;
  try{text=new TextDecoder('utf-8',{fatal:true}).decode(buffer);}catch{fail('Phiên stdin không hợp lệ. Hãy dùng giao diện quản lý.');}
  text=text.replace(/\r?\n$/,'');
  if(!text||Buffer.byteLength(text)>8192||/[\r\n\0]/.test(text))fail('Phiên stdin phải là một chuỗi không rỗng, tối đa 8192 byte, không xuống dòng.');
  return text;
}
async function readSession(stream){
  const chunks=[];let size=0;
  for await(const chunk of stream){size+=Buffer.byteLength(chunk);if(size>8194)fail('Phiên stdin vượt giới hạn cho phép.');chunks.push(Buffer.from(chunk));}
  return sessionText(Buffer.concat(chunks));
}

function scalarCellValue(cell){
  const value=cell.value;
  if(value&&typeof value==='object'&&'result'in value)return value.result;
  if(value&&typeof value==='object'&&'text'in value)return value.text;
  return value;
}
function normalizedText(value){return String(value??'').replace(/\s+/g,' ').trim();}

// A:C retain the H2 raw-cell validation: no formula result or rounded money input.
export async function readRates(filePath,sheetName){
  await access(filePath);
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.readFile(filePath);
  const worksheet=workbook.getWorksheet(sheetName);
  if(!worksheet)throw new Error('Không tìm thấy sheet đơn giá.');
  const headerCode=normalizedText(scalarCellValue(worksheet.getCell('A1'))).toLowerCase();
  const headerRate=normalizedText(scalarCellValue(worksheet.getCell('C1'))).toLowerCase();
  if(headerCode!=='ma_sp'||headerRate!=='don_gia')throw new Error('Sheet đơn giá cần cột A:C là ma_sp / tên sản phẩm / don_gia.');
  const rates=[],seenCodes=new Map();
  for(let rowNumber=2;rowNumber<=worksheet.rowCount;rowNumber+=1){
    const row=worksheet.getRow(rowNumber);
    const rawCode=row.getCell(1).value,rawName=row.getCell(2).value,rawRate=row.getCell(3).value;
    if([rawCode,rawName,rawRate].every(value=>value===null||value===undefined||value===''))continue;
    const context=`Dòng ${rowNumber}`;
    const code=rateText(rateCellValue(rawCode,'ma_sp',context),`${context} · Mã công may Excel`,1,120);
    const name=rateText(rateCellValue(rawName,'ten_sp',context),`${context} · Tên công may`,1,500);
    if(cliRateCodeKey(code).length>120)throw new Error('Mã công may sau chuẩn hóa quá dài.');
    const key=cliRateCodeKey(code);if(seenCodes.has(key))throw new Error('Mã công may bị trùng trong file.');seenCodes.set(key,rowNumber);
    const notes=[];
    for(let column=4;column<=worksheet.columnCount;column+=1){const note=normalizedText(scalarCellValue(row.getCell(column)));if(note)notes.push(note);}
    rates.push({rowNumber,code,name,rate:rateInput(rateCellValue(rawRate,'don_gia',context),`${context} · Đơn giá`),note:notes.join(' | ')});
    if(rates.length>10000)throw new Error('File vượt giới hạn 10000 dòng.');
  }
  if(!rates.length)throw new Error('Sheet không có dòng đơn giá.');
  return rates;
}

// Compatibility bridge; tests compare this with the actual server functions.
export const canonicalJson=value=>{
  if(Array.isArray(value))return `[${value.map(canonicalJson).join(',')}]`;
  if(value&&typeof value==='object')return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  return JSON.stringify(value===undefined?null:value);
};
export const fingerprint=value=>createHash('sha256').update(canonicalJson(value)).digest('hex');
export function importBody(rates,effectiveFrom){
  if(!rates.length||rates.length>10000)fail('Số dòng đơn giá không hợp lệ.');
  const semantic={schema:'piece-rate-workbook-http-v1',rows:rates.map(({rowNumber,code,name,rate,note})=>({row:rowNumber,code,name,rate,note,unit:'PIECE',effective_from:effectiveFrom,effective_to:null}))};
  const source='piece-rate-workbook-http-v1:'+fingerprint(semantic);
  const rows=rates.map(entry=>({sheet:'BANG_GIA_CONG_MAY',row:entry.rowNumber,values:{ma_sp:entry.code,ten_sp:entry.name,don_gia:entry.rate,don_vi:'PIECE',tu_ngay:effectiveFrom,den_ngay:null,nguon:source,ly_do:'Nhập Excel công may (HTTP v1)'+(entry.note?': '+entry.note:'')}}));
  if(rows.some(row=>row.values.ly_do.length>1000))fail('Ghi chú đơn giá vượt giới hạn cho phép.');
  return{template_key:'payroll-v1',source_name:source,rows};
}

async function request(origin,route,token,body){
  const controller=new AbortController();let reader,timer;
  const cancelReader=()=>{try{void reader?.cancel().catch(()=>{});}catch{ /* Cleanup never exposes transport errors. */ }};
  // A stalled native body reader may not settle on abort alone. The deadline
  // covers the complete operation and also cancels that reader explicitly.
  const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();cancelReader();reject(new SafeError('Không thể hoàn tất kết nối API local.'));},30000);});
  try{
    return await Promise.race([deadline,(async()=>{
      const encoded=body===undefined?undefined:JSON.stringify(body);
      if(encoded!==undefined&&Buffer.byteLength(encoded)>MAX_REQUEST)fail('Nội dung yêu cầu vượt giới hạn cho phép.');
      const response=await fetch(origin+route,{method:body===undefined?'GET':'POST',headers:{authorization:'Bearer '+token,...(body===undefined?{}:{'content-type':'application/json'})},body:encoded,signal:controller.signal,redirect:'error',credentials:'omit'});
      reader=response.body?.getReader();
      if(!response.ok){cancelReader();fail(response.status===401?'Phiên đăng nhập không hợp lệ. Hãy dùng giao diện quản lý.':response.status===403?'Tài khoản hiện không có quyền quản lý đơn giá.':response.status===409?'Nguồn đơn giá xung đột; hãy kiểm tra tại mục Đơn giá công may.':'API từ chối yêu cầu nhập đơn giá.');}
      const chunks=[];let size=0;
      if(reader)while(true){const{done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_RESPONSE){controller.abort();cancelReader();fail('Phản hồi API vượt giới hạn cho phép.');}chunks.push(Buffer.from(value));}
      try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail('Phản hồi API không hợp lệ.');}
    })()]);
  }catch(error){
    const safe=new Set(['Nội dung yêu cầu vượt giới hạn cho phép.','Phiên đăng nhập không hợp lệ. Hãy dùng giao diện quản lý.','Tài khoản hiện không có quyền quản lý đơn giá.','Nguồn đơn giá xung đột; hãy kiểm tra tại mục Đơn giá công may.','API từ chối yêu cầu nhập đơn giá.','Phản hồi API vượt giới hạn cho phép.','Phản hồi API không hợp lệ.']);
    fail(safe.has(error?.message)?error.message:'Không thể hoàn tất kết nối API local.');
  }finally{clearTimeout(timer);cancelReader();}
}
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const count=value=>Number.isInteger(value)&&value>=0&&value<=10000;
const redact=(text,token)=>token?text.replaceAll(token,'[đã ẩn]'):text;
export async function run(argv,stream=process.stdin,output=text=>process.stdout.write(text+'\n')){
  let token='',applying=false;
  try{
    const options=parseArgs(argv);
    token=await readSession(stream);
    const me=await request(options.apiUrl,'/api/local-auth/me',token);
    if(!uuid(me?.user_id)||!['admin','manager'].includes(me?.role))fail('Cần phiên đăng nhập cá nhân của quản lý hoặc quản trị viên. Hãy dùng giao diện quản lý.');
    let rates;
    try{rates=await readRates(path.resolve(options.file),options.sheet);}catch{fail('File Excel không hợp lệ: kiểm tra sheet, mã, tên, đơn giá dạng Text và ghi chú.');}
    const body=importBody(rates,options.effectiveFrom),digest=fingerprint(body);
    applying=Boolean(options.apply);
    const result=await request(options.apiUrl,applying?'/api/payroll/import/apply':'/api/payroll/import/preview',token,applying?{...body,fingerprint:digest}:body);
    let report;
    if(!applying){
      if(result?.fingerprint!==digest||!count(result?.valid_rows)||!count(result?.invalid_rows)||result.valid_rows+result.invalid_rows!==body.rows.length||!Array.isArray(result?.errors))fail('Phản hồi xem trước không khớp nội dung file.');
      const errors=result.errors.map(error=>({row:Number.isInteger(error?.row)&&error.row>=1&&error.row<=1048576?error.row:null,field:['ma_sp','ten_sp','don_gia','don_vi','tu_ngay','den_ngay','ly_do','nguon'].includes(error?.field)?error.field:null}));
      report={mode:'PREVIEW_ONLY',status:'CHUA_NHAP',fingerprint:digest,valid_rows:result.valid_rows,invalid_rows:result.invalid_rows,errors,review_path:REVIEW_PATH};
    }else{
      if(result?.ok!==true||result.status!=='DRAFT_OR_SUBMITTED'||result.imported!==body.rows.length||!Array.isArray(result.results)||result.results.length!==result.imported||new Set(result.results.map(row=>row?.id)).size!==result.imported||result.results.some((row,index)=>!uuid(row?.id)||row.sheet!=='BANG_GIA_CONG_MAY'||row.row!==body.rows[index].row))fail('Phản hồi nhập đơn giá không hợp lệ.');
      report={mode:'APPLY',status:'DRAFT_OR_SUBMITTED',fingerprint:digest,imported:result.imported,draft_ids:result.results.map(row=>row.id),reused:result.reused===true,receipt:result.reused===true?'HISTORICAL_SAVED_RESULT_REFRESH_REVIEW':'NEW_DRAFTS',review_path:REVIEW_PATH};
    }
    output(redact(JSON.stringify(report,null,2),token));
    return report;
  }catch(error){
    // Never echo arbitrary API/workbook values. Only fixed guard messages reach here.
    const message=redact(error instanceof SafeError?error.message:'Không thể nhập đơn giá.',token);
    throw new Error(message+(applying?' Nếu chưa rõ đã nhập hay chưa, lặp lại đúng lệnh --apply, cùng file, ngày và tài khoản; không tự đổi nội dung.':''));
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  run(process.argv.slice(2)).catch(error=>{process.stderr.write(error.message+'\n');process.exitCode=1;});
}
