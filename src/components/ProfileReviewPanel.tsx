import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { localApi } from "@/lib/local-api";
import { FileCheck2, Loader2, RefreshCw } from "lucide-react";

type ProfileRequest = {
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  profile_data: Record<string, unknown>;
  submitted_at: string | null;
};
type WorkerOption = { id: string; employee_code: string; display_name: string; worker_type?: string; is_active?: boolean; user_id?: string | null };

const labels: Record<string, string> = {
  first_name: "Tên", last_name: "Họ và tên đệm", phone: "Số điện thoại",
  date_of_birth: "Ngày sinh", gender: "Giới tính", nationality: "Quốc tịch",
  identity_number: "Số căn cước", identity_issued_date: "Ngày cấp căn cước",
  identity_issued_place: "Nơi cấp căn cước", permanent_address: "Địa chỉ thường trú",
  current_address: "Địa chỉ hiện tại", emergency_contact_name: "Người liên hệ khẩn cấp",
  emergency_contact_relationship: "Quan hệ", emergency_contact_phone: "Số điện thoại khẩn cấp",
  tax_code: "Mã số thuế", social_insurance_number: "Mã số BHXH", notes: "Ghi chú",
  bank_account_name: "Tên chủ tài khoản", bank_name: "Ngân hàng", bank_account_number: "Số tài khoản", bank_code: "Mã ngân hàng",
};

const displayName = (item: ProfileRequest) =>
  [item.last_name, item.first_name].filter(Boolean).join(" ").trim() || "Chưa cập nhật";

export default function ProfileReviewPanel() {
  const { toast } = useToast();
  const [items, setItems] = useState<ProfileRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<ProfileRequest | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [workers, setWorkers] = useState<WorkerOption[]>([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState("");

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const rows = await localApi.profileRequests("SUBMITTED");
      setItems(rows as ProfileRequest[]);
    } catch (error) {
      toast({ title: "Không tải được hồ sơ chờ duyệt", description: error instanceof Error ? error.message : "Vui lòng thử lại.", variant: "destructive" });
    } finally { setLoading(false); setRefreshing(false); }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    void localApi.workers().then((rows) => setWorkers(rows as WorkerOption[])).catch((error) => {
      toast({ title: "Không tải được hồ sơ công nhân", description: error instanceof Error ? error.message : "Vui lòng thử lại.", variant: "destructive" });
    });
  }, [toast]);

  const review = async (decision: "APPROVED" | "NEEDS_INFO") => {
    if (!selected) return;
    if (decision === "APPROVED" && !selectedWorkerId) {
      toast({ title: "Chưa chọn hồ sơ công nhân", description: "Hãy chọn hồ sơ công nhân tương ứng trước khi duyệt.", variant: "destructive" });
      return;
    }
    if (decision === "NEEDS_INFO" && !note.trim()) {
      toast({ title: "Cần ghi rõ nội dung", description: "Hãy nêu thông tin nhân viên cần bổ sung.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await localApi.reviewProfileRequest(selected.user_id, decision, note.trim() || undefined, selectedWorkerId || undefined);
      toast({ title: decision === "APPROVED" ? "Đã duyệt và liên kết hồ sơ" : "Đã yêu cầu bổ sung", description: displayName(selected) });
      setSelected(null); setNote(""); setSelectedWorkerId(""); await load(true);
    } catch (error) {
      toast({ title: "Không thể cập nhật hồ sơ", description: error instanceof Error ? error.message : "Vui lòng thử lại.", variant: "destructive" });
    } finally { setSaving(false); }
  };

  return <Card>
    <CardHeader className="flex flex-row items-start justify-between gap-3">
      <div><CardTitle className="flex items-center gap-2"><FileCheck2 className="h-5 w-5" /> Hồ sơ nhân viên chờ xác nhận</CardTitle><CardDescription>Kiểm tra thông tin do nhân viên tự khai trước khi liên kết và dùng cho chấm công, tiền lương.</CardDescription></div>
      <Button variant="outline" size="sm" onClick={() => void load(true)} disabled={loading || refreshing}><RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />Làm mới</Button>
    </CardHeader>
    <CardContent>
      {loading ? <div className="flex items-center justify-center py-8 text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Đang tải hồ sơ...</div> : items.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">Chưa có hồ sơ nào chờ xác nhận.</p> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Nhân viên</TableHead><TableHead>Email</TableHead><TableHead>Số điện thoại</TableHead><TableHead>Ngày gửi</TableHead><TableHead className="text-right">Thao tác</TableHead></TableRow></TableHeader><TableBody>{items.map((item) => <TableRow key={item.user_id}><TableCell className="font-medium">{displayName(item)}</TableCell><TableCell>{item.email}</TableCell><TableCell>{item.phone || "—"}</TableCell><TableCell>{item.submitted_at ? new Date(item.submitted_at).toLocaleString("vi-VN") : "—"}</TableCell><TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => { setSelected(item); setNote(""); setSelectedWorkerId(""); }}>Xem và xử lý</Button></TableCell></TableRow>)}</TableBody></Table></div>}
    </CardContent>
    <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Kiểm tra hồ sơ — {selected ? displayName(selected) : ""}</DialogTitle></DialogHeader>
        {selected && <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2">{Object.entries(selected.profile_data || {}).filter(([, value]) => value !== null && String(value).trim()).map(([key, value]) => <div key={key} className="rounded-md border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">{labels[key] || key}</p><p className="mt-1 break-words text-sm font-medium">{String(value)}</p></div>)}</div><div className="space-y-2"><Label>Hồ sơ công nhân để liên kết</Label><Select value={selectedWorkerId} onValueChange={setSelectedWorkerId} disabled={saving}><SelectTrigger><SelectValue placeholder="Chọn mã và tên công nhân" /></SelectTrigger><SelectContent>{workers.filter((worker) => worker.is_active !== false && (!worker.user_id || worker.user_id === selected.user_id)).map((worker) => <SelectItem key={worker.id} value={worker.id}>{worker.employee_code} · {worker.display_name}{worker.user_id === selected.user_id ? " (đang liên kết)" : ""}</SelectItem>)}</SelectContent></Select><p className="text-xs text-muted-foreground">Bắt buộc khi duyệt. Hệ thống sẽ kiểm tra trùng liên kết trong giao dịch.</p></div><div className="space-y-2"><Label htmlFor="profile-review-note">Ghi chú phản hồi (bắt buộc nếu yêu cầu bổ sung)</Label><Textarea id="profile-review-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ví dụ: Vui lòng bổ sung ảnh/ số căn cước hoặc kiểm tra lại số điện thoại..." /></div></div>}
        <DialogFooter className="gap-2 sm:gap-2"><Button variant="outline" onClick={() => setSelected(null)} disabled={saving}>Đóng</Button><Button variant="secondary" onClick={() => void review("NEEDS_INFO")} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Yêu cầu bổ sung</Button><Button onClick={() => void review("APPROVED")} disabled={saving || !selectedWorkerId}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Duyệt và liên kết</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </Card>;
}
