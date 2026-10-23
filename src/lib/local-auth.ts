import { isLocalBackend, isLocalDemoEnabled, localApiUrl } from "./runtime-config";

type LocalSession = {
  actor: string;
  token: string;
  expires_at: string;
  role?: string | null;
};

export type LocalMe = {
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: string | null;
  assigned_by: string | null;
  worker_id: string | null;
  employee_code: string | null;
  worker_name: string | null;
  worker_type?: string | null;
};

const USER_SESSION_KEY = "local_user_session";

let cachedSession: LocalSession | null = null;
let sessionRequest: Promise<LocalSession> | null = null;
let cachedUserSession: LocalSession | null = null;
let cachedMe: LocalMe | null = null;
let sessionGeneration = 0;

const readStoredUserSession = (): LocalSession | null => {
  try {
    const raw = localStorage.getItem(USER_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalSession;
    return sessionStillValid(parsed) ? parsed : null;
  } catch { return null; }
};
const writeStoredUserSession = (session: LocalSession | null) => {
  try {
    if (session) localStorage.setItem(USER_SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(USER_SESSION_KEY);
  } catch { /* private mode */ }
};

const sessionStillValid = (session: LocalSession | null) => {
  if (!session?.token || !session.expires_at) return false;
  const expiresAt = Date.parse(session.expires_at);
  return Number.isFinite(expiresAt) && expiresAt - Date.now() > 30_000;
};

// Phiên admin loopback (tài khoản dịch vụ khi UI chạy không đăng nhập).
const loadSession = async (): Promise<LocalSession> => {
  if (!isLocalDemoEnabled()) throw authenticationError();
  const generation = sessionGeneration;
  if (sessionStillValid(cachedSession)) return cachedSession as LocalSession;
  if (sessionRequest) return sessionRequest;

  sessionRequest = fetch(`${localApiUrl()}/api/local-auth/session`, {
    method: "GET",
    headers: { accept: "application/json" },
    cache: "no-store",
  }).then(async (response) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || typeof payload.token !== "string") {
      throw new Error(payload.message || `Không thể xác thực Local API (${response.status}).`);
    }
    const session = payload as LocalSession;
    if (generation !== sessionGeneration) throw authenticationError();
    cachedSession = session;
    return session;
  }).finally(() => {
    sessionRequest = null;
  });

  return sessionRequest;
};

export const getLocalSession = async () => loadSession();

export const clearLocalSession = () => {
  cachedSession = null;
};

