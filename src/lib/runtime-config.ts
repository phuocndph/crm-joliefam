/** Runtime switches for the local SQL-backed CRM build. */
export const isLocalBackend = () => import.meta.env.VITE_BACKEND_MODE === "local";
/** Demo chỉ hoạt động ở bản phát triển; không thể bật trong bản build production. */
export const isLocalDemoEnabled = () => isLocalBackend() && !import.meta.env.PROD && import.meta.env.VITE_LOCAL_DEMO_AUTH !== 'false';

export const localApiUrl = () => (
  import.meta.env.VITE_LOCAL_API_URL || (import.meta.env.PROD ? window.location.origin : "http://127.0.0.1:8787")
).replace(/\/$/, "");

export const localAdminUser = {
  id: "local-admin",
  email: "admin@local.crm",
  user_metadata: { first_name: "Quản trị viên", last_name: "cục bộ" },
} as const;
