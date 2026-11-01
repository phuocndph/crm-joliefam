// Exact local rate input only. No database, environment, node or browser effects.
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
export function rateText(value,label,min=1,max=500){
 if(typeof value!=='string'||value.includes('\u0000')||/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/u.test(value))fail(`${label} phải là văn bản hợp lệ.`);
 const text=value.trim();
 if(text.length<min||text.length>max)fail(`${label} cần từ ${min} đến ${max} ký tự.`);
 return text;
}
export function exactRateText(value,label='Đơn giá'){
 if(typeof value!=='string'||!/^\d{1,16}(?:\.\d{1,2})?$/.test(value))fail(`${label}: dùng chuỗi số dương, tối đa 16 chữ số nguyên và 2 số lẻ; không dùng dấu phân cách hàng nghìn.`);
 const [whole,fraction='']=value.split('.'),cents=fraction.padEnd(2,'0');
 if(BigInt(whole)*100n+BigInt(cents)<=0n)fail(`${label} phải lớn hơn 0.`);
 return BigInt(whole).toString()+'.'+cents;
}
export function rateInput(value,label='Đơn giá'){
 if(typeof value==='number'){
  if(!Number.isSafeInteger(value)||value<=0||value>999999999999999)fail(`${label}: ô số chỉ nhận số nguyên dương tối đa 15 chữ số. Với số lẻ hoặc lớn hơn, định dạng ô Text và nhập lại số gốc.`);
  return BigInt(value).toString()+'.00';
 }
 return exactRateText(value,label);
}
export function rateDate(value,label='Ngày hiệu lực'){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))fail(`${label}: nhập văn bản YYYY-MM-DD.`);
 const[y,m,d]=value.split('-').map(Number),leap=y%4===0&&(y%100!==0||y%400===0),days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
 if(y<1||m<1||m>12||d<1||d>days[m-1])fail(`${label}: ngày không hợp lệ.`);
 return value;
}
export function rateUnit(value){
 if(value===undefined||value===null||value==='')return 'PIECE';
 const token=rateText(value,'Đơn vị',1,30).toUpperCase();
 if(!['PIECE','PRODUCT','CÁI','SẢN PHẨM'].includes(token))fail('Đơn vị công may phải là một sản phẩm hoàn thành (PIECE).');
 return 'PIECE';
}
export const rateNameKey=value=>rateText(value,'Tên công may',1,500).normalize('NFC');
// Plain-node compatibility bridge. Differential QA pins it to the actual TS resolver.
export const cliRateCodeKey=value=>String(value??'').normalize('NFC').trim().toLowerCase();
export function rateFields(value){
 const field=(name,fn)=>{try{return fn();}catch(error){throw Object.assign(error,{field:name});}};
 const code=field('ma_sp',()=>{const literal=rateText(value.code,'Mã công may Excel',1,120);if(cliRateCodeKey(literal).length>120)fail('Mã công may sau chuẩn hóa không được dài quá 120 ký tự.');return literal;});
 const name=field('ten_sp',()=>rateText(value.name,'Tên công may',1,500));
 const rate=field('don_gia',()=>rateInput(value.rate)),unit=field('don_vi',()=>rateUnit(value.unit));
 const from=field('tu_ngay',()=>rateDate(value.effective_from,'Từ ngày'));
 const to=field('den_ngay',()=>{if(value.effective_to===null||value.effective_to===undefined||value.effective_to==='')return null;const date=rateDate(value.effective_to,'Đến ngày');if(date<from)fail('Đến ngày không được trước từ ngày.');return date;});
 return{code,name,rate,unit,effective_from:from,effective_to:to};
}
export function catalogRateFields(body,defaultDate){
 const alias=(snake,camel,label)=>{
  if(body[snake]!==undefined&&body[camel]!==undefined&&body[snake]!==body[camel])fail(`${label}: hai trường dữ liệu không khớp.`);
  return body[snake]!==undefined?body[snake]:body[camel];
 };
 return rateFields({code:alias('piece_rate_code','pieceRateCode','Mã công may'),name:alias('piece_rate_name','pieceRateName','Tên công may'),rate:body.rate,unit:body.rate_unit,effective_from:body.effective_from===undefined?defaultDate:body.effective_from,effective_to:body.effective_to});
}
export function rateCellValue(value,field,context){
 if(value!==null&&value!==undefined&&typeof value==='object')fail(`${context} · ${field}: không dùng công thức, ô ngày hoặc ô định dạng phức hợp; nhập giá trị gốc dạng Text.`);
 if(field==='don_gia'&&value!==null&&value!==undefined&&value!=='')return rateInput(value,`${context} · Đơn giá`);
 if(['ma_sp','ten_sp','tu_ngay','den_ngay','don_vi'].includes(field)&&value!==null&&value!==undefined&&typeof value!=='string')fail(`${context} · ${field}: nhập văn bản (Text).`);
 return value??'';
}
export const rateRangesOverlap=(a,b)=>a.effective_from<=(b.effective_to??'9999-12-31')&&b.effective_from<=(a.effective_to??'9999-12-31');
export function matchingRateSources(rows,requestedCode,keyOf){
 const key=keyOf(requestedCode);
 return rows.filter(row=>keyOf(row.piece_rate_code)===key).map(row=>{
  try{
   const fields=rateFields({code:row.piece_rate_code,name:row.piece_rate_name,rate:row.rate_exact,unit:row.rate_unit,effective_from:row.effective_from,effective_to:row.effective_to});
   if(row.rate_unit!=='PIECE')fail('Đơn vị nguồn chưa phải PIECE.');
   if(!['DRAFT','APPROVED','RETIRED'].includes(row.status))fail('Trạng thái nguồn không được hỗ trợ.');
   return{...row,...fields};
  }catch(error){fail(`Đơn giá nguồn ${row.id}: ${error.message} Cần quản lý kiểm tra lại.`,409);}
 });
}
export function assertRateInsertAllowed(rows,value,keyOf,{draft=false}={}){
 const matches=matchingRateSources(rows,value.code,keyOf);
 for(const row of matches){
  if(rateNameKey(row.name)!==rateNameKey(value.name)||row.unit!==value.unit)fail(`Mã công may có tên hoặc đơn vị khác ở bản ghi ${row.id}; cần quản lý kiểm tra.`,409);
  if(!rateRangesOverlap(row,value))continue;
  if(draft?row.status==='DRAFT':row.status==='APPROVED')fail(`Mã công may đã có ${draft?'bản nháp':'đơn giá đã duyệt'} trùng khoảng hiệu lực (${row.id}). Dùng màn hình Đơn giá công may để xem và điều chỉnh.`,409);
 }
 return matches;
}
