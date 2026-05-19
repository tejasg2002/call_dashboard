# ITM Call Dashboard — Business Overview

A single web application for **ITM Skills University** marketing and admissions teams to monitor outreach performance across **phone calls**, **WhatsApp**, **email**, and **SMS**.

It helps leaders and operators answer four everyday questions:

- How are we performing today, this week, this month?
- Who is converting, and who needs coaching?
- Which messages and campaigns are working?
- Where are leads coming from, and what happens after they engage?

This document is written for business users — marketing managers, admissions leads, counselors, and program owners. It does not include technical setup, code, or database details.

---

## 1. Why the dashboard exists

### Problems it solves

| Challenge | How the dashboard helps |
|-----------|-------------------------|
| Reporting is scattered across many tools and spreadsheets | One login, one place to view every channel |
| Hard to compare counselor or agent productivity | Call analytics and call review with quality scores and recordings |
| WhatsApp engagement and spend are unclear | Template, campaign, and conversion analytics for WhatsApp |
| Email and SMS performance not visible alongside calls | Dedicated email and SMS views (MBA) |
| Different programs need their own view of data | Each program (BBA, BTECH, MCA, etc.) has its own workspace |
| Source and owner accountability for admissions | Source Stats links call attempts to leads by owner (MBA) |

### What you get out of it

- **Daily operational visibility** — volume, quality, and funnel metrics at a glance.
- **Quality coaching** — listen to recordings, read AI summaries and transcripts.
- **Campaign optimization** — see which WhatsApp templates and email subjects drive applications and payments.
- **Team accountability** — owner-level performance tables.
- **Program-level isolation** — agencies or campus teams only see their own program.

---

## 2. Who uses it

| Role | Typical use |
|------|-------------|
| **Admissions / marketing managers** | KPIs, trends, date-range comparisons |
| **Counselors / inside sales** | Call review, lead detail, follow-up decisions |
| **WhatsApp & growth teams** | Template performance, campaigns, conversion tracking |
| **Admins** | Adding users, setting permissions, choosing which programs each user can see |

Access is controlled by login (email + password) and per-user permissions managed in Settings.

---

## 3. Programs (workspaces)

The **workspace menu** in the top-right corner lets you switch between programs. Each program is fully isolated — switching workspaces changes the data you see and which menu items appear.

### 3.1 MBA — full workspace

The most complete view. Includes everything: phone calls, call review, source stats, WhatsApp, email, and SMS.

| Channel | Included |
|---------|----------|
| Call Analytics | Yes |
| Call Review | Yes |
| Source Stats | Yes |
| WhatsApp | Yes |
| Email | Yes |
| SMS | Yes |

MBA is the default for users without program restrictions.

### 3.2 WhatsApp-only programs

| Program | Description |
|---------|-------------|
| **IHM** (Hospitality) | WhatsApp analytics and application form journey |
| **IDM** (Design) | WhatsApp analytics and application form journey |
| **MBA AI** | WhatsApp analytics for the MBA AI program |

These programs hide the Calls, Email, and SMS menus. They focus on WhatsApp performance and admissions application flow.

### 3.3 Calls + WhatsApp programs

| Program | Description |
|---------|-------------|
| **BBA** | Phone calls + WhatsApp |
| **BTECH** | Phone calls + WhatsApp |

These programs see Calls, Call Review, and WhatsApp. Email and SMS are hidden.

### 3.4 MCA — calls only

A new, focused workspace.

| Channel | Included |
|---------|----------|
| Call Analytics | Yes |
| Call Review | Yes |
| Anything else | No |

MCA is intentionally simple: only what the MCA team needs.

### 3.5 What each program can see

| Program | Calls | Call Review | Source Stats | WhatsApp | Email | SMS |
|---------|:-----:|:-----------:|:------------:|:--------:|:-----:|:---:|
| MBA | ✓ | ✓\* | ✓ | ✓ | ✓ | ✓ |
| IHM | — | — | — | ✓ | — | — |
| IDM | — | — | — | ✓ | — | — |
| MBA AI | — | — | — | ✓ | — | — |
| BBA | ✓ | ✓\* | — | ✓ | — | — |
| BTECH | ✓ | ✓\* | — | ✓ | — | — |
| MCA | ✓ | ✓\* | — | — | — | — |

\* Call Review requires the **Call Review** permission (see Section 6).

---

## 4. Modules at a glance

### 4.1 Call Analytics

**Where:** Calls → Analytics

**What you see:**

- Total calls, average quality score, count of high- and low-score calls.
- Owner-level breakdown (counselor or agent).
- Trend charts.
- Quick date ranges: All time, Today, This week, This month, Custom.

**Used for:** Daily stand-ups, target tracking, and spotting counselors who need attention.

---

### 4.2 Call Review

**Where:** Calls → Call Review

**Needs:** Call Review permission.

**What you see:**

- Searchable table of every call — owner, city, state, course, disposition, score, duration, date.
- A detail panel for each call: **recording playback**, **AI summary**, **transcript**, scores, and disposition.

**Used for:** Quality assurance, coaching, dispute resolution, and verifying conversations.

---

### 4.3 Source Stats (MBA only)

**Where:** Calls → Source Stats

**What you see:**

- Owner activity compared against the lead cohorts assigned to them.
- Daily call-attempt stats by agent.
- KPI cards and charts for source and owner performance.

**Used for:** Holding owners accountable for following up on interested & eligible leads.

---

### 4.4 WhatsApp Analytics

**Where:** Sidebar → WhatsApp

