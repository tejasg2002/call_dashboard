# Source Stats: Owner Activity Table Fetching Logic

This document explains how each column in the **Owner Activity** table is fetched/computed in:

- `app/api/sourceStats/compute.js`
- function: `computeOwnerActivityTable(crmDb, itmDb)`

---

## Data Sources

- **Leads source (CRM DB)**
  - Database: `itm-crm`
  - Collection: `leads`
- **Call attempts source (SmartPing)**
  - Database: `analytics`
  - Collection: `smartping_database`

---

## Date Logic (IST)

- `todayStr = istYmdToday()`
- `yesterdayStr = shiftIstYmd(todayStr, -1)`
- `dayBeforeStr = shiftIstYmd(todayStr, -2)`

All day buckets are based on **Asia/Kolkata (IST)** calendar boundaries.

---

## Owner Normalization

Owner matching across leads and call recordings uses normalized keys:

- lowercase
- `_` replaced with space
- multiple spaces collapsed
- empty/null owner -> `unassigned`

This is done via `normOwnerKeyLabel(...)` so owner names from different collections can match reliably.

---

## Lead Cohort Fetch (registration / latest-reg day, IST)

Leads are grouped by **latest registration day** (primary: `npfData.latestRegDate`), not only `createdAt`.

### CRM field fallback chains

Owner is read in this order:

1. `assignment.assignedToName`
2. `npfData.firstLeadOwner`
3. `_source["Lead Owner"]`
4. `_source["First Lead Owner"]`
5. `assignment.assignedTo`

Phone is read in this order:

1. `personal.phone`
2. `phone`
3. `npfData.phone`
4. `_source["Registered Mobile"]`
5. `_source["Alternate Mobile"]`

Lead cohort date is read in this order:

1. `npfData.latestRegDate` — primary; aligns with Compass filters on this field (string range or regex on the `DD/MM/YYYY, …` value for "today" in IST)
2. `_source["User Registration Date"]` (example: `23/03/2026, 11:32:24 PM`)
3. `npfData.registrationAttemptDate`
4. `createdAt`
5. `assignment.assignedAt`
6. `first_owner_assigned_date`
7. `firstOwnerAssignedDate`
8. `npfData.firstOwnerAssignedDate`
9. `_source["First Lead Owner Assigned Date"]`
10. `_source["Re-assigned On"]`
11. fallback: `createdDate`
12. fallback: `_source["Latest Registration Date"]`

Then:

- parse flexible date formats (Date object/ISO/string/number and `DD/MM/YYYY, hh:mm[:ss] AM/PM`)
- convert to IST `YYYY-MM-DD`
- build owner-day lead counts and owner-day phone cohorts

### Internal maps built from lead docs

- `leadCountByNormOwnerDay` -> lead count per `owner + day`
- `leadPhonesByNormOwnerDay` -> phone set per `owner + day`

These phone sets are later used to compute today attempts by cohort.

---

## SmartPing Call Fetch (this is where "attempts" come from)

All attempt-style metrics (**Achieved Attempts**, **Yesterday Attempts**, **Day before Yesterday Attempts**, and **I&E Attempted**) are computed from the SmartPing call log:

- **Database:** `analytics`
- **Collection:** `smartping_database`

Each SmartPing document represents a call event with fields:
- `call_id` — unique identifier for the call
- `agent_name` — e.g. `Yukta_Kamble` (not used for owner matching; phones are matched instead)
- `customer_number` — 10-digit phone number
- `call_start_time` — IST timestamp string `"YYYY-MM-DD HH:mm:ss"`
- `event_name` — `Hangup`, `Answered`, `Ringing`, etc.

A single call can produce multiple events (Ringing → Answered → Hangup), so we **deduplicate by `{call_id, customer_number}`** — one `call_id` = one attempt.

### Queries

1. **Today's calls by phone**: match `call_start_time` starting with today's IST date (`$regex: "^YYYY-MM-DD"`), group by `{call_id, phone}`, then count per phone.
2. **Last 7 days calls**: match `call_start_time >= istSevenStart` (string comparison works for YYYY-MM-DD format), group by `{call_id, phone}`, then distinct phones (used for `ieAttempted`).

---

## Column-by-Column Mapping

### `Today Leads`

- Source: `leadCountByNormOwnerDay[owner + todayStr]`
- Meaning: leads assigned to this owner today (IST)

### `Target Attempts`

- Formula: `todayLeads * OWNER_TARGET_ATTEMPTS_MULTIPLIER`
- Current multiplier: `3`

### `Achieved Attempts`

- Count of **today's SmartPing calls** where:
  - normalized call phone exists in owner's **today-assigned lead phone set**

### `Yesterday Leads`

- Source: `leadCountByNormOwnerDay[owner + yesterdayStr]`
- Meaning: leads assigned yesterday (IST)

### `Yesterday Attempts`

- Count of **today's SmartPing calls** where:
  - normalized call phone exists in owner's **yesterday-assigned lead phone set**

### `Day B4 Yest Leads`

- Source: `leadCountByNormOwnerDay[owner + dayBeforeStr]`
- Meaning: leads assigned day-before-yesterday (IST)

### `Day before Yesterday Attempts`

- Count of **today's SmartPing calls** where:
  - normalized call phone exists in owner's **day-before-yesterday-assigned lead phone set**

### `Total I&E`

- Source: CRM leads where `stage.current` matches "Interested & Eligible"
- Meaning: total I&E leads for this owner

### `I&E Attempted`

- Count of owner's I&E lead phones that had any SmartPing call in the last 7 IST days

---

## Important Notes

- Phone matching uses normalized 10-digit mobile (`normaliseMobile(...)`) from CRM lead fields.
- `normaliseMobile` strips non-digits and handles `+91` / `91` prefixes so values like `+91-7021315785` still match SmartPing `customer_number`.
- SmartPing `customer_number` is typically already 10 digits; `normaliseMobile` handles edge cases.
- Attempt columns are **not** pulled by call day buckets (today/yesterday/day-before); they are all based on **today calls into assignment cohorts**.
- Owner display text is a formatted label; matching is done on normalized owner keys.

### Compass vs dashboard counts

- In MongoDB Compass, use the field **`_source.User Registration Date`** (single underscore `_source`). A filter like **`__source.User Registration Date`** is a different field and can give wrong counts.
- If **Owner attempts (CRM pool)** "Today Leads" was lower than Compass (e.g. 179 vs 420), typical causes were:
  - registration dates were taken only from **CallQ** `createdDate`, not `itm-crm.leads` **User Registration Date** (now merged into `leadRegDates`);
  - phones with formatting (`+91-…`, hyphens) were dropped before `normaliseMobile` was digit-based (fixed);
  - phones not present in the **CRM snapshot** sheet (`crmSnapshotMarch23`) had no owner until we **overlay** `itm-crm.leads` owner + phone on top of the snapshot.
