/** Invalidate authorization after edits, and recheck when returning to the app. */
export const PERMISSION_CHANGED_EVENT = 'crm-permissions-changed';
export function notifyPermissionsChanged() {
  window.dispatchEvent(new Event(PERMISSION_CHANGED_EVENT));
  try { localStorage.setItem(PERMISSION_CHANGED_EVENT, String(Date.now())); } catch { /* storage unavailable */ }
}
export type PermissionRefreshReason = 'permissions-changed' | 'foreground';
export function listenPermissionRefresh(refresh: (reason: PermissionRefreshReason) => void) {
  let foregroundTimer: ReturnType<typeof setTimeout> | undefined;
  const foreground = () => {
    // Browsers commonly dispatch both focus and visibilitychange for one return.
    if (foregroundTimer !== undefined) return;
    foregroundTimer = setTimeout(() => { foregroundTimer = undefined; refresh('foreground'); }, 0);
  };
  const changed = () => {
    clearTimeout(foregroundTimer); foregroundTimer = undefined;
    refresh('permissions-changed');
  };
  const visible = () => { if (document.visibilityState === 'visible') foreground(); };
  const storage = (event: StorageEvent) => { if (event.key === PERMISSION_CHANGED_EVENT) changed(); };
  window.addEventListener(PERMISSION_CHANGED_EVENT, changed);
  window.addEventListener('focus', foreground);
  window.addEventListener('storage', storage);
  document.addEventListener('visibilitychange', visible);
  return () => {
    clearTimeout(foregroundTimer);
    window.removeEventListener(PERMISSION_CHANGED_EVENT, changed);
    window.removeEventListener('focus', foreground);
    window.removeEventListener('storage', storage);
    document.removeEventListener('visibilitychange', visible);
  };
}
