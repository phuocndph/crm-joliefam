import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Save, Upload, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useTemplateSettings, TemplateSettings } from "@/hooks/useTemplateSettings";
import { OnlineStampSignature } from "@/components/OnlineStampSignature";

interface QuoteTemplateSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function QuoteTemplateSettings({ open, onOpenChange }: QuoteTemplateSettingsProps) {
  const { settings: dbSettings, loading, saveSettings, uploadLogo, defaultSettings } = useTemplateSettings();
  const [settings, setSettings] = useState<TemplateSettings>(defaultSettings);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!loading) {
      setSettings(dbSettings);
    }
  }, [dbSettings, loading]);

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const success = await saveSettings(settings);
      if (success) {
        localStorage.setItem('quoteTemplateSettings', JSON.stringify(settings));
        toast.success("Cài đặt mẫu báo giá đã được lưu thành công!");
        onOpenChange(false);
      } else {
        toast.error("Không thể lưu cài đặt. Vui lòng thử lại.");
      }
    } catch (error) {
      toast.error("Có lỗi xảy ra khi lưu cài đặt.");
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const publicUrl = await uploadLogo(file);
      if (publicUrl) {
        setSettings(prev => ({ ...prev, logoUrl: publicUrl }));
        toast.success("Logo đã được tải lên thành công!");
      } else {
        const reader = new FileReader();
        reader.onload = (e) => {
          const result = e.target?.result as string;
          setSettings(prev => ({ ...prev, logoUrl: result }));
        };
        reader.readAsDataURL(file);
        toast.info("Logo sẽ được lưu cục bộ.");
      }
    } catch (error) {
      toast.error("Không thể tải lên logo.");
    } finally {
      setUploading(false);
    }
  };

  const handleTermChange = (index: number, value: string) => {
    const newTerms = [...settings.terms];
    newTerms[index] = value;
    setSettings(prev => ({ ...prev, terms: newTerms }));
  };

  const addTerm = () => {
    setSettings(prev => ({ ...prev, terms: [...prev.terms, ""] }));
  };

  const removeTerm = (index: number) => {
    const newTerms = settings.terms.filter((_, i) => i !== index);
    setSettings(prev => ({ ...prev, terms: newTerms }));
  };

  return (
    <Dialog open={open} onOpenChange={(val) => {
      onOpenChange(val);
      if (!val) {
        document.body.style.pointerEvents = '';
      }
    }}>
      <DialogContent className="flex h-[min(90dvh,calc(100dvh-1rem))] w-[calc(100vw-1rem)] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:w-[calc(100vw-2rem)]">
        <DialogHeader className="flex-shrink-0 border-b border-border bg-card px-4 py-3 pr-14 sm:px-6">
          <DialogTitle className="text-base font-semibold text-foreground sm:text-lg">
            Cài đặt mẫu báo giá
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Tùy chỉnh thông tin đơn vị, logo, chữ ký và điều khoản hiển thị trên bản in báo giá.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-1 items-center justify-center p-12 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Đang tải cài đặt...
          </div>
        ) : (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
            <section className="rounded-md border border-border bg-card p-4">
              <h3 className="mb-3 border-b border-border pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                1. Thông tin công ty & liên hệ
              </h3>
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="companyName" className="text-xs">Tên pháp lý công ty</Label>
                    <Input
                      id="companyName"
                      value={settings.companyName}
                      onChange={(e) => setSettings(prev => ({ ...prev, companyName: e.target.value }))}
                      placeholder="Tên công ty"
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="companyTitle" className="text-xs">Tiêu đề hiển thị trên báo giá</Label>
                    <Input
                      id="companyTitle"
                      value={settings.companyTitle}
                      onChange={(e) => setSettings(prev => ({ ...prev, companyTitle: e.target.value }))}
                      placeholder="Tiêu đề công ty"
                      className="h-9 text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label htmlFor="phone" className="text-xs">Điện thoại</Label>
                    <Input
                      id="phone"
                      value={settings.phone}
                      onChange={(e) => setSettings(prev => ({ ...prev, phone: e.target.value }))}
                      placeholder="Số điện thoại"
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="taxCode" className="text-xs">Mã số thuế</Label>
                    <Input
                      id="taxCode"
                      value={settings.taxCode}
                      onChange={(e) => setSettings(prev => ({ ...prev, taxCode: e.target.value }))}
                      placeholder="Mã số thuế"
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="directorName" className="text-xs">Người đại diện</Label>
                    <Input
                      id="directorName"
                      value={String((settings as unknown as Record<string, unknown>).directorName || "")}
                      onChange={(e) => setSettings(prev => ({ ...prev, directorName: e.target.value } as TemplateSettings))}
                      placeholder="Họ tên giám đốc"
                      className="h-9 text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="address" className="text-xs">Địa chỉ giao dịch</Label>
                    <Textarea
                      id="address"
                      value={settings.address}
                      onChange={(e) => setSettings(prev => ({ ...prev, address: e.target.value }))}
                      placeholder="Địa chỉ công ty"
                      rows={2}
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="headquarters" className="text-xs">Trụ sở chính</Label>
                    <Textarea
                      id="headquarters"
                      value={settings.headquarters}
                      onChange={(e) => setSettings(prev => ({ ...prev, headquarters: e.target.value }))}
                      placeholder="Địa chỉ trụ sở"
                      rows={2}
                      className="text-sm"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="bankInfo" className="text-xs">Thông tin tài khoản ngân hàng</Label>
                  <Input
                    id="bankInfo"
                    value={settings.bankInfo}
                    onChange={(e) => setSettings(prev => ({ ...prev, bankInfo: e.target.value }))}
                    placeholder="Số tài khoản - Ngân hàng - Chủ tài khoản"
                    className="h-9 text-sm"
                  />
                </div>
              </div>
            </section>

            <section className="rounded-md border border-border bg-card p-4">
              <h3 className="mb-3 border-b border-border pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                2. Logo, Chữ ký & Con dấu
              </h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label className="text-xs">Logo đơn vị</Label>
                  <div className="flex h-24 items-center justify-center rounded border border-border bg-muted/20 p-2">
                    {settings.logoUrl ? (
                      <img
                        src={settings.logoUrl}
                        alt="Xem trước logo"
                        className="max-h-20 object-contain"
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">Chưa có logo</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      id="logo"
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      className="hidden"
                      disabled={uploading}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => document.getElementById('logo')?.click()}
                      disabled={uploading}
                    >
                      {uploading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1.5 h-3.5 w-3.5" />}
                      Tải logo
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Chữ ký Giám đốc</Label>
                  <div className="flex h-24 items-center justify-center rounded border border-border bg-muted/20 p-2">
                    {settings.signatureUrl ? (
                      <img src={settings.signatureUrl} alt="Chữ ký" className="max-h-20 object-contain" />
                    ) : (
                      <span className="text-xs text-muted-foreground">Chưa có chữ ký</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      id="signature-upload"
                      type="file"
                      accept="image/png,image/webp"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setUploading(true);
                        const url = await uploadLogo(file);
                        if (url) setSettings(prev => ({ ...prev, signatureUrl: url }));
                        setUploading(false);
                      }}
                    />
                    <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => document.getElementById('signature-upload')?.click()} disabled={uploading}>
                      <Upload className="mr-1.5 h-3.5 w-3.5" />Tải chữ ký
                    </Button>
                    {settings.signatureUrl && (
                      <Button type="button" variant="ghost" size="sm" className="h-8 text-xs text-destructive" onClick={() => setSettings(prev => ({ ...prev, signatureUrl: "" }))}>
                        Xóa
                      </Button>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Con dấu công ty</Label>
                  <div className="flex h-24 items-center justify-center rounded border border-border bg-muted/20 p-2">
                    {settings.stampUrl ? (
                      <img src={settings.stampUrl} alt="Con dấu" className="max-h-20 object-contain" />
                    ) : (
                      <span className="text-xs text-muted-foreground">Chưa có con dấu</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      id="stamp-upload"
                      type="file"
                      accept="image/png,image/webp"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setUploading(true);
                        const url = await uploadLogo(file);
                        if (url) setSettings(prev => ({ ...prev, stampUrl: url }));
                        setUploading(false);
                      }}
                    />
                    <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => document.getElementById('stamp-upload')?.click()} disabled={uploading}>
                      <Upload className="mr-1.5 h-3.5 w-3.5" />Tải con dấu
                    </Button>
                    {settings.stampUrl && (
                      <Button type="button" variant="ghost" size="sm" className="h-8 text-xs text-destructive" onClick={() => setSettings(prev => ({ ...prev, stampUrl: "" }))}>
                        Xóa
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {(settings.stampUrl || settings.signatureUrl) && (
                <div className="mt-4 border-t border-border pt-3">
                  <Label className="mb-2 block text-xs">Căn chỉnh vị trí con dấu & chữ ký (kéo thả + thu phóng)</Label>
                  <OnlineStampSignature show={true} editable={true} sellerRep="Người đại diện" />
                </div>
              )}
            </section>

            <section className="rounded-md border border-border bg-card p-4">
              <div className="mb-3 flex items-center justify-between border-b border-border pb-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  3. Điều khoản & Ghi chú cuối báo giá
                </h3>
                <Button type="button" variant="outline" size="sm" onClick={addTerm} className="h-7 px-2.5 text-xs">
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Thêm điều khoản
                </Button>
              </div>
              <div className="space-y-2">
                {settings.terms.map((term, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span className="w-6 text-right text-xs font-medium text-muted-foreground">{index + 1}.</span>
                    <Input
                      value={term}
                      onChange={(e) => handleTermChange(index, e.target.value)}
                      placeholder="Nhập điều khoản báo giá..."
                      className="h-8 flex-1 text-xs sm:text-sm"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeTerm(index)}
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      aria-label={`Xóa điều khoản ${index + 1}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}

                <div className="pt-2">
                  <Label htmlFor="footerNote" className="mb-1 block text-xs">Lời cảm ơn / Ghi chú chân trang</Label>
                  <Input
                    id="footerNote"
                    value={settings.footerNote}
                    onChange={(e) => setSettings(prev => ({ ...prev, footerNote: e.target.value }))}
                    placeholder="Cảm ơn Quý khách đã tin tưởng sử dụng dịch vụ của chúng tôi!"
                    className="h-9 text-sm"
                  />
                </div>
              </div>
            </section>
          </div>
        )}

        <div className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-border bg-card px-4 py-3 sm:px-6">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
            Hủy
          </Button>
          <Button size="sm" onClick={handleSaveSettings} disabled={loading || saving}>
            {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
            {saving ? 'Đang lưu...' : 'Lưu cài đặt'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Export function to get current settings (backward compatible)
// eslint-disable-next-line react-refresh/only-export-components
export { getTemplateSettingsSync as getTemplateSettings } from "@/hooks/useTemplateSettings";
