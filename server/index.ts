import { GhnEditing, registerGhnEditing } from './ghn-edit.js';
import {hydrateOrderFinancials,orderFinancialProjection,orderFinancialCtes,customerListCreditDerivedSql,type OrderFinancialSchema} from './order-financial.js';
import { registerInvoiceWorkspace } from './invoice-workspace.js';
import { registerProductSupplyClassifications } from './product-fulfillment-classification.js';
import { registerProductTechnicalProfiles } from './product-technical-profiles.js';
import { registerProductLaborMappings } from './product-labor-mappings.js';
import { registerProductLaborRequirements } from './product-labor-requirements.js';
import { normalizeQuoteFilters, quoteFilterSql } from './quote-filters.js';
import { workerMasterPatch, validateWorkerMaster, requireWorkerMasterReason } from "./payroll-worker-master.js";
import { preservePayrollApprovalHistory } from "./payroll-approval-history.js";
import { readPayrollReconciliation } from "./payroll-reconciliation.js";
import { registerPayrollBundleApproval, lockPayrollWorkerConfiguration } from "./payroll-bundle-approval.js";
import { registerPayrollRules, payrollV3Checks, payrollSourceContext, payrollLocation, resolvePayrollCalendar, resolvePayrollRule, payrollV3OvertimeRate } from "./payroll-rules.js";
import { capturePayrollSourceFingerprint } from "./payroll-snapshot.js";
import { registerPayrollMonthly } from './payroll-monthly.js';
import { ExternalReadAdapters } from "./external-read-adapters.js";
import { GhnOrders, registerGhnOrders } from './ghn-orders.js';
import { GhnTrackingManagement, ghnPrincipal, ghnVisibleSql, registerGhnTracking, registerGhnTrackingManagement, requireGhnTrackingVisible } from "./ghn-tracking.js";
import { rewriteStorageUrls } from "./storage-urls.js";
import {snapshotProductionImages} from './production-reference-images.js';
import {assertWholeCancellationUnstarted,executableEstimateOutput} from './production-uncut-cancellations.js';
import express from "express";
import cors from "cors";
import { spawn } from "node:child_process";
import {
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { promises as fs } from "node:fs";
import dns from "node:dns/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PoolClient } from "pg";
import { resolveQuoteCustomer, quoteCustomerCandidate, quoteCustomerConflictDetails, quoteCustomerNameKey, quoteCustomerPhoneKey } from "./quote-customer.js";
import { registerContractRoutes } from './contract-routes.js';
import { contractPrincipal, canInvoice } from './contract-policy.js';
import { canonicalQuote, quoteObject } from './quote-calculation.js';
import { quoteOwnerScope, requireQuoteScope, assertQuoteStatus, publicQuoteData, approvalFinancialSnapshot, stableQuoteFingerprint } from './quote-policy.js';
import { bootstrapDatabase, pool } from "./db/bootstrap.js";
import { runtime } from './runtime.js';
import { moduleRequirement } from './module-permissions.js';
import { payrollPermissions, payrollCapability, delegablePayrollPermissions, validatePermissionChanges } from './permission-policy.js';
import { authorizePayrollRequest } from './payroll-access.js';
import { businessDateKey } from './business-date.js';
import { resolveIntegrationInternalCaller,isIntegrationServiceIdentity } from './integration-internal-principal.js';
import { registerIntegrationAccess } from './integration-access.js';
import { registerZcrmCommerce } from './zcrm-commerce.js';
import { LocalAiProvider, registerAiProviders } from './ai-provider.js';
import { ExternalIntegrationSettings, registerExternalIntegrationSettings } from './external-integration-settings.js';
import { GoongIntegrationSettings, registerGoongIntegrationSettings } from './goong-integration-settings.js';
import { LocalAiWorkflows } from './ai-workflows.js';
import { registerProductionDispatch, assertProductionDispatchSettled } from "./production-dispatch.js";
import {registerProductRateQuote} from "./product-rate-quote.js";
import {registerProductRateAuthoring,assertProductRateAuthoringAuthority} from "./product-rate-authoring.js";
import {codeKey} from "./product-labor-resolver.js";
import {loadEffectiveApprovedProductRates,lockProductRateConfigShared,listRuntimePieceRates,selectRuntimePieceRate} from './product-rate-consumption.js';
import {snapshotProductionSewingSelection} from './production-sewing-selection.js';
import {appendPlannedExtras} from './production-planned-extras.js';
import {rateFields,rateRangesOverlap,rateNameKey,assertRateInsertAllowed,type RateFields,type RateSource} from "./product-rate-inputs.mjs";
import { registerProductionWorkspace } from "./production-workspace.js";
import {
  assertLegacyFabricVariantsWritable,
  calculateBomMaterialLine,
  createInitialDraftCuttingPlan,
  cuttingGrid,
  cuttingRequirementForOutput,
  registerProductionSalesWorkflow,
} from "./production-sales-workflow.js";
import { registerPurchaseFulfillment } from './purchase-fulfillment.js';
import {assertPaidCurtainRepair} from './dispatch-labor.js';
import {laborCodeUsagePolicy} from './product-labor-usage-policy.js';
import {registerOrderShipments} from './order-shipments.js';

const app = express();
const allowedLocalOrigins = runtime.allowedOrigins;
const orderFinancialSchema:OrderFinancialSchema = runtime.startupMode === 'normal'
  ? 'full-ledgers'
  : 'verified-item5a-receipts-only';
const customerOrderTenantPredicate = runtime.zcrmEnabled
  ? "(o.tenant_id is not distinct from $3 or ($3::text is null and o.intake_source='ZCRM' and exists(select 1 from zcrm.customer_grants g join zcrm.connections z on z.id=g.connection_id where g.customer_id=o.customer_id and z.id=o.intake_connection_id and z.tenant_id=o.tenant_id)))"
  : "o.tenant_id is not distinct from $3";
const isAllowedLocalOrigin = (origin: string | undefined) =>
  !origin || allowedLocalOrigins.has(origin);
app.use((req, res, next) => {
  const origin = req.get("origin");
  if (!isAllowedLocalOrigin(origin)) {
    res
      .status(403)
      .json({ message: "Origin không được phép truy cập Local API." });
    return;
  }
  next();
});
app.use((req, res, next) => {
  if (/^Bearer\s+jf_agent_/i.test(req.get('authorization') || '') && !/^\/api\/(?:integrations|mcp)(?:\/|$)/i.test(req.path)) {
    return res.status(401).json({ message: 'Khóa Agent chỉ dùng cho API tích hợp và MCP.' });
  }
  next();
});
app.use((req,res,next)=>{
  if (/^Bearer\s+jf_zcrm_/i.test(req.get('authorization') || '') && !/^\/api\/zcrm\/v1(?:\/|$)/i.test(req.path)) return res.status(401).json({message:'Khóa ZCRM chỉ dùng cho API dịch vụ ZCRM.'});
  next();
});
app.use(
  cors({
    origin(origin, callback) {
      callback(null, isAllowedLocalOrigin(origin));
    },
  }),
);
const browserJsonParser = express.json({ limit: '25mb' });
const agentJsonParser = express.json({ limit: '32kb' });
const zcrmJsonParser = express.json({ limit: '2mb' });
app.use((req, res, next) => {
  if (/^\/api\/zcrm(?:\/|$)/i.test(req.path)) return zcrmJsonParser(req,res,next);
  const machine = /^\/api\/(?:mcp|integrations)(?:\/|$)/i.test(req.path);
  (machine ? agentJsonParser : browserJsonParser)(req, res, next);
});
app.use((error: { status?: number }, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (/^\/api\/zcrm(?:\/|$)/i.test(req.path)) return res.status(error.status===413?413:400).json({message:error.status===413?'Yêu cầu ZCRM vượt 2 MB.':'Nội dung JSON không hợp lệ.',code:'INVALID_JSON'});
  if (/^\/api\/(?:mcp|integrations)(?:\/|$)/i.test(req.path)) {
    return res.status(error.status === 413 ? 413 : 400).json({ message: error.status === 413 ? 'Yêu cầu Agent vượt 32 KB.' : 'Nội dung JSON không hợp lệ.' });
  }
  next(error);
});

type LocalAuthenticatedRequest = express.Request & {
  localActor?: string;
  localRole?: string;
};
const localRequestContext = new AsyncLocalStorage<{
  actor: string;
  role?: string;
}>();
const currentLocalActor = () =>
  localRequestContext.getStore()?.actor || (runtime.demoEnabled ? "local-admin" : "");
const currentLocalRole = () => localRequestContext.getStore()?.role || (runtime.demoEnabled ? "admin" : "");
const localSessionTtlMs = 8 * 60 * 60 * 1000;
let localSession = {
  token: randomBytes(32).toString("base64url"),
  expiresAt: Date.now() + localSessionTtlMs,
};
const rotateLocalSessionIfExpired = () => {
  if (Date.now() >= localSession.expiresAt) {
    localSession = {
      token: randomBytes(32).toString("base64url"),
      expiresAt: Date.now() + localSessionTtlMs,
    };
  }
  return localSession;
};
const hashSessionToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
// Local authentication never contacts Supabase, even if a legacy bridge flag is set.
// Tra cứu phiên đăng nhập per-user. Chỉ tin tưởng token hash trong DB, không bao giờ
// tin user_id gửi từ trình duyệt. Trả về null khi token hết hạn/không tồn tại.
const findUserSession = async (token: string) => {
  if (!token) return null;
  const { rows } = await pool.query(
    `
    update local_auth_sessions s
    set last_seen_at = now()
    from local_user_profiles p
    where s.token_hash = $1
      and s.expires_at > now()
      and p.user_id = s.user_id
      and p.is_active
    returning s.user_id`,
    [hashSessionToken(token)],
  );
  return rows[0] && !await isIntegrationServiceIdentity(pool,String(rows[0].user_id)) ? String(rows[0].user_id) : null;
};
const isLoopbackRequest = (req: express.Request) => {
  const address = req.socket.remoteAddress || "";
  return (
    address === "127.0.0.1" ||
    address === "::1" ||
    address === "::ffff:127.0.0.1"
  );
};
const bearerToken = (authorization: string | undefined) =>
  authorization?.match(/^Bearer\s+(.+)$/i)?.[1] || "";
const bearerMatchesLocalSession = (authorization: string | undefined) => {
  if (!runtime.demoEnabled) return false;
  const supplied = bearerToken(authorization);
  const current = rotateLocalSessionIfExpired();
  const expectedBuffer = Buffer.from(current.token);
  const suppliedBuffer = Buffer.from(supplied);
  return (
    expectedBuffer.length === suppliedBuffer.length &&
    timingSafeEqual(expectedBuffer, suppliedBuffer)
  );
};
// Resolve danh tính caller: ưu tiên phiên per-user trong DB, fallback phiên admin loopback.
const resolveLocalCaller = async (req: express.Request) => {
  const internal=resolveIntegrationInternalCaller(req);
  if(internal){
    const authorized=await pool.query(`select 1 from integration_access.connections c
      join integration_access.keys k on k.connection_id=c.id
      join integration_access.grants g on g.connection_id=c.id and g.capability=$5 and g.all_resources
      join integration_access.service_identities s on s.connection_id=c.id
      join local_user_profiles p on p.user_id=s.user_id and p.is_active
      where c.id=$1 and c.active and k.id=$2 and k.token_hash=$3 and k.revoked_at is null
      and k.expires_at>now() and $5=any(k.capabilities) and s.user_id=$4`,[internal.connectionId,internal.keyId,internal.tokenHash,internal.userId,internal.capability]);
    return authorized.rows[0]?{kind:'user' as const,userId:internal.userId}:null;
  }
  const token = bearerToken(req.get("authorization"));
  const userId = await findUserSession(token);
  if (userId) return { kind: "user" as const, userId };
  if (bearerMatchesLocalSession(req.get("authorization")))
    return { kind: "admin" as const, userId: "local-admin" };
  return null;
};
const upsertLocalProjectionTombstone = async (
  client: PoolClient,
  sourceTable: string,
  sourceKey: string,
) => {
  await client.query(
    `insert into local_projection_tombstones(source_table,source_key,tombstone_kind)
     values($1,$2,'LOCAL')
     on conflict (source_table,source_key) do update set tombstone_kind='LOCAL',updated_at=now()`,
    [sourceTable, sourceKey],
  );
};
const protectedLocalRequest = (req: express.Request) => {
  const path = req.path.toLowerCase().replace(/\/+$/, "") || "/";
  const mutation = !["GET", "HEAD", "OPTIONS"].includes(req.method);
  if (path.startsWith("/api/local-auth/")) return null;
  if (path === "/api/payroll/capabilities") return "authenticated" as const;
  if (/^\/api\/users\/[^/]+\/password$/.test(path)) return "password" as const;
  if (path === "/api/local-sync/start") return "identity" as const;
  if (
    path.startsWith("/api/payroll/") ||
    path === "/api/rates" ||
    path === "/api/worker-methods" ||
    path === "/api/workers"
  )
    return "payroll" as const;
  if (
    path === "/api/production-attendance/assignments" ||
    path.startsWith("/api/production-attendance/assignments/")
  )
    return "payroll" as const;
  if (path.startsWith("/api/my-attendance"))
    return mutation ? ("source" as const) : ("authenticated" as const);
  if (req.method === "GET" && /^\/api\/users\/[^/]+\/permissions$/.test(path))
    return "identity-read" as const;
  // Tài khoản, phân quyền và liên kết hồ sơ nhân sự đều là dữ liệu quản trị.
  // Không để các route này chạy ẩn danh chỉ vì chúng không thuộc payroll.
  if (path.startsWith("/api/users")) return "identity" as const;
  if (path.startsWith("/api/local-rpc/")) return "authenticated" as const;
  if (path.startsWith("/api/local-functions/")) return "authenticated" as const;
  if (
    !mutation &&
    (path.startsWith("/api/attendance") ||
      path.startsWith("/api/production/entries") ||
      path.startsWith("/api/production-attendance"))
  )
    return "source" as const;
  if (!path.startsWith("/api/")) return null;
  if (!mutation) {
    // Public product/logo objects are intentionally addressable by <img>
    // without a bearer header. All database reads, snapshots and private
    // local-storage objects still require an authenticated local session.
    if (/^\/api\/local-storage\/(?:product-images|logos)\/object$/.test(path))
      return null;
    return "authenticated" as const;
  }
  if (/^\/api\/production-stage-events\/[^/]+\/(status|reverse)$/.test(path))
    return "payroll" as const;
  if (
    path.startsWith("/api/payroll/") ||
    path === "/api/workers" ||
    path === "/api/worker-methods" ||
    path === "/api/rates"
  )
    return "payroll" as const;
  const sourceReview =
    path === "/api/attendance/bulk-workflow" ||
    path === "/api/attendance/bulk-preview" ||
    path === "/api/attendance/approve-close" ||
    path === "/api/attendance/status" ||
    path === "/api/attendance/day-status" ||
    path === "/api/attendance/closures" ||
    path === "/api/attendance/overtime/status" ||
    path === "/api/production/entries/status" ||
    /^\/api\/production\/entries\/[^/]+\/reverse$/.test(path) ||
    path === "/api/production-attendance/assignment-enforcement" ||
    /^\/api\/production-attendance\/[^/]+\/reverse$/.test(path) ||
    /^\/api\/attendance\/[^/]+\/reverse$/.test(path);
  if (sourceReview) return "source-review" as const;
  if (
    path.startsWith("/api/attendance") ||
    path.startsWith("/api/production/entries") ||
    path.startsWith("/api/production-attendance") ||
    path === "/api/production-stage-events"
  )
    return "source" as const;
  // Every remaining local API mutation is authenticated. This prevents a
  // direct browser request from bypassing the UI's role-aware workflows.
  if (path.startsWith("/api/")) return "authenticated" as const;
  return null;
};

const isPrivateOrReservedAddress = (address: string) => {
  const normalized = address.replace(/^::ffff:/i, "").toLowerCase();
  if (normalized === "::1" || normalized === "0.0.0.0" || normalized === "::")
    return true;
  if (net.isIPv4(normalized)) {
    const octets = normalized.split(".").map(Number);
    const [first, second] = octets;
    return (
      first === 10 ||
      first === 127 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      first >= 224
    );
  }
  if (net.isIPv6(normalized)) {
    return (
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb")
    );
  }
  return true;
};

const safeScrapeUrl = async (rawUrl: string) => {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("URL không hợp lệ.");
  }
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password
  ) {
    throw new Error("Chỉ hỗ trợ URL http/https công khai.");
  }
  if (parsed.port && !["80", "443"].includes(parsed.port))
    throw new Error("Cổng URL không được phép.");
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  ) {
    throw new Error("Không được truy cập máy chủ nội bộ.");
  }
  const addresses = net.isIP(hostname)
    ? [hostname]
    : (await dns.lookup(hostname, { all: true })).map((entry) => entry.address);
  if (!addresses.length || addresses.some(isPrivateOrReservedAddress))
    throw new Error("URL trỏ tới địa chỉ mạng nội bộ hoặc bị hạn chế.");
  return parsed.toString();
};
const localActor = (req: express.Request) => {
  const actor = (req as LocalAuthenticatedRequest).localActor;
  if (!actor)
    throw Object.assign(new Error("Phiên local chưa được xác thực."), {
      status: 401,
    });
  return actor;
};

app.get("/api/local-auth/session", async (req, res) => {
  try {
    if (!runtime.demoEnabled || !isLoopbackRequest(req) || !isAllowedLocalOrigin(req.get("origin"))) {
      return res
        .status(403)
        .json({ message: "Chỉ máy local được cấp phiên đăng nhập." });
    }
    const actor = await pool.query(`
      select p.user_id,r.role
      from local_user_profiles p join local_user_roles r on r.user_id=p.user_id
      where p.user_id='local-admin' and p.is_active and r.is_active and r.role='admin'
      limit 1`);
    if (!actor.rows[0])
      return res
        .status(403)
        .json({ message: "Tài khoản quản trị local không hoạt động." });
    const session = rotateLocalSessionIfExpired();
    res.setHeader("cache-control", "no-store");
    return res.json({
      actor: "local-admin",
      token: session.token,
      expires_at: new Date(session.expiresAt).toISOString(),
    });
  } catch (error) {
    sendError(res, error);
  }
});

// Đăng nhập chỉ bằng mật khẩu local; giữ nguyên UUID của hồ sơ đã đồng bộ. Cấp phiên per-user lưu trong
// local_auth_sessions (chỉ lưu hash). Giới hạn loopback để giảm rủi ro.
app.post("/api/local-auth/login", async (req, res) => {
  let client: PoolClient | undefined;
  let transactionOpen = false;
  try {
    if ((!runtime.production && !isLoopbackRequest(req)) || !isAllowedLocalOrigin(req.get("origin"))) {
      return res.status(403).json({ message: "Chỉ máy local được đăng nhập." });
    }
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();
    const password = String(req.body?.password || "");
    if (!email || !password)
      return res
        .status(400)
        .json({ message: "Email và mật khẩu là bắt buộc." });
    const { rows } = await pool.query(
      `
      select p.user_id, p.password_hash, p.is_snapshot_record, p.source_snapshot_key,
        (select r.role from local_user_roles r where r.user_id=p.user_id and r.is_active
         order by case r.role when 'admin' then 1 when 'manager' then 2 when 'accountant' then 3 when 'team_leader' then 4 else 5 end
         limit 1) role
      from local_user_profiles p
      where lower(p.email)=lower($1) and p.is_active
      limit 1`,
      [email],
    );
    const account = rows[0];
    const localPasswordValid = Boolean(account && verifyLocalPassword(password, account.password_hash));
    if (!account || !localPasswordValid || await isIntegrationServiceIdentity(pool,String(account.user_id))) {
      return res
        .status(401)
        .json({
          message:
            "Email hoặc mật khẩu local không đúng, hoặc tài khoản chưa được thiết lập mật khẩu local.",
        });
    }
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + localSessionTtlMs);
    client = await pool.connect();
    await client.query('begin');
    transactionOpen = true;
    // A profile lock serializes issuance with password resets/initialization.
    // Re-read in a NEW statement after any lock wait, never insert from a stale snapshot.
    await client.query('select user_id from local_user_profiles where user_id=$1 for share', [account.user_id]);
    const fresh = (await client.query(
      `select p.email,p.is_active,p.password_hash,p.is_snapshot_record,p.source_snapshot_key,
        (select r.role from local_user_roles r where r.user_id=p.user_id and r.is_active
         order by case r.role when 'admin' then 1 when 'manager' then 2 when 'accountant' then 3 when 'team_leader' then 4 else 5 end limit 1) role
       from local_user_profiles p where p.user_id=$1`, [account.user_id],
    )).rows[0];
    if (!fresh?.is_active || String(fresh.email).toLowerCase() !== email || fresh.password_hash !== account.password_hash ||
        Boolean(fresh.is_snapshot_record || fresh.source_snapshot_key) !== Boolean(account.is_snapshot_record || account.source_snapshot_key)) {
      throw Object.assign(new Error('Tài khoản đã thay đổi hoặc bị khóa. Vui lòng đăng nhập lại.'), { status: 401 });
    }
    await client.query(
      'insert into local_auth_sessions(user_id,token_hash,expires_at) values($1,$2,$3)',
      [account.user_id, hashSessionToken(token), expiresAt],
    );
    await client.query('commit');
    transactionOpen = false;
    await pool
      .query(
        "delete from local_auth_sessions where user_id=$1 and expires_at<=now()",
        [account.user_id],
      )
      .catch(() => undefined);
    res.setHeader("cache-control", "no-store");
    return res.json({
      actor: account.user_id,
      role: fresh.role || null,
      token,
      expires_at: expiresAt.toISOString(),
    });
  } catch (error) {
    if (transactionOpen && client) await client.query('rollback').catch(()=>undefined);
    sendError(res, error);
  } finally { client?.release(); }
});

app.post("/api/local-auth/logout", async (req, res) => {
  try {
    const token = bearerToken(req.get("authorization"));
    if (token)
      await pool.query("delete from local_auth_sessions where token_hash=$1", [
        hashSessionToken(token),
      ]);
    return res.json({ ok: true });
  } catch (error) {
    sendError(res, error);
  }
});

// Thông tin tài khoản đang đăng nhập + worker được liên kết (nếu có).
app.get("/api/local-auth/me", async (req, res) => {
  try {
    const caller = await resolveLocalCaller(req);
    if (!caller)
      return res
        .status(401)
        .json({ message: "Thiếu hoặc sai phiên xác thực local." });
    const { rows } = await pool.query(
      `
      select p.user_id, p.email, p.first_name, p.last_name,
        primary_role.role, primary_role.assigned_by,
        w.id worker_id, w.employee_code, w.display_name worker_name, w.worker_type
      from local_user_profiles p
      left join lateral (
        select r.role,nullif(btrim(r.assigned_by),'') assigned_by
        from local_user_roles r where r.user_id=p.user_id and r.is_active
        order by case r.role when 'admin' then 1 when 'manager' then 2 when 'accountant' then 3 when 'team_leader' then 4 else 5 end limit 1
      ) primary_role on true
      left join local_workers w on w.user_id = p.user_id and w.is_active
      where p.user_id = $1 and p.is_active
      limit 1`,
      [caller.userId],
    );
    if (!rows[0])
      return res
        .status(401)
        .json({ message: "Tài khoản local không còn hoạt động." });
    res.setHeader("cache-control", "no-store");
    return res.json(rows[0]);
  } catch (error) {
    sendError(res, error);
  }
});

if (runtime.startupMode === 'normal') {
  registerIntegrationAccess(app, pool, resolveLocalCaller);
  registerZcrmCommerce({app,pool,resolveCaller:resolveLocalCaller});
}

app.use(async (req, res, next) => {
  const scope = protectedLocalRequest(req);
  if (!scope) return next();
  try {
    const caller = await resolveLocalCaller(req);
    if (!caller) {
      return res
        .status(401)
        .json({ message: "Thiếu hoặc sai phiên xác thực local." });
    }
    const { rows } = await pool.query(
      `
      select p.user_id,r.role
      from local_user_profiles p join local_user_roles r on r.user_id=p.user_id
      where p.user_id=$1 and p.is_active and r.is_active
      order by case r.role when 'admin' then 1 when 'manager' then 2 when 'accountant' then 3 when 'team_leader' then 4 else 5 end
      limit 1`,
      [caller.userId],
    );
    const role = String(rows[0]?.role || "");
    const required = moduleRequirement(req.method, req.path, req.body);
    if (required === false) return res.status(403).json({ message: 'Dữ liệu nghiệp vụ phải được thay đổi qua API chính thức, không qua bảng tương thích.' });
    if (required !== null && !['admin', 'manager'].includes(role)) {
      const granted = required.length ? await pool.query(
        'select 1 from local_employee_permissions where user_id=$1 and enabled and permission_type=any($2::text[]) limit 1',
        [caller.userId, [...required]],
      ) : { rows: [] };
      if (!granted.rows[0]) return res.status(403).json({ message: 'Tài khoản chưa được cấp quyền cho chức năng này.' });
    }
    if (!rows[0])
      return res
        .status(401)
        .json({ message: "Tài khoản local không còn hoạt động." });
    const allowed =
      scope === "authenticated" ||
      scope === "identity-read" ||
      (scope === "identity" && ["admin", "manager"].includes(role)) ||
      (scope === "source" &&
        ["admin", "manager", "accountant", "employee", "team_leader"].includes(
          role,
        )) ||
      (scope === "source-review" &&
        ["admin", "manager", "accountant", "team_leader"].includes(role)) ||
      (scope === "payroll" &&
        (["admin", "manager", "accountant"].includes(role) ||
          (["employee", "team_leader"].includes(role) && /^\/api\/(?:payroll(?:\/|$)|workers(?:\/|$)|rates(?:\/|$)|worker-methods(?:\/|$))/.test(req.path.toLowerCase())))) ||
      (scope === "password" &&
        ["admin", "manager", "accountant", "employee", "team_leader"].includes(
          role,
        ));
    if (!allowed)
      return res
        .status(403)
        .json({ message: "Tài khoản không có quyền thực hiện thao tác này." });
    (req as LocalAuthenticatedRequest).localActor = String(rows[0].user_id);
    (req as LocalAuthenticatedRequest).localRole = role;
    const payrollGrants = await pool.query('select permission_type from local_employee_permissions where user_id=$1 and enabled', [caller.userId]);
    await authorizePayrollRequest(req, res, pool, String(rows[0].user_id), role, new Set(payrollGrants.rows.map(row => String(row.permission_type))));
    return localRequestContext.run(
      { actor: String(rows[0].user_id), role },
      next,
    );
  } catch (error) {
    sendError(res, error);
  }
});

const selfProfileFields = [
  "first_name", "last_name", "phone", "date_of_birth", "gender", "nationality",
  "identity_number", "identity_issued_date", "identity_issued_place",
  "permanent_address", "current_address", "emergency_contact_name",
  "emergency_contact_relationship", "emergency_contact_phone", "tax_code",
  "social_insurance_number", "bank_account_name", "bank_name",
  "bank_account_number", "bank_code", "notes",
] as const;
type SelfProfileField = (typeof selfProfileFields)[number];

const normalizeSelfProfile = (input: unknown) => {
  const source = input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  const output: Record<string, string | null> = {};
  for (const field of selfProfileFields) {
    if (!(field in source)) continue;
    const value = source[field];
    if (value === null || value === undefined || String(value).trim() === "") {
      output[field] = null;
      continue;
    }
    const text = String(value).trim();
    if (text.length > 500) throw new Error(`Thông tin ${field} không được dài quá 500 ký tự.`);
    output[field] = text;
  }
  return output;
};

const localProfileView = async (userId: string) => {
  const result = await pool.query(
    `select p.user_id,p.email,p.first_name,p.last_name,p.phone,p.is_active,
       f.id form_id,coalesce(f.profile_data,'{}'::jsonb) profile_data,
       coalesce(f.status,'DRAFT') profile_status,f.submitted_at,f.reviewed_at,
       f.review_note,w.id worker_id,w.employee_code,w.display_name worker_name,
       w.worker_type,w.position_title,w.location_code,w.employment_type,
       w.employment_start_date,w.payroll_status
     from local_user_profiles p
     left join local_employee_profile_forms f on f.user_id=p.user_id
     left join local_workers w on w.user_id=p.user_id and w.is_active
     where p.user_id=$1 and p.is_active limit 1`,
    [userId],
  );
  const row = result.rows[0];
  if (!row) return null;
  const profileData = {
    first_name: row.first_name,
    last_name: row.last_name,
    phone: row.phone,
    ...(row.profile_data && typeof row.profile_data === "object" ? row.profile_data : {}),
  } as Record<SelfProfileField, string | null>;
  return {
    user_id: row.user_id,
    email: row.email,
    profile: profileData,
    status: row.profile_status,
    submitted_at: row.submitted_at,
    reviewed_at: row.reviewed_at,
    review_note: row.review_note,
    linked_worker: row.worker_id ? {
      id: row.worker_id, employee_code: row.employee_code, display_name: row.worker_name,
      worker_type: row.worker_type, position_title: row.position_title,
      location_code: row.location_code, employment_type: row.employment_type,
      employment_start_date: row.employment_start_date, payroll_status: row.payroll_status,
    } : null,
  };
};

app.get("/api/my-profile", async (req, res) => {
  try {
    const actor = localActor(req);
    const view = await localProfileView(actor);
    if (!view) return res.status(404).json({ message: "Không tìm thấy hồ sơ tài khoản." });
    res.setHeader("cache-control", "no-store");
    res.json(view);
  } catch (error) { sendError(res, error); }
});

app.patch("/api/my-profile", async (req, res) => {
  const client = await pool.connect();
  try {
    const actor = localActor(req);
    const patch = normalizeSelfProfile(req.body?.profile ?? req.body);
    if (!Object.keys(patch).length) throw new Error("Chưa có thông tin nào để lưu.");
    await client.query("begin");
    const existing = await client.query("select profile_data from local_employee_profile_forms where user_id=$1 for update", [actor]);
    const before = existing.rows[0]?.profile_data ?? {};
    const next = { ...(before && typeof before === "object" ? before : {}), ...patch };
    await client.query(
      `insert into local_employee_profile_forms(user_id,profile_data,status,submitted_at,reviewed_at,reviewed_by,review_note)
       values($1,$2,'DRAFT',null,null,null,null)
       on conflict(user_id) do update set profile_data=excluded.profile_data,status='DRAFT',submitted_at=null,reviewed_at=null,reviewed_by=null,review_note=null,revision=local_employee_profile_forms.revision+1,updated_at=now()`,
      [actor, JSON.stringify(next)],
    );
    await client.query(
      `insert into local_employee_profile_audit_events(user_id,action,actor_id,reason,before_data,after_data)
       values($1,'SAVE_DRAFT',$1,'Nhân viên tự cập nhật hồ sơ',$2::jsonb,$3::jsonb)`,
      [actor, JSON.stringify(before), JSON.stringify(next)],
    );
    await client.query(
      `insert into local_employee_profile_history(form_id,user_id,revision,action,snapshot_kind,profile_data,actor_id,reason)
       select id,user_id,revision,'SAVE_DRAFT','DRAFT',profile_data,$1,'Nhân viên tự cập nhật hồ sơ'
       from local_employee_profile_forms where user_id=$1`, [actor],
    );
    await client.query("commit");
    res.json(await localProfileView(actor));
  } catch (error) { await client.query("rollback").catch(() => undefined); sendError(res, error); }
  finally { client.release(); }
});

app.post("/api/my-profile/submit", async (req, res) => {
  const client = await pool.connect();
  try {
    const actor = localActor(req);
    await client.query("begin");
    const current = await client.query("select profile_data from local_employee_profile_forms where user_id=$1 for update", [actor]);
    const stored = current.rows[0]?.profile_data ?? {};
    // Accept the values currently visible in the form so a user does not lose
    // edits made immediately before pressing "Gửi xác nhận".
    const submittedPatch = normalizeSelfProfile(req.body?.profile ?? req.body);
    const data = { ...(stored && typeof stored === "object" ? stored : {}), ...submittedPatch };
    const required = ["first_name", "last_name", "phone"];
    const missing = required.filter((field) => !String(data[field] ?? "").trim());
    if (missing.length) throw new Error("Vui lòng bổ sung họ, tên và số điện thoại trước khi gửi xác nhận.");
    await client.query(
      `insert into local_employee_profile_forms(user_id,profile_data,status,submitted_at)
       values($1,$2,'SUBMITTED',now())
       on conflict(user_id) do update set profile_data=excluded.profile_data,status='SUBMITTED',submitted_at=now(),reviewed_at=null,reviewed_by=null,review_note=null,revision=local_employee_profile_forms.revision+1,updated_at=now()`,
      [actor, JSON.stringify(data)],
    );
    await client.query(
      `insert into local_employee_profile_audit_events(user_id,action,actor_id,reason,after_data)
       values($1,'SUBMIT',$1,'Nhân viên gửi hồ sơ chờ xác nhận',$2::jsonb)`,
      [actor, JSON.stringify(data)],
    );
    await client.query(
      `insert into local_employee_profile_history(form_id,user_id,revision,action,snapshot_kind,profile_data,actor_id,reason)
       select id,user_id,revision,'SUBMIT','DRAFT',profile_data,$1,'Nhân viên gửi hồ sơ chờ xác nhận'
       from local_employee_profile_forms where user_id=$1`, [actor],
    );
    await client.query("commit");
    res.json(await localProfileView(actor));
  } catch (error) { await client.query("rollback").catch(() => undefined); sendError(res, error); }
  finally { client.release(); }
});

app.get("/api/profile-requests", async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(currentLocalRole())) return res.status(403).json({ message: "Bạn không có quyền duyệt hồ sơ." });
    const status = String(req.query.status || "SUBMITTED");
    const { rows } = await pool.query(
      `select f.user_id,p.email,p.first_name,p.last_name,p.phone,f.profile_data,f.status,f.revision::text revision,f.submitted_at,f.reviewed_at,f.review_note
       from local_employee_profile_forms f join local_user_profiles p on p.user_id=f.user_id
       where f.status=$1 order by f.submitted_at asc nulls last`, [status],
    );
    res.json(rows);
  } catch (error) { sendError(res, error); }
});

app.post("/api/profile-requests/:userId/review", async (req, res) => {
  const client = await pool.connect();
  try {
    const actor = localActor(req);
    if (!['admin', 'manager'].includes(currentLocalRole())) return res.status(403).json({ message: "Bạn không có quyền duyệt hồ sơ." });
    const decision = String(req.body?.decision || "").toUpperCase();
    if (!['APPROVED', 'NEEDS_INFO'].includes(decision)) throw new Error("Trạng thái duyệt không hợp lệ.");
    const expectedRevision = req.body?.expected_revision;
    if (typeof expectedRevision !== "string" || !/^[0-9]+$/.test(expectedRevision)) throw Object.assign(new Error("Cần phiên bản hồ sơ đã xem để xử lý."), { status: 422 });
    const note = String(req.body?.note || "").trim() || null;
    if (decision === "NEEDS_INFO" && !note) throw new Error("Vui lòng nêu rõ thông tin cần bổ sung.");
    const workerId = decision === "APPROVED" ? String(req.body?.worker_id || "").trim() : "";
    if (decision === "APPROVED" && !workerId) throw Object.assign(new Error("Vui lòng chọn hồ sơ công nhân để liên kết trước khi duyệt."), { status: 422 });
    await client.query("begin");
    // Take the payroll source lock before locking a worker row. Payroll
    // snapshotting creates records that reference workers, so this ordering
    // prevents a worker-link review from deadlocking with a payroll run.
    await lockPayrollSourceShared(client);
    const row = (await client.query("select profile_data,revision::text revision from local_employee_profile_forms where user_id=$1 and status='SUBMITTED' for update", [req.params.userId])).rows[0];
    if (!row) {
      await client.query("rollback");
      return res.status(404).json({ message: "Không tìm thấy hồ sơ đang chờ duyệt." });
    }
    if (BigInt(row.revision) !== BigInt(expectedRevision)) throw Object.assign(new Error("Hồ sơ đã thay đổi. Hãy tải lại và mở lại hồ sơ để kiểm tra trước khi xử lý."), { status: 409 });
    if (decision === 'APPROVED') {
      const data = normalizeSelfProfile(row.profile_data);
      const worker = (await client.query("select id,employee_code,display_name,user_id,is_active from local_workers where id=$1 for update", [workerId])).rows[0];
      if (!worker || !worker.is_active) throw Object.assign(new Error("Hồ sơ công nhân không tồn tại hoặc đã ngừng hoạt động."), { status: 422 });
      if (worker.user_id && worker.user_id !== req.params.userId) throw Object.assign(new Error(`Hồ sơ ${worker.employee_code} đã được liên kết với tài khoản khác.`), { status: 409 });
      const previousLinks = (await client.query("select id,employee_code,display_name,user_id from local_workers where user_id=$1 for update", [req.params.userId])).rows;
      await client.query("update local_workers set user_id=null,updated_at=now(),local_modified_at=now() where user_id=$1 and id<>$2", [req.params.userId, workerId]);
      await client.query("update local_workers set user_id=$1,updated_at=now(),local_modified_at=now() where id=$2", [req.params.userId, workerId]);
      await client.query(
        `insert into local_auth_audit_events(entity_type,entity_id,action,actor_id,reason,before_data,after_data)
         values('worker_user_link',$1,'LINK',$2,$3,$4::jsonb,$5::jsonb)`,
        [req.params.userId, actor, note || "Duyệt hồ sơ và liên kết hồ sơ công nhân", JSON.stringify(previousLinks), JSON.stringify([{ id: worker.id, employee_code: worker.employee_code, display_name: worker.display_name, user_id: req.params.userId }])],
      );
      await client.query(`update local_user_profiles set first_name=coalesce($2,first_name),last_name=coalesce($3,last_name),phone=coalesce($4,phone),local_modified_at=now(),updated_at=now() where user_id=$1`, [req.params.userId, data.first_name, data.last_name, data.phone]);
      await client.query(`update local_employee_profile_forms set approved_data=profile_data,approved_revision=revision where user_id=$1`, [req.params.userId]);
    }
    await client.query(`update local_employee_profile_forms set status=$2,reviewed_at=now(),reviewed_by=$3,review_note=$4,updated_at=now() where user_id=$1`, [req.params.userId, decision, actor, note]);
    await client.query(`insert into local_employee_profile_audit_events(user_id,action,actor_id,reason,after_data) values($1,$2,$3,$4,$5::jsonb)`, [req.params.userId, decision === 'APPROVED' ? 'APPROVE' : 'REQUEST_INFO', actor, note, JSON.stringify(row.profile_data)]);
    await client.query(
      `insert into local_employee_profile_history(form_id,user_id,revision,action,snapshot_kind,profile_data,actor_id,reason)
       select id,user_id,revision,$2,$3,profile_data,$4,$5
       from local_employee_profile_forms where user_id=$1`,
      [req.params.userId, decision === 'APPROVED' ? 'APPROVE' : 'REQUEST_INFO', decision === 'APPROVED' ? 'APPROVED' : 'DRAFT', actor, note],
    );
    await client.query("commit");
    res.json(await localProfileView(String(req.params.userId)));
  } catch (error) { await client.query("rollback").catch(() => undefined); sendError(res, error); }
  finally { client.release(); }
});

const serverDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(serverDirectory, "..");
let localSyncProcess: ReturnType<typeof spawn> | null = null;
let localSyncStartInFlight = false;
let localSyncTimer: ReturnType<typeof setInterval> | null = null;
const localSyncIntervalMs = (() => {
  const configuredMinutes = Number(
    process.env.LOCAL_SYNC_INTERVAL_MINUTES || "5",
  );
  if (!Number.isFinite(configuredMinutes)) return 5 * 60 * 1000;
  return Math.min(Math.max(configuredMinutes, 1), 24 * 60) * 60 * 1000;
})();
const localSyncAutomaticEnabled =
  runtime.syncAutomaticEnabled &&
  (!process.env.VITE_BACKEND_MODE || process.env.VITE_BACKEND_MODE === "local");
const localStorageRoot = runtime.storageRoot;
const safeStoragePath = (bucket: string, objectPath: string) => {
  const cleanBucket = bucket.replace(/[^a-zA-Z0-9_-]/g, "_");
  const cleanObject = objectPath.replace(/\\/g, "/").replace(/^\/+/, "");
  const root = path.resolve(localStorageRoot, cleanBucket);
  const target = path.resolve(root, cleanObject);
  if (target !== root && !target.startsWith(`${root}${path.sep}`))
    throw new Error("Đường dẫn tệp local không hợp lệ.");
  return { root, target };
};
// Local responses must not leak public Supabase Storage URLs back into the
// local application. The raw source snapshot remains untouched for audit and
// recovery; only API output is rewritten to the local file endpoint.
app.use((req, res, next) => {
  const json = res.json.bind(res);
  res.json = ((body: unknown) =>
    json(rewriteStorageUrls(body))) as typeof res.json;
  next();
});
const mimeTypeFor = (objectPath: string) => {
  const extension = path.extname(objectPath).toLowerCase();
  return (
    (
      {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".pdf": "application/pdf",
        ".doc": "application/msword",
        ".docx":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".xls": "application/vnd.ms-excel",
        ".xlsx":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".txt": "text/plain",
        ".json": "application/json",
      } as Record<string, string>
    )[extension] || "application/octet-stream"
  );
};

const asNumber = (value: unknown) =>
  value === null || value === undefined ? null : Number(value);
const monthStart = (value: unknown) =>
  typeof value === "string" && /^\d{4}-\d{2}$/.test(value)
    ? `${value}-01`
    : `${businessDateKey().slice(0, 7)}-01`;
const localTodayDateKey = businessDateKey;
const futureDateError = (date: string, label: string) =>
  Object.assign(
    new Error(
      `${label} không được ở tương lai (${date}). Chỉ được ghi đến hôm nay (${localTodayDateKey()}).`,
    ),
    { status: 422, code: "FUTURE_DATE" },
  );
const assertNotFutureDate = (date: string, label: string) => {
  if (date > localTodayDateKey()) throw futureDateError(date, label);
};
const bodyValue = (
  body: Record<string, unknown>,
  snake: string,
  camel: string,
) => body[snake] ?? body[camel];
function sendError(res: express.Response, error: unknown) {
  const message = error instanceof Error ? error.message : "Local API error";
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status?: unknown }).status)
      : 400;
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code || "")
      : "";
  res
    .status(
      Number.isInteger(status) && status >= 400 && status <= 504 ? status : 400,
    )
    .json(quoteCustomerConflictDetails(error) ? { message, ...quoteCustomerConflictDetails(error) } : code ? { message, code } : { message });
}
// Register before legacy routes as well as before payroll/source mutations.
const productionDispatchService=registerProductionDispatch(app, {
  actor: currentLocalActor,
  role: currentLocalRole,
  transaction: withLocalTransaction,
  lockShared: lockPayrollSourceShared,
  lockRateConfigShared: lockProductRateConfigShared,
  sendError,
  lockDay: lockAttendanceDay,
  writable: assertWorkflowWritable,
  dayAllowsWork: assertDayStatusAllowsWork,
  reviewScope: assertLocalReviewScope,
  createEntry: (body,worker,client)=>createProductionEntry(body,worker,client,true),
  workflowEvent: recordWorkflowEvent,
});
registerProductionSalesWorkflow(app, {
  actor: currentLocalActor,
  role: currentLocalRole,
  transaction: withLocalTransaction,
  sendError,
});
registerPurchaseFulfillment(app, {
  actor: currentLocalActor,
  role: currentLocalRole,
  transaction: withLocalTransaction,
  capability: requireLocalCapability,
  sendError,
});
registerOrderShipments(app,{actor:currentLocalActor,role:currentLocalRole,transaction:withLocalTransaction,lockShared:lockPayrollSourceShared,sendError});
registerProductionWorkspace(app, {actor:currentLocalActor,role:currentLocalRole,transaction:withLocalTransaction,lockShared:lockPayrollSourceShared,sendError,prepareExtraPayroll:async(client,workerId,date)=>{
  const context=await payrollSourceContext(client,workerId,date);
  if(!context.worker.is_active||context.worker.payroll_status!=='ACTIVE')throw Object.assign(new Error('Nhân viên ngừng hoạt động hoặc chưa thuộc bảng lương đang dùng.'),{status:409});
  await lockAttendanceDay(client,workerId,date);
  await assertWorkflowWritable(client,workerId,date,'SUBMITTED');
  await assertDayStatusAllowsWork(client,workerId,date,'ghi tiền công cộng thêm');
  if((await client.query("select 1 from local_payroll_periods where status='CLOSED' and $1::date between period_start and period_end",[date])).rows[0])throw Object.assign(new Error('Ngày hoàn thành thuộc kỳ lương đã đóng.'),{status:409});
  const start=date.slice(0,7)+'-01',end=new Date(Date.UTC(Number(date.slice(0,4)),Number(date.slice(5,7)),0)).toISOString().slice(0,10);
  const period=await payrollAdjustmentPeriod(start,end,26,client);
  if(period.status==='CLOSED')throw Object.assign(new Error('Kỳ lương đã đóng.'),{status:409});
  return String(period.id);
}});
registerProductSupplyClassifications(app, {actor:currentLocalActor,role:currentLocalRole,transaction:withLocalTransaction,sendError});
registerProductTechnicalProfiles(app, {actor:currentLocalActor,role:currentLocalRole,transaction:withLocalTransaction,sendError});
registerProductLaborMappings(app,{actor:currentLocalActor,role:currentLocalRole,capability:write=>requireLocalCapability(pool,write?['payroll_rate_manage']:['payroll_rate_view','payroll_rate_manage']),transaction:withLocalTransaction,sendError});
registerProductLaborRequirements(app,{actor:currentLocalActor,role:currentLocalRole,capability:write=>requireLocalCapability(pool,write?['payroll_rate_manage']:['payroll_rate_view','payroll_rate_manage']),transaction:withLocalTransaction,sendError});
registerProductRateQuote(app,{pool,actor:currentLocalActor,role:currentLocalRole,sendError});
registerProductRateAuthoring(app,{pool,actor:currentLocalActor,role:currentLocalRole,lockShared:lockPayrollSourceShared,sendError});
registerPayrollMonthly(app,{pool,actor:currentLocalActor,role:currentLocalRole,sync:body=>createLocalPayrollRun(body,true),preflight:(db,start,end,days,ids)=>payrollPreflight(db,start,end,days,ids??undefined),audit:(table,id,action,reason,db)=>payrollAudit(table,id,action,reason,db),sendError});
const idempotencyConflict = (key: string) =>
  Object.assign(
    new Error(`Idempotency key '${key}' đã được dùng cho payload khác.`),
    { status: 409 },
  );
const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
};
const payloadFingerprint = (value: Record<string, unknown>) =>
  createHash("sha256").update(canonicalJson(value)).digest("hex");
const hashLocalPassword = (password: string) => {
  const salt = randomBytes(16).toString("hex");
  const digest = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${digest}`;
};
const verifyLocalPassword = (
  password: string,
  stored: string | null | undefined,
) => {
  // Migrated profiles without a local password must be reset explicitly.
  if (!stored) return false;
  if (stored.startsWith("scrypt$")) {
    const [, salt, digest] = stored.split("$");
    if (!salt || !digest) return false;
    const expected = Buffer.from(digest, "hex");
    const actual = scryptSync(password, salt, expected.length);
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  }
  return createHash("sha256").update(password).digest("hex") === stored;
};
const parseSimpleCsv = (text: string) =>
  text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const cells: string[] = [];
      let current = "";
      let quoted = false;
      for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        if (ch === '"' && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else if (ch === '"') quoted = !quoted;
        else if (ch === "," && !quoted) {
          cells.push(current.trim());
          current = "";
        } else current += ch;
      }
      cells.push(current.trim());
      return cells;
    });
const simplePdf = (lines: string[]) => {
  const safe = lines.map((line) =>
    String(line)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\x20-\x7E]/g, "?")
      .replace(/[()\\]/g, (char) => `\\${char}`)
      .slice(0, 110),
  );
  const content = [
    "BT",
    "/F1 12 Tf",
    "50 780 Td",
    ...safe.flatMap((line, index) => [index ? "0 -20 Td" : "", `(${line}) Tj`]),
    "ET",
  ]
    .filter(Boolean)
    .join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content, "ascii")} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets[index + 1] = Buffer.byteLength(pdf, "ascii");
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, "ascii");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n `)
    .join(
      "\n",
    )}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "ascii").toString("base64");
};

app.get("/", (_req, res) => {
  res.type("html").send(`<!doctype html>
    <html lang="vi"><head><meta charset="utf-8"><title>CRM local API</title>
    <style>body{font-family:system-ui,sans-serif;max-width:720px;margin:64px auto;padding:0 24px;color:#172033}a{color:#0f766e}code{background:#eef2f7;padding:2px 6px;border-radius:4px}.ok{color:#047857;font-weight:700}</style></head>
    <body><h1>CRM local API</h1><p class="ok">API local đang hoạt động.</p>
    <p>Đây là cổng dữ liệu, không phải giao diện CRM.</p>
    <p>Mở giao diện tại <a href="http://127.0.0.1:8090/dashboard">http://127.0.0.1:8090/dashboard</a></p>
    <p>Kiểm tra API: <a href="/health"><code>/health</code></a> · Khách hàng: <a href="/api/customers"><code>/api/customers</code></a></p>
    </body></html>`);
});

app.get("/health", async (_req, res) => {
  try {
    const { rows } = await pool.query("select current_database() as database");
    res.json({
      ok: true,
      backend: "local-postgresql",
      database: String(rows[0]?.database ?? ""),
      capabilities: { production_dispatch: 3, production_sales_workflow: 1,production_workspace:5 },
    });
  } catch (error) {
    sendError(res, error);
  }
});

// Lightweight local refresh signal used by the Supabase-compatible client
// adapter. It intentionally carries no row data; subscribers re-fetch through
// their normal authorized query after the signal so permissions stay server-
// side and multiple browser tabs converge without the Supabase Realtime
// service.
app.get("/api/local-realtime", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ changed_at: new Date().toISOString(), local_only: true });
});

// Local file storage replacement for Supabase Storage. Files stay on this
// machine under .local-storage and are never sent to the public project.
app.post("/api/local-storage/:bucket/upload", async (req, res) => {
  try {
    const bucket = String(req.params.bucket || "");
    const objectPath = String(req.body?.path || "");
    const dataUrl = String(req.body?.dataUrl || "");
    const upsert = Boolean(req.body?.upsert);
    if (!bucket || !objectPath || !dataUrl.startsWith("data:"))
      throw new Error("Tệp local không hợp lệ.");
    const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,([\s\S]*)$/);
    if (!match) throw new Error("Dữ liệu tệp local không hợp lệ.");
    const contentType = match[1] || mimeTypeFor(objectPath);
    const buffer = match[2]
      ? Buffer.from(match[3], "base64")
      : Buffer.from(decodeURIComponent(match[3]), "utf8");
    const { root, target } = safeStoragePath(bucket, objectPath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    try {
      await fs.access(target);
      if (!upsert) return res.status(409).json({ message: "Tệp đã tồn tại." });
    } catch {
      /* new file */
    }
    await fs.writeFile(target, buffer);
    res.status(201).json({
      path: objectPath,
      bucket,
      size: buffer.byteLength,
      contentType,
      publicUrl: `/api/local-storage/${encodeURIComponent(bucket)}/object?path=${encodeURIComponent(objectPath)}`,
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/local-storage/:bucket/list", async (req, res) => {
  try {
    const bucket = String(req.params.bucket || "");
    const prefix = String(req.query.prefix || "").replace(/^\/+|\/+$/g, "");
    const { root, target } = safeStoragePath(bucket, prefix);
    const rows: Array<Record<string, unknown>> = [];
    const seenDirectories = new Set<string>();
    let entries: Array<import("node:fs").Dirent> = [];
    try {
      entries = await fs.readdir(target, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return res.json({ data: [], error: null });
      throw error;
    }
    for (const entry of entries) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        seenDirectories.add(entry.name);
        rows.push({
          name: entry.name,
          id: relativePath,
          fullPath: relativePath,
          metadata: null,
          created_at: null,
          updated_at: null,
        });
      } else if (entry.isFile()) {
        const stat = await fs.stat(path.join(target, entry.name));
        rows.push({
          name: entry.name,
          id: relativePath,
          fullPath: relativePath,
          metadata: { size: stat.size, mimetype: mimeTypeFor(entry.name) },
          created_at: stat.birthtime.toISOString(),
          updated_at: stat.mtime.toISOString(),
        });
      }
    }
    res.json({ data: rows, error: null, bucket, prefix });
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/local-storage/:bucket/object", async (req, res) => {
  try {
    const bucket = String(req.params.bucket || "");
    const objectPath = String(req.query.path || "");
    const { target } = safeStoragePath(bucket, objectPath);
    const content = await fs.readFile(target);
    res.type(mimeTypeFor(objectPath)).send(content);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return res.status(404).json({ message: "Không tìm thấy tệp local." });
    sendError(res, error);
  }
});

app.delete("/api/local-storage/:bucket", async (req, res) => {
  try {
    const bucket = String(req.params.bucket || "");
    const paths = Array.isArray(req.body?.paths)
      ? req.body.paths.map(String)
      : [];
    for (const objectPath of paths) {
      const { target } = safeStoragePath(bucket, objectPath);
      await fs.rm(target, { force: true });
    }
    res.json({ data: paths.map((name: string) => ({ name })), error: null });
  } catch (error) {
    sendError(res, error);
  }
});

// Local replacements for the small Edge Functions still used by legacy UI components.
const aiProvider = new LocalAiProvider(pool);
const aiWorkflows = new LocalAiWorkflows(pool, aiProvider);
registerAiProviders(app, aiProvider, currentLocalActor, currentLocalRole);
registerPayrollRules(app, pool, currentLocalActor, currentLocalRole);
const externalSettings = new ExternalIntegrationSettings(pool);
const goongSettings = new GoongIntegrationSettings(pool);
const externalRead = new ExternalReadAdapters(process.env, fetch, () => externalSettings.snapshot(), () => goongSettings.snapshot());
const ghnOrders = new GhnOrders(pool, externalRead);
if (runtime.startupMode === 'normal') {
  registerGhnOrders(app, ghnOrders, currentLocalActor);
  registerGhnEditing(app, new GhnEditing(pool, externalRead), currentLocalActor, sendError);
  registerExternalIntegrationSettings(app, externalSettings, externalRead, currentLocalActor, currentLocalRole);
  registerGoongIntegrationSettings(app, goongSettings, currentLocalActor, currentLocalRole);
  registerGhnTracking(app, pool, externalRead, currentLocalActor, sendError);
  registerGhnTrackingManagement(app, new GhnTrackingManagement(pool, externalRead), currentLocalActor, sendError);
  app.get('/api/external-integrations/status', async (_req, res) => {
    if (!['admin','manager'].includes(currentLocalRole())) return res.status(403).json({message:'Chỉ quản trị viên hoặc quản lý được xem cấu hình tích hợp.'});
    try { res.setHeader('Cache-Control', 'no-store'); res.json(await externalRead.getStatus()); }
    catch { res.status(503).json({ message: 'Không thể đọc trạng thái tích hợp. Vui lòng thử lại.' }); }
  });
}

app.get('/api/ai/my-settings',async (req,res)=>{
 try {
  const result=await pool.query(`select payload->>'setting_name' setting_name,payload->'setting_value' setting_value from local_compat_records c where table_name='ai_settings' and not is_deleted and payload->>'user_id'=$1
   union all select payload->>'setting_name',payload->'setting_value' from local_source_snapshots s where source_table='ai_settings' and not is_deleted and payload->>'user_id'=$1
   and not exists(select 1 from local_compat_records c where c.table_name='ai_settings' and c.payload->>'user_id'=$1 and c.payload->>'setting_name'=s.payload->>'setting_name')`,[localActor(req)]);
  res.json(result.rows.filter(row=>['auto_classify','interaction_suggestions','sentiment_analysis','ai_next_actions'].includes(row.setting_name)).map(row=>({setting_name:row.setting_name,setting_value:row.setting_value===true})));
 }catch{res.status(500).json({message:'Không tải được cài đặt AI của tài khoản.'});}
});
app.post("/api/local-functions/:name", async (req, res) => {
  try {
    const name = String(req.params.name || "");
    const body = req.body || {};
    const aiResult = await aiWorkflows.function(name, body, localActor(req), currentLocalRole());
    if (aiResult !== null) return res.json(aiResult);
    if (name === "lookup-tax-code") {
      if (body.type === "refresh_ai_config")
        return res.json({ success: true, local_only: true });
      if (body.type === "parse_text" || body.type === "parse_image") {
        const source =
          body.type === "parse_text" ? String(body.data || "") : "";
        const read = (...patterns: RegExp[]) =>
          patterns
            .map((pattern) => source.match(pattern)?.[1]?.trim())
            .find(Boolean) || "";
        return res.json({
          company_name: read(
            /(?:công ty|doanh nghiệp|tên đơn vị)\s*[:-]?\s*([^\n,;]+)/i,
          ),
          representative: read(
            /(?:đại diện|người đại diện)\s*[:-]?\s*([^\n,;]+)/i,
          ),
          position: read(/(?:chức vụ)\s*[:-]?\s*([^\n,;]+)/i),
          address: read(/(?:địa chỉ)\s*[:-]?\s*([^\n;]+)/i),
          tax_code: read(/(?:mst|mã số thuế)\s*[:-]?\s*([0-9-]{8,20})/i),
          phone: read(
            /(?:điện thoại|số đt|phone|tel)\s*[:-]?\s*([+0-9 .()-]{8,20})/i,
          ),
          bank_name: read(/(?:ngân hàng)\s*[:-]?\s*([^\n,;]+)/i),
          bank_account: read(
            /(?:số tài khoản|stk)\s*[:-]?\s*([0-9 .-]{5,30})/i,
          ),
          bank_holder: read(/(?:chủ tài khoản)\s*[:-]?\s*([^\n,;]+)/i),
          local_only: true,
          ...(body.type === "parse_image"
            ? {
                error:
                  "Local chưa có OCR cho ảnh; hãy dán nội dung text để phân tích.",
              }
            : {}),
        });
      }
      if (body.type === "parse_order_text") {
        const text = String(body.data || "");
        const items = text
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const quantity =
              Number(
                line
                  .match(/(?:x|sl|số lượng)\s*[:=]?\s*(\d+(?:[.,]\d+)?)/i)?.[1]
                  ?.replace(",", "."),
              ) || 1;
            const price =
              Number(
                (line.match(/(\d[\d.,]*)\s*(?:đ|vnd|vnđ)?$/i)?.[1] || "")
                  .replace(/\./g, "")
                  .replace(",", "."),
              ) || 0;
            const name = line
              .replace(/(?:x|sl|số lượng)\s*[:=]?\s*\d+(?:[.,]\d+)?/i, "")
              .replace(/\d[\d.,]*\s*(?:đ|vnd|vnđ)?$/i, "")
              .trim();
            return { name: name || line, specifications: "", quantity, price };
          })
          .filter((item) => item.name.length > 1);
        return res.json({ items, local_only: true });
      }
      if (body.type === "ai_quote_fill" || body.type === "ai_quote_debug") {
        const data = body.data || {};
        const requestText = String(data.request || "").trim();
        if (!requestText)
          return res.json({
            items: [],
            clarification: "Vui lòng nhập yêu cầu sản phẩm.",
            local_only: true,
          });
        const tokens = requestText
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .split(/[^a-z0-9]+/)
          .filter((token: string) => token.length >= 2);
        const productRows = await pool.query(
          `select id,name,sku,price,specifications,description from local_products where is_active and ($1::text is null or price_list_id::text=$1) order by name limit 3000`,
          [data.priceListId || null],
        );
        const requestedQuantity =
          Number(
            requestText
              .match(/(?:x|sl|số lượng)\s*[:=]?\s*(\d+(?:[.,]\d+)?)/i)?.[1]
              ?.replace(",", "."),
          ) || 1;
        const ranked = productRows.rows
          .map((product) => {
            const haystack =
              `${product.name || ""} ${product.sku || ""} ${product.specifications || ""} ${product.description || ""}`
                .toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "");
            const score = tokens.reduce(
              (total: number, token: string) =>
                total + (haystack.includes(token) ? 1 : 0),
              0,
            );
            return { product, score };
          })
          .filter((item) => item.score > 0)
          .sort((left, right) => right.score - left.score)
          .slice(0, 12);
        const response = {
          items: ranked.map(({ product, score }) => ({
            matchedProductId: product.id,
            customName: product.name,
            quantity: requestedQuantity,
            price: Number(product.price || 0),
            specifications: product.specifications || "",
            note: "So khớp từ dữ liệu local",
            matchQuality:
              score >= Math.max(2, tokens.length / 2)
                ? "exact"
                : "fallback_product",
          })),
          local_only: true,
          source: "local-catalog-match",
        };
        return res.json(body.type === 'ai_quote_debug' ? {segments:[requestText],filtering:{totalProducts:productRows.rows.length,filteredProducts:ranked.length},aiResponse:response,modelUsed:'local-catalog-match',warnings:['Đang dùng quy tắc local, chưa gọi nhà cung cấp AI.']} : response);
      }
      if (body.type === "parse_order_image" || body.type === "parse_order_file")
        return res.json({
          items: [],
          local_only: true,
          message:
            "Local chưa có OCR/parser cho định dạng này; hãy dùng nhập văn bản.",
        });
      if (body.type !== "tax_code")
        throw new Error("Loại tra cứu local chưa được hỗ trợ.");
      return res.json(await externalRead.taxCode(body.data));
    }
    if (name === "change-password") {
      if (req.method === "GET" || body.action === "generate") {
        const generated = `Local!${randomBytes(4).toString("hex")}A1`;
        return res.json({ password: generated, local_only: true });
      }
      const target = String(body.targetUserId || body.userId || "local-admin");
      const action = body.action === "reset_user" ? "reset_user" : "change_own";
      const result = await fetch(
        `http://127.0.0.1:${process.env.LOCAL_API_PORT || 8787}/api/users/${encodeURIComponent(target)}/password`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: req.get("authorization") || "",
          },
          body: JSON.stringify({
            currentPassword: body.currentPassword,
            newPassword: body.newPassword,
            action,
          }),
        },
      );
      const data = await result.json().catch(() => ({}));
      if (!result.ok) return res.status(result.status).json(data);
      return res.json({ ...data, local_only: true });
    }
    if (name === "ai-customer-suggestions") {
      const customer = body.customer || {};
      const suggestion =
        customer.current_status === "waiting-payment"
          ? "Gọi xác nhận thanh toán"
          : customer.purchase_count > 0
            ? "Chăm sóc sau bán"
            : "Gửi thông tin sản phẩm phù hợp";
      return res.json({ suggestion, local_only: true, source: "local-rule" });
    }
    if (name === "predictive-analytics") {
      return res.json({
        predictions: [
          {
            type: "purchase_probability",
            value: 50,
            confidence: 0.2,
            factors: ["local rule baseline"],
          },
          {
            type: "churn_risk",
            value: 50,
            confidence: 0.2,
            factors: ["local rule baseline"],
          },
          {
            type: "optimal_contact_time",
            value: "09:00-11:00",
            confidence: 0.1,
            factors: ["local default"],
          },
        ],
        local_only: true,
        source: "local-rule",
      });
    }
    if (name === "extract-document") {
      if (body.storagePath) {
        const bucket = String(body.bucket || "knowledge-files");
        if (bucket !== 'knowledge-files') throw Object.assign(new Error('Chỉ được trích xuất tài liệu từ kho kiến thức.'), { status: 403 });
        const storagePath = String(body.storagePath);
        const { target } = safeStoragePath(bucket, storagePath);
        const fileName = String(body.fileName || storagePath).toLowerCase();
        const bytes = await fs.readFile(target);
        if (
          fileName.endsWith(".txt") ||
          fileName.endsWith(".md") ||
          fileName.endsWith(".csv")
        ) {
          return res.json({
            content: bytes.toString("utf8"),
            local_only: true,
            extracted: true,
          });
        }
        if (fileName.endsWith(".pdf")) {
          const raw = bytes.toString("latin1");
          const chunks = [...raw.matchAll(/\(([^()]*)\)\s*T[jJ]/g)].map(
            (match) => match[1].replace(/\\([\\()])/g, "$1"),
          );
          const content = chunks.join(" ").replace(/\s+/g, " ").trim();
          return res.json({
            content,
            local_only: true,
            extracted: Boolean(content),
            message: content
              ? undefined
              : "PDF local không có lớp text có thể đọc.",
          });
        }
        return res.json({
          content: "",
          local_only: true,
          extracted: false,
          message:
            "Tệp đã lưu local; định dạng này cần parser chuyên dụng để trích xuất nội dung.",
        });
      }
      return res.json({
        content: String(body.content || ""),
        local_only: true,
        extracted: Boolean(body.content),
        message: "Local chỉ nhận nội dung text nếu không truyền storagePath.",
      });
    }
    if (name === "import-products") {
      const sourceUrl = String(body.googleSheetsUrl || "").trim();
      if (!sourceUrl) throw new Error("Thiếu URL Google Sheets.");
      let exportUrl = sourceUrl.includes("/edit")
        ? `${sourceUrl.split("/edit")[0]}/export?format=csv`
        : sourceUrl;
      const parsedSource = new URL(exportUrl);
      const allowedHosts = new Set(["docs.google.com", "sheets.google.com"]);
      if (!allowedHosts.has(parsedSource.hostname.toLowerCase())) {
        throw new Error("Chỉ cho phép import từ Google Sheets.");
      }
      exportUrl = await safeScrapeUrl(parsedSource.toString());
      const sourceResponse = await fetch(exportUrl, {
        redirect: "manual",
        signal: AbortSignal.timeout(15000),
      });
      if (sourceResponse.status >= 300 && sourceResponse.status < 400)
        throw new Error("Google Sheets không được chuyển hướng sang URL khác.");
      if (!sourceResponse.ok)
        throw new Error(
          `Không đọc được Google Sheets (${sourceResponse.status}).`,
        );
      const sourceText = await sourceResponse.text();
      if (Buffer.byteLength(sourceText, "utf8") > 5 * 1024 * 1024)
        throw new Error("Tệp Google Sheets vượt quá giới hạn 5 MB.");
      const rows = parseSimpleCsv(sourceText);
      if (rows.length < 2)
        throw new Error("Google Sheets không có dữ liệu sản phẩm.");
      const headers = rows[0].map((value) =>
        value
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/đ/g, "d"),
      );
      const mapping = body.columnMapping || {};
      const indexOf = (key: string, fallbacks: string[]) =>
        mapping[key] && mapping[key] !== "none"
          ? Number(mapping[key])
          : headers.findIndex((header) =>
              fallbacks.some((candidate) => header.includes(candidate)),
            );
      const skuIndex = indexOf("sku", ["sku", "ma sp", "ma san pham"]);
      const nameIndex = indexOf("name", ["ten", "name", "san pham"]);
      if (skuIndex < 0 || nameIndex < 0)
        throw new Error("Không tìm thấy cột SKU hoặc tên sản phẩm.");
      const categoryIndex = indexOf("category", ["nhom", "category", "loai"]);
      const priceIndex = indexOf("price", ["gia ban", "gia", "price"]);
      const descriptionIndex = indexOf("description", ["mo ta", "description"]);
      let savedProducts = 0;
      const client = await pool.connect();
      try {
        await client.query("begin");
        for (const row of rows.slice(1)) {
          const sku = String(row[skuIndex] || "").trim();
          const productName = String(row[nameIndex] || "").trim();
          if (!sku || !productName) continue;
          const priceRaw =
            priceIndex >= 0
              ? String(row[priceIndex] || "")
                  .replace(/[^0-9.,-]/g, "")
                  .replace(/\./g, "")
                  .replace(",", ".")
              : "";
          const category =
            categoryIndex >= 0 ? row[categoryIndex] || null : null;
          const description =
            descriptionIndex >= 0 ? row[descriptionIndex] || null : null;
          const priceList = body.priceListId || null;
          // SKU is only unique inside a price list. The public snapshot also
          // permits the same SKU across lists, so ON CONFLICT(sku) is invalid.
          const existing = await client.query(
            "select id from local_products where sku=$1 and price_list_id is not distinct from $2::uuid order by local_modified_at desc nulls last, updated_at desc nulls last limit 1",
            [sku, priceList],
          );
          if (existing.rows[0]) {
            await client.query(
              "update local_products set name=$2,category=$3,description=$4,price=$5,is_active=true,is_snapshot_record=false,local_modified_at=now(),updated_at=now() where id=$1",
              [
                existing.rows[0].id,
                productName,
                category,
                description,
                priceRaw ? Number(priceRaw) : null,
              ],
            );
          } else {
            await client.query(
              "insert into local_products(id,sku,name,category,description,price,price_list_id,is_active,is_snapshot_record,local_modified_at,created_at,updated_at) values(gen_random_uuid(),$1,$2,$3,$4,$5,$6,true,false,now(),now(),now())",
              [
                sku,
                productName,
                category,
                description,
                priceRaw ? Number(priceRaw) : null,
                priceList,
              ],
            );
          }
          savedProducts += 1;
        }
        await client.query("commit");
      } catch (error) {
        await client.query("rollback").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
      return res.json({
        success: true,
        local_only: true,
        message: `Đã import ${savedProducts} sản phẩm vào PostgreSQL local.`,
        stats: { totalDataRows: rows.length - 1, savedProducts },
      });
    }
    if (name === "web-scraper") {
      if (body.action === "list_models")
        return res.json({
          data: [{ id: "local-html-extractor", name: "Local HTML Extractor" }],
          local_only: true,
        });
      const urls = Array.isArray(body.urls)
        ? body.urls.map(String).filter(Boolean)
        : [];
      if (!urls.length) throw new Error("URLs array is required.");
      const results = await Promise.all(
        urls.slice(0, 30).map(async (inputUrl: string) => {
          const candidate = /^https?:\/\//i.test(inputUrl)
            ? inputUrl
            : `https://${inputUrl}`;
          try {
            const url = await safeScrapeUrl(candidate);
            const response = await fetch(url, {
              redirect: "manual",
              headers: { "user-agent": "Mozilla/5.0 CRM-Local/1.0" },
              signal: AbortSignal.timeout(15000),
            });
            if (response.status >= 300 && response.status < 400)
              throw new Error("URL chuyển hướng bị từ chối vì lý do an toàn.");
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const html = await response.text();
            if (Buffer.byteLength(html, "utf8") > 5 * 1024 * 1024)
              throw new Error("Trang vượt quá giới hạn 5 MB.");
            const text = html
              .replace(/<script[\s\S]*?<\/script>/gi, " ")
              .replace(/<style[\s\S]*?<\/style>/gi, " ")
              .replace(/<[^>]+>/g, " ")
              .replace(/&nbsp;/g, " ")
              .replace(/\s+/g, " ")
              .trim();
            const title =
              html
                .match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
                ?.replace(/<[^>]+>/g, " ")
                .trim() || "";
            const emails = [
              ...new Set(
                text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [],
              ),
            ].slice(0, 20);
            const phones = [
              ...new Set(text.match(/(?:\+?84|0)[0-9 .()-]{8,14}/g) || []),
            ]
              .map((value) => value.trim())
              .slice(0, 20);
            const count = Math.max(emails.length, phones.length, 1);
            const data = Array.from({ length: count }, (_, index) => ({
              name: index === 0 ? title : "",
              company: title,
              profession: "",
              phone: phones[index] || "",
              email: emails[index] || "",
            }));
            return { url, success: true, data, local_only: true };
          } catch (error) {
            return {
              url: candidate,
              success: false,
              error:
                error instanceof Error ? error.message : "Không thể tải URL",
              data: [],
              local_only: true,
            };
          }
        }),
      );
      return res.json({
        results,
        local_only: true,
        model: "local-html-extractor",
      });
    }
    if (name === "ghn-tracking") {
      res.setHeader('Cache-Control', 'no-store');
      const action = String(body.action || '');
      if (action === 'create_order') {
        const {action: _action, ...createBody} = body;
        return res.json(await ghnOrders.create(currentLocalActor(), createBody));
      }
      if (['track','track_order','get_order_detail'].includes(action)) {
        const code = String(body.orderCode || body.order_code || '').trim();
        await requireGhnTrackingVisible(pool, currentLocalActor(), code);
      }
      try { return res.json(await externalRead.ghn(body, undefined, currentLocalActor())); }
      catch (error) { return res.status(Number((error as {status?:number}).status || 502)).json({ success: false, error: error instanceof Error ? error.message : 'Không truy cập được GHN.',...(error&&typeof error==='object'&&'code'in error&&error.code==='GHN_SERVICE_UNSUPPORTED'?{code:'GHN_SERVICE_UNSUPPORTED'}:{}) }); }
    }
    if (name === "vinvoice-api") {
      const action = String(body.action || "");
      if (action === "config_status")
        return res.json({
          success: true,
          local_only: true,
          status: {},
          message: "Local không dùng secret Viettel.",
        });
      if (action === "get_settings") {
        const settings = await pool.query(
          "select id,manager_id,tax_code,username,api_url,default_invoice_type,default_template_code,default_serial,last_login_at,last_login_status,last_login_error,(password is not null and password <> '') has_password from local_einvoice_settings where manager_id=$1 order by updated_at desc nulls last limit 1", [currentLocalActor()],
        );
        return res.json({
          success: true,
          local_only: true,
          settings: settings.rows[0] || null,
          env_fallback: null,
        });
      }
      if (action === "get_templates") {
        const p = await contractPrincipal(pool, currentLocalActor(), currentLocalRole());
        const templates = await pool.query(
          "select template_code,invoice_series,manager_id from local_einvoices where template_code is not null and company_id is null order by template_code,invoice_series",
        );
        return res.json({
          success: true,
          local_only: true,
          data: { lstInvoiceTemplate: templates.rows.filter(row => canInvoice(p, row)) },
        });
      }
      return res.json({
        success: false,
        local_only: true,
        error:
          "Local chỉ hỗ trợ xem/lưu nháp hóa đơn; không phát hành hoặc gọi Viettel.",
      });
    }
    if (name === "create-user") {
      const result = await fetch(
        `http://127.0.0.1:${process.env.LOCAL_API_PORT || 8787}/api/users`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: req.get("authorization") || "",
          },
          body: JSON.stringify(body),
        },
      );
      const data = await result.json().catch(() => ({}));
      return res.status(result.status).json({ ...data, local_only: true });
    }
    if (name === "delete-user") {
      const target = String(body.userId || body.targetUserId || "");
      if (!target) throw new Error("Thiếu userId.");
      const result = await fetch(
        `http://127.0.0.1:${process.env.LOCAL_API_PORT || 8787}/api/users/${encodeURIComponent(target)}`,
        {
          method: "DELETE",
          headers: { authorization: req.get("authorization") || "" },
        },
      );
      const data = await result.json().catch(() => ({}));
      return res.status(result.status).json({ ...data, local_only: true });
    }
    if (name === "save-employee-permissions") {
      const target = String(body.userId || body.user_id || "");
      if (!target) throw new Error("Thiếu userId.");
      const result = await fetch(
        `http://127.0.0.1:${process.env.LOCAL_API_PORT || 8787}/api/users/${encodeURIComponent(target)}/permissions`,
        {
          method: "PUT",
          headers: {
            "content-type": "application/json",
            authorization: req.get("authorization") || "",
          },
          body: JSON.stringify({
            permissions: body.permissions || {},
            reason: body.reason || "Cập nhật phân quyền local",
          }),
        },
      );
      const data = await result.json().catch(() => ({}));
      return res.status(result.status).json({ ...data, local_only: true });
    }
    return res.status(501).json({
      message: `Local API chưa triển khai Edge Function ${name}.`,
      local_only: true,
    });
  } catch (error) {
    sendError(res, error);
  }
});
app.get("/api/local-functions/change-password", async (_req, res) => {
  res.json({
    password: `Local!${randomBytes(4).toString("hex")}A1`,
    local_only: true,
  });
});

app.get("/api/dashboard/stats", async (_req, res) => {
  try {
    const { rows } = await pool.query(`select
      (select count(*)::int from local_customers where is_active) total_customers,
      (select count(*)::int from local_customers where is_active and created_at >= date_trunc('month',now())) monthly_customers,
      (select count(*)::int from local_orders) total_orders,
      (select count(*)::int from local_orders where status='pending') pending_orders,
      (select count(*)::int from local_orders where created_at >= date_trunc('month',now())) monthly_orders,
      (select coalesce(sum(total_amount),0) from local_orders where status in ('delivered','self_delivered')) total_revenue,
      (select coalesce(sum(total_amount),0) from local_orders where status in ('delivered','self_delivered') and created_at >= date_trunc('month',now())) monthly_revenue,
      (select coalesce(sum(total_amount),0) from local_orders where status in ('delivered','self_delivered') and created_at >= date_trunc('month',now())-interval '1 month' and created_at < date_trunc('month',now())) previous_month_revenue,
      (select count(*)::int from local_quotes) total_quotes,
      (select count(*)::int from local_quotes where status='approved') approved_quotes,
      (select count(*)::int from local_products where is_active) total_products,
      (select count(*)::int from local_contracts) total_contracts,
      (select coalesce(sum(amount),0) from local_expenses where expense_date >= date_trunc('month',now())) monthly_expenses,
      (select count(*)::int from local_workers where is_active) active_workers,
      (select count(*)::int from local_attendance where work_date >= date_trunc('month',current_date)::date and not is_reversed) attendance_entries,
      (select coalesce(sum(quantity),0) from local_production_entries where work_date >= date_trunc('month',current_date)::date and not is_reversed) production_quantity,
      (select coalesce(sum(value_delta),0) from local_inventory_movements) inventory_value,
      (select count(*)::int from local_payroll_runs) payroll_runs`);
    const row = rows[0] || {};
    res.json({
      totalCustomers: Number(row.total_customers || 0),
      monthlyCustomers: Number(row.monthly_customers || 0),
      totalOrders: Number(row.total_orders || 0),
      pendingOrders: Number(row.pending_orders || 0),
      monthlyOrders: Number(row.monthly_orders || 0),
      totalRevenue: Number(row.total_revenue || 0),
      monthlyRevenue: Number(row.monthly_revenue || 0),
      previousMonthRevenue: Number(row.previous_month_revenue || 0),
      totalQuotes: Number(row.total_quotes || 0),
      approvedQuotes: Number(row.approved_quotes || 0),
      totalProducts: Number(row.total_products || 0),
      totalContracts: Number(row.total_contracts || 0),
      monthlyExpenses: Number(row.monthly_expenses || 0),
      activeWorkers: Number(row.active_workers || 0),
      attendanceEntries: Number(row.attendance_entries || 0),
      productionQuantity: Number(row.production_quantity || 0),
      inventoryValue: Number(row.inventory_value || 0),
      payrollRuns: Number(row.payroll_runs || 0),
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/local-sync/runs", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "select id,source,mode,status,requested_tables,table_stats,error_count,started_at,completed_at from local_sync_runs order by started_at desc limit 25",
    );
    res.json(rows);
  } catch (error) {
    sendError(res, error);
  }
});

const startLocalIncrementalSync = async (trigger: "manual" | "scheduled") => {
  if (runtime.startupMode !== 'normal') {
    throw Object.assign(new Error("Đồng bộ Supabase chỉ được phép ở chế độ khởi động normal."), {
      status: 503,
    });
  }
  if (trigger === "scheduled" && !localSyncAutomaticEnabled) {
    return {
      started: false,
      disabled: true,
      message:
        "Tự động đồng bộ local đang tắt vì backend không ở chế độ local.",
    };
  }
  if (
    localSyncStartInFlight ||
    (localSyncProcess && localSyncProcess.exitCode === null)
  ) {
    throw Object.assign(new Error("Đang có một phiên đồng bộ khác chạy."), {
      status: 409,
    });
  }
  localSyncStartInFlight = true;
  try {
    const running = await pool.query(`
      select id,status,started_at
      from local_sync_runs
      where source='SUPABASE' and status='RUNNING' and started_at > now() - interval '2 hours'
      order by started_at desc limit 1`);
    if (running.rows[0]) {
      throw Object.assign(new Error("Đang có một phiên đồng bộ khác chạy."), {
        status: 409,
      });
    }
    const scriptPath = path.join(
      projectDirectory,
      "scripts",
      "sync-supabase-to-local.mjs",
    );
    const child = spawn(
      process.execPath,
      [scriptPath, "--apply", "--incremental"],
      {
        cwd: projectDirectory,
        env: process.env,
        stdio: "ignore",
        windowsHide: true,
      },
    );
    localSyncProcess = child;
    child.once("error", (error) => {
      console.error(`Local incremental sync process error (${trigger})`, error);
      if (localSyncProcess === child) localSyncProcess = null;
    });
    child.once("exit", (code, signal) => {
      if (code !== 0)
        console.error(
          `Local incremental sync exited (${trigger}): code=${code ?? "null"}, signal=${signal ?? "null"}`,
        );
      if (localSyncProcess === child) localSyncProcess = null;
    });
    child.unref();
    return {
      started: true,
      mode: "INCREMENTAL",
      trigger,
      message: "Đã bắt đầu đồng bộ Supabase → PostgreSQL local.",
    };
  } finally {
    localSyncStartInFlight = false;
  }
};

// Chạy đồng bộ tăng dần trong tiến trình nền để giao diện không phải giữ kết nối lâu.
// Script chỉ đọc Supabase và ghi vào PostgreSQL local; không có thao tác ghi ngược lên public.
app.post("/api/local-sync/start", async (_req, res) => {
  try {
    const result = await startLocalIncrementalSync("manual");
    res.status(202).json(result);
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/local-sync/snapshots", async (req, res) => {
  try {
    const table = String(req.query.table || "").trim();
    const params: unknown[] = [];
    const where = table ? "where source_table=$1" : "";
    if (table) params.push(table);
    const { rows } = await pool.query(
      `
      select source_table,
        count(*) filter (where not is_deleted)::int row_count,
        count(*) filter (where is_deleted)::int deleted_count,
        count(*)::int total_count,
        max(last_seen_at) last_seen_at
      from local_source_snapshots ${where}
      group by source_table order by source_table`,
      params,
    );
    res.json(rows);
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/local-snapshot/:table", async (req, res) => {
  try {
    const table = String(req.params.table || "").trim();
    if (!table) throw new Error("Thiếu tên bảng snapshot.");
    // Canonical quotes have dedicated scoped endpoints; raw snapshots may contain stale owners/receipts.
    if (['quotes','contracts','contract_templates','einvoices'].includes(table)) return res.status(403).json({ message: 'Vui lòng dùng API chứng từ có kiểm soát quyền.' });
    if (table === 'user_roles' && !['admin','manager'].includes(currentLocalRole())) {
      const roles = await pool.query('select id,user_id,role,assigned_by,is_active from local_user_roles where user_id=$1 and is_active', [localActor(req)]);
      return res.json({ table, rows: roles.rows.map(payload => ({ source_key: payload.id, payload })), total: roles.rows.length, limit: 100, offset: 0 });
    }
    if (
      [
        "profiles",
        "user_roles",
        "employee_permissions",
        "password_reset_logs",
        "ai_config",
      ].includes(table) &&
      !["admin", "manager"].includes(currentLocalRole())
    ) {
      return res
        .status(403)
        .json({ message: "Bạn không có quyền xem snapshot nhạy cảm." });
    }
    const search = String(req.query.search || "").trim();
    const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 100);
    const offset = Math.max(Number(req.query.offset || 0), 0);
    const params = [table, search];
    const filter =
      "source='SUPABASE' and source_table=$1 and not is_deleted and ($2='' or payload::text ilike '%' || $2 || '%')";
    const [rowsResult, countResult] = await Promise.all([
      pool.query(
        `with merged as (
        select c.record_id source_key, c.updated_at source_updated_at, c.updated_at last_seen_at, c.payload
        from local_compat_records c where c.table_name=$1 and not c.is_deleted and ($2='' or c.payload::text ilike '%' || $2 || '%')
        union all
        select s.source_key, s.source_updated_at, s.last_seen_at, s.payload
        from local_source_snapshots s where ${filter}
          and not exists (select 1 from local_compat_records c where c.table_name=$1 and c.record_id=s.source_key)
      ) select source_key, source_updated_at, last_seen_at, payload from merged order by last_seen_at desc limit $3 offset $4`,
        [...params, limit, offset],
      ),
      pool.query(
        `select (select count(*) from local_compat_records c where c.table_name=$1 and not c.is_deleted and ($2='' or c.payload::text ilike '%' || $2 || '%')) + (select count(*) from local_source_snapshots s where ${filter} and not exists (select 1 from local_compat_records c where c.table_name=$1 and c.record_id=s.source_key)) count`,
        params,
      ),
    ]);
    res.json({
      table,
      rows: rowsResult.rows,
      total: countResult.rows[0]?.count || 0,
      limit,
      offset,
    });
  } catch (error) {
    sendError(res, error);
  }
});

// Compatibility RPCs for legacy screens that still use supabase.rpc().
// These queries are intentionally read-only and operate only on canonical local tables.
app.post("/api/local-rpc/:name", async (req, res) => {
  try {
    const name = String(req.params.name || "");
    const args = req.body || {};
    if (name === "get_dashboard_revenue") {
      const values: unknown[] = [];
      const clauses = ["status in ('delivered','self_delivered')"];
      if (args.p_from) {
        values.push(args.p_from);
        clauses.push(`created_at >= $${values.length}`);
      }
      if (args.p_to) {
        values.push(args.p_to);
        clauses.push(`created_at < $${values.length}`);
      }
      const { rows } = await pool.query(
        `select coalesce(sum(total_amount),0)::numeric revenue from local_orders where ${clauses.join(" and ")}`,
        values,
      );
      return res.json({
        data: Number(rows[0]?.revenue || 0),
        local_only: true,
      });
    }
    if (name === "get_order_stats") {
      const values: unknown[] = [];
      const where = ["1=1"];
      if (args.p_manager_id) {
        values.push(String(args.p_manager_id));
        where.push(`manager_id=$${values.length}`);
      }
      const { rows } = await pool.query(
        `with scoped_orders as(select o.* from local_orders o where ${where.join(" and ")} and not exists(select 1 from local_projection_tombstones t where t.source_table='orders' and t.source_key=o.id)) ${orderFinancialCtes(orderFinancialSchema)} select bool_or(finance_incomplete) finance_incomplete,
        count(*)::int total,
        count(*) filter (where status='pending')::int pending_count,
        count(*) filter (where status='processing')::int processing_count,
        count(*) filter (where status in ('delivered','self_delivered'))::int completed_count,
        count(*) filter (where status not in ('delivered','self_delivered','shipped','cancelled','returned') and coalesce(delivery_date,created_at + interval '6 days') < now())::int overdue_count,
        coalesce(sum(remaining_amount) filter (where status<>'cancelled'),0)::numeric total_receivable,
        coalesce(sum(total_amount-return_credit) filter (where status in ('delivered','self_delivered')),0)::numeric total_value
        from financial_orders`,
        values,
      );
      if(rows[0]?.finance_incomplete)throw Object.assign(new Error('Sổ thu/hoàn/trả chưa khớp; cần đối chiếu trước khi tổng hợp.'),{status:503,code:'DATA_INCOMPLETE'});
      return res.json({ data: rows[0] || {}, local_only: true });
    }
    if (name === "get_quote_stats") {
      const values: unknown[] = [];
      const where = ["1=1"];
      const scope = await quoteOwnerScope(pool, currentLocalActor(), currentLocalRole(), args.p_manager_id);
      if (scope) {
        values.push(scope);
        where.push(`manager_id=$${values.length}`);
      }
      const { rows } = await pool.query(
        `select count(*)::int total,
        count(*) filter (where status='sent')::int sent_count,
        count(*) filter (where status='approved')::int approved_count,
        coalesce(sum(total_amount) filter (where status='approved'),0)::numeric approved_value
        from local_quotes where ${where.join(" and ")}`,
        values,
      );
      const row = rows[0] || {};
      return res.json({
        data: {
          total: Number(row.total || 0),
          sent: Number(row.sent_count || 0),
          approved: Number(row.approved_count || 0),
          total_value: asNumber(row.approved_value),
        },
        local_only: true,
      });
    }
    if (name === "get_duplicate_display_order_numbers") {
      const { rows } =
        await pool.query(`select display_order_number display_number,count(*)::int dup_count
        from local_orders where display_order_number is not null and display_order_number <> ''
        group by display_order_number having count(*) > 1 order by display_order_number`);
      return res.json({ data: rows, local_only: true });
    }
    if (name === "list_inventory_warehouses") {
      const { rows } = await pool.query(
        "select id,name,address,warehouse_type from local_inventory_warehouses where is_active order by name",
      );
      return res.json({ data: rows, local_only: true });
    }
    if (name === "get_inventory_dashboard_summary") {
      const balances = await localInventoryBalances();
      const [items, drafts, warehouses] = await Promise.all([
        pool.query(
          "select count(*)::int count from local_inventory_items where is_active",
        ),
        pool.query(
          "select count(*)::int count from local_inventory_documents where status='DRAFT'",
        ),
        pool.query(
          "select count(*)::int count from local_inventory_warehouses where is_active",
        ),
      ]);
      return res.json({
        data: [
          {
            active_item_count: Number(items.rows[0]?.count || 0),
            stocked_balance_count: balances.filter(
              (row) => Number(row.quantity_on_hand || 0) !== 0,
            ).length,
            draft_document_count: Number(drafts.rows[0]?.count || 0),
            warehouse_count: Number(warehouses.rows[0]?.count || 0),
            total_inventory_value: balances.reduce(
              (sum, row) => sum + Number(row.inventory_value || 0),
              0,
            ),
          },
        ],
        local_only: true,
      });
    }
    if (name === "list_inventory_balances") {
      const balances = await localInventoryBalances();
      const [items, warehouses] = await Promise.all([
        pool.query("select * from local_inventory_items"),
        pool.query("select * from local_inventory_warehouses"),
      ]);
      const itemMap = new Map(items.rows.map((row) => [row.id, row]));
      const warehouseMap = new Map(warehouses.rows.map((row) => [row.id, row]));
      return res.json({
        data: balances
          .map((row) =>
            localInventoryBalanceRow(
              row,
              itemMap.get(row.inventory_item_id),
              warehouseMap.get(row.warehouse_id),
            ),
          )
          .filter(Boolean),
        local_only: true,
      });
    }
    if (name === "list_inventory_documents") {
      const limit = Math.min(Math.max(Number(args.p_limit || 200), 1), 1000);
      const { rows } = await pool.query(
        "select * from local_inventory_documents order by transaction_at desc nulls last,created_at desc limit $1",
        [limit],
      );
      return res.json({ data: rows, local_only: true });
    }
    if (name === "list_inventory_movements") {
      const limit = Math.min(Math.max(Number(args.p_limit || 300), 1), 1000);
      const values: unknown[] = [limit];
      const where = args.p_inventory_item_id
        ? "where m.inventory_item_id=$2"
        : "";
      if (args.p_inventory_item_id)
        values.push(String(args.p_inventory_item_id));
      const { rows } = await pool.query(
        `select m.*,d.document_number,i.code item_code,i.name item_name,w.name warehouse_name
        from local_inventory_movements m join local_inventory_documents d on d.id=m.document_id
        join local_inventory_items i on i.id=m.inventory_item_id join local_inventory_warehouses w on w.id=m.warehouse_id
        ${where} order by m.transaction_at desc,m.movement_sequence desc limit $1`,
        values,
      );
      return res.json({ data: rows, local_only: true });
    }
    if (name === "list_inventory_audit_events") {
      const limit = Math.min(Math.max(Number(args.p_limit || 300), 1), 1000);
      const { rows } = await pool.query(
        "select * from local_inventory_audit_events order by created_at desc limit $1",
        [limit],
      );
      return res.json({ data: rows, local_only: true });
    }
    if (name === "list_inventory_return_sources") {
      const { rows } = await pool.query(`
        with outbound as (
          select m.id,m.document_id,d.document_number,m.inventory_item_id,m.warehouse_id,m.movement_kind,
            abs(m.quantity_delta)::numeric original_quantity,m.unit,m.transaction_at
          from local_inventory_movements m join local_inventory_documents d on d.id=m.document_id
          where m.quantity_delta < 0 and m.movement_kind in ('ISSUE','TRANSFER_OUT','ADJUSTMENT_OUT')
        ), returned as (
          select source_movement_id,sum(abs(quantity_delta))::numeric returned_quantity
          from local_inventory_movements where source_movement_id is not null and quantity_delta > 0
          group by source_movement_id
        )
        select o.id,o.document_number,o.inventory_item_id,o.warehouse_id,null::uuid location_id,o.movement_kind,
          o.original_quantity,coalesce(r.returned_quantity,0)::numeric returned_quantity,
          greatest(o.original_quantity-coalesce(r.returned_quantity,0),0)::numeric remaining_quantity,o.unit,o.transaction_at
        from outbound o left join returned r on r.source_movement_id=o.id
        where o.original_quantity-coalesce(r.returned_quantity,0) > 0
        order by o.transaction_at desc`);
      return res.json({
        data: rows.map((row) =>
          Object.fromEntries(
            Object.entries(row).map(([key, value]) => [
              key,
              [
                "original_quantity",
                "returned_quantity",
                "remaining_quantity",
              ].includes(key)
                ? asNumber(value)
                : value,
            ]),
          ),
        ),
        local_only: true,
      });
    }
    if (name === "list_production_orders_for_issue") {
      const { rows } = await pool.query(
        "select o.id,o.production_order_number,o.production_batch_number,o.product_id,p.name product_name,o.quantity_planned,o.status from local_production_orders o left join local_products p on p.id=o.product_id where o.status in ('RELEASED','IN_PROGRESS') order by o.created_at desc",
      );
      return res.json({ data: rows, local_only: true });
    }
    if (name === "get_products_catalog") {
      // Compatibility for legacy product/quote screens. Keep the same public
      // shape as the Supabase RPC while resolving rows from canonical local SQL.
      const priceListId = args._price_list_id
        ? String(args._price_list_id)
        : null;
      const search = args._search ? `%${String(args._search).trim()}%` : null;
      const category = args._category ? String(args._category) : null;
      const inStock =
        args._in_stock === null || args._in_stock === undefined
          ? null
          : Boolean(args._in_stock);
      const limit = Math.min(Math.max(Number(args._limit || 100), 1), 10000);
      const offset = Math.max(Number(args._offset || 0), 0);
      const values: unknown[] = [];
      const where: string[] = ["p.is_active = true"];
      if (priceListId) {
        values.push(priceListId);
        where.push(`p.price_list_id = $${values.length}`);
      }
      if (search) {
        values.push(search);
        where.push(
          `(p.name ilike $${values.length} or p.sku ilike $${values.length} or coalesce(p.description, '') ilike $${values.length})`,
        );
      }
      if (category) {
        values.push(category);
        where.push(`p.category = $${values.length}`);
      }
      if (inStock !== null) {
        values.push(inStock);
        where.push(`p.in_stock = $${values.length}`);
      }
      values.push(limit, offset);
      const { rows } = await pool.query(
        `
        select p.id,p.name,p.description,p.price,p.sku,p.category,p.specifications,
          p.in_stock,p.price_list_id,count(*) over()::int total_count
        from local_products p
        where ${where.join(" and ")}
        order by p.category nulls last,p.sku nulls last,p.name
        limit $${values.length - 1} offset $${values.length}`,
        values,
      );
      return res.json({
        data: rows.map((row) => ({ ...row, price: asNumber(row.price) })),
        local_only: true,
      });
    }
    if (name === "get_products_cost_prices") {
      const ids = Array.isArray(args._ids)
        ? args._ids.map(String).filter(Boolean)
        : [];
      if (!ids.length) return res.json({ data: [], local_only: true });
      const { rows } = await pool.query(
        "select id,cost_price from local_products where id = any($1::uuid[])",
        [ids],
      );
      return res.json({
        data: rows.map((row) => ({
          id: row.id,
          cost_price: asNumber(row.cost_price),
        })),
        local_only: true,
      });
    }
    return res.status(501).json({
      message: `Local RPC chưa triển khai: ${name}`,
      local_only: true,
    });
  } catch (error) {
    sendError(res, error);
  }
});

// Natural-key deletes are used by legacy settings screens (for example
// ai_config.config_key). Resolve source snapshot keys first so a local
// tombstone hides the immutable source row without modifying that snapshot.
app.delete("/api/local-table/:table/by-key/:key", async (req, res) => {
  try {
    const table = String(req.params.table || "").trim();
    const key = String(req.params.key || "");
    const naturalKey =
      table === "ai_config"
        ? "config_key"
        : table === "ai_settings"
          ? "setting_name"
          : "";
    if (!naturalKey || !key)
      throw new Error("Khóa dữ liệu local không hợp lệ.");
    if (
      table === "ai_config" &&
      currentLocalRole() !== 'admin'
    ) {
      return res
        .status(403)
        .json({ message: "Chỉ quản trị được sửa cấu hình AI chung." });
    }
    const params: unknown[] = [table, naturalKey, key];
    const ownerClause =
      table === "ai_settings" ? " and payload->>'user_id'=$4" : "";
    if (table === "ai_settings") params.push(localActor(req));
    const snapshots = await pool.query(
      `select source_key from local_source_snapshots where source='SUPABASE' and source_table=$1 and not is_deleted and payload->>$2=$3${ownerClause}`,
      params,
    );
    let deleted = 0;
    for (const row of snapshots.rows) {
      await pool.query(
        `insert into local_compat_records(table_name,record_id,payload,is_deleted,updated_at)
         values($1,$2,'{}'::jsonb,true,now())
         on conflict(table_name,record_id) do update set is_deleted=true,updated_at=now()`,
        [table, row.source_key],
      );
      deleted += 1;
    }
    const compat = await pool.query(
      `update local_compat_records set is_deleted=true,updated_at=now()
       where table_name=$1 and not is_deleted and payload->>$2=$3${ownerClause}
       returning record_id`,
      params,
    );
    deleted += compat.rowCount || 0;
    res.json({ deleted, key, local_only: true });
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/local-table/:table", async (req, res) => {
  try {
    const table = String(req.params.table || "").trim();
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(table))
      throw new Error("Tên bảng local không hợp lệ.");
    const values = Array.isArray(req.body) ? req.body : [req.body];
    const rows = [];
    for (const value of values) {
      const payload =
        value && typeof value === "object"
          ? { ...(value as Record<string, unknown>) }
          : {};
      let id = String(payload.id || randomUUID());
      if (table === "ai_config" || table === "ai_settings") {
        if (
          table === "ai_config" &&
          currentLocalRole() !== 'admin'
        ) {
          return res.status(403).json({
            message: "Chỉ quản trị được thiết lập cấu hình AI chung.",
          });
        }
        if (table === "ai_settings") payload.user_id = localActor(req);
        const naturalKey =
          table === "ai_config" ? "config_key" : "setting_name";
        if (!String(payload[naturalKey] || "").trim())
          throw new Error("Thiếu khóa cấu hình AI.");
        const existing = await pool.query(
          `
          select record_id id from local_compat_records
          where table_name=$1 and payload->>$2=$3 and ($1='ai_config' or payload->>'user_id'=$4)
          union all
          select source_key id from local_source_snapshots
          where source='SUPABASE' and source_table=$1 and payload->>$2=$3
            and ($1='ai_config' or payload->>'user_id'=$4)
          limit 1`,
          [table, naturalKey, String(payload[naturalKey]), localActor(req)],
        );
        id = String(
          existing.rows[0]?.id ||
            (table === "ai_config"
              ? `config:${payload.config_key}`
              : `setting:${localActor(req)}:${payload.setting_name}`),
        );
      }
      payload.id = id;
      const result = await pool.query(
        `insert into local_compat_records(table_name,record_id,payload,is_deleted,updated_at) values($1,$2,$3::jsonb,false,now()) on conflict(table_name,record_id) do update set payload=excluded.payload,is_deleted=false,updated_at=now() returning payload`,
        [table, id, JSON.stringify(payload)],
      );
      rows.push(result.rows[0].payload);
    }
    res.status(201).json(rows);
  } catch (error) {
    sendError(res, error);
  }
});

app.patch("/api/local-table/:table/:id", async (req, res) => {
  try {
    const table = String(req.params.table || "").trim();
    if(table==='ai_config'&&currentLocalRole()!=='admin')return res.status(403).json({message:'Chỉ quản trị viên được sửa cấu hình AI chung.'});
    const id = String(req.params.id || "").trim();
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(table) || !id)
      throw new Error("Bản ghi local không hợp lệ.");
    if (
      [
        "ai_config",
        "profiles",
        "user_roles",
        "employee_permissions",
        "password_reset_logs",
      ].includes(table) &&
      !["admin", "manager"].includes(currentLocalRole())
    ) {
      return res
        .status(403)
        .json({ message: "Bạn không có quyền sửa dữ liệu nhạy cảm." });
    }
    if (table === "ai_settings") {
      const existing = await pool.query(
        "select payload from local_compat_records where table_name=$1 and record_id=$2",
        [table, id],
      );
      const owner = existing.rows[0]?.payload?.user_id;
      if (owner && String(owner) !== localActor(req))
        return res
          .status(403)
          .json({ message: "Bạn chỉ được sửa cài đặt AI của mình." });
      req.body = { ...(req.body || {}), user_id: localActor(req) };
    }
    const existing = await pool.query(
      `select payload from local_compat_records where table_name=$1 and record_id=$2`,
      [table, id],
    );
    const snapshot = existing.rows[0]
      ? { rows: [] }
      : await pool.query(
          `select payload from local_source_snapshots where source='SUPABASE' and source_table=$1 and source_key=$2 and not is_deleted limit 1`,
          [table, id],
        );
    const payload = {
      ...(snapshot.rows[0]?.payload || {}),
      ...(existing.rows[0]?.payload || {}),
      ...(req.body || {}),
      id,
    };
    const result = await pool.query(
      `insert into local_compat_records(table_name,record_id,payload,is_deleted,updated_at) values($1,$2,$3::jsonb,false,now()) on conflict(table_name,record_id) do update set payload=excluded.payload,is_deleted=false,updated_at=now() returning payload`,
      [table, id, JSON.stringify(payload)],
    );
    res.json(result.rows[0].payload);
  } catch (error) {
    sendError(res, error);
  }
});

app.delete("/api/local-table/:table/:id", async (req, res) => {
  try {
    const table = String(req.params.table || "").trim();
    if(table==='ai_config'&&currentLocalRole()!=='admin')return res.status(403).json({message:'Chỉ quản trị viên được xóa cấu hình AI chung.'});
    const id = String(req.params.id || "").trim();
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(table) || !id)
      throw new Error("Bản ghi local không hợp lệ.");
    if (
      [
        "ai_config",
        "profiles",
        "user_roles",
        "employee_permissions",
        "password_reset_logs",
      ].includes(table) &&
      !["admin", "manager"].includes(currentLocalRole())
    ) {
      return res
        .status(403)
        .json({ message: "Bạn không có quyền xóa dữ liệu nhạy cảm." });
    }
    await pool.query(
      `insert into local_compat_records(table_name,record_id,payload,is_deleted,updated_at) values($1,$2,'{}'::jsonb,true,now()) on conflict(table_name,record_id) do update set is_deleted=true,updated_at=now()`,
      [table, id],
    );
    res.json({ id, deleted: true });
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/customers", async (req, res) => {
  try {
    const search = String(req.query.search || "")
      .trim()
      .toLowerCase();
    const includeInactive =
      String(req.query.includeInactive || "false") === "true";
    const { rows } = await pool.query(
      `
      select c.id, c.customer_code, c.name, c.email, c.phone, c.address, c.company, c.notes,
        c.phones, c.addresses, c.tags, c.auto_tags, c.current_status, c.last_care_date,
        c.assignee_id, c.manager_id, c.tenant_id, c.purchase_count, c.last_purchase_date,
        coalesce(order_stats.order_count, 0)::int order_count,
        coalesce(order_stats.total_spent, 0)::numeric total_spent,
        order_stats.last_purchase_date calculated_last_purchase_date,
        coalesce(quote_stats.quote_count, 0)::int quote_count,
        c.is_active, c.is_snapshot_record, c.created_at, c.updated_at
      from local_customers c
      left join (
        select customer_id, count(*) filter (where status is distinct from 'cancelled')::int order_count,
          coalesce(sum(o.total_amount-coalesce(credit.amount,0)) filter (where o.status is distinct from 'cancelled'), 0)::numeric total_spent,
          max(created_at) filter (where status is distinct from 'cancelled') last_purchase_date
        from local_orders o ${customerListCreditDerivedSql(orderFinancialSchema)} where not exists(select 1 from local_projection_tombstones t where t.source_table='orders' and t.source_key=o.id) group by customer_id
      ) order_stats on order_stats.customer_id = c.id
      left join (select customer_id, count(*)::int quote_count from local_quotes group by customer_id) quote_stats
        on quote_stats.customer_id = c.id
      where ($1 = '' or lower(coalesce(c.name, '')) like '%' || $1 || '%'
        or lower(coalesce(c.customer_code, '')) like '%' || $1 || '%'
        or lower(coalesce(c.company, '')) like '%' || $1 || '%'
        or lower(coalesce(c.email, '')) like '%' || $1 || '%'
        or coalesce(c.phone, '') like '%' || $1 || '%')
        and ($2 or c.is_active)
      order by c.created_at desc nulls last, c.name asc`,
      [search, includeInactive],
    );
    res.json(
      rows.map((row) => ({
        ...row,
        purchase_count: Number(row.order_count ?? row.purchase_count ?? 0),
        total_spent: asNumber(row.total_spent),
        last_purchase_date:
          row.calculated_last_purchase_date || row.last_purchase_date || null,
      })),
    );
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/customers/:id", async (req, res) => {
  try {
    const customerResult = await pool.query(
      "select * from local_customers c where id=$1 and is_active and not exists(select 1 from local_projection_tombstones t where t.source_table='customers' and t.source_key=c.id)",
      [req.params.id],
    );
    const customer = customerResult.rows[0];
    if (!customer)
      return res.status(404).json({ message: "Không tìm thấy khách hàng." });
    const quoteScope = await quoteOwnerScope(pool, currentLocalActor(), currentLocalRole());
    if(quoteScope&&customer.manager_id!==quoteScope&&!(await pool.query(`select 1 from local_orders o where customer_id=$1 and manager_id=$2 and ${customerOrderTenantPredicate} and not exists(select 1 from local_projection_tombstones t where t.source_table='orders' and t.source_key=o.id) limit 1`,[customer.id,quoteScope,customer.tenant_id])).rows[0])return res.status(404).json({message:'Không tìm thấy khách trong phạm vi phụ trách.'});
    const [orders, quotes] = await Promise.all([
      pool.query(
        `select * from local_orders o where customer_id=$1 and ($2='' or manager_id=$2) and ${customerOrderTenantPredicate} and not exists(select 1 from local_projection_tombstones t where t.source_table='orders' and t.source_key=o.id) order by created_at desc nulls last`,
        [req.params.id,quoteScope,customer.tenant_id],
      ),
      pool.query(
        "select * from local_quotes where customer_id=$1 and ($2='' or manager_id=$2) order by created_at desc nulls last",
        [req.params.id, quoteScope],
      ),
    ]);
    const orderIds = orders.rows.map((row) => row.id);
    const payments = orderIds.length
      ? await pool.query(
          "select * from local_order_payments where order_id = any($1::text[]) and not exists (select 1 from local_projection_tombstones t where t.source_table='order_payments' and t.source_key=local_order_payments.id) order by payment_date desc nulls last",
          [orderIds],
        )
      : { rows: [] };
    res.json({
      customer,
      orders: (await hydrateOrderFinancials(pool,orders.rows,orderFinancialSchema)).map(localOrderRow),
      quotes: quotes.rows.map(localQuoteRow),
      payments: payments.rows,
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/customers", async (req, res) => {
  try {
    const name = String(bodyValue(req.body, "name", "name") || "").trim();
    if (!name) throw new Error("Tên khách hàng là bắt buộc.");
    const { rows } = await pool.query(
      `
      insert into local_customers(customer_code,name,email,phone,address,company,notes,phones,addresses,tags,auto_tags,current_status,assignee_id,manager_id,tenant_id,is_snapshot_record,local_modified_at)
      values($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12,$13,$14,$15,false,now()) returning *`,
      [
        bodyValue(req.body, "customer_code", "customerCode") || null,
        name,
        bodyValue(req.body, "email", "email") || null,
        bodyValue(req.body, "phone", "phone") || null,
        bodyValue(req.body, "address", "address") || null,
        bodyValue(req.body, "company", "company") || null,
        bodyValue(req.body, "notes", "notes") || null,
        JSON.stringify(Array.isArray(req.body.phones) ? req.body.phones : []),
        JSON.stringify(
          Array.isArray(req.body.addresses) ? req.body.addresses : [],
        ),
        JSON.stringify(Array.isArray(req.body.tags) ? req.body.tags : []),
        JSON.stringify(
          Array.isArray(req.body.auto_tags) ? req.body.auto_tags : [],
        ),
        bodyValue(req.body, "current_status", "currentStatus") || "new",
        bodyValue(req.body, "assignee_id", "assigneeId") ?? null,
        bodyValue(req.body, "manager_id", "managerId") ?? null,
        "local-tenant",
      ],
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    sendError(res, error);
  }
});

app.patch("/api/customers/:id", async (req, res) => {
  try {
    const body = req.body || {};
    const has = (snake: string, camel = snake) =>
      Object.prototype.hasOwnProperty.call(body, snake) ||
      Object.prototype.hasOwnProperty.call(body, camel);
    const valueOf = (snake: string, camel = snake) =>
      Object.prototype.hasOwnProperty.call(body, snake)
        ? body[snake]
        : body[camel];
    const assignments: string[] = [];
    const values: unknown[] = [req.params.id];
    const textFields: Array<[string, string, string]> = [
      ["customer_code", "customer_code", "customerCode"],
      ["name", "name", "name"],
      ["email", "email", "email"],
      ["phone", "phone", "phone"],
      ["address", "address", "address"],
      ["company", "company", "company"],
      ["notes", "notes", "notes"],
      ["current_status", "current_status", "currentStatus"],
      ["assignee_id", "assignee_id", "assigneeId"],
      ["manager_id", "manager_id", "managerId"],
    ];
    for (const [column, snake, camel] of textFields) {
      if (!has(snake, camel)) continue;
      const value = valueOf(snake, camel);
      if (column === "name" && (value === null || !String(value).trim()))
        throw new Error("Tên khách hàng không được để trống.");
      values.push(
        value === undefined ? null : value === null ? null : String(value),
      );
      assignments.push(`${column}=$${values.length}`);
    }
    for (const [column, camel] of [
      ["phones", "phones"],
      ["addresses", "addresses"],
      ["tags", "tags"],
      ["auto_tags", "auto_tags"],
    ] as const) {
      if (!has(column, camel)) continue;
      const value = valueOf(column, camel);
      if (value !== null && !Array.isArray(value))
        throw new Error(`${column} phải là mảng.`);
      values.push(JSON.stringify(value === null ? [] : value));
      assignments.push(`${column}=$${values.length}::jsonb`);
    }
    if (has("is_active")) {
      if (body.is_active === null || typeof body.is_active !== "boolean")
        throw new Error("is_active phải là boolean.");
      values.push(body.is_active);
      assignments.push(`is_active=$${values.length}`);
    }
    if (has("last_care_date", "lastCareDate")) {
      const value = valueOf("last_care_date", "lastCareDate");
      values.push(value === null || value === "" ? null : value);
      assignments.push(`last_care_date=$${values.length}::timestamptz`);
    }
    if (!assignments.length)
      throw new Error("Không có dữ liệu khách hàng cần cập nhật.");
    assignments.push("local_modified_at=now()", "updated_at=now()");
    const { rows } = await pool.query(
      `update local_customers set ${assignments.join(",")} where id=$1 returning *`,
      values,
    );
    if (!rows[0])
      return res.status(404).json({ message: "Không tìm thấy khách hàng." });
    res.json(rows[0]);
  } catch (error) {
    sendError(res, error);
  }
});

app.delete("/api/customers/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "update local_customers set is_active=false,local_modified_at=now(),updated_at=now() where id=$1 returning id,is_active",
      [req.params.id],
    );
    if (!rows[0])
      return res.status(404).json({ message: "Không tìm thấy khách hàng." });
    res.json({ ...rows[0], archived: true });
  } catch (error) {
    sendError(res, error);
  }
});

const snapshotObject = (row: Record<string, unknown> | undefined) => {
  if (!row) return null;
  const payload = row.payload;
  return payload && typeof payload === "object" ? payload : null;
};

const parseJsonValue = (value: unknown, fallback: unknown) => {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const localQuoteRow = (row: Record<string, unknown>) => {
  const rawItems = parseJsonValue(row.items, []);
  const items = Array.isArray(rawItems) ? rawItems.map(item => item && typeof item === 'object'
    ? { ...item, quantity: Number(item.quantity), price: Number(item.price), total: Number(item.total) } : item) : rawItems;
  const quoteData = publicQuoteData(parseJsonValue(row.quote_data, null));
  const customer = row.customer_name
    ? {
        name: row.customer_name,
        email: row.customer_email,
        phone: row.customer_phone,
        address: row.customer_address,
        company: row.customer_company,
      }
    : null;
  const assignee = row.assignee_name ? { name: row.assignee_name } : null;
  return {
    ...row,
    items,
    quote_data: quoteData,
    customers: customer,
    assignees: assignee,
    total_amount: asNumber(row.total_amount),
    subtotal: asNumber(row.subtotal),
    vat_rate: asNumber(row.vat_rate),
    vat_amount: asNumber(row.vat_amount),
  };
};

const localOrderRow = (row: Record<string, unknown>) => {
  const items = parseJsonValue(row.items, []);
  const customer = row.customer_name
    ? {
        name: row.customer_name,
        email: row.customer_email,
        phone: row.customer_phone,
        company: row.customer_company,
        customer_code: row.customer_code,
        address: row.customer_address,
        addresses: row.customer_addresses || [],
      }
    : null;
  const assignee = row.assignee_name ? { name: row.assignee_name } : null;
  const payments = Array.isArray(row.order_payments)
    ? (row.order_payments as Array<Record<string, unknown>>)
    : [];
  const totalPaid = payments.reduce(
    (sum, payment) => sum + Number(payment.payment_amount || 0),
    0,
  );
  return {
    ...row,
    items,
    customers: customer,
    assignees: assignee,
    order_payments: payments,
    ...orderFinancialProjection(row,row.total_paid??totalPaid,row.refunded??0,row.return_credit??0),
    total_amount: asNumber(row.total_amount),
    subtotal: asNumber(row.subtotal),
    vat_rate: asNumber(row.vat_rate),
    vat_amount: asNumber(row.vat_amount),
  };
};

app.get("/api/quotes", async (req, res) => {
  try {
    const filters = normalizeQuoteFilters(req.query);
    const effectiveManagerId = await quoteOwnerScope(pool, currentLocalActor(), currentLocalRole(), req.query.managerId);
    const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 5000);
    const offset = Math.max(Number(req.query.offset || 0), 0);
    if (!Number.isInteger(limit) || !Number.isInteger(offset)) throw Object.assign(new Error('Phân trang không hợp lệ.'), { status: 400 });
    const membership = quoteFilterSql(filters, effectiveManagerId);
    const params = [...membership.values, limit, offset];
    const { rows } = await pool.query(
      `
      select q.*, c.name customer_name, c.email customer_email, c.phone customer_phone,
        c.address customer_address, c.company customer_company,
        assignee.payload->>'name' assignee_name
      from local_quotes q
      left join local_customers c on c.id=q.customer_id
      left join local_source_snapshots assignee
        on assignee.source='SUPABASE' and assignee.source_table='assignees'
        and assignee.source_key=q.assignee_id and not assignee.is_deleted
      where ${membership.where}
      order by q.created_at desc nulls last, q.id desc
      limit $${params.length - 1} offset $${params.length}`,
      params,
    );
    res.json(rows.map(localQuoteRow));
  } catch (error) {
    sendError(res, error);
  }
});

// Quote creation needs exact-owner customers, including when an employee has
// quotes permission without access to the general customer management screen.
app.get("/api/quotes/customer-suggestions", async (req, res) => {
  try {
    const actor = currentLocalActor(), role = currentLocalRole();
    let owner: string | null;
    const quoteId = String(req.query.quoteId || '').trim();
    if (quoteId) {
      const quote = (await pool.query('select manager_id from local_quotes where id=$1', [quoteId])).rows[0];
      if (!quote) return res.status(404).json({ message: 'Không tìm thấy báo giá.' });
      await requireQuoteScope(pool, actor, role, quote);
      owner = quote.manager_id ?? null;
    } else {
      owner = await quoteOwnerScope(pool, actor, role, req.query.managerId) || actor;
    }
    const search = quoteCustomerNameKey(String(req.query.search || '').slice(0, 200));
    if (search.length < 2) return res.json([]);
    const phone = quoteCustomerPhoneKey(search);
    const { rows } = await pool.query(`select id,name,phone,email,address,is_active from local_customers
      where manager_id is not distinct from $1 and (
        strpos(lower(btrim(regexp_replace(normalize(coalesce(name,''),NFC),'[[:space:]]+',' ','g'))),$2)>0 or
        strpos(lower(normalize(coalesce(email,''),NFC)),$2)>0 or
        strpos(lower(normalize(coalesce(address,''),NFC)),$2)>0 or
        ($3<>'' and strpos(case when regexp_replace(coalesce(phone,''),'[^0-9]','','g') ~ '^(84|0084)[0-9]{9,10}$'
          then '0'||regexp_replace(regexp_replace(coalesce(phone,''),'[^0-9]','','g'),'^(0084|84)','')
          else regexp_replace(coalesce(phone,''),'[^0-9]','','g') end,$3)>0))
      order by is_active desc,name,id limit 20`, [owner, search, phone]);
    res.json(rows.map(quoteCustomerCandidate));
  } catch (error) { sendError(res, error); }
});

app.post("/api/quotes", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const quoteNumber = String(req.body?.quote_number || "").trim();
    if (!quoteNumber) throw new Error("Số báo giá là bắt buộc.");
    assertQuoteStatus(req.body);
    const managerId = await quoteOwnerScope(client, currentLocalActor(), currentLocalRole(), req.body.manager_id) || currentLocalActor();
    const financial = canonicalQuote(req.body);
    const key = req.body.idempotency_key;
    if (key !== undefined && (typeof key !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)))
      throw Object.assign(new Error('Khóa thử lại báo giá không hợp lệ.'), { status: 400 });
    const fingerprint = createHash('sha256').update(stableQuoteFingerprint({ ...req.body, idempotency_key: undefined, manager_id: managerId, ...financial })).digest('hex');
    const quoteId = key ? (() => { const hex = createHash('sha256').update(`${currentLocalActor()}:${key}`).digest('hex'); return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`; })() : randomUUID();
    if (key) {
      await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [`quote-create:${quoteId}`]);
      const existing = (await client.query('select * from local_quotes where id=$1 for update', [quoteId])).rows[0];
      if (existing) {
        await requireQuoteScope(client, currentLocalActor(), currentLocalRole(), existing);
        const receipt = quoteObject(existing.quote_data).__local_create_receipt as { fingerprint?: string } | undefined;
        if (receipt?.fingerprint !== fingerprint) throw Object.assign(new Error('Khóa thử lại đã được dùng cho nội dung khác. Vui lòng mở báo giá đã tạo hoặc tạo bản nháp mới.'), { status: 409 });
        await client.query('commit');
        return res.status(200).json(localQuoteRow(existing));
      }
    }
    const customerId = await resolveQuoteCustomer(client, { ...req.body, manager_id: managerId });
    const { rows } = await client.query(
      `insert into local_quotes(
      id,customer_id,quote_number,manager_id,assignee_id,price_list_id,status,subtotal,vat_rate,vat_amount,total_amount,include_vat,items,quote_data,notes,created_at,updated_at,local_modified_at
    ) values($16,$1,$2,$3,$4,$5,coalesce($6,'draft'),$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14,coalesce($15::timestamptz,now()),now(),now()) returning *`,
      [
        customerId,
        quoteNumber,
        managerId,
        req.body.assignee_id || null,
        req.body.price_list_id || null,
        req.body.status || "draft",
        financial.subtotal,
        financial.vat_rate,
        financial.vat_amount,
        financial.total_amount,
        financial.include_vat,
        JSON.stringify(financial.items),
        JSON.stringify({ ...financial.quote_data, ...(key ? { __local_create_receipt: { fingerprint } } : {}) }),
        req.body.notes || null,
        req.body.created_at || null,
        quoteId,
      ],
    );
    await client.query("commit");
    res.status(201).json(localQuoteRow(rows[0]));
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    sendError(res, error);
  } finally {
    client.release();
  }
});

app.get("/api/quotes/stats", async (req, res) => {
  try {
    const filters = normalizeQuoteFilters(req.query);
    const effectiveManagerId = await quoteOwnerScope(pool, currentLocalActor(), currentLocalRole(), req.query.managerId);
    const membership = quoteFilterSql(filters, effectiveManagerId);
    const { rows } = await pool.query(
      `
      select count(*)::int total,
        count(*) filter (where status='draft')::int draft_count,
        count(*) filter (where status='sent')::int sent_count,
        count(*) filter (where status='approved')::int approved_count,
        count(*) filter (where status='rejected')::int rejected_count,
        coalesce(sum(total_amount) filter (where status='approved'),0)::numeric approved_value
      from local_quotes q where ${membership.where}`,
      membership.values,
    );
    res.json(
      rows[0] || {
        total: 0,
        draft_count: 0,
        sent_count: 0,
        approved_count: 0,
        rejected_count: 0,
        approved_value: 0,
      },
    );
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/quotes/:id/quote-data", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "select manager_id,quote_data from local_quotes where id=$1",
      [req.params.id],
    );
    if (!rows[0])
      return res.status(404).json({ message: "Không tìm thấy báo giá." });
    await requireQuoteScope(pool, currentLocalActor(), currentLocalRole(), rows[0]);
    res.json({ quote_data: publicQuoteData(rows[0].quote_data) });
  } catch (error) {
    sendError(res, error);
  }
});

app.patch("/api/quotes/:id", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const previous = (await client.query("select * from local_quotes where id=$1 for update", [req.params.id])).rows[0];
    if (!previous) throw Object.assign(new Error("Không tìm thấy báo giá."), { status: 404 });
    await requireQuoteScope(client, currentLocalActor(), currentLocalRole(), previous);
    if (previous.status === 'approved' || (await client.query('select 1 from local_orders where quote_id=$1 limit 1', [previous.id])).rowCount)
      throw Object.assign(new Error('Báo giá đã duyệt/liên kết đơn hàng không thể sửa. Hãy nhân bản thành bản nháp mới.'), { status: 409 });
    assertQuoteStatus(req.body);
    if (Object.prototype.hasOwnProperty.call(req.body, "manager_id") && req.body.manager_id !== previous.manager_id)
      throw Object.assign(new Error("Không thể đổi người quản lý khi sửa báo giá."), { status: 409 });
    const customerId = await resolveQuoteCustomer(client, req.body, previous);
    const previousData = quoteObject(previous.quote_data);
    const mergedData = { ...previousData, ...(req.body.quote_data !== undefined ? quoteObject(req.body.quote_data) : {}) };
    const financial = canonicalQuote({ ...previous, ...req.body, quote_data: mergedData });
    const body: Record<string, unknown> = { ...req.body, customer_id: customerId, ...financial,
      quote_data: { ...financial.quote_data, ...(previousData.__local_create_receipt ? { __local_create_receipt: previousData.__local_create_receipt } : {}) } };
    if ('quote_number' in req.body && (typeof req.body.quote_number !== 'string' || !req.body.quote_number.trim())) throw new Error('Số báo giá là bắt buộc.');
    const allowed = [
      "status",
      "quote_number",
      "notes",
      "items",
      "quote_data",
      "created_at",
      "total_amount",
      "subtotal",
      "vat_rate",
      "vat_amount",
      "include_vat",
      "manager_id",
      "assignee_id",
      "customer_id",
      "price_list_id",
    ];
    const fields = Object.keys(body).filter((key) =>
      allowed.includes(key),
    );
    if (!fields.length)
      throw new Error("Không có dữ liệu báo giá cần cập nhật.");
    const values: unknown[] = [req.params.id];
    const assignments = fields.map((field, index) => {
      const value = body[field];
      values.push(
        field === "items" || field === "quote_data"
          ? JSON.stringify(value)
          : value,
      );
      return `${field}=$${values.length}${field === "items" || field === "quote_data" ? "::jsonb" : ""}`;
    });
    values.push(true);
    const { rows } = await client.query(
      `update local_quotes set ${assignments.join(",")}, local_modified_at=now(), updated_at=now() where id=$1 returning *`,
      values.slice(0, -1),
    );
    if (!rows[0])
      return res.status(404).json({ message: "Không tìm thấy báo giá." });
    await client.query("commit");
    res.json(localQuoteRow(rows[0]));
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    sendError(res, error);
  } finally {
    client.release();
  }
});

app.post("/api/quotes/:id/approve", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const quoteResult = await client.query(
      "select * from local_quotes where id=$1 for update", [req.params.id],
    );
    const quote = quoteResult.rows[0];
    if (!quote) throw Object.assign(new Error("Không tìm thấy báo giá."), { status: 404 });
    await requireQuoteScope(client, currentLocalActor(), currentLocalRole(), quote);
    const financial = approvalFinancialSnapshot(quote);
    const customerId = await resolveQuoteCustomer(client, {}, quote, true);
    const existing = await client.query("select * from local_orders where quote_id=$1 order by created_at desc for update", [quote.id]);
    if (existing.rows.length > 1) throw Object.assign(new Error("Báo giá đã liên kết nhiều đơn hàng; vui lòng kiểm tra trước khi duyệt."), { status: 409 });
    if (existing.rows[0]) {
      const order = existing.rows[0];
      if ((order.manager_id ?? null) !== (quote.manager_id ?? null) || (order.customer_id && order.customer_id !== customerId))
        throw Object.assign(new Error("Liên kết khách hàng/người quản lý của đơn hàng không khớp báo giá."), { status: 409 });
      if (!order.customer_id) {
        const repaired = await client.query("update local_orders set customer_id=$2,local_modified_at=now(),updated_at=now() where id=$1 returning *", [order.id, customerId]);
        Object.assign(order, repaired.rows[0]);
      }
      const updated = await client.query("update local_quotes set customer_id=$2,status='approved',local_modified_at=now(),updated_at=now() where id=$1 returning *", [quote.id, customerId]);
      const payments = await client.query("select * from local_order_payments where order_id=$1", [order.id]);
      await client.query("commit");
      return res.json({ quote: localQuoteRow(updated.rows[0]), order: localOrderRow({ ...order, order_payments: payments.rows }), reused: true });
    }
    if (!['draft', 'sent'].includes(quote.status)) throw Object.assign(new Error('Báo giá không ở trạng thái chờ duyệt. Hãy nhân bản thành bản nháp mới.'), { status: 409 });
    const orderNumber = String(
      req.body?.order_number || `ORD-LOCAL-${Date.now()}`,
    );
    const orderResult = await client.query(
      `
      insert into local_orders(
        id,customer_id,order_number,display_order_number,manager_id,assignee_id,quote_id,
        status,payment_status,total_amount,items,notes,subtotal,vat_rate,vat_amount,include_vat,created_at,updated_at,local_modified_at
      ) values($1,$2,$3,$3,$4,$5,$6,'pending','unpaid',$7,$8::jsonb,$9,$10,$11,$12,$13,now(),now(),now())
      returning *
    `,
      [
        randomUUID(),
        customerId,
        orderNumber,
        quote.manager_id,
        quote.assignee_id || null,
        quote.id,
        financial.total_amount,
        JSON.stringify(financial.items),
        `Tạo từ báo giá ${quote.quote_number || quote.id}`,
        financial.subtotal,
        financial.vat_rate,
        financial.vat_amount,
        financial.include_vat,
      ],
    );
    const updatedQuote = await client.query(
      "update local_quotes set customer_id=$2,status='approved',local_modified_at=now(),updated_at=now() where id=$1 returning *",
      [req.params.id, customerId],
    );
    await client.query("commit");
    res.json({
      quote: localQuoteRow(updatedQuote.rows[0]),
      order: localOrderRow({ ...orderResult.rows[0], order_payments: [] }),
      reused: false,
    });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    sendError(res, error);
  } finally {
    client.release();
  }
});

app.delete("/api/quotes/:id", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const previous = (await client.query('select * from local_quotes where id=$1 for update', [req.params.id])).rows[0];
    if (!previous) throw Object.assign(new Error('Không tìm thấy báo giá.'), { status: 404 });
    await requireQuoteScope(client, currentLocalActor(), currentLocalRole(), previous);
    if (previous.status === 'approved' || (await client.query('select 1 from local_orders where quote_id=$1 limit 1', [previous.id])).rowCount)
      throw Object.assign(new Error('Không thể xóa báo giá đã duyệt/liên kết đơn hàng.'), { status: 409 });
    const { rows } = await client.query(
      "delete from local_quotes where id=$1 returning id",
      [req.params.id],
    );
    if (!rows[0])
      return res.status(404).json({ message: "Không tìm thấy báo giá." });
    await client.query('commit');
    res.json({ id: rows[0].id });
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    sendError(res, error);
  } finally {
    client.release();
  }
});

app.get("/api/orders", async (req, res) => {
  try {
    const search = String(req.query.search || "")
      .trim()
      .toLowerCase();
    const managerId = String(req.query.managerId || "").trim();
    const effectiveManagerId = managerId === "all" ? "" : managerId;
    const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 5000);
    const offset = Math.max(Number(req.query.offset || 0), 0);
    const params: unknown[] = [search, effectiveManagerId, limit, offset];
    const { rows } = await pool.query(
      `
      select o.*, quote_name.quote_customer_name, c.name customer_name, c.email customer_email, c.phone customer_phone,
        c.company customer_company, c.customer_code, c.address customer_address,
        c.addresses customer_addresses, assignee.payload->>'name' assignee_name
      from local_orders o
      left join local_customers c on c.id=o.customer_id
      left join lateral (
        select nullif(btrim(substring(q.notes from '(?m)^Khách hàng:[ \\t]*([^\\r\\n]+)')), '') quote_customer_name
        from local_quotes q where q.id=o.quote_id and q.manager_id is not distinct from o.manager_id and o.customer_id is null
      ) quote_name on true
      left join local_source_snapshots assignee
        on assignee.source='SUPABASE' and assignee.source_table='assignees'
        and assignee.source_key=o.assignee_id and not assignee.is_deleted
      where ($1='' or lower(coalesce(o.order_number,'')) like '%'||$1||'%' or lower(coalesce(o.display_order_number,'')) like '%'||$1||'%' or lower(coalesce(o.notes,'')) like '%'||$1||'%' or lower(coalesce(c.name,quote_name.quote_customer_name,'')) like '%'||$1||'%')
        and ($2='' or o.manager_id=$2) and not exists(select 1 from local_projection_tombstones t where t.source_table='orders' and t.source_key=o.id)
      order by o.created_at desc nulls last limit $3 offset $4`,
      params,
    );
    const ids = rows.map((row) => row.id);
    const payments = ids.length
      ? await pool.query(
          "select order_id,payment_amount,payment_date,payment_type,payment_method,installment_number,notes from local_order_payments where order_id=any($1::text[]) and not exists (select 1 from local_projection_tombstones t where t.source_table='order_payments' and t.source_key=local_order_payments.id) order by payment_date desc nulls last",
          [ids],
        )
      : { rows: [] };
    // Hydrate the compact order view in one bounded query.  The order detail
    // and inline editor use `order_id`; never rediscover these links by a
    // mutable display/order number.
    // Orders may be requested with managerId=all, but their tracking links are
    // still a separately scoped resource.  Use the same actor-derived policy as
    // tracking list/refresh, including tenant and order tombstones, in one batch.
    let trackingPrincipal: Awaited<ReturnType<typeof ghnPrincipal>> | null = null;
    if (ids.length) {
      try {
        trackingPrincipal = await ghnPrincipal(pool, currentLocalActor());
      } catch (error) {
        // Orders remains usable to readers without the GHN module.  This exact
        // authorization denial is the only soft failure: inactive/auth/database
        // failures must still surface rather than being mistaken for no links.
        const denied = error instanceof Error
          && Number((error as Error & { status?: unknown }).status) === 403
          && error.message === 'Bạn chưa được cấp quyền theo dõi GHN.';
        if (!denied) throw error;
      }
    }
    const tracking = ids.length && trackingPrincipal
      ? await pool.query(`select g.id,g.order_id,g.ghn_order_code from local_ghn_tracking g
          left join local_orders o on o.id=g.order_id
          where ${ghnVisibleSql} and g.order_id=any($3::text[])
          order by g.created_at,g.id`, [trackingPrincipal.role, trackingPrincipal.manager, ids])
      : { rows: [] };
    const byOrder = new Map<string, Array<Record<string, unknown>>>();
    payments.rows.forEach((payment) =>
      byOrder.set(payment.order_id, [
        ...(byOrder.get(payment.order_id) || []),
        { ...payment, payment_amount: asNumber(payment.payment_amount) },
      ]),
    );
    const trackingByOrder = new Map<string, Array<{ id: string; ghn_order_code: string }>>();
    tracking.rows.forEach((row) => trackingByOrder.set(String(row.order_id), [
      ...(trackingByOrder.get(String(row.order_id)) || []),
      { id: String(row.id), ghn_order_code: String(row.ghn_order_code) },
    ]));
    res.json(
      (await hydrateOrderFinancials(pool,rows,orderFinancialSchema)).map((row) =>
        localOrderRow({ ...row, order_payments: byOrder.get(row.id) || [], ghn_tracking: trackingByOrder.get(String(row.id)) || [] }),
      ),
    );
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/orders", async (req, res) => {
  try {
    const body = req.body || {};
    if ([body.quote_id, body.quoteId].some(value => value != null && String(value).trim())) throw Object.assign(new Error('Đơn từ báo giá phải được tạo bằng thao tác Duyệt báo giá.'), { status: 409 });
    const orderNumber = String(
      body.order_number || body.orderNumber || "",
    ).trim();
    if (!orderNumber) throw new Error("Số đơn hàng là bắt buộc.");
    const items = Array.isArray(body.items)
      ? body.items
      : parseJsonValue(body.items, []);
    const subtotal = Number(body.subtotal ?? body.total_amount ?? 0);
    const vatRate = Number(body.vat_rate ?? body.vatRate ?? 0);
    const vatAmount = Number(body.vat_amount ?? body.vatAmount ?? 0);
    const { rows } = await pool.query(
      `
      insert into local_orders(
        id,customer_id,order_number,display_order_number,manager_id,assignee_id,quote_id,
        status,payment_status,total_amount,cost_price,subtotal,vat_rate,vat_amount,include_vat,
        cost_price_source,cost_price_is_estimated,tenant_id,items,notes,delivery_date,
        created_at,updated_at,local_modified_at,is_snapshot_record
      ) values($1,$2,$3,$3,$4,$5,$6,coalesce($7,'pending'),coalesce($8,'pending'),$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19,$20,now(),now(),now(),false)
      returning *`,
      [
        randomUUID(),
        body.customer_id || body.customerId || null,
        orderNumber,
        body.manager_id || body.managerId || "local-admin",
        body.assignee_id || body.assigneeId || null,
        body.quote_id || body.quoteId || null,
        body.status || "pending",
        body.payment_status || body.paymentStatus || "pending",
        Number(body.total_amount || body.totalAmount || 0),
        Number(body.cost_price || body.costPrice || 0),
        subtotal,
        vatRate,
        vatAmount,
        Boolean(body.include_vat ?? body.includeVat),
        body.cost_price_source || body.costPriceSource || "historical",
        Boolean(body.cost_price_is_estimated ?? body.costPriceIsEstimated),
        body.tenant_id || body.tenantId || "local-tenant",
        JSON.stringify(items || []),
        body.notes || null,
        body.delivery_date || body.deliveryDate || null,
      ],
    );
    res.status(201).json(localOrderRow({ ...rows[0], order_payments: [] }));
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/orders/stats", async (req, res) => {
  try {
    const managerId = String(req.query.managerId || "").trim();
    const effectiveManagerId = managerId === "all" ? "" : managerId;
    const { rows } = await pool.query(`with scoped_orders as(select o.* from local_orders o where ($1='' or manager_id=$1) and not exists(select 1 from local_projection_tombstones t where t.source_table='orders' and t.source_key=o.id)) ${orderFinancialCtes(orderFinancialSchema)}
      select bool_or(finance_incomplete) finance_incomplete,count(*)::int total,count(*) filter(where status='pending')::int pending_count,count(*) filter(where status='processing')::int processing_count,count(*) filter(where status in ('delivered','self_delivered'))::int completed_count,coalesce(sum(total_amount-return_credit) filter(where status<>'cancelled'),0)::numeric total_value,coalesce(sum(remaining_amount) filter(where status<>'cancelled'),0)::numeric total_receivable from financial_orders`,[effectiveManagerId]);
    const row = rows[0] || {};
    if(row.finance_incomplete)throw Object.assign(new Error('Sổ thu/hoàn/trả chưa khớp; cần đối chiếu trước khi tổng hợp.'),{status:503,code:'DATA_INCOMPLETE'});
    res.json({
      total: Number(row.total || 0),
      pendingCount: Number(row.pending_count || 0),
      processingCount: Number(row.processing_count || 0),
      completedCount: Number(row.completed_count || 0),
      overdueCount: 0,
      totalReceivable: Number(row.total_receivable||0),
      totalValue: Number(row.total_value || 0),
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/orders/duplicates", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "select display_order_number display_number,count(*)::int dup_count from local_orders where display_order_number is not null and display_order_number<>'' group by display_order_number having count(*)>1 order by display_order_number",
    );
    res.json(rows);
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/orders/:id",async(req,res)=>{try{
 const owner=await quoteOwnerScope(pool,currentLocalActor(),currentLocalRole());
 const row=(await pool.query(`select o.*,c.name customer_name,c.email customer_email,c.phone customer_phone,c.company customer_company,c.customer_code,c.address customer_address,c.addresses customer_addresses,a.name assignee_name from local_orders o left join local_customers c on c.id=o.customer_id left join local_assignees a on a.id=o.assignee_id where o.id=$1 and ($2='' or o.manager_id=$2) and not exists(select 1 from local_projection_tombstones t where t.source_table='orders' and t.source_key=o.id)`,[req.params.id,owner])).rows[0];
 if(!row)return res.status(404).json({message:'Không tìm thấy đơn trong phạm vi phụ trách.'});
 const projected=(await hydrateOrderFinancials(pool,[row],orderFinancialSchema))[0];
 const payments=(await pool.query("select * from local_order_payments p where order_id=$1 and not exists(select 1 from local_projection_tombstones t where t.source_table='order_payments' and t.source_key=p.id)",[row.id])).rows;
 let tracking:unknown[]=[];try{const p=await ghnPrincipal(pool,currentLocalActor());tracking=(await pool.query(`select g.id,g.ghn_order_code from local_ghn_tracking g left join local_orders o on o.id=g.order_id where ${ghnVisibleSql} and g.order_id=$3`,[p.role,p.manager,row.id])).rows;}catch(e){if(Number((e as {status?:number}).status)!==403)throw e;}
 res.json(localOrderRow({...projected,order_payments:payments,ghn_tracking:tracking}));
 }catch(e){sendError(res,e);}});

app.patch("/api/orders/:id", async (req, res) => {
  try {
    const allowed = [
      "status",
      "payment_status",
      "payment_date",
      "delivery_date",
      "delivered_date",
      "notes",
      "display_order_number",
      "manager_id",
      "assignee_id",
    ];
    const fields = Object.keys(req.body || {}).filter((key) =>
      allowed.includes(key),
    );
    if (!fields.length)
      throw new Error("Không có dữ liệu đơn hàng cần cập nhật.");
    if (fields.some((field) => ["status", "manager_id", "assignee_id"].includes(field))) {
      const handoff = await pool.query("select 1 from local_production_sales_requests where order_id=$1 and status in ('SUBMITTED','ACCEPTED','ADJUSTMENT_REQUIRED') limit 1", [req.params.id]);
      if (handoff.rows[0]) throw Object.assign(new Error("Đơn đã bàn giao sản xuất. Hãy tạo yêu cầu điều chỉnh trước khi đổi trạng thái hoặc người phụ trách."), { status: 409 });
    }
    const values: unknown[] = [req.params.id];
    const assignments = fields.map((field) => {
      values.push(req.body[field]);
      return `${field}=$${values.length}`;
    });
    const { rows } = await pool.query(
      `update local_orders set ${assignments.join(",")}, updated_at=now(),local_modified_at=now() where id=$1 returning *`,
      values,
    );
    if (!rows[0])
      return res.status(404).json({ message: "Không tìm thấy đơn hàng." });
    res.json(localOrderRow((await hydrateOrderFinancials(pool,rows,orderFinancialSchema))[0]));
  } catch (error) {
    sendError(res, error);
  }
});

app.delete("/api/orders/:id", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const order = await client.query("select id from local_orders where id=$1 for update", [req.params.id]);
    if (!order.rows[0]) {
      await client.query("rollback");
      return res.status(404).json({ message: "Không tìm thấy đơn hàng." });
    }
    const handoff = await client.query("select 1 from local_production_sales_requests where order_id=$1 and status not in ('RETURNED','CANCELLED') limit 1", [req.params.id]);
    if (handoff.rows[0]) throw Object.assign(new Error("Đơn đã bàn giao sản xuất nên không thể xóa. Hãy hủy/điều chỉnh bàn giao trước."), { status: 409 });
    await client.query(
      `insert into local_projection_tombstones(source_table,source_key,tombstone_kind)
       select 'order_payments',id,'LOCAL' from local_order_payments where order_id=$1
       on conflict (source_table,source_key) do update set tombstone_kind='LOCAL',updated_at=now()`,
      [req.params.id],
    );
    await client.query(
      `insert into local_projection_tombstones(source_table,source_key,tombstone_kind)
       select 'transactions',id,'LOCAL' from local_transactions where order_id=$1
       on conflict (source_table,source_key) do update set tombstone_kind='LOCAL',updated_at=now()`,
      [req.params.id],
    );
    const deletedPayments = await client.query(
      "delete from local_order_payments where order_id=$1",
      [req.params.id],
    );
    await client.query("delete from local_transactions where order_id=$1", [
      req.params.id,
    ]);
    const { rows } = await client.query(
      "delete from local_orders where id=$1 returning id",
      [req.params.id],
    );
    if (!rows[0]) {
      await client.query("rollback");
      return res.status(404).json({ message: "Không tìm thấy đơn hàng." });
    }
    await client.query("commit");
    res.json({
      id: rows[0].id,
      deleted_payments: deletedPayments.rowCount || 0,
    });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    sendError(res, error);
  } finally {
    client.release();
  }
});

const localContractRow = (row: Record<string, unknown>) => ({
  ...row,
  customers: row.customer_name
    ? {
        name: row.customer_name,
        email: row.customer_email,
        phone: row.customer_phone,
        address: row.customer_address,
        company: row.customer_company,
      }
    : null,
  assignees: row.assignee_name ? { name: row.assignee_name } : null,
  items: parseJsonValue(row.items, []),
  terms: parseJsonValue(row.terms, []),
  legal_basis: parseJsonValue(row.legal_basis, []),
  articles: parseJsonValue(row.articles, []),
  seller_info: parseJsonValue(row.seller_info, {}),
  buyer_info: parseJsonValue(row.buyer_info, {}),
  document_overrides: parseJsonValue(row.document_overrides, {}),
  total_amount: asNumber(row.total_amount),
  subtotal: asNumber(row.subtotal),
  vat_amount: asNumber(row.vat_amount),
  deposit_amount: asNumber(row.deposit_amount),
  vat_rate: asNumber(row.vat_rate),
  deposit_percentage: asNumber(row.deposit_percentage),
});

app.get("/api/quote-template-settings", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "select * from local_quote_template_settings where tenant_id='local-tenant' limit 1",
    );
    const row = rows[0];
    if (!row) return res.json(null);
    res.json({
      ...row,
      terms: parseJsonValue(row.terms, []),
      stamp_position: parseJsonValue(row.stamp_position, {}),
      signature_position: parseJsonValue(row.signature_position, {}),
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.put("/api/quote-template-settings", async (req, res) => {
  try {
    const body = req.body || {};
    if (!String(body.companyName || body.company_name || "").trim())
      throw new Error("Tên công ty là bắt buộc.");
    const { rows } = await pool.query(
      `
      insert into local_quote_template_settings(
        tenant_id,company_name,company_title,address,phone,tax_code,headquarters,bank_info,
        quote_title_color,company_title_color,logo_url,terms,footer_note,signature_url,stamp_url,
        stamp_position,signature_position,is_snapshot_record,local_modified_at,created_at,updated_at
      ) values('local-tenant',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15::jsonb,$16::jsonb,false,now(),now(),now())
      on conflict(tenant_id) do update set
        company_name=excluded.company_name,company_title=excluded.company_title,address=excluded.address,
        phone=excluded.phone,tax_code=excluded.tax_code,headquarters=excluded.headquarters,bank_info=excluded.bank_info,
        quote_title_color=excluded.quote_title_color,company_title_color=excluded.company_title_color,logo_url=excluded.logo_url,
        terms=excluded.terms,footer_note=excluded.footer_note,signature_url=excluded.signature_url,stamp_url=excluded.stamp_url,
        stamp_position=excluded.stamp_position,signature_position=excluded.signature_position,is_snapshot_record=false,
        local_modified_at=now(),updated_at=now()
      returning *`,
      [
        body.companyName ?? body.company_name,
        body.companyTitle ?? body.company_title ?? null,
        body.address ?? null,
        body.phone ?? null,
        body.taxCode ?? body.tax_code ?? null,
        body.headquarters ?? null,
        body.bankInfo ?? body.bank_info ?? null,
        body.quoteTitleColor ?? body.quote_title_color ?? null,
        body.companyTitleColor ?? body.company_title_color ?? null,
        body.logoUrl ?? body.logo_url ?? null,
        JSON.stringify(body.terms ?? []),
        body.footerNote ?? body.footer_note ?? null,
        body.signatureUrl ?? body.signature_url ?? null,
        body.stampUrl ?? body.stamp_url ?? null,
        JSON.stringify(body.stampPosition ?? body.stamp_position ?? {}),
        JSON.stringify(body.signaturePosition ?? body.signature_position ?? {}),
      ],
    );
    const row = rows[0];
    res.json({
      ...row,
      terms: parseJsonValue(row.terms, []),
      stamp_position: parseJsonValue(row.stamp_position, {}),
      signature_position: parseJsonValue(row.signature_position, {}),
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/expenses", async (req, res) => {
  try {
    const managerId = String(req.query.managerId || "").trim();
    const start = req.query.start
      ? new Date(String(req.query.start)).toISOString()
      : null;
    const end = req.query.end
      ? new Date(String(req.query.end)).toISOString()
      : null;
    const { rows } = await pool.query(
      "select * from local_expenses where ($1='' or manager_id=$1) and ($2::timestamptz is null or expense_date >= $2) and ($3::timestamptz is null or expense_date <= $3) order by expense_date desc",
      [managerId === "all" ? "" : managerId, start, end],
    );
    res.json(rows.map((row) => ({ ...row, amount: asNumber(row.amount) })));
  } catch (error) {
    sendError(res, error);
  }
});
app.post("/api/expenses", async (req, res) => {
  try {
    const b = req.body || {};
    const { rows } = await pool.query(
      "insert into local_expenses(id,amount,category,description,expense_date,person_name,expense_code,manager_id,tenant_id,is_snapshot_record,local_modified_at,created_at,updated_at) values(gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,'local-tenant',false,now(),now(),now()) returning *",
      [
        Number(b.amount || 0),
        b.category || "",
        b.description || "",
        b.expense_date || new Date().toISOString(),
        b.person_name || null,
        b.expense_code || `CP-${Date.now()}`,
        b.manager_id || "local-admin",
      ],
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    sendError(res, error);
  }
});
app.patch("/api/expenses/:id", async (req, res) => {
  try {
    const allowed = [
      "amount",
      "category",
      "description",
      "expense_date",
      "person_name",
      "expense_code",
      "manager_id",
    ];
    const fields = Object.keys(req.body || {}).filter((key) =>
      allowed.includes(key),
    );
    if (!fields.length)
      throw new Error("Không có dữ liệu chi phí cần cập nhật.");
    const values: unknown[] = [req.params.id];
    const assignments = fields.map((field) => {
      values.push(req.body[field]);
      return `${field}=$${values.length}`;
    });
    const { rows } = await pool.query(
      `update local_expenses set ${assignments.join(",")},local_modified_at=now(),updated_at=now() where id=$1 returning *`,
      values,
    );
    if (!rows[0])
      return res.status(404).json({ message: "Không tìm thấy chi phí." });
    res.json(rows[0]);
  } catch (error) {
    sendError(res, error);
  }
});
app.delete("/api/expenses/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "delete from local_expenses where id=$1 returning id",
      [req.params.id],
    );
    if (!rows[0])
      return res.status(404).json({ message: "Không tìm thấy chi phí." });
    res.json(rows[0]);
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/transactions", async (req, res) => {
  try {
    const managerId = String(req.query.managerId || "").trim();
    const orderId = String(req.query.orderId || "").trim();
    const search = String(req.query.search || "")
      .trim()
      .toLowerCase();
    const { rows } = await pool.query(
      "select * from local_transactions where not exists (select 1 from local_projection_tombstones t where t.source_table='transactions' and t.source_key=local_transactions.id) and ($1='' or manager_id=$1) and ($2='' or order_id=$2) and ($3='' or lower(coalesce(description,'')) like '%'||$3||'%' or lower(coalesce(category,'')) like '%'||$3||'%') order by date desc,created_at desc",
      [managerId === "all" ? "" : managerId, orderId, search],
    );
    res.json(
      rows.map((row) => ({
        ...row,
        amount: asNumber(row.amount),
        remaining_amount: asNumber(row.remaining_amount),
      })),
    );
  } catch (error) {
    sendError(res, error);
  }
});
app.post("/api/transactions", async (req, res) => {
  try {
    const b = req.body || {};
    const { rows } = await pool.query(
      "insert into local_transactions(id,amount,date,type,description,category,payment_type,order_id,installment_number,total_installments,remaining_amount,manager_id,tenant_id,is_snapshot_record,local_modified_at,created_at,updated_at) values(gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'local-tenant',false,now(),now(),now()) returning *",
      [
        Number(b.amount || 0),
        b.date || new Date().toISOString(),
        b.type || "",
        b.description || null,
        b.category || null,
        b.payment_type || null,
        b.order_id || null,
        b.installment_number ?? null,
        b.total_installments ?? null,
        b.remaining_amount ?? null,
        b.manager_id || "local-admin",
      ],
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    sendError(res, error);
  }
});
app.delete("/api/transactions/by-order/:orderId", async (req, res) => {
  try {
    await pool.query(
      `insert into local_projection_tombstones(source_table,source_key,tombstone_kind)
       select 'transactions',id,'LOCAL' from local_transactions where order_id=$1
       on conflict (source_table,source_key) do update set tombstone_kind='LOCAL',updated_at=now()`,
      [req.params.orderId],
    );
    const { rows } = await pool.query(
      "delete from local_transactions where order_id=$1 returning id",
      [req.params.orderId],
    );
    res.json({
      deleted: rows.length,
      ids: rows.map((row) => row.id),
      local_only: true,
    });
  } catch (error) {
    sendError(res, error);
  }
});
app.delete("/api/transactions/:id", async (req, res) => {
  try {
    const existing = await pool.query(
      "select id from local_transactions where id=$1",
      [req.params.id],
    );
    if (!existing.rows[0])
      return res.status(404).json({ message: "Không tìm thấy giao dịch." });
    await pool.query(
      `insert into local_projection_tombstones(source_table,source_key,tombstone_kind)
       values('transactions',$1,'LOCAL')
       on conflict (source_table,source_key) do update set tombstone_kind='LOCAL',updated_at=now()`,
      [req.params.id],
    );
    const { rows } = await pool.query(
      "delete from local_transactions where id=$1 returning id",
      [req.params.id],
    );
    res.json(rows[0]);
  } catch (error) {
    sendError(res, error);
  }
});
app.post("/api/order-payments",async(req,res)=>{
 const client=await pool.connect();try{
  const b=req.body||{},amount=Number(b.payment_amount);
  if(!Number.isSafeInteger(amount)||amount<=0)throw Object.assign(new Error('Số tiền VND phải nguyên và lớn hơn 0.'),{status:422});
  await client.query('begin');const row=(await client.query('select id,total_amount from local_orders where id=$1 for update',[b.order_id])).rows[0];if(!row)throw new Error('Không tìm thấy đơn hàng.');
  const before=(await hydrateOrderFinancials(client,[row],orderFinancialSchema))[0];if(amount>before.remaining_amount)throw Object.assign(new Error('Khoản thu vượt số còn phải thu.'),{status:422});
  const payment=(await client.query("insert into local_order_payments(id,order_id,payment_amount,payment_date,payment_type,payment_method,installment_number,notes,is_snapshot_record,local_modified_at,created_at,updated_at) values(gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,false,now(),now(),now()) returning *",[b.order_id,amount,b.payment_date||new Date().toISOString(),b.payment_type||null,b.payment_method||null,b.installment_number??null,b.notes||null])).rows[0];
  await recalculateLocalOrderPayment(client,String(b.order_id));await client.query('commit');res.status(201).json(payment);
 }catch(e){await client.query('rollback').catch(()=>undefined);sendError(res,e);}finally{client.release();}
});
app.get("/api/order-payments", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "select * from local_order_payments where not exists (select 1 from local_projection_tombstones t where t.source_table='order_payments' and t.source_key=local_order_payments.id) and ($1='' or order_id=$1) order by payment_date desc nulls last,id",
      [String(req.query.orderId || "")],
    );
    res.json(
      rows.map((row) => ({
        ...row,
        payment_amount: asNumber(row.payment_amount),
      })),
    );
  } catch (error) {
    sendError(res, error);
  }
});
// Local equivalent of the public payment_summary view. Keeping this as a
// derived read prevents the UI from depending on a Supabase view while the
// order/payment ledgers remain the single source of truth.
app.get("/api/order-payments/summary", async (_req, res) => {
  try {
    const scope=await quoteOwnerScope(pool,currentLocalActor(),currentLocalRole());
    const {rows}=await pool.query(`select o.*,o.id order_id,c.name customer_name,c.customer_code,o.payment_date final_payment_date from local_orders o left join local_customers c on c.id=o.customer_id where ($1='' or o.manager_id=$1) and not exists(select 1 from local_projection_tombstones t where t.source_table='orders' and t.source_key=o.id) order by o.created_at desc`,[scope]);
    const projected=await hydrateOrderFinancials(pool,rows,orderFinancialSchema);
    res.json(
      projected.map((row) => ({
        ...row,
        total_amount: asNumber(row.total_amount),
        total_paid: asNumber(row.total_paid),
        remaining_amount: asNumber(row.remaining_amount),
      })),
    );
  } catch (error) {
    sendError(res, error);
  }
});
app.post("/api/order-payments/record", async (req, res) => {
  const client = await pool.connect();
  try {
    const body = req.body || {};
    const payment = body;
    const transaction = body.transaction || {};
    const deduction = body.deduction || null;
    const orderId = String(payment.order_id || "").trim();
    if (!orderId) throw new Error("Thiếu đơn hàng cho khoản thanh toán.");
    const amount = Number(payment.payment_amount || 0);
    if (!(amount > 0)) throw new Error("Số tiền thanh toán phải lớn hơn 0.");
    await client.query("begin");
    const orderResult = await client.query(
      "select id,total_amount from local_orders where id=$1 for update",
      [orderId],
    );
    if (!orderResult.rows[0]) throw new Error("Không tìm thấy đơn hàng.");
    const financial=(await hydrateOrderFinancials(client,orderResult.rows,orderFinancialSchema))[0];
    const deductionAmount = Number(deduction?.amount || 0);
    for(const value of [amount,deductionAmount])if(!Number.isSafeInteger(value)||value<0)throw Object.assign(new Error('Số tiền VND phải nguyên, không âm.'),{status:422});
    const gross=amount;
    if(!Number.isSafeInteger(gross)||gross>financial.remaining_amount)throw Object.assign(new Error('Khoản thu vượt số tiền còn phải thu theo sổ gốc.'),{status:422});
    const receiptNotes=[payment.notes||'',deductionAmount>0?`Chi phí do bên bán chịu: ${deductionAmount} VND; khoản thu khách ${amount} VND được ghi độc lập.`:''].filter(Boolean).join('\n');
    const paymentResult = await client.query(
      `
      insert into local_order_payments(id,order_id,payment_amount,payment_date,payment_type,payment_method,installment_number,notes,is_snapshot_record,local_modified_at,created_at,updated_at)
      values(gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,false,now(),now(),now()) returning *`,
      [
        orderId,
        gross,
        payment.payment_date || new Date().toISOString(),
        payment.payment_type || null,
        payment.payment_method || null,
        payment.installment_number ?? null,
        receiptNotes || null,
      ],
    );
    const afterReceipt=(await hydrateOrderFinancials(client,orderResult.rows,orderFinancialSchema))[0],status=afterReceipt.payment_status;
    await client.query(
      `
      insert into local_transactions(id,amount,date,type,description,category,payment_type,order_id,installment_number,total_installments,remaining_amount,manager_id,tenant_id,is_snapshot_record,local_modified_at,created_at,updated_at)
      values(gen_random_uuid()::text,$1,$2,'income',$3,'order_payment',$4,$5,$6,$7,$8,$9,'local-tenant',false,now(),now(),now())`,
      [
        gross,
        payment.payment_date || new Date().toISOString(),
        transaction.description || `Thanh toán đơn hàng ${orderId}`,
        payment.payment_type || null,
        orderId,
        payment.installment_number ?? null,
        transaction.total_installments ?? 1,
        afterReceipt.remaining_amount,
        payment.manager_id || "local-admin",
      ],
    );
    if (deductionAmount > 0) {
      await client.query(
        `
        insert into local_expenses(id,amount,category,description,expense_date,expense_code,manager_id,tenant_id,is_snapshot_record,local_modified_at,created_at,updated_at)
        values(gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,'local-tenant',false,now(),now(),now())`,
        [
          deductionAmount,
          deduction.category || "shipping_fee",
          deduction.description || "Chi phí vận chuyển",
          deduction.expense_date ||
            payment.payment_date ||
            new Date().toISOString(),
          deduction.expense_code || null,
          deduction.manager_id || payment.manager_id || "local-admin",
        ],
      );
      await client.query(
        `
        insert into local_transactions(id,amount,date,type,description,category,order_id,remaining_amount,manager_id,tenant_id,is_snapshot_record,local_modified_at,created_at,updated_at)
        values(gen_random_uuid()::text,$1,$2,'expense',$3,$4,$5,0,$6,'local-tenant',false,now(),now(),now())`,
        [
          deductionAmount,
          deduction.expense_date ||
            payment.payment_date ||
            new Date().toISOString(),
          deduction.description || "Chi phí vận chuyển",
          deduction.category || "shipping_fee",
          orderId,
          deduction.manager_id || payment.manager_id || "local-admin",
        ],
      );
    }
    const orderUpdate = await client.query(
      "update local_orders set payment_status=$2,payment_date=$3,updated_at=now(),local_modified_at=now() where id=$1 returning *",
      [
        orderId,
        status,
        status === "paid"
          ? payment.payment_date || new Date().toISOString()
          : null,
      ],
    );
    const updatedFinancial=afterReceipt;
    await client.query("commit");
    res.status(201).json({
      payment: paymentResult.rows[0],
      order: localOrderRow({
        ...orderUpdate.rows[0],
        ...updatedFinancial,
        order_payments: [paymentResult.rows[0]],
      }),
      reused: false,
    });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    sendError(res, error);
  } finally {
    client.release();
  }
});
async function recalculateLocalOrderPayment(
  client: PoolClient,
  orderId: string,
) {
  const orderResult = await client.query(
    "select id,total_amount from local_orders where id=$1 for update",
    [orderId],
  );
  if (!orderResult.rows[0]) return null;
  const financial=(await hydrateOrderFinancials(client,orderResult.rows,orderFinancialSchema))[0];
  const status=financial.payment_status;
  const { rows } = await client.query(
    "update local_orders set payment_status=$2,payment_date=$3,updated_at=now(),local_modified_at=now() where id=$1 returning *",
    [
      orderId,
      status,
      status === "paid" ? financial.last_payment_date || null : null,
    ],
  );
  return rows[0] ? {...rows[0],...financial} : null;
}

app.delete("/api/order-payments/by-id/:id", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const lookup=(await client.query("select order_id from local_order_payments where id=$1",[req.params.id])).rows[0];
    if(lookup)await client.query("select id from local_orders where id=$1 for update",[lookup.order_id]);
    const paymentResult = await client.query(
      "select id,order_id,payment_amount,payment_date from local_order_payments where id=$1 for update",
      [req.params.id],
    );
    if (!paymentResult.rows[0]) {
      await client.query("rollback");
      return res
        .status(404)
        .json({ message: "Không tìm thấy khoản thanh toán." });
    }
    const payment = paymentResult.rows[0];
    await upsertLocalProjectionTombstone(
      client,
      "order_payments",
      String(payment.id),
    );
    await client.query("delete from local_order_payments where id=$1", [
      req.params.id,
    ]);
    const transactionResult = await client.query(
      `select id from local_transactions
       where order_id=$1 and category='order_payment' and amount=$2
         and date is not distinct from $3::timestamptz
       order by created_at desc nulls last limit 1`,
      [payment.order_id, payment.payment_amount, payment.payment_date],
    );
    if (transactionResult.rows[0]) {
      await upsertLocalProjectionTombstone(
        client,
        "transactions",
        String(transactionResult.rows[0].id),
      );
      await client.query("delete from local_transactions where id=$1", [
        transactionResult.rows[0].id,
      ]);
    }
    const order = await recalculateLocalOrderPayment(
      client,
      String(payment.order_id),
    );
    await client.query("commit");
    res.json({
      id: payment.id,
      order_id: payment.order_id,
      deleted: true,
      order: order ? localOrderRow(order) : null,
    });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    sendError(res, error);
  } finally {
    client.release();
  }
});

app.delete("/api/order-payments/:orderId", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select id from local_orders where id=$1 for update", [
      req.params.orderId,
    ]);
    const paymentRows = await client.query(
      "select id from local_order_payments where order_id=$1",
      [req.params.orderId],
    );
    const transactionRows = await client.query(
      "select id from local_transactions where order_id=$1 and category='order_payment'",
      [req.params.orderId],
    );
    await client.query(
      `insert into local_projection_tombstones(source_table,source_key,tombstone_kind)
       select 'order_payments',id,'LOCAL' from local_order_payments where order_id=$1
       on conflict (source_table,source_key) do update set tombstone_kind='LOCAL',updated_at=now()`,
      [req.params.orderId],
    );
    await client.query(
      `insert into local_projection_tombstones(source_table,source_key,tombstone_kind)
       select 'transactions',id,'LOCAL' from local_transactions where order_id=$1 and category='order_payment'
       on conflict (source_table,source_key) do update set tombstone_kind='LOCAL',updated_at=now()`,
      [req.params.orderId],
    );
    const paymentResult = await client.query(
      "delete from local_order_payments where order_id=$1 returning id",
      [req.params.orderId],
    );
    const transactionResult = await client.query(
      "delete from local_transactions where order_id=$1 and category='order_payment' returning id",
      [req.params.orderId],
    );
    const order = await recalculateLocalOrderPayment(
      client,
      req.params.orderId,
    );
    await client.query("commit");
    res.json({
      order_id: req.params.orderId,
      deleted: paymentResult.rows.length || paymentRows.rows.length,
      transaction_ids:
        transactionResult.rows.length > 0
          ? transactionResult.rows.map((row) => row.id)
          : transactionRows.rows.map((row) => row.id),
      order: order ? localOrderRow(order) : null,
    });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    sendError(res, error);
  } finally {
    client.release();
  }
});
app.get("/api/assignees", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "select * from local_assignees order by name",
    );
    res.json(rows);
  } catch (error) {
    sendError(res, error);
  }
});
app.post("/api/assignees", async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    if (!name) throw new Error("Tên người phụ trách là bắt buộc.");
    const { rows } = await pool.query(
      "insert into local_assignees(id,name,tenant_id,is_snapshot_record,local_modified_at,created_at,updated_at) values(gen_random_uuid()::text,$1,'local-tenant',false,now(),now(),now()) returning *",
      [name],
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    sendError(res, error);
  }
});
app.patch("/api/assignees/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "update local_assignees set name=$2,local_modified_at=now(),updated_at=now() where id=$1 returning *",
      [req.params.id, String(req.body?.name || "").trim()],
    );
    if (!rows[0])
      return res
        .status(404)
        .json({ message: "Không tìm thấy người phụ trách." });
    res.json(rows[0]);
  } catch (error) {
    sendError(res, error);
  }
});
app.delete("/api/assignees/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "delete from local_assignees where id=$1 returning id",
      [req.params.id],
    );
    if (!rows[0])
      return res
        .status(404)
        .json({ message: "Không tìm thấy người phụ trách." });
    res.json(rows[0]);
  } catch (error) {
    sendError(res, error);
  }
});

const localUserRow = (
  row: Record<string, unknown>,
  roles: Array<Record<string, unknown>> = [],
) => ({
  ...row,
  // Expose only whether a local password exists; never expose the hash.
  has_password: Boolean(row.has_password),
  user_roles: roles,
  local_read_only: false,
});

async function localUserDetails(userId: string) {
  const profile = await pool.query(
    `select id,user_id,email,first_name,last_name,phone,is_active,created_at,updated_at,
      (password_hash is not null and password_hash <> '') as has_password
    from local_user_profiles where user_id=$1`,
    [userId],
  );
  if (!profile.rows[0]) return null;
  const roles = await pool.query(
    `select role,assigned_by from local_user_roles where user_id=$1 and is_active order by role`,
    [userId],
  );
  return localUserRow(profile.rows[0], roles.rows);
}
async function assertManagedUser(client: Pick<PoolClient, 'query'>, userId: string, permissionTarget = false) {
  if(await isIntegrationServiceIdentity(client as PoolClient,userId))throw Object.assign(new Error('Danh tính dịch vụ chỉ được quản lý qua cấu hình kết nối Agent.'),{status:403});
  const { rows } = await client.query(`select role,assigned_by from local_user_roles where user_id=$1 and (is_active or $2='admin') order by is_active desc,case role when 'admin' then 1 when 'manager' then 2 when 'accountant' then 3 when 'team_leader' then 4 else 5 end limit 1`, [userId,currentLocalRole()]);
  const target = rows[0];
  if (!target || (permissionTarget && !['employee','accountant','team_leader'].includes(target.role))) throw Object.assign(new Error('Không thể cấu hình quyền cho tài khoản này.'), {status:403});
  if (currentLocalRole() !== 'admin' && !(currentLocalRole() === 'manager' && target.role === 'employee' && target.assigned_by === currentLocalActor())) throw Object.assign(new Error('Bạn chỉ được quản lý nhân viên được giao phụ trách.'), {status:403});
  return target;
}

app.get("/api/users", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      select p.id,p.user_id,p.email,p.first_name,p.last_name,p.phone,p.is_active,p.created_at,p.updated_at,
        (p.password_hash is not null and p.password_hash <> '') as has_password,
        coalesce(json_agg(json_build_object('role',r.role,'assigned_by',r.assigned_by)) filter (where r.id is not null),'[]'::json) user_roles,
        null::text manager_name, false as local_read_only
      from local_user_profiles p
      left join local_user_roles r on r.user_id=p.user_id and r.is_active
      where ($1='admin' or exists(select 1 from local_user_roles scoped where scoped.user_id=p.user_id and scoped.is_active and scoped.role='employee' and scoped.assigned_by=$2) and not exists(select 1 from local_user_roles elevated where elevated.user_id=p.user_id and elevated.is_active and elevated.role<>'employee'))
      group by p.id order by p.created_at desc nulls last,p.email asc`, [currentLocalRole(),currentLocalActor()]);
    res.json(rows);
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/users", async (req, res) => {
  const client = await pool.connect();
  try {
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();
    const password = String(req.body?.password || "");
    const firstName = String(
      (req.body?.firstName ?? req.body?.first_name) || "",
    ).trim();
    const lastName = String(
      (req.body?.lastName ?? req.body?.last_name) || "",
    ).trim();
    const phone = String(req.body?.phone || "").trim() || null;
    const role = String(req.body?.role || "employee");
    if (currentLocalRole() !== 'admin' && role !== 'employee') throw Object.assign(new Error('Quản lý chỉ được tạo tài khoản nhân viên.'), {status:403});
    if (!email || !email.includes("@"))
      throw new Error("Email người dùng không hợp lệ.");
    if (password.length < 6)
      throw new Error("Mật khẩu local phải có ít nhất 6 ký tự.");
    if (
      !["admin", "manager", "accountant", "employee", "team_leader"].includes(
        role,
      )
    )
      throw new Error("Vai trò không hợp lệ.");
    await client.query("begin");
    const existing = await client.query(
      "select user_id from local_user_profiles where lower(email)=lower($1)",
      [email],
    );
    if (existing.rows[0]) throw new Error("Email đã tồn tại trong local.");
    const userId = randomUUID();
    const passwordHash = hashLocalPassword(password);
    await client.query(
      `insert into local_user_profiles(id,user_id,email,first_name,last_name,phone,password_hash,is_snapshot_record,local_modified_at)
      values($1,$1,$2,$3,$4,$5,$6,false,now())`,
      [userId, email, firstName || null, lastName || null, phone, passwordHash],
    );
    await client.query(
      `insert into local_user_roles(user_id,role,assigned_by,is_snapshot_record,local_modified_at) values($1,$2,$3,false,now())`,
      [userId, role,currentLocalActor()],
    );
    await client.query("commit");
    res.status(201).json(await localUserDetails(userId));
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    sendError(res, error);
  } finally {
    client.release();
  }
});

app.patch("/api/users/:id", async (req, res) => {
  const client = await pool.connect();
  try {
    const userId = String(req.params.id);
    await client.query('begin');
    await client.query('select user_id from local_user_profiles where user_id=$1 for update', [userId]);
    const previousRole = await assertManagedUser(client, userId);
    if (currentLocalRole() !== 'admin' && req.body?.role && req.body.role !== 'employee') throw Object.assign(new Error('Quản lý không được thay đổi vai trò nhân viên.'), {status:403});
    const fields: string[] = [];
    const values: unknown[] = [];
    for (const [column, value] of [
      ["first_name", req.body?.first_name ?? req.body?.firstName],
      ["last_name", req.body?.last_name ?? req.body?.lastName],
      ["phone", req.body?.phone],
    ] as const) {
      if (value !== undefined) {
        values.push(value || null);
        fields.push(`${column}=$${values.length}`);
      }
    }
    if (req.body?.is_active !== undefined) {
      values.push(Boolean(req.body.is_active));
      fields.push(`is_active=$${values.length}`);
    }
    if (!fields.length && !req.body?.role) throw new Error("Không có thông tin cần cập nhật.");
    values.push(userId);
    const profile = await client.query(
      `update local_user_profiles set ${fields.length ? fields.join(',') + ',' : ''}local_modified_at=now(),updated_at=now() where user_id=$${values.length} returning user_id`,
      values,
    );
    if (!profile.rows[0]) throw Object.assign(new Error('Không tìm thấy người dùng local.'), {status:404});
    if (req.body?.role && (req.body.role !== previousRole.role || req.body?.is_active === true)) {
      const role = String(req.body.role);
      if (
        !["admin", "manager", "accountant", "employee", "team_leader"].includes(
          role,
        )
      )
        throw new Error("Vai trò không hợp lệ.");
      await client.query(
        "update local_user_roles set is_active=false,local_modified_at=now(),updated_at=now() where user_id=$1 and is_active",
        [userId],
      );
      await client.query(
        `insert into local_user_roles(user_id,role,assigned_by,is_snapshot_record,local_modified_at) values($1,$2,$3,false,now()) on conflict(user_id,role) do update set is_active=true,assigned_by=excluded.assigned_by,is_snapshot_record=false,local_modified_at=now(),updated_at=now()`,
        [userId, role,role === previousRole.role ? previousRole.assigned_by : currentLocalActor()],
      );
    }
    await client.query("insert into local_auth_audit_events(entity_type,entity_id,action,actor_id,reason) values('user_roles',$1,'UPDATE',$2,$3)", [userId,currentLocalActor(),'Cập nhật tài khoản và vai trò']);
    await client.query('commit');
    res.json(await localUserDetails(userId));
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    sendError(res, error);
  } finally { client.release(); }
});

app.delete("/api/users/:id", async (req, res) => {
  const client = await pool.connect();
  try {
    const userId = String(req.params.id);
    if (userId === "local-admin")
      throw new Error("Không thể xóa tài khoản local-admin.");
    await client.query('begin');
    await client.query('select user_id from local_user_profiles where user_id=$1 for update',[userId]);
    await assertManagedUser(client,userId);
    const { rows } = await client.query(
      "update local_user_profiles set is_active=false,local_modified_at=now(),updated_at=now() where user_id=$1 returning user_id",
      [userId],
    );
    if (!rows[0]) throw Object.assign(new Error('Không tìm thấy người dùng local.'), {status:404});
    await client.query(
      "update local_user_roles set is_active=false,local_modified_at=now(),updated_at=now() where user_id=$1",
      [userId],
    );
    await client.query("insert into local_auth_audit_events(entity_type,entity_id,action,actor_id,reason) values('user_roles',$1,'DELETE',$2,$3)", [userId,currentLocalActor(),'Ngừng tài khoản']);
    await client.query('commit');
    res.json({ user_id: userId, is_active: false });
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    sendError(res, error);
  } finally { client.release(); }
});
app.post("/api/users/:id/password", async (req, res) => {
  let client: PoolClient | undefined;
  let transactionOpen = false;
  try {
    const userId = String(req.params.id);
    if(await isIntegrationServiceIdentity(pool,userId))throw Object.assign(new Error('Danh tính dịch vụ không có mật khẩu hoặc phiên đăng nhập.'),{status:403});
    const next = String(req.body?.new_password || req.body?.newPassword || "");
    const current = req.body?.current_password || req.body?.currentPassword;
    if (next.length < 12 || next.length > 128 || !/[a-z]/.test(next) || !/[A-Z]/.test(next) || !/\d/.test(next) || !/[^a-zA-Z0-9\s]/.test(next))
      throw Object.assign(new Error("Mật khẩu mới cần 12–128 ký tự, có chữ hoa, chữ thường, số và ký tự đặc biệt."), { status: 400 });
    const actor = localActor(req);
    client = await pool.connect();
    await client.query('begin');
    transactionOpen = true;
    const profiles = (await client.query('select user_id,password_hash,is_active from local_user_profiles where user_id=any($1::text[]) order by user_id for update', [[actor,userId]])).rows;
    const target = profiles.find(row => row.user_id === userId);
    const actorProfile = profiles.find(row => row.user_id === actor);
    if (!target) throw Object.assign(new Error('Không tìm thấy người dùng local.'), { status: 404 });
    if (!actorProfile?.is_active) throw Object.assign(new Error('Tài khoản thực hiện không còn hoạt động.'), { status: 401 });
    const roleRows = (await client.query('select user_id,role,assigned_by from local_user_roles where user_id=any($1::text[]) and is_active order by user_id,role for share', [[actor,userId]])).rows;
    const actorRole = roleRows.some(row=>row.user_id===actor&&row.role==='admin') ? 'admin' : roleRows.some(row=>row.user_id===actor&&row.role==='manager') ? 'manager' : 'employee';
    const isSelf = actor === userId;
    const isPrivileged = ["admin", "manager"].includes(actorRole);
    if (!isSelf && !isPrivileged)
      throw Object.assign(new Error('Bạn chỉ được đổi mật khẩu của chính mình.'), { status: 403 });
    if (!isSelf && actorRole === 'manager') {
      const targetRoles = roleRows.filter(row=>row.user_id===userId);
      if (!target.is_active || !targetRoles.some(row=>row.role==='employee'&&row.assigned_by===actor) || targetRoles.some(row=>row.role!=='employee'))
        throw Object.assign(new Error('Quản lý chỉ được đặt lại mật khẩu nhân viên đang hoạt động do mình phụ trách.'), { status: 403 });
    }
    // A self-service change must prove the current password. Privileged reset
    // is allowed without it and is audited by the caller role.
    if (isSelf || !isPrivileged) {
      if (
        !current ||
        !verifyLocalPassword(String(current), target.password_hash)
      ) {
        throw Object.assign(new Error('Mật khẩu hiện tại không đúng.'), { status: 401 });
      }
    }
    await client.query(
      "update local_user_profiles set password_hash=$2,local_modified_at=now(),updated_at=now() where user_id=$1",
      [userId, hashLocalPassword(next)],
    );
    await client.query("delete from local_auth_sessions where user_id=$1", [
      userId,
    ]);
    await client.query('insert into local_auth_audit_events(entity_type,entity_id,action,actor_id,reason) values($1,$2,$3,$4,$5)', ['USER_PASSWORD',userId,isSelf?'SELF_PASSWORD_CHANGE':'LOCAL_PASSWORD_RESET',actor,isSelf?'Đổi mật khẩu local với bằng chứng mật khẩu hiện tại':'Đặt lại mật khẩu local theo quyền quản trị/phụ trách']);
    await client.query('commit');
    transactionOpen = false;
    if (userId === "local-admin") {
      localSession = {
        token: randomBytes(32).toString("base64url"),
        expiresAt: Date.now() + localSessionTtlMs,
      };
    }
    res.json({ user_id: userId, updated: true });
  } catch (error) {
    if (transactionOpen && client) await client.query('rollback').catch(()=>undefined);
    sendError(res, error);
  } finally { client?.release(); }
});

app.get("/api/users/:id/permissions", async (req, res) => {
  try {
    const userId = String(req.params.id);
    if (localActor(req) !== userId) await assertManagedUser(pool,userId,true);
    if (
      localActor(req) !== userId &&
      !["admin", "manager"].includes(currentLocalRole())
    ) {
      throw Object.assign(
        new Error("Bạn chỉ được xem quyền của tài khoản mình."),
        { status: 403 },
      );
    }
    const profile = await pool.query(
      "select user_id from local_user_profiles where user_id=$1",
      [userId],
    );
    if (!profile.rows[0])
      return res
        .status(404)
        .json({ message: "Không tìm thấy người dùng local." });
    const { rows } = await pool.query(
      `
      select user_id,permission_type,enabled,assigned_by,reason,created_at,updated_at
      from local_employee_permissions
      where user_id=$1
      order by permission_type`,
      [userId],
    );
    res.json(rows);
  } catch (error) {
    sendError(res, error);
  }
});

app.put("/api/users/:id/permissions", async (req, res) => {
  const client = await pool.connect();
  try {
    const userId = String(req.params.id);
    const reason = String(req.body?.reason || "").trim();
    const permissions = validatePermissionChanges(req.body?.permissions);
    if (!reason) throw new Error("Lý do thay đổi phân quyền là bắt buộc.");
    if (!permissions.length) throw new Error('Không có thay đổi phân quyền.');
    await client.query("begin");
    const profile = await client.query(
      "select user_id from local_user_profiles where user_id=$1 for update",
      [userId],
    );
    if (!profile.rows[0]) throw new Error("Không tìm thấy người dùng local.");
    await assertManagedUser(client,userId,true);
    const before = await client.query(
      "select permission_type,enabled from local_employee_permissions where user_id=$1 order by permission_type",
      [userId],
    );
    for (const item of permissions as Array<Record<string, unknown>>) {
      const permissionType = String(item.permission_type).trim();
      await client.query(
        `
        insert into local_employee_permissions(user_id,permission_type,enabled,assigned_by,reason,is_snapshot_record,local_modified_at)
        values($1,$2,$3,$5,$4,false,now())
        on conflict (user_id,permission_type) do update set
          enabled=excluded.enabled,assigned_by=excluded.assigned_by,reason=excluded.reason,
          is_snapshot_record=false,local_modified_at=now(),updated_at=now()`,
        [userId, permissionType, item.enabled, reason,currentLocalActor()],
      );
    }
    const after = await client.query(
      "select permission_type,enabled from local_employee_permissions where user_id=$1 order by permission_type",
      [userId],
    );
    const audit = await client.query(
      `insert into local_auth_audit_events(entity_type,entity_id,action,actor_id,reason,before_data,after_data)
      values('employee_permissions',$1,'UPDATE',$5,$2,$3::jsonb,$4::jsonb) returning id`,
      [userId, reason, JSON.stringify(before.rows), JSON.stringify(after.rows),currentLocalActor()],
    );
    await client.query("commit");
    res.json({
      user_id: userId,
      permissions: after.rows,
      audit_id: audit.rows[0].id,
    });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    sendError(res, error);
  } finally {
    client.release();
  }
});

// Liên kết tài khoản người dùng với hồ sơ công nhân (worker). Admin thực hiện.
// Gỡ liên kết bằng worker_id = null. Toàn bộ có audit.
app.get("/api/users/:id/worker-link", async (req, res) => {
  try {
    const userId = String(req.params.id);
    await assertManagedUser(pool,userId);
    const { rows } = await pool.query(
      `
      select w.id worker_id, w.employee_code, w.display_name worker_name, w.worker_type, w.is_active
      from local_workers w where w.user_id = $1`,
      [userId],
    );
    res.json({ user_id: userId, worker: rows[0] || null });
  } catch (error) {
    sendError(res, error);
  }
});

app.patch("/api/users/:id/worker-link", async (req, res) => {
  const client = await pool.connect();
  try {
    const userId = String(req.params.id);
    const workerId =
      req.body?.worker_id === null ||
      req.body?.worker_id === undefined ||
      req.body?.worker_id === ""
        ? null
        : String(req.body.worker_id);
    const reason = String(req.body?.reason || "").trim() || null;
    await client.query("begin");
    await assertManagedUser(client,userId);
    // Keep the payroll-source advisory lock ahead of every worker mutation.
    await lockPayrollSourceShared(client);
    const profile = await client.query(
      "select user_id from local_user_profiles where user_id=$1 and is_active",
      [userId],
    );
    if (!profile.rows[0])
      throw Object.assign(new Error("Không tìm thấy người dùng local."), {
        status: 404,
      });
    const before = await client.query(
      "select id,employee_code,display_name,user_id from local_workers where user_id=$1",
      [userId],
    );
    if (workerId === null) {
      await client.query(
        "update local_workers set user_id=null, updated_at=now(), local_modified_at=now() where user_id=$1",
        [userId],
      );
    } else {
      if (currentLocalRole() !== 'admin') {
        const scope = await client.query(`select 1 from local_workers w join local_payroll_team_assignments a on a.worker_id=w.id join local_workers s on s.id=a.supervisor_worker_id where w.id=$1 and s.user_id=$2 and s.is_active and a.status='ACTIVE' and a.effective_from<=$3::date and (a.effective_to is null or a.effective_to>=$3::date)`, [workerId,currentLocalActor(),businessDateKey()]);
        if (!scope.rows[0]) throw Object.assign(new Error('Nhân sự không thuộc tổ phụ trách.'),{status:403});
      }
      const wk = await client.query(
        "select id,employee_code,display_name,user_id from local_workers where id=$1 for update",
        [workerId],
      );
      if (!wk.rows[0]) throw new Error("Không tìm thấy công nhân.");
      if (wk.rows[0].user_id && wk.rows[0].user_id !== userId) {
        throw Object.assign(
          new Error(
            `Công nhân ${wk.rows[0].employee_code} đã được liên kết với tài khoản khác.`,
          ),
          { status: 409 },
        );
      }
      await client.query(
        "update local_workers set user_id=null, updated_at=now(), local_modified_at=now() where user_id=$1 and id<>$2",
        [userId, workerId],
      );
      await client.query(
        "update local_workers set user_id=$1, updated_at=now(), local_modified_at=now() where id=$2",
        [userId, workerId],
      );
    }
    const after = await client.query(
      "select id,id worker_id,employee_code,display_name,display_name worker_name,worker_type,is_active,user_id from local_workers where user_id=$1",
      [userId],
    );
    await client.query(
      `insert into local_auth_audit_events(entity_type,entity_id,action,actor_id,reason,before_data,after_data)
      values('worker_user_link',$1,$2,$3,$4,$5::jsonb,$6::jsonb)`,
      [
        userId,
        workerId ? "LINK" : "UNLINK",
        localActor(req),
        reason,
        JSON.stringify(before.rows),
        JSON.stringify(after.rows),
      ],
    );
    await client.query("commit");
    res.json({ user_id: userId, worker: after.rows[0] || null });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    sendError(res, error);
  } finally {
    client.release();
  }
});

app.get("/api/knowledge/documents", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "select id,title,content,document_type,file_url,faq_answer,created_at,updated_at from local_knowledge_documents order by created_at desc",
    );
    res.json(rows);
  } catch (error) {
    sendError(res, error);
  }
});
app.get("/api/knowledge/chat-history", async (req, res) => {
  try {
    const actor = localActor(req);
    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
    const { rows } = await pool.query(
      `
      with merged as (
        select c.record_id id, c.payload, c.updated_at
        from local_compat_records c
        where c.table_name='knowledge_chat_history' and not c.is_deleted
          and c.payload->>'user_id'=$1
        union all
        select s.source_key id, s.payload, s.last_seen_at updated_at
        from local_source_snapshots s
        where s.source='SUPABASE' and s.source_table='knowledge_chat_history' and not s.is_deleted
          and s.payload->>'user_id'=$1
          and not exists (select 1 from local_compat_records c where c.table_name='knowledge_chat_history' and c.record_id=s.source_key)
      )
      select id,payload->>'question' question,payload->>'answer' answer,payload->'sources' sources,
        coalesce(payload->>'created_at', updated_at::text) created_at
      from merged order by created_at desc limit $2`,
      [actor, limit],
    );
    res.json(rows.reverse());
  } catch (error) {
    sendError(res, error);
  }
});
app.post("/api/knowledge/chat-history", async (req, res) => {
  try {
    const actor = localActor(req);
    const question = String(req.body?.question || "").trim();
    const answer = String(req.body?.answer || "").trim();
    if (!question || !answer)
      throw new Error("Nội dung lịch sử trò chuyện không hợp lệ.");
    const id = randomUUID();
    const payload = {
      id,
      user_id: actor,
      question,
      answer,
      sources: Array.isArray(req.body?.sources) ? req.body.sources : [],
      created_at: new Date().toISOString(),
    };
    await pool.query(
      `insert into local_compat_records(table_name,record_id,payload,is_deleted,updated_at) values('knowledge_chat_history',$1,$2::jsonb,false,now())`,
      [id, JSON.stringify(payload)],
    );
    res.status(201).json(payload);
  } catch (error) {
    sendError(res, error);
  }
});
app.post("/api/knowledge/chat", async (req, res) => {
  try {
    const question = String(req.body?.question || "").trim();
    if (!question) throw new Error("Câu hỏi không được để trống.");
    const { rows } = await pool.query(
      "select id,title,content,document_type,faq_answer from local_knowledge_documents order by updated_at desc nulls last limit 500",
    );
    const normalized = question
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const terms = normalized
      .split(/[^a-z0-9]+/)
      .filter((term: string) => term.length >= 2);
    const ranked = rows
      .map((row) => {
        const haystack = [row.title, row.content, row.faq_answer]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
        const score = terms.reduce(
          (sum: number, term: string) =>
            sum + (haystack.includes(term) ? 1 : 0),
          0,
        );
        return { row, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    const sources = ranked.map(({ row }) => ({
      id: String(row.id),
      title: String(row.title || "Tài liệu local"),
      type: String(row.document_type || "text"),
    }));
    const aiAnswer = await aiWorkflows.knowledge(question, ranked, localActor(req));
    if (aiAnswer !== null) return res.json(aiAnswer);
    const answer = ranked.length
      ? ranked
          .map(({ row }, index) => {
            const content = String(row.faq_answer || row.content || "")
              .replace(/\s+/g, " ")
              .trim();
            const excerpt =
              content.length > 700 ? `${content.slice(0, 700)}…` : content;
            return `${index + 1}. **${row.title || "Tài liệu"}**\n${excerpt || "Tài liệu chưa có nội dung."}`;
          })
          .join("\n\n")
      : "Chưa tìm thấy tài liệu phù hợp trong kho kiến thức local. Hãy thêm tài liệu hoặc FAQ liên quan rồi thử lại.";
    res.json({
      answer,
      sources,
      local_only: true,
      source: "postgresql-full-text-baseline",
    });
  } catch (error) {
    sendError(res, error);
  }
});
app.post("/api/knowledge/documents", async (req, res) => {
  try {
    const title = String(req.body?.title || "").trim();
    const type = String(req.body?.document_type || "text");
    if (!title) throw new Error("Tiêu đề tài liệu là bắt buộc.");
    if (!["text", "faq", "pdf", "word"].includes(type))
      throw new Error("Loại tài liệu không hợp lệ.");
    const { rows } = await pool.query(
      `insert into local_knowledge_documents(id,title,content,document_type,file_url,faq_answer,is_snapshot_record,local_modified_at) values($1,$2,$3,$4,$5,$6,false,now()) returning id,title,content,document_type,file_url,faq_answer,created_at,updated_at`,
      [
        randomUUID(),
        title,
        req.body?.content || null,
        type,
        req.body?.file_url || null,
        req.body?.faq_answer || null,
      ],
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    sendError(res, error);
  }
});
app.patch("/api/knowledge/documents/:id", async (req, res) => {
  try {
    const allowed = [
      "title",
      "content",
      "document_type",
      "file_url",
      "faq_answer",
    ];
    const values: unknown[] = [];
    const fields: string[] = [];
    for (const field of allowed) {
      if (req.body?.[field] !== undefined) {
        values.push(req.body[field]);
        fields.push(`${field}=$${values.length}`);
      }
    }
    if (!fields.length) throw new Error("Không có thông tin cần cập nhật.");
    values.push(req.params.id);
    const { rows } = await pool.query(
      `update local_knowledge_documents set ${fields.join(",")},local_modified_at=now(),updated_at=now() where id=$${values.length} returning id,title,content,document_type,file_url,faq_answer,created_at,updated_at`,
      values,
    );
    if (!rows[0])
      return res
        .status(404)
        .json({ message: "Không tìm thấy tài liệu local." });
    res.json(rows[0]);
  } catch (error) {
    sendError(res, error);
  }
});
app.delete("/api/knowledge/documents/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "delete from local_knowledge_documents where id=$1 returning id",
      [req.params.id],
    );
    if (!rows[0])
      return res
        .status(404)
        .json({ message: "Không tìm thấy tài liệu local." });
    res.json({ id: rows[0].id });
  } catch (error) {
    sendError(res, error);
  }
});

const localCostNumber = (value: unknown) =>
  value === null || value === undefined ? 0 : Number(value);
const localCostMaster = (row: Record<string, unknown>) => ({
  ...row,
  level: Number(row.level ?? 0),
  is_active: Boolean(row.is_active),
});

app.get("/api/cost/categories", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "select * from local_cost_categories order by level,code",
    );
    res.json(rows.map(localCostMaster));
  } catch (error) {
    sendError(res, error);
  }
});
app.post("/api/cost/categories", async (req, res) => {
  try {
    const b = req.body || {};
    const code = String(b.code || "")
      .trim()
      .toUpperCase();
    const name = String(b.name || "").trim();
    if (!code || !name)
      throw new Error("Mã và tên danh mục chi phí là bắt buộc.");
    const parentId = b.parent_id || null;
    const parent = parentId
      ? await pool.query(
          "select level from local_cost_categories where id=$1",
          [parentId],
        )
      : { rows: [] };
    const level = parent.rows[0] ? Number(parent.rows[0].level) + 1 : 0;
    const { rows } = await pool.query(
      `insert into local_cost_categories(id,tenant_id,code,name,description,parent_id,level,is_active,default_behavior,default_traceability,is_snapshot_record,local_modified_at,created_at,updated_at) values(gen_random_uuid()::text,'local-tenant',$1,$2,$3,$4,$5,true,$6,$7,false,now(),now(),now()) returning *`,
      [
        code,
        name,
        b.description || null,
        parentId,
        level,
        b.default_behavior || "VARIABLE",
        b.default_traceability || "INDIRECT",
      ],
    );
    res.status(201).json(localCostMaster(rows[0]));
  } catch (error) {
    sendError(res, error);
  }
});
app.patch("/api/cost/categories/:id", async (req, res) => {
  try {
    const b = req.body || {};
    const { rows } = await pool.query(
      `update local_cost_categories set name=coalesce($2,name),description=$3,parent_id=$4,default_behavior=coalesce($5,default_behavior),default_traceability=coalesce($6,default_traceability),level=coalesce((select level+1 from local_cost_categories p where p.id=$4),0),local_modified_at=now(),updated_at=now() where id=$1 returning *`,
      [
        req.params.id,
        b.name || null,
        b.description || null,
        b.parent_id || null,
        b.default_behavior || null,
        b.default_traceability || null,
      ],
    );
    if (!rows[0])
      return res
        .status(404)
        .json({ message: "Không tìm thấy danh mục chi phí." });
    res.json(localCostMaster(rows[0]));
  } catch (error) {
    sendError(res, error);
  }
});
app.post("/api/cost/categories/:id/active", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "update local_cost_categories set is_active=$2,local_modified_at=now(),updated_at=now() where id=$1 returning id,is_active",
      [req.params.id, Boolean(req.body?.is_active)],
    );
    if (!rows[0])
      return res
        .status(404)
        .json({ message: "Không tìm thấy danh mục chi phí." });
    res.json(rows[0]);
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/cost/centers", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "select * from local_cost_centers order by code",
    );
    res.json(rows.map(localCostMaster));
  } catch (error) {
    sendError(res, error);
  }
});
app.post("/api/cost/centers", async (req, res) => {
  try {
    const b = req.body || {};
    const code = String(b.code || "")
      .trim()
      .toUpperCase();
    const name = String(b.name || "").trim();
    if (!code || !name)
      throw new Error("Mã và tên trung tâm chi phí là bắt buộc.");
    const { rows } = await pool.query(
      `insert into local_cost_centers(id,tenant_id,code,name,parent_id,center_type,is_active,is_snapshot_record,local_modified_at,created_at,updated_at) values(gen_random_uuid()::text,'local-tenant',$1,$2,$3,$4,true,false,now(),now(),now()) returning *`,
      [code, name, b.parent_id || null, b.center_type || "SERVICE"],
    );
    res.status(201).json(localCostMaster(rows[0]));
  } catch (error) {
    sendError(res, error);
  }
});
app.patch("/api/cost/centers/:id", async (req, res) => {
  try {
    const b = req.body || {};
    const { rows } = await pool.query(
      "update local_cost_centers set name=coalesce($2,name),parent_id=$3,center_type=coalesce($4,center_type),local_modified_at=now(),updated_at=now() where id=$1 returning *",
      [
        req.params.id,
        b.name || null,
        b.parent_id || null,
        b.center_type || null,
      ],
    );
    if (!rows[0])
      return res
        .status(404)
        .json({ message: "Không tìm thấy trung tâm chi phí." });
    res.json(localCostMaster(rows[0]));
  } catch (error) {
    sendError(res, error);
  }
});
app.post("/api/cost/centers/:id/active", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "update local_cost_centers set is_active=$2,local_modified_at=now(),updated_at=now() where id=$1 returning id,is_active",
      [req.params.id, Boolean(req.body?.is_active)],
    );
    if (!rows[0])
      return res
        .status(404)
        .json({ message: "Không tìm thấy trung tâm chi phí." });
    res.json(rows[0]);
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/cost/objects", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "select * from local_cost_objects order by display_code",
    );
    res.json(rows.map(localCostMaster));
  } catch (error) {
    sendError(res, error);
  }
});
app.post("/api/cost/objects", async (req, res) => {
  try {
    const b = req.body || {};
    const code = String(b.display_code || "")
      .trim()
      .toUpperCase();
    if (!code) throw new Error("Mã đối tượng chi phí là bắt buộc.");
    const { rows } = await pool.query(
      "insert into local_cost_objects(id,tenant_id,object_type,source_id,display_code,display_name,status,is_active,is_snapshot_record,local_modified_at,created_at,updated_at) values(gen_random_uuid()::text,'local-tenant',$1,$2,$3,$4,'ACTIVE',true,false,now(),now(),now()) returning *",
      [
        b.object_type || "OTHER",
        b.source_id || null,
        code,
        b.display_name || null,
      ],
    );
    res.status(201).json(localCostMaster(rows[0]));
  } catch (error) {
    sendError(res, error);
  }
});
app.post("/api/cost/objects/:id/active", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "update local_cost_objects set is_active=$2,status=case when $2 then 'ACTIVE' else 'INACTIVE' end,local_modified_at=now(),updated_at=now() where id=$1 returning id,is_active,status",
      [req.params.id, Boolean(req.body?.is_active)],
    );
    if (!rows[0])
      return res
        .status(404)
        .json({ message: "Không tìm thấy đối tượng chi phí." });
    res.json(rows[0]);
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/cost/transaction-types", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "select * from local_transaction_types order by code",
    );
    res.json(rows.map(localCostMaster));
  } catch (error) {
    sendError(res, error);
  }
});
app.get("/api/cost/users", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "select source_key user_id,payload->>'email' email,payload->>'first_name' first_name,payload->>'last_name' last_name from local_source_snapshots where source='SUPABASE' and source_table='profiles' and not is_deleted order by payload->>'first_name'",
    );
    res.json(rows);
  } catch (error) {
    sendError(res, error);
  }
});
app.get("/api/cost/audit", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "select * from local_cost_audit_events order by created_at desc limit 300",
    );
    res.json(rows);
  } catch (error) {
    sendError(res, error);
  }
});

const costTransactionRow = (row: Record<string, unknown>) => ({
  ...row,
  subtotal: localCostNumber(row.subtotal),
  vat_amount: localCostNumber(row.vat_amount),
  total_amount: localCostNumber(row.total_amount),
  cost_center_ids: Array.isArray(row.cost_center_ids)
    ? row.cost_center_ids
    : [],
  cost_object_ids: Array.isArray(row.cost_object_ids)
    ? row.cost_object_ids
    : [],
});
app.get("/api/cost/business-transactions", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `select bt.*,coalesce(array_agg(distinct l.cost_center_id) filter (where l.cost_center_id is not null),'{}') cost_center_ids,coalesce(array_agg(distinct l.cost_object_id) filter (where l.cost_object_id is not null),'{}') cost_object_ids from local_business_transactions bt left join local_business_transaction_lines l on l.business_transaction_id=bt.id group by bt.id order by bt.transaction_date desc,bt.created_at desc limit 500`,
    );
    res.json(rows.map(costTransactionRow));
  } catch (error) {
    sendError(res, error);
  }
});
app.post("/api/cost/business-transactions", async (req, res) => {
  const client = await pool.connect();
  try {
    const b = req.body || {};
    const typeId = String(b.transaction_type_id || "");
    const description = String(b.description || "").trim();
    const key = String(b.idempotency_key || "").trim();
    const lines = Array.isArray(b.lines) ? b.lines : [];
    if (!typeId || !description || key.length < 8 || !lines.length)
      throw new Error(
        "Loại nghiệp vụ, mô tả, idempotency key và ít nhất một dòng là bắt buộc.",
      );
    await client.query("begin");
    const existing = await client.query(
      "select id,transaction_number,status from local_business_transactions where tenant_id='local-tenant' and idempotency_key=$1",
      [key],
    );
    if (existing.rows[0]) {
      await client.query("rollback");
      return res.json({ ...existing.rows[0], reused: true });
    }
    const type = await client.query(
      "select * from local_transaction_types where id=$1 and is_active",
      [typeId],
    );
    if (!type.rows[0])
      throw new Error("Loại nghiệp vụ không tồn tại hoặc đã ngừng dùng.");
    const date = String(
      b.transaction_date || businessDateKey(),
    );
    const count = await client.query(
      "select count(*)::int count from local_business_transactions where transaction_date=$1",
      [date],
    );
    const number = `BT-${date.replaceAll("-", "").slice(0, 6)}-${String(Number(count.rows[0].count) + 1).padStart(6, "0")}`;
    const id = randomUUID();
    let subtotal = 0,
      vatAmount = 0;
    for (const [index, line] of lines.entries()) {
      const quantity = Number(line.quantity ?? 1);
      const unitPrice = Number(line.unit_price ?? 0);
      const lineSubtotal = quantity * unitPrice;
      const vat = Number(line.vat_rate ?? 0);
      const lineVat = (lineSubtotal * vat) / 100;
      subtotal += lineSubtotal;
      vatAmount += lineVat;
      await client.query(
        `insert into local_business_transaction_lines(id,business_transaction_id,line_number,description,quantity,unit,unit_price,subtotal,vat_rate,vat_amount,total_amount,effect_kind,direction,cost_category_id,cost_center_id,cost_object_id,cost_behavior,traceability,classification_snapshot) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb)`,
        [
          randomUUID(),
          id,
          index + 1,
          String(line.description || ""),
          quantity,
          String(line.unit || "unit"),
          unitPrice,
          lineSubtotal,
          vat,
          lineVat,
          lineSubtotal + lineVat,
          type.rows[0].default_effect_kind,
          type.rows[0].default_direction,
          line.cost_category_id ||
            type.rows[0].default_cost_category_id ||
            null,
          line.cost_center_id || type.rows[0].default_cost_center_id || null,
          line.cost_object_id || null,
          line.cost_behavior || type.rows[0].default_cost_behavior || null,
          line.traceability || type.rows[0].default_traceability || null,
          JSON.stringify(line.classification_snapshot || {}),
        ],
      );
    }
    const { rows } = await client.query(
      `insert into local_business_transactions(id,tenant_id,manager_id,transaction_number,transaction_type_id,transaction_date,description,status,counterparty_type,counterparty_id,counterparty_name_snapshot,currency_code,subtotal,vat_amount,total_amount,payment_status,external_reference,idempotency_key,created_by,is_snapshot_record,local_modified_at) values($1,'local-tenant','local-admin',$2,$3,$4,$5,'DRAFT',$6,$7,$8,'VND',$9,$10,$11,'UNPAID',$12,$13,'local-admin',false,now()) returning id,transaction_number,status`,
      [
        id,
        number,
        typeId,
        date,
        description,
        b.counterparty_type || null,
        b.counterparty_id || null,
        b.counterparty_name || null,
        subtotal,
        vatAmount,
        subtotal + vatAmount,
        b.external_reference || null,
        key,
      ],
    );
    await client.query(
      "insert into local_cost_audit_events(id,entity_type,entity_id,action,after_data,actor_id,reason) values($1,'business_transactions',$2,'CREATE',$3::jsonb,'local-admin',$4)",
      [
        randomUUID(),
        id,
        JSON.stringify({
          subtotal,
          vat_amount: vatAmount,
          total_amount: subtotal + vatAmount,
        }),
        "Tạo giao dịch local",
      ],
    );
    await client.query("commit");
    res.status(201).json({ ...rows[0], reused: false });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    sendError(res, error);
  } finally {
    client.release();
  }
});
app.post("/api/cost/business-transactions/:id/confirm", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "update local_business_transactions set status='CONFIRMED',confirmed_by='local-admin',confirmed_at=now(),updated_at=now() where id=$1 and status='DRAFT' returning id,transaction_number,status",
      [req.params.id],
    );
    if (!rows[0]) throw new Error("Chỉ giao dịch nháp mới được xác nhận.");
    await pool.query(
      "insert into local_cost_audit_events(id,entity_type,entity_id,action,actor_id,reason) values($1,'business_transactions',$2,'CONFIRM','local-admin',$3)",
      [randomUUID(), req.params.id, req.body?.reason || "Xác nhận giao dịch"],
    );
    res.json({ ...rows[0], reused: false });
  } catch (error) {
    sendError(res, error);
  }
});
app.post("/api/cost/business-transactions/:id/void", async (req, res) => {
  try {
    const reason = String(req.body?.reason || "").trim();
    if (!reason) throw new Error("Lý do hủy là bắt buộc.");
    const { rows } = await pool.query(
      "update local_business_transactions set status='VOIDED',voided_by='local-admin',voided_at=now(),void_reason=$2,updated_at=now() where id=$1 and status<>'VOIDED' returning id,transaction_number,status",
      [req.params.id, reason],
    );
    if (!rows[0])
      throw new Error("Không tìm thấy giao dịch hoặc giao dịch đã hủy.");
    await pool.query(
      "insert into local_cost_audit_events(id,entity_type,entity_id,action,actor_id,reason) values($1,'business_transactions',$2,'VOID','local-admin',$3)",
      [randomUUID(), req.params.id, reason],
    );
    res.json({ ...rows[0], reused: false });
  } catch (error) {
    sendError(res, error);
  }
});

const localEInvoiceRow = (
  row: Record<string, unknown>,
): Record<string, unknown> => ({
  ...row,
  response_data: parseJsonValue(row.response_data, null),
  request_data: parseJsonValue(row.request_data, null),
  draft_payload: parseJsonValue(row.draft_payload, null),
  total_amount: asNumber(row.total_amount),
  vat_amount: asNumber(row.vat_amount),
  total_with_vat: asNumber(row.total_with_vat),
  payment_status_synced: Boolean(row.payment_status_synced),
});
app.get("/api/einvoice-settings", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "select id,manager_id,tax_code,username,api_url,default_invoice_type,default_template_code,default_serial,last_login_at,last_login_status,last_login_error,(password is not null and password <> '') has_password from local_einvoice_settings where manager_id=$1 order by updated_at desc nulls last limit 1", [currentLocalActor()],
    );
    res.json({
      settings: rows[0] || null,
      env_fallback: null,
      local_only: true,
    });
  } catch (error) {
    sendError(res, error);
  }
});
app.post("/api/einvoice-settings", async (_req, res) => {
  return res.status(409).json({ message: "VPS local chỉ hỗ trợ hóa đơn nháp; không lưu hoặc kiểm tra thông tin đăng nhập Viettel S-Invoice." });
});
app.get("/api/einvoice-templates", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "select template_code,invoice_series,manager_id from local_einvoices where template_code is not null and company_id is null order by template_code,invoice_series",
    );
    const grouped = new Map<
      string,
      { templateCode: string; templateName: string; invoiceSeries: string[] }
    >();
    const p = await contractPrincipal(pool, currentLocalActor(), currentLocalRole());
    for (const row of rows.filter(row => canInvoice(p, row))) {
      const code = String(row.template_code);
      const item = grouped.get(code) || {
        templateCode: code,
        templateName: "",
        invoiceSeries: [],
      };
      if (
        row.invoice_series &&
        !item.invoiceSeries.includes(String(row.invoice_series))
      )
        item.invoiceSeries.push(String(row.invoice_series));
      grouped.set(code, item);
    }
    res.json({
      success: true,
      data: { lstInvoiceTemplate: [...grouped.values()] },
      local_only: true,
    });
  } catch (error) {
    sendError(res, error);
  }
});
registerInvoiceWorkspace({app,pool,actor:currentLocalActor,role:currentLocalRole,storageRoot:runtime.storageRoot,sendError,simplePdf});
registerContractRoutes({ app, pool, actor: currentLocalActor, role: currentLocalRole, contractRow: localContractRow, invoiceRow: localEInvoiceRow, sendError, simplePdf });

const parseArrayField = (value: unknown) => parseJsonValue(value, []);
app.get("/api/shipping-companies", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "select * from local_shipping_companies order by name",
    );
    res.json(
      rows.map((row) => ({ ...row, areas: parseArrayField(row.areas) })),
    );
  } catch (error) {
    sendError(res, error);
  }
});
app.post("/api/shipping-companies", async (req, res) => {
  try {
    const b = req.body || {};
    const name = String(b.name || "").trim();
    if (!name) throw new Error("Tên nhà xe là bắt buộc.");
    const { rows } = await pool.query(
      "insert into local_shipping_companies(id,name,phone,address,areas,contact_person,notes,google_maps_url,manager_id,tenant_id,is_snapshot_record,local_modified_at,created_at,updated_at) values(gen_random_uuid()::text,$1,$2,$3,$4::jsonb,$5,$6,$7,'local-admin','local-tenant',false,now(),now(),now()) returning *",
      [
        name,
        b.phone || null,
        b.address || null,
        JSON.stringify(Array.isArray(b.areas) ? b.areas : []),
        b.contact_person || null,
        b.notes || null,
        b.google_maps_url || null,
      ],
    );
    res.status(201).json({ ...rows[0], areas: parseArrayField(rows[0].areas) });
  } catch (error) {
    sendError(res, error);
  }
});
app.patch("/api/shipping-companies/:id", async (req, res) => {
  try {
    const b = req.body || {};
    const { rows } = await pool.query(
      "update local_shipping_companies set name=coalesce($2,name),phone=$3,address=$4,areas=coalesce($5::jsonb,areas),contact_person=$6,notes=$7,google_maps_url=$8,local_modified_at=now(),updated_at=now() where id=$1 returning *",
      [
        req.params.id,
        b.name || null,
        b.phone || null,
        b.address || null,
        Array.isArray(b.areas) ? JSON.stringify(b.areas) : null,
        b.contact_person || null,
        b.notes || null,
        b.google_maps_url || null,
      ],
    );
    if (!rows[0])
      return res.status(404).json({ message: "Không tìm thấy nhà xe." });
    res.json({ ...rows[0], areas: parseArrayField(rows[0].areas) });
  } catch (error) {
    sendError(res, error);
  }
});
app.delete("/api/shipping-companies/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "delete from local_shipping_companies where id=$1 returning id",
      [req.params.id],
    );
    if (!rows[0])
      return res.status(404).json({ message: "Không tìm thấy nhà xe." });
    res.json(rows[0]);
  } catch (error) {
    sendError(res, error);
  }
});

const fabricVariantFromRow = (row: Record<string, unknown>) =>
  row.variant_id
    ? {
        id: row.variant_id,
        fabric_type_id: row.variant_fabric_type_id,
        variant_name: row.variant_name,
        width_code: row.variant_width_code,
        weight: row.variant_weight,
        color: row.variant_color,
        origin: row.variant_origin,
        unit: row.variant_unit,
        cost_price: asNumber(row.variant_cost_price),
        selling_price: asNumber(row.variant_selling_price),
        fabric_types: row.fabric_type_name
          ? {
              name: row.fabric_type_name,
              description: row.fabric_type_description,
            }
          : null,
      }
    : null;

const fabricInventoryFromRow = (row: Record<string, unknown>) => ({
  id: row.id,
  fabric_variant_id: row.fabric_variant_id,
  warehouse_id: row.warehouse_id,
  current_stock: asNumber(row.current_stock),
  packages_count: asNumber(row.packages_count),
  reserved_stock: asNumber(row.reserved_stock),
  minimum_stock: asNumber(row.minimum_stock),
  maximum_stock: asNumber(row.maximum_stock),
  last_updated: row.last_updated,
  created_at: row.created_at,
  updated_at: row.updated_at,
  manager_id: row.manager_id,
  tenant_id: row.tenant_id,
  fabric_variants: fabricVariantFromRow(row),
  warehouses: row.warehouse_name
    ? { name: row.warehouse_name, warehouse_type: row.warehouse_type }
    : null,
});

app.get("/api/fabrics/types", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "select id,name,description,created_at,updated_at,manager_id,tenant_id from local_fabric_types order by name",
    );
    res.json(rows);
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/fabrics/widths", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "select id,width_code,description,created_at,updated_at,manager_id,tenant_id from local_fabric_widths order by width_code",
    );
    res.json(rows);
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/fabrics/warehouses", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "select id,name,address,warehouse_type,is_active,created_at,updated_at,manager_id,tenant_id from local_warehouses where is_active order by warehouse_type desc,name",
    );
    res.json(rows);
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/fabrics/variants", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `select v.id,v.fabric_type_id,v.variant_name,v.width_code,v.weight,v.color,v.origin,v.unit,v.cost_price,v.selling_price,v.created_at,v.updated_at,v.manager_id,v.tenant_id,t.name fabric_type_name,t.description fabric_type_description from local_fabric_variants v left join local_fabric_types t on t.id=v.fabric_type_id order by v.created_at desc nulls last`,
    );
    res.json(
      rows.map((row) => ({
        ...row,
        cost_price: asNumber(row.cost_price),
        selling_price: asNumber(row.selling_price),
        fabric_types: {
          name: row.fabric_type_name,
          description: row.fabric_type_description,
        },
      })),
    );
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/fabrics/inventory", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `select i.*,v.id variant_id,v.fabric_type_id variant_fabric_type_id,v.variant_name,v.width_code variant_width_code,v.weight variant_weight,v.color variant_color,v.origin variant_origin,v.unit variant_unit,v.cost_price variant_cost_price,v.selling_price variant_selling_price,t.name fabric_type_name,t.description fabric_type_description,w.name warehouse_name,w.warehouse_type from local_fabric_inventory i left join local_fabric_variants v on v.id=i.fabric_variant_id left join local_fabric_types t on t.id=v.fabric_type_id left join local_warehouses w on w.id=i.warehouse_id order by i.last_updated desc nulls last`,
    );
    res.json(rows.map(fabricInventoryFromRow));
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/fabrics/transactions", async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit || 500), 1), 5000);
    const offset = Math.max(Number(req.query.offset || 0), 0);
    const { rows } = await pool.query(
      `select t.*,v.id variant_id,v.fabric_type_id variant_fabric_type_id,v.variant_name,v.width_code variant_width_code,v.weight variant_weight,v.color variant_color,v.origin variant_origin,v.unit variant_unit,v.cost_price variant_cost_price,v.selling_price variant_selling_price,ft.name fabric_type_name,w.name warehouse_name from local_fabric_transactions t left join local_fabric_variants v on v.id=t.fabric_variant_id left join local_fabric_types ft on ft.id=v.fabric_type_id left join local_warehouses w on w.id=t.warehouse_id order by t.transaction_date desc nulls last,t.id limit $1 offset $2`,
      [limit, offset],
    );
    res.json(
      rows.map((row) => ({
        ...row,
        quantity: asNumber(row.quantity),
        packages_count: asNumber(row.packages_count),
        unit_price: asNumber(row.unit_price),
        total_amount: asNumber(row.total_amount),
        fabric_variants: fabricVariantFromRow(row),
        warehouses: row.warehouse_name ? { name: row.warehouse_name } : null,
      })),
    );
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/fabrics/transfers", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `select t.*,v.id variant_id,v.fabric_type_id variant_fabric_type_id,v.variant_name,v.width_code variant_width_code,v.weight variant_weight,v.color variant_color,v.origin variant_origin,v.unit variant_unit,v.cost_price variant_cost_price,v.selling_price variant_selling_price,ft.name fabric_type_name,fw.name from_warehouse_name,tw.name to_warehouse_name from local_fabric_transfers t left join local_fabric_variants v on v.id=t.fabric_variant_id left join local_fabric_types ft on ft.id=v.fabric_type_id left join local_warehouses fw on fw.id=t.from_warehouse_id left join local_warehouses tw on tw.id=t.to_warehouse_id order by t.transfer_date desc nulls last`,
    );
    res.json(
      rows.map((row) => ({
        ...row,
        quantity: asNumber(row.quantity),
        fabric_variants: fabricVariantFromRow(row),
        from_warehouse: row.from_warehouse_name
          ? { name: row.from_warehouse_name }
          : null,
        to_warehouse: row.to_warehouse_name
          ? { name: row.to_warehouse_name }
          : null,
      })),
    );
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/fabrics/usage", async (req, res) => {
  try {
    const orderId = String(req.query.orderId || "").trim();
    const params: unknown[] = orderId ? [orderId] : [];
    const { rows } = await pool.query(
      `select u.*,v.id variant_id,v.fabric_type_id variant_fabric_type_id,v.variant_name,v.width_code variant_width_code,v.weight variant_weight,v.color variant_color,v.origin variant_origin,v.unit variant_unit,v.cost_price variant_cost_price,v.selling_price variant_selling_price,ft.name fabric_type_name,w.name warehouse_name from local_fabric_usage u left join local_fabric_variants v on v.id=u.fabric_variant_id left join local_fabric_types ft on ft.id=v.fabric_type_id left join local_warehouses w on w.id=u.warehouse_id ${orderId ? "where u.order_id=$1" : ""} order by u.usage_date desc nulls last`,
      params,
    );
    res.json(
      rows.map((row) => ({
        ...row,
        quantity_used: asNumber(row.quantity_used),
        fabric_variants: fabricVariantFromRow(row),
        warehouses: row.warehouse_name ? { name: row.warehouse_name } : null,
      })),
    );
  } catch (error) {
    sendError(res, error);
  }
});

// Fabric usage is deliberately handled by the local API instead of a
// Supabase RPC. Each operation updates usage, the linked outbound movement,
// and the stock balance in one PostgreSQL transaction.
app.post("/api/fabrics/usage/batch", async (req, res) => {
  const client = await pool.connect();
  try {
    const body = req.body || {};
    const orderId = String(body.order_id || "").trim();
    const orderNumber = String(body.order_number || "").trim();
    const warehouseId = String(body.warehouse_id || "").trim();
    const orderGroup = String(body.order_group || "unclassified").trim();
    const items: Array<{ fabric_variant_id: string; quantity_used: number }> =
      Array.isArray(body.items)
        ? body.items.map((item: Record<string, unknown>) => ({
            fabric_variant_id: String(item.fabric_variant_id || "").trim(),
            quantity_used: Number(item.quantity_used),
          }))
        : [];
    if (!orderId || !orderNumber || !warehouseId)
      throw new Error("Đơn hàng, số đơn và kho là bắt buộc.");
    if (!["don_phuoc", "don_hoan", "unclassified"].includes(orderGroup))
      throw new Error("Nhóm đơn hàng không hợp lệ.");
    if (!items.length) throw new Error("Cần ít nhất một loại vải.");
    if (
      items.some(
        (item) =>
          !item.fabric_variant_id ||
          !Number.isFinite(item.quantity_used) ||
          item.quantity_used <= 0,
      )
    ) {
      throw new Error("Mỗi loại vải phải có số lượng lớn hơn 0.");
    }
    if (
      new Set(items.map((item) => item.fabric_variant_id)).size !== items.length
    ) {
      throw new Error(
        "Một loại vải chỉ được xuất một lần trong cùng một phiếu.",
      );
    }

    await client.query("BEGIN");
    const variantIds = items.map((item) => item.fabric_variant_id).sort();
    await assertLegacyFabricVariantsWritable(client, variantIds);
    const inventoryResult = await client.query(
      "select fabric_variant_id,current_stock from local_fabric_inventory where warehouse_id=$1 and fabric_variant_id=any($2::text[]) order by fabric_variant_id for update",
      [warehouseId, variantIds],
    );
    const inventoryByVariant = new Map(
      inventoryResult.rows.map((row) => [
        row.fabric_variant_id,
        Number(row.current_stock || 0),
      ]),
    );
    for (const item of items) {
      const stock = inventoryByVariant.get(item.fabric_variant_id);
      if (stock === undefined)
        throw new Error("Không tìm thấy tồn kho cho loại vải và kho đã chọn.");
      if (stock < item.quantity_used)
        throw new Error(
          `Tồn kho không đủ. Còn ${stock} m, cần ${item.quantity_used} m.`,
        );
    }

    const usageIds: string[] = [];
    for (const item of items) {
      const usageResult = await client.query(
        `
        insert into local_fabric_usage(
          id,order_id,order_number,order_group,order_type,fabric_variant_id,warehouse_id,
          quantity_used,unit,usage_date,notes,customer_name,customer_code,fabric_width,
          manager_id,tenant_id,is_snapshot_record,local_modified_at,created_at,updated_at
        ) values(gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,'m',coalesce($8::timestamptz,now()),$9,$10,$11,$12,$13,'local-tenant',false,now(),now(),now())
        returning id`,
        [
          orderId,
          orderNumber,
          orderGroup,
          body.order_type || null,
          item.fabric_variant_id,
          warehouseId,
          item.quantity_used,
          body.usage_date || null,
          body.notes || null,
          body.customer_name || null,
          body.customer_code || null,
          body.fabric_width || null,
          fabricActor(req),
        ],
      );
      const usageId = String(usageResult.rows[0].id);
      usageIds.push(usageId);
      await client.query(
        `
        insert into local_fabric_transactions(
          id,fabric_variant_id,warehouse_id,transaction_type,quantity,packages_count,unit_price,total_amount,
          reference_number,notes,transaction_date,fabric_usage_id,manager_id,tenant_id,is_snapshot_record,local_modified_at,created_at,updated_at
        ) values(gen_random_uuid()::text,$1,$2,'outbound',$3,0,null,null,$4,$5,coalesce($6::timestamptz,now()),$7,$8,'local-tenant',false,now(),now(),now())`,
        [
          item.fabric_variant_id,
          warehouseId,
          -item.quantity_used,
          orderNumber,
          body.notes || `Xuất vải cho đơn hàng ${orderNumber}`,
          body.usage_date || null,
          usageId,
          fabricActor(req),
        ],
      );
      await client.query(
        "update local_fabric_inventory set current_stock=current_stock-$1,last_updated=now(),local_modified_at=now(),updated_at=now() where fabric_variant_id=$2 and warehouse_id=$3",
        [item.quantity_used, item.fabric_variant_id, warehouseId],
      );
    }
    await client.query("COMMIT");
    res.status(201).json({
      success: true,
      usage_count: usageIds.length,
      transaction_count: usageIds.length,
      usage_ids: usageIds,
      order_group: orderGroup,
      unit: "m",
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    sendError(res, error);
  } finally {
    client.release();
  }
});

// Phieu xuat cu (thoi Supabase) chua gan fabric_usage_id: tim giao dich xuat khop de gan lai,
// khong thay thi ghi bu de thay doi so cai luon bang thay doi ton.
async function linkLegacyUsageTransaction(
  client: Pick<PoolClient, "query">,
  usage: Record<string, unknown>,
) {
  const linked = await client.query(
    "select id from local_fabric_transactions where fabric_usage_id=$1 for update",
    [usage.id],
  );
  if (linked.rows[0]) return true;
  const candidate = await client.query(
    `select id from local_fabric_transactions where fabric_usage_id is null and transaction_type='outbound'
     and fabric_variant_id=$1 and warehouse_id=$2 and abs(quantity+$3)<0.0001 and coalesce(reference_number,'')=coalesce($4,'')
     order by transaction_date nulls last,id limit 1 for update`,
    [usage.fabric_variant_id, usage.warehouse_id, Number(usage.quantity_used || 0), usage.order_number ?? null],
  );
  if (!candidate.rows[0]) return false;
  await client.query(
    "update local_fabric_transactions set fabric_usage_id=$2,local_modified_at=now(),updated_at=now() where id=$1",
    [candidate.rows[0].id, usage.id],
  );
  return true;
}

app.patch("/api/fabrics/usage/:id", async (req, res) => {
  const client = await pool.connect();
  try {
    const body = req.body || {};
    await client.query("BEGIN");
    const usageResult = await client.query(
      "select * from local_fabric_usage where id=$1 for update",
      [req.params.id],
    );
    const oldUsage = usageResult.rows[0];
    if (!oldUsage) throw new Error("Không tìm thấy ghi nhận sử dụng vải.");
    const oldVariant = String(oldUsage.fabric_variant_id || "");
    const oldWarehouse = String(oldUsage.warehouse_id || "");
    const oldQuantity = Number(oldUsage.quantity_used || 0);
    const newVariant = String(body.fabric_variant_id || oldVariant);
    const newWarehouse = String(body.warehouse_id || oldWarehouse);
    const newQuantity =
      body.quantity_used === undefined
        ? oldQuantity
        : Number(body.quantity_used);
    if (
      !newVariant ||
      !newWarehouse ||
      !Number.isFinite(newQuantity) ||
      newQuantity <= 0
    )
      throw new Error("Vải, kho và số lượng phải hợp lệ.");
    if (
      body.order_group !== undefined &&
      !["don_phuoc", "don_hoan", "unclassified"].includes(
        String(body.order_group),
      )
    )
      throw new Error("Nhóm đơn hàng không hợp lệ.");
    await assertLegacyFabricVariantsWritable(client, [oldVariant, newVariant]);
    const hasLinkedTransaction = await linkLegacyUsageTransaction(client, oldUsage);

    const keys = [
      ...new Set([
        `${oldVariant}::${oldWarehouse}`,
        `${newVariant}::${newWarehouse}`,
      ]),
    ].sort();
    const lockedInventory = new Map<string, number>();
    for (const key of keys) {
      const [variant, warehouse] = key.split("::");
      const inventoryResult = await client.query(
        "select current_stock from local_fabric_inventory where fabric_variant_id=$1 and warehouse_id=$2 for update",
        [variant, warehouse],
      );
      if (!inventoryResult.rows[0])
        throw new Error("Không tìm thấy tồn kho cho loại vải và kho đã chọn.");
      lockedInventory.set(
        key,
        Number(inventoryResult.rows[0].current_stock || 0),
      );
    }
    const oldKey = `${oldVariant}::${oldWarehouse}`;
    const newKey = `${newVariant}::${newWarehouse}`;
    if (oldKey === newKey) {
      const available = (lockedInventory.get(oldKey) || 0) + oldQuantity;
      if (available < newQuantity)
        throw new Error(
          `Tồn kho không đủ. Còn ${available} m, cần ${newQuantity} m.`,
        );
      await client.query(
        "update local_fabric_inventory set current_stock=current_stock+$1-$2,last_updated=now(),local_modified_at=now(),updated_at=now() where fabric_variant_id=$3 and warehouse_id=$4",
        [oldQuantity, newQuantity, oldVariant, oldWarehouse],
      );
    } else {
      if ((lockedInventory.get(newKey) || 0) < newQuantity)
        throw new Error(
          `Tồn kho không đủ. Còn ${lockedInventory.get(newKey) || 0} m, cần ${newQuantity} m.`,
        );
      await client.query(
        "update local_fabric_inventory set current_stock=current_stock+$1,last_updated=now(),local_modified_at=now(),updated_at=now() where fabric_variant_id=$2 and warehouse_id=$3",
        [oldQuantity, oldVariant, oldWarehouse],
      );
      await client.query(
        "update local_fabric_inventory set current_stock=current_stock-$1,last_updated=now(),local_modified_at=now(),updated_at=now() where fabric_variant_id=$2 and warehouse_id=$3",
        [newQuantity, newVariant, newWarehouse],
      );
    }

    const updated = await client.query(
      `update local_fabric_usage set
      order_id=coalesce($2,order_id), order_number=coalesce($3,order_number), order_group=coalesce($4,order_group),
      order_type=coalesce($5,order_type), fabric_variant_id=$6, warehouse_id=$7, quantity_used=$8,
      unit=coalesce($9,unit), usage_date=coalesce($10::timestamptz,usage_date), notes=coalesce($11,notes),
      customer_name=coalesce($12,customer_name), customer_code=coalesce($13,customer_code), fabric_width=coalesce($14,fabric_width),
      local_modified_at=now(),updated_at=now() where id=$1 returning *`,
      [
        req.params.id,
        body.order_id ?? null,
        body.order_number ?? null,
        body.order_group ?? null,
        body.order_type ?? null,
        newVariant,
        newWarehouse,
        newQuantity,
        body.unit ?? null,
        body.usage_date ?? null,
        body.notes ?? null,
        body.customer_name ?? null,
        body.customer_code ?? null,
        body.fabric_width ?? null,
      ],
    );
    await client.query(
      `update local_fabric_transactions set fabric_variant_id=$2,warehouse_id=$3,quantity=$4,
      reference_number=coalesce($5,reference_number),notes=coalesce($6,notes),transaction_date=coalesce($7::timestamptz,transaction_date),
      local_modified_at=now(),updated_at=now() where fabric_usage_id=$1`,
      [
        req.params.id,
        newVariant,
        newWarehouse,
        -newQuantity,
        body.order_number ?? null,
        body.notes ?? null,
        body.usage_date ?? null,
      ],
    );
    if (!hasLinkedTransaction) {
      const actor = fabricActor(req);
      await insertFabricTransaction(client, {
        variantId: oldVariant,
        warehouseId: oldWarehouse,
        type: "adjustment",
        quantity: oldQuantity,
        reference: String(oldUsage.order_number || "") || null,
        notes: `Hoàn số cũ ${oldQuantity} m khi sửa phiếu xuất cũ chưa có giao dịch gắn kèm`,
        actor,
      });
      await insertFabricTransaction(client, {
        variantId: newVariant,
        warehouseId: newWarehouse,
        type: "outbound",
        quantity: -newQuantity,
        reference: String(body.order_number ?? oldUsage.order_number ?? "") || null,
        notes: body.notes ?? oldUsage.notes ?? null,
        date: body.usage_date ?? (oldUsage.usage_date ? new Date(String(oldUsage.usage_date)).toISOString() : null),
        usageId: String(req.params.id),
        actor,
      });
    }
    await client.query("COMMIT");
    res.json(updated.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    sendError(res, error);
  } finally {
    client.release();
  }
});

app.delete("/api/fabrics/usage/:id", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const usageResult = await client.query(
      "select id,fabric_variant_id,warehouse_id,quantity_used,order_number from local_fabric_usage where id=$1 for update",
      [req.params.id],
    );
    const usage = usageResult.rows[0];
    if (!usage) throw new Error("Không tìm thấy ghi nhận sử dụng vải.");
    await assertLegacyFabricVariantsWritable(client, [usage.fabric_variant_id]);
    const hasLinkedTransaction = await linkLegacyUsageTransaction(client, usage);
    if (!hasLinkedTransaction)
      await insertFabricTransaction(client, {
        variantId: String(usage.fabric_variant_id),
        warehouseId: String(usage.warehouse_id),
        type: "adjustment",
        quantity: Number(usage.quantity_used || 0),
        reference: String(usage.order_number || "") || null,
        notes: `Hoàn ${Number(usage.quantity_used || 0)} m khi xoá phiếu xuất cũ chưa có giao dịch gắn kèm`,
        actor: fabricActor(req),
      });
    const inventoryResult = await client.query(
      "select id from local_fabric_inventory where fabric_variant_id=$1 and warehouse_id=$2 for update",
      [usage.fabric_variant_id, usage.warehouse_id],
    );
    if (!inventoryResult.rows[0])
      throw new Error("Không tìm thấy tồn kho để hoàn lại số lượng.");
    await client.query(
      "update local_fabric_inventory set current_stock=current_stock+$1,last_updated=now(),local_modified_at=now(),updated_at=now() where fabric_variant_id=$2 and warehouse_id=$3",
      [
        Number(usage.quantity_used || 0),
        usage.fabric_variant_id,
        usage.warehouse_id,
      ],
    );
    await client.query(
      "delete from local_fabric_transactions where fabric_usage_id=$1",
      [req.params.id],
    );
    await client.query("delete from local_fabric_usage where id=$1", [
      req.params.id,
    ]);
    await client.query("COMMIT");
    res.json({ success: true, usage_id: req.params.id });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    sendError(res, error);
  } finally {
    client.release();
  }
});

app.post("/api/fabrics/types", async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    if (!name) throw new Error("Tên loại vải là bắt buộc.");
    const { rows } = await pool.query(
      "insert into local_fabric_types(id,name,description,tenant_id,is_snapshot_record,local_modified_at,created_at,updated_at) values(gen_random_uuid()::text,$1,$2,'local-tenant',false,now(),now(),now()) returning *",
      [name, req.body.description || null],
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    sendError(res, error);
  }
});

app.patch("/api/fabrics/types/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "update local_fabric_types set name=coalesce(nullif($2,''),name),description=coalesce($3,description),local_modified_at=now(),updated_at=now() where id=$1 returning *",
      [req.params.id, req.body?.name || null, req.body?.description ?? null],
    );
    if (!rows[0])
      return res.status(404).json({ message: "Không tìm thấy loại vải." });
    res.json(rows[0]);
  } catch (error) {
    sendError(res, error);
  }
});

app.delete("/api/fabrics/types/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "delete from local_fabric_types where id=$1 returning id",
      [req.params.id],
    );
    if (!rows[0])
      return res.status(404).json({ message: "Không tìm thấy loại vải." });
    res.json(rows[0]);
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/fabrics/variants", async (req, res) => {
  try {
    const name = String(req.body?.variant_name || "").trim();
    if (!name || !req.body?.fabric_type_id)
      throw new Error("Loại vải và tên biến thể là bắt buộc.");
    const { rows } = await pool.query(
      `insert into local_fabric_variants(id,fabric_type_id,variant_name,width_code,weight,color,origin,unit,cost_price,selling_price,tenant_id,is_snapshot_record,local_modified_at,created_at,updated_at)
      values(gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,$9,'local-tenant',false,now(),now(),now()) returning *`,
      [
        req.body.fabric_type_id,
        name,
        req.body.width_code || null,
        req.body.weight || null,
        req.body.color || null,
        req.body.origin || null,
        req.body.unit || "m",
        Number(req.body.cost_price || 0),
        Number(req.body.selling_price || 0),
      ],
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/fabrics/widths", async (req, res) => {
  try {
    const widthCode = String(req.body?.width_code || "").trim();
    if (!widthCode) throw new Error("Mã khổ vải là bắt buộc.");
    const { rows } = await pool.query(
      "insert into local_fabric_widths(id,width_code,description,tenant_id,is_snapshot_record,local_modified_at,created_at,updated_at) values(gen_random_uuid()::text,$1,$2,'local-tenant',false,now(),now(),now()) returning *",
      [widthCode, req.body.description || null],
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    sendError(res, error);
  }
});

// --- So vai: moi thay doi ton do may chu tinh, ghi cung giao dich trong 1 buoc ---
const FABRIC_TRANSACTION_SIGN: Record<string, number> = {
  inbound: 1,
  transfer_in: 1,
  outbound: -1,
  transfer_out: -1,
  adjustment: 0,
};
const FABRIC_STOCK_EPSILON = 0.0001;
const fabricActor = (req: express.Request) => {
  try {
    return localActor(req);
  } catch {
    return "local-admin";
  }
};
const FABRIC_UI_VERSION = 2;
// Old browser tabs (loaded before the server-side ledger) send several calls per action.
// Reject them at the first call so nothing is half-written. Machine callers (no Origin) pass.
const assertCurrentFabricClient = (req: express.Request) => {
  if (!req.get("origin")) return;
  if (Number(req.get("x-crm-fabric-ui") || 0) >= FABRIC_UI_VERSION) return;
  throw Object.assign(
    new Error("Màn hình sổ vải đã được cập nhật. Vui lòng tải lại trang (F5) rồi làm lại thao tác này. Chưa có gì được ghi."),
    { status: 409 },
  );
};
const signedFabricQuantity = (type: string, raw: unknown) => {
  if (!(type in FABRIC_TRANSACTION_SIGN))
    throw Object.assign(new Error("Loại giao dịch vải không hợp lệ."), { status: 400 });
  const value = Number(raw);
  if (!Number.isFinite(value))
    throw Object.assign(new Error("Số lượng vải không hợp lệ."), { status: 400 });
  const sign = FABRIC_TRANSACTION_SIGN[type];
  return sign === 0 ? value : sign * Math.abs(value);
};
const fabricKey = (variantId: string, warehouseId: string) =>
  `${variantId}::${warehouseId}`;

// Khoa (va tao neu chua co) dong ton theo thu tu co dinh de tranh deadlock.
async function lockFabricInventoryRows(
  client: Pick<PoolClient, "query">,
  keys: Array<{ variantId: string; warehouseId: string }>,
) {
  const unique = [
    ...new Map(keys.map((k) => [fabricKey(k.variantId, k.warehouseId), k])).values(),
  ].sort((a, b) =>
    fabricKey(a.variantId, a.warehouseId).localeCompare(fabricKey(b.variantId, b.warehouseId)),
  );
  const locked = new Map<string, { current_stock: number; packages_count: number }>();
  for (const key of unique) {
    if (!key.variantId || !key.warehouseId)
      throw Object.assign(new Error("Vải và kho là bắt buộc."), { status: 400 });
    await client.query(
      `insert into local_fabric_inventory(id,fabric_variant_id,warehouse_id,current_stock,packages_count,reserved_stock,minimum_stock,maximum_stock,tenant_id,is_snapshot_record,local_modified_at,last_updated,created_at,updated_at)
      values(gen_random_uuid()::text,$1,$2,0,0,0,0,0,'local-tenant',false,now(),now(),now(),now())
      on conflict (fabric_variant_id,warehouse_id) do nothing`,
      [key.variantId, key.warehouseId],
    );
    const row = (
      await client.query(
        "select current_stock,packages_count from local_fabric_inventory where fabric_variant_id=$1 and warehouse_id=$2 for update",
        [key.variantId, key.warehouseId],
      )
    ).rows[0];
    locked.set(fabricKey(key.variantId, key.warehouseId), {
      current_stock: Number(row?.current_stock || 0),
      packages_count: Number(row?.packages_count || 0),
    });
  }
  return locked;
}

async function applyFabricStockDelta(
  client: Pick<PoolClient, "query">,
  locked: Map<string, { current_stock: number; packages_count: number }>,
  variantId: string,
  warehouseId: string,
  delta: number,
  packagesDelta = 0,
) {
  const key = fabricKey(variantId, warehouseId);
  const current = locked.get(key);
  if (!current) throw new Error("Dòng tồn vải chưa được khoá trước khi ghi.");
  const next = current.current_stock + delta;
  if (delta < 0 && next < -FABRIC_STOCK_EPSILON)
    throw Object.assign(
      new Error(
        `Tồn kho không đủ. Còn ${Number(current.current_stock.toFixed(4))} m, cần ${Number((-delta).toFixed(4))} m.`,
      ),
      { status: 409 },
    );
  await client.query(
    "update local_fabric_inventory set current_stock=current_stock+$1,packages_count=greatest(0,coalesce(packages_count,0)+$2),last_updated=now(),local_modified_at=now(),updated_at=now() where fabric_variant_id=$3 and warehouse_id=$4",
    [delta, packagesDelta, variantId, warehouseId],
  );
  locked.set(key, {
    current_stock: next,
    packages_count: Math.max(0, current.packages_count + packagesDelta),
  });
}

async function insertFabricTransaction(
  client: Pick<PoolClient, "query">,
  row: {
    variantId: string;
    warehouseId: string;
    type: string;
    quantity: number;
    packages?: number;
    unitPrice?: number | null;
    totalAmount?: number | null;
    reference?: string | null;
    supplier?: string | null;
    recipient?: string | null;
    notes?: string | null;
    date?: string | null;
    usageId?: string | null;
    actor: string;
  },
) {
  const { rows } = await client.query(
    `insert into local_fabric_transactions(id,fabric_variant_id,warehouse_id,transaction_type,quantity,packages_count,unit_price,total_amount,reference_number,supplier_name,recipient_name,notes,transaction_date,fabric_usage_id,manager_id,tenant_id,is_snapshot_record,local_modified_at,created_at,updated_at)
    values(gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,coalesce($12::timestamptz,now()),$13,$14,'local-tenant',false,now(),now(),now()) returning *`,
    [
      row.variantId,
      row.warehouseId,
      row.type,
      row.quantity,
      row.packages || 0,
      row.unitPrice ?? null,
      row.totalAmount ?? null,
      row.reference || null,
      row.supplier || null,
      row.recipient || null,
      row.notes || null,
      row.date || null,
      row.usageId || null,
      row.actor,
    ],
  );
  return rows[0];
}

// Chi tao dong ton moi hoac sua muc toi thieu/toi da. So ton chi doi qua giao dich.
app.post("/api/fabrics/inventory", async (req, res) => {
  try {
    const body = req.body || {};
    const variantId = String(body.fabric_variant_id || "").trim();
    const warehouseId = String(body.warehouse_id || "").trim();
    if (!variantId || !warehouseId)
      throw Object.assign(new Error("Vải và kho là bắt buộc."), { status: 400 });
    const actor = fabricActor(req);
    const row = await withLocalTransaction(async (client) => {
      await assertLegacyFabricVariantsWritable(client, [variantId]);
      const existing = (
        await client.query(
          "select * from local_fabric_inventory where fabric_variant_id=$1 and warehouse_id=$2 for update",
          [variantId, warehouseId],
        )
      ).rows[0];
      if (existing) {
        if (
          body.current_stock !== undefined &&
          Math.abs(Number(body.current_stock) - Number(existing.current_stock || 0)) > FABRIC_STOCK_EPSILON
        )
          throw Object.assign(
            new Error(
              "Không sửa thẳng số tồn được nữa. Số tồn chỉ thay đổi qua phiếu nhập, xuất, chuyển kho hoặc điều chỉnh. Vui lòng tải lại trang để dùng màn hình mới.",
            ),
            { status: 409 },
          );
        const { rows } = await client.query(
          "update local_fabric_inventory set minimum_stock=coalesce($3,minimum_stock),maximum_stock=coalesce($4,maximum_stock),local_modified_at=now(),updated_at=now() where fabric_variant_id=$1 and warehouse_id=$2 returning *",
          [
            variantId,
            warehouseId,
            body.minimum_stock === undefined ? null : Number(body.minimum_stock),
            body.maximum_stock === undefined ? null : Number(body.maximum_stock),
          ],
        );
        return rows[0];
      }
      const opening = Number(body.current_stock || 0);
      if (!Number.isFinite(opening) || opening < 0)
        throw Object.assign(new Error("Tồn đầu kỳ không hợp lệ."), { status: 400 });
      const locked = await lockFabricInventoryRows(client, [{ variantId, warehouseId }]);
      await client.query(
        "update local_fabric_inventory set minimum_stock=$3,maximum_stock=$4 where fabric_variant_id=$1 and warehouse_id=$2",
        [variantId, warehouseId, Number(body.minimum_stock || 0), Number(body.maximum_stock || 0)],
      );
      if (opening > 0) {
        await insertFabricTransaction(client, {
          variantId,
          warehouseId,
          type: "adjustment",
          quantity: opening,
          packages: Number(body.packages_count || 0),
          notes: "Tồn đầu kỳ khi tạo dòng tồn",
          actor,
        });
        await applyFabricStockDelta(client, locked, variantId, warehouseId, opening, Number(body.packages_count || 0));
      }
      return (
        await client.query(
          "select * from local_fabric_inventory where fabric_variant_id=$1 and warehouse_id=$2",
          [variantId, warehouseId],
        )
      ).rows[0];
    });
    res.json(row);
  } catch (error) {
    sendError(res, error);
  }
});

// Ghi giao dich va doi ton trong cung 1 buoc. Dau so luong theo loai giao dich.
app.post("/api/fabrics/transactions", async (req, res) => {
  try {
    assertCurrentFabricClient(req);
    const body = req.body || {};
    const variantId = String(body.fabric_variant_id || "").trim();
    const warehouseId = String(body.warehouse_id || "").trim();
    const type = String(body.transaction_type || "adjustment");
    if (!variantId || !warehouseId)
      throw Object.assign(new Error("Vải, kho và số lượng là bắt buộc."), { status: 400 });
    const quantity = signedFabricQuantity(type, body.quantity);
    if (Math.abs(quantity) < FABRIC_STOCK_EPSILON && !Number(body.packages_count || 0))
      throw Object.assign(new Error("Số lượng phải khác 0."), { status: 400 });
    if (type === "adjustment" && !String(body.notes || "").trim())
      throw Object.assign(new Error("Phiếu điều chỉnh phải ghi lý do."), { status: 400 });
    const packagesRaw = Math.abs(Number(body.packages_count || 0));
    const packages = FABRIC_TRANSACTION_SIGN[type] === -1 ? -packagesRaw : type === "adjustment" ? Number(body.packages_count || 0) : packagesRaw;
    const unitPrice = Number(body.unit_price || 0);
    const actor = fabricActor(req);
    const row = await withLocalTransaction(async (client) => {
      await assertLegacyFabricVariantsWritable(client, [variantId]);
      const locked = await lockFabricInventoryRows(client, [{ variantId, warehouseId }]);
      const inserted = await insertFabricTransaction(client, {
        variantId,
        warehouseId,
        type,
        quantity,
        packages,
        unitPrice,
        totalAmount: Number(body.total_amount || Math.abs(quantity) * unitPrice),
        reference: body.reference_number,
        supplier: body.supplier_name,
        recipient: body.recipient_name,
        notes: body.notes,
        date: body.transaction_date,
        actor,
      });
      await applyFabricStockDelta(client, locked, variantId, warehouseId, quantity, packages);
      return inserted;
    });
    res.status(201).json(row);
  } catch (error) {
    sendError(res, error);
  }
});

// Sua giao dich: may chu tu tinh chenh lech va doi ton cung luc.
app.patch("/api/fabrics/transactions/:id", async (req, res) => {
  try {
    assertCurrentFabricClient(req);
    const body = req.body || {};
    const row = await withLocalTransaction(async (client) => {
      const current = (
        await client.query("select * from local_fabric_transactions where id=$1 for update", [req.params.id])
      ).rows[0];
      if (!current) return null;
      if (current.fabric_usage_id)
        throw Object.assign(
          new Error("Giao dịch này thuộc phiếu xuất vải cho đơn. Hãy sửa ở màn Xuất vải cho đơn để hai sổ khớp nhau."),
          { status: 409 },
        );
      const reference = String(current.reference_number || "");
      if (
        /^CK-[0-9a-f]{8}$/i.test(reference) &&
        (await client.query("select 1 from local_fabric_transfers where left(id::text,8)=$1 limit 1", [reference.slice(3)])).rows[0]
      )
        throw Object.assign(
          new Error("Giao dịch này thuộc một phiếu chuyển kho. Không sửa riêng một đầu được, hãy lập phiếu chuyển ngược để hai kho luôn khớp nhau."),
          { status: 409 },
        );
      await assertLegacyFabricVariantsWritable(client, [current.fabric_variant_id]);
      const type = String(current.transaction_type);
      const oldQuantity = Number(current.quantity || 0);
      const newQuantity =
        body.quantity === undefined || body.quantity === null
          ? oldQuantity
          : signedFabricQuantity(type, body.quantity);
      const oldPackages = Number(current.packages_count || 0);
      const newPackages =
        body.packages_count === undefined || body.packages_count === null
          ? oldPackages
          : FABRIC_TRANSACTION_SIGN[type] === -1
            ? -Math.abs(Number(body.packages_count))
            : type === "adjustment"
              ? Number(body.packages_count)
              : Math.abs(Number(body.packages_count));
      const locked = await lockFabricInventoryRows(client, [
        { variantId: String(current.fabric_variant_id), warehouseId: String(current.warehouse_id) },
      ]);
      await applyFabricStockDelta(
        client,
        locked,
        String(current.fabric_variant_id),
        String(current.warehouse_id),
        newQuantity - oldQuantity,
        newPackages - oldPackages,
      );
      const unitPrice = body.unit_price ?? current.unit_price;
      const { rows } = await client.query(
        "update local_fabric_transactions set quantity=$2,packages_count=$3,unit_price=$4,total_amount=$5,notes=coalesce($6,notes),supplier_name=coalesce($7,supplier_name),local_modified_at=now(),updated_at=now() where id=$1 returning *",
        [
          req.params.id,
          newQuantity,
          newPackages,
          unitPrice,
          body.total_amount ?? (unitPrice === null || unitPrice === undefined ? current.total_amount : Math.abs(newQuantity) * Number(unitPrice || 0)),
          body.notes ?? null,
          body.supplier_name ?? null,
        ],
      );
      return rows[0];
    });
    if (!row) return res.status(404).json({ message: "Không tìm thấy giao dịch vải." });
    res.json(row);
  } catch (error) {
    sendError(res, error);
  }
});

// Chuyen kho: tao phieu, 2 giao dich va doi ton 2 kho trong 1 buoc. Thieu ton thi tu choi, khong cat ve 0.
app.post("/api/fabrics/transfers", async (req, res) => {
  try {
    assertCurrentFabricClient(req);
    const body = req.body || {};
    const variantId = String(body.fabric_variant_id || "").trim();
    const fromId = String(body.from_warehouse_id || "").trim();
    const toId = String(body.to_warehouse_id || "").trim();
    const quantity = Number(body.quantity || 0);
    const packages = Math.abs(Number(body.packages_count || 0));
    if (!variantId || !fromId || !toId)
      throw Object.assign(new Error("Vải, kho đi và kho nhận là bắt buộc."), { status: 400 });
    if (fromId === toId)
      throw Object.assign(new Error("Kho đi và kho nhận không được trùng nhau."), { status: 400 });
    if (!Number.isFinite(quantity) || quantity <= 0)
      throw Object.assign(new Error("Số lượng chuyển phải lớn hơn 0."), { status: 400 });
    const actor = fabricActor(req);
    const row = await withLocalTransaction(async (client) => {
      await assertLegacyFabricVariantsWritable(client, [variantId]);
      const names = new Map(
        (
          await client.query("select id,name from local_warehouses where id=any($1::text[])", [[fromId, toId]])
        ).rows.map((w) => [String(w.id), String(w.name)]),
      );
      if (!names.has(fromId) || !names.has(toId))
        throw Object.assign(new Error("Không tìm thấy kho đi hoặc kho nhận."), { status: 400 });
      const locked = await lockFabricInventoryRows(client, [
        { variantId, warehouseId: fromId },
        { variantId, warehouseId: toId },
      ]);
      const note = String(body.notes || "").trim();
      const { rows } = await client.query(
        `insert into local_fabric_transfers(id,fabric_variant_id,from_warehouse_id,to_warehouse_id,quantity,transfer_date,status,notes,approved_by,received_by,manager_id,tenant_id,is_snapshot_record,local_modified_at,created_at,updated_at)
        values(gen_random_uuid()::text,$1,$2,$3,$4,coalesce($5::timestamptz,now()),'completed',$6,$7,$7,$7,'local-tenant',false,now(),now(),now()) returning *`,
        [variantId, fromId, toId, quantity, body.transfer_date || null, note || null, actor],
      );
      const transfer = rows[0];
      await applyFabricStockDelta(client, locked, variantId, fromId, -quantity, -packages);
      await applyFabricStockDelta(client, locked, variantId, toId, quantity, packages);
      await insertFabricTransaction(client, {
        variantId,
        warehouseId: fromId,
        type: "transfer_out",
        quantity: -quantity,
        packages: -packages,
        reference: `CK-${String(transfer.id).slice(0, 8)}`,
        notes: `Chuyển đến ${names.get(toId)}.${note ? " " + note : ""}`,
        date: body.transfer_date,
        actor,
      });
      await insertFabricTransaction(client, {
        variantId,
        warehouseId: toId,
        type: "transfer_in",
        quantity,
        packages,
        reference: `CK-${String(transfer.id).slice(0, 8)}`,
        notes: `Nhận từ ${names.get(fromId)}.${note ? " " + note : ""}`,
        date: body.transfer_date,
        actor,
      });
      return transfer;
    });
    res.status(201).json(row);
  } catch (error) {
    sendError(res, error);
  }
});

// Phieu da hoan tat thi khong doi trang thai tu do; muon hoan thi lap phieu chuyen nguoc.
app.patch("/api/fabrics/transfers/:id/status", async (req, res) => {
  try {
    const row = await withLocalTransaction(async (client) => {
      const current = (
        await client.query("select * from local_fabric_transfers where id=$1 for update", [req.params.id])
      ).rows[0];
      if (!current) return null;
      const next = String(req.body?.status || "");
      if (!["pending", "in_transit", "completed", "cancelled"].includes(next))
        throw Object.assign(new Error("Trạng thái phiếu chuyển không hợp lệ."), { status: 400 });
      if (current.status === "completed" && next !== "completed")
        throw Object.assign(
          new Error("Phiếu chuyển đã hoàn tất và đã đổi tồn. Muốn hoàn lại, hãy lập phiếu chuyển ngược."),
          { status: 409 },
        );
      const { rows } = await client.query(
        "update local_fabric_transfers set status=$2,approved_by=coalesce($3,approved_by),received_by=coalesce($4,received_by),updated_at=now(),local_modified_at=now() where id=$1 returning *",
        [req.params.id, next, req.body?.approved_by || null, req.body?.received_by || null],
      );
      return rows[0];
    });
    if (!row) return res.status(404).json({ message: "Không tìm thấy phiếu chuyển vải." });
    res.json(row);
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/workers", async (_req, res) => {
  try {
    const { rows } =
      await pool.query(`select id, 'local-tenant' tenant_id, user_id, employee_code, display_name,
      null::text primary_cost_center_id, worker_type, is_active, location_code, position_title, employment_type,
      employment_start_date, employment_end_date, payroll_status, 'local-admin' created_by, created_at, updated_at
      from local_workers order by is_active desc, display_name`);
    res.json(rows);
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/workers", async (req, res) => {
  try {
    const displayName = String(
      bodyValue(req.body, "display_name", "displayName") || "",
    ).trim();
    if (!displayName)
      throw new Error("Họ tên nhân viên là bắt buộc.");
    let employeeCode = String(
      bodyValue(req.body, "employee_code", "employeeCode") || "",
    ).trim();
    if (!employeeCode) {
      const existingCodes = await pool.query("select employee_code from local_workers");
      const used = new Set(existingCodes.rows.map((r) => String(r.employee_code || "").trim().toUpperCase()));
      let nextNum = existingCodes.rows.length + 1;
      for (const r of existingCodes.rows) {
        const m = /^NV0*(\d+)$/i.exec(String(r.employee_code || "").trim());
        if (m) {
          const n = Number(m[1]);
          if (Number.isFinite(n) && n >= nextNum) nextNum = n + 1;
        }
      }
      employeeCode = `NV${String(nextNum).padStart(3, "0")}`;
      while (used.has(employeeCode.toUpperCase())) {
        nextNum += 1;
        employeeCode = `NV${String(nextNum).padStart(3, "0")}`;
      }
    }
    const workerType = String(bodyValue(req.body, "worker_type", "workerType") || "SEWER").trim() || "SEWER";
    const { rows } = await pool.query(
      `insert into local_workers(employee_code, display_name, worker_type, position_title)
      values($1,$2,$3,$4) returning id, 'local-tenant' tenant_id, user_id, employee_code, display_name,
      null::text primary_cost_center_id, worker_type, is_active, location_code, position_title, employment_type,
      null::date employment_start_date, null::date employment_end_date, payroll_status, 'local-admin' created_by, created_at, updated_at`,
      [
        employeeCode,
        displayName,
        workerType,
        bodyValue(req.body, "position_title", "positionTitle") || null,
      ],
    );
    // A name-only worker is deliberately a non-financial record. Management
    // configures and approves compensation explicitly before any attendance can
    // become payroll-ready; creating a worker must never invent a wage.
    res.status(201).json({ ...rows[0], created_by: currentLocalActor() });
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/worker-methods", async (req, res) => {
  try {
    const rawDate = String(
      req.query.onDate ||
        req.query.on_date ||
        businessDateKey(),
    );
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate))
      throw new Error("Ngày áp dụng hình thức chấm công không hợp lệ.");
    const { rows } = await pool.query(
      `select distinct on (worker_id) worker_id, attendance_method,
      compensation_type from local_worker_rates
      where status='APPROVED' and effective_from <= $1::date and (effective_to is null or effective_to >= $1::date)
      order by worker_id, effective_from desc, created_at desc`,
      [rawDate],
    );
    res.json(rows);
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/worker-methods", async (req, res) => {
  try {
    const workerId = String(bodyValue(req.body, "worker_id", "workerId") || "");
    const method = String(
      bodyValue(req.body, "attendance_method", "attendanceMethod") || "HOUR",
    );
    const amount = Number(bodyValue(req.body, "rate_amount", "rateAmount"));
    if (!workerId || !Number.isFinite(amount) || amount < 0)
      throw new Error("Nhân sự và đơn giá hợp lệ là bắt buộc.");
    const compensationType =
      method === "DAY"
        ? "MONTHLY_HELPER"
        : method === "OUTPUT"
          ? "PIECE_RATE"
          : "HOURLY";
    const effectiveFrom = String(
      bodyValue(req.body, "effective_from", "effectiveFrom") ||
        businessDateKey(),
    );
    const { rows } = await pool.query(
      `insert into local_worker_rates(worker_id, compensation_type, attendance_method, rate_amount,
      effective_from, effective_to, standard_days_per_month, standard_hours_per_day, unit_basis, reason, is_estimated)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`,
      [
        workerId,
        compensationType,
        method,
        amount,
        effectiveFrom,
        bodyValue(req.body, "effective_to", "effectiveTo") || null,
        Number(
          bodyValue(
            req.body,
            "standard_days_per_month",
            "standardDaysPerMonth",
          ) || 26,
        ),
        Number(
          bodyValue(
            req.body,
            "standard_hours_per_day",
            "standardHoursPerDay",
          ) || 8,
        ),
        method === "DAY" ? "DAY" : method === "OUTPUT" ? "PIECE" : "HOUR",
        bodyValue(req.body, "reason", "reason") || null,
        Boolean(bodyValue(req.body, "is_estimated", "isEstimated")),
      ],
    );
    const rate = rows[0];
    res.json({
      attendance_method: method,
      profile: {
        id: `local-profile-${workerId}`,
        tenant_id: "local-tenant",
        worker_id: workerId,
        default_compensation_type: compensationType,
        monthly_productive_minutes: null,
        currency_code: "VND",
        is_active: true,
        created_by: currentLocalActor(),
        created_at: rate.created_at,
        updated_at: rate.updated_at,
      },
      rate: {
        ...rate,
        tenant_id: "local-tenant",
        created_by: currentLocalActor(),
      },
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/rates", async (req, res) => {
  try {
    const values = req.query.workerId ? [String(req.query.workerId)] : [];
    const { rows } = await pool.query(
      `select r.*, 'local-tenant' tenant_id, 'VND' currency_code, 'local-admin' created_by
      from local_worker_rates r ${values.length ? "where worker_id=$1" : ""} order by effective_from desc, created_at desc`,
      values,
    );
    res.json(
      rows.map((row) => ({
        ...row,
        rate_amount: asNumber(row.rate_amount),
        hourly_rate:
          row.attendance_method === "HOUR" ? asNumber(row.rate_amount) : null,
        piece_rate:
          row.attendance_method === "OUTPUT" ? asNumber(row.rate_amount) : null,
        monthly_rate:
          row.attendance_method === "DAY" ? asNumber(row.rate_amount) : null,
      })),
    );
  } catch (error) {
    sendError(res, error);
  }
});

const createLocalWorkerRate = async (
  req: express.Request,
  res: express.Response,
  forceDraft = false,
) => {
  try {
    const compensationType = String(
      bodyValue(req.body, "compensation_type", "compensationType") || "HOURLY",
    );
    const method =
      compensationType === "PIECE_RATE"
        ? "OUTPUT"
        : compensationType === "HOURLY"
          ? "HOUR"
          : "DAY";
    const amount = Number(
      req.body.hourly_rate ??
        req.body.piece_rate ??
        req.body.monthly_rate ??
        req.body.rate_amount,
    );
    if (!Number.isFinite(amount) || amount < 0)
      throw new Error("Đơn giá không hợp lệ.");
    const workerId = String(req.body.worker_id || "");
    const effectiveFrom = payrollDate(req.body.effective_from, "Ngày hiệu lực");
    const effectiveTo = req.body.effective_to
      ? payrollDate(req.body.effective_to, "Ngày kết thúc")
      : null;
    const reason = String(req.body.reason || "").trim();
    if (!workerId) throw new Error("Nhân sự là bắt buộc.");
    if (forceDraft && !reason)
      throw new Error("Lý do tạo mức lương là bắt buộc.");
    const worker = await pool.query(
      "select id from local_workers where id=$1",
      [workerId],
    );
    if (!worker.rows[0]) throw new Error("Không tìm thấy nhân sự.");
    const { rows } = await pool.query(
      `insert into local_worker_rates(worker_id,compensation_type,attendance_method,rate_amount,effective_from,effective_to,unit_basis,reason,is_estimated,status)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
      [
        workerId,
        compensationType,
        method,
        amount,
        effectiveFrom,
        effectiveTo,
        method === "OUTPUT" ? "PIECE" : method === "HOUR" ? "HOUR" : "DAY",
        reason || null,
        Boolean(req.body.is_estimated),
        forceDraft ? "DRAFT" : req.body.status || "APPROVED",
      ],
    );
    const payload = {
      ...rows[0],
      tenant_id: "local-tenant",
      created_by: currentLocalActor(),
      hourly_rate: method === "HOUR" ? amount : null,
      piece_rate: method === "OUTPUT" ? amount : null,
      monthly_rate: method === "DAY" ? amount : null,
    };
    await payrollAudit(
      "worker_rates",
      rows[0].id,
      "CREATE",
      reason || "Tạo mức lương local",
    );
    res.status(201).json(payload);
  } catch (error) {
    sendError(res, error);
  }
};

app.post("/api/rates", async (req, res) =>
  createLocalWorkerRate(req, res, false),
);
app.post("/api/payroll/rates", async (req, res) =>
  createLocalWorkerRate(req, res, true),
);

async function resolveWorkerRate(
  client: PoolClient,
  workerId: string,
  method: string,
  date: string,
) {
  const { rows } = await client.query(
    `with applicable as (
       select *, dense_rank() over (order by effective_from desc) effective_rank
       from local_worker_rates
       where worker_id=$1 and attendance_method=$2 and status='APPROVED'
         and effective_from <= $3::date
         and (effective_to is null or effective_to >= $3::date)
     )
     select * from applicable where effective_rank=1 order by created_at desc`,
    [workerId, method, date],
  );
  if (rows.length > 1)
    throw new Error(
      "Có nhiều đơn giá hiệu lực cùng ngày. Hãy giữ một mức lương được duyệt trước khi duyệt công.",
    );
  return rows[0] || null;
}

const missingAttendanceRateMessage =
  "Chưa có đơn giá hiệu lực cho ngày chấm công này. Hãy thiết lập và duyệt lương trước khi duyệt công.";

type PendingAttendanceRateSnapshot = {
  attendanceId: string;
  rateId: string;
  rateAmount: string;
  monthlySalarySnapshot: string | null;
  rateBasis: string;
  standardDays: string | null;
};

/**
 * A name-only worker may record DAY/HOUR facts, but those rows intentionally
 * remain unpriced. Before approval we resolve the effective management-approved
 * rate in the same transaction. This function only reads and validates so bulk
 * approval can reject the whole request before its first write.
 */
async function prepareAttendanceRateSnapshot(
  client: PoolClient,
  attendanceId: string,
): Promise<PendingAttendanceRateSnapshot | null> {
  const { rows } = await client.query(
    `select id, worker_id, work_date::text work_date, attendance_method, rate_id,
      rate_amount, calculated_amount, monthly_salary_snapshot, rate_basis,
      workflow_status, check_in_time, check_out_time
     from local_attendance where id=$1 for update`,
    [attendanceId],
  );
  const attendance = rows[0];
  if (!attendance) throw new Error("Không tìm thấy bản ghi chấm công.");

  // Never reinterpret existing priced/history rows. Only the fully blank
  // snapshots created by the unpriced DAY/HOUR capture path are hydrated.
  if (
    attendance.workflow_status !== "SUBMITTED" ||
    attendance.rate_basis !== "UNPRICED_CAPTURE" ||
    attendance.rate_id !== null ||
    attendance.rate_amount !== null ||
    attendance.calculated_amount !== null ||
    (attendance.attendance_method === "DAY" &&
      attendance.monthly_salary_snapshot !== null)
  )
    return null;

  const method = String(attendance.attendance_method);
  if (!['DAY', 'HOUR'].includes(method))
    throw new Error(missingAttendanceRateMessage);
  const rate = await resolveWorkerRate(
    client,
    String(attendance.worker_id),
    method,
    String(attendance.work_date).slice(0, 10),
  );
  if (!rate || !(Number(rate.rate_amount) > 0))
    throw new Error(missingAttendanceRateMessage);

  const standardDays =
    method === "DAY" ? String(rate.standard_days_per_month || "") : null;
  if (
    method === "DAY" &&
    (!Number.isFinite(Number(standardDays)) || Number(standardDays) <= 0)
  )
    throw new Error("Mức lương tháng chưa có số ngày công chuẩn hợp lệ.");

  return {
    attendanceId: String(attendance.id),
    rateId: String(rate.id),
    rateAmount: String(rate.rate_amount),
    monthlySalarySnapshot: method === "DAY" ? String(rate.rate_amount) : null,
    rateBasis:
      method === "DAY"
        ? "MONTHLY_SALARY"
        : attendance.check_in_time && attendance.check_out_time
          ? "HOURLY_RATE_CLOCK"
          : "LEGACY_MANUAL_HOURS",
    standardDays,
  };
}

async function applyAttendanceRateSnapshot(
  client: PoolClient,
  snapshot: PendingAttendanceRateSnapshot | null,
) {
  if (!snapshot) return;
  const { rows } = await client.query(
    `update local_attendance
     set rate_id=$2,
         rate_amount=$3::numeric,
         calculated_amount=case
           when attendance_method='DAY' then day_units * $3::numeric / nullif($6::numeric, 0)
           when attendance_method='HOUR' then worked_minutes / 60 * $3::numeric
         end,
         monthly_salary_snapshot=$4::numeric,
         rate_basis=$5
     where id=$1
       and rate_id is null
       and rate_amount is null
       and calculated_amount is null
     returning id`,
    [
      snapshot.attendanceId,
      snapshot.rateId,
      snapshot.rateAmount,
      snapshot.monthlySalarySnapshot,
      snapshot.rateBasis,
      snapshot.standardDays,
    ],
  );
  if (!rows[0])
    throw new Error("Bản ghi chấm công đã thay đổi, vui lòng tải lại.");
}

async function attendanceRowQuery(
  where: string,
  params: unknown[],
  includeReversed: boolean,
  costVisible = true,
) {
  where += localSourceReadClause("a.worker_id", "a.work_date", params);
  const reversalClause = includeReversed ? "" : "and a.is_reversed=false";
  const { rows } = await pool.query(
    `select a.id, 'FACTORY' source_type, a.production_order_id, a.production_order_number,
    a.production_order_operation_id, a.operation_code, a.operation_name, a.worker_id, w.employee_code, w.display_name worker_name,
    w.worker_type, a.attendance_method, a.work_date, a.day_units, a.work_hours, a.worked_minutes, a.check_in_time, a.check_out_time, a.break_minutes,
    a.output_quantity, a.activity_name, a.rate_amount, a.monthly_salary_snapshot, a.rate_basis, a.calculated_amount, 'DIRECT_LABOR' cost_classification,
    false is_estimated, a.notes, true cost_visible, a.is_reversed, a.reversal_reason, a.workflow_status, a.workflow_reason, a.workflow_at,
    coalesce(c.status, 'OPEN') closure_status, a.created_at from local_attendance a join local_workers w on w.id=a.worker_id
    left join local_day_closures c on c.worker_id=a.worker_id and c.work_date=a.work_date where ${where} ${reversalClause} order by a.work_date desc, a.created_at desc`,
    params,
  );
  return rows.map((row) => ({
    ...Object.fromEntries(
      Object.entries(row).map(([key, value]) => {
        if (
          [
            "rate_amount",
            "monthly_salary_snapshot",
            "calculated_amount",
          ].includes(key) &&
          !costVisible
        )
          return [key, null];
        return [
          key,
          [
            "day_units",
            "work_hours",
            "worked_minutes",
            "output_quantity",
            "rate_amount",
            "monthly_salary_snapshot",
            "calculated_amount",
          ].includes(key)
            ? asNumber(value)
            : value,
        ];
      }),
    ),
    cost_visible: costVisible,
  }));
}

const workflowTransitions: Record<string, string[]> = {
  SUBMITTED: ["APPROVED", "REJECTED"],
  APPROVED: ["LOCKED", "REVERSED"],
  REJECTED: ["SUBMITTED"],
  LOCKED: [],
  REVERSED: [],
};
const allowedWorkflowStatuses = new Set(Object.keys(workflowTransitions));
const allowedDayStatuses = new Set([
  "PRESENT",
  "ABSENT",
  "PAID_LEAVE",
  "UNPAID_LEAVE",
  "HOLIDAY",
  "OFF",
]);
const workBlockingDayStatuses = new Set([
  "ABSENT",
  "PAID_LEAVE",
  "UNPAID_LEAVE",
  "OFF",
]);
const allowedClosureStatuses = new Set([
  "OPEN",
  "EMPLOYEE_CONFIRMED",
  "LEADER_CONFIRMED",
  "REOPENED",
]);

const workflowReason = (body: Record<string, unknown>) =>
  String(bodyValue(body, "reason", "reason") || "").trim();
const workflowKey = (body: Record<string, unknown>) =>
  String(bodyValue(body, "idempotency_key", "idempotencyKey") || randomUUID());

async function withLocalTransaction<T>(
  handler: (client: PoolClient) => Promise<T>,
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await handler(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function requireLocalCapability(client: Pick<PoolClient, "query">, capabilities: string[]) {
  if (["admin", "manager"].includes(currentLocalRole())) return;
  const allowed = await client.query("select 1 from local_employee_permissions where user_id=$1 and permission_type=any($2::text[]) and enabled limit 1", [currentLocalActor(),capabilities]);
  if (!allowed.rows[0]) throw Object.assign(new Error(`Tài khoản thiếu quyền ${capabilities.join(" hoặc ")}.`), { status: 403 });
}

async function assertCuttingReturnCoverage(client: PoolClient, cuttingEstimateLineId: string, returnQuantity: string) {
  const line = (await client.query(`select l.*,e.estimate_kind,e.production_batch_id,e.remake_quantity,e.status estimate_status from local_cutting_estimate_lines l
    join local_cutting_estimates e on e.id=l.estimate_id where l.id=$1 for share`, [cuttingEstimateLineId])).rows[0];
  if (!line) return;
  let protectedOutput = "0";
  if (line.estimate_kind === "BASE") {
    protectedOutput = String((await client.query(`select
      coalesce((select sum(coalesce(a.accepted_quantity,a.allocated_quantity)-a.returned_quantity) from local_assignments a
        where a.production_batch_id=$1 and a.dispatch_stage='CUTTING' and a.dispatch_status<>'REJECTED'),0)
      +coalesce((select sum(p.quantity-coalesce((select sum(coalesce(a.accepted_quantity,a.allocated_quantity)-a.returned_quantity)
        from local_assignments a where a.publication_id=p.id and a.dispatch_status<>'REJECTED'),0)) from local_production_job_publications p
        where p.production_batch_id=$1 and p.stage='CUTTING' and p.status='OPEN'),0) quantity`, [line.production_batch_id])).rows[0].quantity);
  } else {
    protectedOutput = line.estimate_status === "APPROVED" ? String(line.remake_quantity || 0) : "0";
  }
  if (!(Number(protectedOutput) > 0)) return;
  const required = cuttingRequirementForOutput(line, protectedOutput);
  const net = (await client.query("select coalesce(-sum(quantity_delta),0) quantity from local_inventory_movements where cutting_estimate_line_id=$1", [line.id])).rows[0].quantity;
  if ((await client.query("select $1::numeric-$2::numeric<$3::numeric insufficient", [net,returnQuantity,required])).rows[0].insufficient) throw Object.assign(new Error("Không thể hoàn vải làm lượng cấp ròng thấp hơn phần cắt/làm lại đã giữ chỗ."), { status: 409 });
}

async function lockAttendanceIdempotency(
  client: PoolClient,
  entityType: string,
  key: string,
) {
  await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
    `local-attendance-idempotency:${entityType}:${key}`,
  ]);
}

async function lockPayrollSourceShared(client: PoolClient) {
  await client.query(
    "select pg_advisory_xact_lock_shared(hashtextextended('local-attendance-payroll-source-guard', 0))",
  );
}

async function lockAttendanceDay(
  client: PoolClient,
  workerId: string,
  workDate: string,
) {
  await lockPayrollSourceShared(client);
  await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
    `local-attendance-day:local-tenant:${workerId}:${workDate}`,
  ]);
}

async function assertWorkflowWritable(
  client: PoolClient,
  workerId: string,
  workDate: string,
  currentStatus: string,
  options: { allowLeaderReopen?: boolean } = {},
) {
  if (currentStatus === "LOCKED" || currentStatus === "REVERSED")
    throw new Error("Bản ghi đã khóa hoặc đảo, không thể cập nhật.");
  const lockedRun = await client.query(
    `
    select r.id
    from local_payroll_runs r
    join local_payroll_periods p on p.id=r.period_id
    where r.status='LOCKED' and $1::date between p.period_start and p.period_end
    limit 1`,
    [workDate],
  );
  if (lockedRun.rows[0])
    throw new Error(
      "Ngày công đã thuộc kỳ lương bị khóa; hãy tạo phiếu điều chỉnh/kỳ điều chỉnh riêng.",
    );
  const closure = await client.query(
    "select status from local_day_closures where worker_id=$1 and work_date=$2::date",
    [workerId, workDate],
  );
  if (
    closure.rows[0]?.status === "LEADER_CONFIRMED" &&
    !(options.allowLeaderReopen && currentStatus === "LEADER_CONFIRMED")
  ) {
    throw new Error(
      "Ngày công đã được trưởng nhóm xác nhận, không thể ghi thêm hoặc sửa.",
    );
  }
}

async function assertDayStatusAllowsWork(
  client: PoolClient,
  workerId: string,
  workDate: string,
  action: string,
) {
  const { rows } = await client.query(
    "select status from local_day_statuses where worker_id=$1 and work_date=$2::date",
    [workerId, workDate],
  );
  const status = String(rows[0]?.status || "");
  if (workBlockingDayStatuses.has(status))
    throw new Error(`Không thể ${action}: ngày đã đánh dấu ${status}.`);
}

async function assertDayStatusCompatibleWithWork(
  client: PoolClient,
  workerId: string,
  workDate: string,
  status: string,
) {
  if (!workBlockingDayStatuses.has(status)) return;
  const { rows } = await client.query(
    `
    select exists (
      select 1 from local_attendance
      where worker_id=$1 and work_date=$2::date and not is_reversed and workflow_status not in ('REJECTED','REVERSED')
      union all
      select 1 from local_production_entries
      where worker_id=$1 and work_date=$2::date and not is_reversed and workflow_status not in ('REJECTED','REVERSED')
      union all
      select 1 from local_overtime
      where worker_id=$1 and work_date=$2::date and status not in ('REJECTED','REVERSED')
    ) has_active_work`,
    [workerId, workDate],
  );
  if (rows[0]?.has_active_work) {
    throw new Error(
      "Ngày đã có công, sản lượng hoặc tăng ca đang hiệu lực; hãy từ chối/đảo bản ghi trước khi đánh dấu nghỉ hoặc vắng.",
    );
  }
}

// Team leaders can review only workers assigned to their team for the target
// work date. Admin/manager/accountant retain the existing unrestricted review
// scope, while the check stays local-only and never touches Supabase roles.
function localSourceReadClause(
  workerColumn: string,
  dateColumn: string,
  params: unknown[],
) {
  const role = currentLocalRole();
  if (!["employee", "team_leader"].includes(role)) return "";
  params.push(currentLocalActor());
  const actorParam = `$${params.length}`;
  const own = `exists (select 1 from local_workers scoped_worker where scoped_worker.id=${workerColumn} and scoped_worker.user_id=${actorParam} and scoped_worker.is_active)`;
  if (role === "employee") return ` and ${own}`;
  return ` and (${own} or exists (select 1 from local_payroll_team_assignments scoped_team join local_workers scoped_supervisor on scoped_supervisor.id=scoped_team.supervisor_worker_id where scoped_supervisor.user_id=${actorParam} and scoped_supervisor.is_active and scoped_team.worker_id=${workerColumn} and scoped_team.status='ACTIVE' and scoped_team.effective_from<=${dateColumn} and (scoped_team.effective_to is null or scoped_team.effective_to>=${dateColumn})))`;
}

async function assertLocalTeamPermission(client: PoolClient) {
  const { rows } = await client.query(
    "select 1 from local_employee_permissions where user_id=$1 and permission_type='production_attendance_approve' and enabled",
    [currentLocalActor()],
  );
  if (!rows[0])
    throw Object.assign(
      new Error("Tổ trưởng chưa được cấp quyền duyệt chấm công."),
      { status: 403 },
    );
}

function assertLocalReviewTarget(targetStatus: string, entityType?: string) {
  const targets =
    entityType === "DAY_CLOSURE"
      ? ["LEADER_CONFIRMED"]
      : ["APPROVED", "REJECTED"];
  if (currentLocalRole() === "team_leader" && !targets.includes(targetStatus)) {
    throw Object.assign(
      new Error(
        "Tổ trưởng chỉ được duyệt, từ chối hoặc xác nhận ngày công; không được khóa, đảo hay mở lại.",
      ),
      { status: 403 },
    );
  }
}

async function assertLocalSourceWriteScope(
  client: PoolClient,
  workerId: string,
  workDate: string,
) {
  if (currentLocalRole() === "employee") {
    await assertSelfServiceWorker(currentLocalActor(), workerId);
    return;
  }
  if (currentLocalRole() !== "team_leader") return;
  const own = await client.query(
    "select 1 from local_workers where id=$1 and user_id=$2 and is_active",
    [workerId, currentLocalActor()],
  );
  if (own.rows[0]) return;
  await assertLocalReviewScope(client, workerId, workDate);
}

async function assertLocalReviewScope(
  client: PoolClient,
  workerId: string,
  workDate: string,
  entityType?: string,
  entityId?: string,
) {
  if (currentLocalRole() !== "team_leader") return;
  await assertLocalTeamPermission(client);
  const self = await client.query(
    "select 1 from local_workers where id=$1 and user_id=$2",
    [workerId, currentLocalActor()],
  );
  if (self.rows[0])
    throw Object.assign(
      new Error("Tổ trưởng không được tự duyệt ngày công của mình."),
      { status: 403 },
    );
  if (entityType && entityId) {
    const maker = await client.query(
      "select actor_id from local_attendance_workflow_events where entity_type=$1 and entity_id=$2 and action='CREATE' order by created_at desc limit 1",
      [entityType, entityId],
    );
    if (maker.rows[0]?.actor_id === currentLocalActor())
      throw Object.assign(
        new Error(
          "Không được duyệt bản ghi do chính mình tạo. Cần người quản lý duyệt.",
        ),
        { status: 403 },
      );
  }
  const { rows } = await client.query(
    `
    select 1
    from local_payroll_team_assignments ta
    join local_workers supervisor on supervisor.id = ta.supervisor_worker_id
    where supervisor.user_id = $1
      and supervisor.is_active
      and ta.worker_id = $2
      and ta.status = 'ACTIVE'
      and ta.effective_from <= $3::date
      and (ta.effective_to is null or ta.effective_to >= $3::date)
    limit 1`,
    [currentLocalActor(), workerId, workDate],
  );
  if (!rows[0]) {
    throw Object.assign(
      new Error(
        "Tổ trưởng chỉ được duyệt nhân sự thuộc tổ và còn hiệu lực trong ngày công.",
      ),
      { status: 403 },
    );
  }
}

function assertWorkflowTransition(
  currentStatus: string,
  targetStatus: string,
  reason: string,
) {
  assertLocalReviewTarget(targetStatus);
  if (!allowedWorkflowStatuses.has(targetStatus))
    throw new Error("Trạng thái quy trình không hợp lệ.");
  if (currentStatus === targetStatus) return;
  if (!workflowTransitions[currentStatus]?.includes(targetStatus))
    throw new Error(
      `Không thể chuyển từ ${currentStatus} sang ${targetStatus}.`,
    );
  if (["REJECTED", "REVERSED", "SUBMITTED"].includes(targetStatus) && !reason)
    throw new Error("Bắt buộc nhập lý do cho thao tác này.");
}

function workedMinutesFromClock(
  checkIn: string,
  checkOut: string,
  breakMinutes: number,
) {
  const validTime = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!validTime.test(checkIn) || !validTime.test(checkOut))
    throw new Error("Giờ vào và giờ ra phải có dạng HH:MM.");
  if (!Number.isInteger(breakMinutes) || breakMinutes < 0)
    throw new Error("Thời gian nghỉ phải là số phút không âm.");
  const [startHour, startMinute] = checkIn.split(":").map(Number);
  const [endHour, endMinute] = checkOut.split(":").map(Number);
  const elapsed = endHour * 60 + endMinute - (startHour * 60 + startMinute);
  if (elapsed <= 0) throw new Error("Giờ ra phải sau giờ vào trong cùng ngày.");
  if (breakMinutes >= elapsed)
    throw new Error("Thời gian nghỉ phải nhỏ hơn tổng thời gian làm việc.");
  return elapsed - breakMinutes;
}

async function workflowReplay(
  client: PoolClient,
  key: string,
  entityType: string,
) {
  const { rows } = await client.query(
    "select entity_id,to_status,action,reason,idempotency_fingerprint,actor_id from local_attendance_workflow_events where idempotency_key=$1 and entity_type=$2 order by created_at desc limit 1",
    [key, entityType],
  );
  if (rows[0]) {
    if (String(rows[0].actor_id) !== currentLocalActor())
      throw idempotencyConflict(key);
    const tables: Record<string, string> = {
      ATTENDANCE: "local_attendance",
      PRODUCTION_ENTRY: "local_production_entries",
      OVERTIME: "local_overtime",
      DAY_STATUS: "local_day_statuses",
      DAY_CLOSURE: "local_day_closures",
    };
    const table = tables[entityType];
    if (!table) throw idempotencyConflict(key);
    const source = await client.query(
      `select worker_id,work_date::text from ${table} where id=$1`,
      [rows[0].entity_id],
    );
    if (!source.rows[0]) throw idempotencyConflict(key);
    if (rows[0].action === "CREATE")
      await assertLocalSourceWriteScope(
        client,
        String(source.rows[0].worker_id),
        String(source.rows[0].work_date),
      );
    else {
      if (entityType !== "DAY_STATUS")
        assertLocalReviewTarget(String(rows[0].to_status), entityType);
      await assertLocalReviewScope(
        client,
        String(source.rows[0].worker_id),
        String(source.rows[0].work_date),
        entityType,
        String(rows[0].entity_id),
      );
    }
  }
  return rows[0] || null;
}

async function assertIdempotencyReplayActor(
  client: PoolClient,
  key: string,
  entityType: string,
  entityId: string,
) {
  const replay = await workflowReplay(client, key, entityType);
  if (!replay || String(replay.entity_id) !== entityId)
    throw idempotencyConflict(key);
}

function assertWorkflowReplayMatches(
  replay: Record<string, unknown>,
  key: string,
  expected: {
    entityId: string;
    action: string;
    toStatus: string;
    reason?: string | null;
    fingerprint?: string | null;
  },
) {
  const replayReason =
    replay.reason === null || replay.reason === undefined
      ? null
      : String(replay.reason);
  const expectedReason =
    expected.reason === null ||
    expected.reason === undefined ||
    expected.reason === ""
      ? null
      : expected.reason;
  const replayFingerprint =
    replay.idempotency_fingerprint === null ||
    replay.idempotency_fingerprint === undefined
      ? null
      : String(replay.idempotency_fingerprint);
  if (
    String(replay.entity_id) !== expected.entityId ||
    String(replay.action) !== expected.action ||
    String(replay.to_status) !== expected.toStatus ||
    replayReason !== expectedReason ||
    (expected.fingerprint &&
      replayFingerprint &&
      replayFingerprint !== expected.fingerprint)
  ) {
    throw idempotencyConflict(key);
  }
}

async function recordWorkflowEvent(
  client: PoolClient,
  entityType: string,
  entityId: string,
  action: string,
  fromStatus: string | null,
  toStatus: string | null,
  reason: string | null,
  key: string,
  fingerprint: string | null = null,
) {
  await client.query(
    `insert into local_attendance_workflow_events(entity_type,entity_id,action,from_status,to_status,reason,idempotency_key,idempotency_fingerprint,actor_id)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      entityType,
      entityId,
      action,
      fromStatus,
      toStatus,
      reason,
      key,
      fingerprint,
      currentLocalActor(),
    ],
  );
}

const bulkWorkflowSourceOrder = [
  "ATTENDANCE",
  "PRODUCTION_ENTRY",
  "OVERTIME",
] as const;
type BulkWorkflowSourceType = (typeof bulkWorkflowSourceOrder)[number];
type BulkWorkflowTargetStatus = "APPROVED" | "REJECTED";
type BulkWorkflowCandidate = {
  sourceType: BulkWorkflowSourceType;
  id: string;
  workerId: string;
  workDate: string;
  currentStatus: string;
  sourceSignature: string;
};

const bulkWorkflowSourceConfig: Record<
  BulkWorkflowSourceType,
  { table: string; statusColumn: string; activeClause: string }
> = {
  ATTENDANCE: {
    table: "local_attendance",
    statusColumn: "workflow_status",
    activeClause: "not is_reversed",
  },
  PRODUCTION_ENTRY: {
    table: "local_production_entries",
    statusColumn: "workflow_status",
    activeClause: "not is_reversed",
  },
  OVERTIME: {
    table: "local_overtime",
    statusColumn: "status",
    activeClause: "",
  },
};

const bulkWorkflowUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emptyBulkWorkflowCounts = (): Record<BulkWorkflowSourceType, number> => ({
  ATTENDANCE: 0,
  PRODUCTION_ENTRY: 0,
  OVERTIME: 0,
});
const countBulkWorkflowCandidates = (candidates: BulkWorkflowCandidate[]) =>
  candidates.reduce((counts, candidate) => {
    counts[candidate.sourceType] += 1;
    return counts;
  }, emptyBulkWorkflowCounts());
const totalBulkWorkflowCounts = (
  counts: Record<BulkWorkflowSourceType, number>,
) =>
  bulkWorkflowSourceOrder.reduce(
    (total, sourceType) => total + counts[sourceType],
    0,
  );

function parseBulkWorkflowRequest(body: unknown) {
  if (!body || Array.isArray(body) || typeof body !== "object")
    throw new Error("Payload duyệt hàng loạt không hợp lệ.");
  const value = body as Record<string, unknown>;
  const monthValue = bodyValue(value, "month", "month");
  const month = typeof monthValue === "string" ? monthValue.trim() : "";
  const monthMatch = /^(\d{4})-(\d{2})$/.exec(month);
  if (!monthMatch || Number(monthMatch[2]) < 1 || Number(monthMatch[2]) > 12)
    throw new Error("Tháng duyệt phải có dạng YYYY-MM hợp lệ.");

  const targetValue = bodyValue(value, "target_status", "targetStatus");
  const targetStatus =
    typeof targetValue === "string" ? targetValue.trim().toUpperCase() : "";
  if (targetStatus !== "APPROVED" && targetStatus !== "REJECTED")
    throw new Error(
      "Trạng thái duyệt hàng loạt chỉ có thể là APPROVED hoặc REJECTED.",
    );

  const reasonValue = bodyValue(value, "reason", "reason");
  if (
    reasonValue !== undefined &&
    reasonValue !== null &&
    typeof reasonValue !== "string"
  )
    throw new Error("Lý do duyệt hàng loạt không hợp lệ.");
  const reason = typeof reasonValue === "string" ? reasonValue.trim() : "";
  if (reason.length > 2_000)
    throw new Error("Lý do duyệt hàng loạt không được quá 2.000 ký tự.");
  if (targetStatus === "REJECTED" && !reason)
    throw new Error("Bắt buộc nhập lý do khi từ chối hàng loạt.");

  const keyValue = bodyValue(value, "idempotency_key", "idempotencyKey");
  const idempotencyKey = typeof keyValue === "string" ? keyValue.trim() : "";
  if (!idempotencyKey || idempotencyKey.length > 240)
    throw new Error(
      "Idempotency key duyệt hàng loạt là bắt buộc và không được quá 240 ký tự.",
    );

  const workerIdsValue = bodyValue(value, "worker_ids", "workerIds");
  let workerIds: string[] | undefined;
  if (workerIdsValue !== undefined && workerIdsValue !== null) {
    if (!Array.isArray(workerIdsValue))
      throw new Error("Danh sách nhân sự duyệt hàng loạt không hợp lệ.");
    const normalizedWorkerIds = workerIdsValue.map((workerId) => {
      if (
        typeof workerId !== "string" ||
        !bulkWorkflowUuidPattern.test(workerId.trim())
      )
        throw new Error("Danh sách nhân sự có mã không hợp lệ.");
      return workerId.trim().toLowerCase();
    });
    if (normalizedWorkerIds.length > 5_000)
      throw new Error("Phạm vi duyệt hàng loạt vượt quá 5.000 nhân sự.");
    if (new Set(normalizedWorkerIds).size !== normalizedWorkerIds.length)
      throw new Error(
        "Danh sách nhân sự duyệt hàng loạt không được trùng lặp.",
      );
    workerIds = normalizedWorkerIds.sort();
  }

  const sourceTypesValue = bodyValue(value, "source_types", "sourceTypes");
  const rawSourceTypes =
    sourceTypesValue === undefined || sourceTypesValue === null
      ? [...bulkWorkflowSourceOrder]
      : sourceTypesValue;
  if (!Array.isArray(rawSourceTypes) || rawSourceTypes.length === 0)
    throw new Error("Chọn ít nhất một loại bản ghi để duyệt hàng loạt.");
  const sourceTypes = rawSourceTypes.map((sourceType) => {
    const normalized =
      typeof sourceType === "string" ? sourceType.trim().toUpperCase() : "";
    if (!bulkWorkflowSourceOrder.includes(normalized as BulkWorkflowSourceType))
      throw new Error("Loại bản ghi duyệt hàng loạt không hợp lệ.");
    return normalized as BulkWorkflowSourceType;
  });
  if (new Set(sourceTypes).size !== sourceTypes.length)
    throw new Error("Loại bản ghi duyệt hàng loạt không được trùng lặp.");
  sourceTypes.sort(
    (left, right) =>
      bulkWorkflowSourceOrder.indexOf(left) -
      bulkWorkflowSourceOrder.indexOf(right),
  );

  const requestScope = {
    month,
    worker_ids: workerIds ?? null,
    source_types: sourceTypes,
  };
  const requestFingerprint = payloadFingerprint({
    target_status: targetStatus,
    reason: reason || null,
    ...requestScope,
  });
  return {
    month,
    targetStatus: targetStatus as BulkWorkflowTargetStatus,
    reason: reason || null,
    idempotencyKey,
    workerIds,
    sourceTypes,
    requestScope,
    requestFingerprint: payloadFingerprint({requestFingerprint, preview_fingerprint:value.preview_fingerprint??null}),
    previewFingerprint:typeof value.preview_fingerprint==='string'?value.preview_fingerprint:null,
  };
}

async function assertBulkWorkflowWorkerScope(
  client: PoolClient,
  workerIds: string[] | undefined,
) {
  if (!workerIds?.length) return;
  const { rows } = await client.query(
    "select id::text from local_workers where id = any($1::uuid[])",
    [workerIds],
  );
  const found = new Set(rows.map((row) => String(row.id).toLowerCase()));
  const missing = workerIds.filter((workerId) => !found.has(workerId));
  if (missing.length)
    throw new Error("Phạm vi duyệt hàng loạt có nhân sự không tồn tại.");
}

async function listBulkWorkflowCandidates(
  client: PoolClient,
  month: string,
  workerIds: string[] | undefined,
  sourceTypes: BulkWorkflowSourceType[],
  options: {
    idsBySource?: Map<BulkWorkflowSourceType, string[]>;
    forUpdate?: boolean;
  } = {},
) {
  const candidates: BulkWorkflowCandidate[] = [];
  for (const sourceType of sourceTypes) {
    const ids = options.idsBySource?.get(sourceType);
    if (options.idsBySource && !ids?.length) continue;
    const config = bulkWorkflowSourceConfig[sourceType];
    const params: unknown[] = [`${month}-01`];
    const conditions = [
      "work_date >= $1::date",
      "work_date < ($1::date + interval '1 month')",
      `${config.statusColumn} = 'SUBMITTED'`,
      config.activeClause,
    ].filter(Boolean);
    if (workerIds !== undefined) {
      params.push(workerIds);
      conditions.push(`worker_id = any($${params.length}::uuid[])`);
    }
    if (ids?.length) {
      params.push(ids);
      conditions.push(`id = any($${params.length}::uuid[])`);
    }
    const { rows } = await client.query(
      `
      select id::text, worker_id::text, work_date::text, ${config.statusColumn} current_status, jsonb_build_object('fact',local_attendance_semantic_fact(to_jsonb(${config.table})),'revision',coalesce((select revision from local_attendance_day_revisions rev where rev.worker_id=${config.table}.worker_id and rev.work_date=${config.table}.work_date),0))::text source_signature
      from ${config.table}
      where ${conditions.join(" and ")}
      order by worker_id, work_date, id
      ${options.forUpdate ? "for update" : ""}`,
      params,
    );
    candidates.push(
      ...rows.map((row) => ({
        sourceType,
        id: String(row.id),
        workerId: String(row.worker_id),
        workDate: String(row.work_date).slice(0, 10),
        currentStatus: String(row.current_status),
        sourceSignature:String(row.source_signature),
      })),
    );
  }
  return candidates;
}

app.post('/api/attendance/bulk-preview',async(req,res)=>{try{
  if(!['admin','manager','accountant','team_leader'].includes(currentLocalRole()))throw Object.assign(new Error('Không có quyền duyệt.'),{status:403});
  const request=parseBulkWorkflowRequest({...req.body,idempotency_key:'preview-only'});
  res.json(await withLocalTransaction(async client=>{
    await assertCurrentAttendanceReviewPermission(client);await assertBulkWorkflowWorkerScope(client,request.workerIds);const candidates=await listBulkWorkflowCandidates(client,request.month,request.workerIds,request.sourceTypes);
    for(const row of candidates)await assertLocalReviewScope(client,row.workerId,row.workDate,row.sourceType,row.id);
    return {scope:request.requestScope,candidates:candidates.map(({sourceSignature,...row})=>row),counts:countBulkWorkflowCandidates(candidates),record_count:candidates.length,worker_day_count:new Set(candidates.map(row=>row.workerId+':'+row.workDate)).size,
      fingerprint:payloadFingerprint({scope:request.requestScope,candidates}),ignored_filters:['Hình thức hiển thị','Trạng thái hiển thị']};
  }));
}catch(error){sendError(res,error);}});

app.post("/api/attendance/bulk-workflow", async (req, res) => {
  try {
    if(!['admin','manager','accountant','team_leader'].includes(currentLocalRole()))throw Object.assign(new Error('Không có quyền duyệt.'),{status:403});
    const request = parseBulkWorkflowRequest(req.body);
    const result = await withLocalTransaction(async (client) => {
      await assertCurrentAttendanceReviewPermission(client);
      // A retry of the same request returns the original committed summary. The
      // batch key has its own audit table because individual workflow events
      // require a distinct idempotency key for each source record.
      await lockAttendanceIdempotency(
        client,
        "BULK_WORKFLOW",
        request.idempotencyKey,
      );
      const existing = await client.query(
        `
        select request_fingerprint, result, actor_id
        from local_attendance_bulk_workflow_requests
        where idempotency_key=$1`,
        [request.idempotencyKey],
      );
      if (existing.rows[0]) {
        if (String(existing.rows[0].actor_id) !== currentLocalActor())
          throw idempotencyConflict(request.idempotencyKey);
        if (
          String(existing.rows[0].request_fingerprint) !==
          request.requestFingerprint
        )
          throw idempotencyConflict(request.idempotencyKey);
        if (currentLocalRole() === "team_leader") {
          await assertLocalTeamPermission(client);
          const events = await client.query(
            `
            select idempotency_key,entity_type from local_attendance_workflow_events
            where action='BULK_STATUS' and actor_id=$1
              and left(idempotency_key,length($2))=$2`,
            [currentLocalActor(), `bulk-workflow:${request.idempotencyKey}:`],
          );
          for (const event of events.rows)
            await workflowReplay(
              client,
              String(event.idempotency_key),
              String(event.entity_type),
            );
        }
        return {
          ...(existing.rows[0].result as Record<string, unknown>),
          reused: true,
        };
      }

      await assertBulkWorkflowWorkerScope(client, request.workerIds);
      // Keep payroll snapshotting out of this transaction from the very start,
      // then lock worker/day pairs in one deterministic order before reloading
      // the original submitted candidates with row locks.
      if(request.previewFingerprint)await client.query("select pg_advisory_xact_lock(hashtextextended('local-attendance-payroll-source-guard',0))");else await lockPayrollSourceShared(client);
      const discovered = await listBulkWorkflowCandidates(
        client,
        request.month,
        request.workerIds,
        request.sourceTypes,
      );
      if(request.previewFingerprint && request.previewFingerprint!==payloadFingerprint({scope:request.requestScope,candidates:discovered}))throw Object.assign(new Error('Phạm vi hoặc nguồn đã thay đổi sau preview; xem lại trước khi duyệt.'),{status:409});
      const discoveredCounts = countBulkWorkflowCandidates(discovered);
      const dayPairs = [
        ...new Map(
          discovered.map((candidate) => [
            `${candidate.workerId}:${candidate.workDate}`,
            { workerId: candidate.workerId, workDate: candidate.workDate },
          ]),
        ).values(),
      ].sort(
        (left, right) =>
          left.workerId.localeCompare(right.workerId) ||
          left.workDate.localeCompare(right.workDate),
      );
      for (const pair of dayPairs)
        await lockAttendanceDay(client, pair.workerId, pair.workDate);

      const idsBySource = new Map<BulkWorkflowSourceType, string[]>();
      for (const sourceType of request.sourceTypes)
        idsBySource.set(
          sourceType,
          discovered
            .filter((candidate) => candidate.sourceType === sourceType)
            .map((candidate) => candidate.id),
        );
      const eligible = await listBulkWorkflowCandidates(
        client,
        request.month,
        request.workerIds,
        request.sourceTypes,
        { idsBySource, forUpdate: true },
      );
      const eligibleCounts = countBulkWorkflowCandidates(eligible);

      const pendingRateSnapshots = new Map<
        string,
        PendingAttendanceRateSnapshot | null
      >();
      // Validate every source fact before the first write. If even one record
      // belongs to a leader-confirmed day or locked payroll period, the whole
      // transaction rolls back without leaving a partial approval behind.
      for (const candidate of eligible) {
        await assertLocalReviewScope(
          client,
          candidate.workerId,
          candidate.workDate,
          candidate.sourceType,
          candidate.id,
        );
        assertNotFutureDate(candidate.workDate, "Ngày bản ghi chấm công");
        assertWorkflowTransition(
          candidate.currentStatus,
          request.targetStatus,
          request.reason || "",
        );
        await assertWorkflowWritable(
          client,
          candidate.workerId,
          candidate.workDate,
          candidate.currentStatus,
        );
        if (
          request.targetStatus === "APPROVED" &&
          candidate.sourceType === "ATTENDANCE"
        )
          pendingRateSnapshots.set(
            candidate.id,
            await prepareAttendanceRateSnapshot(client, candidate.id),
          );
      }

      const processedCounts = emptyBulkWorkflowCounts();
      for (const candidate of eligible) {
        const config = bulkWorkflowSourceConfig[candidate.sourceType];
        if (candidate.sourceType === "ATTENDANCE")
          await applyAttendanceRateSnapshot(
            client,
            pendingRateSnapshots.get(candidate.id) ?? null,
          );
        const { rows } = await client.query(
          `
          update ${config.table}
          set ${config.statusColumn}=$2,
              workflow_reason=$3,
              workflow_at=now(),
              workflow_actor_id=$4
          where id=$1
            and ${config.statusColumn}='SUBMITTED'
            ${config.activeClause ? `and ${config.activeClause}` : ""}
          returning id::text`,
          [
            candidate.id,
            request.targetStatus,
            request.reason,
            currentLocalActor(),
          ],
        );
        if (!rows[0])
          throw new Error(
            "Bản ghi chấm công đã thay đổi, vui lòng tải lại trước khi duyệt hàng loạt.",
          );
        const recordKey = `bulk-workflow:${request.idempotencyKey}:${candidate.sourceType}:${candidate.id}`;
        await recordWorkflowEvent(
          client,
          candidate.sourceType,
          candidate.id,
          "BULK_STATUS",
          candidate.currentStatus,
          request.targetStatus,
          request.reason,
          recordKey,
          payloadFingerprint({
            batch: request.requestFingerprint,
            source_type: candidate.sourceType,
            entity_id: candidate.id,
            target_status: request.targetStatus,
            reason: request.reason,
          }),
        );
        processedCounts[candidate.sourceType] += 1;
      }

      const skippedCounts = emptyBulkWorkflowCounts();
      for (const sourceType of bulkWorkflowSourceOrder)
        skippedCounts[sourceType] =
          discoveredCounts[sourceType] - eligibleCounts[sourceType];
      const summary = {
        target_status: request.targetStatus,
        scope: request.requestScope,
        discovered: {
          count: totalBulkWorkflowCounts(discoveredCounts),
          by_source: discoveredCounts,
        },
        eligible: {
          count: totalBulkWorkflowCounts(eligibleCounts),
          by_source: eligibleCounts,
        },
        processed: {
          count: totalBulkWorkflowCounts(processedCounts),
          by_source: processedCounts,
        },
        skipped: {
          count: totalBulkWorkflowCounts(skippedCounts),
          by_source: skippedCounts,
        },
        reused: false,
      };
      await client.query(
        `
        insert into local_attendance_bulk_workflow_requests(
          idempotency_key,request_fingerprint,target_status,request_scope,result,actor_id
        ) values($1,$2,$3,$4::jsonb,$5::jsonb,$6)`,
        [
          request.idempotencyKey,
          request.requestFingerprint,
          request.targetStatus,
          JSON.stringify(request.requestScope),
          JSON.stringify(summary),
          currentLocalActor(),
        ],
      );
      return summary;
    });
    res.json(result);
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/attendance", async (req, res) => {
  try {
    res.json({
      rows: await attendanceRowQuery(
        "a.work_date >= $1::date and a.work_date < ($1::date + interval '1 month')",
        [monthStart(req.query.month)],
        Boolean(req.query.includeReversed),
      ),
      timeClockAvailable: true,
      workflowAvailable: true,
    });
  } catch (error) {
    sendError(res, error);
  }
});

// The history view intentionally reads the local append-only event log instead
// of reconstructing transitions from the current status columns. This keeps
// reject/reopen/reverse actions visible after the source row changes again.
app.get("/api/attendance/history", async (req, res) => {
  try {
    const params: unknown[] = [monthStart(req.query.month)];
    const scope = localSourceReadClause(
      "coalesce(a.worker_id, pe.worker_id, o.worker_id, ds.worker_id, dc.worker_id)",
      "coalesce(a.work_date, pe.work_date, o.work_date, ds.work_date, dc.work_date)",
      params,
    );
    const { rows } = await pool.query(
      `
      select e.id, e.entity_type, e.entity_id, e.action, e.from_status, e.to_status,
        e.reason, e.actor_id, e.created_at event_at,
        coalesce(a.work_date, pe.work_date, o.work_date, ds.work_date, dc.work_date) work_date,
        coalesce(a.worker_id, pe.worker_id, o.worker_id, ds.worker_id, dc.worker_id) worker_id,
        w.employee_code, w.display_name worker_name, w.worker_type
      from local_attendance_workflow_events e
      left join local_attendance a
        on e.entity_type = 'ATTENDANCE' and e.entity_id = a.id
      left join local_production_entries pe
        on e.entity_type = 'PRODUCTION_ENTRY' and e.entity_id = pe.id
      left join local_overtime o
        on e.entity_type = 'OVERTIME' and e.entity_id = o.id
      left join local_day_statuses ds
        on e.entity_type = 'DAY_STATUS' and e.entity_id = ds.id
      left join local_day_closures dc
        on e.entity_type = 'DAY_CLOSURE' and e.entity_id = dc.id
      left join local_workers w
        on w.id = coalesce(a.worker_id, pe.worker_id, o.worker_id, ds.worker_id, dc.worker_id)
      where coalesce(a.work_date, pe.work_date, o.work_date, ds.work_date, dc.work_date) >= $1::date
        and coalesce(a.work_date, pe.work_date, o.work_date, ds.work_date, dc.work_date) < ($1::date + interval '1 month')
        ${scope}
      order by e.created_at desc
      limit 5000`,
      params,
    );
    res.json(rows);
  } catch (error) {
    sendError(res, error);
  }
});

// Khi self_service=true, worker_id phải khớp hồ sơ công nhân được liên kết với
// tài khoản đang đăng nhập — chặn nhân viên chấm công thay người khác.
async function assertSelfServiceWorker(actorId: string, workerId: string) {
  const worker = await workerForActor(actorId);
  if (!worker)
    throw Object.assign(
      new Error("Tài khoản chưa được liên kết với hồ sơ công nhân."),
      { status: 403 },
    );
  if (String(worker.id) !== String(workerId)) {
    throw Object.assign(new Error("Bạn chỉ có thể chấm công cho chính mình."), {
      status: 403,
    });
  }
  return worker;
}

async function createAttendance(
  body: Record<string, unknown>,
  production = false,
  transactionClient?: PoolClient,
) {
  const workerId = String(bodyValue(body, "worker_id", "workerId") || "");
  const method = String(
    bodyValue(body, "attendance_method", "attendanceMethod") || "HOUR",
  );
  if (method === "OUTPUT") {
    throw Object.assign(
      new Error("Sản lượng phải báo qua việc đã nhận hoặc phiếu sản lượng độc lập của quản lý có lý do; không ghi vào chấm công ngày/giờ."),
      { status: 409 },
    );
  }
  const date = String(
    bodyValue(body, "work_date", "workDate") ||
      businessDateKey(),
  );
  const idempotencyKey = String(
    bodyValue(body, "idempotency_key", "idempotencyKey") || randomUUID(),
  );
  if (
    !workerId ||
    !["DAY", "HOUR", "OUTPUT"].includes(method) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date)
  )
    throw new Error("Nhân sự, hình thức và ngày chấm công là bắt buộc.");
  if (body.self_service === true)
    await assertSelfServiceWorker(currentLocalActor(), workerId);
  assertNotFutureDate(date, "Ngày chấm công");
  const dayUnits =
    method === "DAY"
      ? Number(bodyValue(body, "day_units", "dayUnits") || 0)
      : null;
  const checkIn =
    method === "HOUR"
      ? String(bodyValue(body, "check_in_time", "checkInTime") || "")
      : null;
  const checkOut =
    method === "HOUR"
      ? String(bodyValue(body, "check_out_time", "checkOutTime") || "")
      : null;
  const breakMinutes =
    method === "HOUR"
      ? Number(bodyValue(body, "break_minutes", "breakMinutes") || 0)
      : 0;
  const manualWorkHours =
    method === "HOUR"
      ? Number(bodyValue(body, "work_hours", "workHours") || 0)
      : null;
  const workedMinutes =
    method === "HOUR"
      ? checkIn && checkOut
        ? workedMinutesFromClock(checkIn, checkOut, breakMinutes)
        : production &&
            Number.isFinite(manualWorkHours) &&
            (manualWorkHours ?? 0) > 0
          ? Math.round((manualWorkHours ?? 0) * 60 * 100) / 100
          : (() => {
              throw new Error(
                "Chấm công theo giờ bắt buộc nhập giờ vào, giờ ra và thời gian nghỉ.",
              );
            })()
      : null;
  const workHours =
    method === "HOUR" && workedMinutes !== null ? workedMinutes / 60 : null;
  const outputQuantity =
    method === "OUTPUT"
      ? Number(bodyValue(body, "output_quantity", "outputQuantity") || 0)
      : null;
  const attendanceFingerprint = payloadFingerprint({
    production,
    workerId,
    method,
    date,
    dayUnits,
    workedMinutes,
    outputQuantity,
    productionOrderId: production
      ? bodyValue(body, "production_order_id", "productionOrderId") || null
      : null,
    operationId: production
      ? bodyValue(body, "operation_id", "operationId") || null
      : null,
    checkIn,
    checkOut,
    breakMinutes,
    activityName: bodyValue(body, "activity_name", "activityName") || null,
    notes: body.notes || null,
  });
  const execute = async (client: PoolClient) => {
    // Lock the request key first, then the worker/day. Keeping one lock order
    // prevents duplicate retries and closure/status writes from racing.
    await lockAttendanceIdempotency(client, "ATTENDANCE", idempotencyKey);
    const existing = await client.query(
      "select * from local_attendance where idempotency_key=$1",
      [idempotencyKey],
    );
    if (existing.rows[0]) {
      await assertIdempotencyReplayActor(
        client,
        idempotencyKey,
        "ATTENDANCE",
        String(existing.rows[0].id),
      );
      if (
        existing.rows[0].idempotency_fingerprint &&
        existing.rows[0].idempotency_fingerprint !== attendanceFingerprint
      )
        throw idempotencyConflict(idempotencyKey);
      if (!existing.rows[0].idempotency_fingerprint)
        await client.query(
          "update local_attendance set idempotency_fingerprint=$2 where id=$1",
          [existing.rows[0].id, attendanceFingerprint],
        );
      return {
        id: existing.rows[0].id,
        reused: true,
        attendance_method: existing.rows[0].attendance_method,
        attendance_value: Number(
          existing.rows[0].day_units ||
            existing.rows[0].work_hours ||
            existing.rows[0].output_quantity ||
            0,
        ),
        cost_visible: true,
        calculated_amount: asNumber(existing.rows[0].calculated_amount),
      };
    }
    await lockAttendanceDay(client, workerId, date);
    await assertLocalSourceWriteScope(client, workerId, date);
    await assertWorkflowWritable(client, workerId, date, "SUBMITTED");
    await assertDayStatusAllowsWork(client, workerId, date, "ghi chấm công");
    const worker = await client.query(
      "select id from local_workers where id=$1 and is_active=true",
      [workerId],
    );
    if (!worker.rows[0])
      throw new Error("Nhân sự không tồn tại hoặc đã ngưng làm việc.");
    const rate = await resolveWorkerRate(client, workerId, method, date);
    if (!rate && method === "OUTPUT")
      throw new Error(
        "Nhân sự chưa có đơn giá hiệu lực cho hình thức chấm công này.",
      );
    const value =
      method === "HOUR"
        ? (workedMinutes ?? 0) / 60
        : (dayUnits ?? outputQuantity ?? 0);
    if (!Number.isFinite(value) || value <= 0)
      throw new Error("Giá trị chấm công phải lớn hơn 0.");
    // Keep the source rate as a PostgreSQL numeric snapshot. JavaScript is only
    // used for input validation; the actual amount is calculated in SQL below.
    const monthlySalarySnapshot =
      rate && method === "DAY" ? String(rate.rate_amount) : null;
    const rateBasis = !rate
      ? "UNPRICED_CAPTURE"
      : method === "DAY"
        ? "MONTHLY_SALARY"
        : method === "HOUR"
          ? checkIn && checkOut
            ? "HOURLY_RATE_CLOCK"
            : "LEGACY_MANUAL_HOURS"
          : "LEGACY_OUTPUT_RATE";
    const standardDays = rate ? String(rate.standard_days_per_month || "") : null;
    if (
      rate &&
      method === "DAY" &&
      (!Number.isFinite(Number(standardDays)) || Number(standardDays) <= 0)
    ) {
      throw new Error("Mức lương tháng chưa có số ngày công chuẩn hợp lệ.");
    }
    const { rows } = await client.query(
      `insert into local_attendance(worker_id, production_order_id, production_order_operation_id, attendance_method, work_date,
      day_units, work_hours, worked_minutes, check_in_time, check_out_time, break_minutes, output_quantity, rate_id, rate_amount, calculated_amount, monthly_salary_snapshot, rate_basis, activity_name, idempotency_key, idempotency_fingerprint, notes, workflow_status)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
        case
          when $13::uuid is null or $14::numeric is null then null
          when $4='DAY' then $6::numeric * $14::numeric / nullif($15::numeric, 0)
          when $4='HOUR' then $8::numeric / 60 * $14::numeric
          when $4='OUTPUT' then $12::numeric * $14::numeric
        end,
        $16,$17,$18,$19,$20,$21,'SUBMITTED') returning id,calculated_amount`,
      [
        workerId,
        production
          ? bodyValue(body, "production_order_id", "productionOrderId") || null
          : null,
        production
          ? bodyValue(body, "operation_id", "operationId") || null
          : null,
        method,
        date,
        dayUnits,
        workHours,
        workedMinutes,
        checkIn,
        checkOut,
        breakMinutes,
        outputQuantity,
        rate?.id ?? null,
        rate?.rate_amount ?? null,
        standardDays,
        monthlySalarySnapshot,
        rateBasis,
        bodyValue(body, "activity_name", "activityName") || null,
        idempotencyKey,
        attendanceFingerprint,
        body.notes || null,
      ],
    );
    await recordWorkflowEvent(
      client,
      "ATTENDANCE",
      String(rows[0].id),
      "CREATE",
      null,
      "SUBMITTED",
      body.notes ? String(body.notes) : null,
      idempotencyKey,
      attendanceFingerprint,
    );
    return {
      id: rows[0].id,
      reused: false,
      attendance_method: method,
      attendance_value: value,
      cost_visible: true,
      calculated_amount: asNumber(rows[0].calculated_amount),
    };
  };
  return transactionClient ? execute(transactionClient) : withLocalTransaction(execute);
}

app.post("/api/attendance", async (req, res) => {
  try {
    res.status(201).json(await createAttendance(req.body));
  } catch (error) {
    sendError(res, error);
  }
});
app.post("/api/production-attendance", async (req, res) => {
  try {
    res.status(201).json(await createAttendance(req.body, true));
  } catch (error) {
    sendError(res, error);
  }
});

// ── Self-service: nhân viên chấm công cho tài khoản của chính mình ──
// Danh tính worker LUÔN suy ra từ phiên đăng nhập (local_workers.user_id =
// actor). Client không bao giờ được tin cậy khi gửi worker_id.

// Trả về worker đang hoạt động được liên kết với tài khoản đang đăng nhập.
async function workerForActor(actorId: string) {
  const { rows } = await pool.query(
    `select id, employee_code, display_name, worker_type from local_workers
     where user_id = $1 and is_active = true limit 1`,
    [actorId],
  );
  return rows[0] || null;
}

const selfAttendanceMethodLabel = (method: string) => {
  if (method === "OUTPUT") return "Theo sản lượng";
  if (method === "DAY") return "Theo ngày công";
  return "Theo giờ làm";
};

/**
 * Resolve the employee's attendance flow from approved rates and payroll sources.
 * The browser may display this context, but the API also uses it to reject a
 * self-service submission that does not match the approved configuration.
 */
async function attendanceContextForWorker(workerId: string, workDate: string) {
  const date = payrollDate(workDate, "Ngày chấm công");
  const { rows } = await pool.query(
    `select distinct on (r.attendance_method) r.id::text rate_id, r.compensation_type, r.attendance_method,
      r.rate_amount::numeric::text rate_amount, r.unit_basis,
      r.effective_from::text effective_from, r.effective_to::text effective_to,
      coalesce(r.reason, '') reason
     from local_worker_rates r
     where r.worker_id=$1 and r.status='APPROVED'
       and r.effective_from <= $2::date
       and (r.effective_to is null or r.effective_to >= $2::date)
       and r.attendance_method in ('DAY','HOUR','OUTPUT')
     order by r.attendance_method,
       r.effective_from desc, r.created_at desc`,
    [workerId, date],
  );
  const components = rows.map((row) => ({
    ...row,
    rate_amount: asNumber(row.rate_amount),
    label: selfAttendanceMethodLabel(String(row.attendance_method)),
  }));
  const methods = Array.from(
    new Set(components.map((row) => String(row.attendance_method))),
  );
  try {
    const source = await payrollSourceContext(pool, workerId, date);
    if (source.assignment.compensation_type === 'PIECE_RATE' && source.profile.piece_output_enabled === true && !methods.includes('OUTPUT')) {
      methods.push('OUTPUT');
    }
  } catch (error) {
    // Incomplete approved source configuration cannot authorize product output.
    if (Number((error as { status?: number }).status) !== 409) throw error;
  }
  const primaryMethod = methods.includes("HOUR")
    ? "HOUR"
    : methods.includes("DAY")
      ? "DAY"
      : methods.includes("OUTPUT")
        ? "OUTPUT"
        : null;
  const primaryComponent = components.find(
    (row) => row.attendance_method === primaryMethod,
  );
  const monthlyOnly =
    methods.length === 1 &&
    primaryMethod === "DAY" &&
    String(primaryComponent?.compensation_type || "").startsWith("MONTHLY");
  const mode = monthlyOnly
    ? "MONTHLY"
    : methods.length > 1
      ? "MIXED"
      : primaryMethod;
  const label =
    mode === "MONTHLY"
      ? "Lương tháng – xác nhận ngày công"
      : mode === "MIXED"
      ? `Kết hợp: ${methods.map(selfAttendanceMethodLabel).join(" + ")}`
      : primaryMethod
        ? selfAttendanceMethodLabel(primaryMethod)
        : "Chưa cấu hình cách chấm công";
  return {
    work_date: date,
    configured: methods.length > 0,
    mode,
    primary_method: primaryMethod,
    methods,
    label,
    instructions:
      mode === "MONTHLY"
        ? "Chọn trạng thái ngày công; nếu đi làm, xác nhận số ngày công thực tế."
        : mode === "OUTPUT"
        ? "Chọn việc hoặc mã công may được giao, nhập sản lượng cuối ca."
        : mode === "MIXED"
          ? "Ghi ngày/giờ công ở biểu mẫu này; sản lượng nhập tại việc cắt/may được giao."
          : primaryMethod === "DAY"
            ? "Chọn ngày làm và số ngày công thực tế."
            : primaryMethod === "HOUR"
              ? "Nhập giờ vào, giờ ra và thời gian nghỉ giữa ca."
              : "Quản lý chưa cấu hình cách chấm công cho ngày này.",
    components,
  };
}

// Bắt buộc có worker liên kết; ném 403 nếu tài khoản chưa gắn hồ sơ công nhân.
async function requireSelfWorker(req: express.Request) {
  const actor = localActor(req);
  const worker = await workerForActor(actor);
  if (!worker)
    throw Object.assign(
      new Error(
        "Tài khoản chưa được liên kết với hồ sơ công nhân. Liên hệ quản lý để gắn tài khoản.",
      ),
      { status: 403 },
    );
  return { actor, worker };
}

// This narrower reader rejects ambiguous links and is rechecked under the source guard.
async function payrollSelfWorker(db: Pick<PoolClient, 'query'>, actor: string, expectedId?: string) {
  const profile = await db.query('select user_id from local_user_profiles where user_id=$1 and is_active for share', [actor]);
  const roles = await db.query('select user_id from local_user_roles where user_id=$1 and is_active for share', [actor]);
  const workers = await db.query('select id::text from local_workers where user_id=$1 and is_active order by id for share', [actor]);
  if (!profile.rows.length || !roles.rows.length || workers.rows.length !== 1 || (expectedId && workers.rows[0].id !== expectedId))
    throw Object.assign(new Error('Tài khoản cần được liên kết với đúng một hồ sơ nhân sự đang hoạt động để xem lương tháng.'), {status:403});
  return String(workers.rows[0].id);
}

app.get('/api/my-attendance/payroll-month', async (req, res) => {
  res.setHeader('cache-control', 'no-store');
  try {
    if (Object.keys(req.query).some(key => key !== 'month')) throw Object.assign(new Error('Chỉ được chọn tháng cho bảng lương của chính mình.'), {status:400});
    const month = String(req.query.month || '');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || Number(month.slice(0,4)) < 1) throw new Error('Tháng lương không hợp lệ.');
    const actor = localActor(req);
    const workerId = await payrollSelfWorker(pool, actor);
    const year = Number(month.slice(0,4)), number = Number(month.slice(5));
    const leap = year%4===0 && (year%100!==0 || year%400===0);
    const days = [31,leap?29:28,31,30,31,30,31,31,30,31,30,31][number-1];
    res.json(await createLocalPayrollRun({period_start:month+'-01',period_end:month+'-'+days}, true, {actor,workerId}));
  } catch (error) { sendError(res,error); }
});

app.get("/api/my-attendance", async (req, res) => {
  try {
    const { worker } = await requireSelfWorker(req);
    const rows = await attendanceRowQuery(
      "a.worker_id = $1::uuid and a.work_date >= $2::date and a.work_date < ($2::date + interval '1 month')",
      [worker.id, monthStart(req.query.month)],
      Boolean(req.query.includeReversed),
      !["employee", "team_leader"].includes(currentLocalRole()),
    );
    res.json({ rows, worker });
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/my-attendance/context", async (req, res) => {
  try {
    const { worker } = await requireSelfWorker(req);
    const date = String(
      req.query.date || req.query.workDate || localTodayDateKey(),
    );
    res.json({
      worker,
      ...(await attendanceContextForWorker(worker.id, date)),
    });
  } catch (error) {
    sendError(res, error);
  }
});

// Trạng thái ngày công tự phục vụ: nhân viên chỉ được đọc hồ sơ ngày công của
// chính mình. Route riêng giúp UI không phải gọi route quản trị.
app.get("/api/my-attendance/day-status", async (req, res) => {
  try {
    const { worker } = await requireSelfWorker(req);
    const { rows } = await pool.query(
      `select d.id, d.worker_id, d.work_date, d.status, d.meal_eligible,
              d.reason, d.created_at
         from local_day_statuses d
        where d.worker_id=$1
          and d.work_date >= $2::date
          and d.work_date < ($2::date + interval '1 month')
        order by d.work_date desc, d.created_at desc`,
      [worker.id, monthStart(req.query.month)],
    );
    res.json(rows);
  } catch (error) {
    sendError(res, error);
  }
});

// Nhân viên tự ghi chấm công. worker_id từ body bị ghi đè bởi worker của chính
// họ — không thể chấm công thay người khác qua API này.
app.post("/api/my-attendance", async (req, res) => {
  try {
    const { worker } = await requireSelfWorker(req);
    const workDate = String(
      req.body?.work_date || req.body?.workDate || localTodayDateKey(),
    );
    const context = await attendanceContextForWorker(worker.id, workDate);
    if (!context.configured)
      throw Object.assign(
        new Error("Chưa có cấu hình cách chấm công cho ngày này. Liên hệ quản lý."),
        { status: 409 },
      );
    const requestedMethod = String(
      req.body?.attendance_method || req.body?.attendanceMethod || "",
    ).toUpperCase();
    if (requestedMethod !== context.primary_method || requestedMethod === "OUTPUT")
      throw Object.assign(
        new Error(`Bản ghi phải theo cấu hình hiện tại: ${context.label}.`),
        { status: 409 },
      );
    if (
      requestedMethod === "OUTPUT"
    ) {
      throw new Error(
        "Chấm sản lượng phải chọn sản phẩm và ghi qua phiếu sản lượng chi tiết.",
      );
    }
    const body = {
      ...(req.body || {}),
      worker_id: worker.id,
      self_service: false,
    };
    const result = await createAttendance(body, false);
    const costVisible = !["employee", "team_leader"].includes(
      currentLocalRole(),
    );
    res.status(result.reused ? 200 : 201).json({
      ...result,
      cost_visible: costVisible,
      calculated_amount: costVisible ? result.calculated_amount : null,
    });
  } catch (error) {
    sendError(res, error);
  }
});

// Nhân viên hưởng lương tháng xác nhận trạng thái ngày công. Danh tính worker
// luôn lấy từ phiên đăng nhập, tuyệt đối không nhận worker_id từ trình duyệt.
app.post("/api/my-attendance/day-status", async (req, res) => {
  try {
    const { worker } = await requireSelfWorker(req);
    const date = String(
      bodyValue(req.body, "work_date", "workDate") || localTodayDateKey(),
    );
    const status = String(
      bodyValue(req.body, "status", "status") || "PRESENT",
    ).toUpperCase();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !allowedDayStatuses.has(status))
      throw new Error("Ngày và trạng thái ngày công không hợp lệ.");
    assertNotFutureDate(date, "Ngày trạng thái công");
    const context = await attendanceContextForWorker(worker.id, date);
    if (
      !context.configured ||
      !["MONTHLY", "DAY", "MIXED"].includes(String(context.mode))
    )
      throw Object.assign(
        new Error(
          "Tài khoản này không sử dụng luồng xác nhận ngày công. Hệ thống đã cấu hình cách chấm riêng cho bạn.",
        ),
        { status: 409 },
      );
    const mealEligible = Boolean(
      bodyValue(req.body, "meal_eligible", "mealEligible"),
    );
    const reasonValue = bodyValue(req.body, "reason", "reason");
    const reason = reasonValue ? String(reasonValue).trim() || null : null;
    const key = workflowKey(req.body);
    const fingerprint = payloadFingerprint({
      workerId: worker.id,
      date,
      status,
      mealEligible,
      reason,
    });
    const result = await withLocalTransaction(async (client) => {
      await lockAttendanceIdempotency(client, "DAY_STATUS", key);
      const keyed = (
        await client.query(
          "select id,worker_id,work_date,status,idempotency_fingerprint from local_day_statuses where idempotency_key=$1",
          [key],
        )
      ).rows[0];
      if (keyed) {
        if (
          String(keyed.worker_id) !== String(worker.id) ||
          String(keyed.work_date) !== date ||
          (keyed.idempotency_fingerprint &&
            keyed.idempotency_fingerprint !== fingerprint)
        )
          throw idempotencyConflict(key);
        return {
          id: keyed.id,
          worker_id: worker.id,
          work_date: date,
          status: keyed.status,
          reused: true,
        };
      }
      await lockAttendanceDay(client, worker.id, date);
      await assertWorkflowWritable(client, worker.id, date, "SUBMITTED");
      await assertDayStatusCompatibleWithWork(client, worker.id, date, status);
      const existing = await client.query(
        "select id,status from local_day_statuses where worker_id=$1 and work_date=$2::date for update",
        [worker.id, date],
      );
      const { rows } = await client.query(
        `insert into local_day_statuses(
           worker_id,work_date,status,meal_eligible,reason,idempotency_key,idempotency_fingerprint,workflow_actor_id
         ) values($1,$2,$3,$4,$5,$6,$7,$8)
         on conflict(worker_id,work_date) do update set
           status=excluded.status,
           meal_eligible=excluded.meal_eligible,
           reason=excluded.reason,
           idempotency_key=excluded.idempotency_key,
           idempotency_fingerprint=excluded.idempotency_fingerprint,
           workflow_actor_id=excluded.workflow_actor_id
         returning id,worker_id,work_date,status,meal_eligible`,
        [
          worker.id,
          date,
          status,
          mealEligible,
          reason,
          key,
          fingerprint,
          currentLocalActor(),
        ],
      );
      await recordWorkflowEvent(
        client,
        "DAY_STATUS",
        String(rows[0].id),
        "UPSERT",
        existing.rows[0]?.status || null,
        status,
        reason,
        key,
        fingerprint,
      );
      return { ...rows[0], reused: false };
    });
    res.status(result.reused ? 200 : 201).json(result);
  } catch (error) {
    sendError(res, error);
  }
});

// Dữ liệu tự ghi của nhân viên: tăng ca và phiếu sản lượng được đọc theo worker
// liên kết trong phiên local, không nhận worker_id từ phía client.
app.get("/api/my-attendance/overtime", async (req, res) => {
  try {
    const { worker } = await requireSelfWorker(req);
    const { rows } = await pool.query(
      `select id, work_date, overtime_type, overtime_minutes, reason, status, created_at
       from local_overtime where worker_id=$1 and work_date >= $2::date and work_date < ($2::date + interval '1 month')
       order by work_date desc, created_at desc`,
      [worker.id, monthStart(req.query.month)],
    );
    res.json(rows);
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/my-attendance/production-entries", async (req, res) => {
  try {
    const { worker } = await requireSelfWorker(req);
    const costVisible = !["employee", "team_leader"].includes(
      currentLocalRole(),
    );
    const { rows } = await pool.query(
      `select e.id, e.product_id, e.piece_rate_code, e.piece_rate_name_snapshot, e.rate_unit_snapshot, e.work_date, e.quantity, e.rate_amount, e.calculated_amount,
        e.workflow_status, e.workflow_reason, e.notes, e.created_at,
        p.sku, p.sku product_sku, coalesce(e.piece_rate_name_snapshot, r.piece_rate_name, p.name) product_name,
        coalesce(e.rate_unit_snapshot, r.rate_unit, p.rate_unit) rate_unit
       from local_production_entries e
       left join local_products p on p.id=e.product_id
       left join local_product_rates r on r.id=e.rate_id
       where e.worker_id=$1 and e.is_reversed=false and e.work_date >= $2::date and e.work_date < ($2::date + interval '1 month')
       order by e.work_date desc, e.created_at desc`,
      [worker.id, monthStart(req.query.month)],
    );
    res.json(
      rows.map((r) => ({
        ...r,
        piece_rate_code: r.piece_rate_code || null,
        quantity: asNumber(r.quantity),
        rate_amount: costVisible ? asNumber(r.rate_amount) : null,
        calculated_amount: costVisible ? asNumber(r.calculated_amount) : null,
        cost_visible: costVisible,
      })),
    );
  } catch (error) {
    sendError(res, error);
  }
});

// Dùng chung cho quản lý ghi tăng ca và nhân viên tự ghi tăng ca. Khi gọi
// từ self-service, worker_id đã được lấy từ phiên đăng nhập ở route bên dưới.
async function createOvertime(
  body: Record<string, unknown>,
  workerOverride?: string,
  transactionClient?: PoolClient,
) {
  const workerId =
    workerOverride || String(body.worker_id || body.workerId || "");
  const workDate = String(body.work_date || body.workDate || "");
  const minutes = Number(body.overtime_minutes ?? body.overtimeMinutes);
  const reason = String(body.reason || "").trim();
  if (
    !workerId ||
    !/^\d{4}-\d{2}-\d{2}$/.test(workDate) ||
    !Number.isInteger(minutes) ||
    minutes <= 0 ||
    !reason
  ) {
    throw new Error("Nhân sự, ngày, số phút và lý do làm thêm là bắt buộc.");
  }
  if (body.self_service === true)
    await assertSelfServiceWorker(currentLocalActor(), workerId);
  assertNotFutureDate(workDate, "Ngày tăng ca");
  const key = workflowKey(body);
  const overtimeFingerprint = payloadFingerprint({
    workerId,
    workDate,
    overtimeType: body.overtime_type || body.overtimeType || "NORMAL",
    minutes,
    reason,
  });
  const execute = async (client: PoolClient) => {
    await lockAttendanceIdempotency(client, "OVERTIME", key);
    const keyed = await client.query(
      "select id,idempotency_fingerprint,status from local_overtime where idempotency_key=$1",
      [key],
    );
    if (keyed.rows[0]) {
      await assertIdempotencyReplayActor(
        client,
        key,
        "OVERTIME",
        String(keyed.rows[0].id),
      );
      if (
        keyed.rows[0].idempotency_fingerprint &&
        keyed.rows[0].idempotency_fingerprint !== overtimeFingerprint
      )
        throw idempotencyConflict(key);
      if (!keyed.rows[0].idempotency_fingerprint)
        await client.query(
          "update local_overtime set idempotency_fingerprint=$2 where id=$1",
          [keyed.rows[0].id, overtimeFingerprint],
        );
      return {
        id: keyed.rows[0].id,
        reused: true,
        status: keyed.rows[0].status,
      };
    }
    await lockAttendanceDay(client, workerId, workDate);
    await assertLocalSourceWriteScope(client, workerId, workDate);
    await assertWorkflowWritable(client, workerId, workDate, "SUBMITTED");
    await assertDayStatusAllowsWork(client, workerId, workDate, "ghi tăng ca");
    const { rows } = await client.query(
      `insert into local_overtime(worker_id,work_date,overtime_type,overtime_minutes,reason,idempotency_key,idempotency_fingerprint)
      values($1,$2,$3,$4,$5,$6,$7) returning id,status`,
      [
        workerId,
        workDate,
        body.overtime_type || body.overtimeType || "NORMAL",
        minutes,
        reason,
        key,
        overtimeFingerprint,
      ],
    );
    await recordWorkflowEvent(
      client,
      "OVERTIME",
      String(rows[0].id),
      "CREATE",
      null,
      String(rows[0].status),
      reason,
      key,
      overtimeFingerprint,
    );
    return { id: rows[0].id, reused: false, status: rows[0].status };
  };
  return transactionClient ? execute(transactionClient) : withLocalTransaction(execute);
}

// Self-service: nhân viên chỉ được tạo tăng ca cho chính hồ sơ đã liên kết.
app.post("/api/my-attendance/overtime", async (req, res) => {
  try {
    const { worker } = await requireSelfWorker(req);
    res
      .status(201)
      .json(
        await createOvertime(
          { ...(req.body || {}), self_service: true },
          worker.id,
        ),
      );
  } catch (error) {
    sendError(res, error);
  }
});

async function assertCurrentAttendanceReviewPermission(client:PoolClient,seal=false) {
  if(['admin','manager'].includes(currentLocalRole()))return;
  const permissions=seal && currentLocalRole()!=='team_leader'?['production_manage']:['production_manage','production_attendance_approve'];
  const granted=await client.query('select 1 from local_employee_permissions where user_id=$1 and enabled and permission_type=any($2::text[]) limit 1',[currentLocalActor(),permissions]);
  if(!granted.rows[0])throw Object.assign(new Error('Quyền xử lý chấm công đã bị thu hồi hoặc chưa được cấp.'),{status:403});
}
async function assertExpectedDayRevision(client:PoolClient,worker:string,date:string,expected:unknown) {
  const revision=String((await client.query('select revision::text from local_attendance_day_revisions where worker_id=$1 and work_date=$2::date',[worker,date])).rows[0]?.revision ?? '0');
  if(!/^\d+$/.test(String(expected??'')) || String(expected)!==revision) throw Object.assign(new Error('Nguồn ngày đã thay đổi. Tải lại và xác nhận đúng dữ liệu hiện tại.'),{status:409});
  return revision;
}
async function attendanceDaySummary(client:Pick<PoolClient,'query'>,worker:string,date:string) {
  const revision=String((await client.query('select revision::text from local_attendance_day_revisions where worker_id=$1 and work_date=$2::date',[worker,date])).rows[0]?.revision ?? '0');
  const closure=(await client.query("select c.*,coalesce(nullif(btrim(concat_ws(' ',p.first_name,p.last_name)),''),c.confirmation_actor_id) confirmation_actor_name from local_day_closures c left join local_user_profiles p on p.user_id=c.confirmation_actor_id where c.worker_id=$1 and c.work_date=$2::date",[worker,date])).rows[0]??null;
  const sources=(await client.query(`select 'ATTENDANCE' source_type,id::text,workflow_status status,jsonb_build_object('method',attendance_method,'day_units',day_units,'check_in',check_in_time,'check_out',check_out_time,'break_minutes',break_minutes,'worked_minutes',worked_minutes,'notes',notes,'review_reason',workflow_reason) facts from local_attendance where worker_id=$1 and work_date=$2::date and not is_reversed
    union all select 'PRODUCTION_ENTRY',id::text,workflow_status,jsonb_build_object('piece_rate_code',piece_rate_code,'product_name',piece_rate_name_snapshot,'quantity',quantity,'notes',notes,'review_reason',workflow_reason) from local_production_entries where worker_id=$1 and work_date=$2::date and not is_reversed
    union all select 'OVERTIME',id::text,status,jsonb_build_object('overtime_type',overtime_type,'overtime_minutes',overtime_minutes,'notes',reason,'review_reason',workflow_reason) from local_overtime where worker_id=$1 and work_date=$2::date order by source_type,id`,[worker,date])).rows;
  for(const source of sources){const event=(await client.query("select e.actor_id,coalesce(nullif(btrim(concat_ws(' ',p.first_name,p.last_name)),''),e.actor_id) actor_name,e.created_at from local_attendance_workflow_events e left join local_user_profiles p on p.user_id=e.actor_id where e.entity_type=$1 and e.entity_id=$2 and e.action='CREATE' order by e.created_at limit 1",[source.source_type,source.id])).rows[0];source.recorded_by=event?.actor_name??null;source.recorded_at=event?.created_at??null;}

  const dayStatusRow=(await client.query('select status,reason from local_day_statuses where worker_id=$1 and work_date=$2::date',[worker,date])).rows[0];
  const dayStatus=dayStatusRow?.status??null;
  const payrollLocked=!!(await client.query("select 1 from local_payroll_runs r join local_payroll_periods p on p.id=r.period_id where r.status='LOCKED' and $1::date between p.period_start and p.period_end limit 1",[date])).rows[0];
  return {worker_id:worker,work_date:date,current_revision:revision,closure,day_status:dayStatus,day_status_reason:dayStatusRow?.reason??null,sources,source_fingerprint:payloadFingerprint({revision,sources,day_status:dayStatus}),payroll_locked:payrollLocked,
    confirmation_current:!!closure && closure.confirmed_revision!==null && String(closure.confirmed_revision)===revision,
    classified:!!dayStatus||sources.some(row=>!['REJECTED','REVERSED'].includes(row.status))};
}
app.get('/api/my-attendance/day-summary',async(req,res)=>{try{const {worker}=await requireSelfWorker(req);const date=String(req.query.date||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('Ngày không hợp lệ.');res.json(await attendanceDaySummary(pool,String(worker.id),date));}catch(error){sendError(res,error);}});
app.get('/api/my-attendance/closures',async(req,res)=>{try{const {worker}=await requireSelfWorker(req);res.json((await pool.query('select c.*,coalesce(r.revision,0)::text current_revision from local_day_closures c left join local_attendance_day_revisions r using(worker_id,work_date) where c.worker_id=$1 and c.work_date >= $2::date and c.work_date < ($2::date + interval \'1 month\')',[worker.id,monthStart(req.query.month)])).rows);}catch(error){sendError(res,error);}});
app.get('/api/attendance/day-summary',async(req,res)=>{try{if(!['admin','manager','accountant','team_leader'].includes(currentLocalRole()))throw Object.assign(new Error('Không có quyền xem ngày của nhân sự.'),{status:403});const worker=String(req.query.worker_id||''),date=String(req.query.date||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('Ngày không hợp lệ.');res.json(await withLocalTransaction(async client=>{await assertLocalReviewScope(client,worker,date);return attendanceDaySummary(client,worker,date);}));}catch(error){sendError(res,error);}});
app.post('/api/attendance/approve-close',async(req,res)=>{try{
  if(!['admin','manager','accountant','team_leader'].includes(currentLocalRole()))throw Object.assign(new Error('Không có quyền duyệt và chốt.'),{status:403});
  const worker=String(req.body.worker_id||''),date=String(req.body.work_date||''),key=workflowKey(req.body),reason=workflowReason(req.body),proxy=req.body.proxy_confirm===true;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('Ngày không hợp lệ.');assertNotFutureDate(date,'Ngày chốt');
  if(proxy && (!['admin','manager'].includes(currentLocalRole())||!reason))throw Object.assign(new Error('Chỉ quản lý được xác nhận hộ, bắt buộc lý do.'),{status:403});
  const fingerprint=payloadFingerprint({worker,date,expected_revision:req.body.expected_revision,source_fingerprint:req.body.source_fingerprint,proxy,reason});
  res.json(await withLocalTransaction(async client=>{
    await assertCurrentAttendanceReviewPermission(client,true);await lockAttendanceIdempotency(client,'DAY_ACTION',key);await lockAttendanceDay(client,worker,date);await assertLocalReviewScope(client,worker,date);
    const receipt=(await client.query('select * from local_attendance_day_action_receipts where idempotency_key=$1',[key])).rows[0];
    if(receipt){if(receipt.actor_id!==currentLocalActor()||receipt.fingerprint!==fingerprint)throw idempotencyConflict(key);return {...receipt.result,reused:true};}
    await assertExpectedDayRevision(client,worker,date,req.body.expected_revision);const summary=await attendanceDaySummary(client,worker,date);
    if(summary.source_fingerprint!==req.body.source_fingerprint)throw Object.assign(new Error('Tập nguồn đã đổi. Tải lại chi tiết ngày.'),{status:409});
    await assertWorkflowWritable(client,worker,date,String(summary.closure?.status||'OPEN'));
    if(!summary.classified)throw new Error('Ngày chưa có dữ liệu để chốt.');
    if(!proxy && (!summary.confirmation_current||summary.closure?.status!=='EMPLOYEE_CONFIRMED'))throw Object.assign(new Error('Cần nhân viên xác nhận lại hoặc quản lý xác nhận hộ có lý do.'),{status:409});
    const unpriced=(await client.query(`select 1 from local_attendance where worker_id=$1 and work_date=$2::date and not is_reversed and workflow_status='SUBMITTED' and attendance_method in ('DAY','HOUR') and rate_id is null and rate_amount is null and calculated_amount is null limit 1`,[worker,date])).rows[0];
    if(unpriced)throw Object.assign(new Error('Bản ghi chưa có đơn giá. Duyệt công trước sau khi thiết lập lương, rồi xác nhận lại ngày để chốt.'),{status:409});
    if(proxy){const confirmed=(await client.query(`insert into local_day_closures(worker_id,work_date,status,reason,idempotency_key,confirmed_revision,confirmation_actor_id,confirmation_kind,confirmation_reason,confirmed_at) values($1,$2,'EMPLOYEE_CONFIRMED',$3,$4,$5,$6,'PROXY',$3,now()) on conflict(worker_id,work_date) do update set status='EMPLOYEE_CONFIRMED',reason=excluded.reason,idempotency_key=excluded.idempotency_key,confirmed_revision=excluded.confirmed_revision,confirmation_actor_id=excluded.confirmation_actor_id,confirmation_kind='PROXY',confirmation_reason=excluded.reason,confirmed_at=now() returning id`,[worker,date,reason,key,summary.current_revision,currentLocalActor()])).rows[0];await recordWorkflowEvent(client,'DAY_CLOSURE',String(confirmed.id),'PROXY_CONFIRM',summary.closure?.status||'OPEN','EMPLOYEE_CONFIRMED',reason,key+':proxy');}
    for(const source of summary.sources.filter(row=>row.status==='SUBMITTED')){
      await assertLocalReviewScope(client,worker,date,source.source_type,source.id);const config=bulkWorkflowSourceConfig[source.source_type as BulkWorkflowSourceType];
      await client.query(`update ${config.table} set ${config.statusColumn}='APPROVED',workflow_reason=$2,workflow_at=now(),workflow_actor_id=$3 where id=$1`,[source.id,reason||null,currentLocalActor()]);
      await recordWorkflowEvent(client,source.source_type,source.id,'STATUS','SUBMITTED','APPROVED',reason||null,key+':'+source.source_type+':'+source.id);
    }
    const row=(await client.query("update local_day_closures set status='LEADER_CONFIRMED',reason=$3 where worker_id=$1 and work_date=$2::date returning *",[worker,date,reason||null])).rows[0];
    await recordWorkflowEvent(client,'DAY_CLOSURE',String(row.id),'STATUS','EMPLOYEE_CONFIRMED','LEADER_CONFIRMED',reason||null,key+':seal');
    const result={...row,processed:summary.sources.filter(row=>row.status==='SUBMITTED').length,reused:false};await client.query('insert into local_attendance_day_action_receipts(idempotency_key,actor_id,fingerprint,result) values($1,$2,$3,$4::jsonb)',[key,currentLocalActor(),fingerprint,JSON.stringify(result)]);return result;
  }));
}catch(error){sendError(res,error);}});

app.post("/api/my-attendance/day-confirm", async (req, res) => {
  try {
    const { worker } = await requireSelfWorker(req);
    const date = String(req.body?.work_date || req.body?.workDate || "");
    const reason = String(req.body?.reason || "").trim();
    const key = String(req.body?.idempotency_key || req.body?.idempotencyKey || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !key || key.length > 200) throw new Error("Ngày và khóa chống gửi trùng là bắt buộc.");
    assertNotFutureDate(date, "Ngày xác nhận");
    const fingerprintValue = payloadFingerprint({ worker_id: worker.id, work_date: date, target_status: "EMPLOYEE_CONFIRMED", expected_revision:req.body.expected_revision, reason: reason || null });
    const result = await withLocalTransaction(async (client) => {
      await lockAttendanceIdempotency(client,"DAY_CLOSURE",key);
      const keyed = (await client.query("select id,worker_id,work_date,status,idempotency_fingerprint from local_day_closures where idempotency_key=$1", [key])).rows[0];
      if (keyed) {
        if (String(keyed.worker_id) !== String(worker.id) || String(keyed.work_date) !== date || (keyed.idempotency_fingerprint && keyed.idempotency_fingerprint !== fingerprintValue)) throw idempotencyConflict(key);
        return { id:keyed.id,worker_id:worker.id,work_date:date,status:keyed.status,reused:true };
      }
      await lockAttendanceDay(client,worker.id,date);
      const previous = (await client.query("select id,status from local_day_closures where worker_id=$1 and work_date=$2::date for update", [worker.id,date])).rows[0];
      const currentStatus = String(previous?.status || "OPEN");
      await assertWorkflowWritable(client,worker.id,date,currentStatus);
      const revision=await assertExpectedDayRevision(client,String(worker.id),date,req.body.expected_revision);
      if (!['OPEN','REOPENED','EMPLOYEE_CONFIRMED'].includes(currentStatus)) throw Object.assign(new Error("Ngày công không còn ở trạng thái nhân viên được xác nhận."), { status:409 });
      const row = (await client.query(`insert into local_day_closures(worker_id,work_date,status,reason,idempotency_key,idempotency_fingerprint,confirmed_revision,confirmation_actor_id,confirmation_kind,confirmation_reason,confirmed_at)
        values($1,$2,'EMPLOYEE_CONFIRMED',$3,$4,$5,$6,$7,'SELF',null,now()) on conflict(worker_id,work_date) do update set status='EMPLOYEE_CONFIRMED',reason=excluded.reason,idempotency_key=excluded.idempotency_key,idempotency_fingerprint=excluded.idempotency_fingerprint,confirmed_revision=excluded.confirmed_revision,confirmation_actor_id=excluded.confirmation_actor_id,confirmation_kind=excluded.confirmation_kind,confirmation_reason=null,confirmed_at=now() returning id,worker_id,work_date,status`, [worker.id,date,reason||null,key,fingerprintValue,revision,currentLocalActor()])).rows[0];
      await recordWorkflowEvent(client,'DAY_CLOSURE',String(row.id),'STATUS',currentStatus,'EMPLOYEE_CONFIRMED',reason||null,key,fingerprintValue);
      return { ...row,reused:false };
    });
    res.json(result);
  } catch(error) { sendError(res,error); }
});

app.post("/api/attendance/hour", async (req, res) => {
  try {
    const checkIn = String(
      bodyValue(req.body, "check_in_time", "checkInTime") || "",
    );
    const checkOut = String(
      bodyValue(req.body, "check_out_time", "checkOutTime") || "",
    );
    const breakMinutes = Number(
      bodyValue(req.body, "break_minutes", "breakMinutes") || 0,
    );
    workedMinutesFromClock(checkIn, checkOut, breakMinutes);
    res.status(201).json(
      await createAttendance({
        ...req.body,
        attendance_method: "HOUR",
        check_in_time: checkIn,
        check_out_time: checkOut,
        break_minutes: breakMinutes,
      }),
    );
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/attendance/status", async (req, res) => {
  try {
    const id = String(
      bodyValue(req.body, "attendance_record_id", "attendanceRecordId") || "",
    );
    const status = String(
      bodyValue(req.body, "target_status", "targetStatus") || "APPROVED",
    ).toUpperCase();
    const reason = workflowReason(req.body);
    const key = workflowKey(req.body);
    const result = await withLocalTransaction(async (client) => {
      await lockAttendanceIdempotency(client, "ATTENDANCE", key);
      const replay = await workflowReplay(client, key, "ATTENDANCE");
      if (replay) {
        assertWorkflowReplayMatches(replay, key, {
          entityId: id,
          action: "STATUS",
          toStatus: status,
          reason,
        });
        return {
          id: replay.entity_id,
          attendance_record_id: replay.entity_id,
          status: replay.to_status,
          reused: true,
        };
      }
      const candidate = await client.query(
        "select worker_id,work_date from local_attendance where id=$1",
        [id],
      );
      if (!candidate.rows[0])
        throw new Error("Không tìm thấy bản ghi chấm công.");
      await lockAttendanceDay(
        client,
        String(candidate.rows[0].worker_id),
        String(candidate.rows[0].work_date),
      );
      const current = await client.query(
        "select id,worker_id,work_date,workflow_status from local_attendance where id=$1 for update",
        [id],
      );
      if (!current.rows[0])
        throw new Error("Không tìm thấy bản ghi chấm công.");
      const row = current.rows[0];
      await assertLocalReviewScope(
        client,
        String(row.worker_id),
        String(row.work_date),
        "ATTENDANCE",
        id,
      );
      assertWorkflowTransition(String(row.workflow_status), status, reason);
      if (String(row.workflow_status) !== status)
        await assertWorkflowWritable(
          client,
          String(row.worker_id),
          String(row.work_date),
          String(row.workflow_status),
        );
      const pendingRateSnapshot =
        status === "APPROVED" || status === "LOCKED"
          ? await prepareAttendanceRateSnapshot(client, id)
          : null;
      await applyAttendanceRateSnapshot(client, pendingRateSnapshot);
      const { rows } = await client.query(
        "update local_attendance set workflow_status=$2,workflow_reason=$3,workflow_at=now(),workflow_actor_id=$5 where id=$1 and workflow_status=$4 returning id",
        [id, status, reason || null, row.workflow_status, currentLocalActor()],
      );
      if (!rows[0])
        throw new Error("Bản ghi chấm công đã thay đổi, vui lòng tải lại.");
      await recordWorkflowEvent(
        client,
        "ATTENDANCE",
        id,
        "STATUS",
        String(row.workflow_status),
        status,
        reason || null,
        key,
      );
      return { id, attendance_record_id: id, status, reused: false };
    });
    res.json(result);
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/attendance/:id/reverse", async (req, res) => {
  try {
    assertLocalReviewTarget("REVERSED");
    const key = workflowKey(req.body);
    const reason = workflowReason(req.body);
    if (!reason) throw new Error("Bắt buộc nhập lý do đảo bản ghi chấm công.");
    const result = await withLocalTransaction(async (client) => {
      await lockAttendanceIdempotency(client, "ATTENDANCE", key);
      const replay = await workflowReplay(client, key, "ATTENDANCE");
      if (replay) {
        assertWorkflowReplayMatches(replay, key, {
          entityId: req.params.id,
          action: "REVERSE",
          toStatus: "REVERSED",
          reason,
        });
        return {
          id: replay.entity_id,
          attendance_record_id: replay.entity_id,
          status: "REVERSED",
          reused: true,
        };
      }
      const candidate = await client.query(
        "select worker_id,work_date from local_attendance where id=$1",
        [req.params.id],
      );
      if (!candidate.rows[0])
        throw new Error("Không tìm thấy bản ghi chấm công.");
      await lockAttendanceDay(
        client,
        String(candidate.rows[0].worker_id),
        String(candidate.rows[0].work_date),
      );
      const current = await client.query(
        "select id,worker_id,work_date,workflow_status,is_reversed from local_attendance where id=$1 for update",
        [req.params.id],
      );
      if (!current.rows[0])
        throw new Error("Không tìm thấy bản ghi chấm công.");
      const row = current.rows[0];
      await assertLocalReviewScope(
        client,
        String(row.worker_id),
        String(row.work_date),
        "ATTENDANCE",
        req.params.id,
      );
      if (row.is_reversed || String(row.workflow_status) === "REVERSED")
        return {
          id: row.id,
          attendance_record_id: row.id,
          status: "REVERSED",
          reused: true,
        };
      await assertWorkflowWritable(
        client,
        String(row.worker_id),
        String(row.work_date),
        String(row.workflow_status),
      );
      const { rows } = await client.query(
        "update local_attendance set is_reversed=true,workflow_status='REVERSED',reversal_reason=$2,workflow_reason=$2,workflow_at=now(),workflow_actor_id=$3 where id=$1 and is_reversed=false returning id",
        [req.params.id, reason, currentLocalActor()],
      );
      if (!rows[0])
        throw new Error("Bản ghi chấm công đã thay đổi, vui lòng tải lại.");
      await recordWorkflowEvent(
        client,
        "ATTENDANCE",
        req.params.id,
        "REVERSE",
        String(row.workflow_status),
        "REVERSED",
        reason,
        key,
      );
      return {
        id: rows[0].id,
        attendance_record_id: rows[0].id,
        status: "REVERSED",
        reused: false,
      };
    });
    res.json(result);
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/attendance/day-status", async (req, res) => {
  try {
    const params: unknown[] = [monthStart(req.query.month)];
    const scope = localSourceReadClause("d.worker_id", "d.work_date", params);
    const { rows } = await pool.query(
      `select d.worker_id, w.employee_code, w.display_name worker_name, w.worker_type, d.work_date, d.status, d.meal_eligible, d.reason, d.created_at from local_day_statuses d join local_workers w on w.id=d.worker_id where d.work_date >= $1::date and d.work_date < ($1::date + interval '1 month')${scope} order by d.work_date, w.display_name`,
      params,
    );
    res.json(rows);
  } catch (error) {
    sendError(res, error);
  }
});
app.post("/api/attendance/day-status", async (req, res) => {
  try {
    const workerId = String(bodyValue(req.body, "worker_id", "workerId") || "");
    const date = String(bodyValue(req.body, "work_date", "workDate") || "");
    const status = String(
      bodyValue(req.body, "status", "status") || "PRESENT",
    ).toUpperCase();
    const key = workflowKey(req.body);
    if (
      !workerId ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !allowedDayStatuses.has(status)
    )
      throw new Error("Nhân sự, ngày và trạng thái ngày công không hợp lệ.");
    assertNotFutureDate(date, "Ngày trạng thái công");
    const mealEligible = Boolean(
      bodyValue(req.body, "meal_eligible", "mealEligible"),
    );
    const reasonValue = bodyValue(req.body, "reason", "reason");
    const reason = reasonValue ? String(reasonValue) : null;
    const dayStatusFingerprint = payloadFingerprint({
      workerId,
      date,
      status,
      mealEligible,
      reason,
    });
    const result = await withLocalTransaction(async (client) => {
      await lockAttendanceIdempotency(client, "DAY_STATUS", key);
      const keyed = await client.query(
        "select id,idempotency_fingerprint,status from local_day_statuses where idempotency_key=$1",
        [key],
      );
      if (keyed.rows[0]) {
        await assertIdempotencyReplayActor(
          client,
          key,
          "DAY_STATUS",
          String(keyed.rows[0].id),
        );
        if (
          keyed.rows[0].idempotency_fingerprint &&
          keyed.rows[0].idempotency_fingerprint !== dayStatusFingerprint
        )
          throw idempotencyConflict(key);
        if (!keyed.rows[0].idempotency_fingerprint)
          await client.query(
            "update local_day_statuses set idempotency_fingerprint=$2 where id=$1",
            [keyed.rows[0].id, dayStatusFingerprint],
          );
        return {
          id: keyed.rows[0].id,
          worker_id: workerId,
          work_date: date,
          status: keyed.rows[0].status,
          reused: true,
        };
      }
      const replay = await workflowReplay(client, key, "DAY_STATUS");
      if (replay) {
        assertWorkflowReplayMatches(replay, key, {
          entityId: String(replay.entity_id),
          action: "UPSERT",
          toStatus: status,
          reason,
          fingerprint: dayStatusFingerprint,
        });
        const replaySource = await client.query(
          "select worker_id,work_date from local_day_statuses where id=$1",
          [replay.entity_id],
        );
        if (
          !replaySource.rows[0] ||
          String(replaySource.rows[0].worker_id) !== workerId ||
          String(replaySource.rows[0].work_date) !== date
        )
          throw idempotencyConflict(key);
        return {
          id: replay.entity_id,
          worker_id: workerId,
          work_date: date,
          status: replay.to_status,
          reused: true,
        };
      }
      await lockAttendanceDay(client, workerId, date);
      await assertLocalReviewScope(client, workerId, date);
      const existing = await client.query(
        "select id,status from local_day_statuses where worker_id=$1 and work_date=$2::date for update",
        [workerId, date],
      );
      await assertWorkflowWritable(client, workerId, date, "SUBMITTED");
      await assertDayStatusCompatibleWithWork(client, workerId, date, status);
      const { rows } = await client.query(
        `insert into local_day_statuses(worker_id,work_date,status,meal_eligible,reason,idempotency_key,idempotency_fingerprint)
        values($1,$2,$3,$4,$5,$6,$7)
        on conflict(worker_id,work_date) do update set status=excluded.status,meal_eligible=excluded.meal_eligible,reason=excluded.reason,idempotency_key=excluded.idempotency_key,idempotency_fingerprint=excluded.idempotency_fingerprint
        returning id,worker_id,work_date,status,meal_eligible`,
        [
          workerId,
          date,
          status,
          mealEligible,
          reason,
          key,
          dayStatusFingerprint,
        ],
      );
      await recordWorkflowEvent(
        client,
        "DAY_STATUS",
        String(rows[0].id),
        "UPSERT",
        existing.rows[0]?.status || null,
        status,
        reason,
        key,
        dayStatusFingerprint,
      );
      return { ...rows[0], reused: false };
    });
    res.json(result);
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/attendance/closures", async (req, res) => {
  try {
    const params: unknown[] = [monthStart(req.query.month)];
    const scope = localSourceReadClause("c.worker_id", "c.work_date", params);
    const { rows } = await pool.query(
      `select c.*,coalesce(r.revision,0)::text current_revision from local_day_closures c left join local_attendance_day_revisions r on r.worker_id=c.worker_id and r.work_date=c.work_date where c.work_date >= $1::date and c.work_date < ($1::date + interval '1 month')${scope} order by c.work_date`,
      params,
    );
    res.json(rows);
  } catch (error) {
    sendError(res, error);
  }
});
app.post("/api/attendance/closures", async (req, res) => {
  try {
    const workerId = String(bodyValue(req.body, "worker_id", "workerId") || "");
    const date = String(bodyValue(req.body, "work_date", "workDate") || "");
    const status = String(
      bodyValue(req.body, "target_status", "targetStatus") || "OPEN",
    ).toUpperCase();
    assertLocalReviewTarget(status, "DAY_CLOSURE");
    const reason = workflowReason(req.body);
    const key = workflowKey(req.body);
    if (
      !workerId ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !allowedClosureStatuses.has(status)
    )
      throw new Error("Nhân sự, ngày và trạng thái khóa ngày không hợp lệ.");
    // A future day must be rejected before idempotency replay or any database read/write.
    assertNotFutureDate(date, "Ngày khóa ngày công");
    const closureFingerprint = payloadFingerprint({
      workerId,
      date,
      status,
      reason: reason || null,
      expected_revision:req.body.expected_revision,
    });
    const result = await withLocalTransaction(async (client) => {
      await assertCurrentAttendanceReviewPermission(client,status==='LEADER_CONFIRMED'||status==='REOPENED');
      await lockAttendanceIdempotency(client, "DAY_CLOSURE", key);
      const keyed = await client.query(
        "select id,idempotency_fingerprint,status from local_day_closures where idempotency_key=$1",
        [key],
      );
      if (keyed.rows[0]) {
        await assertIdempotencyReplayActor(
          client,
          key,
          "DAY_CLOSURE",
          String(keyed.rows[0].id),
        );
        if (
          keyed.rows[0].idempotency_fingerprint &&
          keyed.rows[0].idempotency_fingerprint !== closureFingerprint
        )
          throw idempotencyConflict(key);
        if (!keyed.rows[0].idempotency_fingerprint)
          await client.query(
            "update local_day_closures set idempotency_fingerprint=$2 where id=$1",
            [keyed.rows[0].id, closureFingerprint],
          );
        return {
          id: keyed.rows[0].id,
          worker_id: workerId,
          work_date: date,
          status: keyed.rows[0].status,
          reused: true,
        };
      }
      const replay = await workflowReplay(client, key, "DAY_CLOSURE");
      if (replay) {
        assertWorkflowReplayMatches(replay, key, {
          entityId: String(replay.entity_id),
          action: "STATUS",
          toStatus: status,
          reason,
          fingerprint: closureFingerprint,
        });
        const replaySource = await client.query(
          "select worker_id,work_date from local_day_closures where id=$1",
          [replay.entity_id],
        );
        if (
          !replaySource.rows[0] ||
          String(replaySource.rows[0].worker_id) !== workerId ||
          String(replaySource.rows[0].work_date) !== date
        )
          throw idempotencyConflict(key);
        return {
          id: replay.entity_id,
          worker_id: workerId,
          work_date: date,
          status: replay.to_status,
          reused: true,
        };
      }
      await lockAttendanceDay(client, workerId, date);
      await assertLocalReviewScope(client, workerId, date);
      const existing = await client.query(
        "select id,status from local_day_closures where worker_id=$1 and work_date=$2::date for update",
        [workerId, date],
      );
      const currentStatus = String(existing.rows[0]?.status || "OPEN");
      const revision = ['EMPLOYEE_CONFIRMED','LEADER_CONFIRMED'].includes(status) ? await assertExpectedDayRevision(client,workerId,date,req.body.expected_revision) : null;
      if(status==='EMPLOYEE_CONFIRMED' && (!['admin','manager'].includes(currentLocalRole()) || !reason)) throw Object.assign(new Error('Quản lý xác nhận hộ phải nhập lý do.'),{status:403});
      // A locked payroll snapshot closes every source fact in the period,
      // including the day-close record. Do this check before the transition so
      // reopening a day cannot mutate a locked period through a side door.
      await assertWorkflowWritable(client, workerId, date, currentStatus, {
        allowLeaderReopen: status === "REOPENED",
      });
      const closureTransitions: Record<string, string[]> = {
        OPEN: ["EMPLOYEE_CONFIRMED"],
        EMPLOYEE_CONFIRMED: ["LEADER_CONFIRMED", "OPEN"],
        LEADER_CONFIRMED: ["REOPENED"],
        REOPENED: ["EMPLOYEE_CONFIRMED", "OPEN"],
      };
      if (
        currentStatus !== status &&
        !closureTransitions[currentStatus]?.includes(status)
      )
        throw new Error(
          `Không thể chuyển trạng thái khóa ngày từ ${currentStatus} sang ${status}.`,
        );
      if (status === "REOPENED" && !reason)
        throw new Error("Bắt buộc nhập lý do mở lại ngày công.");
      // Sealing is an UPDATE of the reviewed confirmation. An UPSERT would
      // execute the BEFORE INSERT guard before it can preserve that confirmation.
      const { rows } = status === 'LEADER_CONFIRMED'
        ? await client.query(`update local_day_closures set status=$3,reason=$4,idempotency_key=$5,idempotency_fingerprint=$6,confirmed_revision=$7 where worker_id=$1 and work_date=$2::date and status='EMPLOYEE_CONFIRMED' returning id,worker_id,work_date,status`,
          [workerId,date,status,reason||null,key,closureFingerprint,revision])
        : await client.query(
        `insert into local_day_closures(worker_id,work_date,status,reason,idempotency_key,idempotency_fingerprint,confirmed_revision,confirmation_actor_id,confirmation_kind,confirmation_reason,confirmed_at)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,case when $3='EMPLOYEE_CONFIRMED' then now() else null end) on conflict(worker_id,work_date) do update set status=excluded.status,reason=excluded.reason,idempotency_key=excluded.idempotency_key,idempotency_fingerprint=excluded.idempotency_fingerprint,confirmed_revision=excluded.confirmed_revision,confirmation_actor_id=case when excluded.status='EMPLOYEE_CONFIRMED' then excluded.confirmation_actor_id else local_day_closures.confirmation_actor_id end,confirmation_kind=case when excluded.status='EMPLOYEE_CONFIRMED' then 'PROXY' else local_day_closures.confirmation_kind end,confirmation_reason=case when excluded.status='EMPLOYEE_CONFIRMED' then excluded.confirmation_reason else local_day_closures.confirmation_reason end,confirmed_at=case when excluded.status='EMPLOYEE_CONFIRMED' then now() else local_day_closures.confirmed_at end returning id,worker_id,work_date,status`,
        [workerId, date, status, reason || null, key, closureFingerprint,revision,currentLocalActor(),status==='EMPLOYEE_CONFIRMED'?'PROXY':null,status==='EMPLOYEE_CONFIRMED'?reason:null],
      );
      if (!rows[0]) throw Object.assign(new Error('Cần xác nhận hiện hành trước khi chốt ngày.'),{status:409});
      await recordWorkflowEvent(
        client,
        "DAY_CLOSURE",
        String(rows[0].id),
        "STATUS",
        currentStatus,
        status,
        reason || null,
        key,
        closureFingerprint,
      );
      return { ...rows[0], reused: false };
    });
    res.json(result);
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/attendance/overtime", async (req, res) => {
  try {
    const params: unknown[] = [monthStart(req.query.month)];
    const scope = localSourceReadClause("o.worker_id", "o.work_date", params);
    const { rows } = await pool.query(
      `select o.id,o.worker_id,w.employee_code,w.display_name worker_name,w.worker_type,o.work_date,overtime_type,overtime_minutes,reason,status,o.created_at from local_overtime o join local_workers w on w.id=o.worker_id where o.work_date >= $1::date and o.work_date < ($1::date + interval '1 month')${scope} order by o.work_date desc`,
      params,
    );
    res.json(rows);
  } catch (error) {
    sendError(res, error);
  }
});
app.post("/api/attendance/overtime", async (req, res) => {
  try {
    const result = await createOvertime(req.body || {});
    res.status(result.reused ? 200 : 201).json(result);
  } catch (error) {
    sendError(res, error);
  }
});
app.post("/api/attendance/overtime/status", async (req, res) => {
  try {
    const key = workflowKey(req.body);
    const reason = workflowReason(req.body);
    const id = String(req.body.overtime_record_id || "");
    const status = String(req.body.target_status || "").toUpperCase();
    const result = await withLocalTransaction(async (client) => {
      await lockAttendanceIdempotency(client, "OVERTIME", key);
      const replay = await workflowReplay(client, key, "OVERTIME");
      if (replay) {
        assertWorkflowReplayMatches(replay, key, {
          entityId: id,
          action: "STATUS",
          toStatus: status,
          reason,
        });
        return { id: replay.entity_id, reused: true, status: replay.to_status };
      }
      const candidate = await client.query(
        "select worker_id,work_date from local_overtime where id=$1",
        [id],
      );
      if (!candidate.rows[0])
        throw new Error("Không tìm thấy bản ghi làm thêm.");
      await lockAttendanceDay(
        client,
        String(candidate.rows[0].worker_id),
        String(candidate.rows[0].work_date),
      );
      const current = await client.query(
        "select id,worker_id,work_date,status from local_overtime where id=$1 for update",
        [id],
      );
      if (!current.rows[0]) throw new Error("Không tìm thấy bản ghi làm thêm.");
      const row = current.rows[0];
      assertWorkflowTransition(String(row.status), status, reason);
      await assertLocalReviewScope(
        client,
        String(row.worker_id),
        String(row.work_date),
        "OVERTIME",
        id,
      );
      if (String(row.status) !== status)
        await assertWorkflowWritable(
          client,
          String(row.worker_id),
          String(row.work_date),
          String(row.status),
        );
      const { rows } = await client.query(
        "update local_overtime set status=$2,workflow_reason=$3,workflow_at=now(),workflow_actor_id=$5 where id=$1 and status=$4 returning id,status",
        [id, status, reason || null, row.status, currentLocalActor()],
      );
      if (!rows[0])
        throw new Error("Bản ghi làm thêm đã thay đổi, vui lòng tải lại.");
      await recordWorkflowEvent(
        client,
        "OVERTIME",
        id,
        "STATUS",
        String(row.status),
        status,
        reason || null,
        key,
      );
      return { id, reused: false, status: rows[0].status };
    });
    res.json(result);
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/production/entries", async (req, res) => {
  try {
    const costVisible = !["employee", "team_leader"].includes(
      currentLocalRole(),
    );
    const params: unknown[] = [monthStart(req.query.month)];
    const scope = localSourceReadClause("e.worker_id", "e.work_date", params);
    const { rows } = await pool.query(
      `
      select e.id,e.worker_id,w.employee_code,w.display_name worker_name,w.worker_type,
        e.rate_id,e.product_id,coalesce(e.piece_rate_code,r.piece_rate_code) piece_rate_code,
        p.sku product_sku,coalesce(e.piece_rate_name_snapshot,r.piece_rate_name,p.name) product_name,
        e.work_date,e.quantity,e.rate_amount,e.calculated_amount,e.workflow_status,e.workflow_reason,
        e.workflow_at,e.notes,e.created_at,coalesce(e.rate_unit_snapshot,r.rate_unit,p.rate_unit) rate_unit
      from local_production_entries e
      join local_workers w on w.id=e.worker_id
      left join local_products p on p.id=e.product_id
      left join local_product_rates r on r.id=e.rate_id
      where e.work_date >= $1::date and e.work_date < ($1::date + interval '1 month')
        ${req.query.includeReversed ? "" : " and e.is_reversed=false"}${scope}
      order by e.work_date desc,e.created_at desc`,
      params,
    );
    res.json(
      rows.map((row) => ({
        ...row,
        quantity: asNumber(row.quantity),
        rate_amount: costVisible ? asNumber(row.rate_amount) : null,
        calculated_amount: costVisible ? asNumber(row.calculated_amount) : null,
        currency_code: "VND",
        cost_visible: costVisible,
        production_order_operation_id: null,
        production_order_number: null,
        workflow_actor_id: "local-admin",
      })),
    );
  } catch (error) {
    sendError(res, error);
  }
});
app.get("/api/production/products", async (req, res) => {
  try {
    const costVisible = !["employee", "team_leader"].includes(
      currentLocalRole(),
    );
    const search = String(req.query.search || "").trim().toLocaleLowerCase('vi');
    // Classify the complete effective set before display/search filters so a
    // conflicting peer cannot disappear and make a rate look selectable.
    const rows = listRuntimePieceRates(await loadEffectiveApprovedProductRates(
      pool,
      String(req.query.workDate || businessDateKey()),
    )).filter(row => {
      if (row.price_list_active === false) return false;
      if (!search) return true;
      return [row.piece_rate_code, row.product_sku, row.piece_rate_name || row.product_name]
        .some(value => String(value || '').toLocaleLowerCase('vi').includes(search));
    });
    res.json(
      rows.map((row) => ({
        id: row.id,
        rate_id: row.id,
        product_id: row.product_id,
        piece_rate_code: String(row.piece_rate_code || '').trim(),
        sku: row.product_sku || null,
        name: String(row.piece_rate_name || row.product_name || '').trim() || null,
        category: row.product_category || null,
        price_list_name: row.price_list_name || null,
        price_list_year: row.price_list_year || null,
        sku_match_count: 1,
        rate_unit: row.rate_unit,
        rate: costVisible ? asNumber(row.rate_exact) : null,
        rate_available: true,
        rate_visible: costVisible,
        mapping_status: 'EXCEL_CODE',
      })),
    );
  } catch (error) {
    sendError(res, error);
  }
});
async function createProductionEntry(
  body: Record<string, unknown>,
  workerOverride?: string,
  transactionClient?: PoolClient,
  trustedDispatch=false,
) {
  const key = String(
    body.idempotency_key || body.idempotencyKey || randomUUID(),
  );
  const requestedProductId = String(
    body.product_id || body.productId || "",
  ).trim();
  const requestedRateId = String(body.rate_id || body.rateId || "").trim();
  const requestedPieceRateCode = String(
    body.piece_rate_code || body.pieceRateCode || "",
  ).trim();
  const workerId = String(
    workerOverride || body.worker_id || body.workerId || "",
  );
  const workDate = String(body.work_date || body.workDate || "");
  const qty = Number(body.quantity);
  if (
    (!requestedProductId && !requestedRateId && !requestedPieceRateCode) ||
    !workerId ||
    !/^\d{4}-\d{2}-\d{2}$/.test(workDate)
  ) {
    throw new Error("Nhân sự, mã công may/sản phẩm và ngày làm là bắt buộc.");
  }
  assertNotFutureDate(workDate, "Ngày làm sản lượng");
  if (!Number.isFinite(qty) || qty <= 0)
    throw new Error("Số lượng sản phẩm phải lớn hơn 0.");
  const productionFingerprint = payloadFingerprint({
    productId: requestedProductId || null,
    rateId: requestedRateId || null,
    pieceRateCode: requestedPieceRateCode || null,
    workerId,
    workDate,
    quantity: qty,
    notes: body.notes || null,standaloneReason:body.standalone_reason||null,workKind:body.work_kind||null,
  });
  const execute = async (client: PoolClient) => {
    // Source -> shared price configuration -> request key -> day is the
    // common writer order for direct entries, dispatch and workbook import.
    await lockPayrollSourceShared(client);
    await lockProductRateConfigShared(client);
    await lockAttendanceIdempotency(client, "PRODUCTION_ENTRY", key);
    const existing = await client.query(
      "select id,calculated_amount,idempotency_fingerprint,workflow_status from local_production_entries where idempotency_key=$1",
      [key],
    );
    if (existing.rows[0]) {
      await assertIdempotencyReplayActor(
        client,
        key,
        "PRODUCTION_ENTRY",
        String(existing.rows[0].id),
      );
      if (
        existing.rows[0].idempotency_fingerprint &&
        existing.rows[0].idempotency_fingerprint !== productionFingerprint
      )
        throw idempotencyConflict(key);
      if (!existing.rows[0].idempotency_fingerprint)
        await client.query(
          "update local_production_entries set idempotency_fingerprint=$2 where id=$1",
          [existing.rows[0].id, productionFingerprint],
        );
      return {
        id: existing.rows[0].id,
        reused: true,
        status: existing.rows[0].workflow_status,
        cost_visible: true,
        calculated_amount: asNumber(existing.rows[0].calculated_amount),
      };
    }
    if(!trustedDispatch){
      if(!['admin','manager'].includes(currentLocalRole()))throw Object.assign(new Error('Sản lượng phải ghi từ việc đã nhận; mở mục Việc sản xuất.'),{status:403});
      const standaloneReason=String(body.standalone_reason||'').trim();
      if(standaloneReason.length<3||standaloneReason.length>1000)throw Object.assign(new Error('Sản lượng ngoài lệnh cần lý do riêng từ 3 đến 1.000 ký tự.'),{status:409});
      if(body.assignment_id||body.production_order_id||body.order_item_id||body.source_stage_event_id)throw Object.assign(new Error('Sản lượng thuộc lệnh phải báo qua việc đã nhận.'),{status:409});
    }
    await lockAttendanceDay(client, workerId, workDate);
    await assertLocalSourceWriteScope(client, workerId, workDate);
    await assertWorkflowWritable(client, workerId, workDate, "SUBMITTED");
    await assertDayStatusAllowsWork(
      client,
      workerId,
      workDate,
      "ghi sản lượng",
    );
    const rate = await selectRuntimePieceRate(client, {
      date: workDate,
      rateId: requestedRateId || undefined,
      productId: requestedProductId || undefined,
      pieceRateCode: requestedPieceRateCode || undefined,
    });
    if(!trustedDispatch){
      const overlap=(await client.query(`select 1 from local_assignments a where a.worker_id=$1 and a.dispatch_stage='SEWING' and lower(trim(a.piece_rate_code))=lower(trim($2)) and a.dispatch_status in ('PENDING','ACCEPTED') and a.assigned_from<=$3::date and (a.assigned_to is null or a.assigned_to>=$3::date) limit 1`,[workerId,rate.piece_rate_code,workDate])).rows[0];
      if(overlap)throw Object.assign(new Error('Nhân sự đã có việc sản xuất cùng mã trong ngày; chọn việc đã nhận để tránh chấm trùng.'),{status:409});
      if(laborCodeUsagePolicy(rate.piece_rate_code)){
        if(body.work_kind!=='CURTAIN_REPAIR')throw Object.assign(new Error('Công sửa rèm phải được quản lý chọn riêng và ghi rõ lý do.'),{status:409});
        await assertPaidCurtainRepair(client,String(rate.piece_rate_code),workDate);
      }
    }
    const productId = rate.product_id || null;
    const pieceRateCode = String(rate.piece_rate_code || "").trim() || null;
    const pieceRateName =
      String(rate.piece_rate_name || rate.product_name || "").trim() || null;
    const { rows } = await client.query(
      `
      insert into local_production_entries(worker_id,product_id,piece_rate_code,piece_rate_name_snapshot,rate_unit_snapshot,work_date,quantity,rate_id,rate_amount,calculated_amount,idempotency_key,idempotency_fingerprint,notes,source_stage_event_id,standalone_reason)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$7::numeric*$9::numeric,$10,$11,$12,$13,$14)
      returning id, calculated_amount`,
      [
        workerId,
        productId,
        pieceRateCode,
        pieceRateName,
        rate.rate_unit,
        workDate,
        qty,
        rate.id,
        rate.rate_exact,
        key,
        productionFingerprint,
        body.notes || null,
        trustedDispatch?body.source_stage_event_id||null:null,
        trustedDispatch?null:String(body.standalone_reason||'').trim(),
      ],
    );
    await recordWorkflowEvent(
      client,
      "PRODUCTION_ENTRY",
      String(rows[0].id),
      "CREATE",
      null,
      "SUBMITTED",
      body.notes ? String(body.notes) : null,
      key,
      productionFingerprint,
    );
    return {
      id: rows[0].id,
      reused: false,
      status: "SUBMITTED",
      cost_visible: true,
      calculated_amount: asNumber(rows[0].calculated_amount),
    };
  };
  return transactionClient ? execute(transactionClient) : withLocalTransaction(execute);
}

app.post("/api/production/entries", async (req, res) => {
  try {
    const selfService = req.body?.self_service === true;
    const worker = selfService ? (await requireSelfWorker(req)).worker : null;
    if (selfService) {
      const workDate = String(req.body?.work_date || req.body?.workDate || "");
      const context = await attendanceContextForWorker(worker!.id, workDate);
      if (!context.configured || !context.methods.includes("OUTPUT"))
        throw Object.assign(
          new Error("Tài khoản này chưa được cấu hình chấm công theo sản lượng cho ngày này."),
          { status: 409 },
        );
    }
    if(req.body.assignment_id){
      const result=await productionDispatchService.reportLinkedOutput(String(req.body.assignment_id),{work_date:req.body.work_date,quantity_good:req.body.quantity,quantity_rework:0,quantity_remake:0,quantity_defect:0,notes:req.body.notes||null,idempotency_key:req.body.idempotency_key});
      return res.status(201).json({...result,source:'ASSIGNMENT_REPORT',cost_visible:false,calculated_amount:null});
    }
    const result = await createProductionEntry(req.body || {}, worker?.id);
    const costVisible = !["employee", "team_leader"].includes(
      currentLocalRole(),
    );
    res.status(result.reused ? 200 : 201).json({
      ...result,
      cost_visible: costVisible,
      calculated_amount: costVisible ? result.calculated_amount : null,
    });
  } catch (error) {
    sendError(res, error);
  }
});
app.post("/api/production/entries/status", async (req, res) => {
  try {
    const id = String(req.body.production_entry_id || "");
    const status = String(req.body.target_status || "").toUpperCase();
    const reason = workflowReason(req.body);
    const key = workflowKey(req.body);
    const result = await withLocalTransaction(async (client) => {
      await lockAttendanceIdempotency(client, "PRODUCTION_ENTRY", key);
      const replay = await workflowReplay(client, key, "PRODUCTION_ENTRY");
      if (replay) {
        assertWorkflowReplayMatches(replay, key, {
          entityId: id,
          action: "STATUS",
          toStatus: status,
          reason,
        });
        return {
          id: replay.entity_id,
          production_entry_id: replay.entity_id,
          status: replay.to_status,
          reused: true,
        };
      }
      const candidate = await client.query(
        "select worker_id,work_date from local_production_entries where id=$1",
        [id],
      );
      if (!candidate.rows[0])
        throw new Error("Không tìm thấy bản ghi sản lượng.");
      await lockAttendanceDay(
        client,
        String(candidate.rows[0].worker_id),
        String(candidate.rows[0].work_date),
      );
      const current = await client.query(
        "select id,worker_id,work_date,workflow_status,is_reversed,source_stage_event_id from local_production_entries where id=$1 for update",
        [id],
      );
      if (!current.rows[0])
        throw new Error("Không tìm thấy bản ghi sản lượng.");
      const row = current.rows[0];
      if(row.source_stage_event_id)throw Object.assign(new Error('Sản lượng từ giao việc phải duyệt hoặc đảo tại báo cáo công đoạn.'),{status:409});
      assertWorkflowTransition(String(row.workflow_status), status, reason);
      await assertLocalReviewScope(
        client,
        String(row.worker_id),
        String(row.work_date),
        "PRODUCTION_ENTRY",
        id,
      );
      if (String(row.workflow_status) !== status)
        await assertWorkflowWritable(
          client,
          String(row.worker_id),
          String(row.work_date),
          String(row.workflow_status),
        );
      const { rows } = await client.query(
        "update local_production_entries set workflow_status=$2,workflow_reason=$3,workflow_at=now(),workflow_actor_id=$5 where id=$1 and workflow_status=$4 returning id",
        [id, status, reason || null, row.workflow_status, currentLocalActor()],
      );
      if (!rows[0])
        throw new Error("Bản ghi sản lượng đã thay đổi, vui lòng tải lại.");
      await recordWorkflowEvent(
        client,
        "PRODUCTION_ENTRY",
        id,
        "STATUS",
        String(row.workflow_status),
        status,
        reason || null,
        key,
      );
      return { id, production_entry_id: id, status, reused: false };
    });
    res.json(result);
  } catch (error) {
    sendError(res, error);
  }
});
app.post("/api/production/entries/:id/reverse", async (req, res) => {
  try {
    assertLocalReviewTarget("REVERSED");
    const key = workflowKey(req.body);
    const reason = workflowReason(req.body);
    if (!reason) throw new Error("Bắt buộc nhập lý do đảo bản ghi sản lượng.");
    const result = await withLocalTransaction(async (client) => {
      await lockAttendanceIdempotency(client, "PRODUCTION_ENTRY", key);
      const replay = await workflowReplay(client, key, "PRODUCTION_ENTRY");
      if (replay) {
        assertWorkflowReplayMatches(replay, key, {
          entityId: req.params.id,
          action: "REVERSE",
          toStatus: "REVERSED",
          reason,
        });
        return {
          id: replay.entity_id,
          production_entry_id: replay.entity_id,
          status: "REVERSED",
          reused: true,
        };
      }
      const candidate = await client.query(
        "select worker_id,work_date from local_production_entries where id=$1",
        [req.params.id],
      );
      if (!candidate.rows[0])
        throw new Error("Không tìm thấy bản ghi sản lượng.");
      await lockAttendanceDay(
        client,
        String(candidate.rows[0].worker_id),
        String(candidate.rows[0].work_date),
      );
      const current = await client.query(
        "select id,worker_id,work_date,workflow_status,is_reversed from local_production_entries where id=$1 for update",
        [req.params.id],
      );
      if (!current.rows[0])
        throw new Error("Không tìm thấy bản ghi sản lượng.");
      const row = current.rows[0];
      await assertLocalReviewScope(
        client,
        String(row.worker_id),
        String(row.work_date),
        "PRODUCTION_ENTRY",
        req.params.id,
      );
      if (row.is_reversed || String(row.workflow_status) === "REVERSED")
        return {
          id: row.id,
          production_entry_id: row.id,
          status: "REVERSED",
          reused: true,
        };
      await assertWorkflowWritable(
        client,
        String(row.worker_id),
        String(row.work_date),
        String(row.workflow_status),
      );
      const { rows } = await client.query(
        "update local_production_entries set is_reversed=true,workflow_status='REVERSED',reversal_reason=$2,workflow_reason=$2,workflow_at=now(),workflow_actor_id=$3 where id=$1 and is_reversed=false returning id",
        [req.params.id, reason, currentLocalActor()],
      );
      if (!rows[0])
        throw new Error("Bản ghi sản lượng đã thay đổi, vui lòng tải lại.");
      await recordWorkflowEvent(
        client,
        "PRODUCTION_ENTRY",
        req.params.id,
        "REVERSE",
        String(row.workflow_status),
        "REVERSED",
        reason,
        key,
      );
      return {
        id: req.params.id,
        production_entry_id: req.params.id,
        status: "REVERSED",
        reused: false,
      };
    });
    res.json(result);
  } catch (error) {
    sendError(res, error);
  }
});

const localProductionOrderRow = (row: Record<string, unknown>) => ({
  ...row,
  quantity_planned: asNumber(row.quantity_planned) || 0,
  quantity_good: asNumber(row.quantity_good) || 0,
  quantity_scrap: asNumber(row.quantity_scrap) || 0,
  quantity_rework: asNumber(row.quantity_rework) || 0,
  standard_minutes_total: asNumber(row.standard_minutes_total) || 0,
  material_issue_tolerance_percent:
    asNumber(row.material_issue_tolerance_percent) || 0,
  cutting_params_snapshot: parseJsonValue(row.cutting_params_snapshot, {}),
});

app.get("/api/legacy-production-orders", async (req, res) => {
  try {
    const status = String(req.query.status || "").trim();
    const productId = String(
      req.query.product_id || req.query.productId || "",
    ).trim();
    const orderId = String(
      req.query.order_id || req.query.orderId || "",
    ).trim();
    const { rows } = await pool.query(
      `
      select po.*, p.name product_name, p.sku product_sku
      from local_production_orders po
      left join local_products p on p.id=po.product_id
      -- Query-string filters arrive as text; compare UUID columns as text so
      -- an empty optional filter never forces PostgreSQL to resolve uuid=text.
      where ($1='' or po.status=$1) and ($2='' or po.product_id::text=$2) and ($3='' or po.order_id::text=$3)
      order by po.created_at desc nulls last limit 500`,
      [status, productId, orderId],
    );
    res.json(rows.map(localProductionOrderRow));
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/legacy-production-orders/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `select po.*,p.name product_name,p.sku product_sku from local_production_orders po left join local_products p on p.id=po.product_id where po.id=$1`,
      [req.params.id],
    );
    if (!rows[0])
      return res.status(404).json({ message: "Không tìm thấy lệnh sản xuất." });
    res.json(localProductionOrderRow(rows[0]));
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/legacy-production-orders", async (req, res) => {
  try {
    const body = req.body || {};
    const productId = String(body.product_id || body.productId || "").trim();
    const quantity = Number(body.quantity ?? body.quantity_planned ?? 0);
    if (!productId || !(quantity > 0))
      throw new Error("Sản phẩm và số lượng lệnh sản xuất là bắt buộc.");
    const orderNumber = String(
      body.production_order_number ||
        `SX-LOCAL-${businessDateKey().replace(/-/g, "")}-${Date.now().toString(36).toUpperCase()}`,
    ).trim();
    const { rows } = await pool.query(
      `
      insert into local_production_orders(
        production_order_number,production_batch_number,qr_token,product_id,quantity_planned,
        status,planned_start_date,planned_end_date,source_type,source_id,order_id,cost_center_id,
        material_issue_tolerance_percent,created_by,created_at,updated_at,is_snapshot_record,local_modified_at
      ) values($1,$2,gen_random_uuid()::text,$3,$4,'DRAFT',$5::date,$6::date,$7,$8,$9,$10,$11,$12,now(),now(),false,now()) returning *`,
      [
        orderNumber,
        body.production_batch_number || orderNumber,
        productId,
        quantity,
        body.planned_start_date || body.plannedStartDate || null,
        body.planned_end_date || body.plannedEndDate || null,
        body.source_type || body.sourceType || "MANUAL",
        body.source_id || body.sourceId || null,
        body.order_id || body.orderId || null,
        body.cost_center_id || body.costCenterId || null,
        Number(body.material_issue_tolerance_percent ?? 5),
        body.created_by || "local-admin",
      ],
    );
    res.status(201).json(localProductionOrderRow(rows[0]));
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/legacy-production-orders/group", async (req, res) => {
  const client = await pool.connect();
  try {
    const body = req.body || {};
    const lines = Array.isArray(body.lines) ? body.lines : [];
    if (!lines.length)
      throw new Error("Nhóm lệnh sản xuất phải có ít nhất một dòng.");
    const groupId = randomUUID();
    await client.query("begin");
    const created: Array<Record<string, unknown>> = [];
    for (const line of lines) {
      const productId = String(line.product_id || "").trim();
      const quantity = Number(line.quantity || 0);
      if (!productId || !(quantity > 0))
        throw new Error("Dòng lệnh sản xuất không hợp lệ.");
      const orderNumber = `SX-LOCAL-${businessDateKey().replace(/-/g, "")}-${Date.now().toString(36).toUpperCase()}-${created.length + 1}`;
      const result = await client.query(
        `
        insert into local_production_orders(production_order_number,production_batch_number,qr_token,product_id,quantity_planned,status,planned_start_date,planned_end_date,source_type,order_id,created_by,created_at,updated_at,is_snapshot_record,local_modified_at,production_order_group_id)
        values($1,$1,gen_random_uuid()::text,$2,$3,'DRAFT',$4::date,$5::date,'FROM_ORDER',$6,'local-admin',now(),now(),false,now(),$7) returning *`,
        [
          orderNumber,
          productId,
          quantity,
          body.planned_start_date || null,
          body.planned_end_date || null,
          body.order_id || null,
          groupId,
        ],
      );
      created.push(localProductionOrderRow(result.rows[0]));
    }
    await client.query("commit");
    res.status(201).json({
      group_id: groupId,
      idempotency_key: body.idempotency_key || randomUUID(),
      reused: false,
      order_count: created.length,
      orders: created,
    });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    sendError(res, error);
  } finally {
    client.release();
  }
});

app.post("/api/legacy-production-orders/:id/release", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "update local_production_orders set status='RELEASED',released_at=coalesce($2::timestamptz,now()),released_by='local-admin',updated_at=now(),local_modified_at=now() where id=$1 returning *",
      [req.params.id, req.body?.effectiveDate || null],
    );
    if (!rows[0])
      return res.status(404).json({ message: "Không tìm thấy lệnh sản xuất." });
    res.json({
      ...localProductionOrderRow(rows[0]),
      material_count: 0,
      operation_count: 0,
      reused: false,
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/legacy-production-orders/:id/complete", async (req, res) => {
  try {
    const good = Number(req.body?.quantityGood ?? req.body?.quantity_good ?? 0);
    const scrap = Number(
      req.body?.quantityScrap ?? req.body?.quantity_scrap ?? 0,
    );
    if (good < 0 || scrap < 0)
      throw new Error("Sản lượng hoàn thành không hợp lệ.");
    const { rows } = await pool.query(
      "update local_production_orders set status='COMPLETED',quantity_good=$2,quantity_scrap=$3,completed_at=now(),completed_by='local-admin',actual_end_at=now(),updated_at=now(),local_modified_at=now() where id=$1 returning *",
      [req.params.id, good, scrap],
    );
    if (!rows[0])
      return res.status(404).json({ message: "Không tìm thấy lệnh sản xuất." });
    res.json({
      id: rows[0].id,
      status: rows[0].status,
      output: {
        id: randomUUID(),
        production_order_id: rows[0].id,
        product_id: rows[0].product_id,
        quantity_good: good,
        quantity_scrap: scrap,
        output_date: new Date().toISOString(),
        warehouse_id: req.body?.warehouseId || null,
        status: "POSTED",
        valuation_status: "PENDING",
      },
      reused: false,
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/legacy-production-orders/:id/status", async (req, res) => {
  try {
    const status = String(
      req.body?.targetStatus || req.body?.target_status || "",
    ).trim();
    if (!status) throw new Error("Thiếu trạng thái đích.");
    const { rows } = await pool.query(
      "update local_production_orders set status=$2,updated_at=now(),local_modified_at=now() where id=$1 returning *",
      [req.params.id, status],
    );
    if (!rows[0])
      return res.status(404).json({ message: "Không tìm thấy lệnh sản xuất." });
    res.json(localProductionOrderRow(rows[0]));
  } catch (error) {
    sendError(res, error);
  }
});

const manufacturingPayload = (row: Record<string, unknown>) => ({
  id: row.id,
  ...(parseJsonValue(row.payload, {}) as Record<string, unknown>),
});
const nextManufacturingVersion = async (
  recordType: string,
  parentId: string,
) => {
  const { rows } = await pool.query(
    "select coalesce(max(version_number),0)::int version from local_manufacturing_records where record_type=$1 and parent_id=$2",
    [recordType, parentId],
  );
  return Number(rows[0]?.version || 0) + 1;
};
const saveManufacturingRecord = async (record: {
  id: string;
  recordType: string;
  productId?: string | null;
  parentId?: string | null;
  versionNumber?: number | null;
  status?: string | null;
  payload: Record<string, unknown>;
}) => {
  const { rows } = await pool.query(
    `
    insert into local_manufacturing_records(id,record_type,product_id,parent_id,version_number,status,payload,created_at,updated_at,is_snapshot_record,local_modified_at)
    values($1,$2,$3,$4,$5,$6,$7::jsonb,now(),now(),false,now())
    on conflict(id) do update set product_id=excluded.product_id,parent_id=excluded.parent_id,version_number=excluded.version_number,status=excluded.status,payload=excluded.payload,updated_at=now(),local_modified_at=now()
    returning *`,
    [
      record.id,
      record.recordType,
      record.productId || null,
      record.parentId || null,
      record.versionNumber ?? null,
      record.status || null,
      JSON.stringify(record.payload),
    ],
  );
  return manufacturingPayload(rows[0]);
};
const localManufacturingRecords = async (
  recordType: string,
  filters: { productId?: string; parentId?: string } = {},
) => {
  const { rows } = await pool.query(
    `select * from local_manufacturing_records where record_type=$1 and ($2='' or product_id=$2) and ($3='' or parent_id=$3) order by version_number desc nulls last,updated_at desc`,
    [recordType, filters.productId || "", filters.parentId || ""],
  );
  return rows.map(manufacturingPayload);
};

type ManufacturingQueryClient = Pick<PoolClient, "query">;
const manufacturingUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const manufacturingError = (message: string, status = 409) =>
  Object.assign(new Error(message), { status });
const manufacturingDate = (value: unknown, label: string) => {
  const text = String(value || "").trim();
  if (!text) return null;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(text) ||
    Number.isNaN(Date.parse(`${text}T00:00:00Z`)) ||
    new Date(`${text}T00:00:00Z`).toISOString().slice(0, 10) !== text
  )
    throw manufacturingError(`${label} không hợp lệ.`);
  return text;
};
const validateManufacturingRange = (
  payload: Record<string, unknown>,
  label: string,
  requireStart: boolean,
) => {
  const from = manufacturingDate(payload.effective_from, `Ngày bắt đầu ${label}`);
  const to = manufacturingDate(payload.effective_to, `Ngày kết thúc ${label}`);
  if (requireStart && !from)
    throw manufacturingError(`${label} chưa có ngày bắt đầu hiệu lực.`);
  if (to && !from)
    throw manufacturingError(`${label} có ngày kết thúc nhưng thiếu ngày bắt đầu.`);
  if (from && to && to < from)
    throw manufacturingError(`Khoảng hiệu lực ${label} không hợp lệ.`);
  return { from, to };
};
const operationalManufacturingParent = async (
  client: ManufacturingQueryClient,
  recordType: "bom_header" | "routing_header" | "manufacturing_profile",
  productId: string,
  label: string,
) => {
  const { rows } = await client.query(
    `select * from local_manufacturing_records
     where record_type=$1 and product_id=$2
       and coalesce((payload->>'is_active')::boolean,true)
     order by updated_at desc,id`,
    [recordType, productId],
  );
  if (rows.length > 1)
    throw manufacturingError(
      `${label} local có nhiều hồ sơ đang hoạt động cho cùng sản phẩm; cần hợp nhất trước khi tiếp tục.`,
    );
  return rows[0] || null;
};
const validateBomVersion = async (
  client: ManufacturingQueryClient,
  versionId: string,
  requireStart: boolean,
) => {
  const versionResult = await client.query(
    `select v.*,h.product_id header_product_id,h.payload header_payload,p.id active_product_id
     from local_manufacturing_records v
     left join local_manufacturing_records h
       on h.id=v.parent_id and h.record_type='bom_header'
     left join local_products p on p.id::text=h.product_id and p.is_active
     where v.id=$1 and v.record_type='bom_version'`,
    [versionId],
  );
  const version = versionResult.rows[0];
  if (!version) throw manufacturingError("Không tìm thấy phiên bản BOM.", 404);
  if (!version.parent_id || !version.header_product_id || !version.active_product_id)
    throw manufacturingError("Phiên bản BOM không còn thuộc đúng hồ sơ và sản phẩm đang hoạt động.");
  const headerPayload = manufacturingPayload({
    id: version.parent_id,
    payload: version.header_payload,
  }) as Record<string, unknown>;
  if (headerPayload.is_active === false)
    throw manufacturingError("Hồ sơ BOM đã ngừng hoạt động.");
  const payload = manufacturingPayload(version) as Record<string, unknown>;
  validateManufacturingRange(payload, "BOM", requireStart);
  const lines = await client.query(
    "select * from local_manufacturing_records where record_type='bom_line' and parent_id=$1 order by coalesce((payload->>'sequence')::int,0),id",
    [versionId],
  );
  const inventoryIds = new Set<string>();
  for (const [index, row] of lines.rows.entries()) {
    const line = manufacturingPayload(row) as Record<string, unknown>;
    const itemId = String(line.inventory_item_id || "");
    if (!manufacturingUuidPattern.test(itemId))
      throw manufacturingError(`Dòng BOM ${index + 1} thiếu vật tư hợp lệ.`);
    if (inventoryIds.has(itemId))
      throw manufacturingError("Một vật tư chỉ được xuất hiện một lần trong cùng phiên bản BOM.");
    inventoryIds.add(itemId);
    const item = (
      await client.query(
        "select id,base_unit from local_inventory_items where id::text=$1 and is_active",
        [itemId],
      )
    ).rows[0];
    if (!item)
      throw manufacturingError(`Vật tư ở dòng BOM ${index + 1} không tồn tại hoặc đã ngừng dùng.`);
    if (String(line.unit || "").toUpperCase() !== String(item.base_unit || "").toUpperCase())
      throw manufacturingError(`Dòng BOM ${index + 1} dùng sai đơn vị cơ sở của vật tư.`);
    const lineType = String(line.line_type || "MATERIAL").toUpperCase();
    if (!["MATERIAL", "PACKAGING", "SUPPLY", "OTHER"].includes(lineType))
      throw manufacturingError(`Loại dòng BOM ${index + 1} không hợp lệ.`);
    const method = String(line.quantity_method || "").toUpperCase();
    if (!["FIXED", "PER_UNIT", "FORMULA", "CUTTING_ENGINE"].includes(method))
      throw manufacturingError(`Phương pháp dòng BOM ${index + 1} không hợp lệ.`);
    const waste = Number(line.waste_rate ?? 0);
    const scrap = Number(line.scrap_rate ?? 0);
    if (![waste, scrap].every((value) => Number.isFinite(value) && value >= 0 && value <= 100))
      throw manufacturingError(`Tỷ lệ hao hụt/phế liệu dòng BOM ${index + 1} phải từ 0 đến 100.`);
    if (method === "CUTTING_ENGINE") {
      if (String(item.base_unit).toUpperCase() !== "METER")
        throw manufacturingError("Vật tư dùng sơ đồ cắt phải có đơn vị cơ sở METER.");
      const profileId = String(line.cutting_profile_id || "");
      const profile = manufacturingUuidPattern.test(profileId)
        ? (
            await client.query(
              `select 1 from local_manufacturing_records
               where id=$1 and record_type='cutting_profile' and product_id=$2
                 and coalesce((payload->>'is_active')::boolean,true)`,
              [profileId, version.header_product_id],
            )
          ).rows[0]
        : null;
      if (!profile)
        throw manufacturingError(`Dòng BOM ${index + 1} chưa chọn đúng hồ sơ cắt của sản phẩm.`);
      if (line.standard_quantity != null || line.formula_type || Object.keys(parseJsonValue(line.formula_parameters, {})).length)
        throw manufacturingError(`Dòng BOM ${index + 1} dùng sơ đồ cắt không được kèm định mức/công thức khác.`);
    } else {
      const standard = Number(line.standard_quantity);
      if (!Number.isFinite(standard) || standard <= 0)
        throw manufacturingError(`Định mức dòng BOM ${index + 1} phải lớn hơn 0.`);
      if (line.cutting_profile_id)
        throw manufacturingError(`Dòng BOM ${index + 1} không dùng sơ đồ cắt nhưng vẫn gắn hồ sơ cắt.`);
      if (method === "FORMULA") {
        const parameters = parseJsonValue(line.formula_parameters, {}) as Record<string, unknown>;
        if (String(line.formula_type || "").toUpperCase() !== "PER_BATCH" || !(Number(parameters.batch_size) > 0))
          throw manufacturingError(`Công thức dòng BOM ${index + 1} phải là PER_BATCH và có cỡ mẻ lớn hơn 0.`);
      } else if (line.formula_type)
        throw manufacturingError(`Dòng BOM ${index + 1} không dùng công thức nhưng vẫn có loại công thức.`);
    }
  }
  return { version, payload, lines: lines.rows };
};

const validateCuttingVersionPayload = async (
  client: ManufacturingQueryClient,
  payload: Record<string, unknown>,
  productId: string,
  requireStart: boolean,
) => {
  validateManufacturingRange(payload, "cấu hình cắt", requireStart);
  const rules = [
    "FINISHED_WIDTH",
    "FINISHED_LENGTH",
    "FINISHED_WIDTH_PLUS_2_HEIGHT_TUCK",
    "FINISHED_LENGTH_PLUS_2_HEIGHT_TUCK",
    "DOUBLE_FINISHED_LENGTH_PLUS_FLAP",
    "PARAMETER",
    "FIXED",
  ];
  for (const dimension of ["width", "length"] as const) {
    const rule = String(payload[`piece_${dimension}_rule`] || "").toUpperCase();
    const parameter = Number(payload[`piece_${dimension}_parameter_cm`]);
    if (!rules.includes(rule))
      throw manufacturingError(`Quy tắc kích thước ${dimension === "width" ? "rộng" : "dài"} không hợp lệ.`);
    if (["PARAMETER", "FIXED"].includes(rule) && !(parameter > 0))
      throw manufacturingError(`Quy tắc ${rule} cần kích thước cấu hình lớn hơn 0.`);
  }
  const pieces = Number(payload.pieces_per_product);
  const fabricWidth = Number(payload.default_fabric_width_cm);
  const rounding = Number(payload.issue_rounding_increment);
  if (!Number.isInteger(pieces) || pieces <= 0)
    throw manufacturingError("Số chi tiết trên mỗi sản phẩm phải là số nguyên dương.");
  if (!(fabricWidth > 0)) throw manufacturingError("Khổ vải mặc định phải lớn hơn 0.");
  if (!(rounding > 0)) throw manufacturingError("Bước làm tròn cấp phát phải lớn hơn 0.");
  if (String(payload.calculation_strategy || "GRID").toUpperCase() !== "GRID")
    throw manufacturingError("Chỉ hỗ trợ chiến lược tính sơ đồ GRID.");
  if (!["NONE", "ONE_DIRECTION", "BIDIRECTIONAL"].includes(String(payload.pattern_direction || "NONE").toUpperCase()))
    throw manufacturingError("Chiều hoa văn không hợp lệ.");
  const nonNegative = [
    "seam_allowance_cm",
    "hem_allowance_cm",
    "tuck_depth_cm",
    "flap_allowance_cm",
    "joining_allowance_cm",
  ];
  if (nonNegative.some((field) => !Number.isFinite(Number(payload[field] ?? 0)) || Number(payload[field] ?? 0) < 0))
    throw manufacturingError("Các khoản chừa đường may, gấu, nhét, nẹp và ghép không được âm.");
  const waste = Number(payload.standard_waste_rate ?? 0);
  if (!Number.isFinite(waste) || waste < 0 || waste > 100)
    throw manufacturingError("Tỷ lệ hao hụt chuẩn phải từ 0 đến 100.");
  if (payload.requires_matching_pattern === true && !(Number(payload.pattern_repeat_cm) > 0))
    throw manufacturingError("Vải canh hoa cần chu kỳ hoa văn lớn hơn 0.");
  const joiningAllowed = payload.joining_allowed === true;
  const joiningRule = String(payload.joining_rule || "NONE").toUpperCase();
  if ((joiningAllowed && joiningRule !== "MULTI_PANEL_LENGTHWISE") || (!joiningAllowed && joiningRule !== "NONE"))
    throw manufacturingError("Quy tắc ghép vải không khớp trạng thái cho phép ghép.");
  if (joiningAllowed && Number(payload.joining_allowance_cm ?? 0) >= fabricWidth)
    throw manufacturingError("Phần chồng mép ghép phải nhỏ hơn khổ vải.");
  const profile = await operationalManufacturingParent(
    client,
    "manufacturing_profile",
    productId,
    "Hồ sơ kích thước sản xuất",
  );
  if (!profile)
    throw manufacturingError("Sản phẩm chưa có hồ sơ kích thước sản xuất local.");
  const dimensions = manufacturingPayload(profile) as Record<string, unknown>;
  if (!(Number(dimensions.finished_width) > 0) || !(Number(dimensions.finished_length) > 0))
    throw manufacturingError("Hồ sơ sản xuất chưa có chiều rộng/chiều dài hợp lệ.");
  if (!["MM", "CM", "METER"].includes(String(dimensions.dimension_unit || "").toUpperCase()))
    throw manufacturingError("Đơn vị kích thước sản xuất không hợp lệ.");
};

const validateRoutingVersion = async (
  client: ManufacturingQueryClient,
  versionId: string,
  requireStart: boolean,
) => {
  const versionResult = await client.query(
    `select v.*,h.product_id header_product_id,p.id active_product_id
     from local_manufacturing_records v
     left join local_manufacturing_records h
       on h.id=v.parent_id and h.record_type='routing_header'
     left join local_products p on p.id::text=h.product_id and p.is_active
     where v.id=$1 and v.record_type='routing_version'`,
    [versionId],
  );
  const version = versionResult.rows[0];
  if (!version) throw manufacturingError("Không tìm thấy phiên bản quy trình.", 404);
  if (!version.parent_id || !version.header_product_id || !version.active_product_id)
    throw manufacturingError("Phiên bản quy trình không còn thuộc đúng hồ sơ và sản phẩm đang hoạt động.");
  validateManufacturingRange(
    manufacturingPayload(version) as Record<string, unknown>,
    "quy trình sản xuất",
    requireStart,
  );
  const operations = await client.query(
    "select * from local_manufacturing_records where record_type='routing_operation' and parent_id=$1 order by coalesce((payload->>'sequence')::int,0),id",
    [versionId],
  );
  if (requireStart && !operations.rows.length)
    throw manufacturingError("Quy trình sản xuất chưa có công đoạn.");
  const sequences = new Set<number>();
  for (const [index, row] of operations.rows.entries()) {
    const operation = manufacturingPayload(row) as Record<string, unknown>;
    const sequence = Number(operation.sequence ?? index + 1);
    if (!Number.isInteger(sequence) || sequence <= 0 || sequences.has(sequence))
      throw manufacturingError("Số thứ tự công đoạn phải là số nguyên dương và không trùng nhau.");
    sequences.add(sequence);
    if (!String(operation.operation_code || "").trim() || !String(operation.operation_name || "").trim())
      throw manufacturingError(`Công đoạn ${index + 1} thiếu mã hoặc tên.`);
    const run = Number(operation.standard_minutes_per_unit ?? 0);
    const setup = Number(operation.setup_minutes ?? 0);
    if (![run, setup].every((value) => Number.isFinite(value) && value >= 0))
      throw manufacturingError(`Thời gian chuẩn công đoạn ${index + 1} không hợp lệ.`);
  }
  return { version, operations: operations.rows };
};

app.get("/api/manufacturing/products", async (req, res) => {
  try {
    const search = String(req.query.search || "")
      .trim()
      .toLowerCase();
    const { rows } = await pool.query(
      `select id,name,sku,category,in_stock from local_products where is_active and ($1='' or lower(coalesce(name,'')) like '%'||$1||'%' or lower(coalesce(sku,'')) like '%'||$1||'%') order by name limit 500`,
      [search],
    );
    res.json(rows.map((row) => ({ ...row, in_stock: Boolean(row.in_stock) })));
  } catch (error) {
    sendError(res, error);
  }
});

// Profile GET/PUT is registered by the shared versioned technical-profile writer.

app.get("/api/manufacturing/products/:productId/bom", async (req, res) => {
  try {
    const headerRow = await operationalManufacturingParent(
      pool,
      "bom_header",
      req.params.productId,
      "BOM",
    );
    if (!headerRow) return res.json({ header: null, versions: [] });
    const header = manufacturingPayload(headerRow);
    const headerId = String(headerRow.id);
    const versions = await localManufacturingRecords("bom_version", {
      parentId: headerId,
    });
    res.json({ header, versions });
  } catch (error) {
    sendError(res, error);
  }
});

app.get(
  "/api/manufacturing/bom/versions/:versionId/lines",
  async (req, res) => {
    try {
      const local = await localManufacturingRecords("bom_line", {
        parentId: req.params.versionId,
      });
      res.json(local);
    } catch (error) {
      sendError(res, error);
    }
  },
);

app.post("/api/manufacturing/bom/drafts", async (req, res) => {
  try {
    await requireLocalCapability(pool, ["bom_manage"]);
    const productId = String(req.body?.product_id || "");
    if (!productId) throw new Error("Thiếu sản phẩm cho BOM.");
    if (!(await pool.query("select 1 from local_products where id::text=$1 and is_active", [productId])).rows[0])
      throw manufacturingError("Không tìm thấy sản phẩm đang hoạt động.", 404);
    let headerId: string = randomUUID();
    let header: Record<string, unknown> | null = null;
    if (req.body?.clone_version_id) {
      const source = await pool.query(`select h.* from local_manufacturing_records v join local_manufacturing_records h on h.id=v.parent_id and h.record_type='bom_header'
        where v.id=$1 and v.record_type='bom_version' and h.product_id=$2`, [String(req.body.clone_version_id),productId]);
      if (!source.rows[0]) throw new Error("Phiên bản BOM nguồn không thuộc sản phẩm đã chọn.");
      headerId = String(source.rows[0].id);
      header = manufacturingPayload(source.rows[0]);
    } else {
      const existing = await operationalManufacturingParent(pool, "bom_header", productId, "BOM");
      if (existing) {
        headerId = String(existing.id);
        header = manufacturingPayload(existing);
      }
    }
    if ((await pool.query("select 1 from local_manufacturing_records where record_type='bom_version' and parent_id=$1 and status='DRAFT' limit 1", [headerId])).rows[0])
      throw manufacturingError("BOM đang có một phiên bản nháp; hãy hoàn tất phiên bản đó trước.");
    const versionId = randomUUID();
    const version = await nextManufacturingVersion("bom_version", headerId);
    if (!header) header = await saveManufacturingRecord({
        id: headerId,
        recordType: "bom_header",
        productId,
        status: "ACTIVE",
        payload: {
          id: headerId,
          product_id: productId,
          code: req.body.code || `BOM-${productId.slice(0, 8)}`,
          name: req.body.name || "Định mức sản xuất",
          is_active: true,
        },
      });
    const bomVersion = await saveManufacturingRecord({
      id: versionId,
      recordType: "bom_version",
      parentId: headerId,
      versionNumber: version,
      status: "DRAFT",
      payload: {
        id: versionId,
        bom_id: headerId,
        version_number: version,
        status: "DRAFT",
        effective_from: null,
        effective_to: null,
        notes: null,
        created_at: new Date().toISOString(),
      },
    });
    if (req.body?.clone_version_id) {
      const sourceLines = await pool.query(
        "select * from local_manufacturing_records where record_type='bom_line' and parent_id=$1 order by coalesce((payload->>'sequence')::int,0)",
        [String(req.body.clone_version_id)],
      );
      for (const source of sourceLines.rows) {
        const line = manufacturingPayload(source) as Record<string, unknown>;
        await saveManufacturingRecord({
          id: randomUUID(),
          recordType: "bom_line",
          parentId: versionId,
          status: "DRAFT",
          payload: { ...line, id: undefined, bom_version_id: versionId },
        });
      }
    }
    res.status(201).json({ header, version: bomVersion });
  } catch (error) {
    sendError(res, error);
  }
});

app.put("/api/manufacturing/bom/versions/:versionId", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await requireLocalCapability(client, ["bom_manage"]);
    const versionResult = await client.query(
      "select * from local_manufacturing_records where id=$1 and record_type='bom_version' for update",
      [req.params.versionId],
    );
    if (!versionResult.rows[0])
      throw manufacturingError("Không tìm thấy phiên bản BOM.", 404);
    if (versionResult.rows[0].status !== "DRAFT")
      throw manufacturingError("Chỉ được sửa phiên bản BOM nháp.");
    const payload = {
      ...parseJsonValue(versionResult.rows[0].payload, {}),
      effective_from: req.body?.effective_from ?? null,
      effective_to: req.body?.effective_to ?? null,
      notes: req.body?.notes ?? null,
      status: "DRAFT",
    };
    await client.query(
      "update local_manufacturing_records set payload=$2::jsonb,status='DRAFT',updated_at=now(),local_modified_at=now() where id=$1",
      [req.params.versionId, JSON.stringify(payload)],
    );
    await client.query(
      "delete from local_manufacturing_records where record_type='bom_line' and parent_id=$1",
      [req.params.versionId],
    );
    for (const [index, line] of (Array.isArray(req.body?.lines)
      ? req.body.lines
      : []
    ).entries()) {
      const linePayload = {
        ...line,
        id: randomUUID(),
        bom_version_id: req.params.versionId,
        sequence: index + 1,
      };
      await client.query(
        "insert into local_manufacturing_records(id,record_type,parent_id,status,payload,is_snapshot_record,local_modified_at) values($1,'bom_line',$2,'DRAFT',$3::jsonb,false,now())",
        [linePayload.id, req.params.versionId, JSON.stringify(linePayload)],
      );
    }
    await validateBomVersion(client, req.params.versionId, false);
    await client.query("commit");
    res.json({
      id: req.params.versionId,
      status: "DRAFT",
      line_count: Array.isArray(req.body?.lines) ? req.body.lines.length : 0,
    });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    sendError(res, error);
  } finally {
    client.release();
  }
});

app.post(
  "/api/manufacturing/bom/versions/:versionId/approve",
  async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await requireLocalCapability(client, ["bom_approve"]);
      const current = await client.query(
        "select parent_id,status from local_manufacturing_records where id=$1 and record_type='bom_version' for update",
        [req.params.versionId],
      );
      if (!current.rows[0]) throw manufacturingError("Không tìm thấy phiên bản BOM.", 404);
      if (current.rows[0].status !== "DRAFT") throw Object.assign(new Error("Chỉ phiên bản BOM nháp mới được duyệt."), { status: 409 });
      if (!String(req.body?.reason || "").trim()) throw new Error("Duyệt BOM phải có lý do.");
      await validateBomVersion(client, req.params.versionId, true);
      await client.query(
        "update local_manufacturing_records set status='SUPERSEDED',payload=jsonb_set(payload,'{status}','\"SUPERSEDED\"'::jsonb),updated_at=now(),local_modified_at=now() where record_type='bom_version' and parent_id=$1 and id<>$2 and status='APPROVED'",
        [current.rows[0].parent_id, req.params.versionId],
      );
      const { rows } = await client.query(
        "update local_manufacturing_records set status='APPROVED',payload=jsonb_set(jsonb_set(payload,'{status}','\"APPROVED\"'::jsonb),'{approval_reason}',to_jsonb($2::text)),updated_at=now(),local_modified_at=now() where id=$1 returning *",
        [req.params.versionId, String(req.body?.reason || "")],
      );
      await client.query("commit");
      if (!rows[0])
        return res
          .status(404)
          .json({ message: "Không tìm thấy phiên bản BOM." });
      res.json(manufacturingPayload(rows[0]));
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      sendError(res, error);
    } finally {
      client.release();
    }
  },
);

const manufacturingProfileRoutes = {
  cutting_profile: { versionType: "cutting_version", path: "cutting" },
  routing_header: { versionType: "routing_version", path: "routing" },
} as const;

app.get(
  "/api/manufacturing/products/:productId/cutting-profiles",
  async (req, res) => {
    try {
      res.json(
        await localManufacturingRecords("cutting_profile", {
          productId: req.params.productId,
        }),
      );
    } catch (error) {
      sendError(res, error);
    }
  },
);
app.get(
  "/api/manufacturing/cutting-profiles/:profileId/versions",
  async (req, res) => {
    try {
      res.json(
        await localManufacturingRecords("cutting_version", {
          parentId: req.params.profileId,
        }),
      );
    } catch (error) {
      sendError(res, error);
    }
  },
);
app.post("/api/manufacturing/cutting-profiles/drafts", async (req, res) => {
  try {
    await requireLocalCapability(pool, ["cutting_profiles"]);
    const productId = String(req.body?.product_id || "");
    if (!productId) throw new Error("Thiếu sản phẩm cho cấu hình cắt.");
    if (!(await pool.query("select 1 from local_products where id::text=$1 and is_active", [productId])).rows[0])
      throw manufacturingError("Không tìm thấy sản phẩm đang hoạt động.", 404);
    let profileId: string = randomUUID();
    let profile: Record<string, unknown> | null = null;
    if (req.body?.clone_version_id) {
      const source = await pool.query(`select p.* from local_manufacturing_records v join local_manufacturing_records p on p.id=v.parent_id and p.record_type='cutting_profile'
        where v.id=$1 and v.record_type='cutting_version' and p.product_id=$2`, [String(req.body.clone_version_id),productId]);
      if (!source.rows[0]) throw new Error("Phiên bản cắt nguồn không thuộc sản phẩm đã chọn.");
      profileId = String(source.rows[0].id);
      profile = manufacturingPayload(source.rows[0]);
    } else {
      const code = String(req.body?.code || "").trim();
      const name = String(req.body?.name || "").trim();
      if (!code || !name) throw manufacturingError("Cần nhập mã và tên cấu hình cắt.");
      const existing = await pool.query(
        `select * from local_manufacturing_records
         where record_type='cutting_profile' and product_id=$1
           and lower(coalesce(payload->>'code',''))=lower($2)
           and coalesce((payload->>'is_active')::boolean,true)
         order by updated_at desc,id`,
        [productId, code],
      );
      if (existing.rows.length > 1)
        throw manufacturingError("Mã cấu hình cắt local đang trùng; cần hợp nhất trước khi tiếp tục.");
      if (existing.rows[0]) {
        profileId = String(existing.rows[0].id);
        profile = manufacturingPayload(existing.rows[0]);
      }
    }
    if ((await pool.query("select 1 from local_manufacturing_records where record_type='cutting_version' and parent_id=$1 and status='DRAFT' limit 1", [profileId])).rows[0])
      throw manufacturingError("Cấu hình cắt đang có một phiên bản nháp; hãy hoàn tất phiên bản đó trước.");
    const versionId = randomUUID();
    const version = await nextManufacturingVersion(
      "cutting_version",
      profileId,
    );
    if (!profile) profile = await saveManufacturingRecord({
        id: profileId,
        recordType: "cutting_profile",
        productId,
        status: "ACTIVE",
        payload: {
          id: profileId,
          product_id: productId,
          code: req.body?.code,
          name: req.body?.name,
          manufacturing_type:
            req.body?.manufacturing_type || "GENERIC_SEWN_PRODUCT",
          is_active: true,
        },
      });
    let cloneConfiguration: Record<string, unknown> = {};
    if (req.body?.clone_version_id) {
      const clone = await pool.query(
        "select payload from local_manufacturing_records where id=$1 and record_type='cutting_version'",
        [String(req.body.clone_version_id)],
      );
      if (clone.rows[0])
        cloneConfiguration = parseJsonValue(
          clone.rows[0].payload,
          {},
        ) as Record<string, unknown>;
    }
    const cuttingVersion = await saveManufacturingRecord({
      id: versionId,
      recordType: "cutting_version",
      parentId: profileId,
      versionNumber: version,
      status: "DRAFT",
      payload: {
        pieces_per_product: 1,
        piece_width_rule: "FIXED",
        piece_length_rule: "FIXED",
        standard_waste_rate: 0,
        issue_rounding_increment: 0.1,
        ...cloneConfiguration,
        id: versionId,
        cutting_profile_id: profileId,
        version_number: version,
        status: "DRAFT",
        created_at: new Date().toISOString(),
        ...req.body.configuration,
      },
    });
    res.status(201).json({ profile, version: cuttingVersion });
  } catch (error) {
    sendError(res, error);
  }
});
app.put("/api/manufacturing/cutting-versions/:versionId", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await requireLocalCapability(client, ["cutting_profiles"]);
    const current = await client.query(
      `select v.*,p.product_id profile_product_id
       from local_manufacturing_records v
       left join local_manufacturing_records p
         on p.id=v.parent_id and p.record_type='cutting_profile'
       where v.id=$1 and v.record_type='cutting_version' for update of v`,
      [req.params.versionId],
    );
    if (!current.rows[0]) throw manufacturingError("Không tìm thấy phiên bản cắt.", 404);
    if (!current.rows[0].profile_product_id)
      throw manufacturingError("Phiên bản cắt không còn thuộc đúng hồ sơ sản phẩm.");
    if (current.rows[0].status !== "DRAFT")
      throw manufacturingError("Chỉ được sửa phiên bản cấu hình cắt nháp.");
    const previous = manufacturingPayload(current.rows[0]) as Record<string, unknown>;
    const configuration =
      req.body?.configuration && typeof req.body.configuration === "object" && !Array.isArray(req.body.configuration)
        ? (req.body.configuration as Record<string, unknown>)
        : {};
    const merged = {
      ...previous,
      ...configuration,
      id: current.rows[0].id,
      cutting_profile_id: current.rows[0].parent_id,
      version_number: current.rows[0].version_number,
      status: "DRAFT",
      effective_from: req.body?.effective_from ?? configuration.effective_from ?? previous.effective_from ?? null,
      effective_to: req.body?.effective_to ?? configuration.effective_to ?? previous.effective_to ?? null,
    };
    await validateCuttingVersionPayload(client, merged, String(current.rows[0].profile_product_id), false);
    const { rows } = await client.query(
      "update local_manufacturing_records set payload=$2::jsonb,status='DRAFT',updated_at=now(),local_modified_at=now() where id=$1 returning *",
      [req.params.versionId, JSON.stringify(merged)],
    );
    await client.query("commit");
    res.json(manufacturingPayload(rows[0]));
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    sendError(res, error);
  } finally {
    client.release();
  }
});
app.post(
  "/api/manufacturing/cutting-versions/:versionId/approve",
  async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await requireLocalCapability(client, ["cutting_approve"]);
      const current = await client.query(
        `select v.*,p.product_id profile_product_id
         from local_manufacturing_records v
         left join local_manufacturing_records p
           on p.id=v.parent_id and p.record_type='cutting_profile'
         where v.id=$1 and v.record_type='cutting_version' for update of v`,
        [req.params.versionId],
      );
      if (!current.rows[0]) throw manufacturingError("Không tìm thấy phiên bản cắt.", 404);
      if (!current.rows[0].profile_product_id)
        throw manufacturingError("Phiên bản cắt không còn thuộc đúng hồ sơ sản phẩm.");
      if (current.rows[0].status !== "DRAFT") throw Object.assign(new Error("Chỉ phiên bản cắt nháp mới được duyệt."), { status: 409 });
      const reason = String(req.body?.reason || "").trim();
      if (!reason) throw manufacturingError("Duyệt cấu hình cắt phải có lý do.");
      const payload = manufacturingPayload(current.rows[0]) as Record<string, unknown>;
      await validateCuttingVersionPayload(client, payload, String(current.rows[0].profile_product_id), true);
      await client.query(
        "update local_manufacturing_records set status='SUPERSEDED',payload=jsonb_set(payload,'{status}','\"SUPERSEDED\"'::jsonb),updated_at=now(),local_modified_at=now() where record_type='cutting_version' and parent_id=$1 and id<>$2 and status='APPROVED'",
        [current.rows[0].parent_id, req.params.versionId],
      );
      const { rows } = await client.query(
        "update local_manufacturing_records set status='APPROVED',payload=jsonb_set(jsonb_set(jsonb_set(payload,'{status}','\"APPROVED\"'::jsonb),'{approval_reason}',to_jsonb($2::text)),'{approved_at}',to_jsonb(now()::text)),updated_at=now(),local_modified_at=now() where id=$1 returning *",
        [req.params.versionId, reason],
      );
      await client.query("commit");
      if (!rows[0])
        return res
          .status(404)
          .json({ message: "Không tìm thấy phiên bản cắt." });
      res.json(manufacturingPayload(rows[0]));
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      sendError(res, error);
    } finally {
      client.release();
    }
  },
);

app.post(
  "/api/manufacturing/cutting-versions/:versionId/calculate",
  async (req, res) => {
    try {
        const allowDraft = req.body?.allow_draft === true;
        if (allowDraft) await requireLocalCapability(pool, ["cutting_profiles"]);
        const result = await cuttingGrid(pool, req.params.versionId, Number(req.body?.quantity || 0), req.body?.fabric_width_cm, allowDraft);
        res.json({ ...result, calculation_steps: ["Tính theo sơ đồ hàng cắt đã duyệt.", "Cộng hao hụt và làm tròn cấp phát theo cấu hình."] });
    } catch (error) {
      sendError(res, error);
    }
  },
);

app.post(
  "/api/manufacturing/material-requirements/calculate",
  async (req, res) => {
    try {
      const productId = String(req.body?.product_id || "");
      const quantity = Math.max(0, Number(req.body?.quantity || 0));
      const requestedVersionId = req.body?.bom_version_id
        ? String(req.body.bom_version_id)
        : "";
      if (!productId || quantity <= 0)
        throw new Error("Sản phẩm và số lượng cần tính là bắt buộc.");
      const headerRow = await operationalManufacturingParent(pool, "bom_header", productId, "BOM");
      const header = headerRow
        ? (manufacturingPayload(headerRow) as Record<
            string,
            unknown
          >)
        : null;
      if (!header) throw new Error("Sản phẩm chưa có BOM local.");
      const versionResult = requestedVersionId
        ? await pool.query(
            "select v.* from local_manufacturing_records v where v.id=$1 and v.record_type='bom_version' and v.parent_id=$2",
            [requestedVersionId, String(header.id)],
          )
        : await pool.query(
            `select * from local_manufacturing_records where record_type='bom_version' and parent_id=$1
             and status in ('APPROVED','SUPERSEDED') and coalesce(nullif(payload->>'effective_from','')::date,'-infinity'::date)<=coalesce($2::date,current_date)
             and coalesce(nullif(payload->>'effective_to','')::date,'infinity'::date)>=coalesce($2::date,current_date)
             order by coalesce(nullif(payload->>'effective_from','')::date,'-infinity'::date) desc,version_number desc limit 1`,
            [String(header.id), req.body?.effective_date || null],
          );
      const versionRow = versionResult.rows[0];
      if (!versionRow) throw new Error("BOM chưa có phiên bản để tính.");
      const version = manufacturingPayload(versionRow) as Record<
        string,
        unknown
      >;
      if (String(version.status) === "DRAFT" && !req.body?.allow_draft)
        throw new Error("BOM nháp chưa được phép tính.");
      const lineResult = await pool.query(
        "select * from local_manufacturing_records where record_type='bom_line' and parent_id=$1 order by coalesce((payload->>'sequence')::int,0)",
        [String(version.id)],
      );
      const materialsResult = await pool.query(
        "select id,code,name,base_unit from local_inventory_items where is_active",
      );
      const materialMap = new Map(
        materialsResult.rows.map((row) => [String(row.id), row]),
      );
      const stockResult = await pool.query(
        "select inventory_item_id,coalesce(sum(quantity_delta),0)::numeric current_stock from local_inventory_movements group by inventory_item_id",
      );
      const stockMap = new Map(
        stockResult.rows.map((row) => [
          String(row.inventory_item_id),
          asNumber(row.current_stock) || 0,
        ]),
      );
      const materials = [];
      for (const row of lineResult.rows) {
        const line = manufacturingPayload(row) as Record<string, unknown>;
        const item = materialMap.get(String(line.inventory_item_id));
        const wasteRate = Number(line.waste_rate || 0);
        const scrapRate = Number(line.scrap_rate || 0);
        if (!item) throw new Error("BOM chứa vật tư không tồn tại hoặc đã ngừng dùng.");
        if (String(line.quantity_method || "").toUpperCase() === "CUTTING_ENGINE" && String(item.base_unit || "").toUpperCase() !== "METER") throw new Error("Vật tư dùng sơ đồ cắt phải có đơn vị cơ sở METER.");
        const calculated = await calculateBomMaterialLine(pool, line, quantity, req.body?.effective_date || businessDateKey());
        const planned = calculated.plannedQuantity;
        const net = planned - calculated.wasteQuantity;
        const stock = stockMap.get(String(line.inventory_item_id)) || 0;
        materials.push({
          inventory_item_id: String(line.inventory_item_id),
          item_code: item?.code || "",
          item_name: item?.name || "",
          line_type: String(line.line_type || "MATERIAL"),
          method: String(line.quantity_method || "PER_UNIT"),
          net_quantity: net,
          waste_rate: wasteRate,
          scrap_rate: scrapRate,
          standard_quantity: planned,
          unit: item?.base_unit || line.unit || "PIECE",
          current_stock: stock,
          average_unit_cost: null,
          estimated_material_cost: null,
          cost_visible: false,
          warnings:
            planned > stock
              ? { stock: "Tồn kho local thấp hơn nhu cầu tính." }
              : {},
          cutting_profile_version_id: calculated.cuttingProfileVersionId,
          calculation_details: calculated.snapshot,
        });
      }
      res.json({
        product_id: productId,
        bom_id: String(header.id),
        bom_version_id: String(version.id),
        bom_version_number: Number(version.version_number || 0),
        bom_status: String(version.status || "DRAFT"),
        quantity,
        effective_date: String(
          req.body?.effective_date || businessDateKey(),
        ),
        warehouse_id: req.body?.warehouse_id || null,
        calculation_engine_version: "local-material-v1",
        materials,
        cost_visible: false,
        cost_as_of: new Date().toISOString(),
        estimated_material_cost_total: null,
        cost_label: "Chi phí local chưa định giá",
        inventory_side_effect: false,
      });
    } catch (error) {
      sendError(res, error);
    }
  },
);

app.get("/api/manufacturing/products/:productId/routing", async (req, res) => {
  try {
    const headerRow = await operationalManufacturingParent(
      pool,
      "routing_header",
      req.params.productId,
      "Quy trình sản xuất",
    );
    const header = headerRow ? manufacturingPayload(headerRow) : null;
    const versions = header
      ? await localManufacturingRecords("routing_version", {
          parentId: String(header.id),
        })
      : [];
    res.json({ header, versions });
  } catch (error) {
    sendError(res, error);
  }
});
app.get(
  "/api/manufacturing/routing/versions/:versionId/operations",
  async (req, res) => {
    try {
      res.json(
        await localManufacturingRecords("routing_operation", {
          parentId: req.params.versionId,
        }),
      );
    } catch (error) {
      sendError(res, error);
    }
  },
);
app.post("/api/manufacturing/routing/drafts", async (req, res) => {
  try {
    await requireLocalCapability(pool, ["bom_manage", "production_manage"]);
    const productId = String(req.body?.product_id || "");
    if (!productId || !(await pool.query("select 1 from local_products where id::text=$1 and is_active", [productId])).rows[0])
      throw manufacturingError("Không tìm thấy sản phẩm đang hoạt động.", 404);
    let headerId: string = randomUUID();
    let header: Record<string, unknown> | null = null;
    if (req.body?.clone_version_id) {
      const source = await pool.query(
        `select h.* from local_manufacturing_records v
         join local_manufacturing_records h on h.id=v.parent_id and h.record_type='routing_header'
         where v.id=$1 and v.record_type='routing_version' and h.product_id=$2`,
        [String(req.body.clone_version_id), productId],
      );
      if (!source.rows[0])
        throw manufacturingError("Phiên bản quy trình nguồn không thuộc sản phẩm đã chọn.");
      headerId = String(source.rows[0].id);
      header = manufacturingPayload(source.rows[0]);
    } else {
      const existing = await operationalManufacturingParent(pool, "routing_header", productId, "Quy trình sản xuất");
      if (existing) {
        headerId = String(existing.id);
        header = manufacturingPayload(existing);
      }
    }
    if ((await pool.query("select 1 from local_manufacturing_records where record_type='routing_version' and parent_id=$1 and status='DRAFT' limit 1", [headerId])).rows[0])
      throw manufacturingError("Quy trình đang có một phiên bản nháp; hãy hoàn tất phiên bản đó trước.");
    const versionId = randomUUID();
    const version = await nextManufacturingVersion("routing_version", headerId);
    if (!header) header = await saveManufacturingRecord({
      id: headerId,
      recordType: "routing_header",
      productId,
      status: "ACTIVE",
      payload: {
        id: headerId,
        product_id: productId,
        code: req.body?.code,
        name: req.body?.name,
        is_active: true,
      },
    });
    const routingVersion = await saveManufacturingRecord({
      id: versionId,
      recordType: "routing_version",
      parentId: headerId,
      versionNumber: version,
      status: "DRAFT",
      payload: {
        id: versionId,
        routing_id: headerId,
        version_number: version,
        status: "DRAFT",
        effective_from: null,
        effective_to: null,
        notes: null,
        created_at: new Date().toISOString(),
      },
    });
    if (req.body?.clone_version_id) {
      const sourceOps = await pool.query(
        "select * from local_manufacturing_records where record_type='routing_operation' and parent_id=$1 order by coalesce((payload->>'sequence')::int,0)",
        [String(req.body.clone_version_id)],
      );
      for (const source of sourceOps.rows) {
        const operation = manufacturingPayload(source) as Record<
          string,
          unknown
        >;
        await saveManufacturingRecord({
          id: randomUUID(),
          recordType: "routing_operation",
          parentId: versionId,
          status: "DRAFT",
          payload: {
            ...operation,
            id: undefined,
            routing_version_id: versionId,
          },
        });
      }
    }
    res.status(201).json({ header, version: routingVersion });
  } catch (error) {
    sendError(res, error);
  }
});
app.put("/api/manufacturing/routing/versions/:versionId", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await requireLocalCapability(client, ["bom_manage", "production_manage"]);
    const current = await client.query(
      "select * from local_manufacturing_records where id=$1 and record_type='routing_version' for update",
      [req.params.versionId],
    );
    if (!current.rows[0]) throw manufacturingError("Không tìm thấy phiên bản quy trình.", 404);
    if (current.rows[0].status !== "DRAFT")
      throw manufacturingError("Chỉ được sửa phiên bản quy trình nháp.");
    const payload = {
      ...parseJsonValue(current.rows[0].payload, {}),
      effective_from: req.body?.effective_from ?? null,
      effective_to: req.body?.effective_to ?? null,
      notes: req.body?.notes ?? null,
      status: "DRAFT",
    };
    await client.query(
      "update local_manufacturing_records set payload=$2::jsonb,status='DRAFT',updated_at=now(),local_modified_at=now() where id=$1",
      [req.params.versionId, JSON.stringify(payload)],
    );
    await client.query(
      "delete from local_manufacturing_records where record_type='routing_operation' and parent_id=$1",
      [req.params.versionId],
    );
    for (const [index, operation] of (Array.isArray(req.body?.operations)
      ? req.body.operations
      : []
    ).entries()) {
      const op = {
        ...operation,
        id: randomUUID(),
        routing_version_id: req.params.versionId,
        sequence: operation.sequence ?? index + 1,
      };
      await client.query(
        "insert into local_manufacturing_records(id,record_type,parent_id,status,payload,is_snapshot_record,local_modified_at) values($1,'routing_operation',$2,'DRAFT',$3::jsonb,false,now())",
        [op.id, req.params.versionId, JSON.stringify(op)],
      );
    }
    await validateRoutingVersion(client, req.params.versionId, false);
    await client.query("commit");
    res.json({
      id: req.params.versionId,
      status: "DRAFT",
      operation_count: Array.isArray(req.body?.operations)
        ? req.body.operations.length
        : 0,
    });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    sendError(res, error);
  } finally {
    client.release();
  }
});
app.post(
  "/api/manufacturing/routing/versions/:versionId/approve",
  async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await requireLocalCapability(client, ["bom_approve", "production_manage"]);
      const current = await client.query(
        "select parent_id,status from local_manufacturing_records where id=$1 and record_type='routing_version' for update",
        [req.params.versionId],
      );
      if (!current.rows[0]) throw manufacturingError("Không tìm thấy phiên bản quy trình.", 404);
      if (current.rows[0].status !== "DRAFT")
        throw manufacturingError("Chỉ phiên bản quy trình nháp mới được duyệt.");
      const reason = String(req.body?.reason || "").trim();
      if (!reason) throw manufacturingError("Duyệt quy trình phải có lý do.");
      await validateRoutingVersion(client, req.params.versionId, true);
      await client.query(
        "update local_manufacturing_records set status='SUPERSEDED',payload=jsonb_set(payload,'{status}','\"SUPERSEDED\"'::jsonb),updated_at=now(),local_modified_at=now() where record_type='routing_version' and parent_id=$1 and id<>$2 and status='APPROVED'",
        [current.rows[0].parent_id, req.params.versionId],
      );
      const { rows } = await client.query(
        "update local_manufacturing_records set status='APPROVED',payload=jsonb_set(jsonb_set(payload,'{status}','\"APPROVED\"'::jsonb),'{approval_reason}',to_jsonb($2::text)),updated_at=now(),local_modified_at=now() where id=$1 returning *",
        [req.params.versionId, reason],
      );
      await client.query("commit");
      if (!rows[0])
        return res
          .status(404)
          .json({ message: "Không tìm thấy phiên bản routing." });
      res.json(manufacturingPayload(rows[0]));
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      sendError(res, error);
    } finally {
      client.release();
    }
  },
);

const catalogProductSelect = `
  select p.id, p.sku, p.name, p.description, p.category, p.specifications,
    p.price, p.cost_price, p.in_stock, p.is_active, p.rate_unit, p.price_list_id,
    p.tenant_id, p.manager_id, p.images, p.image_url, p.is_snapshot_record,
    p.created_at, p.updated_at, r.id current_rate_id, r.rate current_rate,
    r.rate_unit current_rate_unit, r.effective_from current_rate_effective_from,
    r.effective_to current_rate_effective_to
  from local_products p
  left join lateral (
    select id, rate, rate_unit, effective_from, effective_to
    from local_product_rates
    where product_id = p.id and status = 'APPROVED'
      and effective_from <= current_date
      and (effective_to is null or effective_to >= current_date)
    order by effective_from desc, created_at desc
    limit 1
  ) r on true`;

app.get("/api/catalog/products", async (req, res) => {
  try {
    const search = String(req.query.search || "").trim();
    const category = String(req.query.category || "").trim();
    const priceListId = String(req.query.priceListId || "").trim();
    const activeOnly = String(req.query.includeInactive || "") !== "true";
    const params: unknown[] = [];
    const filters: string[] = [];
    if (activeOnly) filters.push("p.is_active = true");
    if (search) {
      params.push(`%${search}%`);
      filters.push(
        `(p.sku ilike $${params.length} or p.name ilike $${params.length} or coalesce(p.description, '') ilike $${params.length})`,
      );
    }
    if (category) {
      params.push(category);
      filters.push(`p.category = $${params.length}`);
    }
    if (priceListId) {
      params.push(priceListId);
      filters.push(`p.price_list_id = $${params.length}`);
    }
    const { rows } = await pool.query(
      `${catalogProductSelect} ${filters.length ? `where ${filters.join(" and ")}` : ""} order by p.category nulls last, p.sku`,
      params,
    );
    res.json(
      rows.map((row) => ({
        ...row,
        price: asNumber(row.price),
        cost_price: asNumber(row.cost_price),
        current_rate: asNumber(row.current_rate),
      })),
    );
  } catch (error) {
    sendError(res, error);
  }
});

const localCatalogUuid = (value: unknown) => {
  const candidate = String(value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    candidate,
  )
    ? candidate
    : null;
};

app.get("/api/catalog/price-lists", async (req, res) => {
  try {
    const includeInactive = String(req.query.includeInactive || "") === "true";
    const { rows } = await pool.query(`
      select l.id, l.name, l.year, l.status, l.is_active, l.tenant_id, l.manager_id,
        l.created_at, l.updated_at,
        count(p.id) filter (where ${includeInactive ? "true" : "p.is_active = true"})::int product_count
      from local_price_lists l
      left join local_products p on p.price_list_id = l.id
      ${includeInactive ? "" : "where l.is_active = true"}
      group by l.id
      order by l.year desc nulls last, l.created_at desc nulls last, l.name`);
    res.json(rows);
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/catalog/price-lists", async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    if (!name) throw new Error("Tên bảng giá là bắt buộc.");
    const year =
      req.body?.year === null ||
      req.body?.year === undefined ||
      req.body?.year === ""
        ? null
        : Number(req.body.year);
    if (
      year !== null &&
      (!Number.isInteger(year) || year < 1900 || year > 2200)
    )
      throw new Error("Năm bảng giá không hợp lệ.");
    const status = String(req.body?.status || "active")
      .trim()
      .toLowerCase();
    if (!["active", "draft", "inactive"].includes(status))
      throw new Error("Trạng thái bảng giá không hợp lệ.");
    const managerId = localCatalogUuid(
      req.body?.manager_id ?? req.body?.managerId,
    );
    const { rows } = await pool.query(
      `
      insert into local_price_lists(id,name,year,status,is_active,tenant_id,manager_id,is_snapshot_record,local_modified_at,created_at,updated_at)
      values(gen_random_uuid(),$1,$2,$3,$4,'local-tenant',$5,false,now(),now(),now())
      returning id,name,year,status,is_active,tenant_id,manager_id,created_at,updated_at`,
      [name, year, status, status !== "inactive", managerId],
    );
    res.status(201).json({ ...rows[0], product_count: 0 });
  } catch (error) {
    sendError(res, error);
  }
});

app.patch("/api/catalog/price-lists/:id", async (req, res) => {
  try {
    const allowed = new Set(["name", "year", "status"]);
    const unsupported = Object.keys(req.body || {}).filter(
      (key) => !allowed.has(key),
    );
    if (unsupported.length)
      throw new Error(
        `Trường bảng giá không được hỗ trợ: ${unsupported.join(", ")}.`,
      );
    const assignments: string[] = [];
    const values: unknown[] = [];
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "name")) {
      const name = String(req.body.name || "").trim();
      if (!name) throw new Error("Tên bảng giá là bắt buộc.");
      values.push(name);
      assignments.push(`name=$${values.length}`);
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "year")) {
      const year =
        req.body.year === null || req.body.year === ""
          ? null
          : Number(req.body.year);
      if (
        year !== null &&
        (!Number.isInteger(year) || year < 1900 || year > 2200)
      )
        throw new Error("Năm bảng giá không hợp lệ.");
      values.push(year);
      assignments.push(`year=$${values.length}`);
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "status")) {
      const status = String(req.body.status || "")
        .trim()
        .toLowerCase();
      if (!["active", "draft", "inactive"].includes(status))
        throw new Error("Trạng thái bảng giá không hợp lệ.");
      values.push(status);
      assignments.push(`status=$${values.length}`);
      values.push(status !== "inactive");
      assignments.push(`is_active=$${values.length}`);
    }
    if (!assignments.length)
      throw new Error("Không có thông tin bảng giá cần cập nhật.");
    values.push(req.params.id);
    assignments.push("local_modified_at=now()", "updated_at=now()");
    const { rows } = await pool.query(
      `update local_price_lists set ${assignments.join(",")} where id=$${values.length} returning id,name,year,status,is_active,tenant_id,manager_id,created_at,updated_at`,
      values,
    );
    if (!rows[0])
      return res.status(404).json({ message: "Không tìm thấy bảng giá." });
    const count = await pool.query(
      "select count(*)::int product_count from local_products where price_list_id=$1 and is_active",
      [req.params.id],
    );
    res.json({ ...rows[0], product_count: count.rows[0]?.product_count || 0 });
  } catch (error) {
    sendError(res, error);
  }
});

app.delete("/api/catalog/price-lists/:id", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const list = await client.query(
      "select id,is_active from local_price_lists where id=$1 for update",
      [req.params.id],
    );
    if (!list.rows[0]) {
      await client.query("rollback");
      return res.status(404).json({ message: "Không tìm thấy bảng giá." });
    }
    const count = await client.query(
      "select count(*)::int product_count from local_products where price_list_id=$1 and is_active",
      [req.params.id],
    );
    if (Number(count.rows[0]?.product_count || 0) > 0) {
      await client.query("rollback");
      return res.status(409).json({
        message:
          "Không thể xoá bảng giá đang còn sản phẩm. Hãy xoá sản phẩm trước.",
      });
    }
    const { rows } = await client.query(
      `update local_price_lists set is_active=false,status='DELETED',local_modified_at=now(),updated_at=now() where id=$1 returning id,is_active,status`,
      [req.params.id],
    );
    await client.query("commit");
    res.json(rows[0]);
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    sendError(res, error);
  } finally {
    client.release();
  }
});

const catalogRateCanonicalRequired = (res: express.Response) => res.status(409).json({
  code: "PRODUCT_RATE_CANONICAL_REQUIRED",
  message: "Đơn giá công may được tạo nháp và duyệt tại mục Đơn giá công may.",
  canonical_path: "/production-attendance?tab=rates",
});

app.post("/api/catalog/products", async (req, res) => {
  const wageFields = ["rate", "piece_rate_code", "pieceRateCode", "piece_rate_name", "pieceRateName", "effective_from", "effectiveFrom", "effective_to", "effectiveTo", "rate_reason", "rateReason", "source_reference", "sourceReference"];
  if (wageFields.some(key => req.body?.[key] !== undefined && req.body?.[key] !== null && req.body?.[key] !== "")) return catalogRateCanonicalRequired(res);
  const client = await pool.connect();
  try {
    const sku = String(req.body.sku || "").trim();
    const name = String(req.body.name || "").trim();
    if (!sku || !name)
      throw new Error("Ma san pham va ten san pham la bat buoc.");
    const price =
      req.body.price === null ||
      req.body.price === undefined ||
      req.body.price === ""
        ? null
        : Number(req.body.price);
    const costPrice =
      req.body.cost_price === null ||
      req.body.cost_price === undefined ||
      req.body.cost_price === ""
        ? null
        : Number(req.body.cost_price);
    if (price !== null && (!Number.isFinite(price) || price < 0))
      throw new Error("Gia ban khong hop le.");
    if (costPrice !== null && (!Number.isFinite(costPrice) || costPrice < 0))
      throw new Error("Gia von khong hop le.");
    const priceListId = req.body.price_list_id
      ? String(req.body.price_list_id)
      : null;
    await client.query("BEGIN");
    if (priceListId) {
      const priceList = await client.query(
        "select id from local_price_lists where id=$1 and is_active=true",
        [priceListId],
      );
      if (!priceList.rows[0])
        throw new Error("Bảng giá không tồn tại hoặc đã ngưng sử dụng.");
    }
    const { rows } = await client.query(
      `insert into local_products(sku,name,description,category,specifications,price,cost_price,in_stock,rate_unit,is_active,price_list_id,is_snapshot_record,local_modified_at)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,true,$10,false,now()) returning id`,
      [
        sku,
        name,
        req.body.description || null,
        req.body.category || null,
        req.body.specifications || null,
        price,
        costPrice,
        req.body.in_stock !== false,
        req.body.rate_unit || "PIECE",
        priceListId,
      ],
    );
    const productId = rows[0].id as string;
    await client.query("COMMIT");
    const result = await pool.query(`${catalogProductSelect} where p.id=$1`, [
      productId,
    ]);
    res.status(201).json({
      ...result.rows[0],
      price: asNumber(result.rows[0].price),
      cost_price: asNumber(result.rows[0].cost_price),
      current_rate: asNumber(result.rows[0].current_rate),
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    sendError(res, error);
  } finally {
    client.release();
  }
});

app.patch("/api/catalog/products/:id", async (req, res) => {
  try {
    const allowed = new Set([
      "sku",
      "name",
      "description",
      "category",
      "specifications",
      "price",
      "cost_price",
      "in_stock",
      "is_active",
      "rate_unit",
      "price_list_id",
      "images",
      "image_url",
    ]);
    const unsupported = Object.keys(req.body || {}).filter(
      (key) => !allowed.has(key),
    );
    if (unsupported.length)
      throw new Error(
        `Trường sản phẩm không được hỗ trợ: ${unsupported.join(", ")}.`,
      );
    const fields: Record<string, unknown> = {
      sku:
        req.body.sku === undefined
          ? undefined
          : String(req.body.sku || "").trim(),
      name: req.body.name,
      description: req.body.description,
      category: req.body.category,
      specifications: req.body.specifications,
      price: req.body.price === "" ? null : req.body.price,
      cost_price: req.body.cost_price === "" ? null : req.body.cost_price,
      in_stock: req.body.in_stock,
      is_active: req.body.is_active,
      rate_unit: req.body.rate_unit,
      price_list_id: req.body.price_list_id,
      images: req.body.images,
      image_url: req.body.image_url,
    };
    if (fields.sku !== undefined && !fields.sku)
      throw new Error("Mã sản phẩm là bắt buộc.");
    for (const field of ["price", "cost_price"]) {
      const value = fields[field];
      if (
        value !== undefined &&
        value !== null &&
        (!Number.isFinite(Number(value)) || Number(value) < 0)
      )
        throw new Error(
          `${field === "price" ? "Giá bán" : "Giá vốn"} không hợp lệ.`,
        );
      if (value !== null && value !== undefined) fields[field] = Number(value);
    }
    if (
      fields.price_list_id !== undefined &&
      fields.price_list_id !== null &&
      fields.price_list_id !== ""
    ) {
      const priceList = await pool.query(
        "select id from local_price_lists where id=$1 and is_active=true",
        [fields.price_list_id],
      );
      if (!priceList.rows[0])
        throw new Error("Bảng giá không tồn tại hoặc đã ngưng sử dụng.");
    } else if (fields.price_list_id === "") fields.price_list_id = null;
    if (fields.images !== undefined) {
      const images =
        typeof fields.images === "string"
          ? JSON.parse(fields.images)
          : fields.images;
      if (!Array.isArray(images))
        throw new Error("Danh sách hình ảnh không hợp lệ.");
      fields.images = JSON.stringify(images);
    }
    const assignments: string[] = [];
    const values: unknown[] = [];
    for (const [field, value] of Object.entries(fields)) {
      if (value !== undefined) {
        values.push(value);
        assignments.push(
          `${field}=$${values.length}${field === "images" ? "::jsonb" : ""}`,
        );
      }
    }
    if (!assignments.length)
      throw new Error("Khong co thong tin can cap nhat.");
    values.push(req.params.id);
    assignments.push("local_modified_at=now()");
    const { rows } = await pool.query(
      `update local_products set ${assignments.join(",")}, updated_at=now() where id=$${values.length} returning id`,
      values,
    );
    if (!rows[0]) throw new Error("Khong tim thay san pham.");
    const result = await pool.query(`${catalogProductSelect} where p.id=$1`, [
      req.params.id,
    ]);
    res.json({
      ...result.rows[0],
      price: asNumber(result.rows[0].price),
      cost_price: asNumber(result.rows[0].cost_price),
      current_rate: asNumber(result.rows[0].current_rate),
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.delete(
  "/api/catalog/products/by-price-list/:priceListId",
  async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const list = await client.query(
        "select id from local_price_lists where id=$1 for update",
        [req.params.priceListId],
      );
      if (!list.rows[0]) {
        await client.query("rollback");
        return res.status(404).json({ message: "Không tìm thấy bảng giá." });
      }
      const { rows } = await client.query(
        `update local_products set is_active=false,local_modified_at=now(),updated_at=now()
      where price_list_id=$1 and is_active=true returning id`,
        [req.params.priceListId],
      );
      await client.query("commit");
      res.json({
        price_list_id: req.params.priceListId,
        archived_count: rows.length,
        ids: rows.map((row) => row.id),
      });
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      sendError(res, error);
    } finally {
      client.release();
    }
  },
);

app.delete("/api/catalog/products/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `update local_products set is_active=false,local_modified_at=now(),updated_at=now()
      where id=$1 and is_active=true returning id,is_active,price_list_id`,
      [req.params.id],
    );
    if (!rows[0])
      return res
        .status(404)
        .json({ message: "Không tìm thấy sản phẩm đang hoạt động." });
    res.json(rows[0]);
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/catalog/products/:id/rate", async (_req, res) => {
  return catalogRateCanonicalRequired(res);
});

app.post("/api/catalog/products/:id/active", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "update local_products set is_active=$2, local_modified_at=now(), updated_at=now() where id=$1 returning id,is_active",
      [req.params.id, req.body.is_active !== false],
    );
    if (!rows[0]) throw new Error("Khong tim thay san pham.");
    res.json(rows[0]);
  } catch (error) {
    sendError(res, error);
  }
});

const inventoryTenant = "local-tenant";
const inventoryActor = "local-admin";
const inventoryDocumentType = (value: unknown) =>
  String(value || "RECEIPT").toUpperCase();

async function localInventoryBalances(
  itemId?: string | null,
  warehouseId?: string | null,
) {
  const filters: string[] = [];
  const params: unknown[] = [];
  if (itemId) {
    params.push(itemId);
    filters.push(`m.inventory_item_id=$${params.length}`);
  }
  if (warehouseId) {
    params.push(warehouseId);
    filters.push(`m.warehouse_id=$${params.length}`);
  }
  const { rows } = await pool.query(
    `
    select m.inventory_item_id, m.warehouse_id,
      sum(m.quantity_delta) quantity_on_hand,
      sum(coalesce(m.value_delta,0)) inventory_value,
      max(m.transaction_at) last_movement_at
    from local_inventory_movements m
    ${filters.length ? `where ${filters.join(" and ")}` : ""}
    group by m.inventory_item_id,m.warehouse_id`,
    params,
  );
  return rows;
}

function localInventoryBalanceRow(
  row: Record<string, unknown>,
  item: Record<string, unknown>,
  warehouse: Record<string, unknown>,
) {
  const quantityOnHand = Number(row.quantity_on_hand || 0);
  const inventoryValue = Number(row.inventory_value || 0);
  return {
    id: `${item.id}-${warehouse.id}`,
    inventory_item_id: item.id,
    item_code: item.code,
    item_name: item.name,
    item_type: item.item_type,
    warehouse_id: warehouse.id,
    warehouse_name: warehouse.name,
    location_id: null,
    location_name: null,
    quantity_on_hand: quantityOnHand,
    unit: item.base_unit,
    average_unit_cost:
      quantityOnHand > 0 ? inventoryValue / quantityOnHand : null,
    inventory_value: inventoryValue,
    last_movement_at: row.last_movement_at,
  };
}

app.get("/api/inventory/items", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "select * from local_inventory_items order by code",
    );
    res.json(
      rows.map((row) => ({
        ...row,
        tenant_id: inventoryTenant,
        manager_id: null,
      })),
    );
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/inventory/items", async (req, res) => {
  try {
    const code = String(req.body.code || "")
      .trim()
      .toUpperCase();
    const name = String(req.body.name || "").trim();
    if (!code || !name) throw new Error("Mã và tên vật tư là bắt buộc.");
    const { rows } = await pool.query(
      `insert into local_inventory_items(code,name,item_type,base_unit,category)
      values($1,$2,$3,$4,$5) returning *`,
      [
        code,
        name,
        req.body.item_type || "RAW_MATERIAL",
        req.body.base_unit || "PIECE",
        req.body.category || null,
      ],
    );
    res
      .status(201)
      .json({ ...rows[0], tenant_id: inventoryTenant, manager_id: null });
  } catch (error) {
    sendError(res, error);
  }
});

app.patch("/api/inventory/items/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `update local_inventory_items set name=$2,item_type=$3,base_unit=$4,category=$5,updated_at=now()
      where id=$1 returning *`,
      [
        req.params.id,
        req.body.name,
        req.body.item_type,
        req.body.base_unit,
        req.body.category || null,
      ],
    );
    if (!rows[0]) throw new Error("Không tìm thấy vật tư.");
    res.json({ ...rows[0], tenant_id: inventoryTenant, manager_id: null });
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/inventory/items/:id/active", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "update local_inventory_items set is_active=$2,updated_at=now() where id=$1 returning id,is_active",
      [req.params.id, Boolean(req.body.is_active ?? req.body.isActive)],
    );
    if (!rows[0]) throw new Error("Không tìm thấy vật tư.");
    res.json(rows[0]);
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/inventory/warehouses", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "select id,name,address,warehouse_type from local_inventory_warehouses where is_active order by name",
    );
    res.json(rows);
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/inventory/business-transactions", async (req, res) => {
  try {
    const documentType = String(req.query.documentType || "");
    const sourceTables = [
      "business_transactions",
      "transactions",
      "sales_transactions",
      "purchase_transactions",
    ];
    const { rows } = await pool.query(
      `
      select s.source_key id,
        coalesce(nullif(s.payload->>'transaction_number',''),nullif(s.payload->>'document_number',''),nullif(s.payload->>'code',''),s.source_key) transaction_number,
        coalesce(nullif(s.payload->>'transaction_date',''),nullif(s.payload->>'occurred_at',''),nullif(s.payload->>'created_at','')) transaction_date,
        coalesce(nullif(s.payload->>'description',''),nullif(s.payload->>'name',''),'Giao dịch nghiệp vụ') description,
        coalesce(nullif(s.payload->>'counterparty_name',''),nullif(s.payload->>'customer_name',''),nullif(s.payload->>'supplier_name','')) counterparty_name,
        case when coalesce(s.payload->>'total_amount',s.payload->>'amount') ~ '^-?[0-9]+(\\.[0-9]+)?$' then coalesce(s.payload->>'total_amount',s.payload->>'amount')::numeric else null end total_amount
      from local_source_snapshots s
      where s.source='SUPABASE' and not s.is_deleted and s.source_table=any($1::text[])
        and ($2='' or coalesce(s.payload->>'document_type',s.payload->>'transaction_type',s.payload->>'type','') ilike '%' || $2 || '%')
      order by transaction_date desc nulls last limit 500`,
      [sourceTables, documentType],
    );
    res.json(
      rows.map((row) => ({ ...row, total_amount: asNumber(row.total_amount) })),
    );
  } catch (error) {
    sendError(res, error);
  }
});
app.get("/api/inventory/production-orders", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `
      select s.source_key id,
        coalesce(nullif(s.payload->>'production_order_number',''),nullif(s.payload->>'order_number',''),s.source_key) production_order_number,
        coalesce(nullif(s.payload->>'product_id',''),nullif(s.payload->>'productId','')) product_id,
        coalesce(nullif(s.payload->>'product_name',''),nullif(s.payload->>'name','')) product_name,
        coalesce(nullif(s.payload->>'status',''),'IN_PROGRESS') status,
        case when coalesce(s.payload->>'quantity_planned',s.payload->>'planned_quantity',s.payload->>'quantity') ~ '^-?[0-9]+(\\.[0-9]+)?$' then coalesce(s.payload->>'quantity_planned',s.payload->>'planned_quantity',s.payload->>'quantity')::numeric else 0 end quantity_planned
      from local_source_snapshots s
      where s.source='SUPABASE' and not s.is_deleted and s.source_table='production_orders'
      order by s.last_seen_at desc limit 500`,
      [],
    );
    res.json(
      rows.map((row) => ({
        ...row,
        quantity_planned: asNumber(row.quantity_planned) || 0,
      })),
    );
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/inventory/summary", async (_req, res) => {
  try {
    const balances = await localInventoryBalances();
    const { rows: itemRows } = await pool.query(
      "select count(*)::int active_item_count from local_inventory_items where is_active",
    );
    const { rows: draftRows } = await pool.query(
      "select count(*)::int draft_document_count from local_inventory_documents where status='DRAFT'",
    );
    const { rows: warehouseRows } = await pool.query(
      "select count(*)::int warehouse_count from local_inventory_warehouses where is_active",
    );
    res.json([
      {
        active_item_count: itemRows[0].active_item_count,
        stocked_balance_count: balances.filter(
          (row) => Number(row.quantity_on_hand) !== 0,
        ).length,
        draft_document_count: draftRows[0].draft_document_count,
        warehouse_count: warehouseRows[0].warehouse_count,
        total_inventory_value: balances.reduce(
          (sum, row) => sum + Number(row.inventory_value || 0),
          0,
        ),
      },
    ]);
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/inventory/balances", async (_req, res) => {
  try {
    const [balances, items, warehouses] = await Promise.all([
      localInventoryBalances(),
      pool.query("select * from local_inventory_items"),
      pool.query("select * from local_inventory_warehouses"),
    ]);
    const itemMap = new Map(items.rows.map((row) => [row.id, row]));
    const warehouseMap = new Map(warehouses.rows.map((row) => [row.id, row]));
    res.json(
      balances
        .map((row) =>
          localInventoryBalanceRow(
            row,
            itemMap.get(row.inventory_item_id),
            warehouseMap.get(row.warehouse_id),
          ),
        )
        .filter(Boolean),
    );
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/inventory/documents", async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit || 500), 1), 1000);
    const { rows } = await pool.query(
      `select d.*,w.name warehouse_name,tw.name to_warehouse_name,
      null::text production_order_number from local_inventory_documents d
      left join local_inventory_warehouses w on w.id=d.warehouse_id
      left join local_inventory_warehouses tw on tw.id=d.to_warehouse_id
      order by d.transaction_at desc,d.created_at desc limit $1`,
      [limit],
    );
    res.json(rows);
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/inventory/movements", async (req, res) => {
  try {
    const values: unknown[] = [];
    const filter = req.query.itemId
      ? `where m.inventory_item_id=$${values.push(String(req.query.itemId))}`
      : "";
    const limit = Math.min(Math.max(Number(req.query.limit || 1000), 1), 2000);
    const { rows } = await pool.query(
      `with ledger as (
      select m.*, sum(m.quantity_delta) over(partition by m.inventory_item_id,m.warehouse_id order by m.transaction_at,m.movement_sequence rows unbounded preceding) running_quantity,
        sum(coalesce(m.value_delta,0)) over(partition by m.inventory_item_id,m.warehouse_id order by m.transaction_at,m.movement_sequence rows unbounded preceding) running_inventory_value
      from local_inventory_movements m ${filter}
    ) select l.id,l.movement_sequence,l.document_id,d.document_number,l.inventory_item_id,i.code item_code,i.name item_name,
      l.warehouse_id,w.name warehouse_name,l.movement_kind,l.quantity_delta,l.unit,l.unit_cost,l.value_delta,l.running_quantity,
      case when l.running_quantity > 0 then l.running_inventory_value/l.running_quantity else null end running_average_cost,
      l.running_inventory_value,l.transaction_at,l.created_by,l.source_movement_id
      from ledger l join local_inventory_documents d on d.id=l.document_id join local_inventory_items i on i.id=l.inventory_item_id
      join local_inventory_warehouses w on w.id=l.warehouse_id order by l.transaction_at desc,l.movement_sequence desc limit $${values.push(limit)}`,
      values,
    );
    res.json(
      rows.map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([key, value]) => [
            key,
            [
              "quantity_delta",
              "unit_cost",
              "value_delta",
              "running_quantity",
              "running_average_cost",
              "running_inventory_value",
            ].includes(key)
              ? asNumber(value)
              : value,
          ]),
        ),
      ),
    );
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/inventory/return-sources", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `
      with outbound as (
        select m.id,m.document_id,d.document_number,m.inventory_item_id,m.warehouse_id,m.movement_kind,
          abs(m.quantity_delta)::numeric original_quantity,m.unit,m.transaction_at,d.production_order_id,
          m.cutting_estimate_line_id,ce.id cutting_estimate_id,ce.production_batch_id,l.order_item_id,
          i.code inventory_item_code,i.name inventory_item_name,w.name warehouse_name
        from local_inventory_movements m join local_inventory_documents d on d.id=m.document_id
        left join local_cutting_estimate_lines l on l.id=m.cutting_estimate_line_id
        left join local_cutting_estimates ce on ce.id=l.estimate_id
        join local_inventory_items i on i.id=m.inventory_item_id
        join local_inventory_warehouses w on w.id=m.warehouse_id
        where d.status='CONFIRMED' and m.quantity_delta < 0 and m.movement_kind in ('ISSUE','TRANSFER_OUT','ADJUSTMENT_OUT')
          and ($1::text='' or d.production_order_id::text=$1)
          and ($2::text='' or ce.production_batch_id::text=$2)
      ), returned as (
        select source_movement_id,sum(abs(quantity_delta))::numeric returned_quantity
        from local_inventory_movements where source_movement_id is not null and quantity_delta > 0
        group by source_movement_id
      )
      select o.id,o.document_number,o.inventory_item_id,o.warehouse_id,null::uuid location_id,o.movement_kind,
        o.original_quantity,coalesce(r.returned_quantity,0)::numeric returned_quantity,
        greatest(o.original_quantity-coalesce(r.returned_quantity,0),0)::numeric remaining_quantity,o.unit,o.transaction_at,
        o.production_order_id,o.cutting_estimate_id,o.cutting_estimate_line_id,o.production_batch_id,o.order_item_id,
        o.inventory_item_code,o.inventory_item_name,o.warehouse_name
      from outbound o left join returned r on r.source_movement_id=o.id
      where o.original_quantity-coalesce(r.returned_quantity,0) > 0
      order by o.transaction_at desc`,
      [String(req.query.productionOrderId || ''),String(req.query.batchId || '')],
    );
    res.json(
      rows.map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([key, value]) => [
            key,
            [
              "original_quantity",
              "returned_quantity",
              "remaining_quantity",
            ].includes(key)
              ? asNumber(value)
              : value,
          ]),
        ),
      ),
    );
  } catch (error) {
    sendError(res, error);
  }
});

const localProductionOrderSelect = `id,production_order_number,production_batch_number,qr_token,product_id,quantity_planned,quantity_good,quantity_scrap,quantity_rework,status,planned_start_date,planned_end_date,actual_start_at,actual_end_at,source_type,source_id,order_id,cost_center_id,bom_version_id,routing_version_id,standard_minutes_total,material_issue_tolerance_percent,cutting_params_snapshot,created_by,released_by,completed_by,cancelled_by,created_at,updated_at,released_at,completed_at,cancelled_at,cancel_reason,attendance_assignment_enforced,production_order_group_id,dispatch_priority,dispatch_reference,dispatch_notes`;
const hasProductionSaleLink = (value: Record<string, unknown>) =>
  [
    "order_id",
    "orderId",
    "source_id",
    "sourceId",
    "sales_request_id",
    "salesRequestId",
    "source_order_item_key",
    "sourceOrderItemKey",
    "sales_request_line_id",
    "salesRequestLineId",
    "order_item_id",
    "orderItemId",
  ].some((key) => {
    const candidate = value[key];
    return candidate !== undefined && candidate !== null && String(candidate).trim() !== "";
  });
const localProductionOrderRowLegacy = (row: Record<string, unknown>) => ({
  ...row,
  tenant_id: "local-tenant",
  quantity_planned: asNumber(row.quantity_planned) || 0,
  quantity_good: asNumber(row.quantity_good) || 0,
  quantity_scrap: asNumber(row.quantity_scrap) || 0,
  quantity_rework: asNumber(row.quantity_rework) || 0,
  standard_minutes_total: asNumber(row.standard_minutes_total) || 0,
  material_issue_tolerance_percent:
    asNumber(row.material_issue_tolerance_percent) || 0,
  cutting_params_snapshot: row.cutting_params_snapshot || {},
});

app.get("/api/production-orders", async (req, res) => {
  try {
    const values: unknown[] = [];
    const clauses: string[] = [];
    for (const [key, column] of [
      ["status", "status"],
      ["productId", "product_id"],
      ["orderId", "order_id"],
    ] as const) {
      if (req.query[key]) {
        values.push(String(req.query[key]));
        clauses.push(`${column}=$${values.length}`);
      }
    }
    values.push(
      Math.min(Math.max(Number(req.query.limit || 200), 1), 5000),
      Math.max(Number(req.query.offset || 0), 0),
    );
    const { rows } = await pool.query(
      `select ${localProductionOrderSelect} from local_production_orders ${clauses.length ? `where ${clauses.join(" and ")}` : ""} order by created_at desc,id limit $${values.length - 1} offset $${values.length}`,
      values,
    );
    res.json(rows.map(localProductionOrderRowLegacy));
  } catch (error) {
    sendError(res, error);
  }
});
app.get("/api/production-orders/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `select ${localProductionOrderSelect} from local_production_orders where id=$1`,
      [req.params.id],
    );
    if (!rows[0])
      return res.status(404).json({ message: "Không tìm thấy lệnh sản xuất." });
    res.json(localProductionOrderRowLegacy(rows[0]));
  } catch (error) {
    sendError(res, error);
  }
});
app.post("/api/production-orders", async (req, res) => {
  const client = await pool.connect();
  try {
    const productId = String(req.body.product_id || "");
    const quantity = String(req.body.quantity ?? req.body.quantity_planned ?? "");
    const source = String(req.body.source_type || "MANUAL").toUpperCase();
    if (source === "FROM_ORDER") throw Object.assign(new Error("Lệnh từ đơn bán phải tạo tại hàng đợi Bàn giao Sale → Sản xuất."), { status: 409 });
    if (!['MANUAL','FROM_STOCK_PLAN'].includes(source)) throw new Error("Nguồn lệnh không hợp lệ.");
    if (hasProductionSaleLink(req.body)) throw Object.assign(new Error("Lệnh thủ công/kế hoạch kho không được gắn dữ liệu đơn Sale; hãy dùng hàng đợi Bàn giao Sale → Sản xuất."), { status: 409 });
    if (!productId || !/^\d+(\.\d{1,4})?$/.test(quantity) || Number(quantity) <= 0)
      throw new Error("Sản phẩm và số lượng kế hoạch là bắt buộc.");
    await client.query('begin');
    const product = await client.query(
      "select id,sku,name from local_products where id=$1 and is_active",
      [productId],
    );
    if (!product.rows[0])
      throw new Error("Không tìm thấy sản phẩm đang hoạt động.");
    const number = `SX-LOCAL-${Date.now()}`;
    const { rows } = await client.query(
      `insert into local_production_orders(production_order_number,production_batch_number,product_id,quantity_planned,source_type,order_id,planned_start_date,planned_end_date,cost_center_id,created_by,workflow_generation)
      values($1,$1,$2,$3,$4,null,$5,$6,$7,$8,'WORKFLOW_V3') returning ${localProductionOrderSelect}`,
      [
        number,
        productId,
        quantity,
        source,
        req.body.planned_start_date || null,
        req.body.planned_end_date || null,
        req.body.cost_center_id || null,
        currentLocalActor(),
      ],
    );
    const images=await snapshotProductionImages(client,productId,req.body.reference_images);
    const item = (await client.query(`insert into local_production_order_items(production_order_id,product_id,product_sku,product_name,fabric_variant_id,color,size,dimensions,planned_quantity,notes,reference_images)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb) returning *`, [rows[0].id,productId,product.rows[0].sku,product.rows[0].name,req.body.fabric_variant_id||null,req.body.color||null,req.body.size||null,req.body.dimensions||null,quantity,req.body.notes||null,JSON.stringify(images)])).rows[0];
    const batch = (await client.query("insert into local_production_batches(production_order_id,batch_number,planned_quantity,status,created_by) values($1,$2,$3,'PLANNED',$4) returning *", [rows[0].id,number,quantity,currentLocalActor()])).rows[0];
    await client.query('commit');
    res.status(201).json({ ...localProductionOrderRowLegacy(rows[0]), order_item_id:item.id, production_batch_id:batch.id });
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    sendError(res, error);
  } finally {
    client.release();
  }
});
app.post("/api/production-orders/groups", async (req, res) => {
  const client = await pool.connect();
  try {
    const key = String(req.body.idempotency_key || randomUUID());
    if (key.length > 200) throw new Error("Khóa chống gửi trùng không hợp lệ.");
    const fingerprint = payloadFingerprint({ action: "CREATE_PRODUCTION_GROUP", body: req.body });
    await client.query("begin");
    await lockPayrollSourceShared(client);
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`production-dispatch:${key}`]);
    const replay = (await client.query("select * from local_dispatch_requests where idempotency_key=$1", [key])).rows[0];
    if (replay) {
      if (replay.actor_id !== currentLocalActor() || replay.fingerprint !== fingerprint) throw idempotencyConflict(key);
      await client.query("commit");
      return res.json({ ...replay.result, reused: true });
    }
    const orderId = req.body.order_id ? String(req.body.order_id) : null;
    const lines = Array.isArray(req.body.lines) ? req.body.lines : [];
    if (!lines.length) throw new Error("Cần ít nhất một dòng sản phẩm.");
    const source = String(req.body.source_type || (orderId ? "FROM_ORDER" : "MANUAL")).toUpperCase();
    if (!["FROM_ORDER", "MANUAL", "FROM_STOCK_PLAN"].includes(source) || (source === "FROM_ORDER" && !orderId)) throw new Error("Nguồn lệnh không hợp lệ.");
    if (source === "FROM_ORDER") throw Object.assign(new Error("Lệnh từ đơn bán phải tạo tại hàng đợi Bàn giao Sale → Sản xuất."), { status: 409 });
    if (hasProductionSaleLink(req.body) || lines.some((line: Record<string, unknown>) => hasProductionSaleLink(line))) throw Object.assign(new Error("Lệnh thủ công/kế hoạch kho không được gắn dữ liệu đơn Sale; hãy dùng hàng đợi Bàn giao Sale → Sản xuất."), { status: 409 });
    const priority = String(req.body.dispatch_priority || req.body.priority || "NORMAL").toUpperCase();
    if (!["LOW", "NORMAL", "HIGH", "URGENT"].includes(priority)) throw new Error("Độ ưu tiên không hợp lệ.");
    const reference = req.body.dispatch_reference || req.body.reference || null;
    const notes = req.body.dispatch_notes || req.body.notes || null;
    const start = req.body.planned_start_date || null;
    const end = req.body.planned_end_date || null;
    if (start && end && String(end) < String(start)) throw new Error("Ngày kết thúc phải từ ngày bắt đầu trở đi.");
    const groupId = randomUUID();
    const created: Record<string, unknown>[] = [];
    for (const [index, line] of (
      lines as Array<Record<string, unknown>>
    ).entries()) {
      const productId = String(line.product_id || "");
      const quantity = String(line.quantity ?? "");
      if (!productId || !/^\d+(\.\d{1,2})?$/.test(quantity) || !Number.isFinite(Number(quantity)) || Number(quantity) <= 0)
        throw new Error(`Dòng sản phẩm ${index + 1} không hợp lệ.`);
      const product = await client.query(
        "select id,sku,name from local_products where id=$1 and is_active",
        [productId],
      );
      if (!product.rows[0])
        throw new Error("Không tìm thấy sản phẩm trong lệnh sản xuất.");
      const number = `SX-LOCAL-${Date.now()}-${groupId.slice(0,8)}-${index + 1}`;
      const orderResult = await client.query(
        `insert into local_production_orders(production_order_number,production_batch_number,product_id,quantity_planned,source_type,order_id,planned_start_date,planned_end_date,production_order_group_id,idempotency_key,created_by,dispatch_priority,dispatch_reference,dispatch_notes)
        values($1,$1,$2,$3,$9,$4,$5,$6,$7,$8,$10,$11,$12,$13) returning id,production_order_number,production_order_group_id,product_id,quantity_planned,status,created_by,dispatch_priority,dispatch_reference,dispatch_notes`,
        [
          number,
          productId,
          quantity,
          orderId,
          req.body.planned_start_date || null,
          req.body.planned_end_date || null,
          groupId,
          index === 0 ? key : null,
          source, currentLocalActor(), priority, reference, notes,
        ],
      );
      const createdOrder = orderResult.rows[0];
      const images=await snapshotProductionImages(client,productId,line.reference_images);
      const sewing=await snapshotProductionSewingSelection(client,{product_id:productId,fabric_variant_id:line.fabric_variant_id||null,color:line.color||null,size:line.size||null,dimensions:line.dimensions||null},line.sewing_code_selection,start||businessDateKey(),currentLocalActor());
      const orderItemResult = await client.query(
        `insert into local_production_order_items(production_order_id,product_id,product_sku,product_name,fabric_variant_id,source_order_item_key,color,size,dimensions,planned_quantity,notes,reference_images,sewing_code_selection) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb) returning id`,
        [
          createdOrder.id,
          productId,
          product.rows[0].sku,
          product.rows[0].name,
          line.fabric_variant_id || null,
          line.source_order_item_key || null,
          line.color || null,
          line.size || null,
          line.dimensions || null,
          quantity,
          line.notes || notes,
          JSON.stringify(images),
          sewing===null?null:JSON.stringify(sewing),
        ],
      );
      await appendPlannedExtras(client,createdOrder.id,orderItemResult.rows[0].id,line.planned_extras,currentLocalActor(),currentLocalRole());
      const batchResult = await client.query(
        `insert into local_production_batches(production_order_id,batch_number,planned_quantity,status,created_by) values($1,$2,$3,'PLANNED',$4) returning id`,
        [createdOrder.id, number, quantity, currentLocalActor()],
      );
      const cuttingEstimate = await createInitialDraftCuttingPlan(client,createdOrder.id,{id:orderItemResult.rows[0].id,fabric_variant_id:line.fabric_variant_id || null},{id:batchResult.rows[0].id,planned_quantity:quantity},line.cutting_plan,currentLocalActor());
      created.push({
        ...createdOrder,
        quantity_planned: asNumber(createdOrder.quantity_planned),
        order_item_id: orderItemResult.rows[0]?.id,
        fabric_variant_id: line.fabric_variant_id || null,
        color: line.color || null,
        size: line.size || null,
        dimensions: line.dimensions || null,
        notes: line.notes || notes,
        source_order_item_key: line.source_order_item_key || null,
        production_batch_id: batchResult.rows[0].id,
        cutting_estimate_id: cuttingEstimate?.id || null,
        sewing_code_selection:sewing,
      });
      await client.query("insert into local_dispatch_audit_events(production_order_id,action,actor_id,data) values($1,'CREATE_ORDER',$2,$3::jsonb)", [createdOrder.id, currentLocalActor(), JSON.stringify(created[created.length-1])]);
    }
    const result = { group_id: groupId, idempotency_key: key, reused: false, order_count: created.length, orders: created };
    await client.query("insert into local_dispatch_requests(idempotency_key,actor_id,fingerprint,result) values($1,$2,$3,$4::jsonb)", [key,currentLocalActor(),fingerprint,JSON.stringify(result)]);
    await client.query("commit");
    res.status(201).json(result);
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    sendError(res, error);
  } finally {
    client.release();
  }
});
app.post("/api/production-orders/:id/release", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await lockPayrollSourceShared(client);
    await client.query("select pg_advisory_xact_lock(hashtextextended('production-source-sync',0))");
    const sourcePointer = (await client.query(
      "select sales_request_id from local_production_orders where id=$1",
      [req.params.id],
    )).rows[0];
    const sourceRequest = sourcePointer?.sales_request_id
      ? (await client.query(
          "select status from local_production_sales_requests where id=$1 for share",
          [sourcePointer.sales_request_id],
        )).rows[0]
      : null;
    const current = await client.query(
      "select * from local_production_orders where id=$1 for update",
      [req.params.id],
    );
    if (!current.rows[0]) throw new Error("Không tìm thấy lệnh sản xuất.");
    if (String(current.rows[0].sales_request_id || "") !== String(sourcePointer?.sales_request_id || ""))
      throw Object.assign(new Error("Liên kết yêu cầu Sale vừa thay đổi; vui lòng thử lại."), { status: 409 });
    if (sourceRequest?.status === "ADJUSTMENT_REQUIRED")
      throw Object.assign(new Error("Yêu cầu Sale vẫn đang chờ xử lý điều chỉnh; quản lý phải chấp nhận trước khi phát hành hoặc tiếp tục lệnh."), { status: 409 });
    if (["RELEASED", "IN_PROGRESS"].includes(String(current.rows[0].status))) {
      await client.query("commit");
      return res.json({ ...localProductionOrderRowLegacy(current.rows[0]), reused: true });
    }
    if (current.rows[0].status === "ON_HOLD") {
      if(['employee','team_leader'].includes(currentLocalRole()))throw Object.assign(new Error('Chỉ quản lý được tiếp tục lệnh sản xuất.'),{status:403});
      await requireLocalCapability(client,['production_manage']);
      const resumeReason=String(req.body.reason??'').trim();
      if(!resumeReason)throw Object.assign(new Error('Tiếp tục lệnh phải có lý do.'),{status:409});
      const resumed = await client.query("update local_production_orders set status='IN_PROGRESS',updated_at=now(),local_modified_at=now() where id=$1 returning *", [req.params.id]);
      await client.query("insert into local_dispatch_audit_events(production_order_id,action,actor_id,reason,data) values($1,'RESUME_ORDER',$2,$3,$4::jsonb)", [req.params.id,currentLocalActor(),resumeReason,JSON.stringify({ from: 'ON_HOLD', to: 'IN_PROGRESS' })]);
      await client.query("commit");
      return res.json({ ...localProductionOrderRowLegacy(resumed.rows[0]), reused: false });
    }
    if (
      !["DRAFT", "PLANNED", "ON_HOLD"].includes(String(current.rows[0].status))
    )
      throw new Error("Chỉ có thể phát hành lệnh ở trạng thái nháp/kế hoạch.");
    const productId = String(current.rows[0].product_id);
    const quantity = Number(current.rows[0].quantity_planned || 0);
    const workflowV2 = ['WORKFLOW_V2','WORKFLOW_V3'].includes(current.rows[0].workflow_generation);
    const bomHeader = await operationalManufacturingParent(client, "bom_header", productId, "BOM");
    const bomVersion = bomHeader ? await client.query(
      `select v.* from local_manufacturing_records v
       where v.record_type='bom_version' and v.status in ('APPROVED','SUPERSEDED') and v.parent_id=$1
       and coalesce(nullif(v.payload->>'effective_from','')::date,'-infinity'::date)<=coalesce($2::date,current_date)
       and coalesce(nullif(v.payload->>'effective_to','')::date,'infinity'::date)>=coalesce($2::date,current_date)
       order by coalesce(nullif(v.payload->>'effective_from','')::date,'-infinity'::date) desc,v.version_number desc limit 1`,
      [bomHeader.id, current.rows[0].planned_start_date],
    ) : { rows: [] as Record<string, unknown>[] };
    if (workflowV2 && !bomVersion.rows[0]) throw Object.assign(new Error("Sản phẩm chưa có BOM local đã duyệt và còn hiệu lực."), { status: 409 });
    if (bomVersion.rows[0]) {
      await client.query("update local_production_orders set bom_version_id=$2 where id=$1", [req.params.id,bomVersion.rows[0].id]);
      current.rows[0].bom_version_id = bomVersion.rows[0].id;
    }
    const routingHeader = await operationalManufacturingParent(client, "routing_header", productId, "Quy trình sản xuất");
    const routingVersion = routingHeader ? await client.query(
      `select * from local_manufacturing_records
       where record_type='routing_version' and status in ('APPROVED','SUPERSEDED') and parent_id=$1
         and coalesce(nullif(payload->>'effective_from','')::date,'-infinity'::date)<=coalesce($2::date,current_date)
         and coalesce(nullif(payload->>'effective_to','')::date,'infinity'::date)>=coalesce($2::date,current_date)
       order by coalesce(nullif(payload->>'effective_from','')::date,'-infinity'::date) desc,version_number desc limit 1`,
      [routingHeader.id, current.rows[0].planned_start_date],
    ) : { rows: [] as Record<string, unknown>[] };
    let materialCount = 0;
    let operationCount = 0;
    if (bomVersion.rows[0]) {
      const versionPayload = manufacturingPayload(bomVersion.rows[0]) as Record<
        string,
        unknown
      >;
      await client.query(
        "delete from local_production_order_material_requirements where production_order_id=$1",
        [req.params.id],
      );
      const lines = await client.query(
        "select * from local_manufacturing_records where record_type='bom_line' and parent_id=$1 order by coalesce((payload->>'sequence')::int,0)",
        [String(bomVersion.rows[0].id)],
      );
      for (const row of lines.rows) {
        const line = manufacturingPayload(row) as Record<string, unknown>;
        if (!line.inventory_item_id) continue;
        const inventory = (await client.query("select base_unit from local_inventory_items where id=$1 and is_active", [line.inventory_item_id])).rows[0];
        if (!inventory) throw Object.assign(new Error("BOM chứa vật tư không tồn tại hoặc đã ngừng dùng."), { status: 409 });
        if (String(line.quantity_method || "").toUpperCase() === "CUTTING_ENGINE" && String(inventory.base_unit || "").toUpperCase() !== "METER") throw Object.assign(new Error("Vật tư dùng sơ đồ cắt phải có đơn vị cơ sở METER."), { status: 409 });
        const calculated = await calculateBomMaterialLine(client, line, quantity, current.rows[0].planned_start_date || businessDateKey());
        if (String(calculated.snapshot.product_id || productId) !== productId) throw Object.assign(new Error("Cấu hình cắt trong BOM không thuộc sản phẩm của lệnh."), { status: 409 });
        await client.query(
          "insert into local_production_order_material_requirements(production_order_id,inventory_item_id,bom_line_id,bom_version_id,requirement_method,standard_quantity,planned_quantity,waste_quantity_standard,unit,cutting_profile_version_id,calculation_details) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)",
          [
            req.params.id,
            line.inventory_item_id,
            row.id,
            bomVersion.rows[0].id,
            calculated.method,
            calculated.standardQuantity,
            calculated.plannedQuantity,
            calculated.wasteQuantity,
            line.unit || inventory.base_unit,
            calculated.cuttingProfileVersionId,
            JSON.stringify({ ...calculated.snapshot, source: "RELEASED_LOCAL_STANDARD", bom_version_id: bomVersion.rows[0].id, bom_version_number: versionPayload.version_number || null, bom_line_id: row.id }),
          ],
        );
      }
      materialCount = lines.rows.length;
    }
    if (routingVersion.rows[0]) {
      const versionPayload = manufacturingPayload(
        routingVersion.rows[0],
      ) as Record<string, unknown>;
      await client.query(
        "delete from local_production_order_operations where production_order_id=$1",
        [req.params.id],
      );
      const operations = await client.query(
        "select * from local_manufacturing_records where record_type='routing_operation' and parent_id=$1 order by coalesce((payload->>'sequence')::int,0)",
        [String(routingVersion.rows[0].id)],
      );
      for (const row of operations.rows) {
        const operation = manufacturingPayload(row) as Record<string, unknown>;
        const standardRun = Number(operation.standard_minutes_per_unit || 0);
        const setup = Number(operation.setup_minutes || 0);
        await client.query(
          "insert into local_production_order_operations(production_order_id,sequence,operation_code,operation_name,cost_center_id,standard_setup_minutes,standard_run_minutes_per_unit,standard_total_minutes,is_optional) values($1,$2,$3,$4,$5,$6,$7,$8,$9)",
          [
            req.params.id,
            Number(operation.sequence || operations.rows.indexOf(row) + 1),
            operation.operation_code ||
              `OP-${operations.rows.indexOf(row) + 1}`,
            operation.operation_name || "Công đoạn",
            operation.cost_center_id || null,
            setup,
            standardRun,
            setup + standardRun * quantity,
            Boolean(operation.is_optional),
          ],
        );
      }
      operationCount = operations.rows.length;
      await client.query(
        "update local_production_orders set routing_version_id=$2,bom_version_id=coalesce(bom_version_id,$3),standard_minutes_total=$4 where id=$1",
        [
          req.params.id,
          routingVersion.rows[0].id,
          bomVersion.rows[0]?.id || null,
          operations.rows.reduce(
            (sum: number, row: Record<string, unknown>) =>
              sum +
              Number(
                (manufacturingPayload(row) as Record<string, unknown>)
                  .standard_minutes_per_unit || 0,
              ) *
                quantity +
              Number(
                (manufacturingPayload(row) as Record<string, unknown>)
                  .setup_minutes || 0,
              ),
            0,
          ),
        ],
      );
    } else if (bomVersion.rows[0]) {
      await client.query(
        "update local_production_orders set bom_version_id=$2 where id=$1",
        [req.params.id, bomVersion.rows[0].id],
      );
    }
    const { rows } = await client.query(
      `update local_production_orders set status='RELEASED',released_at=coalesce(released_at,now()),released_by=$2,actual_start_at=coalesce(actual_start_at,now()),updated_at=now(),local_modified_at=now() where id=$1 returning ${localProductionOrderSelect}`,
      [req.params.id, currentLocalActor()],
    );
    await client.query(
      `insert into local_production_batches(production_order_id,batch_number,planned_quantity,status,created_by) select $1,$2,$3,'PLANNED',$4 where not exists(select 1 from local_production_batches where production_order_id=$1) on conflict(production_order_id,batch_number) do nothing`,
      [
        req.params.id,
        current.rows[0].production_batch_number ||
          current.rows[0].production_order_number,
        quantity,
        currentLocalActor(),
      ],
    );
    await client.query("insert into local_dispatch_audit_events(production_order_id,action,actor_id,data) values($1,'RELEASE_ORDER',$2,$3::jsonb)", [req.params.id,currentLocalActor(),JSON.stringify({ material_count: materialCount, operation_count: operationCount })]);
    await client.query("commit");
    res.json({
      ...localProductionOrderRowLegacy(rows[0]),
      material_count: materialCount,
      operation_count: operationCount,
      reused: false,
    });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    sendError(res, error);
  } finally {
    client.release();
  }
});
app.post("/api/production-orders/:id/complete", async (req, res) => {
  const client = await pool.connect();
  try {
    const good = String(req.body.quantity_good ?? req.body.quantityGood ?? 0);
    const scrap = String(req.body.quantity_scrap ?? req.body.quantityScrap ?? 0);
    if (!/^\d+(\.\d{1,4})?$/.test(good) || !/^\d+(\.\d{1,4})?$/.test(scrap))
      throw new Error("Số lượng hoàn thành không hợp lệ.");
    if (Number(good) <= 0 && Number(scrap) <= 0)
      throw new Error("Cần ghi nhận ít nhất một sản phẩm đạt hoặc phế phẩm khi hoàn thành.");
    await client.query("begin");
    await lockPayrollSourceShared(client);
    const current = await client.query(
      "select * from local_production_orders where id=$1 for update",
      [req.params.id],
    );
    if (!current.rows[0]) throw new Error("Không tìm thấy lệnh sản xuất.");
    if(current.rows[0].workflow_generation==='WORKFLOW_V3')throw Object.assign(new Error('Lệnh mới cần kiểm đếm, nhập kho và chốt tại màn điều hành sản xuất.'),{status:409});
    const idempotencyKey = String(
      req.body.idempotency_key || `complete-${req.params.id}-${good}-${scrap}`,
    );
    const existing = await client.query(
      "select * from local_production_outputs where idempotency_key=$1",
      [idempotencyKey],
    );
    if (existing.rows[0]) {
      if (existing.rows[0].production_order_id !== req.params.id || (await client.query("select $1::numeric<>$2::numeric or $3::numeric<>$4::numeric conflict", [existing.rows[0].quantity_good,good,existing.rows[0].quantity_scrap,scrap])).rows[0].conflict) throw idempotencyConflict(idempotencyKey);
      await client.query("commit");
      return res.json({
        id: req.params.id,
        status: "COMPLETED",
        output: existing.rows[0],
        reused: true,
      });
    }
    if (
      !["RELEASED", "IN_PROGRESS", "ON_HOLD"].includes(current.rows[0].status)
    )
      throw new Error("Lệnh sản xuất chưa ở trạng thái có thể hoàn thành.");
    await assertProductionDispatchSettled(client, String(req.params.id));
    if ((await client.query("select $1::numeric+$2::numeric>$3::numeric exceeds", [good,scrap,current.rows[0].quantity_planned])).rows[0].exceeds)
      throw new Error("Số lượng hoàn thành vượt số lượng kế hoạch.");
    if (current.rows[0].workflow_generation === "WORKFLOW_V2") {
      const draftMaterial = await client.query("select 1 from local_inventory_documents where production_order_id=$1 and status='DRAFT' limit 1", [req.params.id]);
      if (draftMaterial.rows[0]) throw Object.assign(new Error("Còn phiếu vật tư nháp; hãy xác nhận hoặc hủy trước khi hoàn thành."), { status: 409 });
      if ((await client.query("select $1::numeric+$2::numeric<>$3::numeric mismatch", [good,scrap,current.rows[0].quantity_planned])).rows[0].mismatch)
        throw Object.assign(new Error("Lệnh mới chỉ được hoàn thành khi đã đối soát đủ kế hoạch; giảm kế hoạch phải qua quy trình điều chỉnh được duyệt."), { status: 409 });
      const sewing = (await client.query("select coalesce(sum(quantity_good),0) quantity from local_production_stage_events where production_order_id=$1 and stage='SEWING' and status in ('APPROVED','LOCKED')", [req.params.id])).rows[0].quantity;
      if ((await client.query("select $1::numeric<>$2::numeric mismatch", [sewing,good])).rows[0].mismatch)
        throw Object.assign(new Error("Sản lượng may đạt đã duyệt phải khớp số thành phẩm tốt trước khi hoàn thành."), { status: 409 });
      const outstandingRepair = await client.query(`select 1 from local_production_stage_events e where e.production_order_id=$1 and e.status in ('APPROVED','LOCKED')
        and (e.quantity_rework>coalesce((select sum(r.quantity_good) from local_production_stage_events r where r.source_stage_event_id=e.id and r.repair_kind='REWORK' and r.status in ('APPROVED','LOCKED')),0)
          or e.quantity_remake>coalesce((select sum(r.quantity_good) from local_production_stage_events r where r.source_stage_event_id=e.id and r.repair_kind='REMAKE' and r.status in ('APPROVED','LOCKED')),0)) limit 1`, [req.params.id]);
      if (outstandingRepair.rows[0]) throw Object.assign(new Error("Còn số lượng sửa/làm lại chưa xử lý xong."), { status: 409 });
    }
    const output = await client.query(
      `insert into local_production_outputs(production_order_id,quantity_good,quantity_scrap,warehouse_id,idempotency_key) values($1,$2,$3,$4,$5) returning *`,
      [
        req.params.id,
        good,
        scrap,
        req.body.warehouse_id || req.body.warehouseId || null,
        idempotencyKey,
      ],
    );
    const order = await client.query(
      `update local_production_orders set status='COMPLETED',quantity_good=$2,quantity_scrap=$3,completed_at=now(),completed_by=$4,actual_end_at=now(),updated_at=now(),local_modified_at=now() where id=$1 returning ${localProductionOrderSelect}`,
      [req.params.id, good, scrap, currentLocalActor()],
    );
    await client.query("insert into local_dispatch_audit_events(production_order_id,action,actor_id,data) values($1,'COMPLETE_ORDER',$2,$3::jsonb)", [req.params.id,currentLocalActor(),JSON.stringify(output.rows[0])]);
    await client.query("commit");
    res.json({
      id: req.params.id,
      status: "COMPLETED",
      output: {
        ...output.rows[0],
        quantity_good: asNumber(output.rows[0].quantity_good),
        quantity_scrap: asNumber(output.rows[0].quantity_scrap),
      },
      order: localProductionOrderRowLegacy(order.rows[0]),
      reused: false,
    });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    sendError(res, error);
  } finally {
    client.release();
  }
});
app.post("/api/production-orders/:id/transition", async (req, res) => {
  try {
    if (['employee','team_leader'].includes(currentLocalRole())) throw Object.assign(new Error('Chỉ quản lý được chuyển trạng thái lệnh sản xuất.'),{status:403});
    await requireLocalCapability(pool,['production_manage']);
    const target = String(req.body.target_status || req.body.targetStatus || "")
      .trim()
      .toUpperCase();
    const reason = req.body.reason == null ? null : String(req.body.reason).trim();
    const allowed = new Set([
      "DRAFT",
      "PLANNED",
      "RELEASED",
      "IN_PROGRESS",
      "ON_HOLD",
      "COMPLETED",
      "CANCELLED",
    ]);
    if (!allowed.has(target))
      throw new Error("Trạng thái lệnh sản xuất không hợp lệ.");
    if (target === "CANCELLED" && !reason)
      throw new Error("Cần nhập lý do hủy lệnh sản xuất.");
    const row = await withLocalTransaction(async (client) => {
      await lockPayrollSourceShared(client);
      const current = (await client.query("select * from local_production_orders where id=$1 for update", [req.params.id])).rows[0];
      if (!current) throw new Error("Không tìm thấy lệnh sản xuất.");
      if(target==='CANCELLED'&&current.workflow_generation==='WORKFLOW_V3')await assertWholeCancellationUnstarted(client,String(req.params.id));
      if (["COMPLETED", "CANCELLED"].includes(target)) await assertProductionDispatchSettled(client, String(req.params.id));
      const transitions: Record<string,string[]> = { DRAFT: ['PLANNED','CANCELLED'], PLANNED: ['DRAFT','CANCELLED'], RELEASED: ['IN_PROGRESS','ON_HOLD','CANCELLED'], IN_PROGRESS: ['ON_HOLD','CANCELLED'], ON_HOLD: ['IN_PROGRESS','CANCELLED'] };
      if (current.status === target) return current;
      if (!transitions[current.status]?.includes(target)) throw new Error(target === 'COMPLETED' ? 'Dùng thao tác Hoàn thành để ghi đầu ra và chốt lệnh.' : 'Không thể chuyển trạng thái này; lệnh đã chốt không được mở lại.');
      if (target === 'ON_HOLD' && !reason) throw new Error('Tạm dừng lệnh phải có lý do.');
      if (target === 'IN_PROGRESS' && current.status==='ON_HOLD' && !reason) throw Object.assign(new Error('Tiếp tục lệnh phải có lý do.'),{status:409});
      if (target === 'IN_PROGRESS' && current.sales_request_id && (await client.query("select 1 from local_production_sales_requests where id=$1 and status='ADJUSTMENT_REQUIRED'", [current.sales_request_id])).rows[0]) throw Object.assign(new Error('Yêu cầu Sale vẫn đang chờ xử lý điều chỉnh; quản lý phải chấp nhận trước khi tiếp tục lệnh.'), { status: 409 });
      const { rows } = await client.query(
      `
      update local_production_orders
      set status=$2,
          actual_start_at=case when $2='IN_PROGRESS' then coalesce(actual_start_at,now()) else actual_start_at end,
          actual_end_at=case when $2 in ('COMPLETED','CANCELLED') then coalesce(actual_end_at,now()) else actual_end_at end,
          completed_at=case when $2='COMPLETED' then coalesce(completed_at,now()) else completed_at end,
          completed_by=case when $2='COMPLETED' then coalesce(completed_by,$4) else completed_by end,
          cancelled_at=case when $2='CANCELLED' then coalesce(cancelled_at,now()) else cancelled_at end,
          cancelled_by=case when $2='CANCELLED' then coalesce(cancelled_by,$4) else cancelled_by end,
          cancel_reason=case when $2='CANCELLED' then $3 else cancel_reason end,
          updated_at=now(), local_modified_at=now()
      where id=$1
      returning ${localProductionOrderSelect}`,
      [req.params.id, target, reason, currentLocalActor()],
    );
      await client.query("insert into local_dispatch_audit_events(production_order_id,action,actor_id,reason,data) values($1,'TRANSITION_ORDER',$2,$3,$4::jsonb)", [req.params.id,currentLocalActor(),reason,JSON.stringify({ from: current.status, to: target })]);
      return rows[0];
    });
    res.json(localProductionOrderRowLegacy(row));
  } catch (error) {
    sendError(res, error);
  }
});
app.get("/api/production/source-orders", async (_req, res) => {
  try {
    const { rows } =
      await pool.query(`select source_key id,coalesce(nullif(payload->>'order_number',''),source_key) order_number,payload->>'display_order_number' display_order_number,coalesce(payload->>'status','') status,payload->>'delivery_date' delivery_date,
      case when payload->>'total_amount' ~ '^-?[0-9]+(\\.[0-9]+)?$' then (payload->>'total_amount')::numeric else null end total_amount,coalesce(payload->'items','[]'::jsonb) items
      from local_source_snapshots where source='SUPABASE' and source_table='orders' and not is_deleted order by last_seen_at desc limit 500`);
    res.json(
      rows.map((row) => ({ ...row, total_amount: asNumber(row.total_amount) })),
    );
  } catch (error) {
    sendError(res, error);
  }
});
app.get("/api/production/fabric-variants", async (req, res) => {
  try {
    const search = String(req.query.search || "").trim();
    const { rows } = await pool.query(
      `with variants as (
      select v.id,v.variant_name,v.color,v.width_code,v.weight,coalesce(v.unit,'m') unit,t.name fabric_type_name
      from local_fabric_variants v left join local_fabric_types t on t.id=v.fabric_type_id
      union all
      select v.source_key id,v.payload->>'variant_name' variant_name,v.payload->>'color' color,v.payload->>'width_code' width_code,v.payload->>'weight' weight,coalesce(v.payload->>'unit','m') unit,t.payload->>'name' fabric_type_name
      from local_source_snapshots v left join local_source_snapshots t on t.source='SUPABASE' and t.source_table='fabric_types' and t.source_key=v.payload->>'fabric_type_id'
      where v.source='SUPABASE' and v.source_table='fabric_variants' and not v.is_deleted
        and not exists(select 1 from local_fabric_variants c where c.id=v.source_key)
      ) select * from variants where $1='' or concat_ws(' ',variant_name,color,width_code,fabric_type_name) ilike '%' || $1 || '%' order by variant_name,id limit 1000`,
      [search],
    );
    res.json(rows);
  } catch (error) {
    sendError(res, error);
  }
});
app.get("/api/production-orders/:id/items", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `select i.id,i.production_order_id,i.product_id,i.product_sku,i.product_name,i.fabric_variant_id,i.source_order_item_key,i.color,i.size,i.dimensions,i.planned_quantity,i.completed_quantity,i.notes,i.created_at,i.sewing_code_selection->>'piece_rate_code' sewing_code from local_production_order_items i where i.production_order_id=$1 order by i.created_at`,
      [req.params.id],
    );
    res.json(
      rows.map((row) => ({
        ...row,
        tenant_id: "local-tenant",
        planned_quantity: asNumber(row.planned_quantity) || 0,
        completed_quantity: asNumber(row.completed_quantity) || 0,
      })),
    );
  } catch (error) {
    sendError(res, error);
  }
});
app.get(
  "/api/production-orders/:id/material-requirements",
  async (req, res) => {
    try {
      const { rows } = await pool.query(
        `select * from local_production_order_material_requirements where production_order_id=$1 order by created_at`,
        [req.params.id],
      );
      res.json(
        rows.map((row) => ({
          ...row,
          tenant_id: "local-tenant",
          standard_quantity: asNumber(row.standard_quantity) || 0,
          planned_quantity: asNumber(row.planned_quantity) || 0,
          waste_quantity_standard: asNumber(row.waste_quantity_standard) || 0,
        })),
      );
    } catch (error) {
      sendError(res, error);
    }
  },
);
app.get("/api/production-orders/:id/operations", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `select * from local_production_order_operations where production_order_id=$1 order by sequence`,
      [req.params.id],
    );
    res.json(
      rows.map((row) => ({
        ...row,
        tenant_id: "local-tenant",
        standard_setup_minutes: asNumber(row.standard_setup_minutes) || 0,
        standard_run_minutes_per_unit:
          asNumber(row.standard_run_minutes_per_unit) || 0,
        standard_total_minutes: asNumber(row.standard_total_minutes) || 0,
        quantity_input: asNumber(row.quantity_input) || 0,
        quantity_good: asNumber(row.quantity_good) || 0,
        quantity_scrap: asNumber(row.quantity_scrap) || 0,
        quantity_rework: asNumber(row.quantity_rework) || 0,
      })),
    );
  } catch (error) {
    sendError(res, error);
  }
});
app.get("/api/production-orders/:id/outputs", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `select o.id, o.production_order_id, p.product_id, o.quantity_good, o.quantity_scrap, o.quantity_rework, o.warehouse_id, o.recorded_at::date as output_date, 'COMPLETED' as status, o.valuation_status,o.inventory_receipt_id,o.created_by, o.recorded_at as created_at from local_production_outputs o join local_production_orders p on p.id=o.production_order_id where o.production_order_id=$1 order by o.recorded_at`,
      [req.params.id],
    );
    res.json(
      rows.map((row) => ({
        ...row,
        tenant_id: "local-tenant",
        quantity_good: asNumber(row.quantity_good) || 0,
        quantity_scrap: asNumber(row.quantity_scrap) || 0,
        quantity_rework: asNumber(row.quantity_rework) || 0,
      })),
    );
  } catch (error) {
    sendError(res, error);
  }
});
const productionOperationLogRow = (row: Record<string, unknown>) => ({
  ...row,
  tenant_id: "local-tenant",
  quantity: asNumber(row.quantity),
  duration_minutes: asNumber(row.duration_minutes),
});
async function lockProductionOperationParent(client: PoolClient, operationId: string) {
  await lockPayrollSourceShared(client);
  const pointer = (await client.query('select production_order_id from local_production_order_operations where id=$1',[operationId])).rows[0];
  if (!pointer) throw new Error('Không tìm thấy công đoạn.');
  const order = (await client.query('select * from local_production_orders where id=$1 for update',[pointer.production_order_id])).rows[0];
  if (!order || !['RELEASED','IN_PROGRESS'].includes(order.status)) throw new Error('Lệnh đã dừng hoặc chốt, không thể ghi thêm công đoạn.');
  return pointer.production_order_id as string;
}
async function lockProductionStageParent(client: PoolClient, orderId: string, batchId: string | null) {
  await lockPayrollSourceShared(client);
  const order=(await client.query('select status from local_production_orders where id=$1 for update',[orderId])).rows[0];
  if (!order || !['RELEASED','IN_PROGRESS'].includes(order.status)) throw new Error('Lệnh đã dừng hoặc chốt, không thể ghi thêm công đoạn.');
  if (batchId) {
    const batch=(await client.query('select status from local_production_batches where id=$1 and production_order_id=$2 for update',[batchId,orderId])).rows[0];
    if (!batch || !['PLANNED','IN_PROGRESS'].includes(batch.status)) throw new Error('Lô không thuộc lệnh hoặc đã chốt.');
  }
}
app.get("/api/production-operations/:id/logs", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "select * from local_production_operation_logs where production_order_operation_id=$1 order by created_at",
      [req.params.id],
    );
    res.json(rows.map(productionOperationLogRow));
  } catch (error) {
    sendError(res, error);
  }
});
app.post("/api/production-operations/:id/logs", async (req, res) => {
  try {
    const startedAt = req.body.started_at || null;
    const endedAt = req.body.ended_at || null;
    const duration =
      startedAt && endedAt
        ? Math.max(
            0,
            (new Date(endedAt).getTime() - new Date(startedAt).getTime()) /
              60000,
          )
        : null;
    const row = await withLocalTransaction(async (client) => {
      await lockProductionOperationParent(client, String(req.params.id));
      const { rows } = await client.query(
      `insert into local_production_operation_logs(production_order_operation_id,event_type,worker_id,quantity,reason_code,started_at,ended_at,duration_minutes,notes,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
      [
        req.params.id,
        req.body.event_type,
        req.body.worker_id || null,
        req.body.quantity ?? null,
        req.body.reason_code || null,
        startedAt,
        endedAt,
        duration,
        req.body.notes || null,
        currentLocalActor(),
      ],
    );
      return rows[0];
    });
    res.status(201).json(productionOperationLogRow(row));
  } catch (error) {
    sendError(res, error);
  }
});
app.post("/api/production-operations/:id/start", async (req, res) => {
  try {
    const row = await withLocalTransaction(async (client) => {
      await lockProductionOperationParent(client, String(req.params.id));
      const { rows } = await client.query(
      `update local_production_order_operations set status='IN_PROGRESS',actual_start=coalesce(actual_start,now()),updated_at=now() where id=$1 and status in ('PENDING','READY') returning *`,
      [req.params.id],
    );
    if (!rows[0])
      throw new Error("Công đoạn không ở trạng thái có thể bắt đầu.");
      return rows[0];
    });
    res.json({ ...row, tenant_id: "local-tenant" });
  } catch (error) {
    sendError(res, error);
  }
});
app.post("/api/production-operations/:id/complete", async (req, res) => {
  try {
    const good = Number(req.body.quantity_good ?? 0);
    const scrap = Number(req.body.quantity_scrap ?? 0);
    const rework = Number(req.body.quantity_rework ?? 0);
    if (![good,scrap,rework].every(value => Number.isFinite(value) && value >= 0)) throw new Error('Số lượng công đoạn không hợp lệ.');
    const row = await withLocalTransaction(async (client) => {
      const orderId = await lockProductionOperationParent(client, String(req.params.id));
      // A legacy operation cannot close an order's dispatch work indirectly.
      await assertProductionDispatchSettled(client,orderId);
      const { rows } = await client.query(
      `update local_production_order_operations set status='COMPLETED',quantity_good=$2,quantity_scrap=$3,quantity_rework=$4,actual_end=now(),updated_at=now() where id=$1 and status='IN_PROGRESS' returning *`,
      [req.params.id, good, scrap, rework],
    );
    if (!rows[0])
      throw new Error("Công đoạn không ở trạng thái đang thực hiện.");
      return rows[0];
    });
    res.json({ ...row, tenant_id: "local-tenant" });
  } catch (error) {
    sendError(res, error);
  }
});

const productionBatchRow = (row: Record<string, unknown>) => ({
  ...row,
  tenant_id: "local-tenant",
  planned_quantity: asNumber(row.planned_quantity) || 0,
});
const productionStageEventRow = (row: Record<string, unknown>) => ({
  ...row,
  tenant_id: "local-tenant",
  quantity_received: asNumber(row.quantity_received) || 0,
  quantity_good: asNumber(row.quantity_good) || 0,
  quantity_rework: asNumber(row.quantity_rework) || 0,
  quantity_remake: asNumber(row.quantity_remake) || 0,
  quantity_defect: asNumber(row.quantity_defect) || 0,
  minutes_worked: asNumber(row.minutes_worked),
});
const productionFabricAllocationRow = (row: Record<string, unknown>) => ({
  ...row,
  tenant_id: "local-tenant",
  reserved_quantity: asNumber(row.reserved_quantity) || 0,
  issued_quantity: asNumber(row.issued_quantity) || 0,
  received_quantity: asNumber(row.received_quantity) || 0,
  consumed_quantity: asNumber(row.consumed_quantity) || 0,
  returned_quantity: asNumber(row.returned_quantity) || 0,
  scrap_quantity: asNumber(row.scrap_quantity) || 0,
});

app.get("/api/production-orders/:id/batches", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "select * from local_production_batches where production_order_id=$1 order by created_at",
      [req.params.id],
    );
    res.json(rows.map(productionBatchRow));
  } catch (error) {
    sendError(res, error);
  }
});
app.post("/api/production-batches/:id/status", async (req, res) => {
  try {
    if (['employee','team_leader'].includes(currentLocalRole())) throw Object.assign(new Error('Chỉ quản lý được chuyển trạng thái lô sản xuất.'),{status:403});
    await requireLocalCapability(pool,['production_manage']);
    const target = String(req.body.target_status || "").toUpperCase();
    if (
      !new Set(["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).has(target)
    )
      throw new Error("Trạng thái batch không hợp lệ.");
    const row = await withLocalTransaction(async (client) => {
      await lockPayrollSourceShared(client);
      const pointer = (await client.query('select production_order_id from local_production_batches where id=$1',[req.params.id])).rows[0];
      if (!pointer) throw new Error('Không tìm thấy lô.');
      const order = (await client.query('select * from local_production_orders where id=$1 for update',[pointer.production_order_id])).rows[0];
      if(order.workflow_generation==='WORKFLOW_V3'&&target==='COMPLETED')throw Object.assign(new Error('Lô của quy trình mới được chốt cùng lệnh sau khi nhập thành phẩm.'),{status:409});
      const batch = (await client.query('select * from local_production_batches where id=$1 for update',[req.params.id])).rows[0];
      if(order.workflow_generation==='WORKFLOW_V3'&&target==='CANCELLED')await assertWholeCancellationUnstarted(client,order.id,String(req.params.id));
      const transitions: Record<string,string[]> = { PLANNED: ['IN_PROGRESS','CANCELLED'], IN_PROGRESS: ['COMPLETED','CANCELLED'] };
      if (batch.status === target) return batch;
      if (!transitions[batch.status]?.includes(target)) throw new Error('Lô đã chốt hoặc chuyển trạng thái không hợp lệ.');
      if (!['RELEASED','IN_PROGRESS'].includes(order.status)) throw new Error('Lệnh phải đang hoạt động để chuyển trạng thái lô.');
      if (['COMPLETED','CANCELLED'].includes(target)) await assertProductionDispatchSettled(client,pointer.production_order_id,String(req.params.id));
      if (target === 'CANCELLED' && !String(req.body.reason || '').trim()) throw new Error('Hủy lô phải có lý do.');
      const { rows } = await client.query(
      `update local_production_batches set status=$2,started_at=case when $2='IN_PROGRESS' then coalesce(started_at,now()) else started_at end,completed_at=case when $2='COMPLETED' then coalesce(completed_at,now()) else completed_at end,updated_at=now() where id=$1 returning *`,
      [req.params.id, target],
    );
    if (target === "IN_PROGRESS")
      await client.query(
        "update local_production_orders set status='IN_PROGRESS',actual_start_at=coalesce(actual_start_at,now()),updated_at=now(),local_modified_at=now() where id=$1 and status='RELEASED'",
        [rows[0].production_order_id],
      );
      await client.query("insert into local_dispatch_audit_events(production_order_id,action,actor_id,reason,data) values($1,'TRANSITION_BATCH',$2,$3,$4::jsonb)",[pointer.production_order_id,currentLocalActor(),req.body.reason || null,JSON.stringify({ batch_id: batch.id, from: batch.status, to: target })]);
      return rows[0];
    });
    res.json(productionBatchRow(row));
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/production-orders/:id/stage-events", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "select * from local_production_stage_events where production_order_id=$1 order by occurred_at desc,created_at desc",
      [req.params.id],
    );
    res.json(rows.map(productionStageEventRow));
  } catch (error) {
    sendError(res, error);
  }
});
app.post("/api/production-stage-events", async (req, res) => {
  const client = await pool.connect();
  try {
    const key = String(req.body.idempotency_key || randomUUID());
    const existing = await client.query(
      "select * from local_production_stage_events where idempotency_key=$1",
      [key],
    );
    if (existing.rows[0])
      return res.json(productionStageEventRow(existing.rows[0]));
    const received = Number(req.body.quantity_received || 0);
    const good = Number(req.body.quantity_good || 0);
    const rework = Number(req.body.quantity_rework || 0);
    const remake = Number(req.body.quantity_remake || 0);
    const defect = Number(req.body.quantity_defect || 0);
    const eventDate = String(
      req.body.occurred_at || new Date().toISOString(),
    ).slice(0, 10);
    if (
      !req.body.production_order_id ||
      !req.body.production_batch_id ||
      !req.body.stage ||
      !req.body.worker_id ||
      !(received > 0) ||
      [good, rework, remake, defect].some(
        (value) => !Number.isFinite(value) || value < 0,
      ) ||
      good + rework + remake + defect > received
    )
      throw new Error("Dữ liệu công đoạn không hợp lệ.");
    await client.query("begin");
    await lockProductionStageParent(client,String(req.body.production_order_id),String(req.body.production_batch_id));
    if(req.body.order_item_id&&!(await client.query('select 1 from local_production_order_items where id=$1 and production_order_id=$2',[req.body.order_item_id,req.body.production_order_id])).rows[0])throw new Error('Dòng sản phẩm không thuộc lệnh của báo cáo.');
    await assertLocalSourceWriteScope(
      client,
      String(req.body.worker_id),
      eventDate,
    );
    const { rows } = await client.query(
      `insert into local_production_stage_events(production_order_id,production_batch_id,order_item_id,stage,worker_id,team_id,quantity_received,quantity_good,quantity_rework,quantity_remake,quantity_defect,minutes_worked,event_type,status,occurred_at,created_by,notes,idempotency_key) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'SUBMITTED',$14,$15,$16,$17) returning *`,
      [
        req.body.production_order_id,
        req.body.production_batch_id,
        req.body.order_item_id || null,
        req.body.stage,
        req.body.worker_id,
        req.body.team_id || null,
        received,
        good,
        rework,
        remake,
        defect,
        req.body.minutes_worked ?? null,
        req.body.event_type || "OUTPUT",
        req.body.occurred_at || new Date().toISOString(),
        currentLocalActor(),
        req.body.notes || null,
        key,
      ],
    );
    await client.query(
      "update local_production_orders set status=case when status in ('RELEASED','PLANNED') then 'IN_PROGRESS' else status end,actual_start_at=coalesce(actual_start_at,now()),updated_at=now(),local_modified_at=now() where id=$1",
      [req.body.production_order_id],
    );
    await client.query("commit");
    res.status(201).json(productionStageEventRow(rows[0]));
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    sendError(res, error);
  } finally {
    client.release();
  }
});
app.post("/api/production-stage-events/:id/status", async (req, res) => {
  try {
    const target = String(req.body.target_status || "").toUpperCase();
    if (!new Set(["SUBMITTED", "APPROVED", "REJECTED", "LOCKED"]).has(target))
      throw new Error("Trạng thái duyệt công đoạn không hợp lệ.");
    if (target === "REJECTED" && !String(req.body.reason || "").trim())
      throw new Error("Lý do từ chối là bắt buộc.");
    const row=await withLocalTransaction(async(client)=>{
      const pointer=(await client.query('select * from local_production_stage_events where id=$1',[req.params.id])).rows[0];
      if (!pointer || pointer.assignment_id) throw new Error('Báo cáo giao việc phải xử lý trong mục Giao việc.');
      await lockProductionStageParent(client,pointer.production_order_id,pointer.production_batch_id);
      if (currentLocalRole()==='team_leader' && pointer.created_by===currentLocalActor()) throw Object.assign(new Error('Không được tự duyệt báo cáo do mình tạo.'),{status:403});
      const { rows } = await client.query(
      `update local_production_stage_events set status=$2,approved_by=case when $2='APPROVED' then $3 else approved_by end,reviewed_at=now(),review_reason=$4,updated_at=now() where id=$1 and status<>'REVERSED' returning *`,
      [req.params.id, target, currentLocalActor(), req.body.reason || null],
    );
    if (!rows[0]) throw new Error("Không tìm thấy sự kiện công đoạn.");
      return rows[0];
    });
    res.json(productionStageEventRow(row));
  } catch (error) {
    sendError(res, error);
  }
});
app.post("/api/production-stage-events/:id/reverse", async (req, res) => {
  try {
    const reason = String(req.body.reason || "").trim();
    if (!reason) throw new Error("Lý do đảo công đoạn là bắt buộc.");
    const row=await withLocalTransaction(async(client)=>{
      if (currentLocalRole()==='team_leader') throw Object.assign(new Error('Tổ trưởng không có quyền đảo công đoạn.'),{status:403});
      const pointer=(await client.query('select * from local_production_stage_events where id=$1',[req.params.id])).rows[0];
      if (!pointer || pointer.assignment_id) throw new Error('Báo cáo giao việc phải xử lý trong mục Giao việc.');
      await lockProductionStageParent(client,pointer.production_order_id,pointer.production_batch_id);
      const { rows } = await client.query(
      "update local_production_stage_events set status='REVERSED',reversed_by=$3,reversed_at=now(),reversal_reason=$2,updated_at=now() where id=$1 and status='APPROVED' returning *",
      [req.params.id, reason, currentLocalActor()],
    );
    if (!rows[0]) throw new Error("Chỉ công đoạn đã duyệt mới được đảo.");
      return rows[0];
    });
    res.json(productionStageEventRow(row));
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/production-orders/:id/fabric-allocations", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "select * from local_production_fabric_allocations where production_order_id=$1 order by created_at desc",
      [req.params.id],
    );
    res.json(rows.map(productionFabricAllocationRow));
  } catch (error) {
    sendError(res, error);
  }
});
app.get("/api/production/fabric-stock", async (req, res) => {
  try {
    const variantId = String(req.query.fabricVariantId || "");
    const { rows } = await pool.query(
      `select i.fabric_variant_id,v.variant_name,t.name fabric_type_name,v.color,v.width_code,coalesce(v.unit,'m') unit,i.warehouse_id,w.name warehouse_name,i.current_stock,i.reserved_stock,greatest(i.current_stock-i.reserved_stock,0) available_stock from local_fabric_inventory i join local_fabric_variants v on v.id=i.fabric_variant_id left join local_fabric_types t on t.id=v.fabric_type_id left join local_warehouses w on w.id=i.warehouse_id where ($1='' or i.fabric_variant_id=$1) order by v.variant_name,w.name`,
      [variantId],
    );
    res.json(
      rows.map((row) => ({
        ...row,
        current_stock: asNumber(row.current_stock) || 0,
        reserved_stock: asNumber(row.reserved_stock) || 0,
        available_stock: asNumber(row.available_stock) || 0,
      })),
    );
  } catch (error) {
    sendError(res, error);
  }
});
app.post("/api/production/fabric-allocations", async (req, res) => {
  const client = await pool.connect();
  try {
    const quantity = Number(req.body.quantity);
    const key = String(req.body.idempotency_key || randomUUID());
    if (
      !req.body.production_order_id ||
      !req.body.production_batch_id ||
      !req.body.fabric_variant_id ||
      !req.body.warehouse_id ||
      !(quantity > 0)
    )
      throw new Error("Lệnh, batch, vải, kho và số lượng là bắt buộc.");
    const existing = await client.query(
      "select * from local_production_fabric_allocations where idempotency_key=$1",
      [key],
    );
    if (existing.rows[0])
      return res.json(productionFabricAllocationRow(existing.rows[0]));
    await client.query("begin");
    await assertLegacyFabricVariantsWritable(client, [req.body.fabric_variant_id]);
    const order = await client.query(
      "select production_order_number from local_production_orders where id=$1",
      [req.body.production_order_id],
    );
    if (!order.rows[0]) throw new Error("Không tìm thấy lệnh sản xuất.");
    const stock = await client.query(
      "select current_stock from local_fabric_inventory where fabric_variant_id=$1 and warehouse_id=$2 for update",
      [req.body.fabric_variant_id, req.body.warehouse_id],
    );
    if (!stock.rows[0] || Number(stock.rows[0].current_stock) < quantity)
      throw new Error(
        `Tồn vải không đủ. Còn ${Number(stock.rows[0]?.current_stock || 0)} m.`,
      );
    const usageId = randomUUID();
    const transactionId = randomUUID();
    await client.query(
      `insert into local_fabric_usage(id,order_id,order_number,order_group,order_type,fabric_variant_id,warehouse_id,quantity_used,unit,usage_date,notes,manager_id,tenant_id,is_snapshot_record,local_modified_at,created_at,updated_at) values($1,$2,$3,'unclassified','production',$4,$5,$6,'m',$7,$8,$9,'local-tenant',false,now(),now(),now())`,
      [
        usageId,
        req.body.production_order_id,
        order.rows[0].production_order_number,
        req.body.fabric_variant_id,
        req.body.warehouse_id,
        quantity,
        req.body.usage_date || new Date().toISOString(),
        req.body.notes || null,
        fabricActor(req),
      ],
    );
    await client.query(
      `insert into local_fabric_transactions(id,fabric_variant_id,warehouse_id,transaction_type,quantity,reference_number,notes,transaction_date,fabric_usage_id,manager_id,tenant_id,is_snapshot_record,local_modified_at,created_at,updated_at) values($1,$2,$3,'outbound',$4,$5,$6,$7,$8,$9,'local-tenant',false,now(),now(),now())`,
      [
        transactionId,
        req.body.fabric_variant_id,
        req.body.warehouse_id,
        -quantity,
        order.rows[0].production_order_number,
        req.body.notes || null,
        req.body.usage_date || new Date().toISOString(),
        usageId,
        fabricActor(req),
      ],
    );
    await client.query(
      "update local_fabric_inventory set current_stock=current_stock-$1,last_updated=now(),updated_at=now(),local_modified_at=now() where fabric_variant_id=$2 and warehouse_id=$3",
      [quantity, req.body.fabric_variant_id, req.body.warehouse_id],
    );
    const { rows } = await client.query(
      `insert into local_production_fabric_allocations(production_order_id,production_batch_id,fabric_variant_id,warehouse_id,issued_quantity,idempotency_key,source_system,source_fabric_usage_id,source_fabric_transaction_id,issued_at,issued_by,notes) values($1,$2,$3,$4,$5,$6,'LOCAL_FABRIC',$7,$8,now(),'local-admin',$9) returning *`,
      [
        req.body.production_order_id,
        req.body.production_batch_id,
        req.body.fabric_variant_id,
        req.body.warehouse_id,
        quantity,
        key,
        usageId,
        transactionId,
        req.body.notes || null,
      ],
    );
    await client.query("commit");
    res.status(201).json(productionFabricAllocationRow(rows[0]));
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    sendError(res, error);
  } finally {
    client.release();
  }
});
app.post("/api/production/fabric-allocations/:id/adjust", async (req, res) => {
  const client = await pool.connect();
  try {
    const action = String(req.body.action || "").toUpperCase();
    const quantity = Number(req.body.quantity);
    if (!new Set(["CONSUMED", "RETURNED"]).has(action) || !(quantity > 0))
      throw new Error("Loại điều chỉnh hoặc số lượng không hợp lệ.");
    await client.query("begin");
    const current = await client.query(
      "select * from local_production_fabric_allocations where id=$1 for update",
      [req.params.id],
    );
    const allocation = current.rows[0];
    if (!allocation) throw new Error("Không tìm thấy lần cấp vải.");
    await assertLegacyFabricVariantsWritable(client, [allocation.fabric_variant_id]);
    const remaining =
      Number(allocation.issued_quantity) -
      Number(allocation.consumed_quantity) -
      Number(allocation.returned_quantity) -
      Number(allocation.scrap_quantity);
    if (quantity > remaining + 0.0001)
      throw new Error(`Số lượng vượt phần còn lại ${remaining} m.`);
    if (action === "RETURNED") {
      const stock = await client.query(
        "select id from local_fabric_inventory where fabric_variant_id=$1 and warehouse_id=$2 for update",
        [allocation.fabric_variant_id, allocation.warehouse_id],
      );
      if (!stock.rows[0])
        throw new Error("Không tìm thấy kho vải để nhập trả.");
      await client.query(
        "update local_fabric_inventory set current_stock=current_stock+$1,last_updated=now(),updated_at=now(),local_modified_at=now() where fabric_variant_id=$2 and warehouse_id=$3",
        [quantity, allocation.fabric_variant_id, allocation.warehouse_id],
      );
      await client.query(
        `insert into local_fabric_transactions(id,fabric_variant_id,warehouse_id,transaction_type,quantity,reference_number,notes,transaction_date,manager_id,tenant_id,is_snapshot_record,local_modified_at,created_at,updated_at) values(gen_random_uuid()::text,$1,$2,'inbound',$3,$4,$5,now(),$6,'local-tenant',false,now(),now(),now())`,
        [
          allocation.fabric_variant_id,
          allocation.warehouse_id,
          quantity,
          `RETURN-${req.params.id}`,
          req.body.reason || "Trả vải từ sản xuất",
          fabricActor(req),
        ],
      );
    }
    const column =
      action === "CONSUMED" ? "consumed_quantity" : "returned_quantity";
    const { rows } = await client.query(
      `update local_production_fabric_allocations set ${column}=${column}+$2,updated_at=now() where id=$1 returning *`,
      [req.params.id, quantity],
    );
    await client.query("commit");
    res.json(productionFabricAllocationRow(rows[0]));
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    sendError(res, error);
  } finally {
    client.release();
  }
});

// Local labor-cost aggregate used by the production-order detail screen.  It
// intentionally reads only local attendance and operation rows; no Supabase
// RPC is needed when the application runs in local mode.
app.get("/api/production-orders/:id/labor-cost", async (req, res) => {
  try {
    const orderId = req.params.id;
    const [standard, attendance, logMinutes, byWorker, byOperation] =
      await Promise.all([
        pool.query(
          "select coalesce(sum(standard_total_minutes),0) standard_minutes from local_production_order_operations where production_order_id=$1",
          [orderId],
        ),
        pool.query(
          `select coalesce(sum(case when attendance_method='HOUR' then coalesce(work_hours,0)*60 when attendance_method='DAY' then coalesce(day_units,0)*coalesce(standard_hours_per_day,8)*60 else 0 end),0) actual_minutes, coalesce(sum(calculated_amount),0) direct_labor_cost, count(*)::int attendance_count from local_attendance where production_order_id=$1 and not is_reversed and workflow_status <> 'REJECTED'`,
          [orderId],
        ),
        pool.query(
          `select coalesce(sum(duration_minutes),0) duration_minutes from local_production_operation_logs l join local_production_order_operations o on o.id=l.production_order_operation_id where o.production_order_id=$1`,
          [orderId],
        ),
        pool.query(
          `select a.worker_id,w.display_name worker_name,coalesce(sum(a.calculated_amount),0) amount,false is_estimated from local_attendance a join local_workers w on w.id=a.worker_id where a.production_order_id=$1 and not a.is_reversed and a.workflow_status <> 'REJECTED' group by a.worker_id,w.display_name order by w.display_name`,
          [orderId],
        ),
        pool.query(
          `select a.production_order_operation_id operation_id,coalesce(o.operation_name,'Công đoạn') operation_name,coalesce(sum(a.calculated_amount),0) amount,false is_estimated from local_attendance a left join local_production_order_operations o on o.id=a.production_order_operation_id where a.production_order_id=$1 and not a.is_reversed and a.workflow_status <> 'REJECTED' group by a.production_order_operation_id,o.operation_name order by o.operation_name`,
          [orderId],
        ),
      ]);
    const standardMinutes = Number(standard.rows[0]?.standard_minutes || 0);
    const attendanceMinutes = Number(attendance.rows[0]?.actual_minutes || 0);
    const loggedMinutes = Number(logMinutes.rows[0]?.duration_minutes || 0);
    const actualMinutes =
      attendanceMinutes > 0 ? attendanceMinutes : loggedMinutes;
    const directLaborCost = Number(attendance.rows[0]?.direct_labor_cost || 0);
    res.json({
      production_order_id: orderId,
      standard_minutes: standardMinutes,
      actual_minutes: actualMinutes,
      variance_minutes: actualMinutes - standardMinutes,
      efficiency_percent:
        standardMinutes > 0 && actualMinutes > 0
          ? (standardMinutes / actualMinutes) * 100
          : null,
      direct_labor_cost: directLaborCost,
      manufacturing_overhead_cost: null,
      total_labor_cost: directLaborCost,
      is_estimated: false,
      cost_visible: true,
      by_worker: byWorker.rows.map((row) => ({
        ...row,
        amount: Number(row.amount || 0),
        is_estimated: false,
      })),
      by_operation: byOperation.rows.map((row) => ({
        ...row,
        amount: Number(row.amount || 0),
        is_estimated: false,
      })),
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/production/scrap", async (req, res) => {
  const client = await pool.connect();
  try {
    const orderId = String(req.body.production_order_id || "");
    const operationId = req.body.production_order_operation_id
      ? String(req.body.production_order_operation_id)
      : null;
    const quantity = Number(req.body.quantity);
    const reasonCode = String(
      req.body.reason_code || req.body.reasonCode || "",
    ).trim();
    const key = String(
      req.body.idempotency_key ||
        `scrap-${orderId}-${operationId || "order"}-${quantity}-${reasonCode}`,
    );
    if (!orderId || !(quantity > 0) || !reasonCode)
      throw new Error("Lệnh, số lượng phế phẩm và lý do là bắt buộc.");
    const existing = await client.query(
      "select * from local_production_scrap_records where idempotency_key=$1",
      [key],
    );
    if (existing.rows[0])
      return res.json({
        ...existing.rows[0],
        tenant_id: "local-tenant",
        quantity: asNumber(existing.rows[0].quantity) || 0,
        reused: true,
      });
    await client.query("begin");
    await lockPayrollSourceShared(client);
    const order = await client.query(
      "select id,quantity_planned,status from local_production_orders where id=$1 for update",
      [orderId],
    );
    if (!order.rows[0]) throw new Error("Không tìm thấy lệnh sản xuất.");
    if (!['RELEASED','IN_PROGRESS'].includes(order.rows[0].status)) throw new Error('Lệnh đã dừng hoặc chốt.');
    if (operationId) {
      const operation = await client.query(
        "select id from local_production_order_operations where id=$1 and production_order_id=$2",
        [operationId, orderId],
      );
      if (!operation.rows[0])
        throw new Error("Công đoạn không thuộc lệnh sản xuất.");
    }
    const { rows } = await client.query(
      `insert into local_production_scrap_records(production_order_id,production_order_operation_id,quantity,reason_code,notes,idempotency_key,created_by) values($1,$2,$3,$4,$5,$6,$7) returning *`,
      [orderId, operationId, quantity, reasonCode, req.body.notes || null, key, currentLocalActor()],
    );
    await client.query(
      "update local_production_orders set quantity_scrap=quantity_scrap+$2,updated_at=now(),local_modified_at=now() where id=$1",
      [orderId, quantity],
    );
    if (operationId)
      await client.query(
        "update local_production_order_operations set quantity_scrap=quantity_scrap+$2,updated_at=now() where id=$1",
        [operationId, quantity],
      );
    await client.query("commit");
    res.status(201).json({
      ...rows[0],
      tenant_id: "local-tenant",
      quantity: asNumber(rows[0].quantity) || 0,
      reused: false,
    });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    sendError(res, error);
  } finally {
    client.release();
  }
});

app.post("/api/production/rework", async (req, res) => {
  const client = await pool.connect();
  try {
    const orderId = String(req.body.production_order_id || "");
    const fromOperationId = req.body.from_operation_id
      ? String(req.body.from_operation_id)
      : null;
    const targetOperationId = req.body.target_operation_id
      ? String(req.body.target_operation_id)
      : null;
    const quantity = Number(req.body.quantity);
    const reasonCode = String(
      req.body.reason_code || req.body.reasonCode || "",
    ).trim();
    const key = String(
      req.body.idempotency_key ||
        `rework-${orderId}-${fromOperationId || "from"}-${targetOperationId || "to"}-${quantity}-${reasonCode}`,
    );
    if (!orderId || !(quantity > 0) || !reasonCode)
      throw new Error("Lệnh, số lượng sửa và lý do là bắt buộc.");
    const existing = await client.query(
      "select * from local_production_rework_records where idempotency_key=$1",
      [key],
    );
    if (existing.rows[0])
      return res.json({
        ...existing.rows[0],
        tenant_id: "local-tenant",
        quantity: asNumber(existing.rows[0].quantity) || 0,
        reused: true,
      });
    await client.query("begin");
    await lockPayrollSourceShared(client);
    const order = await client.query(
      "select id,status from local_production_orders where id=$1 for update",
      [orderId],
    );
    if (!order.rows[0]) throw new Error("Không tìm thấy lệnh sản xuất.");
    if (!['RELEASED','IN_PROGRESS'].includes(order.rows[0].status)) throw new Error('Lệnh đã dừng hoặc chốt.');
    for (const operationId of [fromOperationId, targetOperationId].filter(
      Boolean,
    )) {
      const operation = await client.query(
        "select id from local_production_order_operations where id=$1 and production_order_id=$2",
        [operationId, orderId],
      );
      if (!operation.rows[0])
        throw new Error("Công đoạn không thuộc lệnh sản xuất.");
    }
    const { rows } = await client.query(
      `insert into local_production_rework_records(production_order_id,from_operation_id,target_operation_id,quantity,reason_code,notes,idempotency_key,created_by) values($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
      [
        orderId,
        fromOperationId,
        targetOperationId,
        quantity,
        reasonCode,
        req.body.notes || null,
        key,
        currentLocalActor(),
      ],
    );
    await client.query(
      "update local_production_orders set quantity_rework=quantity_rework+$2,updated_at=now(),local_modified_at=now() where id=$1",
      [orderId, quantity],
    );
    if (fromOperationId)
      await client.query(
        "update local_production_order_operations set quantity_rework=quantity_rework+$2,updated_at=now() where id=$1",
        [fromOperationId, quantity],
      );
    await client.query("commit");
    res.status(201).json({
      ...rows[0],
      tenant_id: "local-tenant",
      quantity: asNumber(rows[0].quantity) || 0,
      reused: false,
    });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    sendError(res, error);
  } finally {
    client.release();
  }
});

app.get("/api/inventory/reconciliation", async (_req, res) => {
  try {
    const balances = await localInventoryBalances();
    res.json(
      balances.map((row) => ({
        inventory_item_id: row.inventory_item_id,
        warehouse_id: row.warehouse_id,
        location_id: null,
        ledger_quantity: asNumber(row.quantity_on_hand),
        balance_quantity: asNumber(row.quantity_on_hand),
        quantity_difference: 0,
        ledger_value: asNumber(row.inventory_value),
        balance_value: asNumber(row.inventory_value),
        value_difference: 0,
      })),
    );
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/inventory/audit", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "select id,entity_type,entity_id,action,actor_id,reason,created_at from local_inventory_audit_events order by created_at desc limit 300",
    );
    res.json(rows);
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/inventory/documents", async (req, res) => {
  const client = await pool.connect();
  try {
    const idempotencyKey = String(req.body.idempotency_key || randomUUID());
    await client.query("begin");
    await requireLocalCapability(client, ["inventory_documents"]);
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`inventory-document:${idempotencyKey}`]);
    const existing = await client.query(
      "select id,document_number,status from local_inventory_documents where idempotency_key=$1",
      [idempotencyKey],
    );
    if (existing.rows[0]) {
      await client.query("commit");
      return res.json({ ...existing.rows[0], reused: true });
    }
    const lines = Array.isArray(req.body.lines) ? req.body.lines : [];
    if (!lines.length) throw new Error("Phiếu kho phải có ít nhất một dòng.");
    const type = inventoryDocumentType(req.body.document_type);
    if(type==='RETURN_IN'&&req.body.production_order_id&&(await client.query("select 1 from local_production_orders where id=$1 and workflow_generation='WORKFLOW_V3'",[req.body.production_order_id])).rows[0]&&!String(req.body.reason||'').trim())throw Object.assign(new Error('Hoàn vật tư của lệnh mới phải có lý do.'),{status:400});
    const numberPrefix =
      type === "RECEIPT" || type === "OPENING_BALANCE" || type === "RETURN_IN"
        ? "PN"
        : type === "TRANSFER"
          ? "CK"
          : "PX";
    const documentNumber = `${numberPrefix}-LOCAL-${Date.now()}`;
    const subtotal = lines.reduce(
      (sum: number, line: Record<string, unknown>) =>
        sum + Number(line.quantity || 0) * Number(line.input_unit_cost || 0),
      0,
    );
    const { rows } = await client.query(
      `insert into local_inventory_documents(document_number,document_type,status,transaction_at,warehouse_id,to_warehouse_id,description,counterparty_name,external_reference,subtotal,vat_amount,total_amount,idempotency_key,production_order_id,cutting_estimate_id)
      values($1,$2,'DRAFT',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning id,document_number,status`,
      [
        documentNumber,
        type,
        req.body.transaction_at || new Date().toISOString(),
        req.body.warehouse_id || null,
        req.body.to_warehouse_id || null,
        req.body.description || "",
        req.body.counterparty_name || null,
        req.body.external_reference || null,
        subtotal,
        0,
        subtotal,
        idempotencyKey,
        req.body.production_order_id || null,
        req.body.cutting_estimate_id || null,
      ],
    );
    for (const line of lines)
      await client.query(
        `insert into local_inventory_document_lines(document_id,inventory_item_id,quantity,unit,description,input_unit_cost,vat_rate,adjustment_direction,source_movement_id,location_id,to_location_id,cost_center_id,cost_object_id,cutting_estimate_line_id)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          rows[0].id,
          line.inventory_item_id,
          Number(line.quantity),
          line.unit || "PIECE",
          line.description || null,
          line.input_unit_cost == null ? null : Number(line.input_unit_cost),
          Number(line.vat_rate || 0),
          line.adjustment_direction || null,
          line.source_movement_id || null,
          line.location_id || null,
          line.to_location_id || null,
          line.cost_center_id || null,
          line.cost_object_id || null,
          line.cutting_estimate_line_id || null,
        ],
      );
    await client.query("commit");
    res.status(201).json({ ...rows[0], reused: false });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    sendError(res, error);
  } finally {
    client.release();
  }
});

app.post("/api/inventory/documents/:id/confirm", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await requireLocalCapability(client, ["inventory_confirm"]);
    const pointer = (await client.query("select production_order_id,cutting_estimate_id from local_inventory_documents where id=$1", [req.params.id])).rows[0];
    if (pointer?.production_order_id) await client.query("select id from local_production_orders where id=$1 for update", [pointer.production_order_id]);
    if (pointer?.cutting_estimate_id) {
      const estimate = (await client.query("select status,no_material_required,estimate_kind,source_stage_event_id,production_order_id,production_batch_id from local_cutting_estimates where id=$1 for share", [pointer.cutting_estimate_id])).rows[0];
      if (!estimate || estimate.status !== "APPROVED" || estimate.no_material_required) throw Object.assign(new Error("Dự toán cắt không còn đủ điều kiện cấp vật tư."), { status: 409 });
      if (estimate.estimate_kind === "REMAKE") {
        const source = (await client.query("select stage,status,production_order_id,production_batch_id from local_production_stage_events where id=$1 for share", [estimate.source_stage_event_id])).rows[0];
        if (!source || source.stage !== "CUTTING" || !["APPROVED", "LOCKED"].includes(source.status)
          || String(source.production_order_id) !== String(estimate.production_order_id)
          || String(source.production_batch_id) !== String(estimate.production_batch_id))
          throw Object.assign(new Error("Báo cáo cắt nguồn không còn đủ điều kiện xác nhận cấp vật tư làm lại."), { status: 409 });
      }
    }
    const docResult = await client.query(
      "select * from local_inventory_documents where id=$1 for update",
      [req.params.id],
    );
    const doc = docResult.rows[0];
    if (!doc) throw new Error("Không tìm thấy phiếu kho.");
    if (doc.status === "CONFIRMED") {
      await client.query("commit");
      return res.json({
        id: doc.id,
        document_number: doc.document_number,
        status: doc.status,
        reused: true,
      });
    }
    if (doc.status !== "DRAFT")
      throw new Error("Chỉ được xác nhận phiếu nháp.");
    const lines = await client.query(
      "select l.*,i.base_unit from local_inventory_document_lines l join local_inventory_items i on i.id=l.inventory_item_id where l.document_id=$1",
      [doc.id],
    );
    const resourceKeys = new Set<string>();
    for (const line of lines.rows) {
      if (!doc.warehouse_id) throw new Error("Phiếu kho thiếu kho thực hiện.");
      resourceKeys.add(`${line.inventory_item_id}:${doc.warehouse_id}`);
      if (doc.document_type === "TRANSFER") {
        if (!doc.to_warehouse_id || doc.to_warehouse_id === doc.warehouse_id) throw new Error("Phiếu chuyển kho cần kho nhận khác kho xuất.");
        resourceKeys.add(`${line.inventory_item_id}:${doc.to_warehouse_id}`);
      }
    }
    for (const resource of [...resourceKeys].sort()) await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`inventory-stock:${resource}`]);
    for (const line of lines.rows) {
      const currentResult = await client.query(
        "select coalesce(sum(quantity_delta),0) quantity, coalesce(sum(value_delta),0) value from local_inventory_movements where inventory_item_id=$1 and warehouse_id=$2",
        [line.inventory_item_id, doc.warehouse_id],
      );
      const currentQuantity = String(currentResult.rows[0].quantity || 0);
      const currentValue = String(currentResult.rows[0].value || 0);
      const requested = String(line.quantity);
      let sourceCost: string | null =
        line.input_unit_cost == null
          ? String((await client.query("select case when $1::numeric>0 then $2::numeric/$1::numeric else 0 end cost", [currentQuantity,currentValue])).rows[0].cost)
          : String(line.input_unit_cost);
      const sourceMovementId: string | null = line.source_movement_id || null;
      let cuttingEstimateLineId: string | null = line.cutting_estimate_line_id || null;
      if (doc.document_type === "RETURN_IN") {
        if (!sourceMovementId) throw new Error("Phiếu hoàn vật tư phải chọn dòng xuất gốc.");
        const source = (await client.query(`select m.*,d.production_order_id,d.status document_status from local_inventory_movements m
          join local_inventory_documents d on d.id=m.document_id where m.id=$1 for update`, [sourceMovementId])).rows[0];
        if (!source || source.movement_kind !== "ISSUE" || !(Number(source.quantity_delta) < 0) || source.document_status !== "CONFIRMED") throw new Error("Dòng nguồn phải là biến động xuất kho đã xác nhận.");
        if (String(source.inventory_item_id) !== String(line.inventory_item_id) || String(source.warehouse_id) !== String(doc.warehouse_id)) throw new Error("Vật tư hoặc kho hoàn không khớp dòng xuất gốc.");
        if(String(source.unit)!==String(line.unit||line.base_unit))throw new Error('Đơn vị hoàn phải giữ nguyên đơn vị dòng xuất gốc.');
        if (String(source.production_order_id || "") !== String(doc.production_order_id || "")) throw new Error("Phiếu hoàn phải cùng lệnh sản xuất với phiếu xuất gốc.");
        const returned = (await client.query("select coalesce(sum(quantity_delta),0) quantity from local_inventory_movements where source_movement_id=$1 and quantity_delta>0", [source.id])).rows[0].quantity;
        if ((await client.query("select $1::numeric+$2::numeric>abs($3::numeric) exceeds", [returned,requested,source.quantity_delta])).rows[0].exceeds) throw new Error("Số lượng hoàn vượt số lượng đã xuất gốc.");
        sourceCost = source.unit_cost == null ? null : String(source.unit_cost);
        cuttingEstimateLineId = source.cutting_estimate_line_id || null;
        if (cuttingEstimateLineId) await assertCuttingReturnCoverage(client, cuttingEstimateLineId, requested);
      }
      if (doc.document_type === "ISSUE" && cuttingEstimateLineId) {
        const estimateLine = (await client.query(`select l.*,e.estimate_kind,e.production_batch_id from local_cutting_estimate_lines l join local_cutting_estimates e on e.id=l.estimate_id
          where l.id=$1 and e.id=$2 and l.inventory_item_id=$3 and l.warehouse_id=$4`, [cuttingEstimateLineId,doc.cutting_estimate_id,line.inventory_item_id,doc.warehouse_id])).rows[0];
        if (!estimateLine) throw new Error("Dòng xuất không khớp dự toán cắt đã duyệt.");
        const netIssued = (await client.query("select coalesce(-sum(quantity_delta),0) quantity from local_inventory_movements where cutting_estimate_line_id=$1", [cuttingEstimateLineId])).rows[0].quantity;
        const executableOutput=estimateLine.estimate_kind==='BASE'?await executableEstimateOutput(client,estimateLine.production_batch_id,estimateLine.order_item_id,estimateLine.output_quantity):estimateLine.output_quantity;
        const required=cuttingRequirementForOutput(estimateLine,executableOutput);
        if ((await client.query("select $1::numeric+$2::numeric>$3::numeric exceeds", [netIssued,requested,required])).rows[0].exceeds) throw Object.assign(new Error("Xác nhận phiếu sẽ làm cấp vải vượt nhu cầu còn thực hiện theo dự toán đã duyệt."), { status: 409 });
      }
      const writeMovement = async (
        warehouseId: string,
        kind: string,
        delta: string,
        unitCost: string | null,
        sourceId: string | null = null,
        estimateLineId: string | null = null,
      ) => {
        const availableResult = await client.query(
          "select coalesce(sum(quantity_delta),0)+$3::numeric<0 insufficient from local_inventory_movements where inventory_item_id=$1 and warehouse_id=$2",
          [line.inventory_item_id, warehouseId, delta],
        );
        if (Number(delta) < 0 && availableResult.rows[0].insufficient)
          throw new Error("Số lượng xuất vượt tồn kho.");
        return (await client.query(
          `insert into local_inventory_movements(document_id,inventory_item_id,warehouse_id,movement_kind,quantity_delta,unit,unit_cost,value_delta,transaction_at,source_movement_id,cutting_estimate_line_id,created_by)
          values($1,$2,$3,$4,$5,$6,$7,$5::numeric*$7::numeric,$8,$9,$10,$11) returning *`,
          [
            doc.id,
            line.inventory_item_id,
            warehouseId,
            kind,
            delta,
            line.unit || line.base_unit,
            unitCost,
            doc.transaction_at,
            sourceId,
            estimateLineId,
            currentLocalActor(),
          ],
        )).rows[0];
      };
      if (doc.document_type === "TRANSFER") {
        if (!doc.to_warehouse_id || doc.to_warehouse_id === doc.warehouse_id)
          throw new Error("Phiếu chuyển kho cần kho nhận khác kho xuất.");
        const outbound = await writeMovement(
          doc.warehouse_id,
          "TRANSFER_OUT",
          `-${requested}`,
          sourceCost,
        );
        await writeMovement(
          doc.to_warehouse_id,
          "TRANSFER_IN",
          requested,
          sourceCost,
          outbound.id,
        );
      } else {
        const positive =
          ["RECEIPT", "RETURN_IN", "OPENING_BALANCE"].includes(
            doc.document_type,
          ) ||
          (doc.document_type === "ADJUSTMENT" &&
            line.adjustment_direction === "INCREASE");
        const movementKind =
          doc.document_type === "ADJUSTMENT"
            ? positive
              ? "ADJUSTMENT_IN"
              : "ADJUSTMENT_OUT"
            : doc.document_type;
        await writeMovement(
          doc.warehouse_id,
          movementKind,
          positive ? requested : `-${requested}`,
          sourceCost,
          sourceMovementId,
          cuttingEstimateLineId,
        );
      }
    }
    await client.query(
      "update local_inventory_documents set status='CONFIRMED',confirmed_at=now(),updated_at=now() where id=$1",
      [doc.id],
    );
    await client.query(
      "insert into local_inventory_audit_events(entity_type,entity_id,action,reason) values('inventory_documents',$1,'CONFIRM',$2)",
      [doc.id, req.body.reason || null],
    );
    await client.query("commit");
    res.json({
      id: doc.id,
      document_number: doc.document_number,
      status: "CONFIRMED",
      reused: false,
    });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    sendError(res, error);
  } finally {
    client.release();
  }
});

app.post("/api/inventory/documents/:id/void", async (req, res) => {
  try {
    await requireLocalCapability(pool, ["inventory_void", "inventory_documents"]);
    const { rows } = await pool.query(
      "update local_inventory_documents set status='VOIDED',voided_at=now(),void_reason=$2,updated_at=now() where id=$1 and status='DRAFT' returning id,document_number,status",
      [req.params.id, req.body.reason || null],
    );
    if (!rows[0]) throw new Error("Chỉ có thể hủy phiếu nháp.");
    await pool.query(
      "insert into local_inventory_audit_events(entity_type,entity_id,action,reason) values('inventory_documents',$1,'VOID',$2)",
      [req.params.id, req.body.reason || null],
    );
    res.json({ ...rows[0], reused: false });
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/payroll/workers", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `select w.id,'local-tenant' tenant_id,w.employee_code,w.display_name,w.user_id,
              w.worker_type,null::text primary_cost_center_id,w.is_active,w.location_code,
              w.position_title,coalesce(a.compensation_type,w.employment_type) employment_type,
              w.employment_start_date,w.employment_end_date,w.payroll_status,
              a.id current_assignment_id,coalesce(a.compensation_type,w.employment_type) current_compensation_type,
              g.id current_policy_group_id,g.code current_policy_group_code,
              a.effective_from::text current_effective_from,a.effective_to::text current_effective_to,
              (select count(*)::int from (
                select id from local_worker_compensation_assignments where worker_id=w.id and status='DRAFT'
                union all select id from local_worker_payroll_profiles where worker_id=w.id and status='DRAFT'
              ) pending) payroll_draft_count,
              exists(select 1 from local_worker_payroll_profiles x where x.worker_id=w.id and x.status='APPROVED' and x.effective_from<=current_date and (x.effective_to is null or x.effective_to>=current_date)) has_current_payroll_profile
         from local_workers w
         left join lateral (
           select x.*
             from local_worker_compensation_assignments x
            where x.worker_id=w.id
              and x.status = 'APPROVED'
              and x.effective_from <= current_date
              and (x.effective_to is null or x.effective_to >= current_date)
            order by x.effective_from desc,x.created_at desc
            limit 1
         ) a on true
         left join local_payroll_policy_groups g on g.id=a.payroll_policy_group_id
        ${req.query.includeInactive ? "" : "where w.is_active"}
        order by w.employee_code`,
    );
    res.json(rows);
  } catch (error) {
    sendError(res, error);
  }
});
app.patch("/api/payroll/workers/:id", async (req, res) => {
  const client = await pool.connect();
  try {
    const reason = requireWorkerMasterReason(req.body.reason);
    const patch = workerMasterPatch(req.body);
    const fields = Object.entries(patch);
    if (!fields.length) throw Object.assign(new Error("Không có thông tin cần cập nhật."), {status:422});
    await client.query("begin");
    await lockPayrollSourceShared(client);
    await lockPayrollWorkerConfiguration(client, String(req.params.id));
    const persisted = (await client.query("select * from local_workers where id=$1 for update", [req.params.id])).rows[0];
    if (!persisted) throw Object.assign(new Error("Không tìm thấy nhân sự."), {status:404});
    validateWorkerMaster({...persisted,...patch});
    const values: unknown[] = [req.params.id];
    const setSql = fields.map(([column,value]) => { values.push(value ?? null); return `${column}=$${values.length}`; }).join(",");
    const { rows } = await client.query(
      `update local_workers set ${setSql},updated_at=now(),local_modified_at=now() where id=$1 returning id,'local-tenant' tenant_id,employee_code,display_name,worker_type,is_active,location_code,position_title,employment_type,employment_start_date,employment_end_date,payroll_status`, values);
    await client.query("insert into local_payroll_audit_events(entity_type,entity_id,action,reason,actor_id) values('payroll_workers',$1,'UPDATE',$2,$3)", [req.params.id,reason,currentLocalActor()]);
    await client.query("commit");
    res.json(rows[0]);
  } catch (error) { await client.query("rollback").catch(()=>undefined); sendError(res,error); }
  finally { client.release(); }
});
app.get("/api/payroll/capabilities", async (req, res) => {
  try {
    // Capabilities are always resolved for the authenticated caller. Do not
    // trust a userId query parameter, otherwise a worker could ask for the
    // local-admin capability set and unlock privileged UI actions.
    const userId = localActor(req);
    const roleResult = await pool.query(
      "select role from local_user_roles where user_id=$1 and is_active order by case role when 'admin' then 1 when 'manager' then 2 when 'accountant' then 3 when 'team_leader' then 4 else 5 end limit 1",
      [userId],
    );
    const role = roleResult.rows[0]?.role;
    const { rows } = await pool.query(
      "select permission_type,enabled from local_employee_permissions where user_id=$1 and permission_type = any($2::text[])",
      [userId, payrollPermissions],
    );
    const enabled = new Set<string>(rows.filter(row => row.enabled).map(row => String(row.permission_type)));
    res.json(
      payrollPermissions.map((permission_type) => ({
        permission_type,
        allowed: payrollCapability(role,permission_type,enabled),
        source: payrollCapability(role,permission_type,new Set()) ? 'ROLE' : payrollCapability(role,permission_type,enabled) ? 'DELEGATED' : 'NONE',
        delegable: delegablePayrollPermissions.has(permission_type),
      })),
    );
  } catch (error) {
    sendError(res, error);
  }
});
app.get("/api/payroll/rates", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `select r.*, 'local-tenant' tenant_id from local_worker_rates r ${req.query.workerId ? "where worker_id=$1" : ""} order by effective_from desc`,
      req.query.workerId ? [req.query.workerId] : [],
    );
    res.json(
      rows.map((row) => ({
        ...row,
        hourly_rate:
          row.attendance_method === "HOUR" ? asNumber(row.rate_amount) : null,
        piece_rate:
          row.attendance_method === "OUTPUT" ? asNumber(row.rate_amount) : null,
        monthly_rate:
          row.attendance_method === "DAY" ? asNumber(row.rate_amount) : null,
      })),
    );
  } catch (error) {
    sendError(res, error);
  }
});
app.get("/api/payroll/products", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      select p.id, p.sku, p.name, p.category, p.specifications, p.in_stock,
        p.price_list_id, l.name price_list_name, l.year price_list_year,
        case when p.price_list_id is null and not p.is_snapshot_record then 1
          else count(*) filter (where p.price_list_id is not null or p.is_snapshot_record)
            over (partition by nullif(lower(btrim(p.sku)), '')) end::int sku_match_count,
        case
          when nullif(btrim(p.sku), '') is null then 'MISSING_SKU'
          when p.price_list_id is null and not p.is_snapshot_record then 'UNIQUE_SKU'
          when count(*) filter (where p.price_list_id is not null or p.is_snapshot_record)
            over (partition by nullif(lower(btrim(p.sku)), '')) > 1 then 'AMBIGUOUS_SKU'
          else 'UNIQUE_SKU'
        end mapping_status,
        pr.id current_rate_id, pr.rate current_rate, pr.rate_unit current_rate_unit,
        pr.effective_from current_rate_effective_from, pr.effective_to current_rate_effective_to
      from local_products p
      left join local_price_lists l on l.id=p.price_list_id
      left join lateral (
        select id, rate, rate_unit, effective_from, effective_to
        from local_product_rates
        where product_id=p.id and status='APPROVED'
          and effective_from <= current_date
          and (effective_to is null or effective_to >= current_date)
        order by effective_from desc, created_at desc
        limit 1
      ) pr on true
      where p.is_active=true and coalesce(l.is_active,true)
      order by p.name,p.sku,l.year desc nulls last`);
    res.json(
      rows.map((row) => ({ ...row, current_rate: asNumber(row.current_rate) })),
    );
  } catch (error) {
    sendError(res, error);
  }
});



const payrollAudit = async (
  entityType: string,
  entityId: string,
  action: string,
  reason: unknown,
  queryable: Pick<PoolClient, "query"> = pool,
) => {
  await queryable.query(
    "insert into local_payroll_audit_events(entity_type,entity_id,action,reason,actor_id) values($1,$2,$3,$4,$5)",
    [
      entityType,
      entityId,
      action,
      String(reason || "Thao tác local"),
      currentLocalActor(),
    ],
  );
};
const payrollDate = (value: unknown, label: string) => {
  const date = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new Error(`${label} phải có định dạng YYYY-MM-DD.`);
  return date;
};
const payrollNumber = (value: unknown, label: string) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0)
    throw new Error(`${label} phải là số không âm.`);
  return number;
};
const payrollPieceRateCode = (value: unknown) => {
  const code = String(value ?? "").trim();
  if (!code) throw new Error("Mã công may Excel là bắt buộc. Không dùng SKU CRM để tính lương.");
  if (code.length > 120) throw new Error("Mã công may Excel không được dài quá 120 ký tự.");
  return code;
};

// Nhập liệu hàng loạt từ workbook local. Route này chỉ nhận các dòng đã được
// parse ở trình duyệt, không nhận SQL hay đường dẫn tệp. Mọi mã liên kết đều
// được tra lại ở local SQL bằng ma_nv/ma_sp và các bản ghi mới luôn ở trạng
// thái nháp/chờ duyệt.
const payrollBulkCapabilities: Record<string, string> = {
  NHAN_SU: "payroll_worker_manage",
  NHOM_CHINH_SACH: "payroll_policy_manage",
  PHAN_LOAI_LUONG: "payroll_policy_manage",
  HO_SO_LUONG: "payroll_worker_manage",
  PHAN_CONG_TO: "payroll_worker_manage",
  MUC_LUONG: "payroll_rate_manage",
  BANG_GIA_CONG_MAY: "payroll_rate_manage",
  BHXH: "payroll_insurance_manage",
  TAI_KHOAN_NGAN_HANG: "payroll_bank_manage",
  PHU_CAP_KHAU_TRU: "payroll_worker_manage",
  CHAM_CONG_NGAY: "payroll_worker_manage",
  CHAM_CONG_GIO: "payroll_worker_manage",
  CHAM_SAN_LUONG: "payroll_worker_manage",
  TANG_CA: "payroll_worker_manage",
  TRANG_THAI_NGAY_CONG: "payroll_worker_manage",
  CHOT_NGAY: "payroll_worker_manage",
  KY_LUONG: "payroll_policy_manage",
};
const payrollBulkKnownSheets = new Set(Object.keys(payrollBulkCapabilities));
const payrollBulkEnums: Record<string, Set<string>> = {
  hinh_thuc_luong: new Set(["MONTHLY_MANAGER", "MONTHLY_HELPER", "PIECE_RATE", "HOURLY", "LƯƠNG THÁNG QUẢN LÝ", "LƯƠNG THÁNG PHỤ TRỢ", "LƯƠNG SẢN PHẨM", "THEO GIỜ"]),
  loai_to: new Set(["CUTTER", "SEWER", "IRONING", "QC", "PACKER", "HELPER", "SUPERVISOR", "GENERIC", "CẮT", "MAY", "ỦI", "KIỂM TRA", "ĐÓNG GÓI", "PHỤ TRỢ", "TỔ TRƯỞNG", "KHÁC"]),
  trang_thai_luong: new Set(["ACTIVE", "SUSPENDED", "TERMINATED", "ĐANG LÀM", "TẠM NGƯNG", "ĐÃ NGHỈ"]),
  cong_tru: new Set(["EARNING", "DEDUCTION", "CỘNG", "TRỪ"]),
  loai_tang_ca: new Set(["NORMAL", "SUNDAY", "HOLIDAY", "NGÀY THƯỜNG", "CHỦ NHẬT", "NGÀY LỄ"]),
  trang_thai: new Set(["PRESENT", "ABSENT", "PAID_LEAVE", "UNPAID_LEAVE", "HOLIDAY", "OFF", "CÓ MẶT", "VẮNG", "NGHỈ PHÉP", "NGHỈ KHÔNG LƯƠNG", "NGHỈ LỄ", "NGHỈ ĐỊNH KỲ"]),
  trang_thai_de_nghi: new Set(["OPEN", "EMPLOYEE_CONFIRMED", "LEADER_CONFIRMED", "REOPENED", "MỞ", "NHÂN VIÊN XÁC NHẬN", "TỔ TRƯỞNG XÁC NHẬN", "MỞ LẠI"]),
  don_vi: new Set(["PIECE", "SET", "PRODUCT", "CÁI", "BỘ", "SẢN PHẨM"]),
  loai_khoan: new Set(["MEAL", "SALARY_ADVANCE", "ALLOWANCE", "PENALTY", "TIỀN ĂN", "TẠM ỨNG", "PHỤ CẤP", "PHẠT"]),
};
const payrollBulkValueMaps: Record<string, Record<string, string>> = {
  hinh_thuc_luong: { "LƯƠNG THÁNG QUẢN LÝ": "MONTHLY_MANAGER", "LƯƠNG THÁNG PHỤ TRỢ": "MONTHLY_HELPER", "LƯƠNG SẢN PHẨM": "PIECE_RATE", "THEO GIỜ": "HOURLY" },
  loai_to: { "CẮT": "CUTTER", "MAY": "SEWER", "ỦI": "IRONING", "KIỂM TRA": "QC", "ĐÓNG GÓI": "PACKER", "PHỤ TRỢ": "HELPER", "TỔ TRƯỞNG": "SUPERVISOR", "KHÁC": "GENERIC" },
  trang_thai_luong: { "ĐANG LÀM": "ACTIVE", "TẠM NGƯNG": "SUSPENDED", "ĐÃ NGHỈ": "TERMINATED" },
  cong_tru: { "CỘNG": "EARNING", "TRỪ": "DEDUCTION" },
  loai_tang_ca: { "NGÀY THƯỜNG": "NORMAL", "CHỦ NHẬT": "SUNDAY", "NGÀY LỄ": "HOLIDAY" },
  trang_thai: { "CÓ MẶT": "PRESENT", "VẮNG": "ABSENT", "NGHỈ PHÉP": "PAID_LEAVE", "NGHỈ KHÔNG LƯƠNG": "UNPAID_LEAVE", "NGHỈ LỄ": "HOLIDAY", "NGHỈ ĐỊNH KỲ": "OFF" },
  trang_thai_de_nghi: { "MỞ": "OPEN", "NHÂN VIÊN XÁC NHẬN": "EMPLOYEE_CONFIRMED", "TỔ TRƯỞNG XÁC NHẬN": "LEADER_CONFIRMED", "MỞ LẠI": "REOPENED" },
  don_vi: { "CÁI": "PIECE", "BỘ": "SET", "SẢN PHẨM": "PRODUCT" },
  loai_khoan: { "TIỀN ĂN": "MEAL", "TẠM ỨNG": "SALARY_ADVANCE", "PHỤ CẤP": "ALLOWANCE", "PHẠT": "PENALTY" },
};
const payrollBulkRequired: Record<string, string[]> = {
  NHAN_SU: ["ma_nv", "ho_ten"], NHOM_CHINH_SACH: ["ma_nhom", "ten_nhom"],
  PHAN_LOAI_LUONG: ["ma_nv", "hinh_thuc_luong", "ma_nhom", "tu_ngay", "ly_do"],
  HO_SO_LUONG: ["ma_nv", "tu_ngay", "ly_do"], PHAN_CONG_TO: ["ma_to_truong", "ma_nv", "tu_ngay", "ly_do"],
  MUC_LUONG: ["ma_nv", "hinh_thuc_luong", "so_tien", "tu_ngay", "ly_do"],
  BANG_GIA_CONG_MAY: ["ma_sp", "ten_sp", "don_gia", "tu_ngay", "ly_do"],
  BHXH: ["ma_nv", "so_tien_nv", "tu_ngay", "nguon", "ly_do"],
  TAI_KHOAN_NGAN_HANG: ["ma_nv", "so_tk", "chu_tk", "ngan_hang", "tu_ngay", "ly_do"],
  PHU_CAP_KHAU_TRU: ["ma_nv", "tu_ky", "den_ky", "loai_khoan", "cong_tru", "so_tien", "nguon", "ly_do"],
  CHAM_CONG_NGAY: ["ma_nv", "ngay", "so_cong"], CHAM_CONG_GIO: ["ma_nv", "ngay", "gio_vao", "gio_ra"],
  CHAM_SAN_LUONG: ["ma_nv", "ngay", "ma_sp", "so_luong"], TANG_CA: ["ma_nv", "ngay", "loai_tang_ca", "so_phut", "ly_do"],
  TRANG_THAI_NGAY_CONG: ["ma_nv", "ngay", "trang_thai"], CHOT_NGAY: ["ma_nv", "ngay", "trang_thai_de_nghi", "ly_do"],
  KY_LUONG: ["tu_ky", "den_ky", "so_ngay_chuan"],
};
const payrollBulkDateFields = new Set(["ngay", "tu_ngay", "den_ngay", "ngay_vao", "ngay_nghi", "tu_ky", "den_ky"]);
const payrollBulkFutureSheets = new Set(["CHAM_CONG_NGAY", "CHAM_CONG_GIO", "CHAM_SAN_LUONG", "TANG_CA", "TRANG_THAI_NGAY_CONG", "CHOT_NGAY"]);
const payrollBulkPositiveFields = new Set(["so_tien", "so_tien_nv", "don_gia", "so_cong", "so_luong", "so_phut", "so_ngay_chuan"]);
const payrollBulkNumericFields = new Set([...payrollBulkPositiveFields, "phut_nghi", "phut_chuan_thang", "phu_cap_co_dinh", "khau_tru_co_dinh"]);
const payrollBulkNonNegativeFields = new Set(["phut_nghi", "phut_chuan_thang", "phu_cap_co_dinh", "khau_tru_co_dinh"]);
const payrollBulkBooleanFields = new Set(["dang_lam_viec", "dang_ap_dung", "co_san_luong", "co_tang_ca", "co_tien_an", "co_phu_cap", "co_khau_tru", "co_bhxh", "tk_chinh", "la_uoc_tinh", "huong_tien_an"]);
const bulkText = (value: unknown) => String(value ?? "").trim();
const bulkBool = (value: unknown) => [true, 1, "1", "TRUE", "true", "YES", "yes", "CÓ", "CO", "có"].includes(value as never);
const bulkBoolToken = (value: unknown) => {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  const token = bulkText(value).toUpperCase();
  if (["TRUE", "YES", "1", "CÓ", "CO"].includes(token)) return true;
  if (["FALSE", "NO", "0", "KHÔNG", "KHONG"].includes(token)) return false;
  throw new Error("Giá trị boolean không hợp lệ.");
};
const bulkNormalizedValue = (field: string, value: unknown) => {
  const token = bulkText(value).toUpperCase();
  return payrollBulkValueMaps[field]?.[token] || token;
};
const isValidPayrollDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};
const bulkIdempotency = (sheet: string, row: number, values: Record<string, unknown>, fingerprint: string) =>
  bulkText(values.idempotency_key) || `excel:${fingerprint}:${sheet}:${row}`;
const bulkNaturalKey = (sheet: string, values: Record<string, unknown>) => {
  if (bulkText(values.idempotency_key)) return `${sheet}|${bulkText(values.idempotency_key)}`;
  if (sheet === "BANG_GIA_CONG_MAY") return `${sheet}|${codeKey(values.ma_sp)}|${bulkText(values.tu_ngay)}`;
  const parts: Record<string, string[]> = {
    NHAN_SU: ["ma_nv"], NHOM_CHINH_SACH: ["ma_nhom"], PHAN_LOAI_LUONG: ["ma_nv", "tu_ngay"],
    HO_SO_LUONG: ["ma_nv", "tu_ngay"], PHAN_CONG_TO: ["ma_to_truong", "ma_nv", "tu_ngay"], MUC_LUONG: ["ma_nv", "hinh_thuc_luong", "tu_ngay"],
    BANG_GIA_CONG_MAY: ["ma_sp", "tu_ngay"], BHXH: ["ma_nv", "tu_ngay"], TAI_KHOAN_NGAN_HANG: ["ma_nv", "so_tk", "tu_ngay"],
    PHU_CAP_KHAU_TRU: ["ma_nv", "tu_ky", "den_ky", "loai_khoan"], CHAM_CONG_NGAY: ["ma_nv", "ngay"], CHAM_CONG_GIO: ["ma_nv", "ngay"],
    CHAM_SAN_LUONG: ["ma_nv", "ngay", "ma_sp"], TANG_CA: ["ma_nv", "ngay", "loai_tang_ca"], TRANG_THAI_NGAY_CONG: ["ma_nv", "ngay"],
    CHOT_NGAY: ["ma_nv", "ngay"], KY_LUONG: ["tu_ky", "den_ky"],
  };
  return `${sheet}|${(parts[sheet] || Object.keys(values)).map((key) => bulkText(values[key]).toLowerCase()).join("|")}`;
};
const requirePayrollBulkCapability = async (capability: string, queryable: Pick<PoolClient, "query"> = pool) => {
  const actor = currentLocalActor();
  const roleResult = await queryable.query("select role from local_user_roles where user_id=$1 and is_active order by case role when 'admin' then 1 when 'manager' then 2 when 'accountant' then 3 else 4 end limit 1", [actor]);
  const role = String(roleResult.rows[0]?.role || "");
  const permission = await queryable.query("select permission_type from local_employee_permissions where user_id=$1 and enabled", [actor]);
  if (!payrollCapability(role,capability,new Set(permission.rows.map(row => String(row.permission_type))))) throw Object.assign(new Error(`Tài khoản thiếu quyền ${capability}.`), { status: 403 });
};

type PayrollImportRow = { sheet: string; row: number; values: Record<string, unknown> };
type PayrollClosureSnapshot = { row: number; key: string; worker_id: string; employee_code: string; work_date: string; target_status: string; current_revision: string; source_fingerprint: string; closure_digest: string };
const payrollRealRows = (rows: unknown[]) => rows.filter(item => !["VI_DU", "MẪU", "MAU", "DEMO"].includes(bulkText(((item as Record<string, unknown>)?.values as Record<string, unknown>)?.__example).toUpperCase()));
const payrollClosureDigest = (summary: Awaited<ReturnType<typeof attendanceDaySummary>>) => payloadFingerprint(JSON.parse(JSON.stringify({closure: summary.closure, day_status_reason: summary.day_status_reason, payroll_locked: summary.payroll_locked})) as Record<string,unknown>);
const payrollImportConflict = () => Object.assign(new Error("Nguồn hoặc trạng thái ngày đã thay đổi. Xem trước lại toàn bộ file trước khi xác nhận."), {status:409});
async function assertPayrollClosureReview(client: PoolClient, item: PayrollImportRow, workerId: string) {
  const status = bulkNormalizedValue("trang_thai_de_nghi", item.values.trang_thai_de_nghi);
  const role = String((await client.query("select role from local_user_roles where user_id=$1 and is_active order by case role when 'admin' then 1 when 'manager' then 2 when 'accountant' then 3 else 4 end limit 1", [currentLocalActor()])).rows[0]?.role || '');
  if (role !== currentLocalRole()) throw Object.assign(new Error("Quyền tài khoản đã đổi; vui lòng đăng nhập lại."), {status:403});
  if (!['admin','manager','accountant','team_leader'].includes(role)) throw Object.assign(new Error("Không có quyền xử lý xác nhận ngày."), {status:403});
  assertLocalReviewTarget(status, "DAY_CLOSURE");
  await assertCurrentAttendanceReviewPermission(client, status === 'LEADER_CONFIRMED' || status === 'REOPENED');
  await assertLocalReviewScope(client, workerId, bulkText(item.values.ngay));
  if (status === 'EMPLOYEE_CONFIRMED' && (!['admin','manager'].includes(role) || !bulkText(item.values.ly_do))) throw Object.assign(new Error("Chỉ quản lý được xác nhận hộ và bắt buộc nhập lý do."), {status:403});
  if (status === 'REOPENED' && !bulkText(item.values.ly_do)) throw new Error("Bắt buộc nhập lý do mở lại ngày công.");
}

async function validatePayrollBulkRows(rawRows: unknown[], fingerprint: string) {
  const errors: Array<Record<string, unknown>> = [];
  const warnings: Array<Record<string, unknown>> = [];
  const rows: Array<{ sheet: string; row: number; values: Record<string, unknown> }> = [];
  const seen = new Set<string>();
  const closureDays = new Set<string>();
  const closureKeys = new Set<string>();
  const priceRows: Array<{row:number;value:RateFields}> = [];
  const payrollBulkMaxRows = 10000;
  if (rawRows.length > payrollBulkMaxRows) throw new Error(`File vượt quá giới hạn ${payrollBulkMaxRows.toLocaleString("vi-VN")} dòng.`);
  const workersResult = await pool.query("select id,employee_code from local_workers");
  const workerMap = new Map(workersResult.rows.map((row) => [String(row.employee_code).toLowerCase(), String(row.id)]));
  const existingWorkerCodes = new Set(workersResult.rows.map((row) => String(row.employee_code).toLowerCase()));
  const groupsResult = await pool.query("select id,code from local_payroll_policy_groups");
  const groupMap = new Map(groupsResult.rows.map((row) => [String(row.code).toLowerCase(), String(row.id)]));
  // Resolve same-file dependencies before validating downstream sheets.
  for (const item of rawRows) {
    const source = (item as Record<string, unknown>) || {};
    const sheet = bulkText(source.sheet);
    const values = (source.values || {}) as Record<string, unknown>;
    if (["VI_DU", "MẪU", "MAU", "DEMO"].includes(bulkText(values.__example).toUpperCase())) continue;
    if (sheet === "NHAN_SU" && bulkText(values.ma_nv)) workerMap.set(bulkText(values.ma_nv).toLowerCase(), "pending");
    if (sheet === "NHOM_CHINH_SACH" && bulkText(values.ma_nhom)) groupMap.set(bulkText(values.ma_nhom).toLowerCase(), "pending");
  }
  for (const item of rawRows) {
    const sheet = bulkText((item as Record<string, unknown>)?.sheet);
    const rowNumber = Number((item as Record<string, unknown>)?.row || 0);
    const values = ((item as Record<string, unknown>)?.values || {}) as Record<string, unknown>;
    if (["VI_DU", "MẪU", "MAU", "DEMO"].includes(bulkText(values.__example).toUpperCase())) continue;
    if (!payrollBulkKnownSheets.has(sheet)) { errors.push({ sheet, row: rowNumber, field: "sheet", message: "Sheet không được hỗ trợ." }); continue; }
    const definition = payrollBulkRequired[sheet] || [];
    for (const field of definition) if (!bulkText(values[field]) && values[field] !== 0 && values[field] !== false) errors.push({ sheet, row: rowNumber, field, message: "Trường bắt buộc chưa có dữ liệu." });
    for (const [field, value] of Object.entries(values)) {
      if (sheet === "BANG_GIA_CONG_MAY" && ["ma_sp","ten_sp","don_gia","don_vi","tu_ngay","den_ngay"].includes(field)) continue;
      if (payrollBulkDateFields.has(field) && bulkText(value) && !isValidPayrollDate(bulkText(value))) errors.push({ sheet, row: rowNumber, field, message: "Ngày không hợp lệ, dùng định dạng YYYY-MM-DD." });
      if (payrollBulkNumericFields.has(field) && bulkText(value) && (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(bulkText(value)) || !Number.isFinite(Number(value)))) errors.push({ sheet, row: rowNumber, field, message: "Giá trị phải là số hợp lệ." });
      if (payrollBulkPositiveFields.has(field) && bulkText(value) && Number(value) <= 0) errors.push({ sheet, row: rowNumber, field, message: "Giá trị phải lớn hơn 0." });
      if (payrollBulkNonNegativeFields.has(field) && bulkText(value) && Number(value) < 0) errors.push({ sheet, row: rowNumber, field, message: "Giá trị không được âm." });
      if (payrollBulkBooleanFields.has(field) && bulkText(value) && !["TRUE", "FALSE", "YES", "NO", "1", "0", "CÓ", "KHÔNG", "CO", "KHONG"].includes(bulkText(value).toUpperCase()) && typeof value !== "boolean") errors.push({ sheet, row: rowNumber, field, message: "Giá trị chỉ nhận CÓ/KHÔNG hoặc TRUE/FALSE." });
      if (payrollBulkEnums[field] && bulkText(value) && !payrollBulkEnums[field].has(bulkText(value).toUpperCase())) errors.push({ sheet, row: rowNumber, field, message: `Giá trị ${bulkText(value)} không hợp lệ.` });
    }
    if (sheet === "BANG_GIA_CONG_MAY") {
      try {
        const value = rateFields({code:values.ma_sp,name:values.ten_sp,rate:values.don_gia,unit:values.don_vi,effective_from:values.tu_ngay,effective_to:values.den_ngay});
        for (const previous of priceRows.filter(item=>codeKey(item.value.code)===codeKey(value.code))) {
          if (rateNameKey(previous.value.name)!==rateNameKey(value.name) || previous.value.unit!==value.unit || rateRangesOverlap(previous.value,value)) {
            const message = `Mã công may trùng khoảng hiệu lực hoặc khác tên/đơn vị giữa dòng ${previous.row} và ${rowNumber}; khóa riêng không bỏ qua kiểm tra này.`;
            errors.push({sheet,row:previous.row,field:"ma_sp",message},{sheet,row:rowNumber,field:"ma_sp",message});
          }
        }
        priceRows.push({row:rowNumber,value});
      } catch (error) { errors.push({sheet,row:rowNumber,field:error&&typeof error==='object'&&'field' in error?String(error.field):"don_gia",message:error instanceof Error?error.message:"Dữ liệu đơn giá không hợp lệ."}); }
    }
    const from = bulkText(values.tu_ngay || values.tu_ky || values.ngay);
    const to = bulkText(values.den_ngay || values.den_ky);
    if (from && to && to < from) errors.push({ sheet, row: rowNumber, field: "den_ngay", message: "Ngày kết thúc không được trước ngày bắt đầu." });
    if (payrollBulkFutureSheets.has(sheet) && from > businessDateKey()) errors.push({ sheet, row: rowNumber, field: "ngay", message: "Không được nhập ngày tương lai." });
    if (sheet !== "NHAN_SU" && sheet !== "NHOM_CHINH_SACH" && sheet !== "BANG_GIA_CONG_MAY" && sheet !== "KY_LUONG") {
      const code = bulkText(values.ma_nv).toLowerCase();
      if (code && !workerMap.has(code)) errors.push({ sheet, row: rowNumber, field: "ma_nv", message: `Không tìm thấy nhân sự ${bulkText(values.ma_nv)}.` });
    }
    if (sheet === "PHAN_CONG_TO") {
      const supervisorCode = bulkText(values.ma_to_truong).toLowerCase();
      if (supervisorCode && !workerMap.has(supervisorCode)) errors.push({ sheet, row: rowNumber, field: "ma_to_truong", message: `Không tìm thấy tổ trưởng ${bulkText(values.ma_to_truong)}.` });
    }
    if (sheet === "PHAN_LOAI_LUONG") {
      const groupCode = bulkText(values.ma_nhom).toLowerCase();
      if (groupCode && !groupMap.has(groupCode)) errors.push({ sheet, row: rowNumber, field: "ma_nhom", message: `Không tìm thấy nhóm chính sách ${bulkText(values.ma_nhom)}.` });
    }
    if (sheet === "NHAN_SU" && existingWorkerCodes.has(bulkText(values.ma_nv).toLowerCase())) {
      warnings.push({ sheet, row: rowNumber, field: "ma_nv", message: "Mã nhân viên đã tồn tại; hệ thống sẽ cập nhật các trường có dữ liệu và không tự kích hoạt lại hồ sơ đang ngưng." });
    }
    if (sheet === "CHOT_NGAY") {
      const day = `${workerMap.get(bulkText(values.ma_nv).toLowerCase()) || bulkText(values.ma_nv).toLowerCase()}|${bulkText(values.ngay)}`;
      const actionKey = bulkIdempotency(sheet, rowNumber, values, fingerprint);
      if (closureDays.has(day)) errors.push({sheet,row:rowNumber,field:"ngay",message:"Mỗi nhân sự/ngày chỉ được có một dòng chốt ngày, kể cả khi dùng khóa khác nhau."});
      if (closureKeys.has(actionKey)) errors.push({sheet,row:rowNumber,field:"idempotency_key",message:"Khóa chống nhập trùng của chốt ngày không được dùng cho nhiều dòng."});
      closureDays.add(day); closureKeys.add(actionKey);
    }
    const key = bulkNaturalKey(sheet, values);
    if (seen.has(key)) errors.push({ sheet, row: rowNumber, field: "idempotency_key", message: "Dòng bị trùng khóa trong cùng file." });
    seen.add(key);
    rows.push({ sheet, row: rowNumber, values });
  }
  if (rows.some(item => item.sheet === 'CHOT_NGAY') && rows.some(item => item.sheet !== 'CHOT_NGAY')) {
    for (const item of rows.filter(item => item.sheet === 'CHOT_NGAY')) errors.push({sheet:item.sheet,row:item.row,field:'sheet',message:'File xác nhận/chốt/mở lại ngày chỉ được có dòng CHOT_NGAY. Hãy nhập nguồn và thiết lập riêng, xử lý duyệt rồi xem trước lại file chốt ngày.'});
  }
  return { rows, errors, warnings, workerMap, groupMap, fingerprint };
}
const bulkInvalidRowCount = (errors: Array<Record<string, unknown>>) =>
  new Set(errors.map((error) => `${String(error.sheet)}:${String(error.row)}`)).size;

app.post("/api/payroll/import/preview", async (req, res) => {
  try {
    const rawRows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rawRows.length) throw new Error("File chưa có dòng dữ liệu hợp lệ.");
    const sheets = [...new Set(payrollRealRows(rawRows).map((item: unknown) => bulkText((item as Record<string, unknown>)?.sheet)).filter(Boolean))] as string[];
    for (const sheet of sheets) await requirePayrollBulkCapability(payrollBulkCapabilities[sheet] || "payroll_view");
    if (sheets.includes("BANG_GIA_CONG_MAY")) await assertProductRateAuthoringAuthority(pool,currentLocalActor(),currentLocalRole(),true);
    const fingerprint = payloadFingerprint({ template_key: req.body?.template_key || "payroll-v1", source_name: req.body?.source_name || "excel", rows: payrollRealRows(rawRows) });
    const result = await validatePayrollBulkRows(rawRows, fingerprint);
    const invalidRows = bulkInvalidRowCount(result.errors);
    const review = await withLocalTransaction(async client => {
      const closureRows = result.rows.filter(item => item.sheet === 'CHOT_NGAY');
      if (!closureRows.length || result.errors.length) return {preview_token:null,closure_reviews:[]};
      await lockPayrollSourceShared(client);
      const pairs = closureRows.map(item => ({item,workerId:result.workerMap.get(bulkText(item.values.ma_nv).toLowerCase())!,date:bulkText(item.values.ngay)})).sort((a,b)=>a.workerId.localeCompare(b.workerId)||a.date.localeCompare(b.date));
      for (const pair of pairs) await lockAttendanceDay(client,pair.workerId,pair.date);
      const snapshots: PayrollClosureSnapshot[] = [];
      const reviews = [];
      for (const {item,workerId,date} of pairs) {
        await assertPayrollClosureReview(client,item,workerId);
        const summary = await attendanceDaySummary(client,workerId,date);
        const target = bulkNormalizedValue('trang_thai_de_nghi',item.values.trang_thai_de_nghi);
        snapshots.push({row:item.row,key:bulkIdempotency(item.sheet,item.row,item.values,fingerprint),worker_id:workerId,employee_code:bulkText(item.values.ma_nv),work_date:date,target_status:target,current_revision:summary.current_revision,source_fingerprint:summary.source_fingerprint,closure_digest:payrollClosureDigest(summary)});
        reviews.push({row:item.row,employee_code:bulkText(item.values.ma_nv),target_status:target,reason:bulkText(item.values.ly_do),summary});
      }
      const token = randomBytes(32).toString('hex');
      await client.query("insert into local_payroll_import_previews(token_hash,actor_id,fingerprint,day_snapshots,expires_at) values($1,$2,$3,$4::jsonb,now()+interval '15 minutes')",[createHash('sha256').update(token).digest('hex'),currentLocalActor(),fingerprint,JSON.stringify(snapshots)]);
      return {preview_token:token,closure_reviews:reviews};
    });
    res.json({ ...review, fingerprint, valid_rows: result.rows.length - invalidRows, invalid_rows: invalidRows, errors: result.errors, warnings: result.warnings, rows: result.rows, sheet_count: sheets.length });
  } catch (error) { sendError(res, error); }
});

async function applyPayrollBulkRow(item: { sheet: string; row: number; values: Record<string, unknown> }, fingerprint: string, workerMap: Map<string, string>, groupMap: Map<string, string>, client: PoolClient, priceSources?: RateSource[]) {
  const { sheet, row, values } = item;
  const actor = currentLocalActor();
  const worker = (code: unknown) => workerMap.get(bulkText(code).toLowerCase()) || "";
  const workerId = worker(values.ma_nv);
  const key = bulkIdempotency(sheet, row, values, fingerprint);
  const reason = bulkText(values.ly_do || "Nhập từ workbook local");
  if (sheet === "NHAN_SU") {
    const employeeCode = bulkText(values.ma_nv);
    await client.query("select pg_advisory_xact_lock(hashtextextended('payroll-worker-code:' || $1,0))", [employeeCode]);
    const mapped = (await client.query("select id from local_workers where employee_code=$1",[employeeCode])).rows[0];
    if (mapped) await lockPayrollWorkerConfiguration(client,String(mapped.id));
    const existing = await client.query("select * from local_workers where employee_code=$1 for update", [employeeCode]);
    validateWorkerMaster({ employment_start_date:null,employment_end_date:null,payroll_status:"ACTIVE",...existing.rows[0],
      ...(bulkText(values.ngay_vao) ? {employment_start_date:bulkText(values.ngay_vao)} : {}),
      ...(bulkText(values.ngay_nghi) ? {employment_end_date:bulkText(values.ngay_nghi)} : {}),
      ...(bulkText(values.trang_thai_luong) ? {payroll_status:bulkNormalizedValue("trang_thai_luong", values.trang_thai_luong)} : {}),
    });
    requireWorkerMasterReason(reason);
    const requestedActive = values.dang_lam_viec === undefined ? undefined : bulkBoolToken(values.dang_lam_viec);
    let workerResult;
    if (existing.rows[0]) {
      workerResult = await client.query(`update local_workers set
        display_name=coalesce(nullif($2,''),display_name), worker_type=coalesce(nullif($3,''),worker_type),
        position_title=coalesce(nullif($4,''),position_title), location_code=coalesce(nullif($5,''),location_code),
        employment_type=coalesce(nullif($6,''),employment_type), employment_start_date=coalesce($7,employment_start_date),
        employment_end_date=coalesce($8,employment_end_date), payroll_status=coalesce(nullif($9,''),payroll_status),
        is_active=case when $10::boolean is false then false else is_active end,
        updated_at=now(), local_modified_at=now() where employee_code=$1 returning id`,
        [employeeCode, bulkText(values.ho_ten), bulkNormalizedValue("loai_to", values.loai_to), bulkText(values.chuc_danh) || null, bulkText(values.ma_dia_diem) || null,
          bulkText(values.loai_hop_dong) || null, bulkText(values.ngay_vao) || null, bulkText(values.ngay_nghi) || null,
          bulkNormalizedValue("trang_thai_luong", values.trang_thai_luong), requestedActive === undefined ? true : requestedActive]);
    } else {
      workerResult = await client.query(`insert into local_workers(employee_code,display_name,worker_type,position_title,location_code,employment_type,employment_start_date,employment_end_date,payroll_status,is_active,updated_at,local_modified_at)
        values($1,$2,coalesce(nullif($3,''),'GENERIC'),$4,$5,$6,$7,$8,coalesce(nullif($9,''),'ACTIVE'),$10,now(),now()) returning id`,
        [employeeCode, bulkText(values.ho_ten), bulkNormalizedValue("loai_to", values.loai_to), bulkText(values.chuc_danh) || null, bulkText(values.ma_dia_diem) || null,
          bulkText(values.loai_hop_dong) || null, bulkText(values.ngay_vao) || null, bulkText(values.ngay_nghi) || null,
          bulkNormalizedValue("trang_thai_luong", values.trang_thai_luong), requestedActive === undefined ? true : requestedActive]);
    }
    const workerDbId = String(workerResult.rows[0].id);
    workerMap.set(employeeCode.toLowerCase(), workerDbId);
    await payrollAudit("payroll_workers", workerDbId, existing.rows[0] ? "BULK_UPDATE" : "BULK_CREATE", reason, client);
    return { id: workerDbId, reused: Boolean(existing.rows[0]) };
  }
  if (sheet === "NHOM_CHINH_SACH") {
    const code = bulkText(values.ma_nhom);
    const result = await client.query(`insert into local_payroll_policy_groups(code,name,description,is_active,created_by) values($1,$2,$3,$4,$5) on conflict(code) do update set name=coalesce(nullif(excluded.name,''),local_payroll_policy_groups.name),description=coalesce(excluded.description,local_payroll_policy_groups.description),is_active=excluded.is_active,updated_at=now() returning id`, [code, bulkText(values.ten_nhom), bulkText(values.mo_ta) || null, values.dang_ap_dung === undefined ? true : bulkBoolToken(values.dang_ap_dung), actor]);
    groupMap.set(code.toLowerCase(), String(result.rows[0].id));
    await payrollAudit("payroll_policy_groups", result.rows[0].id, "BULK_UPSERT", reason, client); return { id: result.rows[0].id, reused: false };
  }
  if (sheet === "PHAN_LOAI_LUONG") {
    const result = await client.query(`insert into local_worker_compensation_assignments(worker_id,compensation_type,payroll_policy_group_id,effective_from,effective_to,reason,created_by) values($1,$2,$3,$4,$5,$6,$7) returning id`, [workerId, bulkNormalizedValue("hinh_thuc_luong", values.hinh_thuc_luong), groupMap.get(bulkText(values.ma_nhom).toLowerCase()), bulkText(values.tu_ngay), bulkText(values.den_ngay) || null, reason, actor]);
    await payrollAudit("worker_compensation_assignments", result.rows[0].id, "BULK_CREATE", reason, client); return { id: result.rows[0].id };
  }
  if (sheet === "HO_SO_LUONG") {
    const existing = await client.query("select id from local_worker_payroll_profiles where idempotency_key=$1", [key]);
    if (existing.rows[0]) return { id: existing.rows[0].id, reused: true };
    const result = await client.query(`insert into local_worker_payroll_profiles(worker_id,piece_output_enabled,overtime_enabled,meal_enabled,allowances_enabled,deductions_enabled,insurance_enabled,fixed_allowance_amount,fixed_deduction_amount,effective_from,effective_to,source_reference,reason,idempotency_key,request_hash,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) returning id`, [workerId, bulkBool(values.co_san_luong), bulkBool(values.co_tang_ca), bulkBool(values.co_tien_an), bulkBool(values.co_phu_cap), bulkBool(values.co_khau_tru), bulkBool(values.co_bhxh), Number(values.phu_cap_co_dinh || 0), Number(values.khau_tru_co_dinh || 0), bulkText(values.tu_ngay), bulkText(values.den_ngay) || null, bulkText(values.nguon) || null, reason, key, payloadFingerprint(values), actor]);
    await payrollAudit("worker_payroll_profiles", result.rows[0].id, "BULK_CREATE", reason, client); return { id: result.rows[0].id };
  }
  if (sheet === "PHAN_CONG_TO") {
    const result = await client.query(`insert into local_payroll_team_assignments(supervisor_worker_id,worker_id,effective_from,effective_to,reason,created_by) values($1,$2,$3,$4,$5,$6) returning id`, [worker(values.ma_to_truong), workerId, bulkText(values.tu_ngay), bulkText(values.den_ngay) || null, reason, actor]);
    await payrollAudit("payroll_team_assignments", result.rows[0].id, "BULK_CREATE", reason, client); return { id: result.rows[0].id };
  }
  if (sheet === "MUC_LUONG") {
    const type = bulkNormalizedValue("hinh_thuc_luong", values.hinh_thuc_luong); const method = type === "HOURLY" ? "HOUR" : "DAY";
    const result = await client.query(`insert into local_worker_rates(worker_id,compensation_type,attendance_method,rate_amount,effective_from,effective_to,monthly_productive_minutes,unit_basis,source_reference,reason,is_estimated,status,local_modified_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'DRAFT',now()) returning id`, [workerId, type, method, Number(values.so_tien), bulkText(values.tu_ngay), bulkText(values.den_ngay) || null, values.phut_chuan_thang ? Math.trunc(Number(values.phut_chuan_thang)) : null, method === "HOUR" ? "HOUR" : "DAY", bulkText(values.nguon) || null, reason, bulkBool(values.la_uoc_tinh)]);
    await payrollAudit("worker_rates", result.rows[0].id, "BULK_CREATE", reason, client); return { id: result.rows[0].id };
  }
  if (sheet === "BANG_GIA_CONG_MAY") {
    const value = rateFields({code:values.ma_sp,name:values.ten_sp,rate:values.don_gia,unit:values.don_vi,effective_from:values.tu_ngay,effective_to:values.den_ngay});
    if (!priceSources) throw new Error("Thiếu nguồn đơn giá trong giao dịch nhập.");
    assertRateInsertAllowed(priceSources,value,codeKey,{draft:true});
    const result = await client.query(`insert into local_product_rates(product_id,piece_rate_code,piece_rate_name,rate,rate_unit,effective_from,effective_to,status,reason,source_reference,local_modified_at) values(null,$1,$2,$3::numeric,$4,$5,$6,'DRAFT',$7,$8,now()) returning id`, [value.code,value.name,value.rate,value.unit,value.effective_from,value.effective_to,reason,bulkText(values.nguon)||null]);
    priceSources.push({id:result.rows[0].id,product_id:null,piece_rate_code:value.code,piece_rate_name:value.name,rate_exact:value.rate,rate_unit:value.unit,effective_from:value.effective_from,effective_to:value.effective_to,status:'DRAFT',source_reference:bulkText(values.nguon)||null});
    await payrollAudit("product_rates", result.rows[0].id, "BULK_CREATE", reason, client); return { id: result.rows[0].id, piece_rate_code: value.code };
  }
  if (sheet === "BHXH") {
    const result = await client.query(`insert into local_social_insurance_versions(worker_id,employee_amount,effective_from,effective_to,source_reference,reason,created_by) values($1,$2,$3,$4,$5,$6,$7) returning id`, [workerId, Number(values.so_tien_nv), bulkText(values.tu_ngay), bulkText(values.den_ngay) || null, bulkText(values.nguon), reason, actor]);
    await payrollAudit("social_insurance_versions", result.rows[0].id, "BULK_CREATE", reason, client); return { id: result.rows[0].id };
  }
  if (sheet === "TAI_KHOAN_NGAN_HANG") {
    const result = await client.query(`insert into local_payroll_bank_accounts(worker_id,account_number,account_name,bank_code,bank_name,is_primary,effective_from,effective_to,source_reference,reason,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`, [workerId, bulkText(values.so_tk), bulkText(values.chu_tk), bulkText(values.ma_nh) || null, bulkText(values.ngan_hang), values.tk_chinh === undefined ? true : bulkBool(values.tk_chinh), bulkText(values.tu_ngay), bulkText(values.den_ngay) || null, bulkText(values.nguon) || null, reason, actor]);
    await payrollAudit("bank_accounts", result.rows[0].id, "BULK_CREATE", reason, client); return { id: result.rows[0].id };
  }
  if (sheet === "PHU_CAP_KHAU_TRU") {
    await client.query("select pg_advisory_xact_lock(hashtextextended('payroll-adjustment:' || $1,0))", [key]);
    const period = await payrollAdjustmentPeriod(bulkText(values.tu_ky), bulkText(values.den_ky), values.so_ngay_chuan || 26, client);
    if (period.status === "CLOSED") throw Object.assign(new Error("Kỳ lương đã đóng, không thể nhập phụ cấp/khấu trừ."),{status:409});
    const requestHash = payloadFingerprint(values);
    const existing = await client.query("select id,request_hash from local_payroll_adjustments where idempotency_key=$1 for update", [key]);
    if (existing.rows[0]) {
      if (existing.rows[0].request_hash && existing.rows[0].request_hash !== requestHash) throw idempotencyConflict(key);
      return { id: existing.rows[0].id, reused: true };
    }
    const result = await client.query(`insert into local_payroll_adjustments(worker_id,period_id,item_type,item_direction,amount,reason,source_reference,idempotency_key,request_hash,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`, [workerId, period.id, bulkNormalizedValue("loai_khoan", values.loai_khoan), bulkNormalizedValue("cong_tru", values.cong_tru), Number(values.so_tien), reason, bulkText(values.nguon), key, requestHash, actor]);
    await payrollAudit("payroll_adjustments", result.rows[0].id, "BULK_CREATE", reason, client);
    return { id: result.rows[0].id, reused: false };
  }
  if (sheet === "CHAM_CONG_NGAY") return createAttendance({ worker_id: workerId, attendance_method: "DAY", work_date: bulkText(values.ngay), day_units: Number(values.so_cong), activity_name: bulkText(values.cong_viec) || null, notes: bulkText(values.ghi_chu) || null, idempotency_key: key }, false, client);
  if (sheet === "CHAM_CONG_GIO") return createAttendance({ worker_id: workerId, attendance_method: "HOUR", work_date: bulkText(values.ngay), check_in_time: bulkText(values.gio_vao), check_out_time: bulkText(values.gio_ra), break_minutes: Number(values.phut_nghi || 0), activity_name: bulkText(values.cong_viec) || null, notes: bulkText(values.ghi_chu) || null, idempotency_key: key }, false, client);
  if (sheet === "CHAM_SAN_LUONG") return createProductionEntry({ worker_id: workerId, piece_rate_code: bulkText(values.ma_sp), work_date: bulkText(values.ngay), quantity: Number(values.so_luong), notes: bulkText(values.ghi_chu) || null, standalone_reason:bulkText(values.ghi_chu)||null,work_kind:['srem','srem1h'].includes(bulkText(values.ma_sp).trim().toLowerCase())?'CURTAIN_REPAIR':null,idempotency_key: key }, undefined, client);
  if (sheet === "TANG_CA") return createOvertime({ worker_id: workerId, work_date: bulkText(values.ngay), overtime_type: bulkNormalizedValue("loai_tang_ca", values.loai_tang_ca), overtime_minutes: Number(values.so_phut), reason, idempotency_key: key }, undefined, client);
  if (sheet === "TRANG_THAI_NGAY_CONG") {
    const date = bulkText(values.ngay), status = bulkNormalizedValue("trang_thai", values.trang_thai), fingerprintValue = payloadFingerprint(values), mealEligible = values.huong_tien_an === undefined ? false : bulkBoolToken(values.huong_tien_an);
    await lockAttendanceIdempotency(client, "DAY_STATUS", key);
    const keyed = await client.query("select id,idempotency_fingerprint,status from local_day_statuses where idempotency_key=$1 for update", [key]);
    if (keyed.rows[0]) {
      await assertIdempotencyReplayActor(client, key, "DAY_STATUS", String(keyed.rows[0].id));
      if (keyed.rows[0].idempotency_fingerprint && keyed.rows[0].idempotency_fingerprint !== fingerprintValue) throw idempotencyConflict(key);
      return { id: keyed.rows[0].id, status: keyed.rows[0].status, reused: true };
    }
    await lockAttendanceDay(client, workerId, date);
    await assertLocalReviewScope(client, workerId, date);
    const previous = await client.query("select id,status from local_day_statuses where worker_id=$1 and work_date=$2::date for update", [workerId, date]);
    await assertWorkflowWritable(client, workerId, date, "SUBMITTED");
    await assertDayStatusCompatibleWithWork(client, workerId, date, status);
    const result = await client.query(`insert into local_day_statuses(worker_id,work_date,status,meal_eligible,reason,idempotency_key,idempotency_fingerprint) values($1,$2,$3,$4,$5,$6,$7) on conflict(worker_id,work_date) do update set status=excluded.status,meal_eligible=excluded.meal_eligible,reason=excluded.reason,idempotency_key=excluded.idempotency_key,idempotency_fingerprint=excluded.idempotency_fingerprint returning id,status`, [workerId, date, status, mealEligible, bulkText(values.ly_do) || null, key, fingerprintValue]);
    await recordWorkflowEvent(client, "DAY_STATUS", String(result.rows[0].id), "UPSERT", previous.rows[0]?.status || null, status, bulkText(values.ly_do) || null, key, fingerprintValue);
    return { id: result.rows[0].id, status: result.rows[0].status, reused: false };
  }
  if (sheet === "CHOT_NGAY") {
    const date = bulkText(values.ngay), status = bulkNormalizedValue("trang_thai_de_nghi", values.trang_thai_de_nghi), fingerprintValue = payloadFingerprint(values);
    const closureReason = bulkText(values.ly_do);
    await assertPayrollClosureReview(client,item,workerId);
    // The caller already holds all closure-key and day locks for the whole file.
    const keyed = await client.query("select id,worker_id,work_date::text,idempotency_fingerprint,status from local_day_closures where idempotency_key=$1", [key]);
    if (keyed.rows[0]) {
      await assertIdempotencyReplayActor(client,key,'DAY_CLOSURE',String(keyed.rows[0].id));
      if (String(keyed.rows[0].worker_id)!==workerId || String(keyed.rows[0].work_date)!==date || keyed.rows[0].idempotency_fingerprint !== fingerprintValue) throw idempotencyConflict(key);
      return {id:keyed.rows[0].id,worker_id:workerId,work_date:date,status:keyed.rows[0].status,reused:true};
    }
    const replay = await workflowReplay(client,key,'DAY_CLOSURE');
    if (replay) {
      assertWorkflowReplayMatches(replay,key,{entityId:String(replay.entity_id),action:'STATUS',toStatus:status,reason:closureReason,fingerprint:fingerprintValue});
      const source = (await client.query('select worker_id,work_date::text from local_day_closures where id=$1',[replay.entity_id])).rows[0];
      if (!source || String(source.worker_id)!==workerId || String(source.work_date)!==date) throw idempotencyConflict(key);
      return {id:replay.entity_id,worker_id:workerId,work_date:date,status:replay.to_status,reused:true};
    }
    const summary = await attendanceDaySummary(client,workerId,date);
    const currentStatus = String(summary.closure?.status || 'OPEN');
    await assertWorkflowWritable(client,workerId,date,currentStatus,{allowLeaderReopen:status==='REOPENED'});
    const transitions: Record<string,string[]> = {OPEN:['EMPLOYEE_CONFIRMED'],EMPLOYEE_CONFIRMED:['LEADER_CONFIRMED','OPEN'],LEADER_CONFIRMED:['REOPENED'],REOPENED:['EMPLOYEE_CONFIRMED','OPEN']};
    if (currentStatus!==status && !transitions[currentStatus]?.includes(status)) throw new Error(`Không thể chuyển trạng thái khóa ngày từ ${currentStatus} sang ${status}.`);
    if (['EMPLOYEE_CONFIRMED','LEADER_CONFIRMED'].includes(status) && !summary.classified) throw new Error('Ngày chưa có nguồn hoặc trạng thái để xác nhận.');
    if (status==='LEADER_CONFIRMED' && (currentStatus!=='EMPLOYEE_CONFIRMED' || !summary.confirmation_current || summary.sources.some(source=>source.status==='SUBMITTED'))) throw Object.assign(new Error('Cần xác nhận hiện hành và duyệt hết công, sản lượng, tăng ca trước khi chốt.'),{status:409});
    const revision = ['EMPLOYEE_CONFIRMED','LEADER_CONFIRMED'].includes(status) ? summary.current_revision : null;
    const result = status === 'LEADER_CONFIRMED'
      ? await client.query(`update local_day_closures set status=$3,reason=$4,idempotency_key=$5,idempotency_fingerprint=$6,confirmed_revision=$7 where worker_id=$1 and work_date=$2::date and status='EMPLOYEE_CONFIRMED' returning id,status`,
        [workerId,date,status,closureReason||null,key,fingerprintValue,revision])
      : await client.query(`insert into local_day_closures(worker_id,work_date,status,reason,idempotency_key,idempotency_fingerprint,confirmed_revision,confirmation_actor_id,confirmation_kind,confirmation_reason,confirmed_at)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,case when $3='EMPLOYEE_CONFIRMED' then now() else null end)
      on conflict(worker_id,work_date) do update set status=excluded.status,reason=excluded.reason,idempotency_key=excluded.idempotency_key,idempotency_fingerprint=excluded.idempotency_fingerprint,confirmed_revision=excluded.confirmed_revision,
      confirmation_actor_id=case when excluded.status='EMPLOYEE_CONFIRMED' then excluded.confirmation_actor_id else local_day_closures.confirmation_actor_id end,
      confirmation_kind=case when excluded.status='EMPLOYEE_CONFIRMED' then 'PROXY' else local_day_closures.confirmation_kind end,
      confirmation_reason=case when excluded.status='EMPLOYEE_CONFIRMED' then excluded.confirmation_reason else local_day_closures.confirmation_reason end,
      confirmed_at=case when excluded.status='EMPLOYEE_CONFIRMED' then now() else local_day_closures.confirmed_at end returning id,status`,
      [workerId,date,status,closureReason||null,key,fingerprintValue,revision,status==='EMPLOYEE_CONFIRMED'?actor:null,status==='EMPLOYEE_CONFIRMED'?'PROXY':null,status==='EMPLOYEE_CONFIRMED'?closureReason:null]);
    if (!result.rows[0]) throw Object.assign(new Error('Cần xác nhận hiện hành trước khi chốt ngày.'),{status:409});
    await recordWorkflowEvent(client,'DAY_CLOSURE',String(result.rows[0].id),'STATUS',currentStatus,status,closureReason||null,key,fingerprintValue);
    return {id:result.rows[0].id,worker_id:workerId,work_date:date,status:result.rows[0].status,reused:false};
  }
  if (sheet === "KY_LUONG") {
    const start = bulkText(values.tu_ky), end = bulkText(values.den_ky), standardDays = Number(values.so_ngay_chuan);
    const existing = await client.query("select * from local_payroll_periods where period_start=$1::date and period_end=$2::date for update", [start, end]);
    const period = existing.rows[0] || await payrollAdjustmentPeriod(start, end, standardDays, client);
    if (period.status === "CLOSED") throw new Error("Kỳ lương đã đóng, không thể cập nhật.");
    if (Number(period.standard_days) !== standardDays) throw new Error("Số ngày công chuẩn không khớp kỳ lương hiện có.");
    await payrollAudit("payroll_periods", period.id, existing.rows[0] ? "BULK_REUSE" : "BULK_CREATE", reason, client);
    return { id: period.id, reused: Boolean(existing.rows[0]) };
  }
  throw new Error(`Sheet ${sheet} chưa có trình xử lý.`);
}

app.post("/api/payroll/import/apply", async (req, res) => {
  try {
    const rawRows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    const fingerprint = String(req.body?.fingerprint || "");
    if (!rawRows.length || !fingerprint) throw new Error("Thiếu bản xem trước hợp lệ.");
    const expected = payloadFingerprint({ template_key: req.body?.template_key || "payroll-v1", source_name: req.body?.source_name || "excel", rows: payrollRealRows(rawRows) });
    if (expected !== fingerprint) throw new Error("File đã thay đổi sau khi xem trước, hãy tải lại và kiểm tra lại.");
    const sheets = [...new Set(payrollRealRows(rawRows).map((item: unknown) => bulkText((item as Record<string, unknown>)?.sheet)).filter(Boolean))] as string[];
    for (const sheet of sheets) await requirePayrollBulkCapability(payrollBulkCapabilities[sheet] || "payroll_view");
    const check = await validatePayrollBulkRows(rawRows, fingerprint);
    if (check.errors.length) return res.status(400).json({ message: "Còn dòng lỗi, chưa thể nhập.", errors: check.errors, valid_rows: check.rows.length - bulkInvalidRowCount(check.errors) });
    const actor = currentLocalActor();
    const templateKey = String(req.body?.template_key || "payroll-v1");
    const sourceName = String(req.body?.source_name || "excel");
    const importResult = await withLocalTransaction(async (client) => {
      // Workbook imports can create or update employees. Acquire the shared
      // payroll-source lock before the NHAN_SU handler takes worker row locks.
      await lockPayrollSourceShared(client);
      if (sheets.includes("BANG_GIA_CONG_MAY")) {
        await client.query("select pg_advisory_xact_lock(hashtextextended('payroll-product-rate-config',0))");
      } else if (sheets.includes("CHAM_SAN_LUONG")) {
        // Consumption-only workbooks must take the same configuration lock
        // before their import/day/request locks, never inside a later entry.
        await lockProductRateConfigShared(client);
      }
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))",[`payroll-import:${actor}:${fingerprint}`]);
      for (const sheet of sheets) await requirePayrollBulkCapability(payrollBulkCapabilities[sheet] || 'payroll_view',client);
      if (sheets.includes("BANG_GIA_CONG_MAY")) await assertProductRateAuthoringAuthority(client,currentLocalActor(),currentLocalRole(),true);
      const closureRows = check.rows.filter(item=>item.sheet==='CHOT_NGAY');
      const existing = await client.query(
        "select id,status,result from local_payroll_import_batches where actor_id=$1 and fingerprint=$2 for update",
        [actor, fingerprint],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].status === "COMMITTED" && existing.rows[0].result) {
          const saved = existing.rows[0].result as Record<string,unknown>;
          const scope = (saved.review_scope || []) as Array<{row:number;worker_id:string}>;
          for (const item of closureRows) {
            const workerId = scope.find(snapshot=>snapshot.row===item.row)?.worker_id || check.workerMap.get(bulkText(item.values.ma_nv).toLowerCase()) || '';
            await assertPayrollClosureReview(client,item,workerId);
          }
          return { ...saved, reused: true };
        }
        throw new Error("File này đang được xử lý hoặc chưa hoàn tất. Hãy kiểm tra lại trước khi nhập lại.");
      }
      let closureSnapshots: PayrollClosureSnapshot[] = [];
      if (closureRows.length) {
        const token = bulkText(req.body.preview_token);
        if (!/^[a-f0-9]{64}$/.test(token)) throw Object.assign(new Error('Thiếu bản xem trước toàn ngày hợp lệ; hãy xem trước lại file.'),{status:409});
        const metadata = (await client.query("select *,expires_at>now() unexpired from local_payroll_import_previews where token_hash=$1 and actor_id=$2 and fingerprint=$3",[createHash('sha256').update(token).digest('hex'),actor,fingerprint])).rows[0];
        if (!metadata?.unexpired) throw Object.assign(new Error('Bản xem trước không hợp lệ hoặc đã hết hạn; hãy xem trước lại file.'),{status:409});
        closureSnapshots = metadata.day_snapshots as PayrollClosureSnapshot[];
        if (closureSnapshots.length!==closureRows.length) throw payrollImportConflict();
        for (const key of [...new Set(closureRows.map(item=>bulkIdempotency(item.sheet,item.row,item.values,fingerprint)))].sort()) await lockAttendanceIdempotency(client,'DAY_CLOSURE',key);
        const pairs = closureRows.map(item=>({item,workerId:check.workerMap.get(bulkText(item.values.ma_nv).toLowerCase())!,date:bulkText(item.values.ngay)})).sort((a,b)=>a.workerId.localeCompare(b.workerId)||a.date.localeCompare(b.date));
        for (const {workerId,date} of pairs) await lockAttendanceDay(client,workerId,date);
        // Recheck every row before allowing the first write in this transaction.
        for (const {item,workerId,date} of pairs) {
          await assertPayrollClosureReview(client,item,workerId);
          const mapped = (await client.query('select id from local_workers where lower(employee_code)=lower($1) for share',[bulkText(item.values.ma_nv)])).rows;
          if (mapped.length!==1 || String(mapped[0].id)!==workerId) throw payrollImportConflict();
          const snapshot = closureSnapshots.find(value=>value.row===item.row);
          const summary = await attendanceDaySummary(client,workerId,date);
          if (!snapshot || snapshot.worker_id!==workerId || snapshot.work_date!==date || snapshot.target_status!==bulkNormalizedValue('trang_thai_de_nghi',item.values.trang_thai_de_nghi)
            || snapshot.key!==bulkIdempotency(item.sheet,item.row,item.values,fingerprint) || snapshot.current_revision!==summary.current_revision
            || snapshot.source_fingerprint!==summary.source_fingerprint || snapshot.closure_digest!==payrollClosureDigest(summary)) throw payrollImportConflict();
        }
      }
      await client.query(
        `insert into local_payroll_import_batches(actor_id,fingerprint,template_key,source_name,row_count,status)
         values($1,$2,$3,$4,$5,'PROCESSING')`,
        [actor, fingerprint, templateKey, sourceName, check.rows.length],
      );
      const employeeCodes = [...new Set(check.rows.filter(item=>item.sheet==='NHAN_SU').map(item=>bulkText(item.values.ma_nv)))].sort();
      for(const code of employeeCodes) await client.query("select pg_advisory_xact_lock(hashtextextended('payroll-worker-code:' || $1,0))",[code]);
      if(employeeCodes.length) {
        const employeeIds=(await client.query("select id from local_workers where employee_code=any($1::text[]) order by id",[employeeCodes])).rows;
        for(const row of employeeIds) await lockPayrollWorkerConfiguration(client,String(row.id));
      }
      const dependencyOrder = [
        "NHAN_SU", "NHOM_CHINH_SACH", "PHAN_LOAI_LUONG", "HO_SO_LUONG", "PHAN_CONG_TO",
        "MUC_LUONG", "BANG_GIA_CONG_MAY", "BHXH", "TAI_KHOAN_NGAN_HANG", "PHU_CAP_KHAU_TRU",
        "CHAM_CONG_NGAY", "CHAM_CONG_GIO", "CHAM_SAN_LUONG", "TANG_CA", "TRANG_THAI_NGAY_CONG",
        "CHOT_NGAY", "KY_LUONG",
      ];
      const rank = new Map(dependencyOrder.map((sheet, index) => [sheet, index]));
      const orderedRows = [...check.rows].sort((a, b) => (rank.get(a.sheet) ?? 999) - (rank.get(b.sheet) ?? 999) || a.row - b.row);
      const results: Array<Record<string, unknown>> = [];
      const priceSources: RateSource[] | undefined = sheets.includes("BANG_GIA_CONG_MAY") ? (await client.query("select id,product_id,piece_rate_code,piece_rate_name,rate::text rate_exact,rate_unit,effective_from::text,effective_to::text,status,source_reference,source_row from local_product_rates order by id for update")).rows : undefined;
      for (const item of orderedRows) {
        results.push({ sheet: item.sheet, row: item.row, ...(await applyPayrollBulkRow(item, fingerprint, check.workerMap, check.groupMap, client, priceSources)) });
      }
      const result = { ok: true, imported: results.length, results, status: "DRAFT_OR_SUBMITTED", ...(closureRows.length ? {review_scope:closureSnapshots.map(snapshot=>({row:snapshot.row,worker_id:snapshot.worker_id}))} : {}) };
      await client.query(
        "update local_payroll_import_batches set status='COMMITTED',result=$3::jsonb,updated_at=now() where actor_id=$1 and fingerprint=$2",
        [actor, fingerprint, JSON.stringify(result)],
      );
      return result;
    });
    res.json(importResult);
  } catch (error) { sendError(res, error); }
});

app.get("/api/payroll/team-assignments", async (req, res) => {
  try {
    const values: unknown[] = [];
    const clauses: string[] = [];
    for (const [key, column] of [
      ["supervisorWorkerId", "supervisor_worker_id"],
      ["workerId", "worker_id"],
    ] as const)
      if (req.query[key]) {
        values.push(String(req.query[key]));
        clauses.push(`${column}=$${values.length}`);
      }
    if (req.query.onDate) {
      values.push(String(req.query.onDate));
      clauses.push(
        `effective_from <= $${values.length}::date and (effective_to is null or effective_to >= $${values.length}::date)`,
      );
    }
    const { rows } = await pool.query(
      `select id,'local-tenant' tenant_id,supervisor_worker_id,worker_id,effective_from,effective_to,status,reason,created_by,retired_by,created_at,updated_at,retired_at from local_payroll_team_assignments ${clauses.length ? `where ${clauses.join(" and ")}` : ""} order by effective_from desc,created_at desc`,
      values,
    );
    res.json(rows);
  } catch (error) {
    sendError(res, error);
  }
});
app.post("/api/payroll/team-assignments", async (req, res) => {
  try {
    const supervisor = String(req.body.supervisor_worker_id || "");
    const worker = String(req.body.worker_id || "");
    if (!supervisor || !worker || supervisor === worker)
      throw new Error(
        "Tổ trưởng và nhân sự phải hợp lệ và không được trùng nhau.",
      );
    const from = payrollDate(req.body.effective_from, "Ngày bắt đầu");
    const to = req.body.effective_to
      ? payrollDate(req.body.effective_to, "Ngày kết thúc")
      : null;
    const reason = String(req.body.reason || "").trim();
    if (!reason) throw new Error("Lý do phân công là bắt buộc.");
    const existing = await pool.query(
      `select * from local_payroll_team_assignments where supervisor_worker_id=$1 and worker_id=$2 and effective_from=$3 and status='ACTIVE' limit 1`,
      [supervisor, worker, from],
    );
    if (existing.rows[0])
      return res.json({
        ...existing.rows[0],
        tenant_id: "local-tenant",
        reused: true,
      });
    const { rows } = await pool.query(
      `insert into local_payroll_team_assignments(supervisor_worker_id,worker_id,effective_from,effective_to,reason,created_by) values($1,$2,$3,$4,$5,$6) returning *`,
      [supervisor, worker, from, to, reason, currentLocalActor()],
    );
    await payrollAudit(
      "payroll_team_assignments",
      rows[0].id,
      "CREATE",
      reason,
    );
    res
      .status(201)
      .json({ ...rows[0], tenant_id: "local-tenant", reused: false });
  } catch (error) {
    sendError(res, error);
  }
});
app.post("/api/payroll/team-assignments/:id/retire", async (req, res) => {
  try {
    const to = payrollDate(req.body.effective_to, "Ngày kết thúc");
    const reason = String(req.body.reason || "").trim();
    if (!reason) throw new Error("Lý do kết thúc phân công là bắt buộc.");
    const { rows } = await pool.query(
      `update local_payroll_team_assignments set status='RETIRED',effective_to=$2,retired_at=now(),retired_by=$3,updated_at=now() where id=$1 and status='ACTIVE' returning *`,
      [req.params.id, to, currentLocalActor()],
    );
    if (!rows[0]) throw new Error("Không tìm thấy phân công đang hoạt động.");
    await payrollAudit(
      "payroll_team_assignments",
      req.params.id,
      "RETIRE",
      reason,
    );
    res.json({ ...rows[0], tenant_id: "local-tenant" });
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/payroll/policy-groups", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "select id,'local-tenant' tenant_id,code,name,description,is_active,created_by,created_at,updated_at from local_payroll_policy_groups order by code",
    );
    res.json(rows);
  } catch (error) {
    sendError(res, error);
  }
});
app.post("/api/payroll/policy-groups", async (req, res) => {
  try {
    const code = String(req.body.code || "")
      .trim()
      .toUpperCase();
    const name = String(req.body.name || "").trim();
    const reason = String(req.body.reason || "").trim();
    if (!code || !name || !reason)
      throw new Error("Mã, tên nhóm và lý do là bắt buộc.");
    const { rows } = await pool.query(
      `insert into local_payroll_policy_groups(code,name,description,is_active,created_by) values($1,$2,$3,$4,$5)
      on conflict(code) do update set name=excluded.name,description=excluded.description,is_active=excluded.is_active,updated_at=now()
      returning id,'local-tenant' tenant_id,code,name,description,is_active,created_by,created_at,updated_at`,
      [
        code,
        name,
        req.body.description || null,
        req.body.is_active ?? true,
        currentLocalActor(),
      ],
    );
    await payrollAudit("payroll_policy_groups", rows[0].id, "UPSERT", reason);
    res.json(rows[0]);
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/payroll/compensation-assignments", async (req, res) => {
  try {
    const values = req.query.workerId ? [String(req.query.workerId)] : [];
    const { rows } = await pool.query(
      `select id,'local-tenant' tenant_id,worker_id,compensation_type,payroll_policy_group_id,effective_from,effective_to,status,reason,created_by,approved_by,created_at,updated_at,approved_at from local_worker_compensation_assignments ${values.length ? "where worker_id=$1" : ""} order by effective_from desc,created_at desc`,
      values,
    );
    res.json(rows);
  } catch (error) {
    sendError(res, error);
  }
});
app.post("/api/payroll/compensation-assignments", async (req, res) => {
  try {
    const worker = String(req.body.worker_id || "");
    const type = String(req.body.compensation_type || "");
    const group = String(req.body.payroll_policy_group_id || "");
    const from = payrollDate(req.body.effective_from, "Ngày bắt đầu");
    const reason = String(req.body.reason || "").trim();
    if (!worker || !group || !type || !reason)
      throw new Error(
        "Nhân sự, loại lương, nhóm chính sách và lý do là bắt buộc.",
      );
    const { rows } = await pool.query(
      `insert into local_worker_compensation_assignments(worker_id,compensation_type,payroll_policy_group_id,effective_from,effective_to,reason,created_by) values($1,$2,$3,$4,$5,$6,$7) returning *`,
      [
        worker,
        type,
        group,
        from,
        req.body.effective_to
          ? payrollDate(req.body.effective_to, "Ngày kết thúc")
          : null,
        reason,
        currentLocalActor(),
      ],
    );
    await payrollAudit(
      "worker_compensation_assignments",
      rows[0].id,
      "CREATE",
      reason,
    );
    res.status(201).json({ ...rows[0], tenant_id: "local-tenant" });
  } catch (error) {
    sendError(res, error);
  }
});
app.patch("/api/payroll/compensation-assignments/:id", async (req, res) => {
  try {
    const from = payrollDate(req.body.effective_from, "Ngày bắt đầu");
    const reason = String(req.body.reason || "").trim();
    if (!reason) throw new Error("Lý do cập nhật là bắt buộc.");
    const { rows } = await pool.query(
      `update local_worker_compensation_assignments set compensation_type=$2,payroll_policy_group_id=$3,effective_from=$4,effective_to=$5,reason=$6,updated_at=now() where id=$1 and status='DRAFT' returning *`,
      [
        req.params.id,
        req.body.compensation_type,
        req.body.payroll_policy_group_id,
        from,
        req.body.effective_to
          ? payrollDate(req.body.effective_to, "Ngày kết thúc")
          : null,
        reason,
      ],
    );
    if (!rows[0])
      throw new Error("Chỉ được sửa phân loại lương ở trạng thái nháp.");
    await payrollAudit(
      "worker_compensation_assignments",
      req.params.id,
      "UPDATE",
      reason,
    );
    res.json({ ...rows[0], tenant_id: "local-tenant" });
  } catch (error) {
    sendError(res, error);
  }
});
app.post(
  "/api/payroll/compensation-assignments/:id/approve",
  async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("begin");
    await lockPayrollSourceShared(client);
    const lockOwner = (await client.query("select worker_id from local_worker_compensation_assignments where id=$1", [req.params.id])).rows[0];
    if (lockOwner) await lockPayrollWorkerConfiguration(client, lockOwner.worker_id);
      const current = await client.query(
        "select * from local_worker_compensation_assignments where id=$1 for update",
        [req.params.id],
      );
      if (!current.rows[0] || current.rows[0].status !== "DRAFT")
        throw new Error("Chỉ được duyệt phân loại lương nháp.");
      const row = current.rows[0];
      await preservePayrollApprovalHistory(client, "local_worker_compensation_assignments", row.id, currentLocalActor(), String(req.body.reason || "Duyệt phân loại lương"));
      const actor = currentLocalActor();
      const { rows } = await client.query(
        `update local_worker_compensation_assignments set status='APPROVED',approved_by=$2,approved_at=now(),updated_at=now() where id=$1 returning *`,
        [req.params.id, actor],
      );
      await client.query(
        "insert into local_payroll_audit_events(entity_type,entity_id,action,reason,actor_id) values('worker_compensation_assignments',$1,'APPROVE',$2,$3)",
        [req.params.id, req.body.reason || "Duyệt phân loại lương", actor],
      );
      await client.query("commit");
      res.json({ ...rows[0], tenant_id: "local-tenant" });
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      sendError(res, error);
    } finally {
      client.release();
    }
  },
);
app.post(
  "/api/payroll/compensation-assignments/:id/discard",
  async (req, res) => {
    try {
      const { rows } = await pool.query(
        `update local_worker_compensation_assignments set status='RETIRED',updated_at=now() where id=$1 and status='DRAFT' returning *`,
        [req.params.id],
      );
      if (!rows[0]) throw new Error("Không tìm thấy phân loại lương nháp.");
      await payrollAudit(
        "worker_compensation_assignments",
        req.params.id,
        "DISCARD",
        req.body.reason,
      );
      res.json({ ...rows[0], tenant_id: "local-tenant" });
    } catch (error) {
      sendError(res, error);
    }
  },
);

const workerPayrollProfileSelect = `id,'local-tenant' tenant_id,worker_id,piece_output_enabled,overtime_enabled,meal_enabled,allowances_enabled,deductions_enabled,insurance_enabled,fixed_allowance_amount,fixed_deduction_amount,effective_from,effective_to,status,source_reference,reason,idempotency_key,request_hash,created_by,approved_by,created_at,updated_at,approved_at`;
const workerPayrollProfileRow = (row: Record<string, unknown>) => ({
  ...row,
  fixed_allowance_amount: Number(row.fixed_allowance_amount || 0),
  fixed_deduction_amount: Number(row.fixed_deduction_amount || 0),
});
const profileBoolean = (value: unknown) =>
  value === true || value === "true" || value === 1 || value === "1";

app.get("/api/payroll/worker-profiles", async (req, res) => {
  try {
    const values = req.query.workerId ? [String(req.query.workerId)] : [];
    const { rows } = await pool.query(
      `select ${workerPayrollProfileSelect} from local_worker_payroll_profiles ${values.length ? "where worker_id=$1" : ""} order by effective_from desc,created_at desc`,
      values,
    );
    res.json(rows.map(workerPayrollProfileRow));
  } catch (error) {
    sendError(res, error);
  }
});

// Save the complete central payroll profile in one local transaction. The UI
// edits several versioned tables at once; keeping the orchestration here
// prevents a half-saved profile when one component fails.
registerPayrollBundleApproval(app, pool, currentLocalActor, lockPayrollSourceShared, sendError);

app.post("/api/payroll/worker-profile-bundle", async (req, res) => {
  const client = await pool.connect();
  try {
    const worker = String(req.body.worker_id || "").trim();
    const compensationType = String(req.body.compensation_type || "").trim();
    const policyGroup = String(req.body.payroll_policy_group_id || "").trim();
    const from = payrollDate(req.body.effective_from, "Ngày hiệu lực");
    const to = req.body.effective_to
      ? payrollDate(req.body.effective_to, "Ngày kết thúc")
      : null;
    const reason = String(req.body.reason || "").trim();
    const sourceReference = req.body.source_reference
      ? String(req.body.source_reference).trim()
      : null;
    const idempotencyKey = String(
      req.body.idempotency_key || randomUUID(),
    ).trim();
    const allowedCompensationTypes = new Set([
      "MONTHLY_MANAGER",
      "MONTHLY_HELPER",
      "PIECE_RATE",
      "HOURLY",
    ]);
    const allowedPayrollStatuses = new Set([
      "ACTIVE",
      "SUSPENDED",
      "TERMINATED",
    ]);
    const payrollStatus = String(req.body.payroll_status || "ACTIVE");
    if (!worker || !compensationType || !policyGroup || !reason)
      throw new Error(
        "Nhân sự, loại lương, nhóm chính sách và lý do là bắt buộc.",
      );
    if (!allowedCompensationTypes.has(compensationType))
      throw new Error("Hình thức lương không hợp lệ.");
    if (!allowedPayrollStatuses.has(payrollStatus))
      throw new Error("Trạng thái payroll không hợp lệ.");
    if (to && to < from)
      throw new Error("Ngày kết thúc không được trước ngày hiệu lực.");

    const primaryAmount =
      compensationType === "PIECE_RATE" ||
      req.body.primary_amount === "" ||
      req.body.primary_amount == null
        ? null
        : payrollNumber(req.body.primary_amount, "Mức lương chính");
    if (
      compensationType !== "PIECE_RATE" &&
      !(primaryAmount !== null && primaryAmount > 0)
    ) {
      throw new Error("Lương tháng/giờ phải có mức lớn hơn 0.");
    }
    const monthlyProductiveMinutes =
      req.body.monthly_productive_minutes === "" ||
      req.body.monthly_productive_minutes == null
        ? null
        : Math.trunc(
            payrollNumber(
              req.body.monthly_productive_minutes,
              "Phút năng suất chuẩn / tháng",
            ),
          );
    const pieceOutputEnabled = profileBoolean(req.body.piece_output_enabled);
    const overtimeEnabled = profileBoolean(req.body.overtime_enabled);
    const mealEnabled = profileBoolean(req.body.meal_enabled);
    const allowancesEnabled = profileBoolean(req.body.allowances_enabled);
    const deductionsEnabled = profileBoolean(req.body.deductions_enabled);
    let insuranceEnabled = profileBoolean(req.body.insurance_enabled);
    const fixedAllowanceAmount = allowancesEnabled
      ? payrollNumber(req.body.fixed_allowance_amount, "Phụ cấp cố định")
      : 0;
    const fixedDeductionAmount = deductionsEnabled
      ? payrollNumber(req.body.fixed_deduction_amount, "Khấu trừ cố định")
      : 0;
    const insuranceAmount = insuranceEnabled
      ? payrollNumber(req.body.insurance_amount, "Mức BHXH")
      : 0;
    const insuranceSourceReference = insuranceEnabled
      ? String(req.body.insurance_source_reference || "").trim()
      : "";
    if (allowancesEnabled && fixedAllowanceAmount <= 0)
      throw new Error("Phụ cấp cố định đang bật cần có số tiền lớn hơn 0.");
    if (deductionsEnabled && fixedDeductionAmount <= 0)
      throw new Error("Khấu trừ cố định đang bật cần có số tiền lớn hơn 0.");
    if (insuranceEnabled && insuranceAmount <= 0)
      throw new Error("BHXH đang bật cần có mức lớn hơn 0.");
    if (insuranceEnabled && !insuranceSourceReference)
      throw new Error("BHXH đang bật cần có nguồn tham chiếu.");

    await client.query("begin");
    // The worker profile bundle changes payroll eligibility fields. Lock the
    // shared source boundary before taking the worker row lock.
    await lockPayrollSourceShared(client);
    const saveReceiptKey = 'save:' + idempotencyKey;
    const saveRequestHash = payloadFingerprint({actor:currentLocalActor(),body:req.body});
    await client.query("select pg_advisory_xact_lock(hashtextextended('payroll-bundle-key:' || $1,0))",[saveReceiptKey]);
    const savedReceipt=(await client.query('select * from local_payroll_bundle_approvals where idempotency_key=$1',[saveReceiptKey])).rows[0];
    if(savedReceipt) {
      if(savedReceipt.actor_id!==currentLocalActor()||savedReceipt.request_hash!==saveRequestHash) throw Object.assign(new Error('Mã lưu hồ sơ đã dùng cho nội dung khác.'),{status:409});
      await client.query('commit');res.json({...savedReceipt.result,reused:true});return;
    }

    await lockPayrollWorkerConfiguration(client, worker);
    const workerResult = await client.query(
      `select id,'local-tenant' tenant_id,employee_code,display_name,worker_type,is_active,location_code,position_title,employment_type,employment_start_date,employment_end_date,payroll_status
      from local_workers where id=$1 for update`,
      [worker],
    );
    if (!workerResult.rows[0]) throw new Error("Không tìm thấy nhân sự.");
    const groupResult = await client.query(
      "select id from local_payroll_policy_groups where id=$1",
      [policyGroup],
    );
    if (!groupResult.rows[0])
      throw new Error("Không tìm thấy nhóm chính sách.");
    const selectedDrafts = req.body.selected_drafts as Record<string,string|null> | undefined;
    const selectDraft = async (table: string, field: string, compensation?: string) => {
      const values: unknown[] = [worker];
      let predicate = "";
      if (compensation) { values.push(compensation); predicate += " and compensation_type=$2"; }
      const drafts = (await client.query(`select * from ${table} where worker_id=$1 and status='DRAFT'${predicate} order by id for update`, values)).rows;
      if (selectedDrafts && Object.prototype.hasOwnProperty.call(selectedDrafts,field)) {
        const id = selectedDrafts[field];
        if (!id) return undefined;
        const match = drafts.find(row=>row.id===id);
        if (!match) throw Object.assign(new Error('Bản nháp đã chọn không còn hợp lệ. Hãy tải lại hồ sơ.'),{status:409});
        return match;
      }
      if (drafts.length>1) throw Object.assign(new Error('Có nhiều bản nháp. Hãy chọn đúng phiên bản cần sửa trong danh mục nâng cao.'),{status:409});
      return drafts[0];
    };
    const actor = currentLocalActor();
    const audit = (entityType: string, entityId: string, action: string) =>
      client.query(
        "insert into local_payroll_audit_events(entity_type,entity_id,action,reason,actor_id) values($1,$2,$3,$4,$5)",
        [entityType, entityId, action, reason, actor],
      );

    const master = validateWorkerMaster({
      location_code:req.body.location_code ? String(req.body.location_code).trim() : null,
      position_title:req.body.position_title ? String(req.body.position_title).trim() : null,
      employment_start_date:req.body.employment_start_date || null,
      employment_end_date:req.body.employment_end_date || null,
      payroll_status:payrollStatus,
    });
    requireWorkerMasterReason(reason);
    const workerUpdate = await client.query(
      `update local_workers set location_code=$2,position_title=$3,employment_start_date=$4,employment_end_date=$5,payroll_status=$6,updated_at=now(),local_modified_at=now()
      where id=$1 returning id,'local-tenant' tenant_id,employee_code,display_name,worker_type,is_active,location_code,position_title,employment_type,employment_start_date,employment_end_date,payroll_status`,
      [worker,master.location_code,master.position_title,master.employment_start_date,master.employment_end_date,master.payroll_status],
    );
    await audit("payroll_workers", worker, "UPDATE");

    const assignmentDraft = await selectDraft('local_worker_compensation_assignments','assignment_id');
    const assignmentResult = assignmentDraft
      ? await client.query(
          `update local_worker_compensation_assignments set compensation_type=$2,payroll_policy_group_id=$3,effective_from=$4,effective_to=$5,reason=$6,updated_at=now()
          where id=$1 returning *`,
          [assignmentDraft.id, compensationType, policyGroup, from, to, reason],
        )
      : await client.query(
          `insert into local_worker_compensation_assignments(worker_id,compensation_type,payroll_policy_group_id,effective_from,effective_to,reason,created_by)
          values($1,$2,$3,$4,$5,$6,$7) returning *`,
          [worker, compensationType, policyGroup, from, to, reason, actor],
        );
    const assignment = assignmentResult.rows[0];
    await audit(
      "worker_compensation_assignments",
      assignment.id,
      assignmentDraft ? "UPDATE" : "CREATE",
    );

    let rate: Record<string, unknown> | null = null;
    let rateDraft: Record<string, unknown> | undefined;
    if (primaryAmount !== null) {
      const method = compensationType === "HOURLY" ? "HOUR" : "DAY";
      const unitBasis = method === "HOUR" ? "HOUR" : "DAY";
      rateDraft = await selectDraft('local_worker_rates','rate_id',compensationType);
      const rateResult = rateDraft
        ? await client.query(
            `update local_worker_rates set attendance_method=$2,rate_amount=$3,effective_from=$4,effective_to=$5,unit_basis=$6,monthly_productive_minutes=$7,source_reference=$8,reason=$9,is_estimated=false,updated_at=now(),local_modified_at=now()
            where id=$1 returning *`,
            [
              rateDraft.id,
              method,
              primaryAmount,
              from,
              to,
              unitBasis,
              monthlyProductiveMinutes,
              sourceReference,
              reason,
            ],
          )
        : await client.query(
            `insert into local_worker_rates(worker_id,compensation_type,attendance_method,rate_amount,effective_from,effective_to,unit_basis,monthly_productive_minutes,source_reference,reason,is_estimated,status,local_modified_at)
            values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false,'DRAFT',now()) returning *`,
            [
              worker,
              compensationType,
              method,
              primaryAmount,
              from,
              to,
              unitBasis,
              monthlyProductiveMinutes,
              sourceReference,
              reason,
            ],
          );
      rate = rateResult.rows[0];
      const savedRate = rate;
      if (!savedRate) throw new Error("Không thể lưu mức lương chính.");
      await audit(
        "worker_rates",
        String(savedRate.id),
        rateDraft ? "UPDATE" : "CREATE",
      );
    }

    const profilePayload = {
      worker,
      piece_output_enabled: pieceOutputEnabled,
      overtime_enabled: overtimeEnabled,
      meal_enabled: mealEnabled,
      allowances_enabled: allowancesEnabled,
      deductions_enabled: deductionsEnabled,
      insurance_enabled: insuranceEnabled,
      fixed_allowance_amount: fixedAllowanceAmount,
      fixed_deduction_amount: fixedDeductionAmount,
      from,
      to,
      source_reference: sourceReference,
      reason,
    };
    let profileHash = payloadFingerprint(profilePayload);
    const profileKeyOwnerResult = await client.query(
      "select id,worker_id from local_worker_payroll_profiles where idempotency_key=$1 for update",
      [idempotencyKey],
    );
    const profileDraft = await selectDraft('local_worker_payroll_profiles','profile_id');
    if (!res.locals.payrollCanInsurance) {
      const baseline=(await client.query("select insurance_enabled from local_worker_payroll_profiles where worker_id=$1 and status='APPROVED' and effective_from<=$2::date and (effective_to is null or ($3::date is not null and effective_to>=$3::date))",[worker,from,to])).rows;
      const overlaps=(await client.query("select id from local_worker_payroll_profiles where worker_id=$1 and status='APPROVED' and (effective_to is null or effective_to>=$2::date) and ($3::date is null or effective_from<=$3::date)",[worker,from,to])).rows;
      if (overlaps.length && baseline.length!==1) throw Object.assign(new Error('Khoảng hiệu lực đi qua thay đổi BHXH. Cần người có quyền bảo hiểm đối chiếu.'),{status:403});
      insuranceEnabled=baseline[0]?.insurance_enabled===true;
      if(profileDraft&&profileDraft.insurance_enabled!==insuranceEnabled) throw Object.assign(new Error('Bản nháp thay đổi việc áp dụng BHXH cần người có quyền bảo hiểm đối chiếu.'),{status:403});
    }
    if (
      profileKeyOwnerResult.rows[0] &&
      profileKeyOwnerResult.rows[0].id !== profileDraft?.id
    )
      throw idempotencyConflict(idempotencyKey);
    profilePayload.insurance_enabled = insuranceEnabled;
    profileHash = payloadFingerprint(profilePayload);
    const profileResult = profileDraft
      ? await client.query(
          `update local_worker_payroll_profiles set piece_output_enabled=$2,overtime_enabled=$3,meal_enabled=$4,allowances_enabled=$5,deductions_enabled=$6,insurance_enabled=$7,fixed_allowance_amount=$8,fixed_deduction_amount=$9,effective_from=$10,effective_to=$11,source_reference=$12,reason=$13,request_hash=$14,updated_at=now()
          where id=$1 returning ${workerPayrollProfileSelect}`,
          [
            profileDraft.id,
            pieceOutputEnabled,
            overtimeEnabled,
            mealEnabled,
            allowancesEnabled,
            deductionsEnabled,
            insuranceEnabled,
            fixedAllowanceAmount,
            fixedDeductionAmount,
            from,
            to,
            sourceReference,
            reason,
            profileHash,
          ],
        )
      : await client.query(
          `insert into local_worker_payroll_profiles(worker_id,piece_output_enabled,overtime_enabled,meal_enabled,allowances_enabled,deductions_enabled,insurance_enabled,fixed_allowance_amount,fixed_deduction_amount,effective_from,effective_to,source_reference,reason,idempotency_key,request_hash,created_by)
          values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) returning ${workerPayrollProfileSelect}`,
          [
            worker,
            pieceOutputEnabled,
            overtimeEnabled,
            mealEnabled,
            allowancesEnabled,
            deductionsEnabled,
            insuranceEnabled,
            fixedAllowanceAmount,
            fixedDeductionAmount,
            from,
            to,
            sourceReference,
            reason,
            idempotencyKey,
            profileHash,
            actor,
          ],
        );
    const profile = workerPayrollProfileRow(
      profileResult.rows[0] as Record<string, unknown>,
    ) as Record<string, unknown>;
    await audit(
      "worker_payroll_profiles",
      String(profile.id),
      profileDraft ? "UPDATE" : "CREATE",
    );

    let insurance: Record<string, unknown> | null = null;
    let insuranceDraft: Record<string, unknown> | undefined;
    if (insuranceEnabled && res.locals.payrollCanInsurance) {
      insuranceDraft = await selectDraft('local_social_insurance_versions','insurance_id');
      const insuranceResult = insuranceDraft
        ? await client.query(
            `update local_social_insurance_versions set employee_amount=$2,effective_from=$3,effective_to=$4,source_reference=$5,reason=$6,updated_at=now()
            where id=$1 returning id,'local-tenant' tenant_id,worker_id,calculation_type,employee_amount,currency_code,effective_from,effective_to,status,source_reference,reason,created_by,approved_by,created_at,updated_at,approved_at`,
            [
              insuranceDraft.id,
              insuranceAmount,
              from,
              to,
              insuranceSourceReference,
              reason,
            ],
          )
        : await client.query(
            `insert into local_social_insurance_versions(worker_id,employee_amount,effective_from,effective_to,source_reference,reason,created_by)
            values($1,$2,$3,$4,$5,$6,$7) returning id,'local-tenant' tenant_id,worker_id,calculation_type,employee_amount,currency_code,effective_from,effective_to,status,source_reference,reason,created_by,approved_by,created_at,updated_at,approved_at`,
            [
              worker,
              insuranceAmount,
              from,
              to,
              insuranceSourceReference,
              reason,
              actor,
            ],
          );
      const savedInsurance = {
        ...insuranceResult.rows[0],
        employee_amount: asNumber(insuranceResult.rows[0].employee_amount),
      };
      insurance = savedInsurance;
      await audit(
        "social_insurance_versions",
        String(savedInsurance.id),
        insuranceDraft ? "UPDATE" : "CREATE",
      );
    }

    const serializedRate = rate
      ? {
          ...rate,
          tenant_id: "local-tenant",
          hourly_rate:
            rate.attendance_method === "HOUR"
              ? asNumber(rate.rate_amount)
              : null,
          piece_rate:
            rate.attendance_method === "OUTPUT"
              ? asNumber(rate.rate_amount)
              : null,
          monthly_rate:
            rate.attendance_method === "DAY"
              ? asNumber(rate.rate_amount)
              : null,
        }
      : null;
    const bundleResult = {
      worker: workerUpdate.rows[0],
      assignment: { ...assignment, tenant_id: "local-tenant" },
      rate: serializedRate,
      profile,
      insurance,
      reused: Boolean(
        assignmentDraft &&
        (primaryAmount === null || rateDraft) &&
        profileDraft &&
        (!insuranceEnabled || insuranceDraft),
      ),
    };
    await client.query('insert into local_payroll_bundle_approvals(idempotency_key,actor_id,worker_id,request_hash,selection_hash,result) values($1,$2,$3,$4,$5,$6::jsonb)',[saveReceiptKey,actor,worker,saveRequestHash,payloadFingerprint(selectedDrafts||{}),JSON.stringify(bundleResult)]);
    await client.query('commit');
    res.json(bundleResult);
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    sendError(res, error);
  } finally {
    client.release();
  }
});

app.post("/api/payroll/worker-profiles", async (req, res) => {
  try {
    const worker = String(req.body.worker_id || "");
    const from = payrollDate(req.body.effective_from, "Ngày hiệu lực");
    const to = req.body.effective_to
      ? payrollDate(req.body.effective_to, "Ngày kết thúc")
      : null;
    const reason = String(req.body.reason || "").trim();
    const key = String(req.body.idempotency_key || randomUUID());
    if (!worker || !reason)
      throw new Error("Nhân sự và lý do thiết lập nguồn lương là bắt buộc.");
    if (to && to < from)
      throw new Error("Ngày kết thúc không được trước ngày hiệu lực.");
    const allowancesEnabled = profileBoolean(req.body.allowances_enabled);
    const deductionsEnabled = profileBoolean(req.body.deductions_enabled);
    const payload = {
      worker,
      piece_output_enabled: profileBoolean(req.body.piece_output_enabled),
      overtime_enabled: profileBoolean(req.body.overtime_enabled),
      meal_enabled: profileBoolean(req.body.meal_enabled),
      allowances_enabled: allowancesEnabled,
      deductions_enabled: deductionsEnabled,
      insurance_enabled: profileBoolean(req.body.insurance_enabled),
      fixed_allowance_amount: allowancesEnabled
        ? payrollNumber(req.body.fixed_allowance_amount, "Phụ cấp cố định")
        : 0,
      fixed_deduction_amount: deductionsEnabled
        ? payrollNumber(req.body.fixed_deduction_amount, "Khấu trừ cố định")
        : 0,
      from,
      to,
      source_reference: req.body.source_reference
        ? String(req.body.source_reference).trim()
        : null,
      reason,
    };
    const requestHash = payloadFingerprint(payload);
    const existing = await pool.query(
      "select id,request_hash from local_worker_payroll_profiles where idempotency_key=$1",
      [key],
    );
    if (existing.rows[0]) {
      if (existing.rows[0].request_hash !== requestHash)
        throw idempotencyConflict(key);
      const replay = await pool.query(
        `select ${workerPayrollProfileSelect} from local_worker_payroll_profiles where id=$1`,
        [existing.rows[0].id],
      );
      return res.json({
        ...workerPayrollProfileRow(replay.rows[0]),
        reused: true,
      });
    }
    const workerResult = await pool.query(
      "select id from local_workers where id=$1",
      [worker],
    );
    if (!workerResult.rows[0]) throw new Error("Không tìm thấy nhân sự.");
    const { rows } = await pool.query(
      `insert into local_worker_payroll_profiles(worker_id,piece_output_enabled,overtime_enabled,meal_enabled,allowances_enabled,deductions_enabled,insurance_enabled,fixed_allowance_amount,fixed_deduction_amount,effective_from,effective_to,source_reference,reason,idempotency_key,request_hash,created_by)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) returning ${workerPayrollProfileSelect}`,
      [
        worker,
        payload.piece_output_enabled,
        payload.overtime_enabled,
        payload.meal_enabled,
        payload.allowances_enabled,
        payload.deductions_enabled,
        payload.insurance_enabled,
        payload.fixed_allowance_amount,
        payload.fixed_deduction_amount,
        from,
        to,
        payload.source_reference,
        reason,
        key,
        requestHash,
        currentLocalActor(),
      ],
    );
    await payrollAudit("worker_payroll_profiles", rows[0].id, "CREATE", reason);
    res
      .status(201)
      .json({ ...workerPayrollProfileRow(rows[0]), reused: false });
  } catch (error) {
    sendError(res, error);
  }
});
app.patch("/api/payroll/worker-profiles/:id", async (req, res) => {
  try {
    const from = payrollDate(req.body.effective_from, "Ngày hiệu lực");
    const to = req.body.effective_to
      ? payrollDate(req.body.effective_to, "Ngày kết thúc")
      : null;
    const reason = String(req.body.reason || "").trim();
    if (!reason) throw new Error("Lý do cập nhật nguồn lương là bắt buộc.");
    if (to && to < from)
      throw new Error("Ngày kết thúc không được trước ngày hiệu lực.");
    const allowancesEnabled = profileBoolean(req.body.allowances_enabled);
    const deductionsEnabled = profileBoolean(req.body.deductions_enabled);
    const { rows } = await pool.query(
      `update local_worker_payroll_profiles set piece_output_enabled=$2,overtime_enabled=$3,meal_enabled=$4,allowances_enabled=$5,deductions_enabled=$6,insurance_enabled=$7,fixed_allowance_amount=$8,fixed_deduction_amount=$9,effective_from=$10,effective_to=$11,source_reference=$12,reason=$13,updated_at=now() where id=$1 and status='DRAFT' returning ${workerPayrollProfileSelect}`,
      [
        req.params.id,
        profileBoolean(req.body.piece_output_enabled),
        profileBoolean(req.body.overtime_enabled),
        profileBoolean(req.body.meal_enabled),
        allowancesEnabled,
        deductionsEnabled,
        profileBoolean(req.body.insurance_enabled),
        allowancesEnabled
          ? payrollNumber(req.body.fixed_allowance_amount, "Phụ cấp cố định")
          : 0,
        deductionsEnabled
          ? payrollNumber(req.body.fixed_deduction_amount, "Khấu trừ cố định")
          : 0,
        from,
        to,
        req.body.source_reference
          ? String(req.body.source_reference).trim()
          : null,
        reason,
      ],
    );
    if (!rows[0])
      throw new Error("Chỉ được sửa thiết lập nguồn lương ở trạng thái nháp.");
    await payrollAudit(
      "worker_payroll_profiles",
      req.params.id,
      "UPDATE",
      reason,
    );
    res.json(workerPayrollProfileRow(rows[0]));
  } catch (error) {
    sendError(res, error);
  }
});
app.post("/api/payroll/worker-profiles/:id/approve", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await lockPayrollSourceShared(client);
    const lockOwner = (await client.query("select worker_id from local_worker_payroll_profiles where id=$1", [req.params.id])).rows[0];
    if (lockOwner) await lockPayrollWorkerConfiguration(client, lockOwner.worker_id);
    const reason = String(req.body.reason || "").trim();
    if (!reason)
      throw new Error("Lý do duyệt thiết lập nguồn lương là bắt buộc.");
    const current = await client.query(
      "select * from local_worker_payroll_profiles where id=$1 for update",
      [req.params.id],
    );
    if (!current.rows[0] || current.rows[0].status !== "DRAFT")
      throw new Error("Chỉ được duyệt thiết lập nguồn lương nháp.");
    const row = current.rows[0];
    await preservePayrollApprovalHistory(client, "local_worker_payroll_profiles", row.id, currentLocalActor(), String(req.body.reason || "Duyệt thiết lập nguồn lương"));
    const actor = currentLocalActor();
    const { rows } = await client.query(
      `update local_worker_payroll_profiles set status='APPROVED',approved_by=$2,approved_at=now(),updated_at=now() where id=$1 returning ${workerPayrollProfileSelect}`,
      [req.params.id, actor],
    );
    await client.query(
      "insert into local_payroll_audit_events(entity_type,entity_id,action,reason,actor_id) values('worker_payroll_profiles',$1,'APPROVE',$2,$3)",
      [req.params.id, reason, actor],
    );
    await client.query("commit");
    res.json(workerPayrollProfileRow(rows[0]));
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    sendError(res, error);
  } finally {
    client.release();
  }
});
app.post("/api/payroll/worker-profiles/:id/discard", async (req, res) => {
  try {
    const reason = String(req.body.reason || "").trim();
    if (!reason)
      throw new Error("Lý do hủy thiết lập nguồn lương là bắt buộc.");
    const { rows } = await pool.query(
      `update local_worker_payroll_profiles set status='RETIRED',updated_at=now() where id=$1 and status='DRAFT' returning ${workerPayrollProfileSelect}`,
      [req.params.id],
    );
    if (!rows[0]) throw new Error("Không tìm thấy thiết lập nguồn lương nháp.");
    await payrollAudit(
      "worker_payroll_profiles",
      req.params.id,
      "DISCARD",
      reason,
    );
    res.json(workerPayrollProfileRow(rows[0]));
  } catch (error) {
    sendError(res, error);
  }
});

app.patch("/api/payroll/rates/:id", async (req, res) => {
  try {
    const current = await pool.query(
      "select * from local_worker_rates where id=$1",
      [req.params.id],
    );
    if (!current.rows[0] || current.rows[0].status !== "DRAFT")
      throw new Error("Chỉ được sửa mức lương ở trạng thái nháp.");
    const row = current.rows[0];
    const method = row.attendance_method;
    const amount = payrollNumber(
      method === "HOUR"
        ? req.body.hourly_rate
        : method === "OUTPUT"
          ? req.body.piece_rate
          : req.body.monthly_rate,
      "Mức lương",
    );
    const from = payrollDate(req.body.effective_from, "Ngày hiệu lực");
    const reason = String(req.body.reason || "").trim();
    if (!reason) throw new Error("Lý do cập nhật là bắt buộc.");
    const { rows } = await pool.query(
      `update local_worker_rates set rate_amount=$2,effective_from=$3,effective_to=$4,monthly_productive_minutes=$5,source_reference=$6,reason=$7,is_estimated=$8,updated_at=now(),local_modified_at=now() where id=$1 returning *`,
      [
        req.params.id,
        amount,
        from,
        req.body.effective_to
          ? payrollDate(req.body.effective_to, "Ngày kết thúc")
          : null,
        req.body.monthly_productive_minutes
          ? Number(req.body.monthly_productive_minutes)
          : null,
        req.body.source_reference || null,
        reason,
        Boolean(req.body.is_estimated),
      ],
    );
    await payrollAudit("worker_rates", req.params.id, "UPDATE", reason);
    res.json({
      ...rows[0],
      tenant_id: "local-tenant",
      currency_code: "VND",
      created_by: "local-admin",
      hourly_rate: method === "HOUR" ? asNumber(rows[0].rate_amount) : null,
      piece_rate: method === "OUTPUT" ? asNumber(rows[0].rate_amount) : null,
      monthly_rate: method === "DAY" ? asNumber(rows[0].rate_amount) : null,
    });
  } catch (error) {
    sendError(res, error);
  }
});
app.post("/api/payroll/rates/:id/approve", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await lockPayrollSourceShared(client);
    const lockOwner = (await client.query("select worker_id from local_worker_rates where id=$1", [req.params.id])).rows[0];
    if (lockOwner) await lockPayrollWorkerConfiguration(client, lockOwner.worker_id);
    const current = await client.query(
      "select * from local_worker_rates where id=$1 for update",
      [req.params.id],
    );
    if (!current.rows[0] || current.rows[0].status !== "DRAFT")
      throw new Error("Chỉ được duyệt mức lương nháp.");
    const row = current.rows[0];
    await preservePayrollApprovalHistory(client, "local_worker_rates", row.id, currentLocalActor(), String(req.body.reason || "Duyệt mức lương"));
    const { rows } = await client.query(
      `update local_worker_rates set status='APPROVED',updated_at=now(),local_modified_at=now() where id=$1 returning *`,
      [req.params.id],
    );
    await client.query(
      "insert into local_payroll_audit_events(entity_type,entity_id,action,reason,actor_id) values('worker_rates',$1,'APPROVE',$2,$3)",
      [req.params.id, req.body.reason || "Duyệt mức lương", currentLocalActor()],
    );
    await client.query("commit");
    const amount = asNumber(rows[0].rate_amount);
    res.json({
      ...rows[0],
      tenant_id: "local-tenant",
      currency_code: "VND",
      created_by: "local-admin",
      hourly_rate: row.attendance_method === "HOUR" ? amount : null,
      piece_rate: row.attendance_method === "OUTPUT" ? amount : null,
      monthly_rate: row.attendance_method === "DAY" ? amount : null,
    });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    sendError(res, error);
  } finally {
    client.release();
  }
});
app.post("/api/payroll/rates/:id/discard", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `update local_worker_rates set status='RETIRED',updated_at=now(),local_modified_at=now() where id=$1 and status='DRAFT' returning *`,
      [req.params.id],
    );
    if (!rows[0]) throw new Error("Không tìm thấy mức lương nháp.");
    await payrollAudit(
      "worker_rates",
      req.params.id,
      "DISCARD",
      req.body.reason,
    );
    res.json({
      ...rows[0],
      tenant_id: "local-tenant",
      currency_code: "VND",
      created_by: "local-admin",
    });
  } catch (error) {
    sendError(res, error);
  }
});





const insuranceSelect = `id,'local-tenant' tenant_id,worker_id,calculation_type,employee_amount,currency_code,effective_from,effective_to,status,source_reference,reason,created_by,approved_by,created_at,updated_at,approved_at`;
app.get("/api/payroll/insurance", async (req, res) => {
  try {
    const values = req.query.workerId ? [String(req.query.workerId)] : [];
    const { rows } = await pool.query(
      `select ${insuranceSelect} from local_social_insurance_versions ${values.length ? "where worker_id=$1" : ""} order by effective_from desc,created_at desc`,
      values,
    );
    res.json(
      rows.map((row) => ({
        ...row,
        employee_amount: asNumber(row.employee_amount),
      })),
    );
  } catch (error) {
    sendError(res, error);
  }
});
app.post("/api/payroll/insurance", async (req, res) => {
  try {
    const worker = String(req.body.worker_id || "");
    const amount = payrollNumber(req.body.employee_amount, "Mức BHXH");
    const from = payrollDate(req.body.effective_from, "Ngày hiệu lực");
    const source = String(req.body.source_reference || "").trim();
    const reason = String(req.body.reason || "").trim();
    if (!worker || !source || !reason)
      throw new Error("Nhân sự, nguồn và lý do BHXH là bắt buộc.");
    const { rows } = await pool.query(
      `insert into local_social_insurance_versions(worker_id,employee_amount,effective_from,effective_to,source_reference,reason,created_by) values($1,$2,$3,$4,$5,$6,$7) returning ${insuranceSelect}`,
      [
        worker,
        amount,
        from,
        req.body.effective_to
          ? payrollDate(req.body.effective_to, "Ngày kết thúc")
          : null,
        source,
        reason,
        currentLocalActor(),
      ],
    );
    await payrollAudit(
      "social_insurance_versions",
      rows[0].id,
      "CREATE",
      reason,
    );
    res
      .status(201)
      .json({ ...rows[0], employee_amount: asNumber(rows[0].employee_amount) });
  } catch (error) {
    sendError(res, error);
  }
});
app.patch("/api/payroll/insurance/:id", async (req, res) => {
  try {
    const amount = payrollNumber(req.body.employee_amount, "Mức BHXH");
    const from = payrollDate(req.body.effective_from, "Ngày hiệu lực");
    const source = String(req.body.source_reference || "").trim();
    const reason = String(req.body.reason || "").trim();
    if (!source || !reason) throw new Error("Nguồn và lý do BHXH là bắt buộc.");
    const { rows } = await pool.query(
      `update local_social_insurance_versions set employee_amount=$2,effective_from=$3,effective_to=$4,source_reference=$5,reason=$6,updated_at=now() where id=$1 and status='DRAFT' returning ${insuranceSelect}`,
      [
        req.params.id,
        amount,
        from,
        req.body.effective_to
          ? payrollDate(req.body.effective_to, "Ngày kết thúc")
          : null,
        source,
        reason,
      ],
    );
    if (!rows[0]) throw new Error("Chỉ được sửa BHXH ở trạng thái nháp.");
    await payrollAudit(
      "social_insurance_versions",
      req.params.id,
      "UPDATE",
      reason,
    );
    res.json({
      ...rows[0],
      employee_amount: asNumber(rows[0].employee_amount),
    });
  } catch (error) {
    sendError(res, error);
  }
});
app.post("/api/payroll/insurance/:id/approve", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await lockPayrollSourceShared(client);
    const lockOwner = (await client.query("select worker_id from local_social_insurance_versions where id=$1", [req.params.id])).rows[0];
    if (lockOwner) await lockPayrollWorkerConfiguration(client, lockOwner.worker_id);
    const current = await client.query(
      "select * from local_social_insurance_versions where id=$1 for update",
      [req.params.id],
    );
    if (!current.rows[0] || current.rows[0].status !== "DRAFT")
      throw new Error("Chỉ được duyệt BHXH nháp.");
    const row = current.rows[0];
    await preservePayrollApprovalHistory(client, "local_social_insurance_versions", row.id, currentLocalActor(), String(req.body.reason || "Duyệt BHXH"));
    const actor = currentLocalActor();
    const { rows } = await client.query(
      `update local_social_insurance_versions set status='APPROVED',approved_by=$2,approved_at=now(),updated_at=now() where id=$1 returning ${insuranceSelect}`,
      [req.params.id, actor],
    );
    await client.query(
      "insert into local_payroll_audit_events(entity_type,entity_id,action,reason,actor_id) values('social_insurance_versions',$1,'APPROVE',$2,$3)",
      [req.params.id, req.body.reason || "Duyệt BHXH", actor],
    );
    await client.query("commit");
    res.json({
      ...rows[0],
      employee_amount: asNumber(rows[0].employee_amount),
    });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    sendError(res, error);
  } finally {
    client.release();
  }
});
app.post("/api/payroll/insurance/:id/discard", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `update local_social_insurance_versions set status='RETIRED',updated_at=now() where id=$1 and status='DRAFT' returning ${insuranceSelect}`,
      [req.params.id],
    );
    if (!rows[0]) throw new Error("Không tìm thấy BHXH nháp.");
    await payrollAudit(
      "social_insurance_versions",
      req.params.id,
      "DISCARD",
      req.body.reason,
    );
    res.json({
      ...rows[0],
      employee_amount: asNumber(rows[0].employee_amount),
    });
  } catch (error) {
    sendError(res, error);
  }
});

const bankSelect = `id,'local-tenant' tenant_id,worker_id,case when status='DRAFT' then account_number else null end account_number,repeat('*',greatest(length(account_number)-4,4)) || right(account_number,4) account_number_masked,account_name,bank_code,bank_name,is_primary,effective_from,effective_to,status,source_reference,reason,verified_at,created_at`;
app.get("/api/payroll/bank-accounts/proposal", async (req,res) => {
  res.setHeader('cache-control','no-store');
  try {
    const workerId=String(req.query.workerId||'');
    if(!payrollWorkerScopeUuidPattern.test(workerId)) throw new Error('Cần chọn đúng nhân sự.');
    const row=(await pool.query(`select f.id form_id,f.approved_revision,f.reviewed_at,f.approved_data->>'bank_account_number' account_number,
      f.approved_data->>'bank_account_name' account_name,f.approved_data->>'bank_name' bank_name,f.approved_data->>'bank_code' bank_code
      from local_workers w join local_user_profiles p on p.user_id=w.user_id and p.is_active
      join local_employee_profile_forms f on f.user_id=p.user_id and f.status='APPROVED'
      where w.id=$1 and f.approved_revision>0 and f.approved_revision=f.revision`,[workerId])).rows[0];
    res.json(row??null);
  }catch(error){sendError(res,error);}
});
app.get("/api/payroll/bank-accounts", async (req, res) => {
  try {
    const values = req.query.workerId ? [String(req.query.workerId)] : [];
    const { rows } = await pool.query(
      `select ${bankSelect} from local_payroll_bank_accounts ${values.length ? "where worker_id=$1" : ""} order by effective_from desc,created_at desc`,
      values,
    );
    res.json(rows);
  } catch (error) {
    sendError(res, error);
  }
});
app.post("/api/payroll/bank-accounts", async (req, res) => {
  try {
    const worker = String(req.body.worker_id || "");
    const account = String(req.body.account_number || "").trim();
    const name = String(req.body.account_name || "").trim();
    const bank = String(req.body.bank_name || "").trim();
    const from = payrollDate(req.body.effective_from, "Ngày hiệu lực");
    const reason = String(req.body.reason || "").trim();
    if (!worker || !account || !name || !bank || !reason)
      throw new Error(
        "Nhân sự, số tài khoản, chủ tài khoản, ngân hàng và lý do là bắt buộc.",
      );
    const { rows } = await pool.query(
      `insert into local_payroll_bank_accounts(worker_id,account_number,account_name,bank_code,bank_name,is_primary,effective_from,effective_to,source_reference,reason,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning ${bankSelect}`,
      [
        worker,
        account,
        name,
        req.body.bank_code || null,
        bank,
        req.body.is_primary ?? true,
        from,
        req.body.effective_to
          ? payrollDate(req.body.effective_to, "Ngày kết thúc")
          : null,
        req.body.source_reference || null,
        reason,
        currentLocalActor(),
      ],
    );
    await payrollAudit("bank_accounts", rows[0].id, "CREATE", reason);
    res.status(201).json(rows[0]);
  } catch (error) {
    sendError(res, error);
  }
});
app.patch("/api/payroll/bank-accounts/:id", async (req, res) => {
  try {
    const account = String(req.body.account_number || "").trim();
    const name = String(req.body.account_name || "").trim();
    const bank = String(req.body.bank_name || "").trim();
    const from = payrollDate(req.body.effective_from, "Ngày hiệu lực");
    const reason = String(req.body.reason || "").trim();
    if (!account || !name || !bank || !reason)
      throw new Error(
        "Số tài khoản, chủ tài khoản, ngân hàng và lý do là bắt buộc.",
      );
    const { rows } = await pool.query(
      `update local_payroll_bank_accounts set account_number=$2,account_name=$3,bank_code=$4,bank_name=$5,is_primary=$6,effective_from=$7,effective_to=$8,source_reference=$9,reason=$10,updated_at=now() where id=$1 and status='DRAFT' returning ${bankSelect}`,
      [
        req.params.id,
        account,
        name,
        req.body.bank_code || null,
        bank,
        req.body.is_primary ?? true,
        from,
        req.body.effective_to
          ? payrollDate(req.body.effective_to, "Ngày kết thúc")
          : null,
        req.body.source_reference || null,
        reason,
      ],
    );
    if (!rows[0]) throw new Error("Chỉ được sửa tài khoản ở trạng thái nháp.");
    await payrollAudit("bank_accounts", req.params.id, "UPDATE", reason);
    res.json(rows[0]);
  } catch (error) {
    sendError(res, error);
  }
});
app.post("/api/payroll/bank-accounts/:id/verify", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const current = await client.query(
      "select * from local_payroll_bank_accounts where id=$1 for update",
      [req.params.id],
    );
    if (!current.rows[0] || current.rows[0].status !== "DRAFT")
      throw new Error("Chỉ được xác minh tài khoản nháp.");
    const row = current.rows[0];
    if (row.is_primary)
      await client.query(
        `update local_payroll_bank_accounts set status='RETIRED',updated_at=now() where worker_id=$1 and status='VERIFIED' and id<>$2 and effective_from <= $3::date and (effective_to is null or effective_to >= $3::date)`,
        [row.worker_id, row.id, row.effective_from],
      );
    const actor = currentLocalActor();
    const { rows } = await client.query(
      `update local_payroll_bank_accounts set status='VERIFIED',verified_by=$2,verified_at=now(),updated_at=now() where id=$1 returning ${bankSelect}`,
      [req.params.id, actor],
    );
    await client.query(
      "insert into local_payroll_audit_events(entity_type,entity_id,action,reason,actor_id) values('bank_accounts',$1,'VERIFY',$2,$3)",
      [req.params.id, req.body.reason || "Xác minh tài khoản", actor],
    );
    await client.query("commit");
    res.json(rows[0]);
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    sendError(res, error);
  } finally {
    client.release();
  }
});
app.post("/api/payroll/bank-accounts/:id/discard", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `update local_payroll_bank_accounts set status='RETIRED',updated_at=now() where id=$1 and status='DRAFT' returning ${bankSelect}`,
      [req.params.id],
    );
    if (!rows[0]) throw new Error("Không tìm thấy tài khoản nháp.");
    await payrollAudit(
      "bank_accounts",
      req.params.id,
      "DISCARD",
      req.body.reason,
    );
    res.json(rows[0]);
  } catch (error) {
    sendError(res, error);
  }
});

const payrollAdjustmentTypes = new Set([
  "ALLOWANCE",
  "BONUS",
  "SALES_COMMISSION",
  "OTHER_ALLOWANCE",
  "SALARY_ADVANCE",
  "PENALTY",
  "PENALTY_DAMAGE",
  "OTHER_DEDUCTION",
  "LEGACY_COMBINED_DEDUCTION",
  "MANUAL_ADJUSTMENT",
]);
const payrollAdjustmentSelect = `
  a.id, a.worker_id, w.employee_code, w.display_name worker_name,
  a.period_id, p.period_start, p.period_end, a.item_type, a.item_direction,
  a.amount, a.reason, a.source_reference, a.idempotency_key, a.status,
  a.created_by, a.submitted_by, a.approved_by, a.rejected_by,
  a.created_at, a.submitted_at, a.approved_at, a.rejected_at,
  a.locked_run_id, a.locked_at`;
const payrollAdjustmentRow = (row: Record<string, unknown>) => ({
  ...row,
  amount: asNumber(row.amount),
});
async function lockPayrollAdjustmentOpen(client: PoolClient, id: string) {
  const info = (await client.query('select period_id from local_payroll_adjustments where id=$1',[id])).rows[0];
  if (!info) throw Object.assign(new Error('Không tìm thấy điều chỉnh.'),{status:404});
  const period = (await client.query('select status from local_payroll_periods where id=$1 for update',[info.period_id])).rows[0];
  if (!period || period.status === 'CLOSED') throw Object.assign(new Error('Kỳ lương đã đóng; hãy tạo kỳ điều chỉnh riêng.'),{status:409});
  await client.query('select id from local_payroll_adjustments where id=$1 for update',[id]);
}
const payrollAdjustmentPeriod = async (
  start: string,
  end: string,
  standardDays: unknown,
  queryable: Pick<PoolClient, "query"> = pool,
) => {
  await queryable.query("select pg_advisory_xact_lock_shared(hashtextextended('local-attendance-payroll-source-guard',0))");
  const result = await queryable.query(
    `
    insert into local_payroll_periods(period_start, period_end, standard_days)
    values($1, $2, $3)
    on conflict(period_start, period_end) do update set standard_days=local_payroll_periods.standard_days
    returning *`,
    [start, end, Number(standardDays ?? 26)],
  );
  return result.rows[0];
};

app.get("/api/payroll/adjustments", async (req, res) => {
  try {
    const values: unknown[] = [];
    const clauses: string[] = [];
    if (req.query.workerId) {
      values.push(String(req.query.workerId));
      clauses.push(`a.worker_id=$${values.length}`);
    }
    if (req.query.status) {
      values.push(String(req.query.status));
      clauses.push(`a.status=$${values.length}`);
    }
    if (req.query.periodStart) {
      values.push(String(req.query.periodStart));
      clauses.push(`p.period_start >= $${values.length}::date`);
    }
    if (req.query.periodEnd) {
      values.push(String(req.query.periodEnd));
      clauses.push(`p.period_end <= $${values.length}::date`);
    }
    const { rows } = await pool.query(
      `
      select ${payrollAdjustmentSelect}
      from local_payroll_adjustments a
      join local_workers w on w.id=a.worker_id
      join local_payroll_periods p on p.id=a.period_id
      ${clauses.length ? `where ${clauses.join(" and ")}` : ""}
      order by p.period_start desc, a.created_at desc`,
      values,
    );
    res.json(rows.map(payrollAdjustmentRow));
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/payroll/adjustments", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query("select pg_advisory_xact_lock_shared(hashtextextended('local-attendance-payroll-source-guard',0))");
    const workerId = String(req.body.worker_id || "");
    const periodStart = payrollDate(
      req.body.period_start ?? req.body.periodStart,
      "Ngày bắt đầu kỳ lương",
    );
    const periodEnd = payrollDate(
      req.body.period_end ?? req.body.periodEnd,
      "Ngày kết thúc kỳ lương",
    );
    const itemType = String(req.body.item_type || "")
      .trim()
      .toUpperCase();
    const direction = String(
      req.body.item_direction || req.body.direction || "",
    )
      .trim()
      .toUpperCase();
    const amount = payrollNumber(req.body.amount, "Số tiền điều chỉnh");
    const reason = String(req.body.reason || "").trim();
    const sourceReference = req.body.source_reference
      ? String(req.body.source_reference).trim()
      : null;
    const idempotencyKey = String(req.body.idempotency_key || randomUUID());
    if (!workerId || !payrollAdjustmentTypes.has(itemType))
      throw new Error("Nhân sự và loại điều chỉnh không hợp lệ.");
    if (!["EARNING", "DEDUCTION"].includes(direction))
      throw new Error("Hướng điều chỉnh phải là EARNING hoặc DEDUCTION.");
    if (amount <= 0) throw new Error("Số tiền điều chỉnh phải lớn hơn 0.");
    if (!reason) throw new Error("Lý do điều chỉnh là bắt buộc.");
    if (periodEnd < periodStart)
      throw new Error("Ngày kết thúc kỳ lương phải sau ngày bắt đầu.");
    const requestHash = payloadFingerprint({
      workerId,
      periodStart,
      periodEnd,
      itemType,
      direction,
      amount,
      reason,
      sourceReference,
    });
    await client.query("select pg_advisory_xact_lock(hashtextextended('payroll-adjustment:' || $1,0))", [idempotencyKey]);
    const existing = await client.query(
      "select id,request_hash from local_payroll_adjustments where idempotency_key=$1",
      [idempotencyKey],
    );
    if (existing.rows[0]) {
      if (
        existing.rows[0].request_hash &&
        existing.rows[0].request_hash !== requestHash
      )
        throw idempotencyConflict(idempotencyKey);
      const { rows } = await client.query(
        `select ${payrollAdjustmentSelect} from local_payroll_adjustments a join local_workers w on w.id=a.worker_id join local_payroll_periods p on p.id=a.period_id where a.id=$1`,
        [existing.rows[0].id],
      );
      await client.query("commit");
      return res.json({ ...payrollAdjustmentRow(rows[0]), reused: true });
    }
    const worker = await client.query(
      "select id from local_workers where id=$1",
      [workerId],
    );
    if (!worker.rows[0]) throw new Error("Không tìm thấy nhân sự.");
    const period = await payrollAdjustmentPeriod(
      periodStart,
      periodEnd,
      req.body.standard_days ?? req.body.standardDays,
      client,
    );
    if (period.status === "CLOSED")
      throw Object.assign(new Error("Kỳ lương đã đóng, hãy tạo kỳ điều chỉnh riêng."), {status:409});
    const { rows } = await client.query(
      `
      insert into local_payroll_adjustments(worker_id,period_id,item_type,item_direction,amount,reason,source_reference,idempotency_key,request_hash,created_by)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      returning id`,
      [
        workerId,
        period.id,
        itemType,
        direction,
        amount,
        reason,
        sourceReference,
        idempotencyKey,
        requestHash,
        currentLocalActor(),
      ],
    );
    await payrollAudit("payroll_adjustments", rows[0].id, "CREATE", reason, client);
    const detail = await client.query(
      `select ${payrollAdjustmentSelect} from local_payroll_adjustments a join local_workers w on w.id=a.worker_id join local_payroll_periods p on p.id=a.period_id where a.id=$1`,
      [rows[0].id],
    );
    await client.query("commit");
    res
      .status(201)
      .json({ ...payrollAdjustmentRow(detail.rows[0]), reused: false });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    sendError(res, error);
  } finally { client.release(); }
});

app.patch("/api/payroll/adjustments/:id", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query("select pg_advisory_xact_lock_shared(hashtextextended('local-attendance-payroll-source-guard',0))");
    await lockPayrollAdjustmentOpen(client, String(req.params.id));
    const itemType = String(req.body.item_type || "")
      .trim()
      .toUpperCase();
    const direction = String(
      req.body.item_direction || req.body.direction || "",
    )
      .trim()
      .toUpperCase();
    const amount = payrollNumber(req.body.amount, "Số tiền điều chỉnh");
    const reason = String(req.body.reason || "").trim();
    if (
      !payrollAdjustmentTypes.has(itemType) ||
      !["EARNING", "DEDUCTION"].includes(direction) ||
      amount <= 0 ||
      !reason
    )
      throw new Error("Loại, hướng, số tiền và lý do điều chỉnh là bắt buộc.");
    const { rows } = await client.query(
      `update local_payroll_adjustments set item_type=$2,item_direction=$3,amount=$4,reason=$5,source_reference=$6 where id=$1 and status='DRAFT' returning id`,
      [
        req.params.id,
        itemType,
        direction,
        amount,
        reason,
        req.body.source_reference
          ? String(req.body.source_reference).trim()
          : null,
      ],
    );
    if (!rows[0]) throw new Error("Chỉ được sửa điều chỉnh ở trạng thái nháp.");
    await payrollAudit("payroll_adjustments", req.params.id, "UPDATE", reason, client);
    const detail = await client.query(
      `select ${payrollAdjustmentSelect} from local_payroll_adjustments a join local_workers w on w.id=a.worker_id join local_payroll_periods p on p.id=a.period_id where a.id=$1`,
      [req.params.id],
    );
    await client.query("commit");
    res.json(payrollAdjustmentRow(detail.rows[0]));
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    sendError(res, error);
  } finally { client.release(); }
});

app.post("/api/payroll/adjustments/:id/submit", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query("select pg_advisory_xact_lock_shared(hashtextextended('local-attendance-payroll-source-guard',0))");
    await lockPayrollAdjustmentOpen(client, String(req.params.id));
    const reason = String(req.body.reason || "").trim();
    if (!reason) throw new Error("Lý do gửi duyệt là bắt buộc.");
    const { rows } = await client.query(
      "update local_payroll_adjustments set status='SUBMITTED',submitted_by=$2,submitted_at=now() where id=$1 and status='DRAFT' returning id",
      [req.params.id, currentLocalActor()],
    );
    if (!rows[0])
      throw new Error("Chỉ được gửi duyệt điều chỉnh ở trạng thái nháp.");
    await payrollAudit("payroll_adjustments", req.params.id, "SUBMIT", reason, client);
    await client.query("commit");
    res.json({ id: req.params.id, status: "SUBMITTED" });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    sendError(res, error);
  } finally { client.release(); }
});

app.post("/api/payroll/adjustments/:id/approve", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query("select pg_advisory_xact_lock_shared(hashtextextended('local-attendance-payroll-source-guard',0))");
    await lockPayrollAdjustmentOpen(client, String(req.params.id));
    const reason = String(req.body.reason || "").trim();
    if (!reason) throw new Error("Lý do duyệt điều chỉnh là bắt buộc.");
    const { rows } = await client.query(
      "update local_payroll_adjustments set status='APPROVED',approved_by=$2,approved_at=now() where id=$1 and status='SUBMITTED' returning id",
      [req.params.id, currentLocalActor()],
    );
    if (!rows[0])
      throw new Error("Chỉ được duyệt điều chỉnh ở trạng thái đã gửi duyệt.");
    await payrollAudit("payroll_adjustments", req.params.id, "APPROVE", reason, client);
    await client.query("commit");
    res.json({ id: req.params.id, status: "APPROVED" });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    sendError(res, error);
  } finally { client.release(); }
});

app.post("/api/payroll/adjustments/:id/reject", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query("select pg_advisory_xact_lock_shared(hashtextextended('local-attendance-payroll-source-guard',0))");
    await lockPayrollAdjustmentOpen(client, String(req.params.id));
    const reason = String(req.body.reason || "").trim();
    if (!reason) throw new Error("Lý do từ chối điều chỉnh là bắt buộc.");
    const { rows } = await client.query(
      "update local_payroll_adjustments set status='REJECTED',rejected_by=$2,rejected_at=now() where id=$1 and status in ('DRAFT','SUBMITTED') returning id",
      [req.params.id, currentLocalActor()],
    );
    if (!rows[0])
      throw new Error("Điều chỉnh không còn ở trạng thái có thể từ chối.");
    await payrollAudit("payroll_adjustments", req.params.id, "REJECT", reason, client);
    await client.query("commit");
    res.json({ id: req.params.id, status: "REJECTED" });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    sendError(res, error);
  } finally { client.release(); }
});

type PayrollFact = {
  workerId: string;
  sourceType: string;
  sourceId: string;
  itemType: string;
  itemDirection: "EARNING" | "DEDUCTION";
  workDate: string;
  quantity: string;
  unitRate: string;
  multiplier: string;
  formula?: string;
  details: Record<string, unknown>;
};

function periodFromInput(value: unknown, fallback: string) {
  const candidate =
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? value
      : fallback;
  return candidate;
}

function defaultPeriod() {
  const today = new Date();
  const start = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1),
  );
  const end = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0),
  );
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

async function localPayrollRunDetails(runId: string) {
  const runResult = await pool.query(
    `
    select r.id, r.period_id, r.run_number, r.status, r.calculation_version, r.standard_days_snapshot, r.config_snapshot, r.input_hash,
      r.idempotency_key, r.created_at, r.locked_at, p.period_start, p.period_end,
      p.status period_status, p.standard_days,
      coalesce((select sum(pr.gross_amount) from local_payroll_records pr where pr.run_id=r.id), 0) gross_total,
      coalesce((select sum(pr.deductions_amount) from local_payroll_records pr where pr.run_id=r.id), 0) deductions_total,
      coalesce((select sum(pr.net_amount) from local_payroll_records pr where pr.run_id=r.id), 0) net_total,
      coalesce((select sum(pr.payment_amount) from local_payroll_records pr where pr.run_id=r.id), 0) payment_total,
      (select count(*)::int from local_payroll_records pr where pr.run_id=r.id) record_count,
      (select count(*)::int from local_payroll_exceptions px where px.run_id=r.id and px.severity='BLOCKING' and px.resolved_at is null) blocking_exception_count
    from local_payroll_runs r
    join local_payroll_periods p on p.id = r.period_id
    where r.id = $1
    group by r.id, p.id`,
    [runId],
  );
  if (!runResult.rows[0]) throw new Error("Không tìm thấy kỳ tính lương.");
  const recordsResult = await pool.query(
    `
    select pr.id, pr.worker_id,
      case when pr.employee_identity_snapshot is null then w.employee_code else pr.employee_identity_snapshot->>'employee_code' end employee_code,
      case when pr.employee_identity_snapshot is null then w.display_name else pr.employee_identity_snapshot->>'display_name' end worker_name,
      case when pr.employee_identity_snapshot is null then w.worker_type else pr.employee_identity_snapshot->>'worker_type' end worker_type,
      case when pr.employee_identity_snapshot is null then w.location_code else pr.employee_identity_snapshot->>'location_code' end location_code,
      pr.employee_identity_snapshot,case when pr.employee_identity_snapshot is null then 'LEGACY_UNSNAPSHOTTED' else 'SNAPSHOT' end identity_source,
      pr.gross_amount, pr.deductions_amount, pr.net_amount, pr.payment_amount,
      pr.rounding_delta, pr.created_at
    from local_payroll_records pr
    join local_workers w on w.id = pr.worker_id
    where pr.run_id = $1 order by w.display_name`,
    [runId],
  );
  const itemsResult = await pool.query(
    `
    select i.id, i.payroll_record_id, i.worker_id, i.item_type, i.item_direction,
      i.source_type, i.source_id, i.quantity, i.unit_rate, i.multiplier,
      i.amount_precise, i.formula, i.details, i.created_at
    from local_payroll_items i
    join local_payroll_records pr on pr.id = i.payroll_record_id
    where pr.run_id = $1 order by i.created_at, i.item_type`,
    [runId],
  );
  const exceptionsResult = await pool.query(
    `
    select e.id, e.severity, e.code, e.worker_id, w.employee_code, w.display_name worker_name,
      e.source_type, e.source_id, e.message, e.created_at, e.resolved_at
    from local_payroll_exceptions e
    left join local_workers w on w.id = e.worker_id
    where e.run_id = $1 order by case e.severity when 'BLOCKING' then 1 when 'WARNING' then 2 else 3 end, e.created_at`,
    [runId],
  );
  const numericFields = [
    "gross_total",
    "deductions_total",
    "net_total",
    "payment_total",
    "standard_days",
    "standard_days_snapshot",
  ];
  const run = Object.fromEntries(
    Object.entries(runResult.rows[0]).map(([key, value]) => [
      key,
      numericFields.includes(key) ? asNumber(value) : value,
    ]),
  );
  const records = recordsResult.rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        [
          "gross_amount",
          "deductions_amount",
          "net_amount",
          "payment_amount",
          "rounding_delta",
        ].includes(key)
          ? asNumber(value)
          : value,
      ]),
    ),
  );
  const items = itemsResult.rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        ["quantity", "unit_rate", "multiplier", "amount_precise"].includes(key)
          ? asNumber(value)
          : value,
      ]),
    ),
  );
  return { ...run, records, items, exceptions: exceptionsResult.rows };
}

type PayrollPreflightIssue = {
  severity: "BLOCKING" | "WARNING";
  code: string;
  worker_id?: string | null;
  source_type?: string | null;
  source_id?: string | null;
  message: string;
};

type PayrollQueryable = Pick<PoolClient, "query">;

type PayrollWorkerScope = string[] | undefined;

const payrollWorkerScopeUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parsePayrollWorkerScope(value: unknown): PayrollWorkerScope {
  if (value === undefined) return undefined;
  if (!Array.isArray(value))
    throw new Error("Phạm vi nhân sự của kỳ lương phải là một danh sách mã hợp lệ.");
  if (value.length > 5_000)
    throw new Error("Phạm vi kỳ lương vượt quá 5.000 nhân sự.");
  const normalized = value.map((workerId) => {
    if (
      typeof workerId !== "string" ||
      !payrollWorkerScopeUuidPattern.test(workerId.trim())
    )
      throw new Error("Phạm vi kỳ lương có mã nhân sự không hợp lệ.");
    return workerId.trim().toLowerCase();
  });
  return [...new Set(normalized)].sort();
}

function parsePayrollWorkerScopeQuery(value: unknown): PayrollWorkerScope {
  if (value === undefined) return undefined;
  if (typeof value !== "string")
    throw new Error("worker_ids phải là danh sách mã nhân sự dạng CSV.");
  return parsePayrollWorkerScope(value.trim() ? value.split(",") : []);
}

async function assertPayrollWorkerScope(
  queryable: PayrollQueryable,
  workerIds: PayrollWorkerScope,
) {
  if (workerIds === undefined || workerIds.length === 0) return;
  const result = await queryable.query(
    "select id::text from local_workers where id = any($1::uuid[])",
    [workerIds],
  );
  const foundWorkerIds = new Set(
    result.rows.map((row) => String(row.id).toLowerCase()),
  );
  if (workerIds.some((workerId) => !foundWorkerIds.has(workerId)))
    throw new Error("Phạm vi kỳ lương có nhân sự không tồn tại.");
}

function storedPayrollRunWorkerScope(
  configSnapshot: unknown,
): string[] | null | "INVALID" {
  if (!configSnapshot || typeof configSnapshot !== "object") return null;
  const scope = (configSnapshot as Record<string, unknown>).worker_scope;
  if (!scope || typeof scope !== "object") return null;
  const requested = (scope as Record<string, unknown>).requested_worker_ids;
  if (requested === undefined || requested === null) return null;
  if (!Array.isArray(requested)) return "INVALID";
  const normalized = requested.map((workerId) =>
    typeof workerId === "string" && payrollWorkerScopeUuidPattern.test(workerId)
      ? workerId.toLowerCase()
      : null,
  );
  if (normalized.some((workerId) => workerId === null)) return "INVALID";
  return [...new Set(normalized as string[])].sort();
}

function hasPayrollWorkerScopeMetadata(configSnapshot: unknown) {
  if (!configSnapshot || typeof configSnapshot !== "object") return false;
  const scope = (configSnapshot as Record<string, unknown>).worker_scope;
  return (
    !!scope &&
    typeof scope === "object" &&
    Object.hasOwn(scope as Record<string, unknown>, "requested_worker_ids")
  );
}

function payrollRunMatchesRequest(
  row: Record<string, unknown>,
  periodStart: string,
  periodEnd: string,
  standardDays: number | null,
  workerIds: PayrollWorkerScope,
) {
  return (
    row.period_start === periodStart &&
    row.period_end === periodEnd &&
    (row.standard_days_snapshot===null?null:Number(row.standard_days_snapshot)) === standardDays &&
    JSON.stringify(storedPayrollRunWorkerScope(row.config_snapshot)) ===
      JSON.stringify(workerIds ?? null)
  );
}

async function findPayrollRunByIdempotency(
  queryable: PayrollQueryable,
  idempotencyKey: string,
) {
  const result = await queryable.query(
    `
    select r.id,p.period_start::text period_start,p.period_end::text period_end,
      r.standard_days_snapshot,r.config_snapshot
    from local_payroll_runs r join local_payroll_periods p on p.id=r.period_id
    where r.idempotency_key=$1`,
    [idempotencyKey],
  );
  return result.rows[0] as Record<string, unknown> | undefined;
}

async function capturePayrollLockScopeGuard(
  client: PoolClient,
  run: Record<string, unknown>,
) {
  const requestedWorkerIds = storedPayrollRunWorkerScope(run.config_snapshot);
  // Runs created before scope snapshots existed remain compatible. New runs
  // always capture this metadata, including all-worker runs (`null` scope).
  if (!hasPayrollWorkerScopeMetadata(run.config_snapshot)) return;
  if (requestedWorkerIds === "INVALID")
    throw Object.assign(new Error("Snapshot phạm vi nhân sự của run không hợp lệ."), {
      status: 409,
    });
  const resolvedResult = await client.query(
    "select worker_id::text from local_payroll_records where run_id=$1 order by worker_id",
    [run.id],
  );
  const resolvedWorkerIds = resolvedResult.rows.map((row) =>
    String(row.worker_id).toLowerCase(),
  );
  const eligibleResult = await client.query(
    `
    select w.id::text,w.employee_code,w.display_name,
      (btrim(coalesce(w.employee_code,'')) ~* '^(HARDEN|PAYTEST)([-_ ]|$)'
       or btrim(coalesce(w.display_name,'')) ~* '^(HARDEN|PAYTEST)([-_ ]|$)') is_test_fixture
    from local_workers w
    where local_payroll_worker_eligible(w.id,$1::date,$2::date)
    order by w.id`,
    [run.period_start, run.period_end],
  );
  const resolved = new Set(resolvedWorkerIds);
  const omittedRealWorkers = eligibleResult.rows.filter(
    (worker) => !resolved.has(String(worker.id).toLowerCase()) && !worker.is_test_fixture,
  );
  if (omittedRealWorkers.length) {
    const examples = omittedRealWorkers
      .slice(0, 3)
      .map((worker) => String(worker.employee_code || worker.display_name || worker.id))
      .join(", ");
    throw Object.assign(
      new Error(
        `Không thể khóa phạm vi đã lọc: còn ${omittedRealWorkers.length} nhân sự có nguồn chưa thanh toán ngoài preview${examples ? ` (${examples})` : ""}. Hãy tính lại bao gồm toàn bộ nhân sự thực trước khi khóa.`,
      ),
      { status: 409 },
    );
  }
  const omittedTestWorkerIds = eligibleResult.rows
    .filter(
      (worker) =>
        !resolved.has(String(worker.id).toLowerCase()) && worker.is_test_fixture,
    )
    .map((worker) => String(worker.id));
  return {
    requested_worker_ids: requestedWorkerIds,
    resolved_worker_ids: resolvedWorkerIds,
    current_real_eligible_worker_ids: eligibleResult.rows
      .filter((worker) => !worker.is_test_fixture)
      .map((worker) => String(worker.id)),
    omitted_test_worker_ids: omittedTestWorkerIds,
    omitted_test_worker_count: omittedTestWorkerIds.length,
  };
}

async function payrollPendingIssues(queryable: PayrollQueryable, periodStart: string, periodEnd: string, scope: PayrollWorkerScope = undefined) {
  const pending = await queryable.query(`
    select s.*,w.employee_code,w.display_name,w.location_code from (
      select id source_id,worker_id,work_date::text source_date,'ATTENDANCE'::text source_type,'UNAPPROVED_ATTENDANCE'::text code,workflow_status status
        from local_attendance where work_date between $1::date and $2::date and workflow_status='SUBMITTED' and not is_reversed
      union all
      select id,worker_id,work_date::text,'PRODUCTION_ENTRY','UNAPPROVED_PRODUCTION',workflow_status
        from local_production_entries where work_date between $1::date and $2::date and workflow_status='SUBMITTED' and not is_reversed
      union all
      select id,worker_id,work_date::text,'OVERTIME','UNAPPROVED_OVERTIME',status
        from local_overtime where work_date between $1::date and $2::date and status='SUBMITTED'
      union all
      select a.id,a.worker_id,p.period_start::text,'ADJUSTMENT','UNAPPROVED_ADJUSTMENT',a.status
        from local_payroll_adjustments a join local_payroll_periods p on p.id=a.period_id
        where a.status in ('DRAFT','SUBMITTED') and p.period_start <= $2::date and p.period_end >= $1::date
    ) s join local_workers w on w.id=s.worker_id
    where ($3::uuid[] is null or s.worker_id=any($3::uuid[])) order by s.source_date,s.source_type,s.source_id`, [periodStart,periodEnd,scope ?? null]);
  const labels: Record<string,string> = { ATTENDANCE:'Công ngày/giờ',PRODUCTION_ENTRY:'Sản lượng',OVERTIME:'Tăng ca',ADJUSTMENT:'Khoản cộng/trừ' };
  return pending.rows.map(row => ({...row,severity:'BLOCKING' as const,resolution_target:row.source_type === 'ADJUSTMENT' ? 'ADJUSTMENT' : 'SOURCE',
    message:`${row.display_name || row.employee_code}: ${labels[row.source_type]} ngày ${row.source_date} ${row.status==='DRAFT'?'còn nháp':'đang chờ duyệt'}. Cần duyệt hoặc từ chối trước khi khóa kỳ.`}));
}

async function payrollPreflight(
  queryable: PayrollQueryable, periodStart:string, periodEnd:string, standardDays:number|null,
  requestedWorkerIds:PayrollWorkerScope=undefined,
) {
  await assertPayrollWorkerScope(queryable,requestedWorkerIds);
  const workerResult=await queryable.query(`select w.id::text worker_id,w.employee_code,w.display_name,w.worker_type,w.location_code,w.is_active,w.payroll_status,
    w.employment_start_date,w.employment_end_date,a.compensation_type
    from local_workers w left join lateral(select compensation_type from local_worker_compensation_assignments a where a.worker_id=w.id and a.status='APPROVED'
      and a.effective_from<=$2::date and (a.effective_to is null or a.effective_to>=$1::date) order by effective_from desc limit 1) a on true
    where local_payroll_worker_eligible(w.id,$1::date,$2::date) and ($3::uuid[] is null or w.id=any($3::uuid[])) order by w.id`,[periodStart,periodEnd,requestedWorkerIds??null]);
  const workers=workerResult.rows, workerIds=workers.map(row=>String(row.worker_id));
  const checks=await payrollV3Checks(queryable,periodStart,periodEnd,workerIds,standardDays);
  const lockIssues = await payrollPendingIssues(queryable,periodStart,periodEnd);
  const pendingScope = new Set(requestedWorkerIds ?? workerIds);
  const scopedPending = lockIssues.filter(issue => requestedWorkerIds === undefined || pendingScope.has(issue.worker_id));
  const issues:PayrollPreflightIssue[]=[...(checks.issues as PayrollPreflightIssue[]),...scopedPending];
  if(!workers.length)issues.push({severity:'BLOCKING',code:'NO_ACTIVE_WORKERS',message:'Không có nhân sự hoặc nguồn còn phải quyết toán trong kỳ.'});
  for(const worker of workers) {
    if(worker.is_active && worker.payroll_status==='ACTIVE' && (!worker.employment_end_date || worker.employment_end_date>=periodEnd)) {
      try {
        const context=await payrollSourceContext(queryable,worker.worker_id,periodEnd);
        const primary=await queryable.query("select id from local_worker_rates where worker_id=$1 and status='APPROVED' and compensation_type=$3 and effective_from<=$2::date and (effective_to is null or effective_to>=$2::date)",[worker.worker_id,periodEnd,context.assignment.compensation_type]);
        if(primary.rows.length>1)throw new Error('Có nhiều đơn giá lương chính giao ngày; cần đối soát trước khi tính.');
        if(context.profile.insurance_enabled) {
          const insurance=await queryable.query("select id from local_social_insurance_versions where worker_id=$1 and status='APPROVED' and effective_from<=$2::date and (effective_to is null or effective_to>=$2::date)",[worker.worker_id,periodEnd]);
          if(insurance.rows.length!==1)throw new Error('Nguồn BHXH bật nhưng thiếu một phiên bản đã duyệt duy nhất tại cuối kỳ.');
        }
      }catch(error){issues.push({severity:'BLOCKING',code:'MISSING_PAYROLL_PROFILE',worker_id:worker.worker_id,message:(error as Error).message});}
    }
  }
  const invalidAttendance=await queryable.query(`select id,worker_id,work_date::text work_date from local_attendance where worker_id=any($3::uuid[]) and work_date between $1::date and $2::date and workflow_status in ('APPROVED','LOCKED') and not is_reversed
    and ((attendance_method='DAY' and (monthly_salary_snapshot is null or monthly_salary_snapshot<=0 or day_units is null or day_units<=0)) or (attendance_method='HOUR' and (worked_minutes is null or worked_minutes<=0 or check_in_time is null or check_out_time is null or rate_amount is null or rate_amount<=0)))`,[periodStart,periodEnd,workerIds]);
  for(const row of invalidAttendance.rows)issues.push({severity:'BLOCKING',code:'INVALID_ATTENDANCE_SNAPSHOT',worker_id:row.worker_id,source_type:'ATTENDANCE',source_id:row.id,message:`Nguồn công ${row.work_date} thiếu snapshot lương hoặc dữ liệu giờ hợp lệ.`});
  const invalidProduction=await queryable.query("select id,worker_id from local_production_entries where worker_id=any($3::uuid[]) and work_date between $1::date and $2::date and workflow_status in ('APPROVED','LOCKED') and not is_reversed and (rate_amount is null or rate_amount<=0)",[periodStart,periodEnd,workerIds]);
  for(const row of invalidProduction.rows)issues.push({severity:'BLOCKING',code:'MISSING_PRODUCTION_RATE_SNAPSHOT',worker_id:row.worker_id,source_type:'PRODUCTION_ENTRY',source_id:row.id,message:'Sản lượng đã duyệt thiếu đơn giá snapshot.'});
  const summaries=workers.map(worker=>({...worker,issues:issues.filter(issue=>issue.worker_id===worker.worker_id)}));
  return {period_start:periodStart,period_end:periodEnd,standard_days:standardDays,requested_worker_ids:requestedWorkerIds??null,resolved_worker_ids:workerIds,
    workers:summaries,issues,blocking_count:issues.filter(issue=>issue.severity==='BLOCKING').length,is_ready:!issues.some(issue=>issue.severity==='BLOCKING'),
    policyMap:new Map<string,string>(),productRateAvailable:true,calendars:checks.calendars,lock_issues:lockIssues,lock_blocking_count:lockIssues.length};
}

app.get("/api/payroll/preflight", async (req, res) => {
  try {
    const defaults = defaultPeriod();
    const periodStart = periodFromInput(
      req.query.period_start ?? req.query.periodStart,
      defaults.start,
    );
    const periodEnd = periodFromInput(
      req.query.period_end ?? req.query.periodEnd,
      defaults.end,
    );
    if (periodEnd < periodStart)
      throw new Error("Ngày kết thúc kỳ lương phải sau ngày bắt đầu.");
    const rawStandardDays = req.query.standard_days ?? req.query.standardDays;
    const standardDays =
      rawStandardDays === undefined || rawStandardDays === ""
        ? null
        : Number(rawStandardDays);
    const requestedWorkerIds = parsePayrollWorkerScopeQuery(
      req.query.worker_ids ?? req.query.workerIds,
    );
    const result = await payrollPreflight(
      pool,
      periodStart,
      periodEnd,
      standardDays,
      requestedWorkerIds,
    );
    // policyMap is an internal engine detail; expose a plain object to JSON clients.
    res.json({ ...result, policyMap: Object.fromEntries(result.policyMap) });
  } catch (error) {
    sendError(res, error);
  }
});

async function projectSelfPayrollMonth(client: PoolClient, runId: string, self: {actor:string;workerId:string}, start:string,end:string,status:'PREVIEW'|'LOCKED') {
  await payrollSelfWorker(client,self.actor,self.workerId);
  const pending = await payrollPendingIssues(client,start,end,[self.workerId]);
  const record = (await client.query(`select id,gross_amount::text,deductions_amount::text,net_amount::text,payment_amount::text from local_payroll_records where run_id=$1 and worker_id=$2`,[runId,self.workerId])).rows[0];
  if (!record) throw Object.assign(new Error('Chưa có kết quả lương của bạn cho tháng này.'),{status:404});
  const exceptions = (await client.query(`select code from local_payroll_exceptions where run_id=$1 and (worker_id=$2 or worker_id is null) and severity='BLOCKING' and resolved_at is null`,[runId,self.workerId])).rows;
  const blocked = exceptions.length > 0;
  const items = blocked ? [] : (await client.query(`select item_type,item_direction,quantity::text,unit_rate::text,multiplier::text,amount_precise::text,formula from local_payroll_items where payroll_record_id=$1 and worker_id=$2 order by created_at,item_type,id`,[record.id,self.workerId])).rows;
  await payrollSelfWorker(client,self.actor,self.workerId);
  return {month:start.slice(0,7),status:blocked?'BLOCKED':status,calculated_at:new Date().toISOString(),
    amounts:blocked?null:{gross:record.gross_amount,deductions:record.deductions_amount,net:record.net_amount,payment:record.payment_amount},items,
    pending_count:pending.length,pending_message:pending.length?'Nguồn đang chờ duyệt chưa được tính vào số tiền này.':null,
    issues:exceptions.map(row=>({code:String(row.code),message:'Kết quả lương cần được quản lý đối soát trước khi sử dụng.'}))};
}

async function createLocalPayrollRun(input: Record<string, unknown>, monthly = false, self?: {actor:string;workerId:string}) {
  const defaults = defaultPeriod();
  const periodStart = periodFromInput(
    input.period_start ?? input.periodStart,
    defaults.start,
  );
  const periodEnd = periodFromInput(
    input.period_end ?? input.periodEnd,
    defaults.end,
  );
  if (periodEnd < periodStart)
    throw new Error("Ngày kết thúc kỳ lương phải sau ngày bắt đầu.");
  const standardInput=input.standard_days ?? input.standardDays;
  const standardDays=standardInput===undefined || standardInput===null || standardInput==='' ? null : Number(standardInput);
  if(standardDays!==null && (!Number.isFinite(standardDays)||standardDays<=0))throw new Error('Ngày công đối chiếu phải lớn hơn 0.');
  const idempotencyKey = String(
    input.idempotency_key ?? input.idempotencyKey ?? randomUUID(),
  );
  const requestedWorkerIds = self ? [self.workerId] : parsePayrollWorkerScope(
    Object.hasOwn(input, "worker_ids")
      ? input.worker_ids
      : input.workerIds,
  );
  const existing = self ? null : await findPayrollRunByIdempotency(pool, idempotencyKey);
  if (existing) {
    if (!payrollRunMatchesRequest(existing, periodStart, periodEnd, standardDays, requestedWorkerIds))
      throw idempotencyConflict(idempotencyKey);
    return localPayrollRunDetails(String(existing.id));
  }
  await assertPayrollWorkerScope(
    pool,
    requestedWorkerIds,
  );

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Source-write triggers take the shared form of this lock. The exclusive
    // lock makes the preflight + payroll snapshot one stable source cut.
    await client.query(
      "select pg_advisory_xact_lock(hashtextextended('local-attendance-payroll-source-guard', 0))",
    );
    if (self) {
      await payrollSelfWorker(client,self.actor,self.workerId);
      const closed=(await client.query(`select r.id from local_payroll_runs r join local_payroll_periods p on p.id=r.period_id
        join local_payroll_records pr on pr.run_id=r.id and pr.worker_id=$3
        where p.period_start=$1::date and p.period_end=$2::date and p.status='CLOSED' and r.status='LOCKED' order by r.run_number desc limit 1`,[periodStart,periodEnd,self.workerId])).rows[0];
      if(closed){const projected=await projectSelfPayrollMonth(client,String(closed.id),self,periodStart,periodEnd,'LOCKED');await client.query('ROLLBACK');return projected;}
      if((await client.query("select 1 from local_payroll_periods where status='CLOSED' and period_start<=$2::date and period_end>=$1::date limit 1",[periodStart,periodEnd])).rows[0])throw Object.assign(new Error('Chưa có kết quả tháng đã khóa cho hồ sơ của bạn. Liên hệ quản lý để đối soát.'),{status:404});
    }
    // A concurrent retry may have waited on the source lock while the first
    // request created the run. Re-check before touching the payroll period.
    const lockedExisting = self ? null : await findPayrollRunByIdempotency(
      client,
      idempotencyKey,
    );
    if (lockedExisting) {
      if (!payrollRunMatchesRequest(lockedExisting, periodStart, periodEnd, standardDays, requestedWorkerIds))
        throw idempotencyConflict(idempotencyKey);
      await client.query("COMMIT");
      return localPayrollRunDetails(String(lockedExisting.id));
    }
    if (monthly && !self) {
      await assertPayrollWorkerScope(client, requestedWorkerIds);
      const closed = (await client.query(`select r.* from local_payroll_runs r join local_payroll_periods p on p.id=r.period_id
        where p.period_start=$1::date and p.period_end=$2::date and p.status='CLOSED' and r.status='LOCKED' order by r.run_number desc`, [periodStart, periodEnd])).rows;
      const locked = closed.find(run => payrollRunMatchesRequest({...run,period_start:periodStart,period_end:periodEnd},periodStart,periodEnd,standardDays,requestedWorkerIds));
      if (locked) { await client.query('COMMIT'); return localPayrollRunDetails(String(locked.id)); }
    }
    if ((await client.query("select 1 from local_payroll_periods where status='CLOSED' and period_start <= $2::date and period_end >= $1::date limit 1", [periodStart,periodEnd])).rows[0])
      throw Object.assign(new Error('Kỳ lương giao với kỳ đã đóng; không được tính trùng nguồn. Hãy dùng kỳ điều chỉnh riêng.'),{status:409});
    const periodResult = await client.query(
      "select * from local_payroll_periods where period_start=$1::date and period_end=$2::date for update",
      [periodStart, periodEnd],
    );
    let period = periodResult.rows[0];
    if (!period) {
      const inserted = await client.query(
        "insert into local_payroll_periods(period_start, period_end, standard_days) values($1,$2,$3) returning *",
        [periodStart, periodEnd, standardDays],
      );
      period = inserted.rows[0];
    }
    if (period.status === "CLOSED")
      throw new Error("Kỳ lương đã đóng, hãy tạo kỳ điều chỉnh riêng.");
    const preflight = await payrollPreflight(
      client,
      periodStart,
      periodEnd,
      standardDays,
      requestedWorkerIds,
    );
    if (monthly) {
      preflight.issues = preflight.issues.filter(issue => !['UNAPPROVED_ATTENDANCE','UNAPPROVED_PRODUCTION','UNAPPROVED_OVERTIME','UNAPPROVED_ADJUSTMENT'].includes(issue.code));
      preflight.blocking_count = preflight.issues.filter(issue => issue.severity === 'BLOCKING').length;
    }
    if(preflight.blocking_count>0){
      if(self){
        await payrollSelfWorker(client,self.actor,self.workerId);
        const pending=await payrollPendingIssues(client,periodStart,periodEnd,[self.workerId]);
        const projected={month:periodStart.slice(0,7),status:'BLOCKED',calculated_at:new Date().toISOString(),amounts:null,items:[],pending_count:pending.length,pending_message:pending.length?'Nguồn đang chờ duyệt chưa được tính vào lương.':null,issues:preflight.issues.filter(issue=>!issue.worker_id||issue.worker_id===self.workerId).map(issue=>({code:issue.code,message:'Cấu hình hoặc nguồn lương của bạn cần được quản lý kiểm tra.'}))};
        await client.query('ROLLBACK');return projected;
      }
      throw Object.assign(new Error(`Còn ${preflight.blocking_count} lỗi chặn; cần duyệt cấu hình/đối soát nguồn trước khi tính.`),{status:409,preflight});
    }
    const resolvedWorkerIds = preflight.resolved_worker_ids;
    const sourceFingerprint = await capturePayrollSourceFingerprint(client, periodStart, periodEnd, standardDays, requestedWorkerIds);
    if (monthly && !self) {
      const candidates = (await client.query(`select r.*,p.period_start::text,p.period_end::text from local_payroll_runs r join local_payroll_periods p on p.id=r.period_id
        where r.period_id=$1 and r.status='PREVIEW' and r.calculation_version='local-payroll-v3' order by r.run_number desc`,[period.id])).rows;
      const current = candidates.find(run => payrollRunMatchesRequest(run,periodStart,periodEnd,standardDays,requestedWorkerIds)
        && run.config_snapshot?.source_fingerprint?.sha256===sourceFingerprint.sha256
        && JSON.stringify(run.config_snapshot?.worker_scope?.resolved_worker_ids)===JSON.stringify(preflight.resolved_worker_ids));
      if (current) { await client.query('COMMIT'); return localPayrollRunDetails(String(current.id)); }
    }

    const attendanceResult = await client.query(
      `
      select a.id::text id, a.worker_id::text worker_id, a.attendance_method, a.work_date::text work_date,
        a.day_units::numeric::text day_units,a.worked_minutes::numeric::text worked_minutes,
        a.monthly_salary_snapshot::numeric::text day_unit_rate,
        (a.worked_minutes / 60::numeric)::numeric::text worked_hours,
        a.rate_amount::numeric::text unit_rate,a.monthly_salary_snapshot::numeric::text monthly_salary_snapshot,a.rate_basis,a.notes,
        a.check_in_time::text check_in_time, a.check_out_time::text check_out_time,
        a.break_minutes
      from local_attendance a
      where a.workflow_status in ('APPROVED','LOCKED') and a.is_reversed=false
        and a.work_date >= $1::date and a.work_date <= $2::date
        and ($4::uuid[] is null or a.worker_id = any($4::uuid[]))
        and a.attendance_method in ('DAY','HOUR') and ($3::numeric is null or $3::numeric>0)
      order by a.work_date, a.created_at`,
      [periodStart, periodEnd, standardDays, resolvedWorkerIds],
    );
    const productionResult = await client.query(
      `
       select e.id::text id, e.worker_id::text worker_id, e.product_id::text product_id,
         e.piece_rate_code, e.piece_rate_name_snapshot, e.rate_unit_snapshot,
        e.work_date::text work_date, e.quantity::numeric::text quantity,
         e.rate_amount::numeric::text unit_rate, p.sku product_sku, coalesce(e.piece_rate_name_snapshot, p.name) product_name, e.notes
      from local_production_entries e
       left join local_products p on p.id=e.product_id
      where e.workflow_status in ('APPROVED','LOCKED') and e.is_reversed=false
        and e.work_date >= $1::date and e.work_date <= $2::date
        and ($3::uuid[] is null or e.worker_id = any($3::uuid[]))
      order by e.work_date, e.created_at`,
      [periodStart, periodEnd, resolvedWorkerIds],
    );
    const overtimeResult = await client.query(
      `
      select o.id::text id, o.worker_id::text worker_id, o.work_date::text work_date,
        o.overtime_type, o.overtime_minutes, (o.overtime_minutes::numeric / 60::numeric)::numeric::text overtime_hours, o.reason
      from local_overtime o
      where o.status in ('APPROVED','LOCKED') and o.work_date >= $1::date and o.work_date <= $2::date
        and ($3::uuid[] is null or o.worker_id = any($3::uuid[]))
      order by o.work_date, o.created_at`,
      [periodStart, periodEnd, resolvedWorkerIds],
    );
    const mealResult = await client.query(
      `
      select d.id::text id, d.worker_id::text worker_id, d.work_date::text work_date, d.reason
      from local_day_statuses d
      where d.status='PRESENT' and d.meal_eligible=true and d.work_date >= $1::date and d.work_date <= $2::date
        and ($3::uuid[] is null or d.worker_id = any($3::uuid[]))
      order by d.work_date`,
      [periodStart, periodEnd, resolvedWorkerIds],
    );
    const insuranceResult = await client.query(
      `
      select distinct on (s.worker_id)
        s.id::text id, s.worker_id::text worker_id, s.calculation_type,
        s.employee_amount::numeric::text employee_amount, s.currency_code,
        s.effective_from::text effective_from, s.effective_to::text effective_to,
        s.status, s.source_reference, s.reason, s.created_by, s.approved_by,
        s.approved_at::text approved_at
      from local_social_insurance_versions s
      where s.status='APPROVED'
        and s.effective_from <= $1::date
        and (s.effective_to is null or s.effective_to >= $1::date)
        and ($2::uuid[] is null or s.worker_id = any($2::uuid[]))
      order by s.worker_id, s.effective_from desc, s.created_at desc`,
      [periodEnd, resolvedWorkerIds],
    );
    const workerProfileResult = await client.query(
      `
      select distinct on (p.worker_id)
        p.id::text id,p.worker_id::text worker_id,p.piece_output_enabled,p.overtime_enabled,p.meal_enabled,
        p.allowances_enabled,p.deductions_enabled,p.insurance_enabled,
        p.fixed_allowance_amount::numeric::text fixed_allowance_amount,
        p.fixed_deduction_amount::numeric::text fixed_deduction_amount,
        p.effective_from::text effective_from,p.effective_to::text effective_to
      from local_worker_payroll_profiles p
      where p.status='APPROVED' and p.effective_from <= $1::date
        and (p.effective_to is null or p.effective_to >= $1::date)
        and ($2::uuid[] is null or p.worker_id = any($2::uuid[]))
      order by p.worker_id,p.effective_from desc,p.created_at desc`,
      [periodEnd, resolvedWorkerIds],
    );
    const adjustmentResult = await client.query(
      `
      select a.id::text id, a.worker_id::text worker_id, a.item_type, a.item_direction,
        a.amount::numeric::text amount, a.reason, a.source_reference,
        a.created_by, a.submitted_by, a.approved_by, a.approved_at::text approved_at
      from local_payroll_adjustments a
      where a.period_id=$1 and a.status='APPROVED'
        and ($2::uuid[] is null or a.worker_id = any($2::uuid[]))
      order by a.created_at`,
      [period.id, resolvedWorkerIds],
    );
    const sourceEnabled = async (workerId:string, source:string, date:string) => (await payrollSourceContext(client,workerId,date)).profile[source]===true;
    const facts: PayrollFact[] = [];

    for (const row of attendanceResult.rows) {
      const context=await payrollSourceContext(client,row.worker_id,row.work_date);
      const scope=context.assignment;
      if (row.attendance_method === "DAY") {
        if (
          !["MONTHLY_MANAGER", "MONTHLY_HELPER"].includes(
            String(scope.compensation_type),
          ) ||
          Number(row.day_units) <= 0 ||
          Number(row.monthly_salary_snapshot) <= 0
        )
          continue;
        const calendar=await resolvePayrollCalendar(client,periodStart,periodEnd,context.location);
        row.day_unit_rate=(await client.query('select ($1::numeric/$2::numeric)::text unit_rate',[row.monthly_salary_snapshot,calendar.days_numeric])).rows[0].unit_rate;
        facts.push({
          workerId: row.worker_id,
          sourceType: "ATTENDANCE",
          sourceId: row.id,
          itemType: "DAY_PAY",
          itemDirection: "EARNING",
          workDate: row.work_date,
          quantity: row.day_units,
          unitRate: row.day_unit_rate,
          multiplier: "1",
          formula:
            "monthly_salary_snapshot / standard_days × approved_day_units",
          details: {
            calculation_version: "local-payroll-v3",
            method: "DAY",
            rate_basis: row.rate_basis || "MONTHLY_SALARY",
            monthly_salary_snapshot: row.monthly_salary_snapshot,
            standard_days: calendar.days_numeric,
            calendar_snapshot: calendar,
            approved_day_units: row.day_units,
            notes: row.notes,
          },
        });
      } else if (row.attendance_method === "HOUR") {
        if (
          scope.compensation_type !== "HOURLY" ||
          Number(row.worked_minutes) <= 0 ||
          Number(row.unit_rate) <= 0 ||
          !row.check_in_time ||
          !row.check_out_time
        )
          continue;
        facts.push({
          workerId: row.worker_id,
          sourceType: "ATTENDANCE",
          sourceId: row.id,
          itemType: "HOURLY_PAY",
          itemDirection: "EARNING",
          workDate: row.work_date,
          quantity: row.worked_hours,
          unitRate: row.unit_rate,
          multiplier: "1",
          formula: "worked_minutes / 60 × hourly_rate_snapshot",
          details: {
            calculation_version: "local-payroll-v3",
            method: "HOUR",
            rate_basis: row.rate_basis || "HOURLY_RATE_CLOCK",
            worked_minutes: row.worked_minutes,
            hourly_rate_snapshot: row.unit_rate,
            check_in_time: row.check_in_time,
            check_out_time: row.check_out_time,
            break_minutes: row.break_minutes,
            notes: row.notes,
          },
        });
      }
    }
    for (const row of productionResult.rows) {
      if (!await sourceEnabled(row.worker_id, "piece_output_enabled",row.work_date)) continue;
      if (Number(row.quantity) <= 0 || Number(row.unit_rate) <= 0) continue;
      facts.push({
        workerId: row.worker_id,
        sourceType: "PRODUCTION_ENTRY",
        sourceId: row.id,
        itemType: "PIECE_RATE",
        itemDirection: "EARNING",
        workDate: row.work_date,
        quantity: row.quantity,
        unitRate: row.unit_rate,
        multiplier: "1",
        formula: "approved_product_quantity × product_rate_snapshot",
        details: {
          calculation_version: "local-payroll-v3",
          rate_basis: "PRODUCT_RATE",
          product_id: row.product_id,
          piece_rate_code: row.piece_rate_code,
          product_sku: row.product_sku,
          product_name: row.product_name,
          notes: row.notes,
        },
      });
    }
    for(const row of overtimeResult.rows) {
      const context=await payrollSourceContext(client,row.worker_id,row.work_date);
      if(!context.profile.overtime_enabled)continue;
      const rule=await resolvePayrollRule(client,'OT',row.work_date,context.assignment.payroll_policy_group_id,context.location,row.overtime_type);
      const calendar=await resolvePayrollCalendar(client,periodStart,periodEnd,context.location);
      const rate=rule.calculation_method==='FIXED_RATE'?null:await payrollV3OvertimeRate(client,context,row.work_date,calendar);
      facts.push({workerId:row.worker_id,sourceType:'OVERTIME',sourceId:row.id,itemType:'OVERTIME_PAY',itemDirection:'EARNING',workDate:row.work_date,quantity:row.overtime_hours,
        unitRate:rule.calculation_method==='FIXED_RATE'?rule.fixed_numeric:rate!.unit_rate,multiplier:rule.calculation_method==='FIXED_RATE'?'1':rule.multiplier_numeric,
        formula:rule.calculation_method==='FIXED_RATE'?'overtime_minutes / 60 × approved_fixed_rate':'overtime_minutes / 60 × resolved_base_rate × approved_multiplier',
        details:{calculation_version:'local-payroll-v3',overtime_type:row.overtime_type,overtime_minutes:row.overtime_minutes,rule_snapshot:rule,calendar_snapshot:calendar,rate_snapshot:rate,assignment_id:context.assignment.id,profile_id:context.profile.id}});
    }
    for(const row of mealResult.rows) {
      const context=await payrollSourceContext(client,row.worker_id,row.work_date);if(!context.profile.meal_enabled)continue;
      const rule=await resolvePayrollRule(client,'MEAL',row.work_date,context.assignment.payroll_policy_group_id,context.location);
      facts.push({workerId:row.worker_id,sourceType:'DAY_STATUS',sourceId:row.id,itemType:'MEAL_ALLOWANCE',itemDirection:'EARNING',workDate:row.work_date,quantity:'1',unitRate:rule.meal_numeric,multiplier:'1',formula:'eligible_present_day × approved_meal_rate',details:{calculation_version:'local-payroll-v3',rule_snapshot:rule,assignment_id:context.assignment.id,profile_id:context.profile.id}});
    }
    for (const row of insuranceResult.rows) {
      if (!await sourceEnabled(row.worker_id, "insurance_enabled",periodEnd)) continue;
      facts.push({
        workerId: row.worker_id,
        sourceType: "SOCIAL_INSURANCE_VERSION",
        sourceId: row.id,
        itemType: "SOCIAL_INSURANCE",
        itemDirection: "DEDUCTION",
        workDate: periodEnd,
        quantity: "1",
        unitRate: row.employee_amount ?? "0",
        multiplier: "1",
        details: {
          calculation_version: "local-payroll-v3",
          calculation_type: row.calculation_type,
          employee_amount: row.employee_amount,
          currency_code: row.currency_code,
          effective_from: row.effective_from,
          effective_to: row.effective_to,
          status: row.status,
          source_reference: row.source_reference,
          reason: row.reason,
          created_by: row.created_by,
          approved_by: row.approved_by,
          approved_at: row.approved_at,
          effective_on_period_end: periodEnd,
          fixed_amount: true,
        },
      });
    }
    for (const row of workerProfileResult.rows) {
      if (row.allowances_enabled && Number(row.fixed_allowance_amount) > 0) {
        facts.push({
          workerId: row.worker_id,
          sourceType: "WORKER_PAYROLL_PROFILE",
          sourceId: row.id,
          itemType: "FIXED_ALLOWANCE",
          itemDirection: "EARNING",
          workDate: periodEnd,
          quantity: "1",
          unitRate: row.fixed_allowance_amount,
          multiplier: "1",
          formula: "fixed_allowance_per_period",
          details: {
            calculation_version: "local-payroll-v3",
            effective_from: row.effective_from,
            effective_to: row.effective_to,
            fixed_profile: true,
          },
        });
      }
      if (row.deductions_enabled && Number(row.fixed_deduction_amount) > 0) {
        facts.push({
          workerId: row.worker_id,
          sourceType: "WORKER_PAYROLL_PROFILE",
          sourceId: row.id,
          itemType: "FIXED_DEDUCTION",
          itemDirection: "DEDUCTION",
          workDate: periodEnd,
          quantity: "1",
          unitRate: row.fixed_deduction_amount,
          multiplier: "1",
          formula: "fixed_deduction_per_period",
          details: {
            calculation_version: "local-payroll-v3",
            effective_from: row.effective_from,
            effective_to: row.effective_to,
            fixed_profile: true,
          },
        });
      }
    }
    for (const row of adjustmentResult.rows) {
      facts.push({
        workerId: row.worker_id,
        sourceType: "PAYROLL_ADJUSTMENT",
        sourceId: row.id,
        itemType: row.item_type,
        itemDirection:
          row.item_direction === "DEDUCTION" ? "DEDUCTION" : "EARNING",
        workDate: periodEnd,
        quantity: "1",
        unitRate: row.amount,
        multiplier: "1",
        formula: "approved_adjustment_amount",
        details: {
          calculation_version: "local-payroll-v3",
          reason: row.reason,
          source_reference: row.source_reference,
          created_by: row.created_by,
          submitted_by: row.submitted_by,
          approved_by: row.approved_by,
          approved_at: row.approved_at,
          adjustment: true,
        },
      });
    }
    const inputHash = createHash("sha256")
      .update(
        JSON.stringify({
          periodStart,
          periodEnd,
          standardDays,
          workerScope: {
            requestedWorkerIds: requestedWorkerIds ?? null,
            resolvedWorkerIds: preflight.resolved_worker_ids,
          },
          calendars: preflight.calendars,
          policy_model: "explicit-scoped-versions",
          facts,
        }),
      )
      .digest("hex");
    // Keep one active preview per open period. Older previews remain immutable
    // for audit/history, but cannot be mistaken for the current calculation.
    const supersededResult = self ? {rows:[]} : await client.query(
      "update local_payroll_runs set status='SUPERSEDED' where period_id=$1 and status='PREVIEW' returning id",
      [period.id],
    );
    for (const superseded of supersededResult.rows) {
      await client.query(
        "insert into local_payroll_audit_events(entity_type,entity_id,action,reason,actor_id) values('payroll_runs',$1,'SUPERSEDE',$2,$3)",
        [
          superseded.id,
          `Run mới cho kỳ ${periodStart} - ${periodEnd}`,
          currentLocalActor(),
        ],
      );
    }
    const runNumberResult = await client.query(
      "select coalesce(max(run_number), 0) + 1 run_number from local_payroll_runs where period_id=$1",
      [period.id],
    );
    const runResult = await client.query(
      `
      insert into local_payroll_runs(period_id, run_number, calculation_version, standard_days_snapshot, config_snapshot, input_hash, idempotency_key)
      values($1, $2, 'local-payroll-v3', $3, $4::jsonb, $5, $6) returning id`,
      [
        period.id,
        runNumberResult.rows[0].run_number,
        standardDays,
        JSON.stringify({
          calculation_version: "local-payroll-v3",
          source_fingerprint: sourceFingerprint,
          standard_days: standardDays,
          worker_scope: {
            requested_worker_ids: requestedWorkerIds ?? null,
            resolved_worker_ids: preflight.resolved_worker_ids,
          },
          calendars: preflight.calendars,
          policy_model: "explicit-scoped-versions",
        }),
        inputHash,
        idempotencyKey,
      ],
    );
    const runId = runResult.rows[0].id;
    await client.query(
      "insert into local_payroll_audit_events(entity_type,entity_id,action,reason,actor_id) values('payroll_runs',$1,'CREATE',$2,$3)",
      [
        runId,
        `Tạo preview kỳ ${periodStart} - ${periodEnd}`,
        currentLocalActor(),
      ],
    );
    for (const issue of preflight.issues) {
      await client.query(
        `
        insert into local_payroll_exceptions(run_id,severity,code,worker_id,source_type,source_id,message)
        values($1,$2,$3,$4,$5,$6,$7)`,
        [
          runId,
          issue.severity,
          issue.code,
          issue.worker_id ?? null,
          issue.source_type ?? null,
          issue.source_id ?? null,
          issue.message,
        ],
      );
    }
    const workerIds = [
      ...new Set(preflight.workers.map((worker) => worker.worker_id)),
    ];
    const recordMap = new Map<string, string>();
    for (const workerId of workerIds) {
      const recordResult = await client.query(
        `insert into local_payroll_records(run_id,worker_id,employee_identity_snapshot) select $1,id,jsonb_build_object('employee_code',employee_code,'display_name',display_name,'worker_type',worker_type,'location_code',location_code,'version',1) from local_workers where id=$2 returning id`,
        [runId, workerId],
      );
      recordMap.set(workerId, recordResult.rows[0].id);
    }
    for (const fact of facts) {
      const recordId = recordMap.get(fact.workerId);
      if (!recordId) continue;
      await client.query(
        `
        insert into local_payroll_items(payroll_record_id, worker_id, item_type, item_direction, source_type, source_id, quantity, unit_rate, multiplier, amount_precise, formula, details)
        values($1,$2,$3,$4,$5,$6,$7::numeric,$8::numeric,$9::numeric,$7::numeric*$8::numeric*$9::numeric,$10,$11::jsonb)`,
        [
          recordId,
          fact.workerId,
          fact.itemType,
          fact.itemDirection,
          fact.sourceType,
          fact.sourceId,
          fact.quantity,
          fact.unitRate,
          fact.multiplier,
          fact.formula ??
            `${fact.itemType} = quantity x unit_rate x multiplier`,
          JSON.stringify(fact.details),
        ],
      );
    }
    await client.query(
      `
      update local_payroll_records r set
        gross_amount = coalesce((select sum(i.amount_precise) from local_payroll_items i where i.payroll_record_id=r.id and i.item_direction='EARNING'),0),
        deductions_amount = coalesce((select sum(i.amount_precise) from local_payroll_items i where i.payroll_record_id=r.id and i.item_direction='DEDUCTION'),0),
        net_amount = coalesce((select sum(case when i.item_direction='EARNING' then i.amount_precise else -i.amount_precise end) from local_payroll_items i where i.payroll_record_id=r.id),0)
      where r.run_id=$1`,
      [runId],
    );
    await client.query(
      `
      insert into local_payroll_exceptions(run_id,severity,code,worker_id,message)
      select $1,'BLOCKING','NEGATIVE_NET',r.worker_id,
        'Thực nhận âm; cần xử lý điều chỉnh trước khi khóa kỳ lương.'
      from local_payroll_records r
      where r.run_id=$1 and r.net_amount < 0
        and not exists (
          select 1 from local_payroll_exceptions e
          where e.run_id=$1 and e.worker_id=r.worker_id and e.code='NEGATIVE_NET'
        )`,
      [runId],
    );
    await client.query(
      `update local_payroll_records set payment_amount=round(net_amount,0), rounding_delta=round(net_amount,0)-net_amount where run_id=$1`,
      [runId],
    );
    if (self) {const projected=await projectSelfPayrollMonth(client,String(runId),self,periodStart,periodEnd,'PREVIEW');await client.query('ROLLBACK');return projected;}
    await client.query("COMMIT");
    return localPayrollRunDetails(runId);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

app.get("/api/payroll/runs", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      select r.id, r.period_id, r.run_number, r.status, r.calculation_version, r.standard_days_snapshot, r.config_snapshot, r.input_hash,
        r.idempotency_key, r.created_at, r.locked_at, p.period_start, p.period_end, p.status period_status,
        coalesce((select sum(pr.gross_amount) from local_payroll_records pr where pr.run_id=r.id),0) gross_total,
        coalesce((select sum(pr.deductions_amount) from local_payroll_records pr where pr.run_id=r.id),0) deductions_total,
        coalesce((select sum(pr.net_amount) from local_payroll_records pr where pr.run_id=r.id),0) net_total,
        coalesce((select sum(pr.payment_amount) from local_payroll_records pr where pr.run_id=r.id),0) payment_total,
        (select count(*)::int from local_payroll_records pr where pr.run_id=r.id) record_count,
        (select count(*)::int from local_payroll_exceptions px where px.run_id=r.id and px.severity='BLOCKING' and px.resolved_at is null) blocking_exception_count
      from local_payroll_runs r join local_payroll_periods p on p.id=r.period_id
      group by r.id,p.id order by r.created_at desc`);
    res.json(
      rows.map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([key, value]) => [
            key,
            [
              "gross_total",
              "deductions_total",
              "net_total",
              "payment_total",
              "standard_days_snapshot",
            ].includes(key)
              ? asNumber(value)
              : value,
          ]),
        ),
      ),
    );
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/payroll/runs/:id", async (req, res) => {
  try {
    res.json(await localPayrollRunDetails(req.params.id));
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/payroll/runs/:id/reconciliation", async (req,res) => {
  res.setHeader('cache-control','no-store');
  try {res.json(await readPayrollReconciliation(pool,req.params.id));}
  catch(error){sendError(res,error);}
});

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

app.get("/api/payroll/runs/:id/export.csv", async (req, res) => {
  try {
    const reconciliation=await readPayrollReconciliation(pool,req.params.id);
    const details:Record<string,unknown>&{records:Record<string,unknown>[];items:Record<string,unknown>[]}={...reconciliation.run,records:reconciliation.rows.filter(row=>row.record_id).map(row=>({...row,id:row.record_id})),items:reconciliation.items};
    const recordsById = new Map(
      details.records.map((record) => [String(record.id), record]),
    );
    const header = [
      "run_id",
      "period_start",
      "period_end",
      "status",
      "employee_code",
      "worker_name",
      "location_code",
      "identity_source",
      "item_type",
      "source_type",
      "source_id",
      "quantity",
      "unit_rate",
      "multiplier",
      "amount_precise",
      "formula",
      "gross_amount",
      "deductions_amount",
      "net_amount",
      "payment_amount",
    ];
    const lines = [header.map(csvCell).join(",")];
    for (const item of details.items) {
      const record = recordsById.get(String(item.payroll_record_id));
      lines.push(
        [
          details.id,
          details.period_start,
          details.period_end,
          details.status,
          record?.employee_code,
          record?.worker_name,
          record?.location_code,
          record?.identity_source,
          item.item_type,
          item.source_type,
          item.source_id,
          item.quantity,
          item.unit_rate,
          item.multiplier,
          item.amount_precise,
          item.formula,
          record?.gross_amount,
          record?.deductions_amount,
          record?.net_amount,
          record?.payment_amount,
        ]
          .map(csvCell)
          .join(","),
      );
    }
    {
      const represented=new Set(details.items.map(item=>String(item.payroll_record_id)));
      for (const record of details.records.filter(record=>!represented.has(String(record.id)))) {
        lines.push(
          [
            details.id,
            details.period_start,
            details.period_end,
            details.status,
            record.employee_code,
            record.worker_name,
            record.location_code,
            record.identity_source,
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            record.gross_amount,
            record.deductions_amount,
            record.net_amount,
            record.payment_amount,
          ]
            .map(csvCell)
            .join(","),
        );
      }
    }
    const fileName = `payroll-${String(details.period_start)}-${String(details.period_end)}-run-${String(details.run_number)}.csv`;
    res.setHeader("content-type", "text/csv; charset=utf-8");
    res.setHeader("content-disposition", `attachment; filename="${fileName}"`);
    res.send(Buffer.from(`\uFEFF${lines.join("\r\n")}\r\n`, "utf8"));
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/payroll/runs", async (req, res) => {
  try {
    res.status(201).json(await createLocalPayrollRun(req.body));
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/payroll/runs/:id/lock", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Wait for in-flight source writes and prevent new ones until the period
    // status is durably CLOSED/LOCKED.
    await client.query(
      "select pg_advisory_xact_lock(hashtextextended('local-attendance-payroll-source-guard', 0))",
    );
    const runResult = await client.query(
      `
      select r.id,r.status,r.period_id,r.config_snapshot,r.standard_days_snapshot,p.status period_status,p.period_start,p.period_end
      from local_payroll_runs r join local_payroll_periods p on p.id=r.period_id
      where r.id=$1 for update`,
      [req.params.id],
    );
    const run = runResult.rows[0];
    if (!run) throw new Error("Không tìm thấy kỳ tính lương.");
    if (run.status === "LOCKED") {
      await client.query("COMMIT");
      return res.json(await localPayrollRunDetails(req.params.id));
    }
    if (run.status !== "PREVIEW")
      throw new Error("Chỉ có thể khóa run ở trạng thái xem trước.");
    if (run.period_status === "CLOSED")
      throw new Error(
        "Kỳ lương đã đóng bởi một run khác; hãy xem run đã khóa hoặc tạo kỳ điều chỉnh riêng.",
      );
    if ((await client.query("select 1 from local_payroll_periods where id<>$3 and status='CLOSED' and period_start <= $2::date and period_end >= $1::date limit 1", [run.period_start,run.period_end,run.period_id])).rows[0])
      throw Object.assign(new Error('Kỳ lương giao với kỳ đã đóng; không thể khóa trùng nguồn.'),{status:409});
    const pendingIssues = await payrollPendingIssues(client, String(run.period_start), String(run.period_end));
    if (pendingIssues.length) throw Object.assign(new Error(`Chưa thể khóa: còn ${pendingIssues.length} phiếu nháp/chờ duyệt trong toàn kỳ, kể cả ngoài phạm vi preview. ${pendingIssues.slice(0,3).map(issue=>issue.message).join(" ")}`), {status:409});
    const fingerprint = run.config_snapshot?.source_fingerprint;
    if (!fingerprint || fingerprint.version !== 2 || typeof fingerprint.sha256 !== 'string')
      throw Object.assign(new Error('Preview cũ chưa có đối soát nguồn. Vui lòng tính lại bảng lương trước khi khóa.'), {status:409});
    const storedScope = storedPayrollRunWorkerScope(run.config_snapshot);
    if (storedScope === "INVALID") throw Object.assign(new Error("Phạm vi payroll không hợp lệ; vui lòng tính lại."),{status:409});
    const requestedScope = storedScope ?? undefined;
    const currentFingerprint = await capturePayrollSourceFingerprint(client, String(run.period_start), String(run.period_end), run.standard_days_snapshot===null?null:Number(run.standard_days_snapshot), requestedScope);
    if (currentFingerprint.sha256 !== fingerprint.sha256)
      throw Object.assign(new Error('Nguồn tính lương đã thay đổi sau preview. Vui lòng tính lại bảng lương trước khi khóa.'), {status:409});
    const currentPreflight = await payrollPreflight(client, String(run.period_start), String(run.period_end), run.standard_days_snapshot===null?null:Number(run.standard_days_snapshot), requestedScope);
    if (currentPreflight.blocking_count > 0)
      throw Object.assign(new Error('Nguồn hiện tại còn lỗi BLOCKING. Vui lòng kiểm tra và tính lại bảng lương.'), {status:409});
    const blocking = await client.query(
      "select count(*)::int count from local_payroll_exceptions where run_id=$1 and severity='BLOCKING' and resolved_at is null",
      [req.params.id],
    );
    if (blocking.rows[0].count > 0)
      throw new Error("Run còn lỗi BLOCKING, chưa thể khóa bảng lương.");
    const scopeGuard = await capturePayrollLockScopeGuard(client, run);
    if (scopeGuard) {
      await client.query(
        "update local_payroll_runs set config_snapshot=config_snapshot || $2::jsonb where id=$1",
        [req.params.id, JSON.stringify({ worker_scope_lock: scopeGuard })],
      );
      await client.query(
        "insert into local_payroll_audit_events(entity_type,entity_id,action,reason,actor_id) values('payroll_runs',$1,'LOCK_SCOPE_CHECK',$2,$3)",
        [
          req.params.id,
          `Đã đối soát phạm vi khóa: ${scopeGuard.current_real_eligible_worker_ids.length} nhân sự thực; loại ${scopeGuard.omitted_test_worker_count} dữ liệu kiểm thử khỏi preview.`,
          currentLocalActor(),
        ],
      );
    }
    await client.query(
      "update local_payroll_runs set status='LOCKED',locked_at=now() where id=$1",
      [req.params.id],
    );
    const supersededResult = await client.query(
      "update local_payroll_runs set status='SUPERSEDED' where period_id=$1 and status='PREVIEW' and id<>$2 returning id",
      [run.period_id, req.params.id],
    );
    for (const superseded of supersededResult.rows) {
      await client.query(
        "insert into local_payroll_audit_events(entity_type,entity_id,action,reason,actor_id) values('payroll_runs',$1,'SUPERSEDE',$2,$3)",
        [
          superseded.id,
          `Run ${req.params.id} được khóa cho kỳ ${run.period_start} - ${run.period_end}`,
          currentLocalActor(),
        ],
      );
    }
    await client.query(
      "update local_payroll_periods set status='CLOSED',closed_at=now() where id=$1",
      [run.period_id],
    );
    await client.query(
      "insert into local_payroll_audit_events(entity_type,entity_id,action,reason,actor_id) values('payroll_runs',$1,'LOCK',$2,$3)",
      [req.params.id, "Khóa snapshot bảng lương", currentLocalActor()],
    );
    const adjustmentIds = await client.query(
      `
      select distinct i.source_id::uuid id
      from local_payroll_items i
      join local_payroll_records r on r.id=i.payroll_record_id
      where r.run_id=$1 and i.source_type='PAYROLL_ADJUSTMENT'`,
      [req.params.id],
    );
    if (adjustmentIds.rows.length) {
      await client.query(
        `
        update local_payroll_adjustments
        set status='LOCKED', locked_run_id=$1, locked_at=now()
        where id = any($2::uuid[]) and status='APPROVED'`,
        [req.params.id, adjustmentIds.rows.map((row) => row.id)],
      );
    }
    await client.query("COMMIT");
    res.json(await localPayrollRunDetails(req.params.id));
  } catch (error) {
    await client.query("ROLLBACK");
    sendError(res, error);
  } finally {
    client.release();
  }
});

app.get("/api/production-attendance", async (req, res) => {
  try {
    const orderId = String(req.query.orderId || "");
    res.json(
      await attendanceRowQuery(
        orderId
          ? "a.production_order_id=$1 and a.work_date >= $2::date and a.work_date < ($2::date + interval '1 month')"
          : "a.work_date >= $1::date and a.work_date < ($1::date + interval '1 month')",
        orderId
          ? [orderId, monthStart(req.query.month)]
          : [monthStart(req.query.month)],
        Boolean(req.query.includeReversed),
      ),
    );
  } catch (error) {
    sendError(res, error);
  }
});
app.get("/api/production-attendance/assignments", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `select a.*,w.employee_code,w.display_name worker_name,w.worker_type from local_assignments a join local_workers w on w.id=a.worker_id where a.production_order_id=$1 order by a.assigned_from`,
      [req.query.orderId],
    );
    res.json(rows);
  } catch (error) {
    sendError(res, error);
  }
});
app.post("/api/production-attendance/assignments", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `insert into local_assignments(production_order_id,production_order_operation_id,worker_id,assigned_from,assigned_to,notes) values($1,$2,$3,$4,$5,$6) returning *`,
      [
        req.body.production_order_id,
        req.body.production_order_operation_id || null,
        req.body.worker_id,
        req.body.assigned_from,
        req.body.assigned_to || null,
        req.body.notes || null,
      ],
    );
    const w = await pool.query(
      "select employee_code,display_name worker_name,worker_type from local_workers where id=$1",
      [req.body.worker_id],
    );
    res.status(201).json({ ...rows[0], ...w.rows[0], is_active: true });
  } catch (error) {
    sendError(res, error);
  }
});
app.patch("/api/production-attendance/assignments/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "update local_assignments set assigned_to=$2,is_active=false,notes=coalesce($3,notes) where id=$1 returning *",
      [
        req.params.id,
        req.body.assignedTo || req.body.assigned_to,
        req.body.reason || null,
      ],
    );
    if (!rows[0]) throw new Error("Không tìm thấy phân công.");
    const w = await pool.query(
      "select employee_code,display_name worker_name,worker_type from local_workers where id=$1",
      [rows[0].worker_id],
    );
    res.json({ ...rows[0], ...w.rows[0] });
  } catch (error) {
    sendError(res, error);
  }
});
app.post(
  "/api/production-attendance/assignment-enforcement",
  async (req, res) =>
    res.json({
      id: req.body.production_order_id,
      attendance_assignment_enforced: Boolean(req.body.enforced),
      status: "IN_PROGRESS",
    }),
);
app.post("/api/production-attendance/:id/reverse", async (req, res) => {
  try {
    assertLocalReviewTarget("REVERSED");
    const key = workflowKey(req.body);
    const reason = workflowReason(req.body);
    if (!reason)
      throw new Error("Bắt buộc nhập lý do đảo bản ghi chấm công sản xuất.");
    const result = await withLocalTransaction(async (client) => {
      await lockAttendanceIdempotency(client, "ATTENDANCE", key);
      const replay = await workflowReplay(client, key, "ATTENDANCE");
      if (replay) {
        assertWorkflowReplayMatches(replay, key, {
          entityId: req.params.id,
          action: "REVERSE",
          toStatus: "REVERSED",
          reason,
        });
        return {
          id: replay.entity_id,
          labor_fact_id: replay.entity_id,
          status: "REVERSED",
          reused: true,
        };
      }
      const candidate = await client.query(
        "select worker_id,work_date from local_attendance where id=$1",
        [req.params.id],
      );
      if (!candidate.rows[0])
        throw new Error("Không tìm thấy bản ghi chấm công sản xuất.");
      await lockAttendanceDay(
        client,
        String(candidate.rows[0].worker_id),
        String(candidate.rows[0].work_date),
      );
      const current = await client.query(
        "select id,worker_id,work_date,workflow_status,is_reversed from local_attendance where id=$1 for update",
        [req.params.id],
      );
      if (!current.rows[0])
        throw new Error("Không tìm thấy bản ghi chấm công sản xuất.");
      const row = current.rows[0];
      await assertLocalReviewScope(
        client,
        String(row.worker_id),
        String(row.work_date),
        "ATTENDANCE",
        req.params.id,
      );
      if (row.is_reversed || String(row.workflow_status) === "REVERSED")
        return {
          id: row.id,
          labor_fact_id: row.id,
          status: "REVERSED",
          reused: true,
        };
      await assertWorkflowWritable(
        client,
        String(row.worker_id),
        String(row.work_date),
        String(row.workflow_status),
      );
      const { rows } = await client.query(
        "update local_attendance set is_reversed=true,workflow_status='REVERSED',reversal_reason=$2,workflow_reason=$2,workflow_at=now(),workflow_actor_id=$3 where id=$1 and is_reversed=false returning id",
        [req.params.id, reason, currentLocalActor()],
      );
      if (!rows[0])
        throw new Error(
          "Bản ghi chấm công sản xuất đã thay đổi, vui lòng tải lại.",
        );
      await recordWorkflowEvent(
        client,
        "ATTENDANCE",
        req.params.id,
        "REVERSE",
        String(row.workflow_status),
        "REVERSED",
        reason,
        key,
      );
      return {
        id: req.params.id,
        labor_fact_id: req.params.id,
        status: "REVERSED",
        reused: false,
      };
    });
    res.json(result);
  } catch (error) {
    sendError(res, error);
  }
});

const port = runtime.port;
const databaseStartup = runtime.startupMode === 'verify-item5a'
  ? (async () => {
      try {
        const result = await bootstrapDatabase();
      console.log('Item5A technical verify-and-exit passed; no API listener, sync, or integration was started.', result);
      } finally {
        // Technical verification must release the client pool on both pass and
        // failure; no API listener or scheduler is created in this branch.
        await pool.end();
      }
    })()
  : runtime.startupMode === 'serve-installed'
    ? (async () => {
        try {
          await bootstrapDatabase();
          return app.listen(port, runtime.host, () => {
            console.log(`Local CRM API installed and listening on http://127.0.0.1:${port}`);
          });
        } catch (error) {
          await pool.end().catch(() => undefined);
          throw error;
        }
      })()
  : runtime.startupMode === 'serve-verified-item5a'
    ? (async () => {
        try {
          await bootstrapDatabase();
          return app.listen(port, runtime.host, () => {
            console.log(`Local CRM API verified for Item5A and listening on http://127.0.0.1:${port}`);
          });
        } catch (error) {
          await pool.end().catch(() => undefined);
          throw error;
        }
      })()
  : bootstrapDatabase()
    .then(() => app.listen(port, runtime.host, () => {
      console.log(`Local CRM API listening on http://127.0.0.1:${port}`);
      if (localSyncAutomaticEnabled) {
        localSyncTimer = setInterval(() => {
          void startLocalIncrementalSync("scheduled").catch((error) => {
            if (
              typeof error === "object" &&
              error !== null &&
              "status" in error &&
              Number((error as { status?: unknown }).status) === 409
            )
              return;
            console.error(
              "Scheduled local incremental sync could not start",
              error,
            );
          });
        }, localSyncIntervalMs);
        console.log(
          `Local incremental sync scheduler enabled every ${Math.round(localSyncIntervalMs / 60000)} minute(s); first run waits for the interval.`,
        );
      } else {
        console.log(
          "Local incremental sync scheduler disabled by backend mode/configuration.",
        );
      }
    }));
databaseStartup
  .catch((error) => {
    console.error("Local database bootstrap failed", error);
    process.exitCode = 1;
  });

const stopLocalSyncScheduler = () => {
  if (localSyncTimer) clearInterval(localSyncTimer);
  localSyncTimer = null;
};
process.once("SIGINT", stopLocalSyncScheduler);
process.once("SIGTERM", stopLocalSyncScheduler);

export default app;
