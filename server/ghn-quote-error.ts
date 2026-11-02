/** Only an explicit carrier service rejection can remove a price candidate. */
export function ghnUnsupportedServiceResponse(response:Response,value:Record<string,unknown>):boolean {
  if(response.status>=500||[401,403,408,429].includes(response.status)||!Number.isSafeInteger(value.code)||Number(value.code)<400||Number(value.code)>=500||[401,403,408,429].includes(Number(value.code)))return false;
  const code=typeof value.code_message==='string'?value.code_message.toUpperCase():'';
  const message=typeof value.message==='string'?value.message.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase():'';
  if(/temporar|timeout|timed out|maintenance|tam thoi|bao tri|qua tai|het thoi gian|server unavailable|service unavailable/.test(message))return false;
  if(['SERVICE_NOT_SUPPORTED','SERVICE_NOT_AVAILABLE','ROUTE_NOT_SUPPORTED'].includes(code))return true;
  return /(?:dich vu|service).{0,80}(?:khong ho tro|khong kha dung|khong phuc vu|not supported|not available|does not support)|(?:khong ho tro|khong phuc vu|no available).{0,80}(?:dich vu|service)/.test(message);
}
export const ghnUnsupportedQuoteError=()=>Object.assign(new Error('GHN không hỗ trợ dịch vụ này cho kiện hàng hoặc địa chỉ đã nhập.'),{status:422,code:'GHN_SERVICE_UNSUPPORTED' as const});
export const publicGhnQuoteErrorCode=(error:unknown)=>error&&typeof error==='object'&&'code'in error&&error.code==='GHN_SERVICE_UNSUPPORTED'?{code:'GHN_SERVICE_UNSUPPORTED'}:{};
