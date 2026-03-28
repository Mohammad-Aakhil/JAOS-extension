# ATS Recon Report — Greenhouse

- **URL**: https://job-boards.eu.greenhouse.io/imc/jobs/4793783101
- **Hostname**: job-boards.eu.greenhouse.io
- **Scanned**: 2026-03-14T07:35:45.344Z
- **Frameworks**: None detected

## Form Structure

### Sections
- `<h1>` Systems Engineer
- `<h2>` Apply for this job
- `<legend>` Phone
- `<h3>` IMC US Voluntary Disclosure

### Buttons
- **Apply** (`button` type="button") — classes: `btn btn--pill`
- **Autofill with MyGreenhouse** (`button` type="button") — classes: `btn btn--pill btn--secondary`
- **Locate me** (`button` type="button") — classes: `btn--tertiary`
- **Attach** (`button` type="button") — classes: `btn btn--pill`
- **Dropbox** (`button` type="button") — classes: `btn btn--pill`
- **Google Drive** (`button` type="button") — classes: `btn btn--pill`
- **Enter manually** (`button` type="button") — classes: `btn btn--pill`
- **Add another** (`button` type="button") — classes: `add-another-button`
- **Submit application** (`button` type="submit") — classes: `btn btn--pill`
- **x** (`button` type="button") — classes: ``
- **GO** (`button` type="button") — classes: ``
- **I have logged in - Sync now** (`button` type="button") — classes: ``

### Iframes
- id="" name="a-qoa0yjr5opt8" src="https://www.recaptcha.net/recaptcha/enterprise/anchor?ar=1&k=6LfmcbcpAAAAAChNTbhUShzUOAMj_wY9LQIvLFX"

## Fields

| # | Step | Label | Type | Required | ID / Name | Selector |
|---|------|-------|------|----------|-----------|----------|
| 0 | Main Page | First Name* | text | YES | `first_name` | `#first_name` |
| 1 | Main Page | Last Name* | text | YES | `last_name` | `#last_name` |
| 2 | Main Page | Preferred First Name | text | no | `preferred_name` | `#preferred_name` |
| 3 | Main Page | Email* | text | YES | `email` | `#email` |
| 4 | Main Page | Country* | text | YES | `country` | `#country` |
| 5 | Main Page | Phone* | tel | YES | `phone` | `#phone` |
| 6 | Main Page | Location (City)* | text | YES | `candidate-location` | `#candidate-location` |
| 7 | Main Page | Attach | file | no | `resume` | `#resume` |
| 8 | Main Page | Company name* | text | YES | `company-name-0` | `#company-name-0` |
| 9 | Main Page | Title* | text | YES | `title-0` | `#title-0` |
| 10 | Main Page | Start date month* | text | YES | `start-date-month-0` | `#start-date-month-0` |
| 11 | Main Page | Start date year* | text | YES | `start-date-year-0` | `#start-date-year-0` |
| 12 | Main Page | End date month* | text | YES | `end-date-month-0` | `#end-date-month-0` |
| 13 | Main Page | End date year* | text | YES | `end-date-year-0` | `#end-date-year-0` |
| 14 | Main Page | Current role | checkbox | no | `current-role-0_1` | `#current-role-0_1` |
| 15 | Main Page | School* | text | YES | `school--0` | `#school--0` |
| 16 | Main Page | Degree* | text | YES | `degree--0` | `#degree--0` |
| 17 | Main Page | Discipline* | text | YES | `discipline--0` | `#discipline--0` |
| 18 | Main Page | Start date year* | number | YES | `start-year--0` | `#start-year--0` |
| 19 | Main Page | End date year* | number | YES | `end-year--0` | `#end-year--0` |
| 20 | Main Page | Will you require immigration sponsorship | text | YES | `question_8322390101` | `#question_8322390101` |
| 21 | Main Page | Will you require immigration sponsorship | text | YES | `question_8322391101` | `#question_8322391101` |
| 22 | Main Page | Privacy Statement* | text | YES | `question_8322392101` | `#question_8322392101` |
| 23 | Main Page | What is your gender/gender identity? | text | no | `4005628101` | `#\34 005628101` |
| 24 | Main Page | What is your Race/Ethnicity? | text | no | `4005629101` | `#\34 005629101` |

## Field Details

### Field 0: First Name*

- **Type**: text
- **Tag**: `<input>`
- **ID**: `first_name`
- **Required**: YES
- **aria-label**: "First Name"
- **aria-describedby**: `first_name-description first_name-error first_name-help`
- **autocomplete**: `given-name`
- **Classes**: `input input__single-line`
- **Selector**: `#first_name`
- **Dropdown appeared**: YES (30 options)
  - "Afghanistan+93"
  - "Åland Islands+358"
  - "Albania+355"
  - "Algeria+213"
  - "American Samoa+1"
  - "Andorra+376"
  - "Angola+244"
  - "Anguilla+1"
  - "Antigua & Barbuda+1"
  - "Argentina+54"
  - "Armenia+374"
  - "Aruba+297"
  - "Ascension Island+247"
  - "Australia+61"
  - "Austria+43"
  - ... and 15 more
- **Typeahead/autocomplete**: YES
- **Note**: Typeahead/autocomplete detected
- **Parent chain**: `div` → `div` → `div`
<details>
<summary>Raw HTML (container)</summary>

```html
<div class="input-wrapper input-wrapper--active"><label id="first_name-label" for="first_name" class="label label">First Name<span aria-hidden="true">*</span></label><input id="first_name" class="input input__single-line" aria-label="First Name" aria-describedby="first_name-description first_name-error first_name-help" aria-invalid="false" aria-errormessage="first_name-error" aria-required="true" type="text" maxlength="255" autocomplete="given-name" value="" style=""></div>
```
</details>

### Field 1: Last Name*

- **Type**: text
- **Tag**: `<input>`
- **ID**: `last_name`
- **Required**: YES
- **aria-label**: "Last Name"
- **aria-describedby**: `last_name-description last_name-error last_name-help`
- **autocomplete**: `family-name`
- **Classes**: `input input__single-line`
- **Selector**: `#last_name`
- **Dropdown appeared**: YES (30 options)
  - "Afghanistan+93"
  - "Åland Islands+358"
  - "Albania+355"
  - "Algeria+213"
  - "American Samoa+1"
  - "Andorra+376"
  - "Angola+244"
  - "Anguilla+1"
  - "Antigua & Barbuda+1"
  - "Argentina+54"
  - "Armenia+374"
  - "Aruba+297"
  - "Ascension Island+247"
  - "Australia+61"
  - "Austria+43"
  - ... and 15 more
- **Typeahead/autocomplete**: YES
- **Note**: Typeahead/autocomplete detected
- **Parent chain**: `div` → `div` → `div`
<details>
<summary>Raw HTML (container)</summary>

```html
<div class="input-wrapper"><label id="last_name-label" for="last_name" class="label label">Last Name<span aria-hidden="true">*</span></label><input id="last_name" class="input input__single-line" aria-label="Last Name" aria-describedby="last_name-description last_name-error last_name-help" aria-invalid="false" aria-errormessage="last_name-error" aria-required="true" type="text" maxlength="255" autocomplete="family-name" value="" style=""></div>
```
</details>

### Field 2: Preferred First Name

- **Type**: text
- **Tag**: `<input>`
- **ID**: `preferred_name`
- **Required**: no
- **aria-label**: "Preferred First Name"
- **aria-describedby**: `preferred_name-description preferred_name-error preferred_name-help`
- **Classes**: `input input__single-line`
- **Selector**: `#preferred_name`
- **Dropdown appeared**: YES (30 options)
  - "Afghanistan+93"
  - "Åland Islands+358"
  - "Albania+355"
  - "Algeria+213"
  - "American Samoa+1"
  - "Andorra+376"
  - "Angola+244"
  - "Anguilla+1"
  - "Antigua & Barbuda+1"
  - "Argentina+54"
  - "Armenia+374"
  - "Aruba+297"
  - "Ascension Island+247"
  - "Australia+61"
  - "Austria+43"
  - ... and 15 more
