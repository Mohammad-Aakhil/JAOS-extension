# JAOS Extension — Developer Guide

> Complete reference for the JAOS (Job Application Operating System) Chrome Extension.
> Read this before touching any code.

---

## Table of Contents

1. [Overview](#overview)
2. [Directory Structure](#directory-structure)
3. [Architecture](#architecture)
4. [Setup & Installation](#setup--installation)
5. [Engine Modules](#engine-modules)
6. [Adapters](#adapters)
7. [Background Service Worker](#background-service-worker)
8. [Content Script (Panel UI)](#content-script-panel-ui)
9. [Message Contracts](#message-contracts)
10. [Backend API Endpoints](#backend-api-endpoints)
11. [How to Add a New V2 Adapter](#how-to-add-a-new-v2-adapter)
12. [Debugging Guide](#debugging-guide)
13. [Known Bugs & Issues](#known-bugs--issues)
14. [Key Design Decisions](#key-design-decisions)

---

## Overview

JAOS Extension is a Chrome Manifest V3 extension that autofills job application forms across 15+ ATS (Applicant Tracking System) platforms. It uses a **universal scanner + LLM mapper** architecture — instead of hardcoding selectors per ATS, it scans any form dynamically and uses an LLM to map profile fields to form fields.

**Two engines exist side-by-side:**
- **V2 (Modern)**: Universal scanner → LLM mapper → humanized filler. Thin adapters handle only ATS-specific quirks.
- **V1 (Legacy)**: Hardcoded selectors per ATS. Still active for platforms without V2 adapters.

**Priority cascade** when user clicks "AI Fill":
```
V2 adapter match? → Run V2 engine
  ↓ no
V1 adapter match? → Run V1 heuristic fill
  ↓ no
V2 generic (no adapter)? → Run scanner+mapper on raw page
  ↓ no
Basic heuristic fill → name/email/phone only
```

---

## Directory Structure

```
aqeel-extension/
├── manifest.json                  # Extension config (Manifest V3)
├── background.js                  # Service worker: API proxy, profile cache, LLM relay
├── content.js                     # Panel UI, autofill routing, resume upload, progress display
├── popup.html / popup.css / popup.js  # Chrome popup (mock mode toggle)
│
├── engine/                        # V2 Autofill Engine
│   ├── scanner.js                 # Universal DOM field scanner (529 lines)
│   ├── filler.js                  # Humanized form filling with React compat (341 lines)
│   ├── mapper.js                  # LLM bridge: fields → backend → LLM → mappings (90 lines)
│   ├── orchestrator.js            # Multi-step flow executor with MutationObserver (454 lines)
│   └── fiber-bridge.js            # MAIN-world script for React Fiber access
│
├── adapters/                      # ATS-Specific Adapters
│   │
│   │  # V2 Adapters (modern — detection + flow, no hardcoded selectors)
│   ├── greenhouse-v2.js           # React-select, intl-tel-input, resume removal, multi-step
│   ├── workday-v2.js              # Shadow DOM, cx-select, multi-entry sections, tabbed nav
│   ├── ashby-v2.js                # Single-page React 18, yes/no button groups, combobox
│   ├── lever-v2.js                # jQuery, location autocomplete, custom cards
│   ├── bamboohr-v2.js             # Fabric UI (MUI), fab-SelectToggle, honeypot filtering
│   ├── smartrecruiters-v2.js      # Multi-page wizard, pre-fill button
│   └── oraclecloud-v2.js          # Oracle JET/Knockout.js, shadow DOM, address cascade
│   │
│   │  # V1 Adapters (legacy — hardcoded selectors)
│   ├── greenhouse.js
│   ├── workday.js
│   ├── lever.js
│   ├── ashby.js
│   ├── icims.js
│   ├── smartrecruiters.js
│   ├── bamboohr.js
│   ├── paylocity.js
│   ├── taleo.js
│   └── jobvite.js
│
├── field-catalogs/                # Per-ATS field frequency data (from batch scans)
│   ├── ashby-fields.md
│   ├── bamboohr-fields.md
│   ├── greenhouse-fields.md
│   ├── lever-fields.md
│   └── oraclecloud-fields.md
│
├── *-rules.md                     # Per-ATS DOM quirks & patterns documentation
│   ├── ashby-rules.md
│   ├── bamboohr-rules.md
│   ├── greenhouse-rules.md
│   ├── lever-rules.md
│   └── oraclecloud-rules.md
│
├── *-seed-scripts.md              # Console scripts for rapid development
│   ├── ashby-seed-scripts.md
│   ├── greenhouse-seed-scripts.md
│   └── oraclecloud-seed-scripts.md
│
├── scripts/
│   ├── recon-tool/                # Playwright-based ATS portal scanner
│   │   ├── recon.js               # Single-portal scanner
│   │   ├── recon-batch.js         # Batch multi-portal scanner
│   │   ├── spot-check.js          # Deep behavioral test on one portal
│   │   ├── fill-greenhouse.js     # Validation fill script
│   │   ├── fill-greenhouse-nice.js
│   │   ├── package.json           # playwright-core dependency
│   │   ├── RECON-WORKFLOW.md      # Step-by-step scanning guide
│   │   ├── urls/                  # URL lists for batch scanning
│   │   └── reports/               # Scan outputs (JSON + MD + screenshots)
│   └── workday.js                 # Standalone Workday field discovery
│
├── icons/                         # Extension icons (16/32/48/128 PNG)
│
├── V2_ENGINE_BLUEPRINT.md         # V2 architecture, competitor analysis, roadmap
├── ADAPTER_ROADMAP.md             # Prioritized adapter build queue by job volume
├── UI_FIELD_PROGRESS_STANDARD.md  # Progress bar UI rules
└── webmcp-analysis.md             # WebMCP vs JAOS strategic analysis
```

---

## Architecture

### High-Level Flow

```
User clicks "AI Fill" on any job application page
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│  content.js — Routing Layer                             │
│  1. Detect ATS platform (V2 adapters → V1 adapters)    │
│  2. Fetch user profile from background.js               │
│  3. Dispatch to appropriate engine                       │
└──────────────┬──────────────────────────────────────────┘
               │
    ┌──────────┴──────────┐
    │                     │
    ▼                     ▼
┌─────────┐        ┌──────────┐
│ V2 Path │        │ V1 Path  │
└────┬────┘        └────┬─────┘
     │                  │
     ▼                  ▼
orchestrator.js    adapter.fillCustom()
     │             (hardcoded selectors)
     ├── scanner.js → Scan all fields
     ├── adapter.augmentScan() → Add custom widgets
     ├── mapper.js → Send to LLM backend
     │     │
     │     ▼
     │   background.js → POST /api/v1/ai/map-fields
     │     │
     │     ▼
     │   FastAPI backend → LLM (Claude/Ollama)
     │     │
     │     ▼
     │   Response: [{uid, value}, ...]
     │
     ├── filler.js → Fill each field
     └── adapter.afterFill() → Post-fill cleanup
```

### Script Execution Worlds

| Script | World | Why |
|--------|-------|-----|
| `fiber-bridge.js` | **MAIN** | Needs access to `__reactFiber$` on DOM elements |
| All other content scripts | **ISOLATED** | Security — can't access page JS, page can't access extension |
| `background.js` | **Service Worker** | No DOM, handles API calls and messaging |

### Two Injection Paths

Scripts load via two paths — **both must load the same files**:

1. **Manifest injection** (`content_scripts` in manifest.json) — Normal page load
2. **Programmatic injection** (`chrome.scripting.executeScript` in background.js) — After extension reload/update

If you add a new file to one path, add it to both.

---

## Setup & Installation

### Prerequisites
- Google Chrome (latest)
- Node.js 18+ (for recon tool only)
- JAOS backend running at `http://localhost:8000`
- JAOS frontend running at `http://localhost:3000`

### Load the Extension

1. Open `chrome://extensions/`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `aqeel-extension/` directory
5. Pin the JAOS icon in the toolbar

### Recon Tool Setup (optional)

```bash
cd scripts/recon-tool
npm install
```

See `RECON-WORKFLOW.md` for full scanning guide, or the separate `PLAYWRIGHT_MCP_ADAPTER_GUIDE.md` for using Playwright MCP to build adapters.

---

## Engine Modules

### engine/scanner.js — Universal Field Scanner

**Global**: `window.__jaosScanner`

Scans any page for form fields and extracts rich metadata for LLM mapping.

**Key functions:**
| Function | Purpose |
|----------|---------|
| `scanPage(root)` | Main entry — returns `{ fields[], widgets[] }` |
| `scanFields(root)` | Find native `<input>`, `<select>`, `<textarea>` |
| `scanReactSelects(root)` | Detect react-select by class pattern |
| `scanAriaWidgets(root)` | ARIA combobox/listbox widgets |
| `scanSelect2Widgets(root)` | Select2 v3+v4 dropdowns |
| `serializeForLLM(result)` | Strip DOM refs, cap options at 50, compact JSON |
| `deepQuerySelectorAll(sel, root)` | Recursive shadow DOM piercing |
| `getLabel(el)` | 7-source label extraction (label[for], aria-label, aria-labelledby, parent, sibling, text nodes, placeholder) |
| `getSectionContext(el)` | Walk up 12 levels for section heading |
| `isVisible(el)` | offsetParent + computed style check |

**Field metadata output per field:**
```javascript
{
  uid: "field-001",           // unique ID for this scan session
  tag: "input",               // HTML tag
  type: "text",               // input type or "select"/"textarea"
  label: "First Name",        // extracted label
  section: "Personal Info",   // nearest section heading
  required: true,             // HTML required or aria-required
  currentValue: "",           // existing value
  options: [],                // for selects/react-selects
  placeholder: "Enter name",
  ariaLabel: "First name",
  role: "textbox",
  dataTestId: "first-name",
  dataAutomationId: null,
  dataFieldId: null,
  element: HTMLElement         // DOM reference (stripped before LLM)
}
```

### engine/filler.js — Humanized Form Filler

**Global**: `window.__jaosFiller`

Fills form fields with realistic human-like behavior to avoid bot detection.

**Key functions:**
| Function | Purpose |
|----------|---------|
| `fillField(descriptor, value, opts)` | Main dispatcher — routes by field type |
| `typeText(el, value, opts)` | Char-by-char typing, random 15-55ms delays |
| `setValue(el, value)` | Instant set with React-compatible native setter |
| `fillSelect(el, value)` | 5-tier option matching (exact → partial → contains → word-overlap → decline) |
| `fillCheckbox(el, shouldCheck)` | Toggle with input+change+click events |
| `fillReactSelect(container, value)` | Click control → wait menu → search → select option |
| `fillSelect2(descriptor, value)` | Open dropdown → search → match → click |
| `fillFileInput(el, file)` | DataTransfer API for resume upload |

**React compatibility**: Uses `Object.getPrototypeOf(el).value` setter to bypass React's synthetic event system. Without this, React doesn't "see" the value change.

**Humanization timing:**
- Keystroke delay: 15-55ms (random)
- Post-focus pause: 30-80ms
- Post-clear pause: 20-50ms
- Post-change pause: 50-120ms
- Between fields: 60-150ms

### engine/mapper.js — LLM Bridge

**Global**: `window.__jaosMapper`

Sends scanned fields to the backend LLM for semantic value mapping. Content scripts can't call external APIs (CSP), so this goes through background.js.

**Key functions:**
| Function | Purpose |
|----------|---------|
| `requestMappings(fields, _profile, jobContext, atsPlatform)` | Send fields → background → backend → LLM → return `[{uid, value}]` |
| `buildElementLookup(scanResult)` | Create `Map<uid → descriptor>` for fill phase |
| `sendToBackground(message)` | Promise wrapper for `chrome.runtime.sendMessage` |

**Flow**: Scanner output → `mapper.requestMappings()` → background.js `JAOS_LLM_MAP_FIELDS` → `POST /api/v1/ai/map-fields` → LLM response → `[{uid, value}]` back to content script.

### engine/orchestrator.js — Flow Executor

**Global**: `window.__jaosOrchestrator`

Coordinates multi-step autofill flows. Each adapter defines a sequence of "steps" (e.g., Personal Info tab → Work Experience tab → Education tab). The orchestrator executes each step: wait for DOM ready → scan → map → fill → advance.

**Key functions:**
| Function | Purpose |
|----------|---------|
| `run(profile, jobContext, options)` | Main entry: detect adapter → execute flow |
| `executeFlow(adapter, profile, jobContext, options)` | Step-by-step executor |
| `detectPlatform()` | Iterate V2 adapters, first `detect()` match wins |
| `waitForMutation(opts)` | MutationObserver wait with predicate + timeout (10s) |
| `waitForDomStable(quietMs, maxMs)` | Wait for no mutations for quietMs (default 400ms) |
| `waitForElement(sel, root, timeout)` | Wait for selector to appear in DOM |
| `waitForRemoval(sel, root, timeout)` | Wait for selector to disappear |

**Flow step contract:**
```javascript
{
  id: "personal_info",
  label: "Personal Information",
  waitFor: async (ctx) => { /* wait for form ready */ },
  action: async (ctx) => { /* pre-scan actions like clicking tabs */ },
  getFormRoot: (ctx) => document.querySelector("#form"),
  augmentScan: async (ctx, scan) => { /* add custom widgets */ },
  shouldOverwrite: (field) => false,
  afterFill: async (ctx, result) => { /* close popups, sync React */ },
  advance: async (ctx) => true,  // navigate to next step
}
```

**GENERIC_ADAPTER**: If no V2 adapter matches, a built-in generic adapter scans the entire page and fills everything — no navigation, no custom widgets.

### engine/fiber-bridge.js — React Fiber Access

Runs in **MAIN world** (not ISOLATED) because content scripts can't access `__reactFiber$` properties on DOM elements.

Communicates with the scanner via CustomEvent:
- `jaos:rs-options` — Read react-select available options
- `jaos:rs-fill` — Fill react-select via internal `selectOption()` method

---

## Adapters

### V2 Adapter Contract

Every V2 adapter must implement this interface and push itself to `window.__jaosAtsAdaptersV2`:

```javascript
(function() {
  window.__jaosAtsAdaptersV2 = window.__jaosAtsAdaptersV2 || [];
  window.__jaosAtsAdaptersV2.push({
    name: "my-ats",            // unique identifier

    detect: () => {
      // Return true if current page is this ATS
      return /myats\.com/i.test(location.hostname);
    },

    getFormRoot: () => {
      // Return the form container element (scanner starts here)
      return document.querySelector("#application-form");
    },

    getFlow: (formRoot) => {
      // Return array of steps to execute
      return [
        {
          id: "main_form",
          label: "Application Form",
          waitFor: async (ctx) => {
            // Wait for form to be ready
            await ctx.orchestrator.waitForElement("input[name='name']", formRoot);
          },
          augmentScan: async (ctx, scan) => {
            // Add custom widgets the scanner doesn't know about
            // e.g., yes/no button groups, custom dropdowns
          },
          afterFill: async (ctx, result) => {
            // Post-fill cleanup: close popups, trigger validation
          },
          advance: async (ctx) => {
            // Click "Next" or "Continue" button
            const btn = document.querySelector("button.next");
            if (btn) { btn.click(); return true; }
            return false;
          }
        }
      ];
    },

    shouldOverwrite: () => false  // Skip fields that already have values?
  });
})();
```

### V2 Adapter Summary

| Adapter | File | ATS Framework | Key Quirks |
|---------|------|---------------|------------|
| **Greenhouse** | `greenhouse-v2.js` | React, react-select | `intl-tel-input` phone widget, resume removal pipeline, "Autofill with MyGreenhouse" button disable |
| **Workday** | `workday-v2.js` | Shadow DOM, Knockout.js | `cx-select` custom dropdowns, multi-entry sections (Add/Add Another), tabbed navigation, `forceClosePopups()` |
| **Ashby** | `ashby-v2.js` | React 18 (Vite), CSS Modules | Yes/no `<button>` groups (not checkboxes), combobox with autocomplete, single-page SPA |
| **Lever** | `lever-v2.js` | jQuery | Location typeahead (char-by-char), custom cards (radio/checkbox/textarea), URL field mapping |
| **BambooHR** | `bamboohr-v2.js` | Fabric UI (MUI wrappers) | `fab-SelectToggle` widgets (Enter key to open), honeypot field (`preferredName`), `US_STATES` map |
| **SmartRecruiters** | `smartrecruiters-v2.js` | Multi-page wizard | Pre-fill button click, page navigation, EEO fields |
| **Oracle Cloud** | `oraclecloud-v2.js` | Oracle JET, Knockout.js | Cascade-aware address fill, 20+ YES_NO_RULES, multi-step pagination, portal variant detection |

### V1 Adapters (Legacy)

V1 adapters register on `window.__jaosAtsAdapters` and implement `fillCustom(profile)` with hardcoded selectors. They're used as fallback when V2 doesn't match.

| Adapter | Status | Notes |
|---------|--------|-------|
| `greenhouse.js` | Active (V2 preferred) | 280+ lines of hardcoded selectors |
| `workday.js` | Active (V2 preferred) | Multi-entry experience/education fill |
| `lever.js` | Active (V2 preferred) | URL field pre-fill |
| `ashby.js` | Active (V2 preferred) | Yes/No buttons, resume pane |
| `icims.js` | Active (no V2 yet) | iframe-heavy, custom file upload |
| `smartrecruiters.js` | Active (V2 preferred) | Pre-fill button |
| `bamboohr.js` | Active (V2 preferred) | Custom widgets |
| `paylocity.js` | Active (no V2 yet) | Needs V2 upgrade |
| `taleo.js` | Active (no V2 yet) | Legacy DOM, needs V2 upgrade |
| `jobvite.js` | Active (no V2 yet) | iframe embed detection |

---

## Background Service Worker

**File**: `background.js` (592 lines)

### Responsibilities

1. **API Proxy** — Relay requests to FastAPI backend (content scripts can't call localhost due to CSP)
2. **Profile Cache** — Cache user profile for 60 seconds
3. **LLM Relay** — Forward scanned fields to `/api/v1/ai/map-fields` for LLM mapping
4. **Content Script Injection** — Dynamic injection when manifest injection fails (after extension reload)
5. **Message Router** — Handle all message types from content scripts

### Key Message Handlers

| Message Type | Direction | Purpose |
|-------------|-----------|---------|
| `JAOS_LLM_MAP_FIELDS` | Content → BG | Send scanner output → backend LLM → return `[{uid, value}]` |
| `JAOS_FETCH_PROFILE` | Content → BG | Fetch user profile (with 60s cache) |
| `JAOS_FETCH_BOOTSTRAP` | Content → BG | Initial panel load: user + resumes + job info |
| `JAOS_V2_FILL` | BG → Content (all frames) | Broadcast fill request to all frames (for iframes) |
| `JAOS_V2_FILL_DONE` | Content → BG | Report fill completion from iframe |
| `AUTOFILL_JOB` | Content → BG | V1 autofill request |
| `JAOS_TOGGLE_PANEL` | BG → Content | Show/hide the floating panel |
| `JAOS_SET_LLM_CONFIG` | Content → BG | Store OpenRouter API key + model |
| `JAOS_GET_LLM_CONFIG` | Content → BG | Retrieve LLM config |

### Dynamic Script Injection

When the extension reloads, manifest-injected content scripts are lost on already-open tabs. `background.js` re-injects all scripts programmatically:

```javascript
// In background.js — injectContentScript()
// Must load ALL files in the same order as manifest.json
const files = [
  "adapters/greenhouse.js",
  "adapters/lever.js",
  // ... all V1 adapters
  "engine/scanner.js",
  "engine/filler.js",
  "engine/mapper.js",
  "engine/orchestrator.js",
  "adapters/greenhouse-v2.js",
  // ... all V2 adapters
  "content.js"  // MUST be last
];
```

---

## Content Script (Panel UI)

**File**: `content.js` (2,693 lines)

### Responsibilities

1. **Floating Launcher** — Circular button pinned to right edge at 50% height
2. **Dev Panel** — Slide-out panel with job info, form fields, autofill button
3. **Autofill Routing** — Detect ATS → dispatch to V2 or V1 engine
4. **Resume Upload** — Find file input → remove existing resume → upload JAOS resume via DataTransfer API
5. **Progress Display** — Show X of Y required fields filled, with color-coded field list
6. **Job Context Detection** — Extract job title/company from page meta tags and headings

### Panel UI Elements

- **Launcher**: Floating circle, JAOS logo, click to expand
- **Header**: Job title + company (auto-detected from page)
- **Progress bar**: Green fill based on required field completion
- **Field list**: Required fields (red=missing, green=filled), optional (green only), warnings (amber)
- **"AI Fill" button**: Triggers the autofill cascade
- **Badge**: "Complete" / "X missing" / "X need attention" / "Working..."

### Resume Upload Pipeline

```
1. Find resume file inputs on page (multiple strategies)
2. Remove existing ATS profile resume (if any)
   - Find [aria-label*="Remove"] buttons near resume containers
   - Walk DOM from label to parent container, click remove
   - Wait 800ms for DOM update
3. Upload JAOS resume via DataTransfer API
   - Create File object from resume blob
   - Set on file input via DataTransfer
   - Dispatch change event
```

---

## Message Contracts

### Content ↔ Background

```javascript
// Content script sends:
chrome.runtime.sendMessage({
  type: "JAOS_LLM_MAP_FIELDS",
  payload: {
    fields: [...],        // serialized scanner output
    widgets: [...],
    jobContext: { title, company, url },
    atsPlatform: "greenhouse"
  }
}, (response) => {
  // response = { mappings: [{ uid, value }, ...] }
});

// Background receives, calls backend, responds with mappings
```

### Backend API

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/ai/map-fields` | POST | LLM field mapping (scanner output → uid:value pairs) |
| `/api/v1/auth/me` | GET | Current authenticated user |
| `/api/v1/profile/` | GET | User profile (name, email, phone, etc.) |
| `/api/v1/user-profile/` | GET | Extended profile (education, experience, skills) |
| `/api/v1/autofill-preferences/` | GET | User's autofill settings and preferences |

---

## Backend API Endpoints

The extension talks to the FastAPI backend through `background.js`. All requests go to `http://localhost:8000`.

### LLM Mapping Endpoint

```
POST /api/v1/ai/map-fields

Body:
{
  "fields": [...],           // scanner output (serialized, no DOM refs)
  "widgets": [...],          // custom widgets from augmentScan
  "job_context": {
    "title": "Software Engineer",
    "company": "Acme Inc",
    "url": "https://..."
  },
  "ats_platform": "greenhouse"   // routes to ATS-specific LLM prompt
}

Response:
{
  "mappings": [
    { "uid": "field-001", "value": "Mohammad" },
    { "uid": "field-002", "value": "Aqeel" },
    ...
  ]
}
```

The backend has **ATS-specific LLM system prompts** (`ATS_PROMPTS` dict in `ai.py`) that give the LLM context about each ATS's DOM patterns, required formats (dates, phone numbers), and special rules (honeypots, cascading dropdowns).

---

## How to Add a New V2 Adapter

### Step 1: Recon — Scan the ATS

Use the recon tool or Playwright MCP (see `PLAYWRIGHT_MCP_ADAPTER_GUIDE.md`) to scan 3-5 portals of the target ATS:

```bash
cd scripts/recon-tool
node recon-batch.js --ats myats --urls urls/myats.txt
```

This produces field catalogs, option registries, and DOM patterns.

### Step 2: Create the Rules Doc

Create `myats-rules.md` documenting:
- How to detect the ATS (hostname, DOM markers)
- Form structure (single page vs multi-step)
- Custom widgets (non-standard dropdowns, button groups, etc.)
- Date formats, phone formats, required field indicators
- Known quirks (honeypots, auto-fill blockers, shadow DOM)

### Step 3: Write the Adapter

Create `adapters/myats-v2.js`:

```javascript
(function() {
  window.__jaosAtsAdaptersV2 = window.__jaosAtsAdaptersV2 || [];
  window.__jaosAtsAdaptersV2.push({
    name: "myats",

    detect: () => /myats\.com/i.test(location.hostname),

    getFormRoot: () => document.querySelector("#app-form"),

    getFlow: (formRoot) => [{
      id: "main",
      label: "Application Form",
      waitFor: async (ctx) => {
        await ctx.orchestrator.waitForDomStable(400, 5000);
      },
      augmentScan: async (ctx, scan) => {
        // Add custom widgets here
      },
      afterFill: async (ctx, result) => {
        // Post-fill cleanup
      }
    }],

    shouldOverwrite: () => false
  });
})();
```

### Step 4: Register the Adapter

1. **manifest.json** — Add to `content_scripts[1].js` array (before `content.js`):
   ```json
   "adapters/myats-v2.js",
   ```

2. **background.js** — Add to `injectContentScript()` file list (before `content.js`):
   ```javascript
   "adapters/myats-v2.js",
   ```

3. **V2_ENGINE_BLUEPRINT.md** — Add to adapter registry table.

### Step 5: Create LLM System Prompt (Optional)

If the ATS has unusual field formats or widgets, add an ATS-specific prompt in the backend's `ai.py`:

```python
ATS_PROMPTS["myats"] = """
You are filling a MyATS job application form.
- Date format: MM/DD/YYYY
- Phone format: (XXX) XXX-XXXX
- The "preferredName" field is a honeypot — leave it empty
...
"""
```

### Step 6: Test

1. Load extension → navigate to a MyATS job application
2. Click "AI Fill"
3. Check console for `[JAOS v2]` phase logs
4. Verify all fields filled correctly
5. Test on 3-5 different portals of the same ATS

---

## Debugging Guide

### Console Logs

All V2 engine logs are prefixed with `[JAOS v2]`:

```
[JAOS v2] Detected platform: greenhouse
[JAOS v2] Step 1/3: Personal Information
[JAOS v2] Scanner found 24 fields, 3 widgets
[JAOS v2] LLM returned 22 mappings
[JAOS v2] Filled 20/22 fields (2 skipped — already filled)
[JAOS v2] Step 2/3: Education
...
```

### Manual Scanner Test

Open DevTools console on any job application page:

```javascript
// Scan all fields on the page
const result = window.__jaosScanner.scanPage(document.body);
console.log(result.fields.length, "fields found");
console.log(result.widgets.length, "widgets found");

// See what gets sent to the LLM
const serialized = window.__jaosScanner.serializeForLLM(result);
console.log(JSON.stringify(serialized, null, 2));
```

### Check Adapter Detection

```javascript
// Which V2 adapters are loaded?
console.log(window.__jaosAtsAdaptersV2?.map(a => a.name));

// Which one matches this page?
const match = window.__jaosAtsAdaptersV2?.find(a => a.detect());
console.log("Matched:", match?.name || "none");
```

### Network Tab

Watch for `POST /api/v1/ai/map-fields` in the Network tab to see:
- What scanner output was sent
- What mappings the LLM returned
- Response time (typically 8-19 seconds)

### Common Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| "No adapter found" | V2 adapter not loaded | Check manifest.json + background.js injection |
| Fields scanned but 0 mappings | LLM backend error | Check backend logs for `/api/v1/ai/map-fields` |
| Fields filled with wrong values | LLM hallucination | Add ATS-specific system prompt in `ai.py` |
| React fields don't update | Missing React event dispatch | Use `filler.setValue()` which uses native setter |
| Custom dropdown not filled | Scanner didn't detect widget | Add to `augmentScan()` in adapter |
| Panel doesn't appear | content.js not loaded | Check extension is loaded, try reloading page |

---

## Known Bugs & Issues

### Critical

| Bug | Location | Impact |
|-----|----------|--------|
| Profile cache survives logout | `background.js` (60s cache, no invalidation on 401) | User A data shown to User B |
| V2 iframe broadcast can hang 35s | `content.js` (waits full timeout if no adapter matches) | Poor UX |
| No retry on LLM mapping failure | `mapper.js` (zero retry logic) | Entire step gets no mappings |

### Moderate

| Bug | Location | Impact |
|-----|----------|--------|
| MutationObservers on `document.body` | `orchestrator.js` | Expensive on heavy SPAs |
| Options capped at 50 | `scanner.js` serialization | Country/state dropdowns may lose options |
| All scripts loaded on every page | manifest.json `<all_urls>` | Performance on non-ATS sites |
| `content.js` is 2,693-line monolith | `content.js` | Hard to maintain, needs split |
| `hasUploadedResume` is boolean | `content.js` | Double-click race condition |

---

## Key Design Decisions

### Why Universal Scanner + LLM instead of hardcoded selectors?

ATS platforms redesign their forms frequently. Hardcoded selectors (like Jobright's 42 XPath handlers) break on every redesign. The universal scanner finds fields by their semantic properties (label, type, section context) which survive redesigns. The LLM maps values semantically ("First Name" → user's first name) regardless of selector changes.

**Resilience**: V2 survives ~60-70% of ATS redesigns without code changes. V1/Jobright approach survives ~40-50%.

### Why adapters exist if the engine is "universal"?

The scanner and mapper handle 80% of any form. But each ATS has quirks that need adapter help:
- **Workday**: Shadow DOM, custom `cx-select` dropdowns
- **Greenhouse**: react-select needs Fiber bridge
- **BambooHR**: Fabric UI dropdowns only open with Enter key
- **Oracle Cloud**: Cascading address fields (country → state → city)

Adapters are thin (~150-350 lines) and only handle what the generic engine can't.

### Why LLM calls go through the backend?

1. **CSP** — Content scripts can't call external APIs (browser blocks it)
2. **API key security** — Keys stay server-side, never in the extension
3. **ATS-specific prompts** — Backend routes to per-ATS system prompts
4. **Profile access** — Backend has full user profile, no need to send it from client

### Why two injection paths?

Chrome extensions lose their manifest-injected content scripts on already-open tabs when the extension reloads. The programmatic path (`chrome.scripting.executeScript`) re-injects everything on demand. Both paths must load the exact same files in the same order.

---

## Additional Resources

- `V2_ENGINE_BLUEPRINT.md` — Deep architecture doc, competitor analysis, full roadmap
- `ADAPTER_ROADMAP.md` — Prioritized ATS build queue with job volume data
- `UI_FIELD_PROGRESS_STANDARD.md` — Rules for progress bar consistency
- `PLAYWRIGHT_MCP_ADAPTER_GUIDE.md` — How to use Playwright MCP for adapter development
- `scripts/recon-tool/RECON-WORKFLOW.md` — Step-by-step recon scanning guide
- `{ats}-rules.md` files — Per-ATS DOM reference
- `field-catalogs/{ats}-fields.md` — Per-ATS field frequency data
