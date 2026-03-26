# Source Stats: Owner Activity Table Fetching Logic

This document explains how each column in the **Owner Activity** table is fetched/computed in:

- `app/api/sourceStats/compute.js`
- function: `computeOwnerActivityTable(crmDb, itmDb)`

---

## Data Sources

- **Leads source (CRM DB)**
  - Database: `itm-crm`
  - Collection: `leads`
- **Call attempts source (ITM DB)**
  - Database: `itm`
  - Collection: `callrecordings`

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

1. `npfData.latestRegDate` — primary; aligns with Compass filters on this field (string range or regex on the `DD/MM/YYYY, …` value for “today” in IST)
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

## Call Recordings Fetch (this is where “attempts” come from)

All attempt-style metrics (**Achieved Attempts**, **Yesterday Attempts**, **Day before Yesterday Attempts**, and the **I&E** flags on those touches) are computed **only** from MongoDB:

- **Database:** `itm`
- **Collection:** `callrecordings` (see `RECORDINGS_COL` in `app/api/sourceStats/compute.js`)

There is **no** attempt count taken from CRM `stats`, NPF counters, or other collections for Owner Activity. One row in the pipeline after `$unwind` of `body.data` (or the synthetic single-item path) counts as **one attempt** if it has a valid phone and `eventAtDate`.

The callrecordings pipeline:

1. handles `body.data` as:
   - array,
   - single object,
   - or fallback from root `phone_number`
2. extracts phone from fallback chain:
   - `body.data.call.phone_number`
   - `body.data.phone_number`
   - `body.data.call.customer_number`
   - `body.data.mobile`
   - `body.data.phone`
   - `phone_number`
   - `customer_phone`
3. extracts event timestamp from fallback chain:
   - `createdAt`
   - `created_at`
   - `updatedAt`
   - `body.data.call.start_time`
   - `body.data.call.created_at`
   - `body.data.timestamp`
   - `body.data.call.timestamp`
   - `timestamp`
4. converts event timestamp to `eventAtDate`
5. keeps rows with non-empty phone and `eventAtDate >= lookbackStart` (30 days)
6. computes:
   - `ownerKey` from recording owner fields
   - `isIe` via disposition regex:
     - `i&e`, `i/e`, `information`, `enquiry`, `i.e.`, `inquiry`

Finally it uses `$facet`:

- `todayTouches`: calls only in today IST window, output `{ ownerKey, _phoneRaw, isIe }`
- `totalIeByOwner`: 30-day I&E count grouped by owner

---

## Column-by-Column Mapping

### `Today Leads`

- Source: `leadCountByNormOwnerDay[owner + todayStr]`
- Meaning: leads assigned to this owner today (IST)

### `Target Attempts`

- Formula: `todayLeads * OWNER_TARGET_ATTEMPTS_MULTIPLIER`
- Current multiplier: `3`

### `Achieved Attempts`

- Count of **today's calls (IST)** where:
  - normalized call owner == row owner
  - normalized call phone exists in owner's **today-assigned lead phone set**

### `Yesterday Leads`

- Source: `leadCountByNormOwnerDay[owner + yesterdayStr]`
- Meaning: leads assigned yesterday (IST)

### `Yesterday Attempts`

- Count of **today's calls (IST)** where:
  - normalized call owner == row owner
  - normalized call phone exists in owner's **yesterday-assigned lead phone set**

### `Day B4 Yest Leads`

- Source: `leadCountByNormOwnerDay[owner + dayBeforeStr]`
- Meaning: leads assigned day-before-yesterday (IST)

### `Day before Yesterday Attempts`

- Count of **today's calls (IST)** where:
  - normalized call owner == row owner
  - normalized call phone exists in owner's **day-before-yesterday-assigned lead phone set**

### `Total I&E`

- Source: `totalIeByOwner` facet
- Meaning: 30-day I&E-like attempts count for the owner

### `I&E Attempted`

- Count of **today's calls into today's cohort** where `isIe = true`
- This is a subset of today's cohort attempts (`Achieved Attempts`)

---

## Important Notes

- Phone matching uses normalized 10-digit mobile (`normaliseMobile(...)`) from CRM lead fields.
- `normaliseMobile` strips non-digits and handles `+91` / `91` prefixes so values like `+91-7021315785` still match call recordings.
- Attempt columns are **not** pulled by call day buckets (today/yesterday/day-before); they are all based on **today calls into assignment cohorts**.
- Owner display text is a formatted label; matching is done on normalized owner keys.

### Compass vs dashboard counts

- In MongoDB Compass, use the field **`_source.User Registration Date`** (single underscore `_source`). A filter like **`__source.User Registration Date`** is a different field and can give wrong counts.
- If **Owner attempts (CRM pool)** “Today Leads” was lower than Compass (e.g. 179 vs 420), typical causes were:
  - registration dates were taken only from **CallQ** `createdDate`, not `itm-crm.leads` **User Registration Date** (now merged into `leadRegDates`);
  - phones with formatting (`+91-…`, hyphens) were dropped before `normaliseMobile` was digit-based (fixed);
  - phones not present in the **CRM snapshot** sheet (`crmSnapshotMarch23`) had no owner until we **overlay** `itm-crm.leads` owner + phone on top of the snapshot.
