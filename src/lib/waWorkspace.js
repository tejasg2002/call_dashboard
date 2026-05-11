/** WhatsApp analytics: MBA/IDM now use Interakt webhook collections; other verticals keep marketingwa-style collections. */

/** `itm.wa_dashboard_cache` document _id per workspace. */
export const WA_DASHBOARD_CACHE_ID_MBA = "wa_latest_mba";
export const WA_DASHBOARD_CACHE_ID_MBA_LEGACY = "wa_latest";

const ITM_DB = "itm";
const ANALYTICS_DB = "analytics";
const ITM_BS_DB = "ITM_BS";
const ITM_IDM_DB = "ITM_IDM";
const ITM_IHM_DB = "ITM_IHM";
const ITM_ISU_DB = "ITM_ISU";

/**
 * Non-MBA workspaces: same UX (WA-only subset, no MBA form conversion), separate cache + collection.
 * @type {ReadonlyArray<{ workspace: string, collection: string, cacheKey: string, label: string }>}
 */
export const ANALYTICS_WA_DEFINITIONS = Object.freeze([
  // IHM moved to ITM_IHM.interaktWhatsappWebhookEvents (new Interakt JSON shape)
  {
    workspace: "ihm",
    collection: "interaktWhatsappWebhookEvents",
    cacheKey: "wa_latest_ihm",
    label: "IHM",
    dataDb: ITM_IHM_DB,
    isuAppsDb: ITM_IHM_DB,
    isuAppsCollection: "npfApplicationsWebhookEvents",
    isuAppsPhoneField: "Mobile_Number",
    isuPaymentCollection: "npfPaymentWebhookEvents",
  },
  // IDM moved to ITM_IDM.interaktWhatsappWebhookEvents (new Interakt JSON shape)
  {
    workspace: "idm",
    collection: "interaktWhatsappWebhookEvents",
    cacheKey: "wa_latest_idm",
    label: "IDM",
    dataDb: ITM_IDM_DB,
    leadFilterDataDb: ITM_IDM_DB,
    crmSnapshotCollection: "crmSnapshot",
    leadWebhookCollection: "npfLeadsWebhookEvents",
    /** Webhook uses `mobile`; CRM uses `registered_mobile` — chain falls through. */
    leadPhoneField: "mobile",
    /** Funnel stage: only `lead_stage` on CRM + npf webhook (~6 stages). */
    leadFunnelStageField: "lead_stage",
    isuAppsDb: ITM_IDM_DB,
    isuAppsCollection: "npfApplicationsWebhookEvents",
    isuAppsPhoneField: "Mobile_No_Alt",
    isuPaymentCollection: "npfPaymentWebhookEvents",
  },
  // BBA/BTECH: all WA + NPF + CRM snapshot + lead webhooks use DB ITM_ISU.
  {
    workspace: "bba",
    collection: "interaktWhatsappWebhookEventsBBA",
    cacheKey: "wa_latest_bba",
    label: "BBA",
    dataDb: ITM_ISU_DB,
    leadFilterDataDb: ITM_ISU_DB,
    isuAppsDb: ITM_ISU_DB,
    isuAppsCollection: "npfApplicationsWebhookEventsBBA",
    isuAppsPhoneField: "Mobile_Number",
    isuPaymentCollection: "npfPaymentWebhookEventsBBA",
    crmSnapshotCollection: "crmSnapshotBBA",
    leadWebhookCollection: "npfLeadsWebhookEventsBBA",
    leadPhoneField: "registered_mobile",
  },
  {
    workspace: "btech",
    collection: "interaktWhatsappWebhookEventsBTech",
    cacheKey: "wa_latest_btech",
    label: "BTECH",
    dataDb: ITM_ISU_DB,
    leadFilterDataDb: ITM_ISU_DB,
    isuAppsDb: ITM_ISU_DB,
    isuAppsCollection: "npfApplicationsWebhookEventsBTech",
    isuAppsPhoneField: "Mobile_Number",
    isuPaymentCollection: "npfPaymentWebhookEventsBTech",
    crmSnapshotCollection: "crmSnapshotBtech",
    leadWebhookCollection: "npfLeadWebhookEventsBTech",
    leadPhoneField: "registered_mobile",
  },
]);

/** @type {ReadonlySet<string>} */
const ANALYTICS_WORKSPACE_SLUGS = new Set(
  ANALYTICS_WA_DEFINITIONS.map((d) => d.workspace),
);

