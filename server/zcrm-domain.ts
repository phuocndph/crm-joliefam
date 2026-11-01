import { createHash,createCipheriv,createDecipheriv,randomBytes,createHmac,timingSafeEqual } from 'node:crypto';
import { businessDecimal,quoteLineAmount } from './quote-calculation.js';
export type Row=Record<string,unknown>;
export type DraftLine={productId:string;name:string;kind:'stock'|'custom';variant:string;warehouseId:string;quantity:number;unit:string;proposedPrice:number|null;specifications:Record<string,string>;attachments:{name:string;mediaId:string}[]};
export type Draft={customerId:string|null;newCustomer?:{name:string;phone:string;kind:'hotel'|'individual'};orderedBy:string;recipient:{name:string;phone:string;address:string};desiredDate:string;notes:string;lines:DraftLine[]};
export class ZcrmError extends Error { constructor(message:string,public status=422,public code='VALIDATION'){super(message);} }
export function fail(message:string,status=422,code='VALIDATION'):never {throw new ZcrmError(message,status,code);}
export function obj(v:unknown):Row {if(!v||typeof v!=='object'||Array.isArray(v))return fail('Dữ liệu phải là một đối tượng.');return v as Row;}
export function txt(v:unknown,max=200,required=false):string {if(v==null){if(required)return fail('Thiếu thông tin bắt buộc.');return '';}if(typeof v!=='string'||v.includes('\0')||v.length>max||required&&!v.trim())return fail('Thông tin nhập thiếu hoặc quá dài.');return v.trim();}
export const ident=(v:unknown)=>txt(v,128,true);
export function uuid(v:unknown):string {const t=ident(v);if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t))return fail('Mã bản ghi không hợp lệ.');return t;}
export const list=(v:unknown,max:number):unknown[]=>{if(!Array.isArray(v)||v.length>max)return fail(`Danh sách vượt giới hạn ${max}.`);return v;};
export function vnd(v:unknown,label='Số tiền'):number {if((typeof v!=='number'&&typeof v!=='string')||v===''||!/^\d+(?:\.0+)?$/.test(String(v))||!Number.isSafeInteger(Number(v))||Number(v)<0)return fail(`${label} phải là VND nguyên, không âm.`);return Number(v);}
export function quantity(v:unknown):number {const q=businessDecimal(v,'Số lượng',4).value;if(q<=0||q>1e7)return fail('Số lượng phải lớn hơn 0, tối đa 10.000.000 và 4 chữ số thập phân.');return q;}
/** Exact four-decimal ledger units; comparisons never use binary float sums. */
export function quantityUnits(v:unknown):bigint {const text=String(v),negative=text.startsWith('-'),d=businessDecimal(negative?text.slice(1):v,'Số lượng',4);return d.numerator*10000n/d.denominator*(negative?-1n:1n);}
export function dateOnly(v:unknown):string {const s=txt(v,10);if(s&&(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s))||new Date(s).toISOString().slice(0,10)!==s))return fail('Ngày không hợp lệ.');return s;}
export function parseDraft(value:unknown):Draft {
 const b=obj(value),r=obj(b.recipient??{});
 const lines=list(b.lines,100).map(raw=>{const l=obj(raw);if(l.kind!=='stock'&&l.kind!=='custom')return fail('Loại hàng không hợp lệ.');
  if(typeof l.quantity!=='number'||!Number.isFinite(l.quantity))return fail('Số lượng phải là số.');quantity(l.quantity);
  const specs=obj(l.specifications??{});if(Object.keys(specs).length>30)return fail('Tối đa 30 trường quy cách.');
  const specifications=Object.fromEntries(Object.entries(specs).map(([k,v])=>[txt(k,80,true),txt(v,2000)]));
  if(l.proposedPrice!=null&&(typeof l.proposedPrice!=='number'||!Number.isSafeInteger(l.proposedPrice)||l.proposedPrice<0||l.proposedPrice>1e12))fail('Giá đề xuất phải là số VND nguyên tối đa 1.000.000.000.000.');
  const attachments=list(l.attachments??[],10).map(a=>{const f=obj(a);return {name:txt(f.name,200,true),mediaId:ident(f.mediaId)};});
  return {productId:txt(l.productId,128),name:txt(l.name,200),kind:l.kind,variant:txt(l.variant,200),warehouseId:txt(l.warehouseId,128),quantity:l.quantity,unit:txt(l.unit,30),proposedPrice:l.proposedPrice==null?null:vnd(l.proposedPrice,'Giá đề xuất'),specifications,attachments} as DraftLine;
 });
 let newCustomer:Draft['newCustomer'];if(b.newCustomer){const c=obj(b.newCustomer);if(c.kind!=='hotel'&&c.kind!=='individual')return fail('Loại khách chưa đúng.');newCustomer={name:txt(c.name,200),phone:txt(c.phone,40),kind:c.kind};}
 return {customerId:b.customerId?ident(b.customerId):null,...(newCustomer?{newCustomer}:{}),orderedBy:txt(b.orderedBy,200),recipient:{name:txt(r.name,200),phone:txt(r.phone,40),address:txt(r.address,2000)},desiredDate:dateOnly(b.desiredDate),notes:txt(b.notes,5000),lines};
}
export function submission(d:Draft){if(!d.customerId||!d.orderedBy||!d.recipient.name||!d.recipient.phone||!d.recipient.address||!d.lines.length)fail('Cần đủ khách, người đặt, người nhận, điện thoại, địa chỉ và sản phẩm.');for(const l of d.lines)if(!l.productId||!l.unit||l.kind==='custom'&&l.proposedPrice===null)fail('Thiếu sản phẩm, đơn vị tính hoặc giá đề xuất hàng đặt riêng.');}
export const sha=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
export const fingerprint=(d:Draft)=>sha(JSON.stringify(d));
export const stable=(v:unknown):string=>Array.isArray(v)?'['+v.map(stable).join(',')+']':v&&typeof v==='object'?'{'+Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>JSON.stringify(k)+':'+stable(x)).join(',')+'}':JSON.stringify(v)??'null';
export const internalHash=(v:unknown)=>sha(stable(v));
export function lineAmount(q:number,p:number){const total=quoteLineAmount(q,p);if(Math.round(q*p)!==total)fail('Số lượng này làm tròn khác hợp đồng ZCRM v1; điều chỉnh số lượng/đơn giá hoặc cập nhật bộ kiểm tra ZCRM.',422,'ROUNDING_CONTRACT_MISMATCH');return total;}
export function sum(values:number[]){const n=values.reduce((s,v)=>s+BigInt(v),0n);if(n<0n||n>BigInt(Number.MAX_SAFE_INTEGER))return fail('Tổng tiền vượt giới hạn an toàn.');return Number(n);}
export const phone=(v:unknown)=>String(v??'').replace(/\D/g,'').replace(/^84(?=\d{9}$)/,'0');
export const normalize=(v:unknown)=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase().trim();
export const iso=(v:unknown):string=>{const d=new Date(String(v));if(!Number.isFinite(d.getTime()))return fail('Dữ liệu thời điểm chưa đầy đủ.',503,'DATA_INCOMPLETE');return d.toISOString();};
export function encryptionReady(){return /^[a-f0-9]{64}$/i.test(process.env.ZCRM_ENCRYPTION_KEY||'');}
function encryptionKey(){if(!encryptionReady())return fail('Máy chủ chưa có khóa mã hóa ZCRM hợp lệ.',503,'ENCRYPTION_NOT_READY');return Buffer.from(process.env.ZCRM_ENCRYPTION_KEY!,'hex');}
export function encrypt(v:string){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',encryptionKey(),iv);const body=Buffer.concat([cipher.update(v,'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),body]).toString('base64');}
export function decrypt(v:string){try{const b=Buffer.from(v,'base64'),c=createDecipheriv('aes-256-gcm',encryptionKey(),b.subarray(0,12));c.setAuthTag(b.subarray(12,28));return Buffer.concat([c.update(b.subarray(28)),c.final()]).toString('utf8');}catch{return fail('Không đọc được khóa kết nối. Kiểm tra khóa mã hóa máy chủ.',503,'ENCRYPTION_UNAVAILABLE');}}
export function cursorEncode(payload:unknown,secret:string){const b=Buffer.from(JSON.stringify(payload)).toString('base64url');return b+'.'+createHmac('sha256',secret).update(b).digest('hex');}
export function cursorDecode(token:string,secret:string):Row {try{if(token.length>500)throw new Error();const [b,s,...rest]=token.split('.'),expected=createHmac('sha256',secret).update(b).digest();if(rest.length||!s||!/^[a-f0-9]{64}$/.test(s)||!timingSafeEqual(expected,Buffer.from(s,'hex')))throw new Error();return obj(JSON.parse(Buffer.from(b,'base64url').toString()));}catch{return fail('Con trỏ phân trang không hợp lệ.',400,'INVALID_CURSOR');}}
export function safeOrigin(v:unknown){let u:URL;try{u=new URL(txt(v,250,true));}catch{return fail('Origin ZCRM không hợp lệ.');}if(u.protocol!=='https:'||u.username||u.password||u.origin!==u.href.slice(0,-1)||u.port||u.hostname==='localhost'||/^[\d.[\]:]+$/.test(u.hostname))return fail('Cần origin HTTPS công khai chính xác, không có đường dẫn.');return u.origin;}
export const capabilities={version:1,capabilities:['customers','products','summary','orders','quotes','draft_orders','idempotency','events','attachments']};
