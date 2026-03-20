# Ashby — Field Catalog (12 portals scanned, 2026-03-20)

## Portals Scanned
Replit, Airwallex, Steadily, Tabz, Tabs, OpenRouter, Wrapbook, Second Nature, OpusClip, Stay AI, Giga, Basis AI

---

## REQUIRED Fields — Fillable from Profile

These appear frequently and we MUST fill them. Adapter handles deterministically (no LLM).

| Field | Freq | Profile Key | Fill Method |
|-------|------|------------|-------------|
| Name / Full Name | 12/12 | `full_name` or `first_name + last_name` | `_systemfield_name` |
| Email | 12/12 | `email` | `_systemfield_email` |
| Phone | 6/12 | `phone` | `input[type="tel"]` |
| Resume | 10/12 | file upload | content.js DataTransfer |
| LinkedIn URL | 8/12 | `linkedin_url` | LLM maps to field |
| Location (combobox) | 4/12 | `city`, `state` | LLM + afterFill combobox select |

## REQUIRED Fields — Needs Onboarding Collection

These are required on many portals but we DON'T currently collect them at onboarding.

| Field | Freq | What to Collect | Priority |
|-------|------|----------------|----------|
| Salary expectations | 4/12 | Expected salary range + currency (e.g. "$150K-$180K USD") | HIGH |
| GitHub URL | 2/12 | GitHub profile URL | MEDIUM |
| Portfolio URL | 2/12 | Portfolio/website URL | MEDIUM |
| Notice period | 1/12 | Current notice period (e.g. "2 weeks", "1 month") | LOW |
| First Name (separate) | 1/12 | Already have via `first_name` | ✅ HAVE |
| Last Name (separate) | 1/12 | Already have via `last_name` | ✅ HAVE |

## Yes/No Button Questions — Deterministic (adapter handles)

These are answered from patterns, NOT from user profile. No onboarding needed.

| Question Pattern | Answer | Freq | Notes |
|-----------------|--------|------|-------|
| "Were you referred to [Company]?" | No | 3/12 | Unless we add referral tracking |
| "Authorized/entitled to work in [Country]?" | Yes | 6/12 | Assumes US/target country auth |
| "Require sponsorship/visa/work permit?" | No | 8/12 | Assumes no sponsorship needed |
| "Able to work from office / onsite / X days/week?" | Yes | 6/12 | Assumes willing |
| "Willing to relocate?" | Yes | 2/12 | Assumes willing |
| "At least 18 years of age?" | Yes | 2/12 | |
| "Background check consent?" | Yes | — | Not seen yet but pattern exists |
| "Salary align with expectations?" | Yes | 1/12 | |
| "Agree to policy / read and agree?" | Yes | 1/12 | |
| "Relatives working for [Company]?" | No | 1/12 | |
| "Previously worked here?" | No | 1/12 | |

### ⚠️ Onboarding-Dependent Yes/No (needs user input)

These questions have answers that VARY per user. We should collect preferences at onboarding.

| Question Pattern | Profile Key Needed | Default | Notes |
|-----------------|-------------------|---------|-------|
| Work authorization (US/country) | `work_authorized_us` (bool) | Yes | Some users may need sponsorship |
| Require sponsorship | `needs_sponsorship` (bool) | No | If true, flip to Yes |
| OPT/F1/H1-B visa status | `visa_type` | null | If on OPT/H1-B, answer Yes |
| Willing to relocate | `willing_to_relocate` (bool) | Yes | Some users won't relocate |
| Currently reside in [City/Area] | `city` (compare) | — | Can't hardcode, LLM handles |

## EEO / Diversity Fields — Deterministic (adapter handles)

Filled from profile or with "Decline" fallback. No onboarding needed unless user wants specific answers.

### Standard US EEO (radio buttons, 4/12 portals)
| Field | Profile Key | Fallback |
|-------|------------|----------|
| Gender | `gender` | "Decline to self-identify" |
| Race / Ethnicity | `race_ethnicity` | "Decline to self-identify" |
| Veteran Status | `veteran_status` | "I am not a protected veteran" |
| Disability | — | "Decline to self-identify" |

### Diversity Survey (checkbox groups, 3/12 portals)
| Field | Options Style | Fallback |
|-------|--------------|----------|
| Gender Identity | Man/Woman/Non-Binary/Another/Prefer not | "I prefer not to answer" |
| Transgender | Yes/No/Prefer not | "I prefer not to answer" |
| Sexual Orientation | Checkbox multi-select | "I prefer not to answer" |
| Ethnicity | Checkbox multi-select | "I prefer not to answer" |
| Communities (disability/veteran/etc) | Checkbox multi-select | "I prefer not to answer" |
| Age Range | Under 30/30-39/40-49/50-59/60+/Prefer not | "I prefer not to answer" |

### Onboarding Enhancement for EEO
| Profile Key | What to Collect | Notes |
|------------|----------------|-------|
| `gender` | Male/Female/Non-Binary/Decline | Map to both "Male/Female" and "Man/Woman" formats |
| `race_ethnicity` | Standard EEOC categories | Map to both radio and checkbox formats |
| `veteran_status` | Protected veteran / Not / Decline | |
| `disability_status` | Yes/No/Decline | For CC-305 forms |

## Role-Specific Questions — LLM Handles (skip in adapter)

These are custom per-company and too specific to pattern-match. LLM fills from profile context.

| Question Type | Examples | Freq |
|--------------|---------|------|
| "Why [Company]?" / motivation | "Why OpenRouter?", "What excites you about Replit?" | 3/12 |
| Experience years (radio/combobox) | "How many years of experience?", "1-2 / 3-5 / 6-8 / 8+" | 4/12 |
| Work style preference (radio) | "How comfortable working 50-60 hrs?", "Rate fast-paced env" | 2/12 |
| Time zone / hours | "Are you able to work EST hours?" | 1/12 |
| Job source | "Where did you find this job posting?" | 2/12 |
| Role-specific skills | "Experience within Shopify ecosystem?", "Have CPA?" | 2/12 |
| Name pronunciation | "Specify pronunciation of your name" | 1/12 |
| Pronouns | "What are your pronouns?" | 1/12 |
| Remote work agreement | Checkbox list of remote work commitments | 1/12 |

## Fields to NEVER Fill

| Field | Reason |
|-------|--------|
| Autofill-from-resume pane (hidden file input) | Ashby's own autofill, not a real field |
| Hidden checkboxes in Yes/No groups | Internal state tracking |
| reCAPTCHA | Anti-bot |
| "Please leave this field blank" (honeypot) | Anti-bot trap |

---

## Summary: Onboarding Data Gaps

### Must Collect (HIGH priority — blocks required fields)
1. **Salary expectations** — text, e.g. "$150K-$180K USD"
2. **Work authorization status** — bool + country
3. **Sponsorship needed** — bool
4. **Visa type** — enum (None/OPT/H1-B/F1/other)

### Should Collect (MEDIUM — improves fill rate)
5. **GitHub URL** — text
6. **Portfolio/website URL** — text
7. **Willing to relocate** — bool
8. **Gender** (for EEO) — enum
9. **Race/ethnicity** (for EEO) — enum
10. **Veteran status** — enum
11. **Disability status** — enum

### Already Collected ✅
- Full name, first name, last name
- Email, phone
- LinkedIn URL
- City, state, country
- Resume file
- Education, experience, skills
