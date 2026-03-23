# JAOS Adapter Roadmap

> **Dataset**: 7-day pull (2026-03-20), 4,999 unique job URLs across 41 ATS platforms
> **Last updated**: 2026-03-23
> **Deployment context**: IgniteLegends applicants team — 40-45 apps/day for OPT/CPT clients

---

## At a Glance — What Needs Doing

| Action | ATS | Volume | Why |
|--------|-----|--------|-----|
| 🧪 **Test + standardize** | Greenhouse | 1,583 | v2 built, needs 30-URL validation |
| 🧪 **Test + standardize** | Oracle Cloud | 446 | v2 built, needs 30-URL validation |
| 🧪 **Test + standardize** | SmartRecruiters | 203 | v2 built, needs 30-URL validation |
| 🧪 **Test + standardize** | Workday | 139 | v2 built, needs 30-URL validation |
| 🧪 **Test + standardize** | Ashby | 45 | v2 built, needs 30-URL validation |
| 🧪 **Test + standardize** | Lever | 3 | v2 built, needs 30-URL validation |
| 🧪 **Test + standardize** | BambooHR | 7 | v2 built, needs 30-URL validation |
| 🔨 **Build new (HIGH)** | ADP | 544 | Biggest gap — no adapter at all |
| 🔨 **Build new (HIGH)** | UltiPro | 288 | No adapter |
| ⬆️ **Upgrade v1 → v2** | Paylocity | 465 | v1 only — high volume |
| ⬆️ **Upgrade v1 → v2** | iCIMS | 309 | v1 only — high volume |
| ⬆️ **Upgrade v1 → v2** | Taleo | 196 | v1 only |
| 🔨 **Build new (MED)** | Workable | 190 | No adapter |
| 🔨 **Build new (MED)** | EightFold | 129 | No adapter |
| 🔨 **Build new (LOW)** | PhenomPeople | 87 | No adapter |
| 🔨 **Build new (LOW)** | Paycor | 76 | No adapter |
| 🔨 **Build new (LOW)** | Rippling | 47 | No adapter |

---

## Volume Ranking — Full Dataset

| Rank | ATS | 7-day Jobs | Adapter | Status |
|------|-----|-----------|---------|--------|
| 1 | **Greenhouse** | 1,583 | `greenhouse-v2.js` | ✅ v2 — test |
| 2 | **ADP** | 544 | — | ❌ Build needed |
| 3 | **Paylocity** | 465 | `paylocity.js` | ⚠️ v1 only — upgrade |
| 4 | **Oracle Cloud** | 446 | `oraclecloud-v2.js` | ✅ v2 — test |
| 5 | **iCIMS** | 309 | `icims.js` | ⚠️ v1 only — upgrade |
| 6 | **UltiPro** | 288 | — | ❌ Build needed |
| 7 | **SmartRecruiters** | 203 | `smartrecruiters-v2.js` | ✅ v2 — test |
| 8 | **Taleo** | 196 | `taleo.js` | ⚠️ v1 only — upgrade |
| 9 | **Workable** | 190 | — | ❌ Build needed |
| 10 | **Workday** | 139 | `workday-v2.js` | ✅ v2 — test |
| 11 | **EightFold** | 129 | — | ❌ Build needed |
| 12 | **PhenomPeople** | 87 | — | ❌ Build needed |
| 13 | **Paycor** | 76 | — | ❌ Build needed |
| 14 | **Rippling** | 47 | — | ❌ Build needed |
| 15 | **Ashby** | 45 | `ashby-v2.js` | ✅ v2 — test |
| 16 | **In-house** | 41 | — | ⛔ Skip (Amazon, Google custom) |
| 17 | **Dayforce** | 31 | — | Low priority |
| 18 | **SuccessFactors** | 29 | — | Low priority |
| 19 | **Comeet** | 18 | — | Low priority |
| 20 | **Hireology** | 14 | — | Low priority |
| 21 | **TeamTailor** | 14 | — | Low priority |
| 22 | **Gem** | 12 | — | Low priority |
| 23 | **Paycom** | 12 | — | Low priority |
| 24 | **CSOD** | 10 | — | Low priority |
| 25 | **Rival** | 10 | — | Low priority |
| 26 | **Kula** | 7 | — | Low priority |
| 27 | **BambooHR** | 7 | `bamboohr-v2.js` | ✅ v2 — test |
| 28 | **Trinet** | 8 | — | Low priority |
| 29 | **CareerPlug** | 6 | — | Low priority |
| 30 | **JazzHR** | 6 | — | Low priority |
| 31 | **Pinpoint** | 6 | — | Low priority |
| 32 | **Lever** | 3 | `lever-v2.js` | ✅ v2 — test |
| 33 | **Zoho** | 3 | — | Low priority |
| 34 | **HiBob** | 3 | — | Low priority |
| 35 | **iSolved** | 3 | — | Low priority |
| 36 | **Paradox** | 2 | — | Low priority |
| 37 | **HiringThing** | 2 | — | Low priority |
| 38 | **Trakstar** | 2 | — | Low priority |
| 39 | **FreshTeam** | 1 | — | Skip |
| 40 | **Join.com** | 1 | — | Skip |
| 41 | **Manatal** | 1 | — | Skip |