- **Typeahead/autocomplete**: YES
- **Note**: Typeahead/autocomplete detected
- **Parent chain**: `div` → `div` → `div`
<details>
<summary>Raw HTML (container)</summary>

```html
<div class="input-wrapper"><label id="preferred_name-label" for="preferred_name" class="label label">Preferred First Name</label><input id="preferred_name" class="input input__single-line" aria-label="Preferred First Name" aria-describedby="preferred_name-description preferred_name-error preferred_name-help" aria-invalid="false" aria-errormessage="preferred_name-error" aria-required="false" type="text" maxlength="255" value="" style=""></div>
```
</details>

### Field 3: Email*

- **Type**: text
- **Tag**: `<input>`
- **ID**: `email`
- **Required**: YES
- **aria-label**: "Email"
- **aria-describedby**: `email-description email-error email-help`
- **autocomplete**: `email`
- **Classes**: `input input__single-line`
- **Selector**: `#email`
- **Dropdown appeared**: YES (30 options)
  - "Afghanistan+93"
  - "Åland Islands+358"
  - "Albania+355"
  - "Algeria+213"
  - "American Samoa+1"
  - "Andorra+376"
  - "Angola+244"
  - "Anguilla+1"
  - "Antigua & Barbuda+1"
  - "Argentina+54"
  - "Armenia+374"
  - "Aruba+297"
  - "Ascension Island+247"
  - "Australia+61"
  - "Austria+43"
  - ... and 15 more
- **Typeahead/autocomplete**: YES
- **Note**: Typeahead/autocomplete detected
- **Parent chain**: `div` → `div` → `div`
<details>
<summary>Raw HTML (container)</summary>

```html
<div class="input-wrapper"><label id="email-label" for="email" class="label label">Email<span aria-hidden="true">*</span></label><input id="email" class="input input__single-line" aria-label="Email" aria-describedby="email-description email-error email-help" aria-invalid="false" aria-errormessage="email-error" aria-required="true" type="text" maxlength="255" autocomplete="email" value="" style=""></div>
```
</details>

### Field 4: Country*

- **Type**: text
- **Tag**: `<input>`
- **ID**: `country`
- **Required**: YES
- **aria-describedby**: `react-select-country-placeholder country-error`
- **autocomplete**: `off`
- **Classes**: `select__input`
- **Selector**: `#country`
- **Dropdown appeared**: YES (30 options)
  - "United States +1"
  - "Afghanistan +93"
  - "Åland Islands +358"
  - "Albania +355"
  - "Algeria +213"
  - "American Samoa +1"
  - "Andorra +376"
  - "Angola +244"
  - "Anguilla +1"
  - "Antigua & Barbuda +1"
  - "Argentina +54"
  - "Armenia +374"
  - "Aruba +297"
  - "Ascension Island +247"
  - "Australia +61"
  - ... and 15 more
- **Typeahead/autocomplete**: YES
- **Note**: Typeahead/autocomplete detected
- **Parent chain**: `div` → `div` → `div`
<details>
<summary>Raw HTML (container)</summary>

```html
<fieldset class="phone-input"><legend class="visually-hidden">Phone</legend><div class="phone-input__country"><div class="select"><div class="select__container"><label id="country-label" for="country" class="label select__label">Country<span aria-hidden="true">*</span></label><div class="select-shell remix-css-b62m3t-container"><span id="react-select-country-live-region" class="remix-css-7pg0cj-a11yText"></span><span aria-live="polite" aria-atomic="false" aria-relevant="additions text" role="log" class="remix-css-7pg0cj-a11yText"></span><div><div class="select__control remix-css-13cymwt-control"><div class="select__value-container remix-css-hlgwow"><div class="select__placeholder remix-css-1jqq78o-placeholder" id="react-select-country-placeholder"></div><div class="select__input-container remix-css-19bb58m" data-value=""><input class="select__input" style="color: inherit; background: 0px center; opacity: 1; width: 100%; grid-area: 1 / 2; font: inherit; min-width: 2px; border: 0px; margin: 0px; outline: 0px; padding: 0px;" autocapitalize="none" autocomplete="off" autocorrect="off" id="country" spellcheck="false" tabindex="0" type="text" aria-autocomplete="list" aria-expanded="false" aria-haspopup="true" aria-errormessage="country-error" aria-invalid="false" aria-labelledby="country-label" aria-required="true" role="combobox" aria-activedescendant="" aria-describedby="react-select-country-placeholder country-error" enterkeyhint="done" value=""></div></div><div class="select__indicators remix-css-1wy0on6"><button type="button" class="icon-button icon-button--sm" aria-label="Toggle flyout" tabindex="-1"><svg class="svg-icon" fill="none" height="20" width="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path class="icon--primary-color" d="M11.4534 16.0667L5.90983 9.13729C5.54316 8.67895 5.86948 8 6.45644 8H17.5436C18.1305 8 18.4568 8.67895 18.0902 9.13729L12.5466 16.0667C12.2664 16.417 11.7336 16.417 11.4534 16.0667Z"></path></svg></button></div></div></div><
```
</details>

### Field 5: Phone*

- **Type**: tel
- **Tag**: `<input>`
- **ID**: `phone`
- **Required**: YES
- **aria-label**: "Phone"
- **aria-describedby**: `phone-description phone-error phone-help`
- **autocomplete**: `off`
- **Classes**: `input input__single-line iti__tel-input`
- **Selector**: `#phone`
- **Data attributes**:
  - `data-intl-tel-input-id` = "0"
- **Dropdown appeared**: YES (30 options)
  - "Afghanistan+93"
  - "Åland Islands+358"
  - "Albania+355"
  - "Algeria+213"
  - "American Samoa+1"
  - "Andorra+376"
  - "Angola+244"
  - "Anguilla+1"
  - "Antigua & Barbuda+1"
  - "Argentina+54"
  - "Armenia+374"
  - "Aruba+297"
  - "Ascension Island+247"
  - "Australia+61"
  - "Austria+43"
  - ... and 15 more
- **Parent chain**: `div` → `div` → `div`
<details>
<summary>Raw HTML (container)</summary>

```html
<div class="input-wrapper"><label id="phone-label" for="phone" class="label label">Phone<span aria-hidden="true">*</span></label><div class="iti iti--allow-dropdown iti--show-flags iti--inline-dropdown"><div class="iti__country-container" style="left: 0px;"><button type="button" class="iti__selected-country" aria-expanded="false" aria-label="Select country" aria-haspopup="dialog" aria-controls="iti-0__dropdown-content" title="Select country"><div class="iti__selected-country-primary"><div class="iti__flag iti__globe"></div><div class="iti__arrow" aria-hidden="true"></div></div></button><div id="iti-0__dropdown-content" class="iti__dropdown-content iti__hide " role="dialog" aria-modal="true"><div class="iti__search-input-wrapper"><span class="iti__search-icon" aria-hidden="true">
            <svg class="iti__search-icon-svg" width="14" height="14" viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <circle cx="11" cy="11" r="7"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg></span><input id="iti-0__search-input" type="search" class="iti__search-input" placeholder="Search" role="combobox" aria-expanded="true" aria-label="Search" aria-controls="iti-0__country-listbox" aria-autocomplete="list" autocomplete="off" style=""><button type="button" class="iti__search-clear iti__hide" aria-label="Clear search" tabindex="-1">
            <svg class="iti__search-clear-svg" width="12" height="12" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <mask id="iti-0-clear-mask" maskUnits="userSpaceOnUse">
                <rect width="16" height="16" fill="white"></rect>
                <path d="M5.2 5.2 L10.8 10.8 M10.8 5.2 L5.2 10.8" stroke="black" stroke-linecap="round" class="iti__search-clear-x"></path>
              </mask>
              <circle cx="8" cy="8" r="8" class="iti__search-clear-bg" mask="url(#iti-0-clear-mask)"></circle>
            </svg></button></div><span class="iti__a11y-text
```
</details>

