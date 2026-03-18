
# JAOS Adapter Roadmap


> **Source**: 5,349 deduplicated jobs across 44 ATS platforms (15 data files, March 2026)
> **Last updated**: 2026-03-18

---

## Coverage Summary

| Status | ATS Count | Jobs Covered | % of Total |
|--------|-----------|-------------|------------|
| Strong adapters (prod-ready) | 4 | 2,509 | 47% |
| Partial / in-progress | 3 | 1,110 | 21% |
| Not started (priority) | 5 | 693 | 13% |
| Not started (low priority) | 11 | 468 | 9% |
| Long tail (21 platforms) | 21 | ~569 | 10% |
| **Total** | **44** | **5,349** | **100%** |

---

## Tier 1 — Strong Adapters (Production-Ready)

These have v2 adapters with tested ATS-specific logic, LLM prompts, and multi-portal validation.

| # | ATS | Jobs | Companies | Adapter File | Status | Notes |
|---|-----|------|-----------|-------------|--------|-------|
| 1 | **Workday** | 1,675 | 521 | `workday-v2.js` | Prod | Multi-step tabs, Knockout.js. Tabs 3-6 need work |
| 2 | **Greenhouse** | 573 | 321 | `greenhouse-v2.js` | Prod | React-select, resume override, fiber bridge |
| 3 | **OracleCloud** | 236 | 86 | `oraclecloud-v2.js` | Prod | Knockout/JET, cascade address, portal variants |
| 4 | **BambooHR** | 25 | 22 | `bamboohr-v2.js` | Prod | Fabric UI, fab-SelectToggle, honeypot detection |

**Subtotal: 2,509 jobs (47%)**

---

## Tier 2 — In Progress (Partial V2 Adapters)

These have v2 adapter files but need enhancements, bug fixes, or multi-portal validation.

| # | ATS | Jobs | Companies | Adapter File | Status | Known Issues |
|---|-----|------|-----------|-------------|--------|-------------|
| 5 | **Lever** | 802 | 55 | `lever-v2.js` | 90% | Location typeahead needs manual pick (React controlled). EEO radio/checkbox/select all handled. Card field label enrichment done. Skills checkbox matching done. |
| 6 | **Ashby** | 175 | 120 | `ashby-v2.js` | 20% | Basic detection only. React 18 SPA, CSS Modules, stable `ashby-*` class anchors. Framework analysis done. No field fill logic yet. |
| 7 | **SmartRecruiters** | 133 | 40 | `smartrecruiters-v2.js` | 10% | Skeleton adapter. Multi-page wizard, pre-fill button detection needed. |

**Subtotal: 1,110 jobs (21%)**

---

## Tier 3 — Priority Build Queue (No V2 Adapter Yet)

Ordered by job volume × unique companies. These are the next adapters to build.

| # | ATS | Jobs | Companies | Domain Pattern | Framework | Priority |
|---|-----|------|-----------|---------------|-----------|----------|
| 8 | **iCIMS** | 294 | 140 | `*.icims.com` | iframe-heavy, custom file upload | HIGH |
| 9 | **Eightfold** | 192 | 30 | `apply.careers.*` | Unknown — needs recon | HIGH |
| 10 | **Phenompeople** | 182 | 68 | `careers.*.com` | Unknown — needs recon | MEDIUM |
| 11 | **JazzHR** | 197 | 95 | `*.applytojob.com` | Unknown — needs recon | MEDIUM |
| 12 | **ADP** | 129 | 90 | `workforcenow.adp.com` | Shadow DOM, 3 subdomain variants | MEDIUM |

**Subtotal: 994 jobs (19%)**

---

## Tier 4 — Future Adapters (Lower Priority)

| # | ATS | Jobs | Companies | Domain | Notes |
|---|-----|------|-----------|--------|-------|
| 13 | SuccessFactors | 104 | 63 | Various custom domains | SAP-based |
| 14 | Paylocity | 68 | 55 | `recruiting.paylocity.com` | |
| 15 | Taleo | 66 | 25 | `*.taleo.net` | Legacy DOM, session-based |
| 16 | GoHire | 56 | 1 | `jobs.gohire.io` | Single company — low ROI |
| 17 | Workable | 46 | 27 | `jobs.workable.com` | |
| 18 | UltiPro | 31 | 20 | `*.ultipro.com` | |
| 19 | Jobvite | 30 | 14 | `jobs.jobvite.com` | iframe embed |
| 20 | CareerPlug | 29 | 21 | `*.careerplug.com` | |
| 21 | Comeet | 26 | 10 | `comeet.com` | |
| 22 | Rippling | 24 | 23 | `ats.rippling.com` | Select-control widgets |
| 23 | In-house | 132 | 4 | `amazon.jobs`, `google.com` | Custom — not worth adapting |

