import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { isLocalBackend } from '@/lib/runtime-config';
import { localApi } from '@/lib/local-api';

export interface PositionSize {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TemplateSettings {
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
  signatureUrl: string;
  stampUrl: string;
  stampPosition: PositionSize;
  signaturePosition: PositionSize;
}

const defaultSettings: TemplateSettings = {
  companyName: "CÔNG TY TNHH GIA LỘC HƯNG PHÁT",
  companyTitle: "Showroom Rèm Cao Cấp - Uy Tín & Chất Lượng",
  address: "BT06-22 Khu đô thị An Vượng Villa, Dương Nội, Hà Đông, Hà Nội",
  phone: "096.866.06.06",
  taxCode: "0110184566",
  headquarters: "Số 1 Ngõ 54 Ngọc Hồi, Hoàng Liệt, Hoàng Mai, Hà Nội",
  bankInfo: "STK: 0021000410845 VIETCOMBANK - ĐÀO THỊ TRÀ MY (Chi Nhánh TT)",
  quoteTitleColor: "#1976d2",
  companyTitleColor: "#d32f2f",
  logoUrl: "/lovable-uploads/443e6de9-e8d8-4bdc-ba8a-ff9a4c542193.png",
  terms: [
    "Báo giá có hiệu lực trong vòng 30 ngày.",
    "Đặt cọc 70% giá trị đơn hàng khi ký hợp đồng.",
    "Thanh toán 30% còn lại khi hoàn thành lắp đặt.",
    "Bảo hành sản phẩm 24 tháng."
  ],
  footerNote: "Cảm ơn Quý khách đã tin tưởng sử dụng dịch vụ của chúng tôi!",
  signatureUrl: "",
  stampUrl: "",
  stampPosition: { x: 5, y: 50, width: 160, height: 160 },
  signaturePosition: { x: 30, y: 45, width: 140, height: 100 },
};

export function useTemplateSettings() {
  const [settings, setSettings] = useState<TemplateSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      if (isLocalBackend()) {
        const cached = localStorage.getItem('quoteTemplateSettings');
        const remote = await localApi.quoteTemplateSettings();
        if (remote) {
          const textValue = (value: unknown, fallback: string) => typeof value === 'string' && value ? value : fallback;
          const mapped = {
            companyName: textValue(remote.company_name, defaultSettings.companyName),
            companyTitle: textValue(remote.company_title, defaultSettings.companyTitle),
            address: textValue(remote.address, defaultSettings.address),
            phone: textValue(remote.phone, defaultSettings.phone),
            taxCode: textValue(remote.tax_code, defaultSettings.taxCode),
            headquarters: textValue(remote.headquarters, defaultSettings.headquarters),
            bankInfo: textValue(remote.bank_info, defaultSettings.bankInfo),
            quoteTitleColor: textValue(remote.quote_title_color, defaultSettings.quoteTitleColor),
            companyTitleColor: textValue(remote.company_title_color, defaultSettings.companyTitleColor),
            logoUrl: textValue(remote.logo_url, defaultSettings.logoUrl),
            terms: Array.isArray(remote.terms) ? remote.terms as string[] : defaultSettings.terms,
            footerNote: textValue(remote.footer_note, defaultSettings.footerNote),
            signatureUrl: textValue(remote.signature_url, defaultSettings.signatureUrl),
            stampUrl: textValue(remote.stamp_url, defaultSettings.stampUrl),
            stampPosition: (remote.stamp_position || defaultSettings.stampPosition) as PositionSize,
            signaturePosition: (remote.signature_position || defaultSettings.signaturePosition) as PositionSize,
          };
          localStorage.setItem('quoteTemplateSettings', JSON.stringify(mapped));
          setSettings(mapped);
        } else if (cached) {
          try { setSettings({ ...defaultSettings, ...JSON.parse(cached) }); } catch { setSettings(defaultSettings); }
        } else setSettings(defaultSettings);
        return;
      }

      const { data, error } = await supabase
        .from('quote_template_settings')
        .select('*')
        .eq('tenant_id', 'default')
        .single();

      if (error) {
        // If no settings found, use default
        if (error.code === 'PGRST116') {
          console.log('No template settings found, using defaults');
          setSettings(defaultSettings);
        } else {
          throw error;
        }
      } else if (data) {
        // Parse terms from JSONB
        const terms = Array.isArray(data.terms) 
          ? data.terms as string[]
          : defaultSettings.terms;
        
        setSettings({
          companyName: data.company_name || defaultSettings.companyName,
          companyTitle: data.company_title || defaultSettings.companyTitle,
          address: data.address || defaultSettings.address,
          phone: data.phone || defaultSettings.phone,
          taxCode: data.tax_code || defaultSettings.taxCode,
          headquarters: data.headquarters || defaultSettings.headquarters,
          bankInfo: data.bank_info || defaultSettings.bankInfo,
          quoteTitleColor: data.quote_title_color || defaultSettings.quoteTitleColor,
          companyTitleColor: data.company_title_color || defaultSettings.companyTitleColor,
          logoUrl: data.logo_url || defaultSettings.logoUrl,
          terms,
          footerNote: data.footer_note || defaultSettings.footerNote,
          signatureUrl: (data as any).signature_url || defaultSettings.signatureUrl,
          stampUrl: (data as any).stamp_url || defaultSettings.stampUrl,
          stampPosition: (data as any).stamp_position || defaultSettings.stampPosition,
          signaturePosition: (data as any).signature_position || defaultSettings.signaturePosition,
        });
      }
    } catch (err) {
      console.error('Error fetching template settings:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setSettings(defaultSettings);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();

    if (isLocalBackend()) return;
    
    // Setup realtime subscription for live sync
    const channelName = `template-settings-${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'quote_template_settings',
          filter: 'tenant_id=eq.default'
        },
        (payload) => {
          console.log('📡 Template settings changed:', payload);
          fetchSettings(); // Re-fetch when data changes
        }
      )
      .subscribe((status) => {
        console.log(`📡 Template settings subscription status:`, status);
      });

    return () => {
      console.log(`📡 Cleaning up ${channelName} subscription`);
      supabase.removeChannel(channel);
    };
  }, [fetchSettings]);

  const saveSettings = async (newSettings: TemplateSettings): Promise<boolean> => {
    try {
      if (isLocalBackend()) {
        await localApi.saveQuoteTemplateSettings(newSettings as unknown as Record<string, unknown>);
        localStorage.setItem('quoteTemplateSettings', JSON.stringify(newSettings));
        setSettings(newSettings);
        setError(null);
        return true;
      }

      const { error } = await supabase
        .from('quote_template_settings')
        .upsert({
          tenant_id: 'default',
          company_name: newSettings.companyName,
          company_title: newSettings.companyTitle,
          address: newSettings.address,
          phone: newSettings.phone,
          tax_code: newSettings.taxCode,
          headquarters: newSettings.headquarters,
          bank_info: newSettings.bankInfo,
          quote_title_color: newSettings.quoteTitleColor,
          company_title_color: newSettings.companyTitleColor,
          logo_url: newSettings.logoUrl,
          terms: newSettings.terms,
          footer_note: newSettings.footerNote,
          signature_url: newSettings.signatureUrl,
          stamp_url: newSettings.stampUrl,
          stamp_position: newSettings.stampPosition,
          signature_position: newSettings.signaturePosition,
          updated_at: new Date().toISOString(),
        } as any, {
          onConflict: 'tenant_id'
        });

      if (error) throw error;
      
      setSettings(newSettings);
      return true;
    } catch (err) {
      console.error('Error saving template settings:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      return false;
    }
  };

  const uploadLogo = async (file: File): Promise<string | null> => {
    try {
      if (isLocalBackend()) {
        return await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error || new Error('Không thể đọc tệp logo local.'));
          reader.readAsDataURL(file);
        });
      }

      const fileExt = file.name.split('.').pop();
      const fileName = `logo-${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('logos')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('logos')
        .getPublicUrl(filePath);

      return publicUrl;
    } catch (err) {
      console.error('Error uploading logo:', err);
      return null;
    }
  };

  return {
    settings,
    loading,
    error,
    saveSettings,
    uploadLogo,
    refetch: fetchSettings,
    defaultSettings,
  };
}

// Sync function for backward compatibility (fetches from localStorage first, then DB)
export const getTemplateSettingsSync = (): TemplateSettings => {
  // First check localStorage for cached settings
  const cached = localStorage.getItem('quoteTemplateSettings');
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {
      // Invalid JSON, ignore
    }
  }
  return defaultSettings;
};
