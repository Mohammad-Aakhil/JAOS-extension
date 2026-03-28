/**
 * JAOS Spot-Check Tool
 *
 * Deep behavioral testing on a single ATS portal. Connects to Chrome via CDP,
 * catalogs all interactive elements, then runs behavioral tests on each widget
 * type to discover how they work (click behavior, dropdown rendering,
 * conditional fields, etc.).
 *
 * USAGE:
 *   1. Launch Chrome with: chrome.exe --remote-debugging-port=9222
 *   2. Navigate to the job posting or application page
 *   3. Run: node spot-check.js --url <full-url> [--port 9222]
 *
 * OUTPUT:
 *   - reports/spot-check-{company}.json  — full structured report
 *   - reports/spot-check-{company}.md    — human-readable summary
 *   - reports/screenshot-before.png      — form before interaction
 *   - reports/screenshot-after.png       — form after all tests
 */

const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

// --- CLI args ---
const args = process.argv.slice(2);
function getArg(flag, defaultVal) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultVal;
}
const TARGET_URL = getArg('--url', '');
const CDP_PORT = getArg('--port', '9222');

if (!TARGET_URL) {
  console.error('Usage: node spot-check.js --url <full-url> [--port 9222]');
  process.exit(1);
}

const OUTPUT_DIR = path.join(__dirname, 'reports');

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n--- JAOS Spot-Check Tool ---\n');
  console.log(`Target URL: ${TARGET_URL}`);
  console.log(`Connecting to Chrome on port ${CDP_PORT}...`);

  // --- Connect via CDP ---
  let browser;
  try {
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
  } catch (e) {
    console.error('\nCould not connect to Chrome.');
    console.error('Make sure Chrome is running with: chrome.exe --remote-debugging-port=9222');
    console.error('Error:', e.message);
    process.exit(1);
  }
  console.log('Connected to Chrome\n');

  // --- Find or navigate to the target page ---
  let page = null;
  for (const ctx of browser.contexts()) {
    for (const p of ctx.pages()) {
      const url = p.url();
      if (url.startsWith('chrome://') || url.startsWith('chrome-extension://')) continue;
      if (url.includes(TARGET_URL) || TARGET_URL.includes(new URL(url).hostname)) {
        page = p;
        break;
      }
    }
    if (page) break;
  }

  // If no matching tab, use ANY tab and navigate to the URL
  if (!page) {
    for (const ctx of browser.contexts()) {
      for (const p of ctx.pages()) {
        page = p;
        break;
      }
      if (page) break;
    }
  }

  if (!page) {
    // Last resort: create a new page
    const ctx = browser.contexts()[0];
    if (ctx) {
      page = await ctx.newPage();
    } else {
      console.error('No usable browser tab found.');
      process.exit(1);
    }
  }

  await page.bringToFront();

  // Navigate to URL if not already there
  if (!page.url().includes(new URL(TARGET_URL).pathname)) {
    console.log(`Navigating to ${TARGET_URL}...`);
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  }
  console.log(`Page: ${page.url()}\n`);

  // --- Step 1: If it's a job posting, try to find the application form ---
  console.log('Step 1: Checking if we need to navigate to application form...');
  const navigated = await tryNavigateToApplication(page);
  if (navigated) {
    console.log('  Navigated to application form');
  } else {
    console.log('  Already on form or no navigation needed');
  }

  // --- Step 2: Wait for form elements ---
  console.log('\nStep 2: Waiting for form elements...');
  try {
    await page.waitForSelector('input, select, textarea', { timeout: 15000 });
    // Extra wait for React/framework hydration
    await page.waitForTimeout(2000);
    console.log('  Form elements detected');
  } catch {
    console.error('  No form elements found after 15s. Is this an application page?');
    process.exit(1);
  }

  // --- Step 3: Take "before" screenshot ---
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(OUTPUT_DIR, 'screenshot-before.png'), fullPage: true });
  console.log('  Screenshot: screenshot-before.png');

  // --- Step 4: Catalog all interactive elements ---
  console.log('\nStep 3: Cataloging interactive elements...');
  const catalog = await catalogElements(page);
  console.log(`  Text fields: ${catalog.textFields.length}`);
  console.log(`  Radio groups: ${Object.keys(catalog.radioGroups).length}`);
  console.log(`  Checkboxes: ${catalog.checkboxes.length}`);
  console.log(`  Selects: ${catalog.selects.length}`);
  console.log(`  Textareas: ${catalog.textareas.length}`);
  console.log(`  File inputs: ${catalog.fileInputs.length}`);
  console.log(`  Comboboxes: ${catalog.comboboxes.length}`);
  console.log(`  Yes/No buttons: ${catalog.yesNoButtons.length}`);

  // --- Step 5: Behavioral tests ---
  console.log('\nStep 4: Running behavioral tests...');
  const results = {
    yesNoButtons: [],
    comboboxes: [],
    radioGroups: [],
    fileInputs: [],
    conditionalFields: [],
  };

  // Snapshot visible fields before tests
  const fieldsBefore = await snapshotVisibleFields(page);

  // 5a. Yes/No button tests
  for (const btn of catalog.yesNoButtons) {
    try {
      console.log(`  [Yes/No] Testing: ${btn.label}`);
      const result = await testYesNoButton(page, btn, fieldsBefore);
      results.yesNoButtons.push(result);
    } catch (e) {
      console.log(`    Error: ${e.message.slice(0, 100)}`);
      results.yesNoButtons.push({ ...btn, type: 'yesno-button', clickBehavior: 'error', error: e.message });
    }
    await resetState(page);
  }

  // 5b. Combobox tests
  for (const cb of catalog.comboboxes) {
    try {
      console.log(`  [Combobox] Testing: ${cb.label}`);
      const result = await testCombobox(page, cb);
      results.comboboxes.push(result);
    } catch (e) {
      console.log(`    Error: ${e.message.slice(0, 100)}`);
      results.comboboxes.push({ ...cb, type: 'combobox', error: e.message });
    }
    await resetState(page);
  }

  // 5c. Radio group tests
  for (const [name, group] of Object.entries(catalog.radioGroups)) {
    try {
      console.log(`  [Radio] Testing group: ${name}`);
      const result = await testRadioGroup(page, name, group, fieldsBefore);
      results.radioGroups.push(result);
    } catch (e) {
      console.log(`    Error: ${e.message.slice(0, 100)}`);
      results.radioGroups.push({ type: 'radio-group', name, error: e.message });
    }
    await resetState(page);
  }

  // 5d. File input tests
  for (const fi of catalog.fileInputs) {
    try {
      console.log(`  [File] Testing: ${fi.contextLabel}`);
      const result = testFileInput(fi);
      results.fileInputs.push(result);
    } catch (e) {
      console.log(`    Error: ${e.message.slice(0, 100)}`);
      results.fileInputs.push({ type: 'file', purpose: 'error', error: e.message });
    }
  }

  // --- Step 6: Take "after" screenshot ---
  await page.screenshot({ path: path.join(OUTPUT_DIR, 'screenshot-after.png'), fullPage: true });
  console.log('\n  Screenshot: screenshot-after.png');

  // --- Step 7: Generate report ---
  console.log('\nStep 5: Generating report...');
  const company = extractCompany(TARGET_URL);
  const adapterHints = generateAdapterHints(results);
  const report = buildReport(TARGET_URL, company, catalog, results, adapterHints);

  const jsonPath = path.join(OUTPUT_DIR, `spot-check-${company}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  console.log(`  JSON: ${jsonPath}`);

  const mdPath = path.join(OUTPUT_DIR, `spot-check-${company}.md`);
  fs.writeFileSync(mdPath, buildMarkdown(report));
  console.log(`  Markdown: ${mdPath}`);

  console.log('\n--- Spot-check complete ---\n');
  console.log(`Adapter hints:`);
  for (const hint of adapterHints) {
    console.log(`  - ${hint}`);
  }
  console.log('');
}

// ─── Navigation ──────────────────────────────────────────────────────────────

async function tryNavigateToApplication(page) {
  const url = page.url();
  // Already on application path
  if (/\/application/i.test(url) || /\/apply/i.test(url)) return false;

  // Strategy 1: Navigate directly to /application URL (works for Ashby, Greenhouse)
  try {
    const appUrl = url.replace(/\/?$/, '/application');
    console.log(`  Trying direct navigation: ${appUrl}`);
    await page.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2000);
    // Check if form fields appeared
    const hasFields = await page.evaluate(() =>
      document.querySelectorAll('input:not([type="hidden"]), select, textarea').length > 0
    );
    if (hasFields) return true;
  } catch (e) {
    console.log(`  Direct navigation failed: ${e.message.substring(0, 60)}`);
  }

  // Strategy 2: Click an "Apply" or "Application" tab/button
  const clicked = await page.evaluate(() => {
    const candidates = document.querySelectorAll('a, button, [role="tab"], [role="link"]');
    for (const el of candidates) {
      const text = (el.textContent || '').trim().toLowerCase();
      if (text === 'apply' || text === 'apply now' || text === 'application' || text === 'apply for this job') {
        el.click();
        return true;
      }
    }
    return false;
  });

  if (clicked) {
    await page.waitForTimeout(3000);
    return true;
  }
  return false;
}

// ─── Element Catalog ─────────────────────────────────────────────────────────

async function catalogElements(page) {
  return await page.evaluate(() => {
    const vis = (el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== 'none';
    };

    const getLabel = (el) => {
      // aria-label
      if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
      // associated <label>
      if (el.id) {
        const lbl = document.querySelector(`label[for="${el.id}"]`);
        if (lbl) return lbl.textContent.trim();
      }
      // aria-labelledby
      const lblBy = el.getAttribute('aria-labelledby');
      if (lblBy) {
        const lblEl = document.getElementById(lblBy);
        if (lblEl) return lblEl.textContent.trim();
      }
      // parent label
      const parentLabel = el.closest('label');
      if (parentLabel) return parentLabel.textContent.trim();
      // placeholder
      if (el.placeholder) return el.placeholder;
      // preceding sibling or parent text
      const parent = el.closest('[class*="field"], [class*="form-group"], [class*="question"]');
      if (parent) {
        const lbl2 = parent.querySelector('label, legend, [class*="label"]');
        if (lbl2) return lbl2.textContent.trim();
      }
      return '';
    };

    // Text fields
    const textFields = [];
    for (const el of document.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input[type="url"], input[type="number"], input:not([type])')) {
      if (!vis(el)) continue;
      textFields.push({
        tag: 'input', inputType: el.type || 'text',
        id: el.id, name: el.name,
        label: getLabel(el), placeholder: el.placeholder || '',
        required: el.required || el.getAttribute('aria-required') === 'true',
      });
    }

    // Radio buttons — group by name
    const radioGroups = {};
    for (const el of document.querySelectorAll('input[type="radio"]')) {
      const name = el.name || el.id || 'unnamed';
      if (!radioGroups[name]) radioGroups[name] = { options: [], fieldsetLabel: '' };
      const label = getLabel(el);
      radioGroups[name].options.push({ value: el.value, label, checked: el.checked });
      // Fieldset legend
      const fieldset = el.closest('fieldset');
      if (fieldset) {
        const legend = fieldset.querySelector('legend');
        if (legend) radioGroups[name].fieldsetLabel = legend.textContent.trim();
      }
    }

    // Checkboxes
    const checkboxes = [];
    for (const el of document.querySelectorAll('input[type="checkbox"]')) {
      checkboxes.push({
        id: el.id, name: el.name,
        label: getLabel(el), checked: el.checked,
        hidden: el.tabIndex === -1 || !vis(el),
      });
    }

    // Selects
    const selects = [];
    for (const el of document.querySelectorAll('select')) {
      if (!vis(el)) continue;
      const options = Array.from(el.options).map(o => ({ value: o.value, text: o.textContent.trim() }));
      selects.push({
        id: el.id, name: el.name,
        label: getLabel(el), required: el.required,
        optionCount: options.length, options,
      });
    }

    // Textareas
    const textareas = [];
    for (const el of document.querySelectorAll('textarea')) {
      if (!vis(el)) continue;
      textareas.push({
        id: el.id, name: el.name,
        label: getLabel(el), required: el.required,
      });
    }

    // File inputs
    const fileInputs = [];
    for (const el of document.querySelectorAll('input[type="file"]')) {
      const parent = el.closest('[class*="field"], [class*="upload"], [class*="resume"], [class*="autofill"]');
      const contextLabel = parent ? (parent.textContent || '').trim().slice(0, 120) : '';
      const isAutofillPane = !!el.closest('[class*="autofill-pane"], [class*="autofill_pane"], .ashby-application-form-autofill-pane');
      const isResume = /resume|cv/i.test(contextLabel) || /resume|cv/i.test(el.id) || /resume|cv/i.test(el.name);
      const isCoverLetter = /cover.?letter/i.test(contextLabel);
      fileInputs.push({
        id: el.id, name: el.name,
        contextLabel,
        hidden: !vis(el),
        accept: el.accept || '',
        isAutofillPane, isResume, isCoverLetter,
      });
    }

    // Comboboxes
    const comboboxes = [];
    for (const el of document.querySelectorAll('[role="combobox"]')) {
      if (!vis(el)) continue;
      comboboxes.push({
        id: el.id,
        label: getLabel(el),
        selector: el.id ? `#${el.id}` : `[role="combobox"]`,
        hasInput: !!el.querySelector('input') || el.tagName === 'INPUT',
        ariaExpanded: el.getAttribute('aria-expanded'),
        ariaControls: el.getAttribute('aria-controls') || '',
      });
    }

    // Yes/No button pairs
    const yesNoButtons = [];
    const containers = document.querySelectorAll('[class*="field"], [class*="question"], fieldset, [class*="form-group"], [role="group"]');
    for (const container of containers) {
      const buttons = Array.from(container.querySelectorAll('button'));
      const yesBtn = buttons.find(b => /^yes$/i.test(b.textContent.trim()));
      const noBtn = buttons.find(b => /^no$/i.test(b.textContent.trim()));
      if (yesBtn && noBtn) {
        const label = getLabel(container) || (() => {
          const lbl = container.querySelector('label, legend, [class*="label"]');
          return lbl ? lbl.textContent.trim() : '';
        })();
        // Build a unique selector path for the yes button
        const yesId = yesBtn.id ? `#${yesBtn.id}` : null;
        const noId = noBtn.id ? `#${noBtn.id}` : null;
        yesNoButtons.push({
          label: typeof label === 'string' ? label : '',
          yesSelector: yesId,
          noSelector: noId,
          containerIndex: Array.from(containers).indexOf(container),
          yesBtnText: yesBtn.textContent.trim(),
          noBtnText: noBtn.textContent.trim(),
          yesClasses: yesBtn.className,
          noClasses: noBtn.className,
        });
      }
    }

    return { textFields, radioGroups, checkboxes, selects, textareas, fileInputs, comboboxes, yesNoButtons };
  });
}

