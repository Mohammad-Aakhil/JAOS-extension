# ATS Recon Report — Ashby

- **URL**: https://jobs.ashbyhq.com/tabz/e8f9c292-c0b9-4008-a57f-30e3c1c12a5d/application
- **Hostname**: jobs.ashbyhq.com
- **Scanned**: 2026-03-18T05:42:31.358Z
- **Frameworks**: React

## Form Structure

### Tabs / Steps
- Overview
- **[Active]** Application

### Sections
- `<h1>` Accountant
- `<h2>` Location
- `<h2>` Employment Type
- `<h2>` Location Type
- `<h2>` Department
- `<h3>` Autofill from resume

### Buttons
- **Upload file** (`button` type="submit") — classes: `_button_8wvgw_29 _secondary_8wvgw_114 _ctaButton_xd2v0_94`
- **Upload File** (`button` type="submit") — classes: `_button_8wvgw_29 _secondary_8wvgw_114 _button_1fd3o_107`
- **Yes** (`button` type="submit") — classes: `_container_pjyt6_1 _option_y2cw4_33 `
- **No** (`button` type="submit") — classes: `_container_pjyt6_1 _option_y2cw4_33 `
- **Yes** (`button` type="submit") — classes: `_container_pjyt6_1 _option_y2cw4_33 `
- **No** (`button` type="submit") — classes: `_container_pjyt6_1 _option_y2cw4_33 `
- **Submit Application** (`button` type="submit") — classes: `_button_8wvgw_29 _primary_8wvgw_96 _greedy_8wvgw_218 _submitButton_oj0x8_408 ashby-application-form-submit-button`

### Iframes
- id="" name="a-lwlqdwpc4lv" src="https://www.recaptcha.net/recaptcha/api2/anchor?ar=1&k=6LeFb_YUAAAAALUD5h-BiQEp8JaFChe0e0A6r49Y&co=a"
- id="" name="" src=""

## Fields

| # | Step | Label | Type | Required | ID / Name | Selector |
|---|------|-------|------|----------|-----------|----------|
| 0 | Main Page | - | file | no | `-` | `#form > div._autofillPane_oj0x8_445.ashby-application-form-a` |
| 1 | Main Page | Name | text | YES | `_systemfield_name` | `#_systemfield_name` |
| 2 | Main Page | Email | email | YES | `_systemfield_email` | `#_systemfield_email` |
| 3 | Main Page | Resume | file | YES | `_systemfield_resume` | `#_systemfield_resume` |
| 4 | Main Page | What are your compensation expectations? | text | YES | `05cc147d-d1dc-49dc-9e86-ca8c50950281` | `#\30 5cc147d-d1dc-49dc-9e86-ca8c50950281` |

## Field Details

### Field 0: (no label)

