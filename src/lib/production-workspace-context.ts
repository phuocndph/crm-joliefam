import {workspaceStages,stageNames,type WorkspaceRow,type WorkspaceStage} from './production-workspace-types';
export interface ProductionWorkspaceContext {section:'OVERVIEW'|'FLOW'|'MATERIAL'|'STOCK';batchId:string;itemId:string;stage?:WorkspaceStage;intent:'VIEW'|'ASSIGN'|'REVIEW'|'REPAIR'|'RECEIVE'|'SHIP'|'COMPLETE'|'RESUME'}
export function stageContext(row:WorkspaceRow,stage:WorkspaceStage):ProductionWorkspaceContext{return {section:'FLOW',stage,batchId:row.batch_id,itemId:row.item_id,intent:'VIEW'};}
export function workspaceShowsBoard(mode:string|undefined){return mode==='MANAGER'||mode==='OPERATIONS'||mode==='SALES';}
// Stage filters describe independent work, not the single next-action shortcut.
// Historical/terminal rows retain actual activity, never hypothetical capacity.
export function workspaceStageMembership(row:WorkspaceRow,stage:WorkspaceStage):boolean{
  if(row.workflow_generation!=='WORKFLOW_V3')return false;
  if([row.good[stage],row.reserved[stage],row.open?.[stage],row.pending_by_stage?.[stage],row.repair_by_stage?.[stage]].some(value=>Number(value||0)>0))return true;
  if(!['RELEASED','IN_PROGRESS','ON_HOLD'].includes(row.status))return false;
  const index=workspaceStages.indexOf(stage),capacity=index===0?Number(row.executable_quantity??row.planned_quantity):Number(row.good[workspaceStages[index-1]]||0);
  return capacity>Number(row.reserved[stage]||0)+Number(row.open?.[stage]||0);
}
export function nextWorkspaceAction(row:WorkspaceRow):{label:string;context:ProductionWorkspaceContext}{
  const base:ProductionWorkspaceContext={section:'FLOW',batchId:row.batch_id,itemId:row.item_id,intent:'VIEW'};
  const result=(label:string,patch:Partial<ProductionWorkspaceContext>={})=>({label,context:{...base,...patch}});
  if(row.workflow_generation!=='WORKFLOW_V3')return result('Lệnh lịch sử');
  if(row.status==='CANCELLED')return result('Đã hủy lệnh');
  if(row.status==='COMPLETED')return row.order_id&&Number(row.delivered)<Number(row.received)?result('Giao hàng',{section:'STOCK',intent:'SHIP'}):result('Đã hoàn thành',{section:'STOCK'});
  if(row.status==='DRAFT')return result('Chuẩn bị vải',{section:'MATERIAL'});
  if(row.status==='ON_HOLD')return result('Đang tạm dừng',{intent:'RESUME'});
  if(row.pending_reports)return result('Duyệt sản lượng',{intent:'REVIEW'});
  if(row.needs_repair)return result('Xử lý hàng sửa',{intent:'REPAIR'});
  if(Number(row.cancelled_uncut)>0&&Number(row.executable_quantity)===0)return result('Chốt phần đã hủy',{intent:'COMPLETE'});
  if(!row.material||row.material.status!=='APPROVED')return result('Duyệt dự toán vải',{section:'MATERIAL'});
  if(!row.material.no_material_required&&row.material.has_shortage)return result('Cấp vật tư',{section:'MATERIAL'});
  for(const [index,stage]of workspaceStages.entries()){const capacity=index===0?Number(row.executable_quantity??row.planned_quantity):Number(row.good[workspaceStages[index-1]]||0);if(capacity>Number(row.reserved[stage]||0)+Number(row.open?.[stage]||0))return result(stageNames[stage],{stage,intent:'ASSIGN'});}
  for(const stage of workspaceStages)if(Number(row.open?.[stage]||0)>0)return result(`Chờ nhận ${stageNames[stage].toLocaleLowerCase('vi-VN')}`,{stage});
  for(const stage of workspaceStages)if(Number(row.reserved[stage]||0)>Number(row.processed?.[stage]||0))return result(`Đang ${stageNames[stage].toLocaleLowerCase('vi-VN')}`,{stage});
  if(Number(row.received)<Number(row.good.COUNTING||0))return result('Nhập thành phẩm',{section:'STOCK',intent:'RECEIVE'});
  return result('Chốt sản xuất',{intent:'COMPLETE'});
}
