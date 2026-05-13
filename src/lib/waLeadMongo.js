/**
 * Shared Mongo helpers for CRM + NPF lead webhook lookups (BBA, BTECH, IDM, …).
 * Paths cover flat exports, NPF-style nesting under `data`, `body.data`, Excel-style `_source`,
 * and common keys (including literal `phonenumber`) so CRM ↔ WA joins behave like a phone-key VLOOKUP.
 */

/** `_source` / `data` export blobs (keys may include spaces — use $getField). */
const leadPhoneFromObjectBucketExpr = {
  $let: {
    vars: {
      src: {
        $switch: {
          branches: [
            {
              case: { $eq: [{ $type: "$_source" }, "object"] },
              then: "$_source",
            },
            { case: { $eq: [{ $type: "$data" }, "object"] }, then: "$data" },
          ],
          default: null,
        },
      },
    },
    in: {
      $cond: [
        {
          $and: [
            { $ne: ["$$src", null] },
            { $eq: [{ $type: "$$src" }, "object"] },
          ],
        },
        {
          $ifNull: [
            { $getField: { field: "phonenumber", input: "$$src" } },
            {
              $ifNull: [
                { $getField: { field: "PhoneNumber", input: "$$src" } },
                {
                  $ifNull: [
                    { $getField: { field: "Phone Number", input: "$$src" } },
                    {
                      $ifNull: [
                        {
                          $getField: { field: "Mobile_Number", input: "$$src" },
                        },
                        {
                          $ifNull: [
                            {
                              $getField: {
                                field: "mobile_number",
                                input: "$$src",
                              },
                            },
                            {
                              $ifNull: [
                                {
                                  $getField: {
                                    field: "Registered Mobile",
                                    input: "$$src",
                                  },
                                },
                                {
                                  $getField: {
                                    field: "Alternate Mobile",
                                    input: "$$src",
                                  },
                                },
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        null,
      ],
    },
  },
};

/** Phone on CRM / NPF lead docs (flat + nested + webhook body + export buckets) */
export const leadPhoneExpr = {
  $ifNull: [
    "$registered_mobile",
    {
      $ifNull: [
        "$Registered_Mobile",
        {
          $ifNull: [
            "$Alternate_Mobile",
            {
              $ifNull: [
                "$Mobile_Number",
                {
                  $ifNull: [
                    "$phonenumber",
                    {
                      $ifNull: [
                        "$phoneNumber",
                        {
                          $ifNull: [
                            "$PhoneNumber",
                            {
                              $ifNull: [
                                "$Phone_Number",
                                {
                                  $ifNull: [
                                    "$mobile_number",
                                    {
                                      $ifNull: [
                                        "$phone_number",
                                        {
                                          $ifNull: [
                                            "$Phone",
                                            {
                                              $ifNull: [
                                                "$Mobile",
                                                {
                                                  $ifNull: [
                                                    "$Customer_Mobile",
                                                    {
                                                      $ifNull: [
                                                        "$contact_number",
                                                        {
                                                          $ifNull: [
                                                            "$Contact_Number",
                                                            {
                                                              $ifNull: [
                                                                "$body.data.phonenumber",
                                                                {
                                                                  $ifNull: [
                                                                    "$body.data.PhoneNumber",
                                                                    {
                                                                      $ifNull: [
                                                                        "$body.data.phone_number",
                                                                        {
                                                                          $ifNull:
                                                                            [
                                                                              "$body.data.Mobile_Number",
                                                                              {
                                                                                $ifNull:
                                                                                  [
                                                                                    "$body.data.mobile_number",
                                                                                    {
                                                                                      $ifNull:
                                                                                        [
                                                                                          "$data.phonenumber",
                                                                                          {
                                                                                            $ifNull:
                                                                                              [
                                                                                                "$data.Phone_Number",
                                                                                                {
                                                                                                  $ifNull:
                                                                                                    [
                                                                                                      "$data.Mobile_Number",
                                                                                                      {
                                                                                                        $ifNull:
                                                                                                          [
                                                                                                            "$data.mobile_number",
                                                                                                            {
                                                                                                              $ifNull:
                                                                                                                [
                                                                                                                  "$data.phone_number",
                                                                                                                  {
                                                                                                                    $ifNull:
                                                                                                                      [
                                                                                                                        "$data.phone",
                                                                                                                        leadPhoneFromObjectBucketExpr,
                                                                                                                      ],
                                                                                                                  },
                                                                                                                ],
                                                                                                            },
                                                                                                          ],
                                                                                                      },
                                                                                                    ],
                                                                                                },
                                                                                              ],
                                                                                          },
                                                                                        ],
                                                                                    },
                                                                                  ],
                                                                              },
                                                                            ],
                                                                        },
                                                                      ],
                                                                    },
                                                                  ],
                                                                },
                                                              ],
                                                            },
                                                          ],
                                                        },
                                                      ],
                                                    },
                                                  ],
                                                },
                                              ],
                                            },
                                          ],
                                        },
                                      ],
                                    },
                                  ],
                                },
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

/** Prefer workspace `leadPhoneField` first (e.g. Mobile_Number), then fall back chain. */
export function buildLeadPhoneExpr(leadPhoneField) {
  const f = String(leadPhoneField || "").trim();
  if (!f || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(f)) return leadPhoneExpr;
  return { $ifNull: [`$${f}`, leadPhoneExpr] };
}

/** Trim + stringify for stable CRM/webhook $group keys (VLOOKUP join key). */
export function leadPhoneStringExpr(phoneExpr) {
  return {
    $trim: {
      input: {
        $convert: {
          input: { $ifNull: [phoneExpr, null] },
          to: 'string',
          onError: '',
          onNull: '',
        },
      },
    },
  };
}

/**
 * Canonical funnel stage (ISU-style webhooks): `lead_stage` then `Lead_Stage`.
 * IDM uses workspace `leadFunnelStageField: 'lead_stage'` only — see resolveLeadStageFilterContext.
 */
export const leadStageExpr = {
  $ifNull: ["$lead_stage", "$Lead_Stage"],
};

/** ITM CRM `itm-crm.leads` — phone for WA cohort join (see sample `personal.phone`, `_source.mobile`). */
export const mbaItmCrmLeadPhoneExpr = {
  $ifNull: [
    "$personal.phone",
    {
      $ifNull: ["$_source.mobile", { $ifNull: ["$mobile", leadPhoneExpr] }],
    },
  ],
};

/** Funnel stage: canonical `stage.current`, legacy flat `_source.lead_stage`. */
export const mbaItmCrmLeadStageExpr = {
  $ifNull: ["$stage.current", "$_source.lead_stage"],
};

/** Primary channel / source string for filters and dropdowns. */
export const mbaItmCrmLeadSourceExpr = {
  $trim: {
    input: {
      $convert: {
        input: { $ifNull: ['$source.channel', { $ifNull: ['$_source.source', null] }] },
        to: 'string',
        onError: '',
        onNull: '',
      },
    },
  },
};

export const MBA_ITM_CRM_STAGE_MATCH_FIELDS = Object.freeze([
  "$stage.current",
  "$_source.lead_stage",
]);

export const MBA_ITM_CRM_STAGE_DISTINCT_PATHS = Object.freeze([
  "stage.current",
  "_source.lead_stage",
]);

/**
 * Junk / internal numeric codes that appear in CRM `stage.current` / `_source.lead_stage`
 * but should not appear in the MBA lead-stage filter dropdown.
 */
export const MBA_LEAD_STAGE_DROPDOWN_EXCLUDE = Object.freeze(
  new Set([
    "0",
    "1500530",
    "1500531",
    "1500532",
    "600304",
    "600308",
    "600309",
    "99122",
  ]),
);

/** True if this value should be hidden from MBA lead-stage options only (DB rows unchanged). */
export function isExcludedMbaLeadStageDropdownValue(v) {
  const s = String(v ?? "").trim();
  if (!s) return true;
  return MBA_LEAD_STAGE_DROPDOWN_EXCLUDE.has(s);
}

/**
 * Junk / internal numeric codes on IDM `lead_stage` (CRM + webhook) — hide from filter dropdown only.
 */
export const IDM_LEAD_STAGE_DROPDOWN_EXCLUDE = Object.freeze(
  new Set(["1500473", "1500474", "1500475"]),
);

/** True if this value should be hidden from IDM lead-stage options only. */
export function isExcludedIdmLeadStageDropdownValue(v) {
  const s = String(v ?? "").trim();
  if (!s) return true;
  return IDM_LEAD_STAGE_DROPDOWN_EXCLUDE.has(s);
}

/**
 * IHM: junk numeric strings mistaken for traffic "source" — hide from lead source dropdown only.
 * Matches `02271775144` and `2271775144` (leading-zero variant).
 */
export const IHM_LEAD_SOURCE_DROPDOWN_EXCLUDE = Object.freeze(
  new Set(["02271775144", "2271775144"]),
);

/** @param {unknown} v */
export function isExcludedIhmLeadSourceDropdownValue(v) {
  const s = String(v ?? "").trim();
  if (!s) return false;
  if (IHM_LEAD_SOURCE_DROPDOWN_EXCLUDE.has(s)) return true;
  const noLeadingZeros = s.replace(/^0+(?=\d)/, "");
  return IHM_LEAD_SOURCE_DROPDOWN_EXCLUDE.has(noLeadingZeros);
}

export const MBA_ITM_CRM_SOURCE_DISTINCT_PATHS = Object.freeze([
  "source.channel",
  "_source.source",
  "source.utmSource",
]);

/** Extra paths for $expr source matching (segment + full string, same as other CRM rows). */
export const MBA_ITM_CRM_SOURCE_EXTRA_SEGMENT_PATHS = Object.freeze([
  "$source.channel",
  "$_source.source",
]);

export const MBA_ITM_CRM_SOURCE_EXTRA_MATCH_FIELDS = Object.freeze([
  "$source.channel",
  "$_source.source",
  "$source.utmSource",
]);

export function mbaItmCrmLeadFilterMatchExtras() {
  return {
    extraSourceSegmentPaths: [...MBA_ITM_CRM_SOURCE_EXTRA_SEGMENT_PATHS],
    extraSourceMatchFields: [...MBA_ITM_CRM_SOURCE_EXTRA_MATCH_FIELDS],
  };
}

/**
 * First `/`-delimited token, lowercased (e.g. google/search/BBA-Branded-2026 → google).
 * Returns null when missing/empty so $ifNull chains fall through.
 */
export function sourceRootSegmentExpr(pathWithDollar) {
  const p = String(pathWithDollar || "").startsWith("$")
    ? pathWithDollar
    : `$${pathWithDollar}`;
  return {
    $let: {
      vars: {
        raw: {
          $convert: {
            input: { $ifNull: [p, null] },
            to: 'string',
            onError: '',
            onNull: '',
          },
        },
      },
      in: {
        $let: {
          vars: {
            first: {
              $trim: {
                input: {
                  $ifNull: [
                    { $arrayElemAt: [{ $split: ["$$raw", "/"] }, 0] },
                    "",
                  ],
                },
              },
            },
          },
          in: {
            $cond: [
              { $gt: [{ $strLenCP: "$$first" }, 0] },
              { $toLower: "$$first" },
              null,
            ],
          },
        },
      },
    },
  };
}

/**
 * Canonical “source” for lead filter UI + joins:
 * 1) NPF webhooks (`npfLeadsWebhookEvents*`) — `source_value` (e.g. shiksha).
 * 2) CRM snapshot — first `/` segment of `primary_registration_campaign` (e.g. collegedunia from collegedunia/NA/API).
 * Then latest campaign, then other flat fields / nested `data.*`.
 */
export const leadSourceExpr = {
  $ifNull: [
    sourceRootSegmentExpr("$source_value"),
    {
      $ifNull: [
        sourceRootSegmentExpr("$primary_registration_campaign"),
        {
          $ifNull: [
            sourceRootSegmentExpr("$latest_registration_campaign"),
            {
              $ifNull: [
                sourceRootSegmentExpr("$Campaign_Source"),
                {
                  $ifNull: [
                    sourceRootSegmentExpr("$Source_Value"),
                    {
                      $ifNull: [
                        sourceRootSegmentExpr("$Campaign_Name"),
                        {
                          $ifNull: [
                            "$Publisher_Name",
                            {
                              $ifNull: [
                                "$Traffic_Channel",
                                {
                                  $ifNull: [
                                    "$primary_traffic_channel",
                                    {
                                      $ifNull: [
                                        "$publisher_name",
                                        {
                                          $ifNull: [
                                            "$source",
                                            {
                                              $ifNull: [
                                                "$Source",
                                                {
                                                  $ifNull: [
                                                    "$lead_source",
                                                    {
                                                      $ifNull: [
                                                        "$Lead_Source",
                                                        {
                                                          $ifNull: [
                                                            "$utm_source",
                                                            {
                                                              $ifNull: [
                                                                "$Utm_Source",
                                                                {
                                                                  $ifNull: [
                                                                    "$Primary_Source",
                                                                    {
                                                                      $ifNull: [
                                                                        "$primary_source",
                                                                        {
                                                                          $ifNull:
                                                                            [
                                                                              "$LeadSource",
                                                                              {
                                                                                $ifNull:
                                                                                  [
                                                                                    "$channel",
                                                                                    {
                                                                                      $ifNull:
                                                                                        [
                                                                                          "$Channel",
                                                                                          {
                                                                                            $ifNull:
                                                                                              [
                                                                                                "$medium",
                                                                                                {
                                                                                                  $ifNull:
                                                                                                    [
                                                                                                      "$data.source",
                                                                                                      {
                                                                                                        $ifNull:
                                                                                                          [
                                                                                                            "$data.Source",
                                                                                                            {
                                                                                                              $ifNull:
                                                                                                                [
                                                                                                                  "$data.utm_source",
                                                                                                                  {
                                                                                                                    $ifNull:
                                                                                                                      [
                                                                                                                        "$data.UTM_Source",
                                                                                                                        {
                                                                                                                          $ifNull:
                                                                                                                            [
                                                                                                                              "$data.lead_source",
                                                                                                                              {
                                                                                                                                $ifNull:
                                                                                                                                  [
                                                                                                                                    "$data.channel",
                                                                                                                                    "$data.primary_source",
                                                                                                                                  ],
                                                                                                                              },
                                                                                                                            ],
                                                                                                                        },
                                                                                                                      ],
                                                                                                                  },
                                                                                                                ],
                                                                                                            },
                                                                                                          ],
                                                                                                      },
                                                                                                    ],
                                                                                                },
                                                                                              ],
                                                                                          },
                                                                                        ],
                                                                                    },
                                                                                  ],
                                                                              },
                                                                            ],
                                                                        },
                                                                      ],
                                                                    },
                                                                  ],
                                                                },
                                                              ],
                                                            },
                                                          ],
                                                        },
                                                      ],
                                                    },
                                                  ],
                                                },
                                              ],
                                            },
                                          ],
                                        },
                                      ],
                                    },
                                  ],
                                },
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

/** Mongo: stringify + trim + lower (objects / odd types → "" via $convert). */
function normFieldExpr(fieldPath) {
  return {
    $toLower: {
      $trim: {
        input: {
          $convert: {
            input: { $ifNull: [fieldPath, null] },
            to: 'string',
            onError: '',
            onNull: '',
          },
        },
      },
    },
  };
}

export function canonicalLeadText(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s*&\s*/g, " and ")
    .replace(/\s+/g, " ");
}

export function leadFilterValueVariants(raw) {
  const c = canonicalLeadText(raw);
  if (!c) return [];
  const v = new Set([c]);
  v.add(
    c
      .replace(/\band\b/g, "&")
      .replace(/\s+/g, " ")
      .trim(),
  );
  return [...v];
}

/** Mongo distinct() for stage dropdown — default ISU/BTECH/BBA field names. */
export const LEAD_STAGE_DISTINCT_PATHS = Object.freeze([
  "lead_stage",
  "Lead_Stage",
]);

/** CRM / raw-doc $expr OR targets for stage filter (default). */
export const LEAD_STAGE_MATCH_DOLLAR_PATHS = Object.freeze([
  "$lead_stage",
  "$Lead_Stage",
]);

/**
 * Stage expr + distinct paths + CRM $match fields for lead filter APIs.
 * When `cfg.leadFunnelStageField` is set (e.g. IDM `lead_stage` only), options stay ~5–6 funnel stages.
 */
export function resolveLeadStageFilterContext(cfg) {
  const raw = cfg?.leadFunnelStageField;
  const f = String(raw || "").trim();
  if (f && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(f)) {
    return {
      stageExpr: `$${f}`,
      stageDistinctPaths: Object.freeze([f]),
      stageMatchFields: Object.freeze([`$${f}`]),
    };
  }
  return {
    stageExpr: leadStageExpr,
    stageDistinctPaths: LEAD_STAGE_DISTINCT_PATHS,
    stageMatchFields: LEAD_STAGE_MATCH_DOLLAR_PATHS,
  };
}

export const LEAD_SOURCE_DISTINCT_PATHS = Object.freeze([
  "Publisher_Name",
  "Traffic_Channel",
  "Registration_Channel",
  "latest_traffic_channel",
  "primary_traffic_channel",
  "publisher_name",
  "source",
  "Source",
  "lead_source",
  "Lead_Source",
  "utm_source",
  "Utm_Source",
  "Primary_Source",
  "primary_source",
  "LeadSource",
  "channel",
  "Channel",
  "medium",
  "source_value",
  "publisher_id",
  "traffic_channel",
  "data.source",
  "data.Source",
  "data.utm_source",
  "data.UTM_Source",
  "data.lead_source",
  "data.channel",
  "data.primary_source",
]);

/** Collect distinct string values across many possible field paths (ignores bad paths). */
export async function distinctNonEmptyStrings(col, fieldPaths) {
  if (!col || !fieldPaths?.length) return [];
  const out = new Set();
  await Promise.all(
    fieldPaths.map(async (path) => {
      try {
        const vals = await col.distinct(path);
        for (const v of vals) {
          if (v == null) continue;
          if (
            typeof v === "object" &&
            !(v instanceof Date) &&
            v?.constructor?.name !== "ObjectId"
          )
            continue;
          const s = String(v).trim();
          if (s && s !== "[object Object]") out.add(s);
        }
      } catch {
        // invalid path for this collection
      }
    }),
  );
  return [...out];
}

/** Slash-separated campaign paths — match/compare first token only (see sourceRootSegmentExpr). */
const SOURCE_SEGMENT_ROOT_PATHS = Object.freeze([
  "$source_value",
  "$primary_registration_campaign",
  "$latest_registration_campaign",
  "$Campaign_Source",
  "$Source_Value",
  "$Campaign_Name",
]);

const SOURCE_MATCH_FIELDS = [
  "$Publisher_Name",
  "$Traffic_Channel",
  "$Registration_Channel",
  "$latest_traffic_channel",
  "$primary_traffic_channel",
  "$publisher_name",
  "$source",
  "$Source",
  "$lead_source",
  "$Lead_Source",
  "$utm_source",
  "$Utm_Source",
  "$Primary_Source",
  "$primary_source",
  "$LeadSource",
  "$channel",
  "$Channel",
  "$medium",
  "$source_value",
  "$publisher_id",
  "$traffic_channel",
  "$data.source",
  "$data.Source",
  "$data.utm_source",
  "$data.UTM_Source",
  "$data.lead_source",
  "$data.channel",
  "$data.primary_source",
];

/** Normalize UI/API input: string, string[], or repeated query params → string list */
export function normalizeLeadFilterList(input) {
  if (input == null) return [];
  const arr = Array.isArray(input) ? input : [input];
  const out = [];
  const seen = new Set();
  for (const raw of arr) {
    const s = String(raw || "").trim();
    if (!s) continue;
    for (const part of s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)) {
      if (seen.has(part)) continue;
      seen.add(part);
      out.push(part);
    }
  }
  return out;
}

/** Canonical comparison tokens for one or many picked values (OR semantics). */
export function leadFilterTargetsFromPicks(picks) {
  const targets = new Set();
  for (const raw of normalizeLeadFilterList(picks)) {
    for (const t of leadFilterValueVariants(raw)) {
      if (t) targets.add(t);
    }
  }
  return [...targets];
}

export function buildLeadStageSourceMatchInsensitive(
  leadStagesIn,
  sourcesIn,
  stageMatchFields = LEAD_STAGE_MATCH_DOLLAR_PATHS,
  extras = null,
) {
  const stageTargets = leadFilterTargetsFromPicks(leadStagesIn);
  const sourceTargets = leadFilterTargetsFromPicks(sourcesIn);
  const clauses = [];

  if (stageTargets.length) {
    const stageOr = [];
    for (const f of stageMatchFields) {
      for (const t of stageTargets) {
        stageOr.push({ $eq: [normFieldExpr(f), t] });
      }
    }
    if (extras?.extraStagePaths?.length) {
      for (const f of extras.extraStagePaths) {
        for (const t of stageTargets) {
          stageOr.push({ $eq: [normFieldExpr(f), t] });
        }
      }
    }
    clauses.push({ $expr: { $or: stageOr } });
  }

  if (sourceTargets.length) {
    const sourceOr = [];
    for (const path of SOURCE_SEGMENT_ROOT_PATHS) {
      for (const t of sourceTargets) {
        sourceOr.push({ $eq: [sourceRootSegmentExpr(path), t] });
      }
    }
    for (const f of SOURCE_MATCH_FIELDS) {
      for (const t of sourceTargets) {
        sourceOr.push({ $eq: [normFieldExpr(f), t] });
      }
    }
    if (extras?.extraSourceSegmentPaths?.length) {
      for (const path of extras.extraSourceSegmentPaths) {
        for (const t of sourceTargets) {
          sourceOr.push({ $eq: [sourceRootSegmentExpr(path), t] });
        }
      }
    }
    if (extras?.extraSourceMatchFields?.length) {
      for (const f of extras.extraSourceMatchFields) {
        for (const t of sourceTargets) {
          sourceOr.push({ $eq: [normFieldExpr(f), t] });
        }
      }
    }
    clauses.push({ $expr: { $or: sourceOr } });
  }

  if (clauses.length === 0) return {};
  return clauses.length === 1 ? clauses[0] : { $and: clauses };
}

export function buildGroupedLeadFilterMatch(leadStagesIn, sourcesIn) {
  const stageTargets = leadFilterTargetsFromPicks(leadStagesIn);
  const sourceTargets = leadFilterTargetsFromPicks(sourcesIn);
  const clauses = [];

  if (stageTargets.length) {
    const stageOr = stageTargets.map((t) => ({
      $eq: [normFieldExpr("$leadStage"), t],
    }));
    clauses.push({ $expr: { $or: stageOr } });
  }
  if (sourceTargets.length) {
    const sourceOr = sourceTargets.map((t) => ({
      $eq: [normFieldExpr("$source"), t],
    }));
    clauses.push({ $expr: { $or: sourceOr } });
  }

  if (clauses.length === 0) return [];
  return clauses.length === 1
    ? [{ $match: clauses[0] }]
    : [{ $match: { $and: clauses } }];
}