The exact panels vary by program, but the building blocks are common.

| Area | What it tells you |
|------|-------------------|
| **KPI cards** | Sent, delivered, read, failed (and costs where available) |
| **Template performance** | Which message templates drive engagement |
| **Message funnel** | Where leads drop off (sent → delivered → read → clicked) |
| **CTA performance** | Which buttons and links get clicked |
| **Campaign manager** | Group templates into named campaigns (MBA) |
| **Payment / form conversion** | How many WhatsApp clicks turned into applications or payments |
| **Lead stage & source filters** | Restrict every metric to a specific funnel stage or source |

**For MBA**, the lead-stage filter uses the agreed stage labels mapped from the WhatsApp template list (e.g. *All Stages*, *Follow Up*, *Not Connected*, *Interested & Eligible*).

**Used for:** Template ROI, budget justification, and aligning WhatsApp journeys with the admissions funnel.

---

### 4.5 Email Analytics (MBA)

**Where:** Sidebar → Email

**What you see:**

- Email volume by event (sent, delivered, opened, clicked, etc.).
- Subject-line performance.
- Click breakdown and conversion to applications or payments.
- Optional masking of sensitive details for users without full access.

**Used for:** Reviewing email campaigns alongside calls and WhatsApp.

---

### 4.6 SMS Analytics (MBA)

**Where:** Sidebar → SMS

**What you see:**

- SMS volume and delivery KPIs.
- Paginated detail views.

**Used for:** Monitoring SMS as part of the overall mix for MBA campaigns.

---

### 4.7 Settings (Admins only)

**Where:** Sidebar → Settings

**What admins can do:**

- Add users, reset passwords, remove users.
- Turn permissions on or off: Call Review, WhatsApp, Email, data masking.
- Choose which **programs** (business units) each user can access.
- Leaving every program on means no restriction.

**Used for:** Onboarding new counselors, agencies, or program teams without exposing other programs’ data.

---

## 5. Everyday workflows

### A counselor lead’s morning

1. Log in and choose the right program (e.g. BBA).
2. Open **Calls → Analytics** to see total calls and team scores.
3. Switch to **Call Review**, filter by counselor, listen to the lowest-scoring calls.
4. Coach or follow up where needed.

### A WhatsApp marketing review

1. Open the **WhatsApp** menu.
2. Pick the date range.
3. Optionally filter by **lead stage** or **source** and click Apply.
4. Compare templates and CTA tables; open a template for the message preview.
5. Check **payment / form conversion** to see how many clicks turned into applications.

### Admissions leadership review (MBA)

1. **Source Stats** — confirm owners are attempting their assigned leads.
2. **WhatsApp** — see how filtered cohorts are responding.
3. **Calls** — review counselor scores and volumes.

### MCA program team

1. Choose **MCA** in the workspace menu.
2. Use **Calls** and **Call Review** only — no extra channels to distract from call performance.

---

## 6. Permissions and access

| Permission | What it controls |
|------------|------------------|
| **WhatsApp** | Whether the WhatsApp menu is visible |
| **Call Review** | Whether the Call Review tab and detailed views appear |
| **Email** | Whether the Email module is visible |
| **Data masked** | Hides sensitive details (used for limited-access users) |
| **Business units (programs)** | Limits which programs appear in the workspace menu |
| **Admin** | Access to Settings and user management |

Users with no program restriction see all programs they have channel permissions for.

---

## 7. Freshness of the numbers

The dashboard refreshes regularly while you have a page open. Some views also use prepared summaries so heavy pages load quickly.

What this means for you:

- Numbers may be **a few minutes behind real time**, especially right after a large WhatsApp or email send.
- After a big campaign, give the system a short window and use the **refresh** action on pages where it is shown.
- Date-range filters work against the most recent available data.

---

## 8. Common terms

| Term | What it means |
|------|---------------|
| **Workspace / program** | The selector that switches between MBA, BBA, MCA, and other programs |
| **Lead stage** | The funnel stage of a lead (for MBA, often derived from the WhatsApp message they last received) |
| **Source** | Where a lead came from (e.g. organic, publisher, agent partner) |
| **Disposition** | The outcome label a counselor sets after a call |
| **Template** | A named WhatsApp message format (e.g. follow-up, reminder) |
| **Campaign** | A group of templates run together for a marketing objective |
| **Conversion** | A click or message that led to an application submission or payment |
| **Owner** | The counselor or agent assigned to a lead |
| **Score** | The quality rating assigned to a call |

---

## 9. What the dashboard does not do

- It is **not a CRM**. It reads data from your CRM and other tools; it does not replace them.
- It does **not place calls** or **send messages** itself. It reports on activity that happened elsewhere.
- It does **not edit leads**. Counselors update lead records in the CRM.
- Some programs intentionally **hide modules** that are not relevant (for example, IHM has no Calls module, MCA has no WhatsApp).
- Historical data quality depends on the upstream systems recording phone numbers and owner names consistently.

---

## 10. Who to contact

| If you see | Reach out to |
|------------|--------------|
| You can’t log in or need access | Dashboard administrator (Settings owner) |
| Wrong or missing call data (BBA, BTECH, MCA) | Calls / operations team |
| WhatsApp template stages look wrong (MBA) | Marketing operations |
| Source lists or owners look wrong | Admissions operations |
| Source Stats numbers don’t match the dialer | Admissions ops + dialer team |

---

## Document control

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | May 2026 | Business overview covering all current programs, including MCA |

*Update this document when a new program is added or when sidebar / module rules change.*
