import {
  localFetch,
  captureLocalAuthGuard,
  getLocalMe,
  getLocalUserSession,
} from "@/lib/local-auth";
import { localApiUrl, isLocalBackend } from "@/lib/runtime-config";
export type InvoiceRecord = Record<string, unknown> & {
  id: string;
  company_id: string | null;
  revision: string;
  source_kind: string;
  is_draft: boolean;
  currency: string;
  review_state: string;
  direction: string;
  total_amount: string;
  vat_amount: string;
  total_with_vat: string;
  buyer_name: string;
  seller_name: string;
  invoice_number: string | null;
  invoice_series: string | null;
  discrepancy: string[];
};
export type InvoiceCompany = {
  id: string;
  tax_code: string;
  legal_name: string;
  address: string;
  capabilities: string[];
};
export type InvoiceContractSplitEditor = {
  invoice_revision: string;
  allocation_id: string;
  allocation_amount: string;
  currency: "VND";
  source_revision: string;
  splits: {contract_id:string;contract_number:string;amount:string}[];
  total: string;
  remaining: string;
  editable: boolean;
  stale: boolean;
  reasons: string[];
};
/** Public session identity only; credentials never enter query keys. Requests also assert their auth guard. */
export function invoiceSessionScope() {
  const session=getLocalUserSession();
  return session ? `${session.actor}:${session.expires_at}` : "local-session";
}
export type InvoiceDetail = {
  invoice: InvoiceRecord;
  draft_source: Record<string, unknown>;
  lines: Record<string, unknown>[];
  files: Record<string, unknown>[];
  contracts: Record<string, unknown>[];
  payments: Record<string, unknown>[];
  documents: Record<string, unknown>[];
  history: Record<string, unknown>[];
  observations: Record<string, unknown>[];
  relations: Record<string, unknown>[];
  source_evidence: Record<string, unknown>[];
  dossier: {
    business_links: Record<string, unknown>[];
    payment: {
      state: string;
      allocated: string | null;
      remaining: string | null;
      reason: string;
    };
    checklist: {
      item: string;
      assessment: string;
      present: boolean;
      missing: boolean;
      reason: string | null;
    }[];
    missing_xml: boolean;
    missing_pdf: boolean;
    missing_business: boolean;
    checklist_unassessed: boolean;
    checklist_missing: boolean;
  };
};
export class InvoiceApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function invoiceRequest<T>(
  route: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
  expectedSessionScope?: string,
): Promise<T> {
  if (!isLocalBackend())
    throw new Error(
      "Workspace hóa đơn chỉ khả dụng trên backend local đã cập nhật.",
    );
  const guard = await captureLocalAuthGuard((await getLocalMe()).user_id);
  if(expectedSessionScope && invoiceSessionScope()!==expectedSessionScope)
    throw new Error("Phiên đăng nhập đã thay đổi; tải lại hồ sơ trước khi tiếp tục.");
  const response = await localFetch(
    localApiUrl() + "/api/invoice-workspace" + route,
    {
      method,
      signal,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    false,
    guard,
  );
  const payload = await response
    .json()
    .catch(() => ({ message: "Phản hồi không hợp lệ." }));
  guard.assertCurrent();
  if (!response.ok)
    throw new InvoiceApiError(
      payload.message || "Không thể xử lý hóa đơn.",
      response.status,
    );
  return payload;
}
export async function invoiceDownloadFile(id: string) {
  const guard = await captureLocalAuthGuard((await getLocalMe()).user_id);
  const response = await localFetch(
    localApiUrl() + "/api/invoice-workspace/files/" + encodeURIComponent(id),
    {},
    false,
    guard,
  );
  if (!response.ok) {
    const value = await response.json();
    throw new Error(value.message);
  }
  const blob = await response.blob();
  guard.assertCurrent();
  const name = decodeURIComponent(
    response.headers
      .get("content-disposition")
      ?.split("filename*=UTF-8''")[1] || "chung-tu",
  );
  invoiceDownloadBlob(blob, name);
}
export function invoiceDownloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function invoiceDownloadBase64(
  base64: string,
  name: string,
  type = "application/octet-stream",
) {
  const bytes = Uint8Array.from(atob(base64), (x) => x.charCodeAt(0));
  invoiceDownloadBlob(new Blob([bytes], { type }), name);
}
export async function invoiceFilePayload(files: File[]) {
  return Promise.all(
    files.map(
      (file) =>
        new Promise<{ name: string; data_base64: string }>(
          (resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () =>
              resolve({
                name: file.name,
                data_base64: String(reader.result).split(",")[1],
              });
            reader.onerror = reject;
            reader.readAsDataURL(file);
          },
        ),
    ),
  );
}

export const invoicePaymentLabels: Record<string, string> = {
  NONE: "Chưa phân bổ tiền",
  PARTIAL: "Đã phân bổ một phần",
  FULL: "Đã phân bổ đủ",
  NEEDS_RECONCILIATION: "Cần đối soát tiền",
};

export const invoiceSourceStateLabels: Record<string, string> = {
  draft: "Nháp theo nguồn",
  issued: "Đã phát hành theo nguồn",
  cancelled: "Đã hủy theo nguồn",
  replaced: "Đã bị thay thế theo nguồn",
  adjusted: "Hóa đơn điều chỉnh",
  unknown: "Trạng thái nguồn cần xác minh",
};
