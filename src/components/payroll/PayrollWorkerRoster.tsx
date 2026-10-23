import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import type { PayrollWorker } from '@/lib/payroll-master-data';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type Summary=PayrollWorker&{current_effective_from?:string;current_effective_to?:string|null;payroll_draft_count?:number;has_current_payroll_profile?:boolean};
const names:Record<string,string>={MONTHLY_MANAGER:'Quản lý lương tháng',MONTHLY_HELPER:'Thợ phụ lương tháng',PIECE_RATE:'Theo sản phẩm',HOURLY:'Theo giờ'};
export default function PayrollWorkerRoster({workers,ready,error,refresh}:{workers:Summary[];ready:boolean;error:unknown;refresh:()=>Promise<void>}) {
  const [params]=useSearchParams();
  const [search,setSearch]=useState('');
  const [onlyDraft,setOnlyDraft]=useState(false);
  const rows=workers.filter(w=>(!onlyDraft||Number(w.payroll_draft_count)>0)&&`${w.employee_code} ${w.display_name}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')));
  const link=(id:string)=>{const next=new URLSearchParams(params);next.set('tab','workers');next.set('worker',id);return '/payroll-settings?'+next;};
  if(!ready)return <Alert variant={error?'destructive':'default'}><AlertDescription>{error?(error instanceof Error?error.message:'Không tải được danh sách nhân sự.'):'Đang tải danh sách nhân sự…'} <Button variant="outline" disabled={!error} onClick={()=>void refresh()}>Thử lại</Button></AlertDescription></Alert>;
  return <div className="space-y-3"><p className="text-sm text-muted-foreground">Chọn một người để xem, thiết lập hoặc duyệt hồ sơ. Tóm tắt này chưa xác nhận đủ điều kiện tính lương của kỳ.</p><div className="flex flex-wrap gap-2"><Input aria-label="Tìm nhân sự" placeholder="Tìm mã hoặc tên…" className="max-w-sm" value={search} onChange={e=>setSearch(e.target.value)}/><Button variant={onlyDraft?'secondary':'outline'} aria-pressed={onlyDraft} onClick={()=>setOnlyDraft(!onlyDraft)}>Có nháp phân loại / hồ sơ</Button></div><div className="overflow-x-auto rounded border"><Table className="min-w-[650px]"><TableHeader><TableRow><TableHead>Nhân sự</TableHead><TableHead>Cách trả / hiệu lực</TableHead><TableHead>Hồ sơ cần xử lý</TableHead><TableHead>Thao tác</TableHead></TableRow></TableHeader><TableBody>{!rows.length&&<TableRow><TableCell colSpan={4}>Không có nhân sự phù hợp.</TableCell></TableRow>}{rows.map(w=><TableRow key={w.id}><TableCell><p className="font-medium">{w.display_name}</p><p className="text-xs text-muted-foreground">{w.employee_code} · {w.location_code||'Chưa gán cơ sở'} · {w.payroll_status}</p></TableCell><TableCell>{w.current_assignment_id?names[w.current_compensation_type||'']||'Chưa phân loại':'Chưa có phân loại được duyệt'}<p className="text-xs text-muted-foreground">{w.current_effective_from?`${w.current_effective_from} → ${w.current_effective_to||'không giới hạn'}`:'Chưa có hiệu lực'}</p></TableCell><TableCell>{Number(w.payroll_draft_count)>0&&<Badge variant="outline">{w.payroll_draft_count} nháp phân loại / hồ sơ</Badge>}{!w.current_assignment_id||!w.has_current_payroll_profile?<p className="text-xs text-amber-700">Cần hoàn thiện hồ sơ hiện tại</p>:<p className="text-xs text-muted-foreground">Có hồ sơ được duyệt · kiểm tra mức lương khi mở</p>}</TableCell><TableCell><Button asChild variant="outline" size="sm"><Link to={link(w.id)}>Mở hồ sơ</Link></Button></TableCell></TableRow>)}</TableBody></Table></div></div>;
}
