import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

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
};

export function useTemplateSettings() {
  const [settings, setSettings] = useState<TemplateSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = async () => {
    try {
      setLoading(true);
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
        });
      }
    } catch (err) {
      console.error('Error fetching template settings:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setSettings(defaultSettings);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
    
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
  }, []);

  const saveSettings = async (newSettings: TemplateSettings): Promise<boolean> => {
    try {
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
          updated_at: new Date().toISOString(),
        }, {
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
