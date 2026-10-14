import { useRef, useState } from 'react';

// The same failed request retains its UUID. A successful request retires that
// UUID, allowing two intentionally identical reports to be saved separately.
export function useDispatchMutation() {
  const attempts = useRef(new Map<string,string>());
  const inFlight = useRef(false);
  const [busy,setBusy] = useState(false);
  const execute = async <T,>(action: string, payload: Record<string,unknown>, request: (body: Record<string,unknown>) => Promise<T>): Promise<T> => {
    if (inFlight.current) throw new Error('Đang xử lý thao tác trước, vui lòng chờ.');
    const fingerprint = JSON.stringify([action,payload]);
    const key = attempts.current.get(fingerprint) || crypto.randomUUID();
    attempts.current.set(fingerprint,key);
    inFlight.current = true; setBusy(true);
    try {
      const result = await request({...payload,idempotency_key:key});
      attempts.current.delete(fingerprint);
      return result;
    } finally { inFlight.current = false; setBusy(false); }
  };
  return {execute,busy};
}
