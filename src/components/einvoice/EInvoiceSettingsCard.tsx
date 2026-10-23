import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useEInvoiceSettings } from "@/hooks/useEInvoiceSettings";
import { isLocalBackend } from "@/lib/runtime-config";
import { CheckCircle2, XCircle, Loader2, Save, Wifi, AlertTriangle } from "lucide-react";

export const EInvoiceSettingsCard = ({ canEdit }: { canEdit: boolean }) => {
  if (isLocalBackend()) {
    return <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Hóa đơn điện tử trên VPS local</CardTitle>
        <CardDescription>Chế độ local chỉ tạo và lưu bản nháp nội bộ. Chưa phát hành hóa đơn, chưa tích hợp Viettel S-Invoice và không lưu thông tin đăng nhập nhà cung cấp.</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground space-y-2">
        <p>Không có khóa API, mật khẩu hoặc nút kiểm tra kết nối trong chế độ này.</p>
        <p>Hãy dùng quy trình phát hành đã được phê duyệt ở môi trường tích hợp khi chức năng live được triển khai riêng.</p>
      </CardContent>
    </Card>;
  }
  return <HostedEInvoiceSettingsCard canEdit={canEdit} />;
};

const HostedEInvoiceSettingsCard = ({ canEdit }: { canEdit: boolean }) => {
  const { query, save, testLogin } = useEInvoiceSettings();
  const data = query.data;
  const settings = data?.settings;
  const envFallback = data?.env_fallback;

  const [form, setForm] = useState({
    tax_code: "",
    username: "",
    password: "",
    api_url: "https://api-vinvoice.viettel.vn",
    default_invoice_type: "01GTKT",
    default_template_code: "",
    default_serial: "",
  });

  useEffect(() => {
    if (settings) {
      setForm({
        tax_code: settings.tax_code || "",
        username: settings.username || "",
        password: "",
        api_url: settings.api_url || "https://api-vinvoice.viettel.vn",
        default_invoice_type: settings.default_invoice_type || "01GTKT",
        default_template_code: settings.default_template_code || "",
        default_serial: settings.default_serial || "",
      });
    }
  }, [settings?.id]);

  const onSave = async () => {
    await save.mutateAsync({
      tax_code: form.tax_code.trim(),
      username: form.username.trim(),
      password: form.password || undefined,
      api_url: form.api_url.trim(),
      default_invoice_type: form.default_invoice_type,
      default_template_code: form.default_template_code || undefined,
      default_serial: form.default_serial || undefined,
    });
    setForm(f => ({ ...f, password: "" }));
  };

  const usingEnv = !settings && envFallback?.available;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Wifi className="h-4 w-4" /> Tài khoản S-Invoice đang kết nối
        </CardTitle>
        <CardDescription>
          Mỗi quản lý có thể tự cấu hình tài khoản Viettel S-Invoice riêng. Nếu chưa cấu hình, hệ thống dùng tài khoản mặc định trong thông tin bảo mật.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status banner */}
        <div className={`rounded-md border p-3 flex items-start justify-between gap-3 ${
          settings?.last_login_status === "success" ? "border-sidebar-primary/40 bg-sidebar-primary/5" :
          settings?.last_login_status === "error" ? "border-destructive/40 bg-destructive/5" :
          "border-border bg-muted/30"
        }`}>
          <div className="space-y-1 text-sm">
            {settings ? (
              <>
                <p className="font-medium">
                  MST: <code>{settings.tax_code || "—"}</code> · Tên đăng nhập: <code>{settings.username || "—"}</code>
                </p>
                <p className="text-xs text-muted-foreground">URL: {settings.api_url}</p>
                {settings.last_login_at ? (
                  settings.last_login_status === "success" ? (
                    <p className="text-xs text-sidebar-primary flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Đăng nhập OK lúc {new Date(settings.last_login_at).toLocaleString("vi-VN")}
                    </p>
                  ) : (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <XCircle className="h-3 w-3" /> Lỗi lúc {new Date(settings.last_login_at).toLocaleString("vi-VN")}: {settings.last_login_error}
                    </p>
                  )
                ) : (
                  <p className="text-xs text-muted-foreground">Chưa thử đăng nhập lần nào.</p>
                )}
                {!settings.has_password && (
                  <Badge variant="destructive" className="mt-1">Chưa có mật khẩu</Badge>
                )}
              </>
            ) : usingEnv ? (
              <>
                <p className="font-medium flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  Đang dùng tài khoản mặc định (thông tin bảo mật)
                </p>
                <p className="text-xs text-muted-foreground">
                  MST: <code>{envFallback.tax_code}</code> · Tên đăng nhập: <code>{envFallback.username}</code>
                </p>
              </>
            ) : (
              <p className="text-destructive font-medium">⚠️ Chưa có cấu hình S-Invoice nào. Nhập thông tin bên dưới để bắt đầu.</p>
            )}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => testLogin.mutate()}
            disabled={testLogin.isPending || query.isLoading}
          >
            {testLogin.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Wifi className="h-3 w-3 mr-1" />}
            Kiểm tra kết nối
          </Button>
        </div>

        {/* Form */}
        <fieldset disabled={!canEdit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Mã số thuế *</Label>
              <Input value={form.tax_code} onChange={e => setForm({ ...form, tax_code: e.target.value })} placeholder="0108652480" />
            </div>
            <div className="space-y-1">
              <Label>Tên đăng nhập *</Label>
              <Input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} placeholder="0108652480-999" />
            </div>
            <div className="space-y-1 col-span-2">
              <Label>Mật khẩu {settings?.has_password && <span className="text-xs text-muted-foreground">(để trống = giữ nguyên)</span>}</Label>
              <Input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="••••••••" autoComplete="new-password" />
            </div>
            <div className="space-y-1 col-span-2">
              <Label>API URL</Label>
              <Input value={form.api_url} onChange={e => setForm({ ...form, api_url: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Loại HĐ mặc định</Label>
              <select
                className="w-full h-10 rounded-md border bg-background px-3"
                value={form.default_invoice_type}
                onChange={e => setForm({ ...form, default_invoice_type: e.target.value })}
              >
                <option value="01GTKT">01GTKT - HĐ GTGT</option>
                <option value="02GTTT">02GTTT - HĐ bán hàng</option>
                <option value="07KPTQ">07KPTQ - HĐ khác</option>
                <option value="03XKNB">03XKNB - Phiếu xuất kho</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>Mã mẫu hóa đơn (mặc định)</Label>
              <Input value={form.default_template_code} onChange={e => setForm({ ...form, default_template_code: e.target.value })} placeholder="01GTKT0/001" />
            </div>
            <div className="space-y-1 col-span-2">
              <Label>Ký hiệu hóa đơn (mặc định)</Label>
              <Input value={form.default_serial} onChange={e => setForm({ ...form, default_serial: e.target.value })} placeholder="C25TJF" />
            </div>
          </div>

          {canEdit && (
            <Button onClick={onSave} disabled={save.isPending || !form.tax_code || !form.username}>
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
              Lưu cấu hình
            </Button>
          )}
          {!canEdit && (
            <p className="text-xs text-muted-foreground">Bạn chỉ có quyền xem. Liên hệ quản trị viên hoặc quản lý để cập nhật.</p>
          )}
        </fieldset>
      </CardContent>
    </Card>
  );
};
