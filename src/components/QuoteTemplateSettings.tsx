import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Save, Upload, Image } from "lucide-react";
import { toast } from "sonner";

interface TemplateSettings {
  companyName: string;
  companyTitle: string;
  address: string;
  phone: string;
  taxCode: string;
  headquarters: string;
  bankInfo: string;
  quoteTitleColor: string;
  companyTitleColor: string;
  logoUrl: string;
  terms: string[];
  footerNote: string;
}

interface QuoteTemplateSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function QuoteTemplateSettings({ open, onOpenChange }: QuoteTemplateSettingsProps) {
  const [settings, setSettings] = useState<TemplateSettings>({
    companyName: "XƯỞNG SẢN XUẤT CHĂN GA GỐI NỆM JOLIE'FAM",
    companyTitle: "CÔNG TY TNHH GIA LỘC HÙNG PHÁT",
    address: "Số 21 Ngõ 562 Đường Linh Nam, Phường Linh Nam, Quận Hoàng Mai, Thành Phố Hà Nội, Việt Nam",
    phone: "0828686866",
    taxCode: "0134345789",
    headquarters: "Số 21 Ngõ 562 đường Linh Nam, Phường Linh Nam, Quận Hoàng Mai, Hà Nội",
    bankInfo: "Ngân hàng TMCP đầu tư và phát triển Việt Nam ( BIDV) - Chi nhánh Hà Nội : 2110199996",
    quoteTitleColor: "#1976d2",
    companyTitleColor: "#d32f2f",
    logoUrl: "/lovable-uploads/6b66a50f-3a2e-4f5a-bad8-950cf55392fa.png",
    terms: [
      "Bảo giá có hiệu lực trong 15 ngày kể từ ngày lập.",
      "Thanh toán: 30% trước khi sản xuất, 70% trước khi giao hàng.",
      "Thời gian giao hàng: 7-10 ngày sau khi sản xuất hoàn tất cọc.",
      "Chất lượng sản phẩm được đảm bảo theo tiêu chuẩn."
    ],
    footerNote: "Cảm ơn Quý khách đã tin tướng và đặng sản phẩm của chúng tôi!"
  });

  // Load settings from localStorage on component mount
  useEffect(() => {
    const savedSettings = localStorage.getItem('quoteTemplateSettings');
    if (savedSettings) {
      setSettings(JSON.parse(savedSettings));
    }
  }, []);

  const handleSaveSettings = () => {
    localStorage.setItem('quoteTemplateSettings', JSON.stringify(settings));
    toast.success("Cài đặt template đã được lưu thành công!");
    onOpenChange(false);
  };

  const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        setSettings(prev => ({ ...prev, logoUrl: result }));
      };
      reader.readAsDataURL(file);
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
          <p className="text-gray-600 mt-1">Tùy chỉnh thông tin công ty và template báo giá</p>
        </div>

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
                <Label htmlFor="headquarters">Trụ sở</Label>
                <Textarea
                  id="headquarters"
                  value={settings.headquarters}
                  onChange={(e) => setSettings(prev => ({ ...prev, headquarters: e.target.value }))}
                  placeholder="Địa chỉ trụ sở"
                  rows={2}
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
                  <Label htmlFor="logo">Tải lên logo mới</Label>
                  <div className="flex items-center space-x-2 mt-2">
                    <Input
                      id="logo"
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => document.getElementById('logo')?.click()}
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      Chọn file
                    </Button>
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

        {/* Action Buttons */}
        <div className="flex items-center justify-end space-x-4 p-6 border-t bg-gray-50">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button onClick={handleSaveSettings}>
            <Save className="w-4 h-4 mr-2" />
            Lưu cài đặt
          </Button>
        </div>
      </div>
    </div>
  );
}

// Export function to get current settings
export const getTemplateSettings = (): TemplateSettings => {
  const defaultSettings: TemplateSettings = {
    companyName: "XƯỞNG SẢN XUẤT CHĂN GA GỐI NỆM JOLIE'FAM",
    companyTitle: "CÔNG TY TNHH GIA LỘC HÙNG PHÁT",
    address: "Số 21 Ngõ 562 Đường Linh Nam, Phường Linh Nam, Quận Hoàng Mai, Thành Phố Hà Nội, Việt Nam",
    phone: "0828686866",
    taxCode: "0134345789",
    headquarters: "Số 21 Ngõ 562 đường Linh Nam, Phường Linh Nam, Quận Hoàng Mai, Hà Nội",
    bankInfo: "Ngân hàng TMCP đầu tư và phát triển Việt Nam ( BIDV) - Chi nhánh Hà Nội : 2110199996",
    quoteTitleColor: "#1976d2",
    companyTitleColor: "#d32f2f",
    logoUrl: "/lovable-uploads/6b66a50f-3a2e-4f5a-bad8-950cf55392fa.png",
    terms: [
      "Bảo giá có hiệu lực trong 15 ngày kể từ ngày lập.",
      "Thanh toán: 30% trước khi sản xuất, 70% trước khi giao hàng.",
      "Thời gian giao hàng: 7-10 ngày sau khi sản xuất hoàn tất cọc.",
      "Chất lượng sản phẩm được đảm bảo theo tiêu chuẩn."
    ],
    footerNote: "Cảm ơn Quý khách đã tin tướng và đặng sản phẩm của chúng tôi!"
  };

  const savedSettings = localStorage.getItem('quoteTemplateSettings');
  return savedSettings ? JSON.parse(savedSettings) : defaultSettings;
};