export const WA_WORKSPACE_MBA = "mba";
export const WA_WORKSPACE_IHM = "ihm";
export const WA_WORKSPACE_IDM = "idm";
export const WA_WORKSPACE_BBA = "bba";
export const WA_WORKSPACE_BTECH = "btech";

export const WA_DASHBOARD_CACHE_ID_IHM = "wa_latest_ihm";
export const WA_DASHBOARD_CACHE_ID_IDM = "wa_latest_idm";
export const WA_DASHBOARD_CACHE_ID_BBA = "wa_latest_bba";
export const WA_DASHBOARD_CACHE_ID_BTECH = "wa_latest_btech";

/** MBA first, then analytics workspaces — used for BU access checks and admin Settings. */
export const ALL_BU_WORKSPACE_SLUGS = Object.freeze([
  WA_WORKSPACE_MBA,
  ...ANALYTICS_WA_DEFINITIONS.map((d) => d.workspace),
]);

/**
 * Firestore `allowedBuWorkspaces`: null/undefined/not-array = unrestricted (all BUs).
 * Non-empty array shorter than full list = only those workspaces.
 */
export function normalizeAllowedBuWorkspaces(raw) {
  if (raw == null || !Array.isArray(raw)) return null;
  const allowed = new Set();
  for (const x of raw) {
    const s = String(x || "")
      .toLowerCase()
      .trim();
    if (ALL_BU_WORKSPACE_SLUGS.includes(s)) allowed.add(s);
  }
  const arr = [...allowed];
  if (arr.length === 0 || arr.length >= ALL_BU_WORKSPACE_SLUGS.length)
    return null;
  return arr;
}

export function isBuWorkspaceAllowed(workspace, allowedBuWorkspaces) {
  const allowed = normalizeAllowedBuWorkspaces(allowedBuWorkspaces);
  if (allowed == null) return true;
  return allowed.includes(normalizeWAWorkspace(workspace));
}

/** First slug in ALL_BU_WORKSPACE_SLUGS order that appears in the restricted list. */
export function firstAllowedBuWorkspace(allowedBuWorkspaces) {
  const allowed = normalizeAllowedBuWorkspaces(allowedBuWorkspaces);
  if (allowed == null) return WA_WORKSPACE_MBA;
  for (const slug of ALL_BU_WORKSPACE_SLUGS) {
    if (allowed.includes(slug)) return slug;
  }
  return WA_WORKSPACE_MBA;
}

/** Short label for a BU slug (Settings / tooltips). */
export function buWorkspaceLabel(slug) {
  if (!slug || slug === WA_WORKSPACE_MBA) return "MBA";
  const def = ANALYTICS_WA_DEFINITIONS.find((d) => d.workspace === slug);
  return def?.label ?? String(slug).toUpperCase();
}

export function normalizeWAWorkspace(raw) {
  const w = String(raw || "")
    .toLowerCase()
    .trim();
  if (ANALYTICS_WORKSPACE_SLUGS.has(w)) return w;
  return WA_WORKSPACE_MBA;
}

/**
 * True if a cache/API payload belongs to the expected vertical.
 * MBA may omit workspace only for legacy cache; analytics workspaces must match.
 */
export function workspacePayloadMatchesExpected(payload, expectedWorkspace) {
  const exp = normalizeWAWorkspace(expectedWorkspace);
  const gotRaw = payload?.workspace;
  if (gotRaw == null || gotRaw === "") {
    return exp === WA_WORKSPACE_MBA;
  }
  return normalizeWAWorkspace(gotRaw) === exp;
}

/** True for any analytics DB WhatsApp workspace (not MBA). */
export function isNonMbaWaWorkspace(workspace) {
  return ANALYTICS_WORKSPACE_SLUGS.has(normalizeWAWorkspace(workspace));
}

/** BBA / BTECH: call analytics + call review use Mongo analytics.call_logs_isu (not Firestore Call_logs). */
export function workspaceUsesIsuCallLogs(workspace) {
  const w = normalizeWAWorkspace(workspace);
  return w === WA_WORKSPACE_BBA || w === WA_WORKSPACE_BTECH;
}

/**
 * Hide Calls / Email / SMS for IHM & IDM (WhatsApp-only). BBA/BTECH keep Calls for ISU Mongo logs.
 * Use with nav items that set hideForIhm.
 */
export function hideGlobalNavExceptWhatsApp(workspace) {
  const w = normalizeWAWorkspace(workspace);
  if (w === WA_WORKSPACE_MBA) return false;
  if (workspaceUsesIsuCallLogs(workspace)) return false;
  return true;
}

