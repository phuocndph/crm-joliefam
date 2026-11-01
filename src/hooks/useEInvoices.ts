import { useAuthReady } from "@/hooks/useAuthReady";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { isLocalBackend } from "@/lib/runtime-config";
import { localApi } from "@/lib/local-api";

export const useEInvoices = (contractId?: string) => {
  const { user, isReady } = useAuthReady();
  return useQuery({
    queryKey: ["einvoices", user?.id, contractId || "all"],
    enabled: isReady && Boolean(user),
    queryFn: async () => {
      if (isLocalBackend()) {
        return (await localApi.einvoices(contractId))
          .map((row) => ({ ...row, id: row.id || row.source_key }))
          .filter((invoice: any) => !contractId || invoice.contract_id === contractId);
      }
      let query = supabase
        .from("einvoices" as any)
        .select(`
          id,
          contract_id,
          transaction_uuid,
          invoice_number,
          invoice_type,
          template_code,
          invoice_series,
          status,
          is_draft,
          issued_date,
          created_at,
          updated_at,
          total_amount,
          vat_amount,
          total_with_vat,
          buyer_name,
          buyer_tax_code,
          response_data,
          request_data,
          draft_payload,
          invoice_action,
          original_invoice_id,
          replaces_uuid,
          replaced_by_uuid,
          adjusts_uuid,
          adjusted_by_uuid,
          adjustment_type,
          email_sent_to,
          pdf_url,
          xml_url,
          cancelled_at,
          cancel_reason,
          payment_status_synced,
          reservation_code,
          last_synced_at,
          error_code
        `)
        .order("created_at", { ascending: false });

      if (contractId) {
        query = query.eq("contract_id", contractId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as any[];
    },
    staleTime: 5 * 60 * 1000,
  });
};

const callApi = async (action: string, extra: any = {}) => {
  if (isLocalBackend()) throw new Error(`Tác vụ ${action} của S-Invoice cần kết nối Viettel; local chỉ đọc dữ liệu đã đồng bộ.`);
  const { data, error } = await supabase.functions.invoke("vinvoice-api", { body: { action, ...extra } });
  if (error) throw new Error(error.message);
  if (data && data.success === false) throw new Error(data.error || "Lỗi không xác định");
  return data;
};

export const useEInvoiceActions = () => {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["einvoices"] });

  const syncInvoices = useMutation({
    mutationFn: (p: { fromDate: number; toDate: number; invoiceType?: string }) =>
      callApi("sync_invoices", p),
    onSuccess: (d: any) => {
      if (d?.empty || d?.total === 0) toast.info("Không có hoá đơn trong khoảng ngày đã chọn");
      else toast.success(`Đã đồng bộ ${d.synced}/${d.total} hoá đơn`);
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const downloadFile = useMutation({
    mutationFn: async (p: { transactionUuid: string; fileType: "PDF" | "XML"; einvoice_id?: string }) => {
      if (isLocalBackend() && p.einvoice_id) return localApi.previewLocalEInvoice(p.einvoice_id);
      return callApi("download_file", p);
    },
    onSuccess: (d: any) => {
      if (!d?.base64) return toast.error("Viettel không trả về file");
      const bytes = Uint8Array.from(atob(d.base64), c => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: d.fileType === "XML" ? "application/xml" : "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = d.fileName || `invoice.${d.fileType.toLowerCase()}`;
      a.click(); URL.revokeObjectURL(url);
      toast.success("Đã tải file");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const cancelInvoice = useMutation({
    mutationFn: (p: { transactionUuid: string; reason: string; einvoice_id: string }) =>
      callApi("cancel_invoice", p),
    onSuccess: () => { toast.success("Đã huỷ hoá đơn"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const replaceInvoice = useMutation({
    mutationFn: (p: { contract: any; options: any; original_einvoice_id: string }) =>
      callApi("replace_invoice", p),
    onSuccess: () => { toast.success("Đã phát hành HĐ thay thế"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const adjustInvoice = useMutation({
    mutationFn: (p: { contract: any; options: any; original_einvoice_id: string }) =>
      callApi("adjust_invoice", p),
    onSuccess: () => { toast.success("Đã phát hành HĐ điều chỉnh"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const sendEmail = useMutation({
    mutationFn: (p: { transactionUuid: string; email: string; einvoice_id?: string }) =>
      callApi("send_email", p),
    onSuccess: () => { toast.success("Đã gửi email cho khách"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const updatePayment = useMutation({
    mutationFn: (p: { transactionUuid: string; paid: boolean; einvoice_id?: string }) =>
      callApi("update_payment", p),
    onSuccess: () => { toast.success("Đã cập nhật trạng thái thanh toán"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const syncDrafts = useMutation({
    mutationFn: (p: { fromDate: number; toDate: number; invoiceType?: string }) =>
      callApi("sync_drafts", p),
    onSuccess: (d: any) => {
      const total = d?.total ?? 0;
      const synced = d?.synced ?? 0;
      if (synced > 0) {
        toast.success(d?.message || `Đã đồng bộ ${synced} HĐ chưa phát hành`, { duration: 8000 });
        if (d?.attempts) console.log("[sync_drafts] attempts:", d.attempts);
      } else {
        const msg = d?.message || "Viettel không trả về HĐ chưa phát hành trong khoảng ngày/loại HĐ này.";
        toast.info(msg, { duration: 8000 });
        if (d?.attempts) console.log("[sync_drafts] attempts:", d.attempts, "sample:", d?.primary_sample);
      }
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const issueDraft = useMutation({
    mutationFn: (p: { einvoice_id: string }) => isLocalBackend()
      ? localApi.issueLocalEInvoice(p.einvoice_id)
      : callApi("issue_draft", p),
    onSuccess: (d: any) => { toast.info(d?.message || (isLocalBackend() ? "Đã giữ hoá đơn ở trạng thái nháp local" : "Đã phát hành hoá đơn")); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteDraft = useMutation({
    mutationFn: (p: { einvoice_id: string }) => isLocalBackend()
      ? localApi.deleteLocalEInvoice(p.einvoice_id)
      : callApi("delete_draft", p),
    onSuccess: () => { toast.success("Đã xoá bản nháp"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const previewDraft = useMutation({
    mutationFn: (p: { einvoice_id: string }) => isLocalBackend()
      ? localApi.previewLocalEInvoice(p.einvoice_id)
      : callApi("preview_draft", p),
    onError: (e: any) => toast.error(e.message),
  });

  const downloadMinute = useMutation({
    mutationFn: (p: { transactionUuid: string; minuteType: 1 | 2 | 3; einvoice_id?: string }) =>
      callApi("download_minute", p),
    onSuccess: (d: any) => {
      if (!d?.base64) return toast.error("Viettel không trả về biên bản");
      const bytes = Uint8Array.from(atob(d.base64), c => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = d.fileName || "bien-ban.pdf";
      a.click(); URL.revokeObjectURL(url);
      toast.success("Đã tải biên bản");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return {
    syncInvoices, syncDrafts, downloadFile, cancelInvoice,
    replaceInvoice, adjustInvoice, sendEmail, updatePayment,
    issueDraft, deleteDraft, previewDraft, downloadMinute,
  };
};
