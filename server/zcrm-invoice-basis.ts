import {calculateInvoiceLines,invoiceDecimal,invoiceRound,invoiceFail} from './invoice-money.js';
import {invoiceSourceUnits,invoiceSourceAmount} from './invoice-financial.js';
type Row=Record<string,unknown>;
export type InvoiceBasis={version:1;currency:'VND';vat_rate:string;lines:ReturnType<typeof calculateInvoiceLines>['lines'];subtotal:string;vat_amount:string;total:string};
// PostgreSQL numeric aggregates retain scale (e.g. 112500.000000).
// Accept only exact integral values here; provider/global parsers stay unchanged.
const integer=(v:unknown)=>{const x=invoiceDecimal(v,6);if(x.n%x.d!==0n)invoiceFail('Số tiền VND của cơ sở hóa đơn phải nguyên.');return x.n/x.d;};
const rat=(v:unknown)=>{const r=invoiceDecimal(v,4);if(r.n>r.d*100n)invoiceFail('Thuế suất VAT phải từ 0 đến 100%.');return String(v);};
/** Choose a six-decimal unit price whose canonical rounded extended amount is exact. */
function priceFor(quantity:unknown,net:bigint){
 const q=invoiceDecimal(quantity),scaled=net*1000000n*q.d;
 if(q.n<=0n)invoiceFail('Số lượng nguồn hóa đơn phải lớn hơn 0.');
 const center=scaled/q.n;
 for(const p of [center,center+1n,center>0n?center-1n:0n])if(invoiceRound(q.n*p,q.d*1000000n)===net)return invoiceSourceAmount(p);
 return invoiceFail('Phần tiền/số lượng này không biểu diễn được bằng đơn giá 6 chữ số; cần chọn lại cách tách hóa đơn.',409);
}
export function buildZcrmInvoiceBasis(items:Row[],discountValue:unknown,shippingValue:unknown,vatRate:unknown):InvoiceBasis{
 if(!items.length||items.some(i=>!i.id)||new Set(items.map(i=>String(i.id))).size!==items.length)invoiceFail('Dòng hàng chưa có mã nguồn ổn định; cần đối chiếu trước khi lập hóa đơn.');
 const rate=rat(vatRate),discount=integer(discountValue),shipping=integer(shippingValue),gross=items.map(i=>integer(i.total)),subtotal=gross.reduce((a,b)=>a+b,0n);
 if(discount>subtotal||discount<0n)invoiceFail('Giảm giá vượt giá trị hàng.');
 const allocated=gross.map((n,index)=>({index,n:subtotal?discount*n/subtotal:0n,remainder:subtotal?discount*n%subtotal:0n}));
 let left=discount-allocated.reduce((n,a)=>n+a.n,0n);
 for(const a of [...allocated].sort((a,b)=>a.remainder===b.remainder?a.index-b.index:a.remainder>b.remainder?-1:1)){if(!left)break;a.n++;left--;}
 const raw=items.map((item,index)=>({name:item.name,unit:item.unit||'',quantity:String(item.quantity),unit_price:priceFor(item.quantity,gross[index]-allocated[index].n),vat_rate:rate,source_line:'zcrm:v1:goods:'+String(item.id)}));
 if(shipping>0n)raw.push({name:'Phí giao hàng',unit:'Lần',quantity:'1',unit_price:String(shipping),vat_rate:rate,source_line:'zcrm:v1:shipping'});
 const calc=calculateInvoiceLines(raw,'VND');
 if(BigInt(calc.subtotal)!==subtotal-discount+shipping)invoiceFail('Cơ sở hóa đơn không khớp hàng, giảm giá và phí giao.');
 return {version:1,currency:'VND',vat_rate:rate,...calc};
}
export function zcrmInvoiceBasis(order:Row):InvoiceBasis|null{
 if(order.intake_source!=='ZCRM')return null;
 const snapshot=order.commercial_snapshot as Row|undefined,basis=snapshot?.invoice_basis as InvoiceBasis|undefined;
 if(order.approval_status!=='approved'||!basis||basis.version!==1||basis.currency!=='VND')return invoiceFail('Đơn ZCRM chưa có cơ sở hóa đơn/VAT được duyệt. Cần đối chiếu điều khoản trước khi lập hóa đơn.',409);
 const calc=calculateInvoiceLines(basis.lines,'VND');
 if(calc.total!==String(order.total_amount).replace(/\.0+$/,'')||calc.total!==basis.total||calc.vat_amount!==basis.vat_amount||calc.subtotal!==basis.subtotal)invoiceFail('Cơ sở hóa đơn ZCRM không khớp tổng được duyệt; cần đối chiếu.',409);
 return basis;
}
/** The same allocator powers source preview and save. Saved/issued line evidence is never rewritten. */
export function zcrmInvoiceFragment(item:InvoiceBasis['lines'][number],requested:unknown,used:Row={}){
 const full=invoiceSourceUnits(item.quantity),q=invoiceSourceUnits(requested),consumed=invoiceSourceUnits(used.quantity??0),netUsed=integer(used.subtotal??0),vatUsed=integer(used.vat_amount??0),net=integer(item.subtotal),vat=integer(item.vat_amount);
 if(q<=0n||consumed<0n||q+consumed>full||netUsed>net||vatUsed>vat)invoiceFail('Nguồn hóa đơn đã được giữ chỗ vượt số lượng hoặc tiền còn lại.',409);
 const fragmentNet=q+consumed===full?net-netUsed:invoiceRound(net*q,full);
 const line={name:item.name,unit:item.unit,quantity:String(requested),unit_price:priceFor(requested,fragmentNet),vat_rate:item.vat_rate,source_line:item.source_line};
 const calculated=calculateInvoiceLines([line],'VND').lines[0];
 if(integer(calculated.subtotal)+netUsed>net||integer(calculated.vat_amount)+vatUsed>vat||q+consumed===full&&(integer(calculated.subtotal)+netUsed!==net||integer(calculated.vat_amount)+vatUsed!==vat))invoiceFail('Phần hóa đơn còn lại không khớp tiền/VAT nguồn sau làm tròn. Chọn lại số lượng tách hoặc đối chiếu các nháp trước; chưa có dữ liệu nào được lưu.',409);
 return calculated;
}
