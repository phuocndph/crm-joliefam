import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Save, Upload, Loader2 } from "lucide-react";
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

  // Sync local state with DB settings when loaded
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
        // Also cache in localStorage for faster initial load
        localStorage.setItem('quoteTemplateSettings', JSON.stringify(settings));
        toast.success("Cài đặt template đã được lưu thành công!");
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
        // Fallback to base64 for preview
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

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto m-4">
        <div className="p-6 border-b">
          <h2 className="text-2xl font-bold text-gray-900">Cài đặt Template Báo Giá</h2>
          <p className="text-gray-600 mt-1">Tùy chỉnh thông tin công ty và template báo giá (đồng bộ cho tất cả nhân viên)</p>
        </div>

        {loading ? (
          <div className="p-12 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <span className="ml-2">Đang tải cài đặt...</span>
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Company Information */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Thông tin công ty</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="companyName">Tên công ty</Label>
                    <Input
                      id="companyName"
                      value={settings.companyName}
                      onChange={(e) => setSettings(prev => ({ ...prev, companyName: e.target.value }))}
                      placeholder="Tên công ty"
                    />
                  </div>
                  <div>
                    <Label htmlFor="companyTitle">Tiêu đề công ty</Label>
                    <Input
                      id="companyTitle"
                      value={settings.companyTitle}
                      onChange={(e) => setSettings(prev => ({ ...prev, companyTitle: e.target.value }))}
                      placeholder="Tiêu đề công ty"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="address">Địa chỉ</Label>
                  <Textarea
                    id="address"
                    value={settings.address}
                    onChange={(e) => setSettings(prev => ({ ...prev, address: e.target.value }))}
                    placeholder="Địa chỉ công ty"
                    rows={2}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="phone">Điện thoại</Label>
                    <Input
                      id="phone"
                      value={settings.phone}
                      onChange={(e) => setSettings(prev => ({ ...prev, phone: e.target.value }))}
                      placeholder="Số điện thoại"
                    />
                  </div>
                  <div>
                    <Label htmlFor="taxCode">Mã số thuế</Label>
                    <Input
                      id="taxCode"
                      value={settings.taxCode}
                      onChange={(e) => setSettings(prev => ({ ...prev, taxCode: e.target.value }))}
                      placeholder="Mã số thuế"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="directorName">Người đại diện</Label>
                  <Input
                    id="directorName"
                    value={(settings as any).directorName || "TRẦN THỊ THANH HOAN"}
                    onChange={(e) => setSettings(prev => ({ ...prev, directorName: e.target.value } as any))}
                    placeholder="Họ tên giám đốc"
                  />
                </div>

                <div>
                  <Label htmlFor="bankInfo">Thông tin ngân hàng</Label>
                  <Textarea
                    id="bankInfo"
                    value={settings.bankInfo}
                    onChange={(e) => setSettings(prev => ({ ...prev, bankInfo: e.target.value }))}
                    placeholder="Thông tin tài khoản ngân hàng"
                    rows={2}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Logo Upload */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Logo công ty</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center space-x-4">
                  <div className="flex-shrink-0">
                    {settings.logoUrl && (
                      <img
                        src={settings.logoUrl}
                        alt="Logo preview"
                        className="w-24 h-24 object-contain border border-gray-300 rounded"
                      />
                    )}
                  </div>
                  <div className="flex-1">
                    <Label htmlFor="logo">Tải lên logo mới (sẽ đồng bộ cho tất cả)</Label>
                    <div className="flex items-center space-x-2 mt-2">
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
                        onClick={() => document.getElementById('logo')?.click()}
                        disabled={uploading}
                      >
                        {uploading ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Upload className="w-4 h-4 mr-2" />
                        )}
                        {uploading ? 'Đang tải...' : 'Chọn file'}
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Signature & Stamp Upload */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Chữ ký & Con dấu (Ký online)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">Upload ảnh PNG trong suốt để sử dụng khi ký & đóng dấu online trên hợp đồng, đề nghị thanh toán, tạm ứng.</p>
                <div className="grid grid-cols-2 gap-6">
                  {/* Signature */}
                  <div>
                    <Label>Chữ ký Giám đốc</Label>
                    <div className="mt-2 border rounded p-3 bg-gray-50 min-h-[100px] flex items-center justify-center">
                      {settings.signatureUrl ? (
                        <img src={settings.signatureUrl} alt="Chữ ký" className="max-h-20 object-contain" />
                      ) : (
                        <span className="text-sm text-muted-foreground">Chưa có chữ ký</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
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
                      <Button type="button" variant="outline" size="sm" onClick={() => document.getElementById('signature-upload')?.click()} disabled={uploading}>
                        <Upload className="w-4 h-4 mr-1" />Upload
                      </Button>
                      {settings.signatureUrl && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => setSettings(prev => ({ ...prev, signatureUrl: "" }))} className="text-red-600">
                          Xóa
                        </Button>
                      )}
                    </div>
                  </div>
                  {/* Stamp */}
                  <div>
                    <Label>Con dấu công ty</Label>
                    <div className="mt-2 border rounded p-3 bg-gray-50 min-h-[100px] flex items-center justify-center">
                      {settings.stampUrl ? (
                        <img src={settings.stampUrl} alt="Con dấu" className="max-h-20 object-contain" />
                      ) : (
                        <span className="text-sm text-muted-foreground">Chưa có con dấu</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
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
                      <Button type="button" variant="outline" size="sm" onClick={() => document.getElementById('stamp-upload')?.click()} disabled={uploading}>
                        <Upload className="w-4 h-4 mr-1" />Upload
                      </Button>
                      {settings.stampUrl && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => setSettings(prev => ({ ...prev, stampUrl: "" }))} className="text-red-600">
                          Xóa
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Color Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Màu sắc</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="companyTitleColor">Màu tiêu đề công ty</Label>
                    <div className="flex items-center space-x-2">
                      <Input
                        id="companyTitleColor"
                        type="color"
                        value={settings.companyTitleColor}
                        onChange={(e) => setSettings(prev => ({ ...prev, companyTitleColor: e.target.value }))}
                        className="w-16 h-10"
                      />
                      <Input
                        value={settings.companyTitleColor}
                        onChange={(e) => setSettings(prev => ({ ...prev, companyTitleColor: e.target.value }))}
                        placeholder="#d32f2f"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="quoteTitleColor">Màu tiêu đề báo giá</Label>
                    <div className="flex items-center space-x-2">
                      <Input
                        id="quoteTitleColor"
                        type="color"
                        value={settings.quoteTitleColor}
                        onChange={(e) => setSettings(prev => ({ ...prev, quoteTitleColor: e.target.value }))}
                        className="w-16 h-10"
                      />
                      <Input
                        value={settings.quoteTitleColor}
                        onChange={(e) => setSettings(prev => ({ ...prev, quoteTitleColor: e.target.value }))}
                        placeholder="#1976d2"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Terms and Conditions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Điều khoản và điều kiện</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {settings.terms.map((term, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      <span className="text-sm text-gray-500 w-8">{index + 1}.</span>
                      <Input
                        value={term}
                        onChange={(e) => handleTermChange(index, e.target.value)}
                        placeholder="Nhập điều khoản"
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => removeTerm(index)}
                        className="text-red-600 hover:text-red-700"
                      >
                        Xóa
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addTerm}
                    className="mt-2"
                  >
                    Thêm điều khoản
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Footer Note */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Ghi chú cuối trang</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={settings.footerNote}
                  onChange={(e) => setSettings(prev => ({ ...prev, footerNote: e.target.value }))}
                  placeholder="Ghi chú cuối trang"
                  rows={3}
                />
              </CardContent>
            </Card>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end space-x-4 p-6 border-t bg-gray-50">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Hủy
          </Button>
          <Button onClick={handleSaveSettings} disabled={loading || saving}>
            {saving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            {saving ? 'Đang lưu...' : 'Lưu cài đặt'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Export function to get current settings (backward compatible)
export { getTemplateSettingsSync as getTemplateSettings } from "@/hooks/useTemplateSettings";
