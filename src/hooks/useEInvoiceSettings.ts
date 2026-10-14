import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { isLocalBackend } from "@/lib/runtime-config";
import { localApi } from "@/lib/local-api";

export type EInvoiceSettings = {
  id: string;
  manager_id: string;
  tax_code: string | null;
  username: string | null;
  api_url: string | null;
  default_invoice_type: string | null;
  default_template_code: string | null;
  default_serial: string | null;
  last_login_at: string | null;
  last_login_status: string | null;
  last_login_error: string | null;
  has_password: boolean;
};

const call = async (action: string, extra: any = {}) => {
  const { data, error } = await supabase.functions.invoke("vinvoice-api", { body: { action, ...extra } });
  if (error) throw new Error(error.message);
  if (data && data.success === false) throw new Error(data.error || "Lỗi không xác định");
  return data;
};

export const useEInvoiceSettings = () => {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["einvoice-settings"],
    queryFn: () => isLocalBackend() ? localApi.einvoiceSettings() : call("get_settings"),
  });

  const save = useMutation({
    mutationFn: (p: {
      tax_code: string;
      username: string;
      password?: string;
      api_url?: string;
      default_invoice_type?: string;
      default_template_code?: string;
      default_serial?: string;
    }) => isLocalBackend() ? localApi.saveEinvoiceSettings(p) : call("save_settings", p),
    onSuccess: () => {
      toast.success("Đã lưu cấu hình S-Invoice");
      qc.invalidateQueries({ queryKey: ["einvoice-settings"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const testLogin = useMutation({
    mutationFn: () => isLocalBackend() ? Promise.reject(new Error("Local SQL không gọi dịch vụ Viettel. Dữ liệu hoá đơn đã đồng bộ vẫn được giữ nguyên.")) : call("test_login"),
    onSuccess: (d: any) => {
      toast.success(`Đăng nhập OK — MST ${d.tax_code}`);
      qc.invalidateQueries({ queryKey: ["einvoice-settings"] });
    },
    onError: (e: any) => toast.error(`Đăng nhập thất bại: ${e.message}`),
  });

  return { query, save, testLogin };
};