/** Sidebar: hide Email & SMS for IHM/IDM (WA-only) and temporarily for BBA/BTECH. */
export function hideEmailSmsInSidebar(workspace) {
  return (
    hideGlobalNavExceptWhatsApp(workspace) ||
    workspaceUsesIsuCallLogs(workspace)
  );
}

/**
 * Analytics-only workspaces: hide MBA-only nav; WhatsApp API Messages + template drill-downs stay.
 * /settings remains reachable (sidebar still enforces admin).
 */
export function isRouteAllowedForBuWorkspace(pathname, workspace) {
  const w = normalizeWAWorkspace(workspace);
  if (w === WA_WORKSPACE_MBA) return true;
  let p = (pathname || "/").split("?")[0];
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1) || "/";
  if (p === "/settings") return true;
  if (p === "/wa") return true;
  if (p.startsWith("/wa/templates/")) return true;
  if (workspaceUsesIsuCallLogs(w)) {
    if (p === "/" || p === "/call-review") return true;
    return false;
  }
  return false;
}

/** Main WA URL when redirecting off a disallowed route for the current analytics workspace. */
export function nonMbaWaHomePath(workspace) {
  const w = normalizeWAWorkspace(workspace);
  if (w === WA_WORKSPACE_MBA) return "/wa";
  return `/wa?workspace=${encodeURIComponent(w)}`;
}

/** Human label for the workspace switcher. */
export function workspaceDisplayLabel(workspace) {
  const w = normalizeWAWorkspace(workspace);
  if (w === WA_WORKSPACE_MBA) return "MBA";
  const def = ANALYTICS_WA_DEFINITIONS.find((d) => d.workspace === w);
  return def?.label ?? w.toUpperCase();
}

/** Append ?workspace=<slug> for analytics workspaces so refreshes and links stay on the right BU. */
export function withWorkspaceQuery(href, workspace) {
  const w = normalizeWAWorkspace(workspace);
  if (w === WA_WORKSPACE_MBA) return href;
  const hashIdx = href.indexOf("#");
  const hash = hashIdx >= 0 ? href.slice(hashIdx) : "";
  const pathPart = hashIdx >= 0 ? href.slice(0, hashIdx) : href;
  const qIdx = pathPart.indexOf("?");
  const p = qIdx >= 0 ? pathPart.slice(0, qIdx) : pathPart;
  const params = new URLSearchParams(qIdx >= 0 ? pathPart.slice(qIdx + 1) : "");
  params.set("workspace", w);
  return `${p}?${params.toString()}${hash}`;
}

export function waWorkspaceConfig(workspace) {
  const w = normalizeWAWorkspace(workspace);
  const def = ANALYTICS_WA_DEFINITIONS.find((d) => d.workspace === w);
  if (def) {
    return {
      workspace: def.workspace,
      dataDb: def.dataDb || ANALYTICS_DB,
      waCollection: def.collection,
      cacheKey: def.cacheKey,
      includeMbaConversion: false,
      /** IHM payment conversion (was itm.npfPaymentWebhookEvents): off until DB user has read on that collection. */
      ihmPaymentWebhookCollection: null,
      /** NPF application form conversion (BBA / BTECH / IHM / IDM) */
      isuAppsDb: def.isuAppsDb || null,
      isuAppsCollection: def.isuAppsCollection || null,
      isuAppsPhoneField: def.isuAppsPhoneField || "Mobile_Number",
      /** NPF payment lookup (BBA / BTECH only) */
      isuPaymentCollection: def.isuPaymentCollection || null,
      /** BBA / BTECH / IDM: CRM snapshot + NPF lead webhook for lead stage / source filters */
      crmSnapshotCollection: def.crmSnapshotCollection || null,
      leadWebhookCollection: def.leadWebhookCollection || null,
      leadPhoneField: def.leadPhoneField || "Mobile_Number",
      /** DB for CRM snapshot + lead webhook collections (defaults to dataDb) */
      leadFilterDataDb: def.leadFilterDataDb ?? def.dataDb,
      /** When set, lead filter uses this field only (e.g. IDM `lead_stage`). */
      leadFunnelStageField: def.leadFunnelStageField ?? null,
    };
  }
  return {
    workspace: WA_WORKSPACE_MBA,
    // MBA (Business School) moved to ITM_BS.interaktWhatsappWebhookEvents
    dataDb: ITM_BS_DB,
    waCollection: "interaktWhatsappWebhookEvents",
    cacheKey: WA_DASHBOARD_CACHE_ID_MBA,
    includeMbaConversion: true,
  };
}
