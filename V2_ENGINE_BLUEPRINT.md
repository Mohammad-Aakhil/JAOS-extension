# JAOS V2 Engine Blueprint

> **Purpose**: Single source of truth for the V2 autofill engine architecture, competitor analysis, and build roadmap.
> Read this file at the start of every new session to avoid re-research and token burns.
> Last updated: 2026-03-03

---

## Table of Contents

1. [Current V2 Architecture](#current-v2-architecture)
2. [Module Reference](#module-reference)
3. [Message Contracts](#message-contracts)
4. [Priority Cascade](#priority-cascade)
5. [Known Bugs & Issues](#known-bugs--issues)
6. [Jobright Competitor Analysis](#jobright-competitor-analysis)
7. [Architecture Comparison](#architecture-comparison)
8. [V2 Resilience Assessment](#v2-resilience-assessment)
9. [Build Proposal — 3 Layer Strategy](#build-proposal--3-layer-strategy)
10. [Phase Roadmap](#phase-roadmap)
11. [Adapter Registry](#adapter-registry)
12. [Decision Log](#decision-log)

---

## Current V2 Architecture

```
┌─ Content Scripts (all_frames, document_idle) ─────────────────────────┐
│                                                                        │
│  engine/scanner.js  → window.__jaosScanner    (529 lines)              │
│  engine/filler.js   → window.__jaosFiller     (341 lines)              │
│  engine/mapper.js   → window.__jaosMapper     (90 lines)               │
│  engine/orchestrator.js → window.__jaosOrchestrator (454 lines)        │
│                                                                        │
│  adapters/greenhouse-v2.js  → pushes to window.__jaosAtsAdaptersV2     │
│  adapters/workday-v2.js     → pushes to window.__jaosAtsAdaptersV2     │
│                                                                        │
│  content.js (2693 lines) → Panel UI + autofill routing                 │
│                                                                        │
├─ Background Service Worker ────────────────────────────────────────────┤
│  background.js (592 lines) → API proxy, profile cache, LLM relay      │
│  engine/llm-client.js → importScripts (unused in V2, backend handles)  │
└────────────────────────────────────────────────────────────────────────┘
```

### Flow: What happens when user clicks "AI Fill"

```
1. content.js: Click handler fires
2. Check: hasV2Engine() && hasV2AdapterMatch()?
   ├── YES → Run V2 directly in current frame
   └── NO  → Broadcast JAOS_V2_FILL to all frames via background
3. orchestrator.run(profile, jobContext, options)
4. For each step in adapter.getFlow():
   a. waitFor()          — MutationObserver waits for form readiness
   b. action()           — Pre-scan action (click tab, expand section)
   c. scanner.scanPage() — Universal field discovery
   d. augmentScan()      — Adapter adds custom widgets
   e. mapper.requestMappings() → background → POST /api/v1/ai/map-fields
   f. filler.fillField() — Fills each mapped field
   g. afterFill()        — React sync, validation
   h. advance()          — Navigate to next step
5. Return { ok, totalFilled, steps, errors }
```

---

## Module Reference

### scanner.js (window.__jaosScanner)

| Function | Purpose |
|----------|---------|
| `scanFields(root)` | Find all visible input/select/textarea elements (skips select2-controlled) |
| `scanReactSelects(root)` | Detect React-select widgets by class pattern |
| `scanAriaWidgets(root)` | Detect ARIA combobox/listbox widgets (skips select2 elements) |
| `scanSelect2Widgets(root)` | Detect Select2 dropdowns (v3 + v4), extract label/options from hidden `<select>` |
| `scanPage(root)` | Full scan → `{ fields, widgets }` (includes react-select, ARIA, select2) |
| `serializeForLLM(result)` | Strip DOM refs, cap options at 50, compact JSON |
| `deepQuerySelectorAll(sel, root)` | Recursive Shadow DOM piercing |
| `getLabel(el)` | 7-source label extraction (label[for], wrapping, aria, heading, sibling, parent, describedby) |
| `getSectionContext(el)` | Walk up 12 levels for section heading |
| `isVisible(el)` | offsetParent + computed style check |

**Field metadata extracted**: uid, tag, type, label, section, required, currentValue, options, dataTestId, dataAutomationId, dataFieldId, dataUiAutomationId, placeholder, ariaLabel, role.

**Shadow DOM**: `deepQuerySelectorAll()` recursively traverses shadowRoot boundaries. Essential for Workday/OracleCloud.

### filler.js (window.__jaosFiller)

| Function | Purpose |
|----------|---------|
| `typeText(el, value, opts)` | Char-by-char with random 15-55ms delays |
| `setValue(el, value)` | Instant set with React-compatible native setter |
| `fillSelect(el, value)` | 5-tier matching: exact → partial → contains → word-overlap → decline |
| `fillCheckbox(el, shouldCheck)` | Check/uncheck with input+change+click events |
| `fillReactSelect(container, value)` | Click control → wait menu → match/search → select |
| `fillSelect2(descriptor, value)` | Click trigger → wait active dropdown → search → 5-tier match → click option (v3+v4) |
| `fillFileInput(el, file)` | DataTransfer API |
| `fillField(descriptor, value, opts)` | Main dispatcher by field type (react-select, aria-combobox, select2, select, checkbox, text) |

**React compat**: Uses `Object.getPrototypeOf(el).value` setter to bypass React's synthetic event system.

**Humanization**: Random keystroke delay (15-55ms), post-focus (30-80ms), post-clear (20-50ms), post-change (50-120ms), between fields (60-150ms).

### mapper.js (window.__jaosMapper)

| Function | Purpose |
|----------|---------|
| `requestMappings(fields, _profile, jobContext)` | Send to background → backend LLM → return `[{uid, value}]` |
| `buildElementLookup(scanResult)` | Create `Map<uid → descriptor>` for fill phase |
| `sendToBackground(message)` | Promise wrapper for chrome.runtime.sendMessage |

**Key**: No API key in extension. Backend handles all LLM calls. Content script sends scanner output, gets back uid→value mappings.

### orchestrator.js (window.__jaosOrchestrator)

| Function | Purpose |
|----------|---------|
| `run(profile, jobContext, options)` | Main entry: detect adapter → execute flow |
| `executeFlow(adapter, profile, jobContext, options)` | Step-by-step flow executor |
| `detectPlatform()` | Iterates V2 adapters, returns first match |
| `waitForMutation(opts)` | MutationObserver wait with predicate + timeout (10s) |
| `waitForDomStable(quietMs, maxMs)` | Wait for no mutations for quietMs (default 400ms, max 5s) |
| `waitForElement(sel, root, timeout)` | Wait for selector to appear |
| `waitForRemoval(sel, root, timeout)` | Wait for selector to disappear |
| `GENERIC_ADAPTER` | Fallback: scan everything, fill everything, no navigation |

**Flow step contract**:
```javascript
{
  id: "step_name",
  label: "Human readable",
  waitFor: async (ctx) => {},       // wait for form ready
  action: async (ctx) => {},        // pre-scan action
  getFormRoot: (ctx) => HTMLElement, // custom scan root
  augmentScan: async (ctx, scan) => {}, // add custom widgets
  shouldOverwrite: (field) => bool, // override fill logic
  afterFill: async (ctx, result) => {}, // post-fill
  advance: async (ctx) => bool,     // navigate to next
}
```

**Context object passed to adapter steps**:
```javascript
ctx = {
  profile, jobContext, adapter, stepResults,
  onProgress,  // callback for UI updates
  utils: { waitForMutation, waitForDomStable, waitForElement, waitForRemoval, scanner, filler }
}
```

### V2 Adapter Contract

```javascript
{
  name: "greenhouse",
  detect: () => boolean,           // Is this ATS?
  getFormRoot: () => HTMLElement,   // Where to scan
  getFlow: (formRoot) => Step[],   // Steps to execute
  shouldOverwrite: () => boolean,  // Overwrite existing values?
}
```

Adapters register on `window.__jaosAtsAdaptersV2` array.

---

## Message Contracts

### Content ↔ Background

| Type | Direction | Purpose |
|------|-----------|---------|
| `JAOS_LLM_MAP_FIELDS` | Content → BG | Send scanned fields, get LLM mappings |
| `JAOS_FETCH_PROFILE` | Content → BG | Fetch user profile (bypasses cache) |
| `JAOS_V2_FILL` | BG → Content (all frames) | Broadcast fill to all frames |
| `JAOS_V2_FILL_DONE` | Content → BG | Report fill completion from iframe |
| `AUTOFILL_JOB` | Content → BG | V1 autofill request |
| `JAOS_FETCH_BOOTSTRAP` | Content → BG | Initial panel load (user, resumes, job) |
| `JAOS_TOGGLE_PANEL` | BG → Content | Panel show/hide |

### Backend API

| Endpoint | Purpose |
|----------|---------|
| `POST /api/v1/ai/map-fields` | LLM field mapping (fields + widgets → uid:value pairs) |
| `GET /api/v1/auth/me` | Current user |
| `GET /api/v1/profile/` | User profile |
| `GET /api/v1/user-profile/` | Extended profile (education, experience, etc.) |
| `GET /api/v1/autofill-preferences/` | Autofill settings |

---

## Priority Cascade

```
content.js runDomAutofill(profile, options):

1. forceV1=true?
   └── V1 DOM fill (no LLM)

2. V2 Engine available? (scanner + mapper + filler + orchestrator)
   ├── V2 Adapter matches? → Run V2 directly
   └── No adapter match   → Broadcast JAOS_V2_FILL to all frames

3. V1 ATS adapter matches? → Run V1 adapter + selector fill

4. Nothing matches → Heuristic keyword fill
```

---

## Known Bugs & Issues

### Critical

| Bug | Location | Impact |
|-----|----------|--------|
| Profile cache survives logout | background.js (60s cache, no invalidation on 401) | User A data shown to User B |
| React-select timeout too short | filler.js (40×50ms = 2s max polling) | Fails on slow SPAs |
| V2 iframe broadcast can hang 35s | content.js (waits full timeout if no adapter matches in any iframe) | Poor UX |
| No retry on LLM mapping failure | mapper.js (zero retry logic) | Entire step gets no mappings |

### Moderate

| Bug | Location | Impact |
|-----|----------|--------|
| MutationObservers on document.body | orchestrator.js | Expensive on heavy SPAs |
| Options capped at 50 | scanner.js serialization | Country/state dropdowns lose hidden options |
| Label walk limited to 12 levels | scanner.js getSectionContext | Deep-nested forms miss section context |
| No explicit "no adapter" iframe response | content.js V2 broadcast | Silent failure |
| `hasUploadedResume` is boolean not semaphore | content.js | Double-click race condition |
| All scripts loaded on every page | manifest.json `<all_urls>` | Performance on non-ATS sites |
| content.js is 2693 line monolith | content.js | Unmaintainable, needs split |

---

## Jobright Competitor Analysis

> Source: Reverse-engineered from Chrome extension v1.0.2 (Edge store ID: odcnpipkhjegpefkfplmedhmkmmhmoko)

### Architecture

```
constants.js (5 KB)   → Config, ATS domain list, Greenhouse selectors
filler.js (137 KB)    → TaskQueue, ProgressTracker, XPath utils, iframe comms
answer.js (3.3 MB)    → 42 ATS handler classes + lodash (loaded on-demand)
contents.js (3.3 MB)  → React UI (Plasmo framework, Zustand, Antd)
background/index.js   → Plasmo message router, 35+ message handlers
```

### How Jobright Fills Forms

```
1. W() detects ATS by hostname → returns "greenhouse"
2. K.create() → new G["greenhouse"]() → instantiate ATS handler class
3. handler.fillForm():
   a. extractRules()         ← Per-ATS XPath DOM walking (HARDCODED per portal)
   b. getElementRules()      ← Sends fields to server: POST /swan/autofill/fill
   c. Server calls GPT       ← Returns { fill_data_list: [{name, value}], profile_data }
   d. operationConfig[type]  ← Dispatch fill by FIELD_TYPE (TEXT/SELECT/CHECKBOX/etc.)
   e. taskQueue.run()        ← Sequential execution
   f. handleResumeUpload()   ← Per-ATS resume logic
   g. finalizeFillForm()     ← Post progress, show star rating
```

### 42 ATS Handler Classes

```javascript
G = {
  greenhouse, lever, myworkday, ashbyhq, jobvite, icims, breezy, dover,
  bamboohr, rippling, oraclecloud, taleo, smartrecruiters, workable,
  catsone, tesla, amazon, dayforce, ultipro, adobe, zohorecruit,
  zohorecruitV2, eightfold, jazzhr, freshteam, pinpointhq, gem,
  recruitee, recruiterflow, paycomonline, jobscore, paylocity,
  teamtailor, avature, trinethire, uber, okta, comeet, ycombinator,
  adpWorkforceNow, adpMyJobs, adpRecruiting
}
```

Each handler is a **full class** with its own `extractRules()`, `fillForm()`, `handleResumeUpload()`, `getSiteName()`. Typically 200-500 lines of per-ATS XPath logic.

### Jobright API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /swan/autofill/fill` | GPT field mapping (v1) |
| `POST /swan/autofill/fill-v2` | GPT field mapping (v2) |
| `GET /swan/autofill/token?domain=...` | Site auth token |
| `GET /swan/credit/balance-v2` | Credits balance |
| `GET /swan/payment/subscription` | Subscription status |
| `GET /swan/autofill/cost-credit` | Cost per fill |
| `GET /swan/autofill/config` | Autofill config |

**Key insight**: They charge per autofill (402 Payment Required handling).

### Jobright Tech Stack

- **Framework**: Plasmo (React-based extension framework)
- **UI**: React + Zustand + Antd
- **Bundler**: Parcel
- **Field discovery**: Per-ATS XPath (`document.evaluate`)
- **Value mapping**: Server-side GPT
- **Fill dispatch**: Type-based (TEXT/SELECT/CHECKBOX/RADIO/DATE)
- **Orchestration**: TaskQueue (sequential async, pause/resume)
- **Iframe comms**: `window.postMessage` with typed events

### What Jobright Does Right (Steal These)

| Feature | Implementation |
|---------|---------------|
| On-demand engine loading | `answer.js` in web_accessible_resources, not content_scripts |
| iframe exclusions | `exclude_matches` for Cloudflare, GTM, reCAPTCHA, DoubleClick |
| Credit monetization | 402 handling, balance checks, subscription management |
| TaskQueue pause/cancel | Queue with isIdle/isRunning/isPaused states |
| Progress tracking | ProgressTracker with filled/missing/required arrays |
| Star rating feedback | Post-fill feedback modal |
| Timing metrics | rulesParseStartTime, requestStartTime, fillStartTime |

### What Jobright Does Wrong

| Weakness | Detail |
|----------|--------|
| No universal scanner | Every ATS has its own XPath-based `extractRules()` |
| No Shadow DOM support | Can't handle Workday/OracleCloud web components |
| No humanized typing | Basic event dispatch, no random delays |
| No MutationObserver waits | Uses `setTimeout` and `setInterval` for DOM readiness |
| Fragile XPath selectors | `'.//fieldset[contains(@class, "ashby-application-form-field-entry")]'` breaks on any class rename |
| Massive bundle | answer.js = 3.3MB (includes full lodash-es) |
| No React compat hacks | No `_valueTracker` reset, no native value setter |

---

## Architecture Comparison

| Aspect | JAOS V2 | Jobright |
|--------|---------|----------|
| **Field discovery** | Universal CSS scanner (1 for all) | Per-ATS XPath (42 implementations) |
| **Value mapping** | Server LLM | Server GPT |
| **Widget handling** | Per-adapter quirk handlers | Per-ATS fill functions |
| **Orchestration** | MutationObserver (reactive) | TaskQueue (sequential) |
| **ATS coverage** | 2 adapters | 42 handlers |
| **React compat** | `_valueTracker` hack + native setter | Basic dispatchEvent |
| **Shadow DOM** | `deepQuerySelectorAll` recursive | Not handled |
| **Humanized typing** | Random delays, char-by-char | Not visible |
| **Performance** | All scripts on every page | On-demand answer.js |
| **Telemetry** | None | Star rating + feedback |
| **Monetization** | None | Credits per fill |
| **Framework** | Vanilla JS | Plasmo (React, Zustand, Parcel) |
| **Code footprint** | ~5KB engine + thin adapters | ~3.5MB total |

---

## V2 Resilience Assessment

### When a portal redesigns:

| Component | JAOS V2 | Jobright |
|-----------|---------|----------|
| Detection (hostname) | Survives | Survives |
| Field discovery | **Survives** (universal scanner) | **Breaks** (per-ATS XPath) |
| Value mapping (label→value) | Survives (LLM) | Survives (GPT) |
| Custom widget fill | Breaks (adapter quirks) | Breaks (per-ATS fill) |
| Multi-step navigation | Breaks (adapter flow) | Breaks (per-ATS flow) |
| Overall resilience | ~60-70% survives | ~40-50% survives |

**JAOS V2 is architecturally stronger.** Jobright compensates with 42 handlers + dedicated team patching them.

---

## Build Proposal — 3 Layer Strategy

### Layer 1: Bulletproof Generic Engine (~80% portal coverage without adapters)

The generic adapter must handle these 5 capabilities without any per-ATS code:

**1.1 LLM-Powered Navigation**
Ask the LLM: "Here are all buttons: [Save, Next, Continue, Submit]. Which advances the form?"
One prompt, works everywhere. No regex button matching.

**1.2 Auto Multi-Step Detection**
If page has tabs/progress bars/subset of fields visible → it's multi-step.
Fill visible → find advance button → wait DOM change → scan again → repeat.

**1.3 Universal Widget Handlers (8 types)**
Build per-widget-TYPE, not per-ATS:

| Widget Type | Detection | Fill Strategy |
|-------------|-----------|---------------|
| Native `<select>` | `tagName === 'SELECT'` | Set value + change event |
| Select2 dropdown | `.select2-container` (v3 + v4) | Click trigger → wait dropdown → search input → match option → click |
| Searchable dropdown | `[role="combobox"]` or `[class*="select__control"]` | Click → type → pick option |
| Custom radio group | `[role="radiogroup"]` or grouped `[role="radio"]` | Find matching option, click |
| Custom checkbox group | `[role="group"]` with `[role="checkbox"]` | Match label, click |
| Date picker | type=date, or labeled date field | Detect format from placeholder, fill |
| File upload | type=file | DataTransfer API |
| Phone + country code | Phone field near country dropdown | Detect dropdown type, fill country first |
| Rich text / textarea | `[contenteditable]` or `<textarea>` | innerHTML or value + input event |

**1.4 iframe Auto-Discovery**
Scan all iframes. If iframe has form fields, run engine inside it.
Use `postMessage` for cross-frame communication (same as Jobright).

**1.5 Post-Fill Validation & Retry**
After fill, re-scan. If required fields still empty → retry with different interaction strategy.

### Layer 2: Thin Quirk Adapters (15-20 portals, ~15% more coverage)

Each adapter is ONLY: detection + known quirks the generic engine can't handle.
Target: 30-150 lines per adapter. No `extractRules()`, no `fillForm()`.

| # | ATS | Quirks Needing Adapter | Est. Lines |
|---|-----|----------------------|-----------|
| 1 | Greenhouse | React-select edge cases, phone intl-tel-input, multi-step progress detection | ~100 |
| 2 | Workday | Shadow DOM heavy, `data-automation-id` navigation, tabbed sections | ~150 |
| 3 | Lever | Custom dropdowns, simple multi-page | ~40 |
| 4 | iCIMS | iframe-heavy, custom file upload widget | ~80 |
| 5 | Ashby | Custom search combobox (`ashby-search` type) | ~60 |
| 6 | Taleo | Legacy DOM, session-based form refresh | ~80 |
| 7 | SmartRecruiters | Pre-fill button click, multi-page wizard | ~70 |
| 8 | BambooHR | Custom checkbox/radio widgets (`_bAmBoO_` pattern) | ~50 |
| 9 | ADP (3 variants) | Shadow DOM (`sdf-*` components), 3 subdomains | ~120 |
| 10 | Rippling | `Select-control` class widgets, variant detection | ~50 |
| 11 | OracleCloud | SAP web components, Shadow DOM | ~80 |
| 12 | Jobvite | iframe embed detection | ~40 |
| 13 | Breezy | Mostly generic works, minor formatting | ~30 |
| 14 | Dover | Minimal quirks | ~30 |
| 15 | Eightfold | Custom platform detection, widget patterns | ~60 |

### Layer 3: Telemetry + Self-Healing Loop

**Log every fill attempt to backend:**
```javascript
{
  url: "greenhouse.io/apply/...",
  ats: "greenhouse",           // detected or "generic"
  adapterUsed: "greenhouse-v2" | "generic",
  fieldsScanned: 12,
  fieldsMapped: 10,
  fieldsFilled: 8,
  fieldsFailed: [{ uid, label, reason }],
  widgetTypes: ["react-select", "native-select", "text"],
  durationMs: 3200,
  steps: [{ stepId, filled, total, errors }],
  timestamp: "..."
}
```

**Enables:**
- Which portals fail most → prioritize adapter work
- Which widget types fail → improve generic handlers
- Which fields LLM maps wrong → improve prompts
- Regression detection → ATS redesigned, fill rate dropped
- A/B test generic vs adapter → validate adapter necessity

---

## Phase Roadmap

### Phase 1: Bulletproof Generic Engine (Week 1-2)

- [ ] Universal widget handlers (8 types above)
- [ ] LLM-powered navigation ("find Next button" prompt)
- [ ] Auto multi-step detection (scan → fill visible → advance → repeat)
- [ ] iframe auto-discovery and cross-frame fill
- [ ] Post-fill validation + retry with alternate interaction
- [ ] Fix critical bugs (profile cache, React-select timeout, LLM retry)

### Phase 2: Top 8 Thin Adapters (Week 3-4)

- [ ] Greenhouse, Workday, Lever, iCIMS
- [ ] Ashby, Taleo, SmartRecruiters, BambooHR
- [ ] Each: detection + quirks only (30-150 lines)
- [ ] Refactor existing greenhouse-v2.js to thin adapter format

### Phase 3: Telemetry + Feedback (Week 5)

- [ ] Backend endpoint for fill telemetry
- [ ] Field-level success/failure logging
- [ ] Post-fill feedback UI in panel
- [ ] Regression alert system

### Phase 4: Remaining Adapters + Polish (Week 6+)

- [ ] ADP (3 variants), Rippling, OracleCloud, Jobvite, Breezy, Dover, Eightfold
- [ ] On-demand engine loading (move to web_accessible_resources)
- [ ] iframe exclusions (Cloudflare, GTM, reCAPTCHA)
- [ ] Split content.js monolith (panel UI / engine routing / V1 compat)
- [ ] Fill quota / monetization infrastructure

---

## Adapter Registry

Track adapter status here:

| ATS | V1 Adapter | V2 Adapter | Status | Notes |
|-----|-----------|-----------|--------|-------|
| Greenhouse | `adapters/greenhouse.js` | `adapters/greenhouse-v2.js` | Active | React-select + phone quirks |
| Workday | `adapters/workday.js` | `adapters/workday-v2.js` | Active | Shadow DOM + tabs |
| Lever | `adapters/lever.js` | — | V1 only | Needs V2 thin adapter |
| iCIMS | `adapters/icims.js` | — | V1 only | iframe-heavy |
| Ashby | `adapters/ashby.js` | — | V1 only | Custom combobox |
| Taleo | `adapters/taleo.js` | — | V1 only | Legacy DOM |
| SmartRecruiters | `adapters/smartrecruiters.js` | — | V1 only | Multi-page |
| BambooHR | `adapters/bamboohr.js` | — | V1 only | Custom widgets |
| Rippling | `adapters/rippling.js` | — | V1 only | Select-control |
| Jobvite | `adapters/jobvite.js` | — | V1 only | iframe embed |

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-27 | V2 engine uses server-side LLM, no API key in extension | CSP compliance + security |
| 2026-02-27 | MutationObserver over setTimeout for DOM readiness | Reactive, adapts to rendering speed |
| 2026-02-27 | Adapters define flows, engine executes | Separation of concerns |
| 2026-03-03 | 3-layer strategy (generic + 15 adapters + telemetry) | Beat Jobright's 42 handlers with less code |
| 2026-03-03 | Generic engine is priority over more adapters | 80% coverage from 1 smart engine > 42 dumb handlers |
| 2026-03-03 | Steal: on-demand loading, iframe exclusions, telemetry, monetization | Validated by Jobright's production extension |

---

## Quick Reference for New Sessions

**To understand the V2 engine, read in this order:**
1. This file (architecture + context)
2. `engine/orchestrator.js` — flow execution
3. `engine/scanner.js` — field discovery
4. `engine/filler.js` — form filling
5. `engine/mapper.js` — LLM bridge
6. `adapters/greenhouse-v2.js` — reference adapter
7. `content.js` lines 579-714 — V2 routing logic
8. `background.js` lines 246-280 — LLM proxy handler

**To add a new V2 adapter:**
1. Create `adapters/<ats>-v2.js`
2. Implement: `{ name, detect, getFormRoot, getFlow, shouldOverwrite }`
3. Push to `window.__jaosAtsAdaptersV2`
4. Add to `manifest.json` content_scripts AND `injectContentScript()` in background.js
5. Update adapter registry in this file

**To debug a fill failure:**
1. Check console for `[JAOS v2]` phase logs
2. Scanner output: `window.__jaosScanner.scanPage(document.body)`
3. Serialized for LLM: `window.__jaosScanner.serializeForLLM(scanResult)`
4. Mapper result: Check network tab for `/api/v1/ai/map-fields` response
5. Filler: Check if element exists in DOM at fill time (uid lookup)
