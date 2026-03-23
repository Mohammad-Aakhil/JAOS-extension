# Greenhouse — Field Catalog (adapter analysis + portal observation)

## Detection
- Hostname: `boards.greenhouse.io`, `job-boards.greenhouse.io`, `my.greenhouse.io`
- DOM: `#grnhse_app`, `#application_form.job-application`, `#application.job-application`
- DOM: `input[name^="job_application["]` — definitive Greenhouse field naming convention
- White-labeled: `script[src*="greenhouse.io"]` or `iframe[src*="greenhouse.io"]` on careers subdomain

---

## REQUIRED Fields — Fillable from Profile (V2 universal scanner + LLM)

Greenhouse V2 adapter does NOT hardcode selectors — the universal scanner + LLM handles value mapping.
The adapter handles only: React event quirks, phone country code, resume upload, multi-step navigation.

| Field | Profile Key | Notes |
|-------|------------|-------|
| First Name | `first_name` | Greenhouse splits name into first/last |
| Last Name | `last_name` | |
| Email | `email` | |
| Phone | `phone` | intl-tel-input widget with country code selector |
| Resume | file upload | `removeExistingResume()` → wait 800ms → upload JAOS resume |
| LinkedIn Profile | `linkedin` | Most portals include this |
| Website / Portfolio | `portfolio` or `website` | Optional on many portals |

---

## Phone Widget Quirk (intl-tel-input)

Greenhouse renders phone country code in 3 variants:
1. `intl-tel-input` library → `#phone_flag_button` + `input[type="tel"]`
2. Native select + text input combo
3. Plain `input[type="tel"]` with no code selector

The adapter detects which variant is present and fills accordingly.

---

## Resume Upload Pipeline

1. `removeExistingResumeAttachment()` — finds `[aria-label*="Remove"]` near resume containers, clicks to clear
2. Wait 800ms
3. Upload JAOS resume via DataTransfer API
4. Greenhouse DOM: `<div class="file-upload" aria-labelledby="upload-label-resume">` → `<input id="resume" class="visually-hidden" type="file">`
5. Fallback: walks up 6 parent levels from hidden file inputs to find resume container

---

## "Autofill with MyGreenhouse" Button

- Selector: `.application--header--autofill-with-greenhouse button`
- **Disabled at start of `fillCustom()`** to prevent Greenhouse overwriting JAOS profile data

---

## EEO / Demographic Fields — Deterministic (from profile or decline fallback)

Standard US EEO section (4-question block, native `<select>` elements):

| Field | Profile Key | Fallback |
|-------|------------|----------|
| Gender | `gender` | "Decline to self-identify" |
| Race / Ethnicity | `race_ethnicity` | "Decline to self-identify" |
| Veteran Status | `veteran_status` | "I am not a protected veteran" |
| Disability | `disability_status` | "Decline to self-identify" |

Some portals also include a second demographic section with voluntary diversity questions.

---

## Role-Specific Questions — LLM Handles

| Question Type | Examples |
|--------------|---------|
| Work authorization | "Are you legally authorized to work in the US?" (Yes/No select or radio) |
| Sponsorship | "Do you now or will you in the future require sponsorship?" |
| Years of experience | Radio/select: "1-2 / 3-5 / 6-8 / 8+" |
| Cover letter | Long textarea |
| "How did you hear about us?" | Select or text |
| Location preference | City or remote preference |
| Start date availability | Date picker or text |
| Custom company questions | "Why [Company]?", role-specific skills, etc. |

---

## Fields to NEVER Fill

| Field | Reason |
|-------|--------|
| Autofill-from-resume pane | Greenhouse's own autofill widget — not a real form field |
| reCAPTCHA | Anti-bot |
| Hidden inputs | Internal state |
| File inputs other than resume | Handled by upload pipeline only |

---

## Location Filling — Not Implemented

**Decision**: Location typeahead not implemented. Greenhouse uses Google Places autocomplete — network-dependent, fragile, low ROI since it's optional on most portals. User fills manually if needed.

---

## Multi-Step Navigation

Some Greenhouse portals are multi-step (typically 2-3 steps). The adapter uses MutationObserver to detect step transitions and continues fill on each step. "Next" / "Submit" button detection via standard label matching.

---

## Summary: Onboarding Data Gaps

### Already Collected ✅
- First name, last name, email, phone
- LinkedIn URL, portfolio/website URL
- Resume file

### Must Collect (HIGH — blocks required fields)
1. **Work authorization** (`work_authorized_us` bool) — "authorized to work" yes/no
2. **Needs sponsorship** (`needs_sponsorship` bool) — sponsorship yes/no

### Should Collect (MEDIUM — improves EEO fill)
3. **Gender** — `gender` enum
4. **Race/ethnicity** — `race_ethnicity` enum
5. **Veteran status** — `veteran_status` enum
6. **Disability status** — `disability_status` enum