- **Type**: file
- **Tag**: `<input>`
- **Required**: no
- **Selector**: `#form > div._autofillPane_oj0x8_445.ashby-application-form-autofill-pane:nth-of-type(1) > div._root_xd2v0_1.ashby-application-form-autofill-input-root > input`
- **Note**: Click failed: elementHandle.click: Timeout 2000ms exceeded.
Call log:
[2m  - attempting click action[22m
[2m   
- **Parent chain**: `div[role=presentation]` → `div` → `div#form[role=tabpanel]`
<details>
<summary>Raw HTML (container)</summary>

```html
<div role="presentation" class="_root_xd2v0_1 ashby-application-form-autofill-input-root" data-state="default"><input accept="application/pdf,.pdf,application/msword,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx,application/vnd.oasis.opendocument.text,.odt,application/rtf,.rtf" type="file" tabindex="-1" style="border: 0px; clip: rect(0px, 0px, 0px, 0px); clip-path: inset(50%); height: 1px; margin: 0px -1px -1px 0px; overflow: hidden; padding: 0px; position: absolute; width: 1px; white-space: nowrap;"><div class="_base_xd2v0_31 ashby-application-form-autofill-input-base-layer"><div class="_content_xd2v0_36"><div class="_header_xd2v0_43"><div class="_iconContainer_xd2v0_50"><svg viewBox="0 0 576 512" fill="none" height="1em" class="_icon_xd2v0_50 ashby-application-form-autofill-input-icon"><path d="M234.7 42.7L197 56.8c-3 1.1-5 4-5 7.2s2 6.1 5 7.2l37.7 14.1L248.8 123c1.1 3 4 5 7.2 5s6.1-2 7.2-5l14.1-37.7L315 71.2c3-1.1 5-4 5-7.2s-2-6.1-5-7.2L277.3 42.7 263.2 5c-1.1-3-4-5-7.2-5s-6.1 2-7.2 5L234.7 42.7zM461.4 48L496 82.6 386.2 192.3l-34.6-34.6L461.4 48zM80 429.4L317.7 191.7l34.6 34.6L114.6 464 80 429.4zM427.4 14.1L46.1 395.4c-18.7 18.7-18.7 49.1 0 67.9l34.6 34.6c18.7 18.7 49.1 18.7 67.9 0L529.9 116.5c18.7-18.7 18.7-49.1 0-67.9L495.3 14.1c-18.7-18.7-49.1-18.7-67.9 0zM7.5 117.2C3 118.9 0 123.2 0 128s3 9.1 7.5 10.8L64 160l21.2 56.5c1.7 4.5 6 7.5 10.8 7.5s9.1-3 10.8-7.5L128 160l56.5-21.2c4.5-1.7 7.5-6 7.5-10.8s-3-9.1-7.5-10.8L128 96 106.8 39.5C105.1 35 100.8 32 96 32s-9.1 3-10.8 7.5L64 96 7.5 117.2zm352 256c-4.5 1.7-7.5 6-7.5 10.8s3 9.1 7.5 10.8L416 416l21.2 56.5c1.7 4.5 6 7.5 10.8 7.5s9.1-3 10.8-7.5L480 416l56.5-21.2c4.5-1.7 7.5-6 7.5-10.8s-3-9.1-7.5-10.8L480 352l-21.2-56.5c-1.7-4.5-6-7.5-10.8-7.5s-9.1 3-10.8 7.5L416 352l-56.5 21.2z"></path></svg></div><h3 class="_title_xd2v0_64 ashby-application-form-autofill-input-title">Autofill from resume</h3></div><p class="_description_xd2v0_76 ashby-application-form-autofill-input-description">U
```
</details>

### Field 1: Name

- **Type**: text
- **Tag**: `<input>`
- **ID**: `_systemfield_name`
- **Name**: `_systemfield_name`
- **Placeholder**: "Type here..."
- **Required**: YES
- **Classes**: `_input_1wkz4_28 _input_17tft_33`
- **Selector**: `#_systemfield_name`
- **Parent chain**: `div` → `div` → `div`
<details>
<summary>Raw HTML (container)</summary>

```html
<div class="_fieldEntry_17tft_29 ashby-application-form-field-entry"><label class="_heading_101oc_53 _required_101oc_92 _label_17tft_43 ashby-application-form-question-title" for="_systemfield_name">Name</label><div><input placeholder="Type here..." name="_systemfield_name" required="" id="_systemfield_name" type="text" class="_input_1wkz4_28 _input_17tft_33" value=""></div></div>
```
</details>

### Field 2: Email

- **Type**: email
- **Tag**: `<input>`
- **ID**: `_systemfield_email`
- **Name**: `_systemfield_email`
- **Placeholder**: "hello@example.com..."
- **Required**: YES
- **Classes**: `_input_1wkz4_28 _input_17tft_33`
- **Selector**: `#_systemfield_email`
- **Parent chain**: `div` → `div` → `div`
<details>
<summary>Raw HTML (container)</summary>

```html
<div class="_fieldEntry_17tft_29 ashby-application-form-field-entry"><label class="_heading_101oc_53 _required_101oc_92 _label_17tft_43 ashby-application-form-question-title" for="_systemfield_email">Email</label><div><input placeholder="hello@example.com..." name="_systemfield_email" required="" id="_systemfield_email" type="email" class="_input_1wkz4_28 _input_17tft_33" value=""></div></div>
```
</details>

### Field 3: Resume

- **Type**: file
- **Tag**: `<input>`
- **ID**: `_systemfield_resume`
- **Required**: YES
- **Selector**: `#_systemfield_resume`
- **Note**: Click failed: elementHandle.click: Timeout 2000ms exceeded.
Call log:
[2m  - attempting click action[22m
[2m   
- **Parent chain**: `div[role=presentation]` → `div` → `div`
<details>
<summary>Raw HTML (container)</summary>

```html
<div class="_fieldEntry_17tft_29 ashby-application-form-field-entry"><label class="_heading_101oc_53 _required_101oc_92 _label_17tft_43 ashby-application-form-question-title" for="_systemfield_resume">Resume</label><div role="presentation" class="_container_1fd3o_71 "><input accept="application/pdf,.pdf,application/msword,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx,application/vnd.oasis.opendocument.text,.odt,application/rtf,.rtf,image/*,video/*,audio/*" type="file" tabindex="-1" id="_systemfield_resume" required="" style="border: 0px; clip: rect(0px, 0px, 0px, 0px); clip-path: inset(50%); height: 1px; margin: 0px -1px -1px 0px; overflow: hidden; padding: 0px; position: absolute; width: 1px; white-space: nowrap;"><div class="_instructions_1fd3o_34"><button class="_button_8wvgw_29 _secondary_8wvgw_114    _button_1fd3o_107"><svg viewBox="0 0 448 512" fill="none" height="1em"><path d="M375 73c-26-26-68.1-26-94.1 0L89 265C45.3 308.6 45.3 379.4 89 423s114.4 43.6 158.1 0L399 271c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9L281 457c-62.4 62.4-163.5 62.4-225.9 0S-7.4 293.4 55 231L247 39C291.7-5.7 364.2-5.7 409 39s44.7 117.2 0 161.9L225.2 384.7c-31.6 31.6-83.6 28.7-111.5-6.2c-23.8-29.8-21.5-72.8 5.5-99.8L271 127c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9L153.2 312.7c-9.7 9.7-10.6 25.1-2 35.8c10 12.5 28.7 13.6 40 2.2L375 167c26-26 26-68.1 0-94.1z"></path></svg><span><span>Upload File</span></span></button><p class="_dragInstructions_1fd3o_29">or drag and drop here</p></div></div></div>
```
</details>

### Field 4: What are your compensation expectations?

- **Type**: text
- **Tag**: `<input>`
- **ID**: `05cc147d-d1dc-49dc-9e86-ca8c50950281`
- **Name**: `05cc147d-d1dc-49dc-9e86-ca8c50950281`
- **Placeholder**: "Type here..."
- **Required**: YES
- **Classes**: `_input_1wkz4_28 _input_17tft_33`
- **Selector**: `#\30 5cc147d-d1dc-49dc-9e86-ca8c50950281`
- **Parent chain**: `div` → `div` → `div`
<details>
<summary>Raw HTML (container)</summary>

```html
<div class="_fieldEntry_17tft_29 ashby-application-form-field-entry"><label class="_heading_101oc_53 _required_101oc_92 _label_17tft_43 ashby-application-form-question-title" for="05cc147d-d1dc-49dc-9e86-ca8c50950281">What are your compensation expectations?</label><div><input placeholder="Type here..." name="05cc147d-d1dc-49dc-9e86-ca8c50950281" required="" id="05cc147d-d1dc-49dc-9e86-ca8c50950281" type="text" class="_input_1wkz4_28 _input_17tft_33" value=""></div></div>
```
</details>

## Custom Widgets

### file-upload
- **Selector**: `input[type="file"][name=""]`
- **accept**: "application/pdf,.pdf,application/msword,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx,application/vnd.oasis.opendocument.text,.odt,application/rtf,.rtf"
- **multiple**: false
- **parentClasses**: ["_root_xd2v0_1","ashby-application-form-autofill-input-root"]
- **labelText**: "Autofill from resumeUpload your resume here to autofill key application fields.Upload fileDrop your "

### file-upload
- **Selector**: `#_systemfield_resume`
- **accept**: "application/pdf,.pdf,application/msword,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx,application/vnd.oasis.opendocument.text,.odt,application/rtf,.rtf,image/*,video/*,audio/*"
- **multiple**: false
- **parentClasses**: ["_container_1fd3o_71",""]
- **labelText**: "Upload Fileor drag and drop here"

---
*Generated by JAOS ATS Recon Tool*