// ─── Visible Fields Snapshot ─────────────────────────────────────────────────

async function snapshotVisibleFields(page) {
  return await page.evaluate(() => {
    const fields = [];
    for (const el of document.querySelectorAll('input, select, textarea, [role="combobox"]')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        fields.push({
          tag: el.tagName, type: el.type || '',
          id: el.id, name: el.name || '',
          label: el.getAttribute('aria-label') || el.placeholder || '',
        });
      }
    }
    return fields;
  });
}

// ─── Behavioral Tests ────────────────────────────────────────────────────────

// Yes/No Button test
async function testYesNoButton(page, btn, fieldsBefore) {
  // Find the yes button
  let yesLocator;
  if (btn.yesSelector) {
    yesLocator = page.locator(btn.yesSelector);
  } else {
    // Fallback: find by text within containers
    yesLocator = page.locator('button:has-text("Yes")').nth(btn.containerIndex || 0);
  }

  // Capture classes before click
  const classesBefore = await page.evaluate((sel) => {
    const el = sel ? document.querySelector(sel) : null;
    return el ? el.className : '';
  }, btn.yesSelector);

  // Click Yes
  await yesLocator.click();
  await page.waitForTimeout(500);

  // Check CSS class change
  const classesAfter = await page.evaluate((sel) => {
    const el = sel ? document.querySelector(sel) : null;
    return el ? el.className : '';
  }, btn.yesSelector);
  const cssChanged = classesBefore !== classesAfter;
  const hasActiveClass = /selected|active|pressed|checked/i.test(classesAfter);

  // Check if a hidden checkbox synced
  const checkboxSynced = await page.evaluate((label) => {
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    for (const cb of checkboxes) {
      if (cb.checked) {
        // Check if it's near the button group
        const parent = cb.closest('[class*="field"], [class*="question"], fieldset, [role="group"]');
        if (parent && parent.textContent.includes(label.slice(0, 30))) return true;
      }
    }
    return false;
  }, btn.label);

  // Check for conditional fields (new fields that appeared)
  const fieldsAfter = await snapshotVisibleFields(page);
  const newFields = fieldsAfter.filter(f =>
    !fieldsBefore.some(fb => fb.id === f.id && fb.name === f.name && fb.tag === f.tag)
  );

  // Determine click behavior
  let clickBehavior = 'unknown';
  if (cssChanged && hasActiveClass) clickBehavior = 'css-class-toggle';
  else if (checkboxSynced) clickBehavior = 'checkbox-sync';
  else if (cssChanged) clickBehavior = 'css-class-toggle';

  // Reset: click No to deselect
  if (btn.noSelector) {
    try { await page.locator(btn.noSelector).click(); } catch {}
  }
  await page.waitForTimeout(300);

  const result = {
    type: 'yesno-button',
    label: btn.label,
    clickBehavior,
    cssClassChanged: cssChanged,
    hasActiveClass,
    checkboxSynced,
    conditionalFields: newFields.map(f => ({
      tag: f.tag, type: f.type, id: f.id, name: f.name, label: f.label,
    })),
  };

  if (newFields.length > 0) {
    console.log(`    -> ${newFields.length} conditional field(s) appeared`);
  }
  console.log(`    -> Behavior: ${clickBehavior}`);
  return result;
}

