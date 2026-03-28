# JAOS ATS Recon Tool — Workflow Guide

> For Claude Code sessions: follow this exact sequence when user wants to scan a new ATS portal.

## Prerequisites
- `aqeel-extension/scripts/recon-tool/` has `node_modules` installed (`npm install` already done)
- Tools: `recon.js` (scanner), `fill-greenhouse.js` (fill validation example)

## Step-by-Step Workflow

### 1. Kill existing Chrome & relaunch with debug port

```bash
taskkill //F //IM chrome.exe 2>&1; sleep 3
"C:/Program Files/Google/Chrome/Application/chrome.exe" --remote-debugging-port=9222 "https://TARGET_URL_HERE" &
sleep 5 && curl -s http://127.0.0.1:9222/json/version | head -3
```

**IMPORTANT**: Chrome MUST be fully closed first. If any Chrome process is running, the new instance joins the existing session WITHOUT the debug port. Verify with `curl` — if it returns JSON with `"Browser": "Chrome/..."`, the port is active.

### 2. Wait for user to authenticate & expose the form

Tell the user:
> "Chrome is open with debug port. Navigate to the job application, log in if needed, click 'Apply' to expose the form. Tell me when the form is visible."

**DO NOT run the recon tool until the user confirms the form fields are visible.** ATS forms only render after clicking Apply/Start Application.

### 3. Run the recon tool

```bash
cd "c:/Users/Mohammad Aqeel/Documents/JAOS/aqeel-extension/scripts/recon-tool"
node recon.js --url <keyword> --output <ats-name>-recon --no-navigate 2>&1
```

- `--url <keyword>`: matches tab URL (e.g., `greenhouse`, `workday`, `oraclecloud`)
- `--output <name>`: prefix for report files
- `--no-navigate`: skip auto-clicking Next buttons (use this first time; add navigation later if multi-step)
- `--no-interact`: skip field interaction (faster but no dropdown/typeahead detection)
- `--no-screenshots`: skip screenshots

**Timeout**: Give it 120-180s. Field interaction clicks each field sequentially.

### 4. Review the output

Three files generated in `reports/`:
- `<name>.json` — full structured data (fields, widgets, structure, meta)
- `<name>.md` — human-readable report with field table, details, raw HTML per field
- `<name>-adapter-skeleton.js` — V2 adapter template pre-filled with detect(), getFormRoot(), getFlow()

Key things to check:
- Field count matches what's visible on the page
- Labels are correct (not empty)
- Required fields marked correctly
- React-select / custom widgets detected
- Raw HTML containers captured

### 5. Validate with a fill script (optional)

Write a fill script like `fill-greenhouse.js` that:
1. Connects to `http://127.0.0.1:9222` via `chromium.connectOverCDP()`
2. Finds the tab by URL keyword
3. Fills each field using the selectors from the recon report

**Key patterns for filling Greenhouse-style React forms:**

```js
// Plain text input — use fill() + React event sync
await page.click(selector);
await page.fill(selector, value);
await page.evaluate((sel) => {
  const el = document.querySelector(sel);
  const tracker = el._valueTracker;
  if (tracker) tracker.setValue('');
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
}, selector);

// React-select dropdown — type + click option via Playwright locator
await page.click(selector);
await page.fill(selector, '');
await page.keyboard.type(searchText, { delay: 50 });
await page.waitForTimeout(1000);
// MUST use Playwright locator.click(), NOT page.evaluate(el.click())
// React-select listens for mouseDown, not click event
const option = page.locator('[class*="select__option"]').first();
await option.click({ timeout: 3000 });

// ALWAYS close dropdowns between fields
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
```

**Critical lesson**: `page.evaluate(() => el.click())` does NOT work on React-select options. React-select uses `onMouseDown`, and `evaluate` runs in page context without Playwright's full event chain. Always use `page.locator().click()` for React-select options.

### 6. Reload page between fill attempts

```js
const page = pages.find(p => p.url().includes('keyword'));
await page.reload({ waitUntil: 'networkidle' });
```

## CLI Quick Reference

```bash
# Scan (first time, safe mode)
node recon.js --url greenhouse --output greenhouse-recon --no-navigate

# Scan with multi-step navigation (Workday, Oracle)
node recon.js --url workday --output workday-recon

# Fast scan (no interaction, no screenshots)
node recon.js --url lever --output lever-recon --no-interact --no-screenshots

# Fill validation
node fill-greenhouse.js
```

## What the Recon Tool Captures Per Field
- tag, type, id, name, classes
- label (6 strategies: label[for], aria-label, aria-labelledby, parent label, sibling, text nodes)
- placeholder, required, aria-*, autocomplete, pattern
- CSS selector (unique path)
- options (for native `<select>`)
- data-* attributes
- raw HTML of container (up to 2000 chars)
- bounding rect (x, y, width, height)
- parent context (3 levels: tag, id, classes, role)
- interaction results: dropdown appeared (with options list), typeahead detected, validation errors on blur

---

## Batch Mode (Multi-Portal Scanning)

For scanning 15-25 portals of the same ATS to build comprehensive field maps and option registries.

### Quick Start

```bash
# 1. Create URL list (one URL per line)
# urls/ashby.txt, urls/lever.txt, etc.

# 2. Launch Chrome with debug port
"C:/Program Files/Google/Chrome/Application/chrome.exe" --remote-debugging-port=9222

# 3. Run batch scanner
node recon-batch.js --ats ashby --urls urls/ashby.txt
```

### CLI Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--ats <name>` | (required) | ATS platform name (e.g., ashby, lever) |
| `--urls <file>` | (required) | Path to URL list file |
| `--port <num>` | 9222 | Chrome debug port |
| `--delay <ms>` | 5000 | Delay between portals (avoids bot detection) |
| `--auth-pause` | off | Pause for manual login at each portal |
| `--no-interact` | off | Skip dropdown interaction (faster) |
| `--no-screenshots` | off | Skip screenshots |

### Output Structure

```
reports/{ats}/
  portal-001-{company}/
    scan.json              # Full field metadata
    scan.md                # Markdown summary
    screenshot-initial.png # Before Apply click
    screenshot-form.png    # After form loads
  portal-002-{company}/
    ...
  batch-summary.json       # Aggregated field frequency + option registry
```

### batch-summary.json

Pre-computes cross-portal aggregates:
- `fieldFrequency` — How often each field appears, required count, label variants
- `optionRegistry` — All unique option values per dropdown/radio field with counts
- `failedUrls` — URLs that failed to scan with error messages

### Claude Code Skills Pipeline

```
/recon-scan ashby      → Runs batch scanner, saves reports
/recon-analyze ashby   → Cross-portal analysis, writes {ats}-rules.md
/adapter-build ashby   → Generates adapter JS + LLM prompt from rules
```

### Auth-Required ATS Platforms

For portals needing login (OracleCloud, Workday, BambooHR, iCIMS, Taleo, ADP):

```bash
node recon-batch.js --ats oraclecloud --urls urls/oraclecloud.txt --auth-pause
```

The tool pauses at each portal with "Press Enter when ready..." — log in, navigate to the form, then press Enter.

---

## Validated Results (2026-03-14)

**Greenhouse** (IMC Systems Engineer application):
- 25 fields detected, 24/24 fillable fields filled successfully (1 skipped = file upload)
- React-select dropdowns: Country, Location, Start/End months, School, Degree, Discipline, custom questions, EEO
- All selectors, labels, types, required flags accurate
