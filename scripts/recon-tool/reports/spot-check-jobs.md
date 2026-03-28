# Spot-Check Report: jobs

**URL:** https://jobs.ashbyhq.com/openrouter/89ff6b47-ba08-4418-b24b-c136dbf2ef82
**Timestamp:** 2026-03-18T07:41:36.488Z

## Summary

| Widget Type | Count |
|---|---|
| textFields | 3 |
| radioGroups | 0 |
| checkboxes | 2 |
| selects | 0 |
| textareas | 1 |
| yesNoButtons | 2 |
| comboboxes | 1 |
| fileInputs | 2 |
| conditionalFields | 0 |

## Widgets (Yes/No Buttons + Comboboxes)

| Type | Label | Behavior / Rendering | Conditional Fields |
|---|---|---|---|
| Yes/No | Do you currently require visa sponsorship to work  | error | 0 |
| Yes/No | Will you require visa sponsorship in the future to | error | 0 |
| Combobox | Start typing... | listbox: not-found, click: true | - |

## File Inputs

| Purpose | ID | Accept | Hidden |
|---|---|---|---|
| autofill-pane | - | application/pdf,.pdf,application/msword,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx,application/vnd.oasis.opendocument.text,.odt,application/rtf,.rtf | false |
| resume | _systemfield_resume | application/pdf,.pdf,application/msword,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx,application/vnd.oasis.opendocument.text,.odt,application/rtf,.rtf,image/*,video/*,audio/* | false |

## Adapter Hints

- Combobox "Start typing..." opens on click -- click to open, then type to filter and click option
- 1 file input(s) in autofill pane -- skip these, they are for ATS profile import, not resume upload
- Resume file input found (id="_systemfield_resume") -- use DataTransfer API to upload, accept: "application/pdf,.pdf,application/msword,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx,application/vnd.oasis.opendocument.text,.odt,application/rtf,.rtf,image/*,video/*,audio/*"