// Combobox test
async function testCombobox(page, cb) {
  const selector = cb.selector || `[role="combobox"]`;
  const locator = page.locator(selector).first();

  // Click to focus
  await locator.click();
  await page.waitForTimeout(500);

  // Check if dropdown appeared on click
  const opensOnClick = await page.evaluate(() => {
    return !!(
      document.querySelector('[role="listbox"]') ||
      document.querySelector('[role="option"]') ||
      document.querySelector('[data-floating-ui-portal]')
    );
  });

  // Check listbox location
  let listboxLocation = 'not-found';
  if (opensOnClick) {
    listboxLocation = await page.evaluate((cbId) => {
      const portal = document.querySelector('[data-floating-ui-portal]');
      if (portal && portal.querySelector('[role="listbox"], [role="option"]')) return 'portal';
      // Check if listbox is inside the combobox container
      const cbEl = cbId ? document.getElementById(cbId) : document.querySelector('[role="combobox"]');
      if (cbEl) {
        const parent = cbEl.closest('[class*="field"], [class*="select"], [class*="dropdown"]');
        if (parent && parent.querySelector('[role="listbox"]')) return 'inline';
      }
      if (document.querySelector('[role="listbox"]')) return 'inline';
      return 'not-found';
    }, cb.id);
  }

  // Press Escape, then try typing
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await locator.click();
  await page.waitForTimeout(200);

  // Type test characters
  await page.keyboard.type('tes', { delay: 100 });
  await page.waitForTimeout(500);

  const opensOnType = await page.evaluate(() => {
    return !!(
      document.querySelector('[role="listbox"]') ||
      document.querySelector('[role="option"]') ||
      document.querySelector('[data-floating-ui-portal]')
    );
  });

  // Count filtered options
  const filteredOptionCount = await page.evaluate(() => {
    const options = document.querySelectorAll('[role="option"]');
    return options.length;
  });

  // Try to determine select method
  let selectMethod = 'unknown';
  if (filteredOptionCount > 0) {
    // If there are visible options, likely click-option or enter-key
    selectMethod = 'click-option';
  }

  // Clean up: Escape and clear
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  // Triple-click to select all then delete
  await locator.click({ clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(200);

  const result = {
    type: 'combobox',
    label: cb.label,
    id: cb.id,
    opensOnClick,
    opensOnType,
    listboxLocation,
    selectMethod,
    filteredOptionCount,
  };
  console.log(`    -> Opens on click: ${opensOnClick}, type: ${opensOnType}, listbox: ${listboxLocation}`);
  return result;
}

// Radio group test
async function testRadioGroup(page, name, group, fieldsBefore) {
  const eeoKeywords = /race|ethnicity|gender|sex|veteran|disability|demographic|eeo|equal.?opportunity/i;
  const isEEO = eeoKeywords.test(group.fieldsetLabel) || group.options.some(o => eeoKeywords.test(o.label));

  // Click first radio
  let clicked = false;
  const radioLocator = page.locator(`input[type="radio"][name="${name}"]`).first();
  try {
    await radioLocator.click({ force: true });
    await page.waitForTimeout(300);
    clicked = true;
  } catch {
    // Radio might be hidden, try clicking its label
    try {
      const labelLocator = page.locator(`label[for="${group.options[0]?.value || name}"]`).first();
      await labelLocator.click();
      await page.waitForTimeout(300);
      clicked = true;
    } catch {}
  }

  // Verify checked state
  const isChecked = await page.evaluate((radioName) => {
    const radio = document.querySelector(`input[type="radio"][name="${radioName}"]`);
    return radio ? radio.checked : false;
  }, name);

  // Check for conditional fields
  const fieldsAfter = await snapshotVisibleFields(page);
  const newFields = fieldsAfter.filter(f =>
    !fieldsBefore.some(fb => fb.id === f.id && fb.name === f.name && fb.tag === f.tag)
  );

  if (newFields.length > 0) {
    console.log(`    -> ${newFields.length} conditional field(s) appeared`);
  }

  const result = {
    type: 'radio-group',
    name,
    questionLabel: group.fieldsetLabel,
    options: group.options.map(o => o.label || o.value),
    optionCount: group.options.length,
    isEEO,
    clickable: clicked,
    verified: isChecked,
    conditionalFields: newFields.map(f => ({
      tag: f.tag, type: f.type, id: f.id, label: f.label,
    })),
  };
  console.log(`    -> EEO: ${isEEO}, options: ${group.options.length}, verified: ${isChecked}`);
  return result;
}

// File input test (no clicking needed)
function testFileInput(fi) {
  let purpose = 'other';
  if (fi.isAutofillPane) purpose = 'autofill-pane';
  else if (fi.isResume) purpose = 'resume';
  else if (fi.isCoverLetter) purpose = 'cover-letter';

  return {
    type: 'file',
    id: fi.id,
    purpose,
    hidden: fi.hidden,
    acceptTypes: fi.accept,
    contextLabel: fi.contextLabel.slice(0, 80),
  };
}

// ─── State Reset ─────────────────────────────────────────────────────────────

async function resetState(page) {
  try {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    // Click an empty area to deselect
    await page.mouse.click(10, 10);
    await page.waitForTimeout(200);
  } catch {}
}

// ─── Report Generation ───────────────────────────────────────────────────────

function extractCompany(url) {
  try {
    const hostname = new URL(url).hostname;
    // Try patterns like jobs.ashbyhq.com/company or company.greenhouse.io
    const pathMatch = new URL(url).pathname.split('/').filter(Boolean)[0];
    const hostParts = hostname.split('.');
    if (hostParts.length >= 3 && hostParts[0] !== 'www') return hostParts[0];
    if (pathMatch) return pathMatch;
    return hostParts[0];
  } catch {
    return 'unknown';
  }
}

function generateAdapterHints(results) {
  const hints = [];

  // Yes/No button hints
  for (const btn of results.yesNoButtons) {
    if (btn.clickBehavior === 'css-class-toggle') {
      hints.push(`Yes/No button "${btn.label.slice(0, 50)}" uses CSS class toggle -- click the button element directly, do NOT set a hidden checkbox`);
    } else if (btn.clickBehavior === 'checkbox-sync') {
      hints.push(`Yes/No button "${btn.label.slice(0, 50)}" syncs with a hidden checkbox -- either click button or set checkbox`);
    }
    if (btn.conditionalFields?.length > 0) {
      const fieldNames = btn.conditionalFields.map(f => f.label || f.id || f.name).join(', ');
      hints.push(`Clicking Yes on "${btn.label.slice(0, 50)}" reveals conditional fields: ${fieldNames} -- use MutationObserver to wait for them`);
    }
  }

  // Combobox hints
  for (const cb of results.comboboxes) {
    if (cb.listboxLocation === 'portal') {
      hints.push(`Combobox "${cb.label}" renders listbox in a floating portal -- search for options via [data-floating-ui-portal] [role="option"], not inside the combobox container`);
    } else if (cb.listboxLocation === 'inline') {
      hints.push(`Combobox "${cb.label}" renders listbox inline -- search for [role="option"] within the parent container`);
    }
    if (cb.opensOnType && !cb.opensOnClick) {
      hints.push(`Combobox "${cb.label}" opens on typing, not on click -- type to trigger dropdown, then click option`);
    }
    if (cb.opensOnClick) {
      hints.push(`Combobox "${cb.label}" opens on click -- click to open, then type to filter and click option`);
    }
  }

  // Radio group hints
  const eeoGroups = results.radioGroups.filter(r => r.isEEO);
  if (eeoGroups.length > 0) {
    hints.push(`${eeoGroups.length} EEO/demographic radio group(s) found -- consider skipping or using default/decline values`);
  }
  for (const rg of results.radioGroups) {
    if (rg.conditionalFields?.length > 0) {
      hints.push(`Radio group "${rg.questionLabel || rg.name}" triggers conditional fields -- scan for new fields after selection`);
    }
  }

  // File input hints
  const autofillPanes = results.fileInputs.filter(f => f.purpose === 'autofill-pane');
  if (autofillPanes.length > 0) {
    hints.push(`${autofillPanes.length} file input(s) in autofill pane -- skip these, they are for ATS profile import, not resume upload`);
  }
  const resumeInputs = results.fileInputs.filter(f => f.purpose === 'resume');
  if (resumeInputs.length > 0) {
    hints.push(`Resume file input found (id="${resumeInputs[0].id}") -- use DataTransfer API to upload, accept: "${resumeInputs[0].acceptTypes}"`);
  }

  if (hints.length === 0) {
    hints.push('No special widget handling detected -- standard form fill should work');
  }

  return hints;
}

function buildReport(url, company, catalog, results, adapterHints) {
  return {
    url,
    company,
    timestamp: new Date().toISOString(),
    summary: {
      textFields: catalog.textFields.length,
      radioGroups: Object.keys(catalog.radioGroups).length,
      checkboxes: catalog.checkboxes.length,
      selects: catalog.selects.length,
      textareas: catalog.textareas.length,
      yesNoButtons: catalog.yesNoButtons.length,
      comboboxes: catalog.comboboxes.length,
      fileInputs: catalog.fileInputs.length,
      conditionalFields:
        results.yesNoButtons.reduce((n, b) => n + (b.conditionalFields?.length || 0), 0) +
        results.radioGroups.reduce((n, r) => n + (r.conditionalFields?.length || 0), 0),
    },
    widgets: [
      ...results.yesNoButtons,
      ...results.comboboxes,
    ],
    radioGroups: results.radioGroups,
    fileInputs: results.fileInputs,
    conditionalFields: [
      ...results.yesNoButtons
        .filter(b => b.conditionalFields?.length > 0)
        .map(b => ({ trigger: `${b.label} = Yes`, newFields: b.conditionalFields })),
      ...results.radioGroups
        .filter(r => r.conditionalFields?.length > 0)
        .map(r => ({ trigger: `${r.questionLabel || r.name} = first option`, newFields: r.conditionalFields })),
    ],
    catalog: {
      textFields: catalog.textFields,
      selects: catalog.selects,
      checkboxes: catalog.checkboxes,
      textareas: catalog.textareas,
    },
    adapterHints,
  };
}

function buildMarkdown(report) {
  const lines = [];
  lines.push(`# Spot-Check Report: ${report.company}`);
  lines.push('');
  lines.push(`**URL:** ${report.url}`);
  lines.push(`**Timestamp:** ${report.timestamp}`);
  lines.push('');

  // Summary table
  lines.push('## Summary');
  lines.push('');
  lines.push('| Widget Type | Count |');
  lines.push('|---|---|');
  for (const [key, val] of Object.entries(report.summary)) {
    lines.push(`| ${key} | ${val} |`);
  }
  lines.push('');

  // Widgets table
  if (report.widgets.length > 0) {
    lines.push('## Widgets (Yes/No Buttons + Comboboxes)');
    lines.push('');
    lines.push('| Type | Label | Behavior / Rendering | Conditional Fields |');
    lines.push('|---|---|---|---|');
    for (const w of report.widgets) {
      if (w.type === 'yesno-button') {
        const cond = w.conditionalFields?.length || 0;
        lines.push(`| Yes/No | ${w.label.slice(0, 50)} | ${w.clickBehavior} | ${cond} |`);
      } else if (w.type === 'combobox') {
        lines.push(`| Combobox | ${w.label.slice(0, 50)} | listbox: ${w.listboxLocation}, click: ${w.opensOnClick} | - |`);
      }
    }
    lines.push('');
  }

  // Radio groups
  if (report.radioGroups.length > 0) {
    lines.push('## Radio Groups');
    lines.push('');
    lines.push('| Name | Question | Options | EEO | Conditional |');
    lines.push('|---|---|---|---|---|');
    for (const rg of report.radioGroups) {
      const opts = (rg.options || []).join(', ').slice(0, 60);
      const cond = rg.conditionalFields?.length || 0;
      lines.push(`| ${rg.name} | ${(rg.questionLabel || '').slice(0, 40)} | ${opts} | ${rg.isEEO ? 'Yes' : 'No'} | ${cond} |`);
    }
    lines.push('');
  }

  // File inputs
  if (report.fileInputs.length > 0) {
    lines.push('## File Inputs');
    lines.push('');
    lines.push('| Purpose | ID | Accept | Hidden |');
    lines.push('|---|---|---|---|');
    for (const fi of report.fileInputs) {
      lines.push(`| ${fi.purpose} | ${fi.id || '-'} | ${fi.acceptTypes || '*'} | ${fi.hidden} |`);
    }
    lines.push('');
  }

  // Conditional fields
  if (report.conditionalFields.length > 0) {
    lines.push('## Conditional Fields');
    lines.push('');
    for (const cf of report.conditionalFields) {
      lines.push(`- **Trigger:** ${cf.trigger}`);
      for (const f of cf.newFields) {
        lines.push(`  - ${f.tag} ${f.type ? `[${f.type}]` : ''} — ${f.label || f.id || f.name || 'unlabeled'}`);
      }
    }
    lines.push('');
  }

  // Adapter hints
  lines.push('## Adapter Hints');
  lines.push('');
  for (const hint of report.adapterHints) {
    lines.push(`- ${hint}`);
  }
  lines.push('');

  return lines.join('\n');
}

// ─── Entry Point ─────────────────────────────────────────────────────────────

main().catch(e => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});