/** Đăng nhập local bằng email + mật khẩu, lưu phiên per-user. */
export const loginLocal = async (email: string, password: string): Promise<LocalSession> => {
  const generation = ++sessionGeneration;
  const response = await fetch(`${localApiUrl()}/api/local-auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || typeof payload.token !== "string") {
    throw new Error(payload.message || "Đăng nhập thất bại.");
  }
  const session = payload as LocalSession;
  if (generation !== sessionGeneration) throw authenticationError();
  cachedUserSession = session;
  cachedMe = null;
  writeStoredUserSession(session);
  return session;
};

export const logoutLocal = async () => {
  const session = cachedUserSession || readStoredUserSession();
  ++sessionGeneration;
  cachedSession = null;
  cachedUserSession = null;
  cachedMe = null;
  writeStoredUserSession(null);
  try {
    if (session?.token) {
      await fetch(`${localApiUrl()}/api/local-auth/logout`, {
        method: "POST",
        headers: { authorization: `Bearer ${session.token}` },
      });
    }
  } catch { /* best-effort */ }
  // Also clear the in-memory loopback administrator session. This keeps every
  // caller (including the Supabase-compatible auth wrapper) from silently
  // reusing the demo account after logout.
};

export const getLocalUserSession = () => {
  if (sessionStillValid(cachedUserSession)) return cachedUserSession;
  cachedUserSession = null;
  cachedMe = null;
  return readStoredUserSession();
};
// Retain the distinction between absent and expired/corrupt user sessions.
// An invalid login must never opt the browser into the loopback admin account.
export const hasStoredLocalUserSession = () => {
  try { return cachedUserSession !== null || localStorage.getItem(USER_SESSION_KEY) !== null; }
  catch { return cachedUserSession !== null; }
};
/** True only for a currently valid per-user session. */
export const hasLocalUserSession = () => Boolean(getLocalUserSession());

const authenticationError = () => Object.assign(new Error("Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại."), { status: 401 });

/** Thông tin tài khoản đang đăng nhập + worker liên kết. */
export const getLocalMe = async (forceRefresh = false): Promise<LocalMe> => {
  const generation = sessionGeneration;
  const session = getLocalUserSession();
  if (hasStoredLocalUserSession() && !session) throw authenticationError();
  if (cachedMe && !forceRefresh) return cachedMe;
  const headers: Record<string, string> = { accept: "application/json" };
  headers.authorization = `Bearer ${session?.token || (await loadSession()).token}`;
  const response = await fetch(`${localApiUrl()}/api/local-auth/me`, { headers, cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (generation !== sessionGeneration || session?.token !== getLocalUserSession()?.token) throw authenticationError();
  if (!response.ok) {
    cachedMe = null;
    if (response.status === 401) throw authenticationError();
    throw new Error(payload.message || "Không lấy được thông tin tài khoản.");
  }
  cachedMe = payload as LocalMe;
  return cachedMe;
};

/** Token của caller hiện tại: ưu tiên phiên per-user, fallback phiên admin. */
const currentToken = async () => {
  const userSession = getLocalUserSession();
  if (userSession?.token) return userSession.token;
  if (hasStoredLocalUserSession()) throw authenticationError();
  return (await loadSession()).token;
};

/** In-memory, single-send authorization boundary; never serialized with drafts. */
export interface LocalAuthGuard {assertCurrent:()=>void;authorizationToken:()=>string}
export const captureLocalAuthGuard=async(expectedActor:string):Promise<LocalAuthGuard>=>{
  if(!isLocalBackend())throw authenticationError();
  const generation=sessionGeneration,storedIdentity=localStorage.getItem(USER_SESSION_KEY);
  const userSession=getLocalUserSession();
  if(hasStoredLocalUserSession()&&!userSession)throw authenticationError();
  const session=userSession||await loadSession(),userMode=!!userSession;
  const assertCurrent=()=>{
    if(!isLocalBackend()||generation!==sessionGeneration||localStorage.getItem(USER_SESSION_KEY)!==storedIdentity||session.actor!==expectedActor||!sessionStillValid(session))throw authenticationError();
    if(userMode){
      const current=getLocalUserSession(),stored=readStoredUserSession();
      if(!current||current.actor!==expectedActor||current.token!==session.token||!stored||stored.actor!==expectedActor||stored.token!==session.token)throw authenticationError();
    }else if(hasStoredLocalUserSession()||!cachedSession||cachedSession.actor!==expectedActor||cachedSession.token!==session.token)throw authenticationError();
  };
  assertCurrent();
  return {assertCurrent,authorizationToken:()=>{assertCurrent();return session.token;}};
};

/** Fetch local SQL endpoints với token caller hiện tại (user hoặc admin). */
export const localFetch = async (input: RequestInfo | URL, init: RequestInit = {}, allowRefresh = true,guard?:LocalAuthGuard): Promise<Response> => {
  if(guard){
    // No await/current-token lookup, demo fallback or refresh between this check and fetch.
    const token=guard.authorizationToken(),headers=new Headers(init.headers);
    headers.set('authorization',`Bearer ${token}`);guard.assertCurrent();
    const response=await fetch(input,{...init,headers});guard.assertCurrent();return response;
  }
  if (!isLocalBackend()) return fetch(input, init);

  const userRequest = hasStoredLocalUserSession();
  const token = await currentToken();
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);
  const response = await fetch(input, { ...init, headers });
  if (response.status === 401 && allowRefresh) {
    // A rejected user token remains a user login, never an admin retry.
    if (userRequest || hasStoredLocalUserSession()) { cachedUserSession = null; cachedMe = null; return response; }
    clearLocalSession();
    return localFetch(input, init, false);
  }
  return response;
};
