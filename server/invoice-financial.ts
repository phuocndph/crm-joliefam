import { providerDecimal, providerRatesEqual } from "./invoice-provider-decimal.js";
import { invoiceDecimal } from "./invoice-money.js";
import { invoiceBusinessDate } from "./invoice-date.js";
export const invoiceSourceUnits=(value:unknown,provider=false)=>{const x=(provider ? providerDecimal : invoiceDecimal)(value,6,true);return x.n*1000000n/x.d;};
export const invoiceSourceAmount=(value:bigint)=>{const a=value<0n?-value:value;return `${value<0n?"-":""}${a/1000000n}.${String(a%1000000n).padStart(6,"0")}`.replace(/\.?0+$/,"")||"0";};
type Row = Record<string, unknown>;
/** A projection of verified source semantics. Never replaces the immutable source amounts. */
export function invoiceFinancialProjection(input: Row) {
  const raw=(input.raw ?? {}) as Row, record=(raw.source_record ?? {}) as Row;
  const unknown=(reason:string)=>({known:false,reason,sign:null as number|null,total_amount:null as string|null,vat_amount:null as string|null,total_with_vat:null as string|null});
  if(raw.provider!=="VIETTEL" || String(record.state)!=="1")return unknown("Chưa xác minh trạng thái phát hành từ nguồn hỗ trợ.");
  const sourceUnits = (value: unknown) => invoiceSourceUnits(value, true);
  const type=String(record.adjustmentType);
  let sign=1;
  if(type==="9"){
    const lines=raw.source_lines,groups=raw.tax_groups;
    if(!Array.isArray(lines)||!lines.length||!Array.isArray(groups)||!groups.length)return unknown("Điều chỉnh tiền thiếu dòng hoặc nhóm thuế nguyên bản có chiều tăng/giảm.");
    const flags=[...lines,...groups].map((r:Row)=>r.isIncreaseItem);
    if(flags.some(f=>typeof f!=="boolean")||flags.some(f=>f!==flags[0]))return unknown("Điều chỉnh tiền có chiều thiếu, hỗn hợp hoặc mâu thuẫn; cần đối soát từng dòng.");
    sign=flags[0]?1:-1;
    try{
      let before=0n,vat=0n;
      for(const line of lines){
        if(line.selection!=null && !["1",""].includes(String(line.selection)))return unknown("Loại dòng điều chỉnh/chiết khấu chưa đủ ngữ nghĩa tài chính.");
        const base=line.itemTotalAmountAfterDiscount??line.itemTotalAmountWithoutVat;
        if(base==null||line.vatAmount==null||line.itemTotalAmountWithVat==null)return unknown("Dòng điều chỉnh thiếu tiền nguồn để đối chiếu.");
        const a=sourceUnits(base),b=sourceUnits(line.vatAmount);
        if(a<0n||b<0n||a+b!==sourceUnits(line.itemTotalAmountWithVat))return unknown("Dấu/tiền dòng nguồn chưa khớp chiều điều chỉnh.");
        before+=a;vat+=b;
      }
      if(before!==sourceUnits(input.total_amount)||vat!==sourceUnits(input.vat_amount)||before+vat!==sourceUnits(input.total_with_vat))return unknown("Tổng dòng điều chỉnh khác tổng nguồn.");
      let groupBefore=0n,groupVat=0n;
      for(const group of groups){
        if(group.vatPercentage==null||group.vatTaxableAmount==null||group.vatTaxAmount==null)return unknown("Nhóm thuế điều chỉnh thiếu trường nguồn.");
        const same=lines.filter((line:Row)=>providerRatesEqual(line.vatPercentage,group.vatPercentage));
        const a=sourceUnits(group.vatTaxableAmount),b=sourceUnits(group.vatTaxAmount);
        if(!same.length||a!==same.reduce((n:bigint,l:Row)=>n+sourceUnits(l.itemTotalAmountAfterDiscount??l.itemTotalAmountWithoutVat),0n)||b!==same.reduce((n:bigint,l:Row)=>n+sourceUnits(l.vatAmount),0n))return unknown("Nhóm thuế điều chỉnh khác dòng cùng mức thuế.");
        groupBefore+=a;groupVat+=b;
      }
      if(groupBefore!==before||groupVat!==vat)return unknown("Tổng nhóm thuế điều chỉnh khác tổng dòng.");
    }catch{return unknown("Tiền nguồn điều chỉnh chưa diễn giải được.");}
  }else if(!["1","3"].includes(type))return unknown("Điều chỉnh thông tin/chiết khấu hoặc loại nguồn chưa có mô hình tiền đã xác minh.");
  try{
    return {known:true,reason:type==="9"?"Delta từ cùng chiều tăng/giảm đã đối chiếu dòng, nhóm thuế và tổng nguồn.":"Hóa đơn phát hành theo nguồn Viettel.",sign,total_amount:invoiceSourceAmount(BigInt(sign)*sourceUnits(input.total_amount)),vat_amount:invoiceSourceAmount(BigInt(sign)*sourceUnits(input.vat_amount)),total_with_vat:invoiceSourceAmount(BigInt(sign)*sourceUnits(input.total_with_vat))};
  }catch{return unknown("Tổng tiền nguồn chưa diễn giải được.");}
}

/** Latest source can project money only while still bound to the canonical legal snapshot. */
export function invoiceSourceMatchesCanonical(input:Row,canonical:Row){
  try{
    const isViettel=(input.raw as Row | undefined)?.provider === "VIETTEL";
    for(const key of ["total_amount","vat_amount","total_with_vat"]){if(invoiceSourceUnits(input[key],isViettel)!==invoiceSourceUnits(canonical[key],isViettel))return false;}
    for(const key of ["currency","invoice_number","invoice_series","template_code","seller_tax_code","buyer_tax_code","seller_name","seller_address","buyer_name","buyer_address"]){if(String(input[key]??"")!==String(canonical[key]??""))return false;}
    if(invoiceBusinessDate(input.issued_date)!==invoiceBusinessDate(canonical.issued_date))return false;
    const raw=(input.raw??{}) as Row,stored=(canonical.source_snapshot as Row|undefined)?.raw as Row|undefined;
    if(raw.provider!=="VIETTEL")return false;
    if(stored?.provider==="VIETTEL" && String(raw.provider_id)!==String(stored.provider_id))return false;
    if(stored?.provider==="VIETTEL"){
      if(String(raw.full_invoice_no??"")!==String(stored.full_invoice_no??""))return false;
      if(String((raw.source_record as Row|undefined)?.adjustmentType??"")!==String((stored.source_record as Row|undefined)?.adjustmentType??""))return false;
      for(const key of ["full_number","date","template","series","kind"]){
        if(String((raw.relation_fields as Row|undefined)?.[key]??"")!==String((stored.relation_fields as Row|undefined)?.[key]??""))return false;
      }
    }
    return true;
  }catch{return false;}
}