---

## Phase 1 — Standardize Existing v2 (Do This First)

Test each with 30 URLs from `test_urls_30_per_ats.txt`. Fix gaps. Commit.

| ATS | Test URLs | Key Things to Verify |
|-----|-----------|---------------------|
| Greenhouse | 30 ready | React-select, phone intl, EEO, multi-step nav |
| Oracle Cloud | 30 ready | Yes/No pills, cascade address, salary dropdown, multi-step |
| SmartRecruiters | 30 ready | Multi-page wizard, pre-fill button, EEO |
| Workday | 30 ready | Multi-entry (exp/edu), section navigation, dropdowns |
| Ashby | 30 ready | Yes/No ordering, EEO fieldsets, phone tel-type |
| EightFold | 30 ready | Unknown DOM — needs live inspection first |
| iCIMS | 30 ready | iframe-heavy — v1 adapter, identify gaps |
| Paylocity | 30 ready | v1 adapter — identify what's missing vs v2 |
| Taleo | 30 ready | v1 adapter — session-based, legacy DOM |
| Lever | manual | Location typeahead (known partial), card fields |
| BambooHR | 7 only | fab-SelectToggle, honeypot, state/country |

---

## Phase 2 — Build Queue (After Phase 1)

Priority order by volume:

```
1. ADP          (544 jobs)  — Shadow DOM, 3 subdomain variants
2. Paylocity    (465 jobs)  — Upgrade v1 → v2
3. UltiPro      (288 jobs)  — *.ultipro.com
4. iCIMS        (309 jobs)  — Upgrade v1 → v2, iframe-heavy
5. Workable     (190 jobs)  — jobs.workable.com
6. Taleo        (196 jobs)  — Upgrade v1 → v2
7. EightFold    (129 jobs)  — apply.careers.* — needs recon
8. PhenomPeople (87 jobs)   — careers.*.com — needs recon
```

---

## Coverage Progress

```
Current (v2 tested):     Greenhouse + OracleCloud + SR + Workday + Ashby
                         1,583 + 446 + 203 + 139 + 45 = 2,416 / 4,999 = 48%

After Phase 1 complete:  + Lever + BambooHR + (v1 validated: Paylocity, iCIMS, Taleo)
                         ≈ 3,616 / 4,999 = 72%

After Phase 2 complete:  + ADP + UltiPro + Workable + EightFold
                         ≈ 4,562 / 4,999 = 91%
```

---

## Known Adapter Quirks (Quick Reference)

| ATS | Framework | Key Quirk |
|-----|-----------|-----------|
| Greenhouse | React 16+ | intl-tel-input, React-select, resume remove before upload |
| Oracle Cloud | Knockout.js + JET | Yes/No pill buttons, cascade country→state, multi-step |
| SmartRecruiters | React | Multi-page wizard, iframe on some portals |
| Workday | Workday proprietary | Multi-entry sections, section-scoped selects |
| Ashby | React 18 (Vite) | No `<form>` tag, stable `ashby-*` CSS classes, UUID field ids |
| Lever | jQuery | Location autocomplete needs user pick (React isTrusted) |
| BambooHR | Fabric UI (MUI) | fab-SelectToggle for state/country, honeypot `preferredName` |
| ADP | Shadow DOM | 3 subdomain variants (`workforcenow`, `recruiting`, custom) |
| iCIMS | iframe-heavy | Form inside iframe, custom file upload widget |
| Taleo | Legacy | Session-based, old-school DOM, no React |

---

## Test URL File

`C:\Users\Mohammad Aqeel\Desktop\My Practices\jobs_research\test_urls_30_per_ats.txt`
277 URLs — 30 per ATS where available. Generated 2026-03-23 from 7-day job dataset.
