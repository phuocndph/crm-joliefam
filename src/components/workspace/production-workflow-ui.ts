import { workspaceStageMembership } from '@/lib/production-workspace-context';
import { workspaceStages, type WorkspaceRow, type WorkspaceStage } from '@/lib/production-workspace-types';

export const productionPipelineSteps = [
  { id: 'MATERIAL', label: 'Đơn mới / Chờ vải' },
  { id: 'CUTTING', label: 'Cắt vải' },
  { id: 'SEWING', label: 'Chờ may & Đang may' },
  { id: 'FINISHING', label: 'Gấp – là' },
  { id: 'COUNTING', label: 'Kiểm đếm' },
  { id: 'STOCK', label: 'Nhập kho & Giao hàng' },
] as const;

export type ProductionPipelineStep = (typeof productionPipelineSteps)[number]['id'];

const activeProduction = (row: WorkspaceRow) =>
  row.workflow_generation === 'WORKFLOW_V3' &&
  ['RELEASED', 'IN_PROGRESS', 'ON_HOLD'].includes(row.status) &&
  Number(row.executable_quantity ?? row.planned_quantity) > 0;

const materialPending = (row: WorkspaceRow) =>
  row.workflow_generation === 'WORKFLOW_V3' &&
  !['COMPLETED', 'CANCELLED'].includes(row.status) &&
  (row.status === 'DRAFT' ||
    !row.material ||
    row.material.status !== 'APPROVED' ||
    (!row.material.no_material_required && Boolean(row.material.has_shortage)));

const stockPending = (row: WorkspaceRow) => {
  if (row.workflow_generation !== 'WORKFLOW_V3' || row.status === 'CANCELLED') {
    return false;
  }

  const approvedCounting = Number(row.good.COUNTING || 0);
  const awaitingReceipt = Number(row.received) < approvedCounting;
  const awaitingDelivery = Boolean(row.order_id) && Number(row.delivered) < Number(row.received);
  return awaitingReceipt || awaitingDelivery;
};

/**
 * Pipeline chips intentionally represent overlapping current work. A partial
 * batch can be in cutting and sewing at once; they must never be derived from
 * the single "next action" shortcut.
 */
export function inProductionPipeline(row: WorkspaceRow, step: ProductionPipelineStep) {
  if (step === 'MATERIAL') return materialPending(row);
  if (step === 'STOCK') return stockPending(row);
  return activeProduction(row) && workspaceStageMembership(row, step as WorkspaceStage);
}

export function pipelineCounts(rows: WorkspaceRow[]) {
  return Object.fromEntries(
    productionPipelineSteps.map((step) => [
      step.id,
      rows.filter((row) => inProductionPipeline(row, step.id)).length,
    ]),
  ) as Record<ProductionPipelineStep, number>;
}

export function stageProgressLabel(row: WorkspaceRow, stage: WorkspaceStage) {
  const target = Number(row.executable_quantity ?? row.planned_quantity);
  const good = Number(row.good[stage] || 0);
  if (target > 0 && good >= target) return 'Hoàn tất công đoạn';

  const allocated = Number(row.reserved[stage] || 0);
  const processed = Number(row.processed?.[stage] || 0);
  if (allocated > 0 && processed >= allocated) return 'Xong phần đã nhận';
  if (allocated > processed || Number(row.open?.[stage] || 0) > 0) return 'Đang thực hiện';
  return 'Chờ xử lý';
}

export const allProductionStages = workspaceStages;
