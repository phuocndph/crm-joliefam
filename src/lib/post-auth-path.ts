import {getLocalMe,getLocalUserSession} from '@/lib/local-auth';
import {localApi} from '@/lib/local-api';

/** Pick a useful landing screen without granting any permission. Server checks remain authoritative. */
export async function getLocalPostAuthPath(fallback:string):Promise<string>{
  const me=await getLocalMe(true);
  if(['admin','manager'].includes(me.role||'')||!me.worker_id)return fallback;
  const permissions=await localApi.employeePermissions(me.user_id);
  const session=getLocalUserSession();
  if(session&&session.actor!==me.user_id)throw new Error('Tài khoản đã thay đổi. Vui lòng đăng nhập lại.');
  if(permissions.some(p=>p.permission_type==='dashboard'&&p.enabled))return fallback;
  return ['CUTTER','SEWER','SEWING','IRONING','QC','PACKER'].includes(String(me.worker_type||'').toUpperCase())?'/production-orders':'/my-attendance';
}