### Field 6: Location (City)*

- **Type**: text
- **Tag**: `<input>`
- **ID**: `candidate-location`
- **Required**: YES
- **aria-describedby**: `react-select-candidate-location-placeholder candidate-location-error`
- **autocomplete**: `off`
- **Classes**: `select__input`
- **Selector**: `#candidate-location`
- **Dropdown appeared**: YES (30 options)
  - "Afghanistan+93"
  - "Åland Islands+358"
  - "Albania+355"
  - "Algeria+213"
  - "American Samoa+1"
  - "Andorra+376"
  - "Angola+244"
  - "Anguilla+1"
  - "Antigua & Barbuda+1"
  - "Argentina+54"
  - "Armenia+374"
  - "Aruba+297"
  - "Ascension Island+247"
  - "Australia+61"
  - "Austria+43"
  - ... and 15 more
- **Typeahead/autocomplete**: YES
- **Note**: Typeahead/autocomplete detected
- **Parent chain**: `div` → `div` → `div`
<details>
<summary>Raw HTML (container)</summary>

```html
<div class="field-wrapper"><div class="select"><div class="select__container"><label id="candidate-location-label" for="candidate-location" class="label select__label">Location (City)<span aria-hidden="true">*</span></label><div class="select-shell remix-css-b62m3t-container"><span id="react-select-candidate-location-live-region" class="remix-css-7pg0cj-a11yText"></span><span aria-live="polite" aria-atomic="false" aria-relevant="additions text" role="log" class="remix-css-7pg0cj-a11yText"></span><div><div class="select__control remix-css-13cymwt-control"><div class="select__value-container remix-css-hlgwow"><div class="select__placeholder remix-css-1jqq78o-placeholder" id="react-select-candidate-location-placeholder"></div><div class="select__input-container remix-css-19bb58m" data-value=""><input class="select__input" style="color: inherit; background: 0px center; opacity: 1; width: 100%; grid-area: 1 / 2; font: inherit; min-width: 2px; border: 0px; margin: 0px; outline: 0px; padding: 0px;" autocapitalize="none" autocomplete="off" autocorrect="off" id="candidate-location" spellcheck="false" tabindex="0" type="text" aria-autocomplete="list" aria-expanded="false" aria-haspopup="true" aria-errormessage="candidate-location-error" aria-invalid="false" aria-labelledby="candidate-location-label" aria-required="true" role="combobox" aria-activedescendant="" aria-describedby="react-select-candidate-location-placeholder candidate-location-error" enterkeyhint="done" value=""></div></div><div class="select__indicators remix-css-1wy0on6"></div></div></div><input required="" tabindex="-1" aria-hidden="true" class="remix-css-1a0ro4n-requiredInput" value="" style=""></div></div></div><button type="button" class="btn--tertiary">Locate me</button></div>
```
</details>

### Field 7: Attach

- **Type**: file
- **Tag**: `<input>`
- **ID**: `resume`
- **Required**: no
- **Classes**: `visually-hidden`
- **Selector**: `#resume`
- **Dropdown appeared**: YES (30 options)
  - "Afghanistan+93"
  - "Åland Islands+358"
  - "Albania+355"
  - "Algeria+213"
  - "American Samoa+1"
  - "Andorra+376"
  - "Angola+244"
  - "Anguilla+1"
  - "Antigua & Barbuda+1"
  - "Argentina+54"
  - "Armenia+374"
  - "Aruba+297"
  - "Ascension Island+247"
  - "Australia+61"
  - "Austria+43"
  - ... and 15 more
