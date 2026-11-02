import {Plus,Trash2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {blankPlannedExtra,formatPlannedExtraAmount,plannedExtraPreview,sumPlannedExtraAmounts,type PlannedExtraDraft} from '@/lib/production-planned-extras';

export default function ProductionPlannedExtraEditor({rows,onChange,disabled=false,label='',maxRows=50}:{rows:PlannedExtraDraft[];onChange:(rows:PlannedExtraDraft[])=>void;disabled?:boolean;label?:string;maxRows?:number}){
 const change=(key:string,patch:Partial<PlannedExtraDraft>)=>onChange(rows.map(row=>row.key===key?{...row,...patch}:row));
 return <div className="min-w-0 space-y-3">
  <p className="text-xs text-muted-foreground">Dự toán tiền công cộng thêm. Chưa tính vào lương; xác nhận người làm sau khi hoàn thành.</p>
  {rows.map((row,index)=><div key={row.key} className="grid min-w-0 gap-2 border-t pt-3 sm:grid-cols-[minmax(0,2fr)_80px_80px_minmax(0,1fr)_auto]">
   <div><label htmlFor={row.key+'-description'} className="text-xs text-muted-foreground">Nội dung</label><Input id={row.key+'-description'} aria-label={`Nội dung cộng thêm ${label} ${index+1}`} disabled={disabled} maxLength={200} value={row.description} onChange={e=>change(row.key,{description:e.target.value})} placeholder="Ví dụ: Đính nhãn riêng"/></div>
   <div><label htmlFor={row.key+'-quantity'} className="text-xs text-muted-foreground">Số lượng</label><Input id={row.key+'-quantity'} aria-label={`Số lượng cộng thêm ${label} ${index+1}`} disabled={disabled} inputMode="decimal" value={row.quantity} onChange={e=>change(row.key,{quantity:e.target.value})}/></div>
   <div><label htmlFor={row.key+'-unit'} className="text-xs text-muted-foreground">Đơn vị</label><select id={row.key+'-unit'} aria-label={`Đơn vị cộng thêm ${label} ${index+1}`} disabled={disabled} className="h-10 w-full min-w-0 rounded-[4px] border bg-background px-2 text-sm" value={row.unit} onChange={e=>change(row.key,{unit:e.target.value})}>{['cái','lần','bộ','mét','giờ'].map(unit=><option key={unit}>{unit}</option>)}</select></div>
   <div><label htmlFor={row.key+'-price'} className="text-xs text-muted-foreground">Đơn giá (đ)</label><Input id={row.key+'-price'} aria-label={`Đơn giá cộng thêm ${label} ${index+1}`} disabled={disabled} inputMode="decimal" value={row.unit_price} onChange={e=>change(row.key,{unit_price:e.target.value})}/></div>
   <Button type="button" aria-label={`Bỏ cộng thêm ${label} ${index+1}`} disabled={disabled} variant="ghost" className="self-end" onClick={()=>onChange(rows.filter(item=>item.key!==row.key))}><Trash2 className="h-4 w-4"/></Button>
   <p className="text-right text-xs tabular-nums text-muted-foreground sm:col-span-5">Thành tiền: {plannedExtraPreview(row.quantity,row.unit_price)===null?'—':formatPlannedExtraAmount(plannedExtraPreview(row.quantity,row.unit_price))}</p>
  </div>)}
  <div className="flex flex-wrap items-center justify-between gap-2"><Button type="button" variant="outline" size="sm" disabled={disabled||rows.length>=maxRows} onClick={()=>onChange([...rows,blankPlannedExtra()])}><Plus className="mr-1 h-4 w-4"/>Thêm tiền công</Button><span className="text-sm tabular-nums">Cộng thêm: <strong>{formatPlannedExtraAmount(sumPlannedExtraAmounts(rows.map(row=>plannedExtraPreview(row.quantity,row.unit_price))))}</strong></span></div>
 </div>;
}
