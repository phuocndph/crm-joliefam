import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { isLocalBackend } from "@/lib/runtime-config";
import { localApi, type LocalSelfProfile } from "@/lib/local-api";
import { FileText, Loader2, Save, Send, ShieldCheck, UserRound } from "lucide-react";

type ProfileValues = Record<string, string | null>;
const emptyProfile: ProfileValues = {};

const groups = [
  { title: "Thông tin cá nhân", description: "Thông tin dùng để nhận diện và liên hệ với bạn.", fields: [
    ["first_name", "Tên", "text"], ["last_name", "Họ và tên đệm", "text"], ["date_of_birth", "Ngày sinh", "date"], ["gender", "Giới tính", "text"], ["nationality", "Quốc tịch", "text"],
  ] },
  { title: "Liên hệ và địa chỉ", description: "Bạn có thể tự cập nhật khi thay đổi.", fields: [
    ["phone", "Số điện thoại", "tel"], ["permanent_address", "Địa chỉ thường trú", "text"], ["current_address", "Địa chỉ hiện tại", "text"],
  ] },
  { title: "Giấy tờ và bảo hiểm", description: "Thông tin cần xác nhận trước khi dùng cho lương, thuế hoặc bảo hiểm.", fields: [
    ["identity_number", "Số căn cước", "text"], ["identity_issued_date", "Ngày cấp", "date"], ["identity_issued_place", "Nơi cấp", "text"], ["tax_code", "Mã số thuế", "text"], ["social_insurance_number", "Mã số BHXH", "text"],
  ] },
  { title: "Liên hệ khẩn cấp", description: "Dùng khi công ty cần liên hệ với người thân của bạn.", fields: [
    ["emergency_contact_name", "Họ tên người liên hệ", "text"], ["emergency_contact_relationship", "Mối quan hệ", "text"], ["emergency_contact_phone", "Số điện thoại", "tel"],
  ] },
  { title: "Tài khoản nhận lương", description: "Thông tin để kế toán đối chiếu. Tài khoản chỉ được dùng trả lương sau khi được xác minh.", fields: [
    ["bank_account_name", "Tên chủ tài khoản", "text"], ["bank_name", "Tên ngân hàng", "text"], ["bank_account_number", "Số tài khoản", "text"], ["bank_code", "Mã ngân hàng", "text"],
  ] },
] as const;

const statusText: Record<string, string> = { DRAFT: "Bản nháp", SUBMITTED: "Đang chờ xác nhận", APPROVED: "Đã xác nhận", NEEDS_INFO: "Cần bổ sung" };
const statusVariant = (status: string) => status === "APPROVED" ? "default" : status === "SUBMITTED" ? "secondary" : status === "NEEDS_INFO" ? "destructive" : "outline";

