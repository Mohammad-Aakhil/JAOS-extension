# Playwright MCP — Adapter Development Guide

> How to set up Playwright MCP and use it to build JAOS V2 adapters faster.
> Replaces manual console copy-paste with automated DOM scraping.

---

## Table of Contents

1. [What is Playwright MCP?](#what-is-playwright-mcp)
2. [Setup](#setup)
3. [Quick Start — Scan a Portal](#quick-start--scan-a-portal)
4. [Adapter Building Workflow](#adapter-building-workflow)
5. [DOM Scraping Recipes](#dom-scraping-recipes)
6. [Field Discovery Scripts](#field-discovery-scripts)
7. [Custom Widget Detection](#custom-widget-detection)
8. [Building Rules Documents](#building-rules-documents)
9. [Fill Testing with Playwright MCP](#fill-testing-with-playwright-mcp)
10. [Tips & Gotchas](#tips--gotchas)
11. [Comparison: Playwright MCP vs Recon Tool vs Manual Console](#comparison)

---

## What is Playwright MCP?

Playwright MCP is an MCP (Model Context Protocol) server that gives Claude Code direct browser control. Instead of manually copy-pasting DOM from DevTools console, Claude can:

- Navigate to URLs
- Take screenshots
- Click elements, type text, fill forms
- Execute JavaScript in the page context
- Read the full DOM snapshot (accessibility tree)
- Wait for elements, handle dialogs

This means the entire adapter research + build + test cycle can happen in one Claude Code session — no manual console work needed.

---

## Setup

### Prerequisites

- **Node.js 18+** installed
- **Claude Code** CLI or VS Code extension
- **Chrome** (for testing the actual extension later)

### Step 1: Add Playwright MCP to your project

Create or update `.mcp.json` in your project root (e.g., `JAOS/.mcp.json`):

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@anthropic-ai/mcp-playwright@latest"]
    }
  }
}
```

That's it. No `npm install` needed — `npx` downloads and runs it on-the-fly.

### Step 2: Verify it works

Start a Claude Code session and ask:

```
Navigate to https://example.com and take a screenshot
```

Claude should open a browser, navigate, and show you the screenshot. If it works, you're ready.

### Step 3: Install Playwright browsers (first time only)

If you get a "browser not found" error, run:

```bash
npx playwright install chromium
```

This downloads the Chromium binary that Playwright controls.

---

## Quick Start — Scan a Portal

Here's how to scan a job application portal and extract all form fields:

### 1. Navigate to the job application

Ask Claude:
```
Navigate to https://boards.greenhouse.io/some-company/jobs/12345
and take a screenshot
```

### 2. Click "Apply" to expose the form

```
Click the "Apply for this job" button and wait for the form to load.
Take a screenshot after.
```

### 3. Get the accessibility snapshot

```
Take a browser snapshot (accessibility tree) so I can see all form fields
```

The snapshot gives you a structured view of every interactive element — inputs, selects, buttons, labels, roles — without manually inspecting the DOM.

### 4. Extract detailed field info

Ask Claude to run JavaScript in the page:
```
Run this JavaScript in the browser to extract all form fields with their metadata:

[Claude will use browser_evaluate to run the scanner script]
```

Or use the built-in scanner:
```javascript
// This runs in the page context via browser_evaluate
const fields = [];
document.querySelectorAll('input, select, textarea').forEach((el, i) => {
  if (el.offsetParent === null) return; // skip hidden
  const label = el.labels?.[0]?.textContent?.trim()
    || el.getAttribute('aria-label')
    || el.placeholder
    || el.name
    || `unnamed-${i}`;
  fields.push({
    tag: el.tagName.toLowerCase(),
    type: el.type || el.tagName.toLowerCase(),
    label,
    id: el.id,
    name: el.name,
    required: el.required || el.getAttribute('aria-required') === 'true',
    options: el.tagName === 'SELECT' ? [...el.options].map(o => o.text) : undefined,
    classes: el.className.substring(0, 100)
  });
});
JSON.stringify(fields, null, 2);
```

---

## Adapter Building Workflow

This is the full workflow for building a new V2 adapter using Playwright MCP.

### Phase 1: Recon (3-5 portals)

For each portal:

1. **Navigate** to the job application URL
2. **Screenshot** the initial state
3. **Click Apply** and wait for form to load
4. **Screenshot** the form
5. **Snapshot** the accessibility tree
6. **Extract** all form fields via `browser_evaluate`
7. **Interact** with each custom widget:
   - Click dropdowns → screenshot → read options
   - Click radio/checkbox groups → note behavior
   - Try typing in text fields → check for autocomplete/typeahead
8. **Check for multi-step**: Click "Next"/"Continue" → screenshot → extract next page's fields
9. **Document** findings

Repeat across 3-5 different companies using the same ATS to understand variation.

### Phase 2: Rules Document

From the recon data, create `{ats}-rules.md`:

```markdown
# MyATS — DOM Rules & Patterns

## Detection
- Hostname: `*.myats.com`
- DOM marker: `<div id="myats-app">`
- Meta tag: `<meta name="generator" content="MyATS">`

## Form Structure
- Single page / Multi-step (X tabs)
- Form container: `#application-form`

## Standard Fields
| Field | Selector | Type | Required |
|-------|----------|------|----------|
| First Name | input#first_name | text | yes |
| Last Name | input#last_name | text | yes |
| Email | input#email | email | yes |
| Phone | input[type="tel"] | tel | yes |

## Custom Widgets
### Dropdown XYZ
- Trigger: `.custom-select .trigger`
- Options container: `.custom-select .options-panel`
- Option selector: `.option-item`
- Selection method: Click option → sets hidden input
- Close: Escape key or click outside

## Date Format
- MM/DD/YYYY

## Quirks
- Honeypot field: `input#trap` (must stay empty)
- Required indicator: `aria-required="true"` (NOT red asterisk)
```

### Phase 3: Write the Adapter

Create `adapters/{ats}-v2.js` following the V2 adapter contract (see DEVELOPER_GUIDE.md).

### Phase 4: Test with Playwright MCP

Use Playwright MCP to verify the adapter works on multiple portals without installing the extension:

```
Navigate to [portal URL], click Apply, then run our scanner script
to check that all fields are detected correctly.
```

### Phase 5: Live Test with Extension

Load the extension in Chrome, navigate to the portal, click "AI Fill", and verify.

---

## DOM Scraping Recipes

These are JavaScript snippets you can ask Claude to run via `browser_evaluate` for common recon tasks.

### Extract All Form Fields

```javascript
(() => {
  const fields = [];
  document.querySelectorAll('input, select, textarea').forEach((el, i) => {
    if (el.offsetParent === null && !el.closest('[aria-hidden]')) return;
    const labelEl = el.labels?.[0]
      || document.querySelector(`label[for="${el.id}"]`)
      || el.closest('label');
    fields.push({
      index: i,
      tag: el.tagName.toLowerCase(),
      type: el.type || 'textarea',
      id: el.id,
      name: el.name,
      label: labelEl?.textContent?.trim()
        || el.getAttribute('aria-label')
        || el.getAttribute('aria-labelledby') && document.getElementById(el.getAttribute('aria-labelledby'))?.textContent?.trim()
        || el.placeholder
        || '(no label)',
      required: el.required || el.getAttribute('aria-required') === 'true',
      value: el.value,
      classes: el.className.substring(0, 80),
      dataAttrs: Object.fromEntries(
        [...el.attributes]
          .filter(a => a.name.startsWith('data-'))
          .map(a => [a.name, a.value])
      ),
      options: el.tagName === 'SELECT'
        ? [...el.options].slice(0, 30).map(o => ({ value: o.value, text: o.text }))
        : undefined
    });
  });
  return JSON.stringify(fields, null, 2);
})()
```

### Detect React-Select Widgets

```javascript
(() => {
  const widgets = [];
  document.querySelectorAll('[class*="select__control"], [class*="-control"]').forEach(el => {
    const container = el.closest('[class*="select__container"], [class*="-container"]');
    if (!container) return;
    const label = container.closest('.field')?.querySelector('label')?.textContent?.trim()
      || container.getAttribute('aria-label')
      || '(unknown)';
    widgets.push({
      type: 'react-select',
      label,
      hasValue: !!container.querySelector('[class*="select__single-value"]')?.textContent,
      isMulti: !!container.querySelector('[class*="select__multi-value"]'),
      placeholder: container.querySelector('[class*="select__placeholder"]')?.textContent,
      containerClasses: container.className.substring(0, 100)
    });
  });
  return JSON.stringify(widgets, null, 2);
})()
```

### Detect Shadow DOM Elements

```javascript
(() => {
  const shadowHosts = [];
  function findShadowRoots(root) {
    root.querySelectorAll('*').forEach(el => {
      if (el.shadowRoot) {
        shadowHosts.push({
          tag: el.tagName.toLowerCase(),
          id: el.id,
          classes: el.className?.substring?.(0, 80) || '',
          childCount: el.shadowRoot.childElementCount,
          innerFields: el.shadowRoot.querySelectorAll('input, select, textarea').length
        });
        findShadowRoots(el.shadowRoot);
      }
    });
  }
  findShadowRoots(document);
  return JSON.stringify(shadowHosts, null, 2);
})()
```

### Map All Dropdown Options

```javascript
(() => {
  const dropdowns = [];
  document.querySelectorAll('select').forEach(sel => {
    const label = sel.labels?.[0]?.textContent?.trim()
      || document.querySelector(`label[for="${sel.id}"]`)?.textContent?.trim()
      || sel.name || sel.id || '(unknown)';
    dropdowns.push({
      label,
      id: sel.id,
      name: sel.name,
      required: sel.required,
      optionCount: sel.options.length,
      options: [...sel.options].map(o => ({ value: o.value, text: o.text.trim() }))
    });
  });
  return JSON.stringify(dropdowns, null, 2);
})()
```

### Detect Button Groups (Yes/No, Radio-style)

```javascript
(() => {
  const groups = [];
  // Fieldsets with buttons
  document.querySelectorAll('fieldset, [role="radiogroup"], [role="group"]').forEach(group => {
    const buttons = group.querySelectorAll('button, [role="radio"], [role="option"]');
    if (buttons.length < 2) return;
    const legend = group.querySelector('legend, label, [class*="label"]')?.textContent?.trim();
    groups.push({
      type: 'button-group',
      label: legend || '(no label)',
      buttonCount: buttons.length,
      buttons: [...buttons].map(b => ({
        text: b.textContent.trim(),
        value: b.value || b.dataset.value || b.textContent.trim(),
        selected: b.classList.contains('selected') || b.getAttribute('aria-pressed') === 'true'
      }))
    });
  });
  return JSON.stringify(groups, null, 2);
})()
```

### Get Section Structure

```javascript
(() => {
  const sections = [];
  document.querySelectorAll('h1, h2, h3, h4, [class*="section-header"], [class*="section-title"]').forEach(heading => {
    const fieldCount = heading.closest('section, fieldset, [class*="section"], [class*="group"]')
      ?.querySelectorAll('input, select, textarea').length || 0;
    sections.push({
      tag: heading.tagName.toLowerCase(),
      text: heading.textContent.trim().substring(0, 100),
      fieldCount,
      classes: heading.className.substring(0, 80)
    });
  });
  return JSON.stringify(sections, null, 2);
})()
```

---

## Custom Widget Detection

Different ATS platforms use different custom widgets. Here's how to detect and document each type using Playwright MCP.

### React-Select

```
Click on the dropdown container, wait 500ms, then take a screenshot
to see the open dropdown with options. Then run the react-select
detection script.
```

**Key signals**: Classes contain `select__control`, `select__menu`, `select__option`

### Select2

```
Click on the Select2 trigger element, wait for the dropdown,
then extract all options.
```

**Key signals**: Classes contain `select2-selection`, `select2-results`, `select2-dropdown`

### Fabric UI (BambooHR)

```
Press Enter on the fab-SelectToggle element to open it,
then screenshot the dropdown.
```

**Key signals**: Tag `fab-SelectToggle`, opens with Enter key (not click)

### Workday cx-select (Shadow DOM)

```
Run the shadow DOM detection script first, then pierce into
the cx-select shadow root to extract options.
```

**Key signals**: Tag `cx-select`, options in shadow DOM

### Oracle JET

```
Click on the oj-combobox element, type a character,
wait for options to appear, then extract them.
```

**Key signals**: Tags `oj-select-single`, `oj-combobox-one`, `oj-option`

---

## Building Rules Documents

After scanning 3-5 portals, build the rules doc systematically:

### Step 1: Compare field lists across portals

Ask Claude:
```
I've scanned 5 portals. Compare the field lists and tell me:
1. Which fields appear on ALL portals (core fields)
2. Which fields appear on SOME portals (optional/custom)
3. Which custom widgets are used and how they vary
```

### Step 2: Document detection patterns

```
From the 5 portal URLs, what hostname patterns can we use
to detect this ATS? Also check for meta tags or DOM markers.
```

### Step 3: Document widget interactions

For each custom widget found:
```
Navigate to [portal], open the [widget name] dropdown,
and document exactly:
1. What element to click to open it
2. What container holds the options
3. How to select an option (click? keyboard?)
4. How to close it (Escape? click outside?)
5. Does it support search/typeahead?
```

### Step 4: Document multi-step navigation

```
After filling the first page, click "Next" and document:
1. What button triggers navigation
2. How long until the next page renders
3. What DOM changes signal the next page is ready
```

---

## Fill Testing with Playwright MCP

After writing the adapter, test it without the extension:

### Test 1: Field Detection

```
Navigate to [portal URL], click Apply, then run the JAOS scanner
(engine/scanner.js scanPage logic) to verify all fields are found.
```

### Test 2: Value Filling

Test individual fills via Playwright MCP:

```javascript
// Test text input fill
await page.fill('input#first_name', 'John');

// Test react-select fill
await page.click('[class*="select__control"]');
await page.keyboard.type('United States', { delay: 50 });
await page.waitForTimeout(1000);
await page.locator('[class*="select__option"]').first().click();
await page.keyboard.press('Escape');

// Test checkbox
await page.check('input[type="checkbox"]#terms');

// Test file upload
const input = await page.$('input[type="file"]');
await input.setInputFiles('/path/to/resume.pdf');
```

### Test 3: Multi-Step Navigation

```
Fill the first page fields, then click Next.
Wait for the next page to load, take a screenshot,
and verify the form advanced correctly.
```

### Test 4: Cross-Portal Validation

Repeat tests on 3-5 different portals to ensure the adapter handles variation.

---

## Tips & Gotchas

### Playwright MCP vs Manual DevTools

| Task | Manual Console | Playwright MCP |
|------|---------------|----------------|
| Navigate to URL | Manual in browser | `browser_navigate` |
| See DOM structure | Inspect element by element | `browser_snapshot` (full tree) |
| Extract fields | Copy-paste from console | `browser_evaluate` (scripted) |
| Click dropdowns | Manual click | `browser_click` |
| Type text | Manual typing | `browser_type` / `browser_fill_form` |
| Screenshot | Manual or DevTools | `browser_take_screenshot` |
| Test across portals | Repeat everything manually | Script once, repeat programmatically |

### Common Gotchas

1. **React-select needs `locator.click()`**, NOT `page.evaluate(() => el.click())`. React-select listens for `onMouseDown`, which only fires with Playwright's full event chain.

2. **Always press Escape between fields** to close dropdowns. Open dropdowns steal focus and block the next fill.

3. **Shadow DOM**: Playwright's `locator()` doesn't pierce shadow DOM by default. Use `page.evaluate()` with manual `shadowRoot` traversal, or `page.locator('css:light(selector)')`.

4. **Wait for DOM stability** after navigation. Don't fill immediately after clicking "Next" — wait for MutationObserver to settle or use `browser_wait_for`.

5. **Iframes**: Some ATS platforms (iCIMS, Jobvite) use iframes. You need to switch to the iframe context first:
   ```
   browser_evaluate in the iframe context
   ```

6. **Rate limiting**: Don't scan too many portals too fast. Add 5-10 second delays between portals. Some ATS platforms (Workday, Oracle) will block rapid automated access.

7. **Authentication**: Some ATS portals require login. Use Playwright MCP to handle the login flow, or navigate manually in the browser first and then connect.

8. **Page reload between fill tests**: Always reload the page before testing fill again. Partially filled forms have unpredictable state.

---

## Comparison

### Playwright MCP vs Recon Tool vs Manual Console

| Aspect | Manual Console | Recon Tool (recon.js) | Playwright MCP |
|--------|---------------|----------------------|----------------|
| **Setup** | None | `npm install` + Chrome debug port | `.mcp.json` config |
| **Speed** | Slow (copy-paste) | Fast (automated) | Fast (Claude-driven) |
| **Interactivity** | Full (you click) | Limited (scripted clicks) | Full (Claude clicks) |
| **Custom widgets** | Manual inspection | Basic detection | Claude inspects + documents |
| **Multi-portal** | Very slow | Batch mode | Claude loops through URLs |
| **Output** | Notes in a doc | JSON + MD + adapter skeleton | Direct into rules doc + adapter |
| **Learning curve** | Low | Medium | Low (Claude handles it) |
| **Best for** | Quick one-off look | Batch scanning 15+ portals | Adapter research + build + test |

### When to Use Which

- **Manual Console**: Quick one-off field check on a single portal
- **Recon Tool** (`recon.js` / `recon-batch.js`): Scanning many portals at scale for field frequency data and option registries
- **Playwright MCP**: Full adapter development cycle — recon, rules doc, adapter writing, and fill testing — all in one Claude Code session

---

## Example: Full Adapter Build Session

Here's what a complete adapter build session looks like using Playwright MCP:

```
You (to Claude Code):
  "Build a V2 adapter for the Rippling ATS. Here are 5 test URLs:
   - https://ats.rippling.com/company1/jobs/abc123
   - https://ats.rippling.com/company2/jobs/def456
   - https://ats.rippling.com/company3/jobs/ghi789
   - https://ats.rippling.com/company4/jobs/jkl012
   - https://ats.rippling.com/company5/jobs/mno345"

Claude:
  1. Navigates to first URL, takes screenshot
  2. Clicks Apply, waits for form, takes screenshot
  3. Runs field extraction script
  4. Clicks each custom widget, documents behavior
  5. Checks for multi-step navigation
  6. Repeats for remaining 4 URLs
  7. Compares field lists across portals
  8. Creates rippling-rules.md
  9. Creates rippling-fields.md (field catalog)
  10. Writes adapters/rippling-v2.js
  11. Updates manifest.json and background.js
  12. Tests the adapter on each portal via Playwright MCP
  13. Iterates on issues found during testing
  14. Done — adapter ready for extension testing
```

Total time: ~30-45 minutes for a complete adapter, vs 3-4 hours manually.

---

## Reference: Playwright MCP Tools

These are the MCP tools available when Playwright MCP is configured:

| Tool | Purpose |
|------|---------|
| `browser_navigate` | Go to a URL |
| `browser_snapshot` | Get accessibility tree (all interactive elements) |
| `browser_take_screenshot` | Capture current page as image |
| `browser_click` | Click an element (by text, role, or ref from snapshot) |
| `browser_type` | Type text character by character |
| `browser_fill_form` | Fill a form field (instant, not char-by-char) |
| `browser_press_key` | Press a key (Enter, Escape, Tab, etc.) |
| `browser_select_option` | Select from a `<select>` dropdown |
| `browser_hover` | Hover over an element |
| `browser_drag` | Drag and drop |
| `browser_evaluate` | Run JavaScript in page context |
| `browser_wait_for` | Wait for text/element to appear |
| `browser_file_upload` | Upload a file to file input |
| `browser_handle_dialog` | Accept/dismiss alert/confirm dialogs |
| `browser_tabs` | List open tabs |
| `browser_navigate_back` | Go back |
| `browser_console_messages` | Read console logs |
| `browser_network_requests` | See network traffic |
| `browser_resize` | Resize viewport |
| `browser_close` | Close the browser |
| `browser_run_code` | Run Playwright code directly |
| `browser_install` | Install Playwright browsers |
