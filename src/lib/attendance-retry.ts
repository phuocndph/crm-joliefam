export type OvertimeRetryPayload = { worker_id:string; work_date:string; overtime_type:string; overtime_minutes:number; reason:string };
export function overtimeRetryFingerprint(payload: OvertimeRetryPayload) {
  return JSON.stringify([payload.worker_id,payload.work_date,payload.overtime_type,Number(payload.overtime_minutes),payload.reason.trim()]);
}
export function overtimeRetryKey(keys: Map<string,string>, payload: OvertimeRetryPayload, createKey:()=>string) {
  const fingerprint = overtimeRetryFingerprint(payload);
  let key = keys.get(fingerprint);
  if (!key) { key=createKey();keys.set(fingerprint,key); }
  return {fingerprint,key};
}