export default function MyProfilePage() {
  const { toast } = useToast();
  const [data, setData] = useState<LocalSelfProfile | null>(null);
  const [values, setValues] = useState<ProfileValues>(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const result = await localApi.myProfile(); setData(result); setValues(result.profile || {}); }
    catch (error) { toast({ title: "Không tải được hồ sơ", description: error instanceof Error ? error.message : "Vui lòng thử lại.", variant: "destructive" }); }
    finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { if (isLocalBackend()) void load(); else setLoading(false); }, [load]);

  const completion = useMemo(() => {
    const required = ["first_name", "last_name", "phone", "date_of_birth", "identity_number", "current_address"];
    return Math.round(required.filter((key) => String(values[key] || "").trim()).length / required.length * 100);
  }, [values]);

  const setField = (key: string, value: string) => setValues((current) => ({ ...current, [key]: value }));
  const save = async () => {
    setSaving(true);
    try { const result = await localApi.saveMyProfile(values); setData(result); setValues(result.profile || values); toast({ title: "Đã lưu bản nháp", description: "Bạn có thể tiếp tục bổ sung hồ sơ sau." }); }
    catch (error) { toast({ title: "Không thể lưu hồ sơ", description: error instanceof Error ? error.message : "Vui lòng thử lại.", variant: "destructive" }); }
    finally { setSaving(false); }
  };
  const submit = async () => {
    setSubmitting(true);
    try { const result = await localApi.submitMyProfile(values); setData(result); setValues(result.profile || values); toast({ title: "Đã gửi hồ sơ", description: "Hồ sơ đang chờ nhân sự xác nhận." }); }
    catch (error) { toast({ title: "Chưa thể gửi hồ sơ", description: error instanceof Error ? error.message : "Vui lòng bổ sung thông tin bắt buộc.", variant: "destructive" }); }
    finally { setSubmitting(false); }
  };

  if (!isLocalBackend()) return <Alert><ShieldCheck className="h-4 w-4" /><AlertTitle>Chức năng chỉ có trên bản local</AlertTitle><AlertDescription>Hồ sơ nhân sự cá nhân đang được xử lý trên PostgreSQL local.</AlertDescription></Alert>;
  if (loading) return <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!data) return <Alert variant="destructive"><AlertTitle>Không tìm thấy hồ sơ tài khoản</AlertTitle><AlertDescription>Vui lòng đăng nhập lại hoặc liên hệ quản trị viên.</AlertDescription></Alert>;

  return <div className="mx-auto max-w-5xl space-y-5 p-3 sm:p-5 lg:p-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div><h1 className="flex items-center gap-2 text-3xl font-bold"><UserRound className="h-7 w-7" /> Hồ sơ của tôi</h1><p className="mt-1 text-muted-foreground">Tự khai, xem lại và cập nhật thông tin nhân sự của bạn.</p></div>
      <div className="flex gap-2"><Button variant="outline" asChild><Link to="/my-attendance">Chấm công của tôi</Link></Button><Badge variant={statusVariant(data.status)} className="h-10 px-3 text-sm">{statusText[data.status] || data.status}</Badge></div>
    </div>
    <Card className="border-primary/20 bg-primary/5"><CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">Mức độ hoàn thiện: {completion}%</p><p className="text-sm text-muted-foreground">Bạn có thể lưu nháp nhiều lần. Chỉ gửi xác nhận khi thông tin đã đầy đủ.</p></div><div className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${completion}%` }} /></div></CardContent></Card>
    {data.review_note && <Alert variant={data.status === "NEEDS_INFO" ? "destructive" : "default"}><FileText className="h-4 w-4" /><AlertTitle>Phản hồi của nhân sự</AlertTitle><AlertDescription>{data.review_note}</AlertDescription></Alert>}
    {data.linked_worker && <Alert><ShieldCheck className="h-4 w-4" /><AlertTitle>Đã liên kết hồ sơ công việc</AlertTitle><AlertDescription>{String(data.linked_worker.display_name || "")} · Mã {String(data.linked_worker.employee_code || "")} · Các thông tin lương và chấm công do công ty thiết lập.</AlertDescription></Alert>}
    <div className="grid gap-5 md:grid-cols-2">{groups.map((group) => <Card key={group.title}><CardHeader><CardTitle className="text-xl">{group.title}</CardTitle><CardDescription>{group.description}</CardDescription></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2">{group.fields.map(([key, label, type]) => <div key={key} className={key.includes("address") ? "space-y-2 sm:col-span-2" : "space-y-2"}><Label htmlFor={`profile-${key}`}>{label}</Label><Input id={`profile-${key}`} type={type} value={values[key] || ""} onChange={(event) => setField(key, event.target.value)} /></div>)}</CardContent></Card>)}</div>
    <Card><CardHeader><CardTitle className="text-xl">Ghi chú thêm</CardTitle><CardDescription>Thông tin khác bạn muốn nhân sự biết.</CardDescription></CardHeader><CardContent><Textarea value={values.notes || ""} onChange={(event) => setField("notes", event.target.value)} placeholder="Ví dụ: thông tin sức khỏe cần lưu ý, lịch làm việc đặc biệt..." /></CardContent></Card>
    <Card><CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-muted-foreground">Lần gửi gần nhất: {data.submitted_at ? new Date(data.submitted_at).toLocaleString("vi-VN") : "Chưa gửi"}</p><div className="flex flex-col gap-2 sm:flex-row"><Button variant="outline" onClick={save} disabled={saving || submitting}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}<Save className="mr-2 h-4 w-4" />Lưu bản nháp</Button><Button onClick={submit} disabled={saving || submitting}>{submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}<Send className="mr-2 h-4 w-4" />Gửi xác nhận</Button></div></CardContent></Card>
  </div>;
}