**Subtotal: 612 jobs (11%)**

---

## Build Priority Formula

```
Score = (total_jobs × 0.4) + (unique_companies × 0.6)
```

Why companies matter more: each unique company may have different form configurations.
High company count = more variant coverage = more reliable adapter.

| ATS | Jobs × 0.4 | Companies × 0.6 | Score | Rank |
|-----|-----------|----------------|-------|------|
| Lever | 320.8 | 33.0 | 353.8 | 1 (in progress) |
| iCIMS | 117.6 | 84.0 | 201.6 | 2 |
| Ashby | 70.0 | 72.0 | 142.0 | 3 (in progress) |
| JazzHR | 78.8 | 57.0 | 135.8 | 4 |
| ADP | 51.6 | 54.0 | 105.6 | 5 |
| Eightfold | 76.8 | 18.0 | 94.8 | 6 |
| Phenompeople | 72.8 | 40.8 | 113.6 | 7 |
| SmartRecruiters | 53.2 | 24.0 | 77.2 | 8 (in progress) |

---

## Coverage Milestones

```
┌─────────────────────────────────────────────────────────┐
│ Tier 1 (done)     ████████████████████░░░░░  47%        │
│ + Tier 2 (WIP)    ████████████████████████░  68%        │
│ + Tier 3 (next)   █████████████████████████  87%        │
│ + Tier 4 (future) █████████████████████████  98%        │
└─────────────────────────────────────────────────────────┘
```

**Target: Tier 1 + 2 + 3 = 87% coverage (4,613 / 5,349 jobs)**

---

## Lever Adapter — Session Log (2026-03-18)

### What was done
- **EEO radio/checkbox groups**: New `EEO_RADIO_FILLS` table handles portals where gender/race/veteran/age are radio groups instead of `<select>`
- **Skills checkbox groups**: Matches profile skills against checkbox options (e.g., "Select tools/languages you have experience in")
- **Label enrichment**: Extended to radio-groups, checkbox-groups, and `surveysResponses[*]` fields — not just `cards[*]`
- **`getLeverLabel()` hardened**: Added `.application-label` search in `li.application-question` + parent walk (6 levels)
- **`_matchSelectOption` fix**: Filters out "Select ..." placeholders, requires 3+ char overlap for partial matches
- **Veteran status**: Fallback cascade: profile → "I am not a veteran" → "Decline to self-identify"
- **`preFilledLabels` tracking**: Progress UI now shows clean readable labels instead of `cards[uuid][field8]`
- **Orchestrator update**: Reads `scanResult.preFilledLabels[]` for pre-filled field display

### Known limitation
- **Location typeahead**: React-controlled input — programmatic selection gets cleared on blur (`isTrusted: false` events). Current behavior: types city + shows dropdown, user clicks to select (1 click). Acceptable UX tradeoff.

---

## Framework Detection Results (Ashby — 3 portals)

| Pattern | Result | Reliability |
|---------|--------|-------------|
| React root | `div#root` always | 100% |
| React version | 18+ (`createRoot`, fiber key on children) | 100% |
| Fiber key | Available but hash changes per build | Dynamic discovery needed |
| CSS strategy | CSS Modules (`_name_hash_num`) — unstable | Never use as selectors |
| Stable classes | `ashby-job-posting-*`, `ashby-application-*` | Safe to use |
| `<form>` tag | 0 on all portals | Use `.ashby-application-form` as root |
| Shadow DOM | 0 | Simple traversal |
| SPA framework | Not Next.js — vanilla React (Vite bundle) | N/A |
| reCAPTCHA | Present on some portals (same key) | Ignore in adapter |

---

## Next Steps

1. **Ashby adapter** — Build full v2 adapter using framework analysis + seed scripts
2. **iCIMS recon** — Grab 15-20 URLs, run recon scan, analyze iframe patterns
3. **Lever location** — Revisit with Playwright MCP for trusted event dispatch (future)
4. **Multi-portal validation** — Run each adapter against 15-20 URLs to catch field variants
