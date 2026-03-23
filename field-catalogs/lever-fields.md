# Lever — Field Catalog (adapter analysis + portal observation)

## Detection
- Hostname: `jobs.lever.co`
- DOM: `#application-form input[name="origin"]`
- DOM: `input[name="urls[LinkedIn]"]` or `input[name="urls[GitHub]"]`

---

## REQUIRED Fields — Fillable from Profile (deterministic, no LLM)

| Field | name attr | Profile Key | Fill Method |
|-------|----------|------------|-------------|
| Full Name | `name` | `full_name` or `first_name + last_name` | Direct value set + input/change events |
| Email | `email` | `email` | Direct value set |
| Phone | `phone` | `phone` | Direct value set |
| Current Company / Org | `org` | `current_company` or `company` | Direct value set |
| LinkedIn URL | `urls[LinkedIn]` | `linkedin` | Direct value set |
| GitHub URL | `urls[GitHub]` | `github` | Direct value set |
| Portfolio / Website | `urls[Portfolio]` | `portfolio` or `website` | Direct value set |
| Twitter | `urls[Twitter]` | `twitter` | Direct value set |
| Other URL | `urls[Other]` | `website` or `portfolio` | Direct value set |

## Card Fields — Fillable from Profile (matched by label text)

Card fields use `name="cards[uuid][fieldN]"` — UUIDs differ per job posting. Matched by label.

| Label Pattern | Profile Key | Notes |
|--------------|------------|-------|
| `Legal First Name` | `first_name` | Exact match |
| `Legal Last Name` | `last_name` | Exact match |
| `(Home) Phone` | `phone` | Regex: `/^(home\s*)?phone$/i` |
| `Mailing Address Line 1` | `address_line1` or `address` | |
| `Mailing Address Line 2` | `address_line2` | May be empty |
| `City` | `city` | |
| `State` | `state` | |
| `Zip Code` | `zip` or `postal_code` | |
| `Degree` | `education_entries[0].degree` | |
| `Full Legal Name (Signature)` | `full_name` | Regex: `/full\s*legal\s*name.*signature/i` |
| `(Please Initial)` / acknowledgement | `first_name[0].last_name[0].` | Initials generated from profile |

---

## REQUIRED Fields — Needs Onboarding Collection

| Field | Profile Key Needed | Default Behavior | Priority |
|-------|-------------------|-----------------|----------|
| Current Location | `city`, `state` | Types city text, shows dropdown — user must click | MEDIUM |

> **Location quirk**: Lever uses its own autocomplete (`div.dropdown-container` / `div.dropdown-results`). Setting `.value` directly doesn't trigger the API. Adapter types char-by-char then leaves focus on input so dropdown stays visible. User must manually click their city. This is a known limitation.

---

## Yes/No Radio Defaults (deterministic, no LLM)

Matched by label text on radio-group fields.

| Question Pattern | Answer | Notes |
|-----------------|--------|-------|
| `referred by a (current) employee` | No | |
| `previously work` | No | |
| `subject to any (type of) agreement` | No | Non-compete / NDA |
| `legally (eligible\|authorized) to work` | Yes | |
| `require (visa) sponsorship` | No | |
| `graduated` | Yes | |
| `non-?compete` | No | |
| `background check` | Yes | |
| `drug (test\|screen)` | Yes | |
| `18 years (of age\|or older)` | Yes | |
| `served (in the) military` | No | Veteran status — use "No" default |
| `disability` | No | |

### ⚠️ Onboarding-Dependent Yes/No

| Question | Profile Key | Default |
|----------|-------------|---------|
| `legally authorized to work` | `work_authorized_us` | Yes |
| `require sponsorship` | `needs_sponsorship` | No |

---

## EEO Fields — Deterministic (adapter handles)

### EEO Native Selects (name attr = `eeo[*]`)
| Field | name attr | Profile Key | Fallback |
|-------|----------|------------|----------|
| Gender | `eeo[gender]` | `gender` | "Decline to self-identify" |
| Race / Ethnicity | `eeo[race]` | `race_ethnicity` | "Decline to self-identify" |
| Veteran Status | `eeo[veteran]` | `veteran_status` | "I am not a veteran" / "Decline to self-identify" |

### EEO Radio/Checkbox Groups (name = `surveysResponses[*]`)
| Question Pattern | Type | Profile Key | Fallback |
|-----------------|------|------------|----------|
| `gender` | radio-group | `gender` | "Decline to self-identify" |
| `race\|ethnicity` | checkbox-group | `race_ethnicity` | "Decline to Respond" |
| `veteran\|military\|served` | radio-group | `veteran_status` | "No" |
| `age range` | radio-group | `age_range` | (null — skipped if no profile data) |

---

## Skills/Tools Checkboxes — Profile Match (no LLM)

When a checkbox-group label contains `tools|languages|skills|technologies`:
- Matches against `profile.skills_list` or `profile.skills` array
- Checks any option whose text includes a skill from profile
- Pre-fills and removes from LLM scan

---

## Role-Specific Questions — LLM Handles

| Question Type | Examples |
|--------------|---------|
| Custom card fields (non-matched) | "Years of experience in X", "Years you attended school" |
| Open text / textarea | Cover letter, motivation, "Why this company?" |
| Dropdowns | Preferred work arrangement, job source, etc. |
| opportunityLocationId select | Office location preference — best-effort match by city name |

---

## Auto-Handled (no tracking needed)

| Field | Treatment |
|-------|-----------|
| `consent[store]` and all `consent[*]` checkboxes | Auto-checked in `afterFill` |
| `pronouns`, `useNameOnlyPronounsOption`, `customPronounsOption` | Skipped — personal choice |
| Hidden inputs (`type="hidden"`) | Skipped |
| `h-captcha-response` / hCaptcha | Skipped — anti-bot |
| File inputs | Handled separately (resume upload pipeline) |

---

## Fields to NEVER Fill

| Field | Reason |
|-------|--------|
| hCaptcha | Anti-bot |
| Hidden inputs | Internal state |
| Pronouns | Personal — skip unless user sets preference |

---

## Summary: Onboarding Data Gaps

### Already Collected ✅
- Full name, first name, last name
- Email, phone
- LinkedIn, GitHub, portfolio/website URL
- City, state
- Current company
- Education (degree)
- Skills list

### Should Collect (improves fill rate)
1. **Work authorization** (`work_authorized_us` bool) — affects `legally authorized to work` answer
2. **Needs sponsorship** (`needs_sponsorship` bool) — affects `require sponsorship` answer
3. **Gender** (for EEO) — `gender` enum
4. **Race/ethnicity** (for EEO) — `race_ethnicity` enum
5. **Veteran status** (for EEO) — `veteran_status` enum
6. **Twitter URL** — rarely needed but Lever has the field
7. **Address (line 1, 2, zip)** — card fields, currently not collected
