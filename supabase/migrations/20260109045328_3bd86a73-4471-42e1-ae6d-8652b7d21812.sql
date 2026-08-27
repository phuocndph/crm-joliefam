-- Create quote_template_settings table for synchronized template settings
CREATE TABLE public.quote_template_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT DEFAULT 'default' UNIQUE,
  company_name TEXT DEFAULT 'CÔNG TY TNHH NỘI THẤT REMY',
  company_title TEXT DEFAULT 'Showroom Rèm Cao Cấp Remy - Uy Tín & Chất Lượng',
  address TEXT DEFAULT 'BT06-22 Khu đô thị An Vượng Villa, Dương Nội, Hà Đông, Hà Nội',
  phone TEXT DEFAULT '096.866.06.06',
  tax_code TEXT DEFAULT '0110184566',
  headquarters TEXT DEFAULT 'Số 1 Ngõ 54 Ngọc Hồi, Hoàng Liệt, Hoàng Mai, Hà Nội',
  bank_info TEXT DEFAULT 'STK: 0021000410845 VIETCOMBANK - ĐÀO THỊ TRÀ MY (Chi Nhánh TT)',
  quote_title_color TEXT DEFAULT '#1976d2',
  company_title_color TEXT DEFAULT '#d32f2f',
  logo_url TEXT,
  terms JSONB DEFAULT '["Báo giá có hiệu lực trong vòng 30 ngày.", "Đặt cọc 70% giá trị đơn hàng khi ký hợp đồng.", "Thanh toán 30% còn lại khi hoàn thành lắp đặt.", "Bảo hành sản phẩm 24 tháng."]'::jsonb,
  footer_note TEXT DEFAULT 'Cảm ơn Quý khách đã tin tưởng sử dụng dịch vụ của chúng tôi!',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.quote_template_settings ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read settings
CREATE POLICY "Users can view template settings"
ON public.quote_template_settings
FOR SELECT
TO authenticated
USING (true);

-- Only admins can update settings
CREATE POLICY "Admins can update template settings"
ON public.quote_template_settings
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'admin'
  )
);

-- Only admins can insert settings
CREATE POLICY "Admins can insert template settings"
ON public.quote_template_settings
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'admin'
  )
);

-- Create storage bucket for logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('logos', 'logos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload logos
CREATE POLICY "Authenticated users can upload logos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'logos');

-- Allow public access to view logos
CREATE POLICY "Public can view logos"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'logos');

-- Allow authenticated users to update their logos
CREATE POLICY "Authenticated users can update logos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'logos');

-- Insert default settings
INSERT INTO public.quote_template_settings (tenant_id)
VALUES ('default')
ON CONFLICT (tenant_id) DO NOTHING;

-- Create trigger for updated_at
CREATE TRIGGER update_quote_template_settings_updated_at
BEFORE UPDATE ON public.quote_template_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();