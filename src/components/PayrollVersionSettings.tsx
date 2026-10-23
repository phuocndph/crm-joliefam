import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { localApi } from '@/lib/local-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

type Resource='rule-versions'|'calendar-versions';
type Form=Record<string,string>;
const blank=(resource:Resource):Form=>resource==='rule-versions'?{policy_group_id:'',location_code:'',rule_kind:'OT',overtime_type:'NORMAL',calculation_method:'BASE_RATE_MULTIPLIER',multiplier:'',fixed_rate:'',meal_rate:'',effective_from:'',effective_to:'',reason:'',source_reference:''}:{period_start:'',period_end:'',location_code:'__UNASSIGNED__',standard_days:'',daily_minutes:'',reason:'',source_reference:''};
export default function PayrollVersionSettings({canManage,scopeKey}:{canManage:boolean;scopeKey:string}) {
  const [params]=useSearchParams();
  const client=useQueryClient(),[resource,setResource]=useState<Resource>(params.get('editor')==='calendar'?'calendar-versions':'rule-versions'),[form,setForm]=useState<Form|null>(null),[editing,setEditing]=useState<string|null>(null),[locationMode,setLocationMode]=useState('ALL'),[groupFilter,setGroupFilter]=useState('ALL'),[locationFilter,setLocationFilter]=useState('ALL');
  const rules=useQuery({queryKey:['payroll-settings','versions','rule-versions',scopeKey],queryFn:()=>localApi.payrollVersions('rule-versions')});
  const calendars=useQuery({queryKey:['payroll-settings','versions','calendar-versions',scopeKey],queryFn:()=>localApi.payrollVersions('calendar-versions')});
  const groups=useQuery({queryKey:['payroll-settings','version-groups',scopeKey],queryFn:localApi.payrollPolicyGroups});
  const mutation=useMutation({mutationFn:async(action:{operation:'save'|'approve'|'delete';id?:string;row?:Record<string,unknown>})=>{
    if(action.operation==='approve')return localApi.approvePayrollVersion(resource,action.id!,{reason:String(action.row?.reason||'Duyệt cấu hình theo hồ sơ tham chiếu')});
    if(action.operation==='delete')return localApi.deletePayrollVersion(resource,action.id!);
    const value:Record<string,unknown>={...form};
    if(resource==='rule-versions') {
      if(form?.rule_kind==='MEAL') {value.overtime_type=null;value.calculation_method=null;value.multiplier=null;value.fixed_rate=null;}
      else {value.meal_rate=null;if(form?.calculation_method==='FIXED_RATE')value.multiplier=null;else value.fixed_rate=null;}
    }
    return editing?localApi.updatePayrollVersion(resource,editing,value):localApi.createPayrollVersion(resource,value);
  },onSuccess:async()=>{setForm(null);setEditing(null);await client.invalidateQueries({queryKey:['payroll-settings']});toast.success('Đã lưu cấu hình lương');},onError:(error)=>toast.error(error instanceof Error?error.message:'Không lưu được cấu hình')});
  const query=resource==='rule-versions'?rules:calendars;
  const visible=(query.data||[]).filter(row=>(groupFilter==='ALL'||resource==='calendar-versions'||row.policy_group_id===groupFilter)&&(locationFilter==='ALL'||(row.location_code||'GENERIC')===locationFilter));
  const overtimeLabel=(value:unknown)=>({NORMAL:'ngày thường',SUNDAY:'Chủ nhật',HOLIDAY:'ngày lễ'}[String(value)]||String(value));
  const openNew=()=>{setEditing(null);setLocationMode(resource==='rule-versions'?'ALL':'UNASSIGNED');const next=blank(resource);const month=params.get('month');if(resource==='calendar-versions'&&month&&/^\d{4}-(0[1-9]|1[0-2])$/.test(month)){next.period_start=month+'-01';next.period_end=month+'-'+new Date(Number(month.slice(0,4)),Number(month.slice(5)),0).getDate();next.location_code=params.get('location')&&params.get('location')!=='ALL'?params.get('location')!:'__UNASSIGNED__';setLocationMode(next.location_code==='__UNASSIGNED__'?'UNASSIGNED':'SPECIFIC');}setForm(next);};
  const set=(key:string,value:string)=>setForm(previous=>({...previous,[key]:value}));
  const field=(key:string,label:string,type='text',required=true)=><div className="space-y-1" key={key}><Label htmlFor={'version-'+key}>{label}</Label><Input id={'version-'+key} type={type} value={form?.[key]||''} onChange={event=>set(key,event.target.value)} required={required} /></div>;
  const select=(key:string,label:string,options:Array<[string,string]>)=><div className="space-y-1"><Label htmlFor={'version-'+key}>{label}</Label><select id={'version-'+key} className="h-10 w-full rounded-md border bg-background px-3" value={form?.[key]||''} required onChange={event=>set(key,event.target.value)}>{options.map(([value,text])=><option key={value} value={value}>{text}</option>)}</select></div>;
  return <Card><CardHeader><CardTitle>Chính sách tính lương và lịch công đã duyệt</CardTitle></CardHeader><CardContent className="space-y-4">
    <p className="text-sm text-muted-foreground">Tạo nháp, kiểm tra phạm vi rồi duyệt. Không có mức tiền hoặc 26 ngày mặc định. Bản đã duyệt không sửa/xóa; phiên bản kế tiếp phải có khoảng hiệu lực không giao nhau.</p>
    <div className="flex flex-wrap gap-2"><Button variant={resource==='rule-versions'?'default':'outline'} onClick={()=>{setResource('rule-versions');setForm(null);}}>Tăng ca / tiền ăn</Button><Button variant={resource==='calendar-versions'?'default':'outline'} onClick={()=>{setResource('calendar-versions');setForm(null);}}>Lịch công theo kỳ / cơ sở</Button>{canManage&&<Button variant="outline" onClick={openNew}>Tạo phiên bản nháp</Button>}</div>
    <div className="flex flex-wrap gap-2">{resource==='rule-versions'&&<select aria-label="Lọc nhóm chính sách" className="h-11 rounded border bg-background px-2" value={groupFilter} onChange={e=>setGroupFilter(e.target.value)}><option value="ALL">Mọi nhóm áp dụng</option>{groups.data?.map(group=><option key={String(group.id)} value={String(group.id)}>{String(group.name)}</option>)}</select>}<select aria-label="Lọc cơ sở cấu hình" className="h-11 rounded border bg-background px-2" value={locationFilter} onChange={e=>setLocationFilter(e.target.value)}><option value="ALL">Mọi phạm vi cơ sở</option>{[...new Set((query.data||[]).map(row=>String(row.location_code||'GENERIC')))].map(location=><option key={location} value={location}>{location==='GENERIC'?'Toàn nhóm':location==='__UNASSIGNED__'?'Chưa gán cơ sở':location}</option>)}</select></div>
    {query.isLoading?<p>Đang tải cấu hình…</p>:query.error?<div role="alert">Không tải được cấu hình. <Button variant="outline" onClick={()=>query.refetch()}>Thử lại</Button></div>:!query.data?.length?<p>Chưa có phiên bản. Cần nhập cấu hình được doanh nghiệp xác nhận trước khi tính lương.</p>:<div className="space-y-2">{visible.map(row=><div className="rounded border p-3 text-sm" key={String(row.id)}>
      <div className="font-medium">{resource==='rule-versions'?`${row.rule_kind==='MEAL'?'Tiền ăn':'Tăng ca '+overtimeLabel(row.overtime_type)} · ${groups.data?.find(group=>group.id===row.policy_group_id)?.name||row.policy_group_id}`:`Lịch ${row.period_start} → ${row.period_end}`}</div>
      <p>Cơ sở: {row.location_code==='__UNASSIGNED__'?'Chưa gán':String(row.location_code||'Tất cả cơ sở trong nhóm')} · {row.status==='APPROVED'?'Đã duyệt':'Bản nháp'}</p>
      <p>{resource==='rule-versions'?`${row.effective_from} → ${row.effective_to} · ${row.rule_kind==='MEAL'?'Mức ăn: '+String(row.meal_rate):row.calculation_method==='FIXED_RATE'?'Đơn giá giờ cố định: '+String(row.fixed_rate):'Hệ số: '+String(row.multiplier)}`:`Ngày chuẩn: ${row.standard_days}; phút/ngày: ${row.daily_minutes}`}</p>
      <p>Nguồn: {String(row.source_reference)} · {String(row.reason)}</p>
      {canManage&&<Button size="sm" variant="outline" className="mt-2" onClick={()=>{setEditing(null);setLocationMode(row.location_code==='__UNASSIGNED__'?'UNASSIGNED':row.location_code?'SPECIFIC':'ALL');const next=Object.fromEntries(Object.keys(blank(resource)).map(key=>[key,String(row[key]??'')]));next.reason='';if(resource==='calendar-versions'){const start=new Date(String(row.period_start)+'T12:00:00');start.setMonth(start.getMonth()+1,1);const month=`${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,'0')}`;next.period_start=month+'-01';next.period_end=month+'-'+new Date(start.getFullYear(),start.getMonth()+1,0).getDate();next.standard_days='';}else{next.effective_from='';next.effective_to='';}setForm(next);}}>Sao chép sang bản nháp {resource==='calendar-versions'?'tháng sau':''}</Button>}
      {canManage&&row.status==='DRAFT'&&<div className="mt-2 flex gap-2"><Button size="sm" variant="outline" disabled={mutation.isPending} onClick={()=>{setEditing(String(row.id));setLocationMode(row.location_code==='__UNASSIGNED__'?'UNASSIGNED':row.location_code?'SPECIFIC':'ALL');setForm(Object.fromEntries(Object.keys(blank(resource)).map(key=>[key,String(row[key]??'')])));}}>Sửa nháp</Button><Button size="sm" disabled={mutation.isPending} onClick={()=>mutation.mutate({operation:'approve',id:String(row.id),row})}>Duyệt phiên bản</Button><Button size="sm" variant="outline" disabled={mutation.isPending} onClick={()=>mutation.mutate({operation:'delete',id:String(row.id)})}>Xóa nháp</Button></div>}
    </div>)}</div>}
    {form&&<form className="grid gap-3 rounded border p-4 sm:grid-cols-2" onSubmit={event=>{event.preventDefault();mutation.mutate({operation:'save'});}}>
      {resource==='rule-versions'?<>
        {select('policy_group_id','Nhóm chính sách',[['','Chọn nhóm'],...(groups.data||[]).map(group=>[String(group.id),String(group.name)] as [string,string])])}
        {select('rule_kind','Loại chính sách',[['OT','Tăng ca'],['MEAL','Tiền ăn']])}
        {form.rule_kind==='OT'&&<>{select('overtime_type','Loại tăng ca',[['NORMAL','Ngày thường'],['SUNDAY','Chủ nhật'],['HOLIDAY','Ngày lễ']])}{select('calculation_method','Cách tính',[['BASE_RATE_MULTIPLIER','Đơn giá cơ sở × hệ số'],['FIXED_RATE','Đơn giá giờ cố định']])}{form.calculation_method==='FIXED_RATE'?field('fixed_rate','Đơn giá giờ cố định'):field('multiplier','Hệ số')}</>}
        {form.rule_kind==='MEAL'&&field('meal_rate','Tiền ăn mỗi ngày đủ điều kiện')}
        {field('effective_from','Hiệu lực từ','date')}{field('effective_to','Hiệu lực đến (bắt buộc)','date')}
      </>:<>{field('period_start','Kỳ từ','date')}{field('period_end','Kỳ đến','date')}{field('standard_days','Ngày công chuẩn')}<div className="space-y-1"><Label htmlFor="version-daily-hours">Giờ công chuẩn mỗi ngày</Label><Input id="version-daily-hours" type="number" min="0.01" max="24" step="0.01" required value={form.daily_minutes?String(Number(form.daily_minutes)/60):''} onChange={e=>set('daily_minutes',e.target.value?String(Math.round(Number(e.target.value)*6000)/100):'')} /><p className="text-xs text-muted-foreground">{form.daily_minutes||'—'} phút/ngày; nhập theo lịch đã xác nhận.</p></div></>}
      <div className="space-y-1"><Label htmlFor="version-location-scope">Phạm vi cơ sở</Label><select id="version-location-scope" className="h-10 w-full rounded-md border bg-background px-3" value={locationMode} onChange={event=>{setLocationMode(event.target.value);set('location_code',event.target.value==='UNASSIGNED'?'__UNASSIGNED__':'');}}>{resource==='rule-versions'&&<option value="ALL">Tất cả cơ sở trong nhóm</option>}<option value="UNASSIGNED">Chưa gán cơ sở</option><option value="SPECIFIC">Một cơ sở cụ thể</option></select></div>
      {locationMode==='SPECIFIC'&&field('location_code','Mã cơ sở')}
      {field('source_reference','Văn bản / nguồn tham chiếu')}{field('reason','Lý do cấu hình')}
      <div className="flex gap-2 sm:col-span-2"><Button type="submit" disabled={mutation.isPending}>Lưu nháp</Button><Button type="button" variant="outline" disabled={mutation.isPending} onClick={()=>setForm(null)}>Hủy</Button></div>
    </form>}
  </CardContent></Card>;
}
