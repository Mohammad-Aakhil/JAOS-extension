# Oracle Cloud — Field Catalog (adapter analysis + portal observation)

## Detection
- Hostname: `*.wd{N}.myworkdayjobs.com` (anchored, e.g. `\.wd5\.myworkdayjobs\.com$`)
- Portal variants: Fanatics, HealthPartners, etc. — different field ordering but same DOM patterns
- Framework: **Knockout.js + Oracle JET** (CX Suite)

---

## Framework Notes

Oracle Cloud uses **Knockout.js** with Oracle JET components:
- Yes/No fields: `ul.cx-select-pills-container` with `<button>` pill options (NOT radio inputs)
- Dropdown selects: `input.cx-select-input[role="combobox"]` with toggle button
- Form navigation: multi-step pagination — must advance through steps
- All fields identified by nearby label text, NOT by name/id attributes

---

## REQUIRED Fields — Fillable from Profile (LLM maps + adapter handles widgets)

| Field | Profile Key | Notes |
|-------|------------|-------|
| First Name | `first_name` | Standard text input |
| Last Name | `last_name` | Standard text input |
| Email | `email` | Standard text input |
| Phone | `phone` | Standard text input |
| Address Line 1 | `address_line1` | Cascade-aware fill |
| City | `city` | Cascade-aware fill |
| State / Province | `state` | cx-select combobox |
| Zip / Postal Code | `zip` or `postal_code` | Standard text input |
| Country | `country` | cx-select combobox |
| Resume | file upload | DataTransfer upload pipeline |

### Cascade-Aware Address Fill
Country must be selected before State (triggers cascade reload of state options). The adapter fills Country first, waits for state options to populate, then fills State.

---

## Yes/No Pill Fields — Deterministic (adapter handles)

Oracle Cloud uses pill buttons (`ul.cx-select-pills-container`). The adapter scans all pill containers and matches by `aria-label` keyword.

| Keyword Pattern | Answer | Profile Key | Notes |
|----------------|--------|------------|-------|
| `eligible to work` | Profile-driven | `work_authorization` | Default: Yes |
| `authorized to work` | Profile-driven | `work_authorization` | Default: Yes |
| `require sponsorship` | Profile-driven | `requires_sponsorship` | Default: No |
| `suspended or barred` | No | — | Compliance |
| `license or professional certification` | Profile-driven | `has_professional_license` | Default: No |
| `covered fund` | No | — | Financial compliance |
| `volcker rule` | No | — | Financial compliance |
| `public accounting firm` | No | — | Financial compliance |
| `financial regulatory` | No | — | Financial compliance |
| `previously been employed by company` | Profile-driven | `previously_employed` | Default: No |
| `previously employed by` | Profile-driven | `previously_employed` | Default: No |
| `referred by` | Profile-driven | `referral_source` | Yes if referral_source exists |
| `accommodation during the recruitment` | No | — | |
| `request an accommodation` | No | — | |
| `close personal associates serving` | No | — | Government relations |
| `government official` | No | — | |
| `contributions to any of the following` | No | — | Political |
| `political contributions` | No | — | |
| `relatives or members of your household` | No | — | |
| `family member` | No | — | |
| `at least 18 years of age` | Yes | `is_over_18` | Default: Yes |
| `do any of the following apply` | "None of these apply to me" | — | Multi-select catch-all |

---

## Diversity / EEO Fields — Adapter Handles with Decline Fallback

| Field | Widget Type | Treatment |
|-------|-------------|-----------|
| Sexual Orientation | cx-select-pills (multi-select) | Clicks "Prefer not to answer" / "Decline" option |
| Gender | cx-select-pills or select | Profile `gender` or "Decline" |
| Race / Ethnicity | cx-select-pills or select | Profile `race_ethnicity` or "Decline" |
| Veteran Status | cx-select-pills or select | Profile `veteran_status` or "Decline" |
| Disability | cx-select-pills or select | "Decline" fallback |

---

## Salary / Compensation Fields — Adapter Handles

| Field | Widget Type | Profile Key | Notes |
|-------|-------------|------------|-------|
| Desired Salary / Compensation | `cx-select-input[role="combobox"]` | `desired_salary` or `salary_expectation` | Searches by label containing "salary" or "compensation" |

---

## Multi-Step Navigation

Oracle Cloud forms span multiple pages:
- Step 1: Personal info + contact details
- Step 2: Employment history / education
- Step 3: Application questions (Yes/No pills, custom questions)
- Step 4: Voluntary disclosures (EEO, diversity)
- Step 5+: Review + submit

The adapter uses pagination detection to navigate steps after filling each page.

---

## REQUIRED Fields — Needs Onboarding Collection

| Field | Profile Key Needed | Default | Priority |
|-------|-------------------|---------|----------|
| Work authorization | `work_authorization` (string 'Yes'/'No') | Yes | HIGH |
| Requires sponsorship | `requires_sponsorship` (bool) | No | HIGH |
| Salary / desired compensation | `desired_salary` or `salary_expectation` (text) | — | HIGH |
| Previously employed | `previously_employed` (bool) | No | LOW |
| Has professional license | `has_professional_license` (bool) | No | LOW |
| Referral source | `referral_source` (text) | null | LOW |
| Is over 18 | `is_over_18` (bool) | Yes | LOW |

---

## Portal Variants — Known Differences

| Portal | Known Quirks |
|--------|-------------|
| Fanatics | Extra sports/entertainment questions in Step 3 |
| HealthPartners | Healthcare-specific compliance questions (licensure, barred) |
| General Enterprise | Standard financial compliance questions (Volcker, covered fund) |

---

## Fields to NEVER Fill

| Field | Reason |
|-------|--------|
| CAPTCHA | Anti-bot |
| Hidden Knockout.js binding inputs | Internal state |
| Resume parsing triggers | Oracle's own autofill — skip |

---

## Summary: Onboarding Data Gaps

### Already Collected ✅
- First name, last name, email, phone
- City, state, zip, country
- LinkedIn URL, resume file
- Education, experience entries

### Must Collect (HIGH)
1. **Work authorization** (`work_authorization` 'Yes'/'No')
2. **Needs sponsorship** (`requires_sponsorship` bool)
3. **Salary expectation** (`salary_expectation` text)

### Should Collect (MEDIUM)
4. **Gender** (for EEO)
5. **Race/ethnicity** (for EEO)
6. **Veteran status** (for EEO)
7. **Disability status** (for EEO)

### Low Priority
8. **Previously employed** (`previously_employed` bool) — default No
9. **Has professional license** (`has_professional_license` bool) — default No
10. **Referral source** (`referral_source` text) — default none