- **Note**: Click failed: elementHandle.click: Timeout 2000ms exceeded.
Call log:
[2m  - attempting click action[22m
[2m   
- **Parent chain**: `div` → `div` → `div`
<details>
<summary>Raw HTML (container)</summary>

```html
<div class="field-wrapper"><div role="group" aria-labelledby="upload-label-resume" aria-required="true" class="file-upload" data-allow-s3="false"><div id="upload-label-resume" class="label upload-label">Resume/CV<span class="required">*</span></div><div class="file-upload__wrapper"><div class="button-container"><div class="secondary-button"><div><button type="button" class="btn btn--pill">Attach</button><label class="visually-hidden" for="resume">Attach</label><input id="resume" class="visually-hidden" type="file" accept=".pdf,.doc,.docx,.txt,.rtf" style=""></div></div><div class="secondary-button"><button type="button" class="btn btn--pill" data-testid="resume-dropbox">Dropbox</button></div><div class="secondary-button"><button type="button" class="btn btn--pill">Google Drive</button></div><div class="secondary-button"><div><button type="button" class="btn btn--pill" data-testid="resume-text">Enter manually</button><label class="visually-hidden" for="resume_text">Enter manually</label></div></div><p id="accepted-filetypes" class="file-upload__filetypes">Accepted file types: pdf, doc, docx, txt, rtf</p></div></div></div></div>
```
</details>

### Field 8: Company name*

- **Type**: text
- **Tag**: `<input>`
- **ID**: `company-name-0`
- **Required**: YES
- **aria-label**: "Company name"
- **aria-describedby**: `company-name-0-description company-name-0-error company-name-0-help`
- **Classes**: `input input__single-line`
- **Selector**: `#company-name-0`
- **Dropdown appeared**: YES (30 options)
  - "Afghanistan+93"
  - "Åland Islands+358"
  - "Albania+355"
  - "Algeria+213"
  - "American Samoa+1"
  - "Andorra+376"
  - "Angola+244"
  - "Anguilla+1"
  - "Antigua & Barbuda+1"
  - "Argentina+54"
  - "Armenia+374"
  - "Aruba+297"
  - "Ascension Island+247"
  - "Australia+61"
  - "Austria+43"
  - ... and 15 more
- **Typeahead/autocomplete**: YES
- **Note**: Typeahead/autocomplete detected
- **Parent chain**: `div` → `div` → `div`
<details>
<summary>Raw HTML (container)</summary>

```html
<div class="input-wrapper"><label id="company-name-0-label" for="company-name-0" class="label label">Company name<span aria-hidden="true">*</span></label><input id="company-name-0" class="input input__single-line" aria-label="Company name" aria-describedby="company-name-0-description company-name-0-error company-name-0-help" aria-invalid="false" aria-errormessage="company-name-0-error" aria-required="true" type="text" maxlength="255" value="" style=""></div>
```
</details>

### Field 9: Title*

- **Type**: text
- **Tag**: `<input>`
- **ID**: `title-0`
- **Required**: YES
- **aria-label**: "Title"
- **aria-describedby**: `title-0-description title-0-error title-0-help`
- **Classes**: `input input__single-line`
- **Selector**: `#title-0`
- **Dropdown appeared**: YES (30 options)
  - "Afghanistan+93"
  - "Åland Islands+358"
  - "Albania+355"
  - "Algeria+213"
  - "American Samoa+1"
  - "Andorra+376"
  - "Angola+244"
  - "Anguilla+1"
  - "Antigua & Barbuda+1"
  - "Argentina+54"
  - "Armenia+374"
  - "Aruba+297"
  - "Ascension Island+247"
  - "Australia+61"
  - "Austria+43"
  - ... and 15 more
- **Typeahead/autocomplete**: YES
- **Note**: Typeahead/autocomplete detected
- **Parent chain**: `div` → `div` → `div`
<details>
<summary>Raw HTML (container)</summary>

```html
<div class="input-wrapper"><label id="title-0-label" for="title-0" class="label label">Title<span aria-hidden="true">*</span></label><input id="title-0" class="input input__single-line" aria-label="Title" aria-describedby="title-0-description title-0-error title-0-help" aria-invalid="false" aria-errormessage="title-0-error" aria-required="true" type="text" maxlength="255" value="" style=""></div>
```
</details>

### Field 10: Start date month*

- **Type**: text
- **Tag**: `<input>`
- **ID**: `start-date-month-0`
- **Required**: YES
- **aria-describedby**: `react-select-start-date-month-0-placeholder start-date-month-0-error`
- **autocomplete**: `off`
- **Classes**: `select__input`
- **Selector**: `#start-date-month-0`
- **Dropdown appeared**: YES (30 options)
  - "Afghanistan+93"
  - "Åland Islands+358"
  - "Albania+355"
  - "Algeria+213"
  - "American Samoa+1"
  - "Andorra+376"
  - "Angola+244"
  - "Anguilla+1"
  - "Antigua & Barbuda+1"
  - "Argentina+54"
  - "Armenia+374"
  - "Aruba+297"
  - "Ascension Island+247"
  - "Australia+61"
  - "Austria+43"
  - ... and 15 more
- **Typeahead/autocomplete**: YES
- **Note**: Typeahead/autocomplete detected
- **Parent chain**: `div` → `div` → `div`
<details>
<summary>Raw HTML (container)</summary>

```html
<div class="select__input-container remix-css-19bb58m" data-value=""><input class="select__input" style="color: inherit; background: 0px center; opacity: 1; width: 100%; grid-area: 1 / 2; font: inherit; min-width: 2px; border: 0px; margin: 0px; outline: 0px; padding: 0px;" autocapitalize="none" autocomplete="off" autocorrect="off" id="start-date-month-0" spellcheck="false" tabindex="0" type="text" aria-autocomplete="list" aria-expanded="false" aria-haspopup="true" aria-errormessage="start-date-month-0-error" aria-invalid="false" aria-labelledby="start-date-month-0-label" aria-required="true" role="combobox" aria-activedescendant="" aria-describedby="react-select-start-date-month-0-placeholder start-date-month-0-error" enterkeyhint="done" value=""></div>
```
</details>

### Field 11: Start date year*

- **Type**: text
- **Tag**: `<input>`
- **ID**: `start-date-year-0`
- **Required**: YES
- **aria-label**: "Start date year"
- **aria-describedby**: `start-date-year-0-description start-date-year-0-error start-date-year-0-help`
- **Classes**: `input input__single-line`
- **Selector**: `#start-date-year-0`
- **Dropdown appeared**: YES (30 options)
  - "Afghanistan+93"
  - "Åland Islands+358"
  - "Albania+355"
  - "Algeria+213"
  - "American Samoa+1"
  - "Andorra+376"
  - "Angola+244"
  - "Anguilla+1"
  - "Antigua & Barbuda+1"
  - "Argentina+54"
  - "Armenia+374"
  - "Aruba+297"
  - "Ascension Island+247"
  - "Australia+61"
  - "Austria+43"
  - ... and 15 more
- **Typeahead/autocomplete**: YES
- **Note**: Typeahead/autocomplete detected
- **Parent chain**: `div` → `div` → `div`
<details>
<summary>Raw HTML (container)</summary>

```html
<div class="input-wrapper"><label id="start-date-year-0-label" for="start-date-year-0" class="label label">Start date year<span aria-hidden="true">*</span></label><input id="start-date-year-0" class="input input__single-line" aria-label="Start date year" aria-describedby="start-date-year-0-description start-date-year-0-error start-date-year-0-help" aria-invalid="false" aria-errormessage="start-date-year-0-error" aria-required="true" type="text" maxlength="4" value="" style=""></div>
```
</details>

### Field 12: End date month*

- **Type**: text
- **Tag**: `<input>`
- **ID**: `end-date-month-0`
- **Required**: YES
- **aria-describedby**: `react-select-end-date-month-0-placeholder end-date-month-0-error`
- **autocomplete**: `off`
- **Classes**: `select__input`
- **Selector**: `#end-date-month-0`
- **Dropdown appeared**: YES (30 options)
  - "Afghanistan+93"
  - "Åland Islands+358"
  - "Albania+355"
  - "Algeria+213"
  - "American Samoa+1"
  - "Andorra+376"
  - "Angola+244"
  - "Anguilla+1"
  - "Antigua & Barbuda+1"
  - "Argentina+54"
  - "Armenia+374"
  - "Aruba+297"
  - "Ascension Island+247"
  - "Australia+61"
  - "Austria+43"
  - ... and 15 more
- **Typeahead/autocomplete**: YES
- **Note**: Typeahead/autocomplete detected
- **Parent chain**: `div` → `div` → `div`
<details>
<summary>Raw HTML (container)</summary>

```html
<div class="select__input-container remix-css-19bb58m" data-value=""><input class="select__input" style="color: inherit; background: 0px center; opacity: 1; width: 100%; grid-area: 1 / 2; font: inherit; min-width: 2px; border: 0px; margin: 0px; outline: 0px; padding: 0px;" autocapitalize="none" autocomplete="off" autocorrect="off" id="end-date-month-0" spellcheck="false" tabindex="0" type="text" aria-autocomplete="list" aria-expanded="false" aria-haspopup="true" aria-errormessage="end-date-month-0-error" aria-invalid="false" aria-labelledby="end-date-month-0-label" aria-required="true" role="combobox" aria-activedescendant="" aria-describedby="react-select-end-date-month-0-placeholder end-date-month-0-error" enterkeyhint="done" value=""></div>
```
</details>

### Field 13: End date year*

- **Type**: text
- **Tag**: `<input>`
- **ID**: `end-date-year-0`
- **Required**: YES
- **aria-label**: "End date year"
- **aria-describedby**: `end-date-year-0-description end-date-year-0-error end-date-year-0-help`
- **Classes**: `input input__single-line`
- **Selector**: `#end-date-year-0`
- **Dropdown appeared**: YES (30 options)
  - "Afghanistan+93"
  - "Åland Islands+358"
  - "Albania+355"
  - "Algeria+213"
  - "American Samoa+1"
  - "Andorra+376"
  - "Angola+244"
  - "Anguilla+1"
  - "Antigua & Barbuda+1"
  - "Argentina+54"
  - "Armenia+374"
  - "Aruba+297"
  - "Ascension Island+247"
  - "Australia+61"
  - "Austria+43"
  - ... and 15 more
- **Typeahead/autocomplete**: YES
- **Note**: Typeahead/autocomplete detected
- **Parent chain**: `div` → `div` → `div`
<details>
<summary>Raw HTML (container)</summary>

```html
<div class="input-wrapper"><label id="end-date-year-0-label" for="end-date-year-0" class="label label">End date year<span aria-hidden="true">*</span></label><input id="end-date-year-0" class="input input__single-line" aria-label="End date year" aria-describedby="end-date-year-0-description end-date-year-0-error end-date-year-0-help" aria-invalid="false" aria-errormessage="end-date-year-0-error" aria-required="true" type="text" maxlength="4" value="" style=""></div>
```
</details>

### Field 14: Current role

- **Type**: checkbox
- **Tag**: `<input>`
- **ID**: `current-role-0_1`
- **Name**: `current-role-0`
- **Required**: no
- **aria-describedby**: `current-role-0-description current-role-0-error`
- **Selector**: `#current-role-0_1`
- **Dropdown appeared**: YES (30 options)
  - "Afghanistan+93"
  - "Åland Islands+358"
  - "Albania+355"
  - "Algeria+213"
  - "American Samoa+1"
  - "Andorra+376"
  - "Angola+244"
  - "Anguilla+1"
  - "Antigua & Barbuda+1"
  - "Argentina+54"
  - "Armenia+374"
  - "Aruba+297"
  - "Ascension Island+247"
  - "Australia+61"
  - "Austria+43"
  - ... and 15 more
- **Parent chain**: `div` → `div` → `div#current-role-0`
<details>
<summary>Raw HTML (container)</summary>

```html
<div class="checkbox__input"><input aria-required="false" type="checkbox" id="current-role-0_1" name="current-role-0" aria-describedby="current-role-0-description current-role-0-error" aria-invalid="false" aria-errormessage="current-role-0-error" value="1" style=""><svg class="svg-icon" fill="none" height="16" width="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path d="M6.25119 12.5418C6.12184 12.5419 5.99765 12.491 5.90559 12.4002L2.41919 8.97617C2.3702 8.93153 2.33071 8.87746 2.3031 8.8172C2.27549 8.75694 2.26031 8.69173 2.25849 8.62547C2.25666 8.55921 2.26822 8.49327 2.29248 8.43158C2.31673 8.36989 2.35318 8.31373 2.39965 8.26646C2.44611 8.21919 2.50164 8.18178 2.5629 8.15646C2.62416 8.13115 2.6899 8.11845 2.75618 8.11913C2.82246 8.11982 2.88792 8.13386 2.94864 8.16043C3.00937 8.18701 3.06411 8.22555 3.10959 8.27377L5.96479 11.0738C6.03956 11.1471 6.14009 11.1881 6.24479 11.1881C6.34949 11.1881 6.45002 11.1471 6.52479 11.0738L12.9504 4.64017C13.0433 4.55052 13.1676 4.5009 13.2967 4.50197C13.4258 4.50304 13.5493 4.55472 13.6407 4.64589C13.7321 4.73707 13.784 4.86046 13.7854 4.98954C13.7868 5.11862 13.7374 5.24308 13.648 5.33617L6.59919 12.4002C6.55339 12.4456 6.49907 12.4814 6.43934 12.5057C6.37962 12.53 6.31567 12.5423 6.25119 12.5418V12.5418Z" stroke-width="0.5" class="icon--#709ce2" fill="#709ce2"></path></svg></div>
```
</details>

### Field 15: School*

- **Type**: text
- **Tag**: `<input>`
- **ID**: `school--0`
- **Required**: YES
- **aria-describedby**: `react-select-school--0-placeholder school--0-error`
- **autocomplete**: `off`
- **Classes**: `select__input`
- **Selector**: `#school--0`
- **Dropdown appeared**: YES (30 options)
  - "Afghanistan+93"
  - "Åland Islands+358"
  - "Albania+355"
  - "Algeria+213"
  - "American Samoa+1"
  - "Andorra+376"
  - "Angola+244"
  - "Anguilla+1"
  - "Antigua & Barbuda+1"
  - "Argentina+54"
  - "Armenia+374"
  - "Aruba+297"
  - "Ascension Island+247"
  - "Australia+61"
  - "Austria+43"
  - ... and 15 more
- **Typeahead/autocomplete**: YES
- **Note**: Typeahead/autocomplete detected
- **Parent chain**: `div` → `div` → `div`
<details>
<summary>Raw HTML (container)</summary>

```html
<div class="select__input-container remix-css-19bb58m" data-value=""><input class="select__input" style="color: inherit; background: 0px center; opacity: 1; width: 100%; grid-area: 1 / 2; font: inherit; min-width: 2px; border: 0px; margin: 0px; outline: 0px; padding: 0px;" autocapitalize="none" autocomplete="off" autocorrect="off" id="school--0" spellcheck="false" tabindex="0" type="text" aria-autocomplete="list" aria-expanded="false" aria-haspopup="true" aria-errormessage="school--0-error" aria-invalid="false" aria-labelledby="school--0-label" aria-required="true" role="combobox" aria-activedescendant="" aria-describedby="react-select-school--0-placeholder school--0-error" enterkeyhint="done" value=""></div>
```
</details>

### Field 16: Degree*

- **Type**: text
- **Tag**: `<input>`
- **ID**: `degree--0`
- **Required**: YES
- **aria-describedby**: `react-select-degree--0-placeholder degree--0-error`
- **autocomplete**: `off`
- **Classes**: `select__input`
- **Selector**: `#degree--0`
- **Dropdown appeared**: YES (30 options)
  - "Afghanistan+93"
  - "Åland Islands+358"
  - "Albania+355"
  - "Algeria+213"
  - "American Samoa+1"
  - "Andorra+376"
  - "Angola+244"
  - "Anguilla+1"
  - "Antigua & Barbuda+1"
  - "Argentina+54"
  - "Armenia+374"
  - "Aruba+297"
  - "Ascension Island+247"
  - "Australia+61"
  - "Austria+43"
  - ... and 15 more
- **Typeahead/autocomplete**: YES
- **Note**: Typeahead/autocomplete detected
- **Parent chain**: `div` → `div` → `div`
<details>
<summary>Raw HTML (container)</summary>

```html
<div class="select__input-container remix-css-19bb58m" data-value=""><input class="select__input" style="color: inherit; background: 0px center; opacity: 1; width: 100%; grid-area: 1 / 2; font: inherit; min-width: 2px; border: 0px; margin: 0px; outline: 0px; padding: 0px;" autocapitalize="none" autocomplete="off" autocorrect="off" id="degree--0" spellcheck="false" tabindex="0" type="text" aria-autocomplete="list" aria-expanded="false" aria-haspopup="true" aria-errormessage="degree--0-error" aria-invalid="false" aria-labelledby="degree--0-label" aria-required="true" role="combobox" aria-activedescendant="" aria-describedby="react-select-degree--0-placeholder degree--0-error" enterkeyhint="done" value=""></div>
```
</details>

### Field 17: Discipline*

- **Type**: text
- **Tag**: `<input>`
- **ID**: `discipline--0`
- **Required**: YES
- **aria-describedby**: `react-select-discipline--0-placeholder discipline--0-error`
- **autocomplete**: `off`
- **Classes**: `select__input`
- **Selector**: `#discipline--0`
- **Dropdown appeared**: YES (30 options)
  - "Afghanistan+93"
  - "Åland Islands+358"
  - "Albania+355"
  - "Algeria+213"
  - "American Samoa+1"
  - "Andorra+376"
  - "Angola+244"
  - "Anguilla+1"
  - "Antigua & Barbuda+1"
  - "Argentina+54"
  - "Armenia+374"
  - "Aruba+297"
  - "Ascension Island+247"
  - "Australia+61"
  - "Austria+43"
  - ... and 15 more
- **Typeahead/autocomplete**: YES
- **Note**: Typeahead/autocomplete detected
- **Parent chain**: `div` → `div` → `div`
<details>
<summary>Raw HTML (container)</summary>

```html
<div class="select__input-container remix-css-19bb58m" data-value=""><input class="select__input" style="color: inherit; background: 0px center; opacity: 1; width: 100%; grid-area: 1 / 2; font: inherit; min-width: 2px; border: 0px; margin: 0px; outline: 0px; padding: 0px;" autocapitalize="none" autocomplete="off" autocorrect="off" id="discipline--0" spellcheck="false" tabindex="0" type="text" aria-autocomplete="list" aria-expanded="false" aria-haspopup="true" aria-errormessage="discipline--0-error" aria-invalid="false" aria-labelledby="discipline--0-label" aria-required="true" role="combobox" aria-activedescendant="" aria-describedby="react-select-discipline--0-placeholder discipline--0-error" enterkeyhint="done" value=""></div>
```
</details>

### Field 18: Start date year*

- **Type**: number
- **Tag**: `<input>`
- **ID**: `start-year--0`
- **Required**: YES
- **aria-label**: "Start date year"
- **aria-describedby**: `start-year--0-description start-year--0-error start-year--0-help`
- **Classes**: `input input__single-line`
- **Selector**: `#start-year--0`
- **Dropdown appeared**: YES (30 options)
  - "Afghanistan+93"
  - "Åland Islands+358"
  - "Albania+355"
  - "Algeria+213"
  - "American Samoa+1"
  - "Andorra+376"
  - "Angola+244"
  - "Anguilla+1"
  - "Antigua & Barbuda+1"
  - "Argentina+54"
  - "Armenia+374"
  - "Aruba+297"
  - "Ascension Island+247"
  - "Australia+61"
  - "Austria+43"
  - ... and 15 more
- **Parent chain**: `div` → `div` → `div`
<details>
<summary>Raw HTML (container)</summary>

```html
<div class="input-wrapper"><label id="start-year--0-label" for="start-year--0" class="label label">Start date year<span aria-hidden="true">*</span></label><input id="start-year--0" class="input input__single-line" aria-label="Start date year" aria-describedby="start-year--0-description start-year--0-error start-year--0-help" aria-invalid="false" aria-errormessage="start-year--0-error" aria-required="true" type="number" value="" style=""></div>
```
</details>

### Field 19: End date year*

- **Type**: number
- **Tag**: `<input>`
- **ID**: `end-year--0`
- **Required**: YES
- **aria-label**: "End date year"
- **aria-describedby**: `end-year--0-description end-year--0-error end-year--0-help`
- **Classes**: `input input__single-line`
- **Selector**: `#end-year--0`
- **Dropdown appeared**: YES (30 options)
  - "Afghanistan+93"
  - "Åland Islands+358"
  - "Albania+355"
  - "Algeria+213"
  - "American Samoa+1"
  - "Andorra+376"
  - "Angola+244"
  - "Anguilla+1"
  - "Antigua & Barbuda+1"
  - "Argentina+54"
  - "Armenia+374"
  - "Aruba+297"
  - "Ascension Island+247"
  - "Australia+61"
  - "Austria+43"
  - ... and 15 more
- **Parent chain**: `div` → `div` → `div`
<details>
<summary>Raw HTML (container)</summary>

```html
<div class="input-wrapper"><label id="end-year--0-label" for="end-year--0" class="label label">End date year<span aria-hidden="true">*</span></label><input id="end-year--0" class="input input__single-line" aria-label="End date year" aria-describedby="end-year--0-description end-year--0-error end-year--0-help" aria-invalid="false" aria-errormessage="end-year--0-error" aria-required="true" type="number" value="" style=""></div>
```
</details>

### Field 20: Will you require immigration sponsorship to begin working for IMC?*

- **Type**: text
- **Tag**: `<input>`
- **ID**: `question_8322390101`
- **Required**: YES
- **aria-describedby**: `react-select-question_8322390101-placeholder question_8322390101-error`
- **autocomplete**: `off`
- **Classes**: `select__input`
- **Selector**: `#question_8322390101`
- **Dropdown appeared**: YES (30 options)
  - "Afghanistan+93"
  - "Åland Islands+358"
  - "Albania+355"
  - "Algeria+213"
  - "American Samoa+1"
  - "Andorra+376"
  - "Angola+244"
  - "Anguilla+1"
  - "Antigua & Barbuda+1"
  - "Argentina+54"
  - "Armenia+374"
  - "Aruba+297"
  - "Ascension Island+247"
  - "Australia+61"
  - "Austria+43"
  - ... and 15 more
- **Typeahead/autocomplete**: YES
- **Note**: Typeahead/autocomplete detected
- **Parent chain**: `div` → `div` → `div`
<details>
<summary>Raw HTML (container)</summary>

```html
<div class="field-wrapper"><div class="select"><div class="select__container"><label id="question_8322390101-label" for="question_8322390101" class="label select__label">Will you require immigration sponsorship to begin working for IMC?<span aria-hidden="true">*</span></label><div class="select-shell remix-css-b62m3t-container"><span id="react-select-question_8322390101-live-region" class="remix-css-7pg0cj-a11yText"></span><span aria-live="polite" aria-atomic="false" aria-relevant="additions text" role="log" class="remix-css-7pg0cj-a11yText"></span><div><div class="select__control remix-css-13cymwt-control"><div class="select__value-container remix-css-hlgwow"><div class="select__placeholder remix-css-1jqq78o-placeholder" id="react-select-question_8322390101-placeholder">Select...</div><div class="select__input-container remix-css-19bb58m" data-value=""><input class="select__input" style="color: inherit; background: 0px center; opacity: 1; width: 100%; grid-area: 1 / 2; font: inherit; min-width: 2px; border: 0px; margin: 0px; outline: 0px; padding: 0px;" autocapitalize="none" autocomplete="off" autocorrect="off" id="question_8322390101" spellcheck="false" tabindex="0" type="text" aria-autocomplete="list" aria-expanded="false" aria-haspopup="true" aria-errormessage="question_8322390101-error" aria-invalid="false" aria-labelledby="question_8322390101-label" aria-required="true" role="combobox" aria-activedescendant="" aria-describedby="react-select-question_8322390101-placeholder question_8322390101-error" enterkeyhint="done" value=""></div></div><div class="select__indicators remix-css-1wy0on6"><button type="button" class="icon-button icon-button--sm" aria-label="Toggle flyout" tabindex="-1"><svg class="svg-icon" fill="none" height="20" width="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path class="icon--primary-color" d="M11.4534 16.0667L5.90983 9.13729C5.54316 8.67895 5.86948 8 6.45644 8H17.5436C18.1305 8 18.4568 8.67895 18.0902 9.13729L12.5466 16.0
```
</details>

### Field 21: Will you require immigration sponsorship in the future to continue working for IMC? *

- **Type**: text
- **Tag**: `<input>`
- **ID**: `question_8322391101`
- **Required**: YES
- **aria-describedby**: `react-select-question_8322391101-placeholder question_8322391101-error`
- **autocomplete**: `off`
- **Classes**: `select__input`
- **Selector**: `#question_8322391101`
- **Dropdown appeared**: YES (30 options)
  - "Afghanistan+93"
  - "Åland Islands+358"
  - "Albania+355"
  - "Algeria+213"
  - "American Samoa+1"
  - "Andorra+376"
  - "Angola+244"
  - "Anguilla+1"
  - "Antigua & Barbuda+1"
  - "Argentina+54"
  - "Armenia+374"
  - "Aruba+297"
  - "Ascension Island+247"
  - "Australia+61"
  - "Austria+43"
  - ... and 15 more
- **Typeahead/autocomplete**: YES
- **Note**: Typeahead/autocomplete detected
- **Parent chain**: `div` → `div` → `div`
<details>
<summary>Raw HTML (container)</summary>

```html
<div class="field-wrapper"><div class="select"><div class="select__container"><label id="question_8322391101-label" for="question_8322391101" class="label select__label">Will you require immigration sponsorship in the future to continue working for IMC? <span aria-hidden="true">*</span></label><div class="select-shell remix-css-b62m3t-container"><span id="react-select-question_8322391101-live-region" class="remix-css-7pg0cj-a11yText"></span><span aria-live="polite" aria-atomic="false" aria-relevant="additions text" role="log" class="remix-css-7pg0cj-a11yText"></span><div><div class="select__control remix-css-13cymwt-control"><div class="select__value-container remix-css-hlgwow"><div class="select__placeholder remix-css-1jqq78o-placeholder" id="react-select-question_8322391101-placeholder">Select...</div><div class="select__input-container remix-css-19bb58m" data-value=""><input class="select__input" style="color: inherit; background: 0px center; opacity: 1; width: 100%; grid-area: 1 / 2; font: inherit; min-width: 2px; border: 0px; margin: 0px; outline: 0px; padding: 0px;" autocapitalize="none" autocomplete="off" autocorrect="off" id="question_8322391101" spellcheck="false" tabindex="0" type="text" aria-autocomplete="list" aria-expanded="false" aria-haspopup="true" aria-errormessage="question_8322391101-error" aria-invalid="false" aria-labelledby="question_8322391101-label" aria-required="true" role="combobox" aria-activedescendant="" aria-describedby="react-select-question_8322391101-placeholder question_8322391101-error" enterkeyhint="done" value=""></div></div><div class="select__indicators remix-css-1wy0on6"><button type="button" class="icon-button icon-button--sm" aria-label="Toggle flyout" tabindex="-1"><svg class="svg-icon" fill="none" height="20" width="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path class="icon--primary-color" d="M11.4534 16.0667L5.90983 9.13729C5.54316 8.67895 5.86948 8 6.45644 8H17.5436C18.1305 8 18.4568 8.67895 18.0902 9.
```
</details>

### Field 22: Privacy Statement*

- **Type**: text
- **Tag**: `<input>`
- **ID**: `question_8322392101`
- **Required**: YES
- **aria-describedby**: `react-select-question_8322392101-placeholder question_8322392101-error`
- **autocomplete**: `off`
- **Classes**: `select__input`
- **Selector**: `#question_8322392101`
- **Dropdown appeared**: YES (30 options)
  - "Afghanistan+93"
  - "Åland Islands+358"
  - "Albania+355"
  - "Algeria+213"
  - "American Samoa+1"
  - "Andorra+376"
  - "Angola+244"
  - "Anguilla+1"
  - "Antigua & Barbuda+1"
  - "Argentina+54"
  - "Armenia+374"
  - "Aruba+297"
  - "Ascension Island+247"
  - "Australia+61"
  - "Austria+43"
  - ... and 15 more
- **Typeahead/autocomplete**: YES
- **Note**: Typeahead/autocomplete detected
- **Parent chain**: `div` → `div` → `div`
<details>
<summary>Raw HTML (container)</summary>

```html
<div class="field-wrapper"><div class="select"><div class="select__container"><label id="question_8322392101-label" for="question_8322392101" class="label select__label">Privacy Statement<span aria-hidden="true">*</span></label><div class="select-shell remix-css-b62m3t-container"><span id="react-select-question_8322392101-live-region" class="remix-css-7pg0cj-a11yText"></span><span aria-live="polite" aria-atomic="false" aria-relevant="additions text" role="log" class="remix-css-7pg0cj-a11yText"></span><div><div class="select__control remix-css-13cymwt-control"><div class="select__value-container remix-css-hlgwow"><div class="select__placeholder remix-css-1jqq78o-placeholder" id="react-select-question_8322392101-placeholder">Select...</div><div class="select__input-container remix-css-19bb58m" data-value=""><input class="select__input" style="color: inherit; background: 0px center; opacity: 1; width: 100%; grid-area: 1 / 2; font: inherit; min-width: 2px; border: 0px; margin: 0px; outline: 0px; padding: 0px;" autocapitalize="none" autocomplete="off" autocorrect="off" id="question_8322392101" spellcheck="false" tabindex="0" type="text" aria-autocomplete="list" aria-expanded="false" aria-haspopup="true" aria-errormessage="question_8322392101-error" aria-invalid="false" aria-labelledby="question_8322392101-label" aria-required="true" role="combobox" aria-activedescendant="" aria-describedby="react-select-question_8322392101-placeholder question_8322392101-error" enterkeyhint="done" value=""></div></div><div class="select__indicators remix-css-1wy0on6"><button type="button" class="icon-button icon-button--sm" aria-label="Toggle flyout" tabindex="-1"><svg class="svg-icon" fill="none" height="20" width="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path class="icon--primary-color" d="M11.4534 16.0667L5.90983 9.13729C5.54316 8.67895 5.86948 8 6.45644 8H17.5436C18.1305 8 18.4568 8.67895 18.0902 9.13729L12.5466 16.0667C12.2664 16.417 11.7336 16.417 11.4534 16.0667
```
</details>

### Field 23: What is your gender/gender identity?

- **Type**: text
- **Tag**: `<input>`
- **ID**: `4005628101`
- **Required**: no
- **aria-describedby**: `react-select-4005628101-placeholder 4005628101-error`
- **autocomplete**: `off`
- **Classes**: `select__input`
- **Selector**: `#\34 005628101`
- **Dropdown appeared**: YES (30 options)
  - "Afghanistan+93"
  - "Åland Islands+358"
  - "Albania+355"
  - "Algeria+213"
  - "American Samoa+1"
  - "Andorra+376"
  - "Angola+244"
  - "Anguilla+1"
  - "Antigua & Barbuda+1"
  - "Argentina+54"
  - "Armenia+374"
  - "Aruba+297"
  - "Ascension Island+247"
  - "Australia+61"
  - "Austria+43"
  - ... and 15 more
- **Typeahead/autocomplete**: YES
- **Note**: Typeahead/autocomplete detected
- **Parent chain**: `div` → `div` → `div`
<details>
<summary>Raw HTML (container)</summary>

```html
<div class="select__input-container remix-css-19bb58m" data-value=""><input class="select__input" style="color: inherit; background: 0px center; opacity: 1; width: 100%; grid-area: 1 / 2; font: inherit; min-width: 2px; border: 0px; margin: 0px; outline: 0px; padding: 0px;" autocapitalize="none" autocomplete="off" autocorrect="off" id="4005628101" spellcheck="false" tabindex="0" type="text" aria-autocomplete="list" aria-expanded="false" aria-haspopup="true" aria-errormessage="4005628101-error" aria-invalid="false" aria-labelledby="4005628101-label" aria-required="false" role="combobox" aria-activedescendant="" aria-describedby="react-select-4005628101-placeholder 4005628101-error" enterkeyhint="done" value=""></div>
```
</details>

### Field 24: What is your Race/Ethnicity?

- **Type**: text
- **Tag**: `<input>`
- **ID**: `4005629101`
- **Required**: no
- **aria-describedby**: `react-select-4005629101-placeholder 4005629101-error`
- **autocomplete**: `off`
- **Classes**: `select__input`
- **Selector**: `#\34 005629101`
- **Dropdown appeared**: YES (30 options)
  - "Afghanistan+93"
  - "Åland Islands+358"
  - "Albania+355"
  - "Algeria+213"
  - "American Samoa+1"
  - "Andorra+376"
  - "Angola+244"
  - "Anguilla+1"
  - "Antigua & Barbuda+1"
  - "Argentina+54"
  - "Armenia+374"
  - "Aruba+297"
  - "Ascension Island+247"
  - "Australia+61"
  - "Austria+43"
  - ... and 15 more
- **Typeahead/autocomplete**: YES
- **Note**: Typeahead/autocomplete detected
- **Parent chain**: `div` → `div` → `div`
<details>
<summary>Raw HTML (container)</summary>

```html
<div class="select__input-container remix-css-19bb58m" data-value=""><input class="select__input" style="color: inherit; background: 0px center; opacity: 1; width: 100%; grid-area: 1 / 2; font: inherit; min-width: 2px; border: 0px; margin: 0px; outline: 0px; padding: 0px;" autocapitalize="none" autocomplete="off" autocorrect="off" id="4005629101" spellcheck="false" tabindex="0" type="text" aria-autocomplete="list" aria-expanded="false" aria-haspopup="true" aria-errormessage="4005629101-error" aria-invalid="false" aria-labelledby="4005629101-label" aria-required="false" role="combobox" aria-activedescendant="" aria-describedby="react-select-4005629101-placeholder 4005629101-error" enterkeyhint="done" value=""></div>
```
</details>

## Custom Widgets

### react-select
- **Selector**: `[class="select-shell remix-css-b62m3t-container"]`
- **classes**: ["select-shell","remix-css-b62m3t-container"]
- **hasValue**: false
- **placeholder**: ""
- **step**: "Main Page"

### react-select
- **Selector**: `[class="select__value-container remix-css-hlgwow"]`
- **classes**: ["select__value-container","remix-css-hlgwow"]
- **hasValue**: false
- **placeholder**: ""
- **step**: "Main Page"

### react-select
- **Selector**: `[class="select__input-container remix-css-19bb58m"]`
- **classes**: ["select__input-container","remix-css-19bb58m"]
- **hasValue**: false
- **placeholder**: ""
- **step**: "Main Page"

### react-select
- **Selector**: `[class="select-shell remix-css-b62m3t-container"]`
- **classes**: ["select-shell","remix-css-b62m3t-container"]
- **hasValue**: false
- **placeholder**: ""
- **step**: "Main Page"

### react-select
- **Selector**: `[class="select__value-container remix-css-hlgwow"]`
- **classes**: ["select__value-container","remix-css-hlgwow"]
- **hasValue**: false
- **placeholder**: ""
- **step**: "Main Page"

### react-select
- **Selector**: `[class="select__input-container remix-css-19bb58m"]`
- **classes**: ["select__input-container","remix-css-19bb58m"]
- **hasValue**: false
- **placeholder**: ""
- **step**: "Main Page"

### react-select
- **Selector**: `[class="select-shell remix-css-b62m3t-container"]`
- **classes**: ["select-shell","remix-css-b62m3t-container"]
- **hasValue**: false
- **placeholder**: "Select..."
- **step**: "Main Page"

### react-select
- **Selector**: `[class="select__value-container remix-css-hlgwow"]`
- **classes**: ["select__value-container","remix-css-hlgwow"]
- **hasValue**: false
- **placeholder**: "Select..."
- **step**: "Main Page"

### react-select
- **Selector**: `[class="select__input-container remix-css-19bb58m"]`
- **classes**: ["select__input-container","remix-css-19bb58m"]
- **hasValue**: false
- **placeholder**: ""
- **step**: "Main Page"

### react-select
- **Selector**: `[class="select-shell select--is-disabled"]`
- **classes**: ["select-shell","select--is-disabled","remix-css-3iigni-container"]
- **hasValue**: false
- **placeholder**: "Select..."
- **step**: "Main Page"

### react-select
- **Selector**: `[class="select__value-container remix-css-hlgwow"]`
- **classes**: ["select__value-container","remix-css-hlgwow"]
- **hasValue**: false
- **placeholder**: "Select..."
- **step**: "Main Page"

### react-select
- **Selector**: `[class="select__input-container remix-css-1mkvw8y"]`
- **classes**: ["select__input-container","remix-css-1mkvw8y"]
- **hasValue**: false
- **placeholder**: ""
- **step**: "Main Page"

### react-select
- **Selector**: `[class="select-shell remix-css-b62m3t-container"]`
- **classes**: ["select-shell","remix-css-b62m3t-container"]
- **hasValue**: false
- **placeholder**: "Select..."
- **step**: "Main Page"

### react-select
- **Selector**: `[class="select__value-container remix-css-hlgwow"]`
- **classes**: ["select__value-container","remix-css-hlgwow"]
- **hasValue**: false
- **placeholder**: "Select..."
- **step**: "Main Page"

### react-select
- **Selector**: `[class="select__input-container remix-css-19bb58m"]`
- **classes**: ["select__input-container","remix-css-19bb58m"]
- **hasValue**: false
- **placeholder**: ""
- **step**: "Main Page"

### react-select
- **Selector**: `[class="select-shell remix-css-b62m3t-container"]`
- **classes**: ["select-shell","remix-css-b62m3t-container"]
- **hasValue**: false
- **placeholder**: "Select..."
- **step**: "Main Page"

### react-select
- **Selector**: `[class="select__value-container remix-css-hlgwow"]`
- **classes**: ["select__value-container","remix-css-hlgwow"]
- **hasValue**: false
- **placeholder**: "Select..."
- **step**: "Main Page"

### react-select
- **Selector**: `[class="select__input-container remix-css-19bb58m"]`
- **classes**: ["select__input-container","remix-css-19bb58m"]
- **hasValue**: false
- **placeholder**: ""
- **step**: "Main Page"

### react-select
- **Selector**: `[class="select-shell remix-css-b62m3t-container"]`
- **classes**: ["select-shell","remix-css-b62m3t-container"]
- **hasValue**: false
- **placeholder**: "Select..."
- **step**: "Main Page"

### react-select
- **Selector**: `[class="select__value-container remix-css-hlgwow"]`
- **classes**: ["select__value-container","remix-css-hlgwow"]
- **hasValue**: false
- **placeholder**: "Select..."
- **step**: "Main Page"

### react-select
- **Selector**: `[class="select__input-container remix-css-19bb58m"]`
- **classes**: ["select__input-container","remix-css-19bb58m"]
- **hasValue**: false
- **placeholder**: ""
- **step**: "Main Page"

### react-select
- **Selector**: `[class="select-shell remix-css-b62m3t-container"]`
- **classes**: ["select-shell","remix-css-b62m3t-container"]
- **hasValue**: false
- **placeholder**: "Select..."
- **step**: "Main Page"

### react-select
- **Selector**: `[class="select__value-container remix-css-hlgwow"]`
- **classes**: ["select__value-container","remix-css-hlgwow"]
- **hasValue**: false
- **placeholder**: "Select..."
- **step**: "Main Page"

### react-select
- **Selector**: `[class="select__input-container remix-css-19bb58m"]`
- **classes**: ["select__input-container","remix-css-19bb58m"]
- **hasValue**: false
- **placeholder**: ""
- **step**: "Main Page"

### react-select
- **Selector**: `[class="select-shell remix-css-b62m3t-container"]`
- **classes**: ["select-shell","remix-css-b62m3t-container"]
- **hasValue**: false
- **placeholder**: "Select..."
- **step**: "Main Page"

### react-select
- **Selector**: `[class="select__value-container remix-css-hlgwow"]`
- **classes**: ["select__value-container","remix-css-hlgwow"]
- **hasValue**: false
- **placeholder**: "Select..."
- **step**: "Main Page"

### react-select
- **Selector**: `[class="select__input-container remix-css-19bb58m"]`
- **classes**: ["select__input-container","remix-css-19bb58m"]
- **hasValue**: false
- **placeholder**: ""
- **step**: "Main Page"

### react-select
- **Selector**: `[class="select-shell remix-css-b62m3t-container"]`
- **classes**: ["select-shell","remix-css-b62m3t-container"]
- **hasValue**: false
- **placeholder**: "Select..."
- **step**: "Main Page"

### react-select
- **Selector**: `[class="select__value-container remix-css-hlgwow"]`
- **classes**: ["select__value-container","remix-css-hlgwow"]
- **hasValue**: false
- **placeholder**: "Select..."
- **step**: "Main Page"

### react-select
- **Selector**: `[class="select__input-container remix-css-19bb58m"]`
- **classes**: ["select__input-container","remix-css-19bb58m"]
- **hasValue**: false
- **placeholder**: ""
- **step**: "Main Page"

### react-select
- **Selector**: `[class="select-shell remix-css-b62m3t-container"]`
- **classes**: ["select-shell","remix-css-b62m3t-container"]
- **hasValue**: false
- **placeholder**: "Select..."
- **step**: "Main Page"

### react-select
- **Selector**: `[class="select__value-container remix-css-hlgwow"]`
- **classes**: ["select__value-container","remix-css-hlgwow"]
- **hasValue**: false
- **placeholder**: "Select..."
- **step**: "Main Page"

### react-select
- **Selector**: `[class="select__input-container remix-css-19bb58m"]`
- **classes**: ["select__input-container","remix-css-19bb58m"]
- **hasValue**: false
- **placeholder**: ""
- **step**: "Main Page"

### react-select
- **Selector**: `[class="select-shell remix-css-b62m3t-container"]`
- **classes**: ["select-shell","remix-css-b62m3t-container"]
- **hasValue**: false
- **placeholder**: "Select..."
- **step**: "Main Page"

### react-select
- **Selector**: `[class="select__value-container select__value-container--is-multi"]`
- **classes**: ["select__value-container","select__value-container--is-multi","remix-css-hlgwow"]
- **hasValue**: false
- **placeholder**: "Select..."
- **step**: "Main Page"

### react-select
- **Selector**: `[class="select__input-container remix-css-19bb58m"]`
- **classes**: ["select__input-container","remix-css-19bb58m"]
- **hasValue**: false
- **placeholder**: ""
- **step**: "Main Page"

### file-upload
- **Selector**: `#resume`
- **accept**: ".pdf,.doc,.docx,.txt,.rtf"
- **multiple**: false
- **parentClasses**: ["file-upload__wrapper"]
- **labelText**: "AttachAttachDropboxGoogle DriveEnter manuallyEnter manuallyAccepted file types: pdf, doc, docx, txt,"
- **step**: "Main Page"

---
*Generated by JAOS ATS Recon Tool*