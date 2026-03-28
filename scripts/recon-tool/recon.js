/**
 * JAOS ATS Recon Tool
 *
 * Connects to your already-authenticated Chrome browser via CDP,
 * scans every form field on the page, interacts with each one,
 * and dumps a full field report for building V2 adapters.
 *
 * USAGE:
 *   1. Launch Chrome with: chrome.exe --remote-debugging-port=9222
 *   2. Log in to the ATS portal, navigate to the job, click "Apply"
 *   3. Run: node recon.js [--url <partial-url-match>] [--output <filename>] [--no-navigate] [--no-interact]
 *
 * The tool will:
 *   - Connect to your live Chrome session
 *   - Find the tab with the job application form
 *   - Scan all visible form fields (inputs, selects, textareas, radios, checkboxes)
 *   - Detect custom widgets (React-select, comboboxes, file uploads, etc.)
 *   - Record each field's: tag, type, id, name, classes, label, placeholder,
 *     aria attributes, required status, parent structure, options (for selects)
 *   - Try clicking dropdowns to discover hidden options
 *   - Take a screenshot of the form
 *   - Output a structured JSON + Markdown report
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
const URL_MATCH = getArg('--url', '');
const OUTPUT_NAME = getArg('--output', 'recon-report');
const CDP_PORT = getArg('--port', '9222');
const TAKE_SCREENSHOTS = !args.includes('--no-screenshots');
const INTERACT = !args.includes('--no-interact');

const OUTPUT_DIR = path.join(__dirname, 'reports');

async function main() {
  console.log('\n🔍 JAOS ATS Recon Tool\n');
  console.log(`Connecting to Chrome on port ${CDP_PORT}...`);

  let browser;
  try {
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
  } catch (e) {
    console.error('\n❌ Could not connect to Chrome.');
    console.error('   Make sure Chrome is running with: chrome.exe --remote-debugging-port=9222');
    console.error('   Error:', e.message);
    process.exit(1);
  }

  console.log('✅ Connected to Chrome\n');

  // Find the right page
  const contexts = browser.contexts();
  let targetPage = null;

  for (const ctx of contexts) {
    for (const page of ctx.pages()) {
      const url = page.url();
      if (URL_MATCH && !url.includes(URL_MATCH)) continue;
      // Skip chrome:// and extension pages
      if (url.startsWith('chrome://') || url.startsWith('chrome-extension://')) continue;
      targetPage = page;
      break;
    }
    if (targetPage) break;
  }

  if (!targetPage) {
    // If no match, list available pages
    console.log('Available tabs:');
    for (const ctx of contexts) {
      for (const page of ctx.pages()) {
        console.log(`  - ${page.url()}`);
      }
    }
    console.error(`\n❌ No tab found${URL_MATCH ? ` matching "${URL_MATCH}"` : ''}. Navigate to the application form first.`);
    process.exit(1);
  }

  console.log(`📄 Target page: ${targetPage.url()}\n`);

  // Bring page to front
  await targetPage.bringToFront();

  // --- Step 1: Detect ATS platform ---
  console.log('Step 1: Detecting ATS platform...');
  const atsInfo = await detectATS(targetPage);
  console.log(`   Platform: ${atsInfo.platform || 'Unknown'}`);
  console.log(`   Hostname: ${atsInfo.hostname}`);
  console.log(`   URL pattern: ${atsInfo.urlPattern}\n`);

  // --- Step 2: Take initial screenshot ---
  if (TAKE_SCREENSHOTS) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const ssPath = path.join(OUTPUT_DIR, `${OUTPUT_NAME}-initial.png`);
    await targetPage.screenshot({ path: ssPath, fullPage: true });
    console.log(`📸 Initial screenshot: ${ssPath}\n`);
  }

  // --- Scan current page (and iframes) ---
  const allSteps = [];
  let stepIndex = 0;

  async function scanCurrentPage(pageLike, stepLabel, isIframe = false) {
    const step = { label: stepLabel, isIframe, fields: [], interactionResults: [], widgets: [], structure: null };

    console.log(`\n── Step: ${stepLabel} ──`);

    // Scan fields
    console.log('   Scanning form fields...');
    step.fields = await scanFields(pageLike);
    console.log(`   Found ${step.fields.length} fields`);

    // Interact
    if (INTERACT && step.fields.length > 0) {
      console.log('   Interacting with fields...');
      step.interactionResults = await interactWithFields(pageLike, step.fields);
    }

    // Custom widgets
    console.log('   Scanning custom widgets...');
    step.widgets = await scanCustomWidgets(pageLike);
    console.log(`   Found ${step.widgets.length} custom widgets`);

    // Structure
    console.log('   Analyzing form structure...');
    step.structure = await analyzeFormStructure(pageLike);

    // Screenshot
    if (TAKE_SCREENSHOTS) {
      const ssPath = path.join(OUTPUT_DIR, `${OUTPUT_NAME}-step${stepIndex}.png`);
      if (isIframe) {
        // Can't screenshot just a frame easily; screenshot the whole page
        await targetPage.screenshot({ path: ssPath, fullPage: true });
      } else {
        await pageLike.screenshot({ path: ssPath, fullPage: true });
      }
      console.log(`   📸 Screenshot: ${ssPath}`);
    }

    stepIndex++;
    return step;
  }

  // --- Step 2: Scan main page ---
  const mainStep = await scanCurrentPage(targetPage, 'Main Page');
  allSteps.push(mainStep);

  // --- Step 3: Scan iframes ---
  console.log('\nStep 3: Checking for iframes...');
  const iframeInfo = await targetPage.evaluate(() => {
    return Array.from(document.querySelectorAll('iframe')).map(f => ({
      src: f.src || '',
      id: f.id || null,
      name: f.name || null,
      visible: f.getBoundingClientRect().width > 0 && f.getBoundingClientRect().height > 0,
    })).filter(f => f.visible && f.src && !f.src.startsWith('about:'));
  });

  for (const iframe of iframeInfo) {
    try {
      const frameName = iframe.name || iframe.id || iframe.src.slice(0, 60);
      console.log(`   Found iframe: ${frameName}`);
      const frame = targetPage.frame({ url: new RegExp(new URL(iframe.src).hostname.replace(/\./g, '\\.')) })
        || targetPage.frame({ name: iframe.name })
        || targetPage.frames().find(f => f.url().includes(new URL(iframe.src).hostname));
      if (frame) {
        const iframeStep = await scanCurrentPage(frame, `Iframe: ${frameName}`, true);
        if (iframeStep.fields.length > 0) {
          allSteps.push(iframeStep);
        }
      }
    } catch (e) {
      console.log(`   ⚠️ Could not access iframe: ${e.message.slice(0, 100)}`);
    }
  }
  if (iframeInfo.length === 0) console.log('   No iframes found');

  // --- Step 4: Multi-step navigation ---
  const MULTI_STEP = !args.includes('--no-navigate');
  if (MULTI_STEP) {
    console.log('\nStep 4: Checking for multi-step navigation...');
    let maxSteps = 10; // safety limit
    let navigated = true;

    while (navigated && maxSteps-- > 0) {
      navigated = false;

      // Look for "Next", "Continue", "Save and Continue" buttons
      const nextBtn = await targetPage.evaluate(() => {
        const candidates = document.querySelectorAll('button, [role="button"], input[type="submit"], a[class*="btn"]');
        for (const btn of candidates) {
          const text = btn.textContent.trim().toLowerCase();
          const automationId = (btn.getAttribute('data-automation-id') || '').toLowerCase();
          const isNext = /^(next|continue|save\s*(and|&)\s*continue|proceed|save\s*and\s*next)$/i.test(text)
            || automationId === 'bottom-navigation-next-button';
          if (isNext) {
            const rect = btn.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              return {
                selector: btn.id ? `#${btn.id}` :
                  btn.getAttribute('data-automation-id') ? `[data-automation-id="${btn.getAttribute('data-automation-id')}"]` :
                  null,
                text: btn.textContent.trim(),
              };
            }
          }
        }
        return null;
      });

      if (nextBtn && nextBtn.selector) {
        console.log(`   Found "${nextBtn.text}" button — clicking...`);
        try {
          await targetPage.click(nextBtn.selector, { timeout: 3000 });
          // Wait for page to settle (new fields to render)
          await targetPage.waitForTimeout(2000);

          // Check if new fields appeared
          const newStep = await scanCurrentPage(targetPage, `Page ${allSteps.length + 1} (after "${nextBtn.text}")`);
          if (newStep.fields.length > 0) {
            allSteps.push(newStep);
            navigated = true;
          }
        } catch (e) {
          console.log(`   ⚠️ Navigation failed: ${e.message.slice(0, 100)}`);
        }
      } else {
        // Also check for clickable tabs
        const tabs = await targetPage.evaluate(() => {
          const tabEls = document.querySelectorAll('[role="tab"]:not([aria-selected="true"]), [class*="step"]:not(.active):not([class*="complete"])');
          return Array.from(tabEls).map(t => ({
            text: t.textContent.trim(),
            selector: t.id ? `#${t.id}` : null,
          })).filter(t => t.selector && t.text);
        });

        for (const tab of tabs) {
          console.log(`   Found tab "${tab.text}" — clicking...`);
          try {
            await targetPage.click(tab.selector, { timeout: 3000 });
            await targetPage.waitForTimeout(1500);
            const tabStep = await scanCurrentPage(targetPage, `Tab: ${tab.text}`);
            if (tabStep.fields.length > 0) {
              allSteps.push(tabStep);
            }
          } catch (e) {
            console.log(`   ⚠️ Tab click failed: ${e.message.slice(0, 100)}`);
          }
        }
      }
    }
  }

  // --- Step 5: Detect frameworks ---
  console.log('\nStep 5: Detecting frameworks...');
  const frameworks = await detectFrameworks(targetPage);
  console.log(`   Frameworks: ${frameworks.join(', ') || 'None detected'}\n`);

  // --- Merge all steps into unified field list ---
  const allFields = [];
  const allWidgets = [];
  let mergedStructure = { sections: [], fieldsets: [], buttons: [], tabs: [], iframes: iframeInfo };

  for (const step of allSteps) {
    for (const f of step.fields) {
      f.step = step.label;
      f.index = allFields.length;
      allFields.push({ ...f, interaction: step.interactionResults[step.fields.indexOf(f)] || null });
    }
    allWidgets.push(...step.widgets.map(w => ({ ...w, step: step.label })));
    if (step.structure) {
      mergedStructure.sections.push(...step.structure.sections);
      mergedStructure.fieldsets.push(...step.structure.fieldsets);
      // Only add unique buttons (by text)
      for (const btn of step.structure.buttons) {
        if (!mergedStructure.buttons.find(b => b.text === btn.text)) {
          mergedStructure.buttons.push(btn);
        }
      }
      mergedStructure.tabs.push(...(step.structure.tabs || []));
    }
  }

  // --- Build report ---
  const report = {
    meta: {
      url: targetPage.url(),
      timestamp: new Date().toISOString(),
      ats: atsInfo,
      frameworks,
      stepsScanned: allSteps.map(s => s.label),
    },
    structure: mergedStructure,
    fields: allFields,
    widgets: allWidgets,
  };

  // Save JSON
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const jsonPath = path.join(OUTPUT_DIR, `${OUTPUT_NAME}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  console.log(`📋 JSON report: ${jsonPath}`);

  // Save Markdown summary
  const mdPath = path.join(OUTPUT_DIR, `${OUTPUT_NAME}.md`);
  fs.writeFileSync(mdPath, generateMarkdown(report));
  console.log(`📝 Markdown report: ${mdPath}`);

  // Save adapter skeleton
  const skeletonPath = path.join(OUTPUT_DIR, `${OUTPUT_NAME}-adapter-skeleton.js`);
  fs.writeFileSync(skeletonPath, generateAdapterSkeleton(report));
  console.log(`🔧 Adapter skeleton: ${skeletonPath}`);

  console.log('\n✅ Recon complete! Use the reports to build your V2 adapter.\n');

  // Don't close the browser — it's the user's session
}

// ============================================================
// ATS Detection
// ============================================================
async function detectATS(page) {
  const url = page.url();
  const hostname = new URL(url).hostname;

  const patterns = [
    { regex: /greenhouse\.io|boards\.greenhouse/i, name: 'Greenhouse' },
    { regex: /\.myworkdayjobs\.com/i, name: 'Workday' },
    { regex: /\.oraclecloud\.com/i, name: 'Oracle Cloud' },
    { regex: /lever\.co/i, name: 'Lever' },
    { regex: /\.icims\.com/i, name: 'iCIMS' },
    { regex: /bamboohr\.com/i, name: 'BambooHR' },
    { regex: /ashbyhq\.com/i, name: 'Ashby' },
    { regex: /smartrecruiters\.com/i, name: 'SmartRecruiters' },
    { regex: /jobvite\.com/i, name: 'Jobvite' },
    { regex: /ultipro\.com|ukg\.com/i, name: 'UKG' },
    { regex: /successfactors\.com|sap\.com.*career/i, name: 'SAP SuccessFactors' },
    { regex: /taleo\.net/i, name: 'Taleo' },
    { regex: /paycom\.com/i, name: 'Paycom' },
    { regex: /adp\.com/i, name: 'ADP' },
    { regex: /jazz\.co|applytojob\.com/i, name: 'JazzHR' },
  ];

  const match = patterns.find(p => p.regex.test(url));
  return {
    platform: match ? match.name : 'Unknown',
    hostname,
    urlPattern: url.replace(/[?#].*/, ''),
  };
}

// ============================================================
// Field Scanner
// ============================================================
async function scanFields(page) {
  return await page.evaluate(() => {
    const results = [];

    function getLabel(el) {
      // 1. <label for="id">
      if (el.id) {
        const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (label) return label.textContent.trim();
      }
      // 2. aria-label
      if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
      // 3. aria-labelledby
      const labelledBy = el.getAttribute('aria-labelledby');
      if (labelledBy) {
        const labelEl = document.getElementById(labelledBy);
        if (labelEl) return labelEl.textContent.trim();
      }
      // 4. Closest label ancestor
      const parentLabel = el.closest('label');
      if (parentLabel) return parentLabel.textContent.trim();
      // 5. Previous sibling label
      const prev = el.previousElementSibling;
      if (prev && prev.tagName === 'LABEL') return prev.textContent.trim();
      // 6. Parent's text content (for custom widgets)
      const parent = el.parentElement;
      if (parent) {
        const textNodes = Array.from(parent.childNodes)
          .filter(n => n.nodeType === 3 && n.textContent.trim())
          .map(n => n.textContent.trim());
        if (textNodes.length) return textNodes.join(' ');
      }
      return '';
    }

    function getSelector(el) {
      if (el.id) return `#${CSS.escape(el.id)}`;
      if (el.name) return `${el.tagName.toLowerCase()}[name="${CSS.escape(el.name)}"]`;
      // Build a path
      const parts = [];
      let current = el;
      while (current && current !== document.body) {
        let selector = current.tagName.toLowerCase();
        if (current.id) {
          selector = `#${CSS.escape(current.id)}`;
          parts.unshift(selector);
          break;
        }
        if (current.className && typeof current.className === 'string') {
          const cls = current.className.trim().split(/\s+/).slice(0, 2).map(c => `.${CSS.escape(c)}`).join('');
          selector += cls;
        }
        const parent = current.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children).filter(c => c.tagName === current.tagName);
          if (siblings.length > 1) {
            const idx = siblings.indexOf(current) + 1;
            selector += `:nth-of-type(${idx})`;
          }
        }
        parts.unshift(selector);
        current = current.parentElement;
      }
      return parts.join(' > ');
    }

    function isVisible(el) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return false;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      if (el.getAttribute('aria-hidden') === 'true') return false;
      return true;
    }

    function getOptions(el) {
      if (el.tagName === 'SELECT') {
        return Array.from(el.options).map(o => ({
          value: o.value,
          text: o.textContent.trim(),
          selected: o.selected,
        }));
      }
      return null;
    }

    function getParentContext(el, levels = 3) {
      const ctx = [];
      let current = el.parentElement;
      for (let i = 0; i < levels && current && current !== document.body; i++) {
        ctx.push({
          tag: current.tagName.toLowerCase(),
          id: current.id || null,
          classes: current.className && typeof current.className === 'string'
            ? current.className.trim().split(/\s+/).slice(0, 5)
            : [],
          role: current.getAttribute('role') || null,
        });
        current = current.parentElement;
      }
      return ctx;
    }

    // Scan standard form elements
    const formElements = document.querySelectorAll(
      'input, select, textarea, [role="combobox"], [role="listbox"], [role="radiogroup"], [role="checkbox"], [role="switch"], [contenteditable="true"]'
    );

    for (const el of formElements) {
      if (!isVisible(el)) continue;
      // Skip hidden/submit/button inputs
      const type = (el.getAttribute('type') || '').toLowerCase();
      if (['hidden', 'submit', 'button', 'image', 'reset'].includes(type)) continue;

      const field = {
        index: results.length,
        tag: el.tagName.toLowerCase(),
        type: type || el.getAttribute('role') || (el.tagName === 'SELECT' ? 'select' : el.tagName === 'TEXTAREA' ? 'textarea' : 'text'),
        id: el.id || null,
        name: el.name || null,
        classes: el.className && typeof el.className === 'string'
          ? el.className.trim().split(/\s+/).slice(0, 10)
          : [],
        label: getLabel(el),
        placeholder: el.placeholder || null,
        required: el.required || el.getAttribute('aria-required') === 'true',
        ariaLabel: el.getAttribute('aria-label') || null,
        ariaLabelledBy: el.getAttribute('aria-labelledby') || null,
        ariaDescribedBy: el.getAttribute('aria-describedby') || null,
        role: el.getAttribute('role') || null,
        autocomplete: el.getAttribute('autocomplete') || null,
        pattern: el.getAttribute('pattern') || null,
        value: el.value || '',
        options: getOptions(el),
        selector: getSelector(el),
        parentContext: getParentContext(el),
        rect: {
          x: Math.round(el.getBoundingClientRect().x),
          y: Math.round(el.getBoundingClientRect().y),
          w: Math.round(el.getBoundingClientRect().width),
          h: Math.round(el.getBoundingClientRect().height),
        },
        dataAttributes: {},
        rawHTML: '',
      };

      // Capture data-* attributes
      for (const attr of el.attributes) {
        if (attr.name.startsWith('data-')) {
          field.dataAttributes[attr.name] = attr.value;
        }
      }

      // Capture raw HTML of the field's container (for adapter building)
      const container = el.closest(
        '[class*="field"], [class*="form-group"], [class*="form-item"], ' +
        '[class*="input-wrapper"], [class*="form-row"], fieldset, ' +
        '[data-automation-id], [class*="fab-"], [class*="oj-"]'
      ) || el.parentElement;
      if (container) {
        field.rawHTML = container.outerHTML.slice(0, 2000);
      }

      results.push(field);
    }

    return results;
  });
}

// ============================================================
// Field Interaction — click/focus each field, observe behavior
// ============================================================
async function interactWithFields(page, fields) {
  const results = [];

  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    const result = {
      fieldIndex: i,
      label: field.label,
      clicked: false,
      dropdownAppeared: false,
      dropdownOptions: [],
      typeahead: false,
      errorsOnBlur: [],
      notes: [],
    };

    try {
      const el = await page.$(field.selector);
      if (!el) {
        result.notes.push('Element not found by selector');
        results.push(result);
        continue;
      }

      // Record DOM state before interaction
      const beforeHTML = await page.evaluate(() => document.body.innerHTML.length);

      // Click the field
      try {
        await el.click({ timeout: 2000 });
        result.clicked = true;
        await page.waitForTimeout(500);
      } catch (e) {
        result.notes.push(`Click failed: ${e.message.slice(0, 100)}`);
      }

      // Check if a dropdown/listbox appeared
      const dropdownInfo = await page.evaluate(() => {
        const listboxes = document.querySelectorAll(
          '[role="listbox"], [role="option"], .select-menu, .dropdown-menu, ' +
          '[class*="menu-list"], [class*="options"], [class*="dropdown"], ' +
          '[class*="listbox"], [class*="suggestions"], ul[class*="select"]'
        );
        const options = [];
        for (const lb of listboxes) {
          const style = getComputedStyle(lb);
          if (style.display === 'none' || style.visibility === 'hidden') continue;
          const items = lb.querySelectorAll('[role="option"], li, [class*="option"]');
          for (const item of items) {
            if (item.textContent.trim()) {
              options.push(item.textContent.trim().slice(0, 100));
            }
          }
        }
        return { found: options.length > 0, options: options.slice(0, 30) };
      });

      if (dropdownInfo.found) {
        result.dropdownAppeared = true;
        result.dropdownOptions = dropdownInfo.options;
      }

      // For text inputs, try typing to check for typeahead
      if (['text', '', 'search', 'combobox'].includes(field.type) && result.clicked) {
        try {
          await el.type('a', { delay: 50 });
          await page.waitForTimeout(800);

          const typeaheadInfo = await page.evaluate(() => {
            const suggestions = document.querySelectorAll(
              '[role="listbox"], [role="option"], [class*="suggestion"], ' +
              '[class*="autocomplete"], [class*="typeahead"], [class*="menu-list"]'
            );
            for (const s of suggestions) {
              const style = getComputedStyle(s);
              if (style.display !== 'none' && style.visibility !== 'hidden') {
                return true;
              }
            }
            return false;
          });

          if (typeaheadInfo) {
            result.typeahead = true;
            result.notes.push('Typeahead/autocomplete detected');
          }

          // Clear the typed character
          await el.fill('');
          await page.waitForTimeout(200);
        } catch (e) {
          result.notes.push(`Type test failed: ${e.message.slice(0, 100)}`);
        }
      }

      // Blur and check for validation errors
      try {
        await page.evaluate(sel => {
          const el = document.querySelector(sel);
          if (el) el.blur();
        }, field.selector);
        await page.waitForTimeout(300);

        const errors = await page.evaluate(sel => {
          const el = document.querySelector(sel);
          if (!el) return [];
          const parent = el.closest('[class*="field"], [class*="form-group"], [class*="input-wrapper"], div');
          if (!parent) return [];
          const errorEls = parent.querySelectorAll(
            '[class*="error"], [class*="invalid"], [role="alert"], .field-error, .validation-message'
          );
          return Array.from(errorEls).map(e => e.textContent.trim()).filter(Boolean);
        }, field.selector);

        if (errors.length) {
          result.errorsOnBlur = errors;
        }
      } catch (e) { /* ignore blur errors */ }

      // Check if DOM changed significantly (new elements added)
      const afterHTML = await page.evaluate(() => document.body.innerHTML.length);
      if (Math.abs(afterHTML - beforeHTML) > 500) {
        result.notes.push(`DOM changed significantly after interaction (+${afterHTML - beforeHTML} chars)`);
      }

      // Press Escape to close any open dropdowns
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);

    } catch (e) {
      result.notes.push(`Error: ${e.message.slice(0, 200)}`);
    }

    results.push(result);
    process.stdout.write(`   ${i + 1}/${fields.length} fields scanned\r`);
  }

  console.log('');
  return results;
}

// ============================================================
// Custom Widget Scanner
// ============================================================
async function scanCustomWidgets(page) {
  return await page.evaluate(() => {
    const widgets = [];

    // React-Select
    const reactSelects = document.querySelectorAll('[class*="react-select"], [class*="-container"][class*="select"]');
    for (const rs of reactSelects) {
      const style = getComputedStyle(rs);
      if (style.display === 'none') continue;
      widgets.push({
        type: 'react-select',
        selector: rs.id ? `#${rs.id}` : `[class="${rs.className.split(' ').slice(0, 2).join(' ')}"]`,
        classes: rs.className.split(/\s+/).slice(0, 10),
        hasValue: !!rs.querySelector('[class*="single-value"], [class*="multi-value"]'),
        placeholder: rs.querySelector('[class*="placeholder"]')?.textContent?.trim() || '',
      });
    }

    // File upload inputs
    const fileInputs = document.querySelectorAll('input[type="file"]');
    for (const fi of fileInputs) {
      const parent = fi.closest('[class*="upload"], [class*="file"], [class*="drop"]') || fi.parentElement;
      widgets.push({
        type: 'file-upload',
        selector: fi.id ? `#${fi.id}` : `input[type="file"][name="${fi.name || ''}"]`,
        accept: fi.accept || '*',
        multiple: fi.multiple,
        parentClasses: parent?.className?.split?.(/\s+/)?.slice(0, 5) || [],
        labelText: parent?.textContent?.trim()?.slice(0, 100) || '',
      });
    }

    // Custom comboboxes (not native select)
    const comboboxes = document.querySelectorAll('[role="combobox"]');
    for (const cb of comboboxes) {
      if (cb.tagName === 'SELECT' || cb.tagName === 'INPUT') continue;
      widgets.push({
        type: 'custom-combobox',
        selector: cb.id ? `#${cb.id}` : `[role="combobox"]`,
        classes: cb.className?.split?.(/\s+/)?.slice(0, 10) || [],
        ariaExpanded: cb.getAttribute('aria-expanded'),
        ariaOwns: cb.getAttribute('aria-owns'),
      });
    }

    // Radio groups
    const radioGroups = document.querySelectorAll('[role="radiogroup"]');
    for (const rg of radioGroups) {
      const options = Array.from(rg.querySelectorAll('[role="radio"], input[type="radio"]'));
      widgets.push({
        type: 'radio-group',
        selector: rg.id ? `#${rg.id}` : '[role="radiogroup"]',
        label: rg.getAttribute('aria-label') || '',
        options: options.map(o => ({
          value: o.value || o.getAttribute('data-value') || '',
          label: o.textContent?.trim() || o.getAttribute('aria-label') || '',
          checked: o.checked || o.getAttribute('aria-checked') === 'true',
        })),
      });
    }

    // Checkbox groups
    const checkboxGroups = document.querySelectorAll('fieldset:has(input[type="checkbox"]), [role="group"]:has([role="checkbox"])');
    for (const cg of checkboxGroups) {
      const legend = cg.querySelector('legend')?.textContent?.trim() || cg.getAttribute('aria-label') || '';
      const boxes = Array.from(cg.querySelectorAll('input[type="checkbox"], [role="checkbox"]'));
      widgets.push({
        type: 'checkbox-group',
        selector: cg.id ? `#${cg.id}` : 'fieldset',
        label: legend,
        options: boxes.map(b => ({
          value: b.value || '',
          label: b.closest('label')?.textContent?.trim() || b.getAttribute('aria-label') || '',
          checked: b.checked || b.getAttribute('aria-checked') === 'true',
        })),
      });
    }

    // Knockout.js cx-select (Oracle Cloud)
    const cxSelects = document.querySelectorAll('cx-select, [class*="cx-select"]');
    for (const cx of cxSelects) {
      widgets.push({
        type: 'cx-select',
        selector: cx.id ? `#${cx.id}` : 'cx-select',
        classes: cx.className?.split?.(/\s+/)?.slice(0, 5) || [],
      });
    }

    // Fabric UI (BambooHR)
    const fabSelects = document.querySelectorAll('[class*="fab-SelectToggle"], [class*="fab-Select"]');
    for (const fs of fabSelects) {
      widgets.push({
        type: 'fabric-select',
        selector: fs.id ? `#${fs.id}` : `[class*="fab-SelectToggle"]`,
        classes: fs.className?.split?.(/\s+/)?.slice(0, 5) || [],
      });
    }

    return widgets;
  });
}

// ============================================================
// Framework Detection
// ============================================================
async function detectFrameworks(page) {
  return await page.evaluate(() => {
    const found = [];

    // React
    const reactRoot = document.querySelector('[data-reactroot], #__next, #root');
    if (reactRoot || window.__REACT_DEVTOOLS_GLOBAL_HOOK__ || window.__NEXT_DATA__) {
      found.push('React');
      if (window.__NEXT_DATA__) found.push('Next.js');
    }

    // Angular
    if (document.querySelector('[ng-version], [ng-app], [data-ng-app]') || window.ng || window.angular) {
      found.push('Angular');
    }

    // Vue
    if (document.querySelector('[data-v-], #app.__vue') || window.__VUE__) {
      found.push('Vue');
    }

    // Knockout.js (Oracle)
    if (window.ko) found.push('Knockout.js');

    // jQuery
    if (window.jQuery || window.$?.fn?.jquery) found.push('jQuery');

    // Oracle JET
    if (window.oj || document.querySelector('[class^="oj-"]')) found.push('Oracle JET');

    // Workday
    if (document.querySelector('[data-automation-id]')) found.push('Workday Custom UI');

    // Material UI / MUI
    if (document.querySelector('[class*="MuiInput"], [class*="MuiTextField"]')) found.push('Material UI');

    // Fabric UI
    if (document.querySelector('[class*="fab-"]')) found.push('Fabric UI');

    return found;
  });
}

// ============================================================
// Form Structure Analysis
// ============================================================
async function analyzeFormStructure(page) {
  return await page.evaluate(() => {
    function isVisible(el) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return false;
      const style = getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    }

    // Sections (headings + fieldsets + aria landmarks)
    const sections = [];
    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, legend, [role="heading"]');
    for (const h of headings) {
      if (!isVisible(h)) continue;
      sections.push({
        tag: h.tagName.toLowerCase(),
        text: h.textContent.trim().slice(0, 100),
        level: h.tagName.match(/H(\d)/)?.[1] || h.getAttribute('aria-level') || '?',
      });
    }

    // Fieldsets
    const fieldsets = [];
    for (const fs of document.querySelectorAll('fieldset, [role="group"], [class*="section"]')) {
      if (!isVisible(fs)) continue;
      const legend = fs.querySelector('legend, [class*="header"], [class*="title"]');
      const fieldCount = fs.querySelectorAll('input, select, textarea').length;
      if (fieldCount === 0) continue;
      fieldsets.push({
        legend: legend?.textContent?.trim()?.slice(0, 100) || '',
        fieldCount,
        classes: fs.className?.split?.(/\s+/)?.slice(0, 5) || [],
      });
    }

    // Buttons (Next, Submit, Add, Save, etc.)
    const buttons = [];
    const btnEls = document.querySelectorAll('button, [role="button"], input[type="submit"], a[class*="btn"]');
    for (const btn of btnEls) {
      if (!isVisible(btn)) continue;
      const text = btn.textContent.trim().slice(0, 50);
      if (!text) continue;
      buttons.push({
        tag: btn.tagName.toLowerCase(),
        text,
        type: btn.type || '',
        classes: btn.className?.split?.(/\s+/)?.slice(0, 5) || [],
        id: btn.id || null,
        dataAutomationId: btn.getAttribute('data-automation-id') || null,
      });
    }

    // Tabs / steps
    const tabs = [];
    const tabEls = document.querySelectorAll('[role="tab"], [class*="step"], [class*="tab-item"]');
    for (const tab of tabEls) {
      if (!isVisible(tab)) continue;
      tabs.push({
        text: tab.textContent.trim().slice(0, 50),
        selected: tab.getAttribute('aria-selected') === 'true' || tab.classList.contains('active'),
        classes: tab.className?.split?.(/\s+/)?.slice(0, 5) || [],
      });
    }

    // Iframes
    const iframes = Array.from(document.querySelectorAll('iframe')).map(f => ({
      src: f.src || '',
      id: f.id || null,
      name: f.name || null,
    }));

    return { sections, fieldsets, buttons, tabs, iframes };
  });
}

// ============================================================
// Markdown Report Generator
// ============================================================
function generateMarkdown(report) {
  const lines = [];
  const { meta, structure, fields, widgets } = report;

  lines.push(`# ATS Recon Report — ${meta.ats.platform || 'Unknown ATS'}`);
  lines.push('');
  lines.push(`- **URL**: ${meta.url}`);
  lines.push(`- **Hostname**: ${meta.ats.hostname}`);
  lines.push(`- **Scanned**: ${meta.timestamp}`);
  lines.push(`- **Frameworks**: ${meta.frameworks.join(', ') || 'None detected'}`);
  lines.push('');

  // Structure
  lines.push('## Form Structure');
  lines.push('');
  if (structure.tabs.length) {
    lines.push('### Tabs / Steps');
    for (const tab of structure.tabs) {
      lines.push(`- ${tab.selected ? '**[Active]** ' : ''}${tab.text}`);
    }
    lines.push('');
  }
  if (structure.sections.length) {
    lines.push('### Sections');
    for (const s of structure.sections) {
      lines.push(`- \`<${s.tag}>\` ${s.text}`);
    }
    lines.push('');
  }
  if (structure.buttons.length) {
    lines.push('### Buttons');
    for (const b of structure.buttons) {
      lines.push(`- **${b.text}** (\`${b.tag}\`${b.type ? ` type="${b.type}"` : ''}${b.dataAutomationId ? ` data-automation-id="${b.dataAutomationId}"` : ''})${b.classes.length ? ` — classes: \`${b.classes.join(' ')}\`` : ''}`);
    }
    lines.push('');
  }
  if (structure.iframes.length) {
    lines.push('### Iframes');
    for (const f of structure.iframes) {
      lines.push(`- id="${f.id || ''}" name="${f.name || ''}" src="${f.src.slice(0, 100)}"`);
    }
    lines.push('');
  }

  // Steps scanned
  if (report.meta.stepsScanned && report.meta.stepsScanned.length > 1) {
    lines.push('### Steps Scanned');
    for (const s of report.meta.stepsScanned) {
      lines.push(`- ${s}`);
    }
    lines.push('');
  }

  // Fields table
  lines.push('## Fields');
  lines.push('');
  lines.push('| # | Step | Label | Type | Required | ID / Name | Selector |');
  lines.push('|---|------|-------|------|----------|-----------|----------|');
  for (const f of fields) {
    const idName = f.id || f.name || '-';
    lines.push(`| ${f.index} | ${(f.step || 'Main').slice(0, 20)} | ${f.label.slice(0, 40) || '-'} | ${f.type} | ${f.required ? 'YES' : 'no'} | \`${idName}\` | \`${f.selector.slice(0, 60)}\` |`);
  }
  lines.push('');

  // Field details
  lines.push('## Field Details');
  lines.push('');
  for (const f of fields) {
    lines.push(`### Field ${f.index}: ${f.label || '(no label)'}`);
    lines.push('');
    lines.push(`- **Type**: ${f.type}`);
    lines.push(`- **Tag**: \`<${f.tag}>\``);
    if (f.id) lines.push(`- **ID**: \`${f.id}\``);
    if (f.name) lines.push(`- **Name**: \`${f.name}\``);
    if (f.placeholder) lines.push(`- **Placeholder**: "${f.placeholder}"`);
    lines.push(`- **Required**: ${f.required ? 'YES' : 'no'}`);
    if (f.ariaLabel) lines.push(`- **aria-label**: "${f.ariaLabel}"`);
    if (f.ariaDescribedBy) lines.push(`- **aria-describedby**: \`${f.ariaDescribedBy}\``);
    if (f.autocomplete) lines.push(`- **autocomplete**: \`${f.autocomplete}\``);
    if (f.pattern) lines.push(`- **pattern**: \`${f.pattern}\``);
    if (f.classes.length) lines.push(`- **Classes**: \`${f.classes.join(' ')}\``);
    lines.push(`- **Selector**: \`${f.selector}\``);

    if (f.options) {
      lines.push(`- **Options** (${f.options.length}):`);
      for (const o of f.options.slice(0, 20)) {
        lines.push(`  - \`${o.value}\` → "${o.text}"`);
      }
      if (f.options.length > 20) lines.push(`  - ... and ${f.options.length - 20} more`);
    }

    if (Object.keys(f.dataAttributes).length) {
      lines.push(`- **Data attributes**:`);
      for (const [k, v] of Object.entries(f.dataAttributes)) {
        lines.push(`  - \`${k}\` = "${v.slice(0, 80)}"`);
      }
    }

    if (f.interaction) {
      const ix = f.interaction;
      if (ix.dropdownAppeared) {
        lines.push(`- **Dropdown appeared**: YES (${ix.dropdownOptions.length} options)`);
        for (const o of ix.dropdownOptions.slice(0, 15)) {
          lines.push(`  - "${o}"`);
        }
        if (ix.dropdownOptions.length > 15) lines.push(`  - ... and ${ix.dropdownOptions.length - 15} more`);
      }
      if (ix.typeahead) lines.push(`- **Typeahead/autocomplete**: YES`);
      if (ix.errorsOnBlur.length) {
        lines.push(`- **Validation errors on blur**: ${ix.errorsOnBlur.join(', ')}`);
      }
      if (ix.notes.length) {
        for (const note of ix.notes) {
          lines.push(`- **Note**: ${note}`);
        }
      }
    }

    // Parent context
    if (f.parentContext.length) {
      lines.push(`- **Parent chain**: ${f.parentContext.map(p => `\`${p.tag}${p.id ? '#' + p.id : ''}${p.role ? '[role=' + p.role + ']' : ''}\``).join(' → ')}`);
    }

    // Raw HTML
    if (f.rawHTML) {
      lines.push('<details>');
      lines.push('<summary>Raw HTML (container)</summary>');
      lines.push('');
      lines.push('```html');
      lines.push(f.rawHTML);
      lines.push('```');
      lines.push('</details>');
    }

    lines.push('');
  }

  // Custom widgets
  if (widgets.length) {
    lines.push('## Custom Widgets');
    lines.push('');
    for (const w of widgets) {
      lines.push(`### ${w.type}`);
      lines.push(`- **Selector**: \`${w.selector}\``);
      for (const [k, v] of Object.entries(w)) {
        if (k === 'type' || k === 'selector') continue;
        lines.push(`- **${k}**: ${JSON.stringify(v)}`);
      }
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('*Generated by JAOS ATS Recon Tool*');

  return lines.join('\n');
}

// ============================================================
// Run
// ============================================================
// ============================================================
// Adapter Skeleton Generator
// ============================================================
function generateAdapterSkeleton(report) {
  const { meta, structure, fields, widgets } = report;
  const platform = meta.ats.platform || 'Unknown';
  const platformLower = platform.toLowerCase().replace(/[\s.]+/g, '');
  const platformConst = platform.toUpperCase().replace(/[\s.]+/g, '_');
  const hostname = meta.ats.hostname;

  // Detect custom widget types present
  const widgetTypes = [...new Set(widgets.map(w => w.type))];
  const hasReactSelect = widgetTypes.includes('react-select');
  const hasFileUpload = widgetTypes.includes('file-upload');
  const hasCxSelect = widgetTypes.includes('cx-select');
  const hasFabricSelect = widgetTypes.includes('fabric-select');
  const hasRadioGroups = widgetTypes.includes('radio-group');
  const hasTypeahead = fields.some(f => f.interaction?.typeahead);

  // Detect steps
  const steps = meta.stepsScanned || ['Main Page'];
  const hasMultiStep = steps.length > 1;

  // Find form root candidates from structure
  const formRootCandidates = structure.fieldsets
    .filter(fs => fs.fieldCount > 2)
    .map(fs => fs.classes.join('.'))
    .slice(0, 3);

  // Find navigation buttons
  const nextBtns = structure.buttons.filter(b =>
    /next|continue|save.*continue|proceed/i.test(b.text)
  );
  const submitBtns = structure.buttons.filter(b =>
    /submit|apply|send/i.test(b.text)
  );

  // Build the skeleton
  const lines = [];
  lines.push(`/**`);
  lines.push(` * adapters/${platformLower}-v2.js — ${platform} ATS adapter (v2 architecture)`);
  lines.push(` *`);
  lines.push(` * AUTO-GENERATED by JAOS Recon Tool on ${meta.timestamp}`);
  lines.push(` * Source URL: ${meta.url}`);
  lines.push(` * Frameworks detected: ${meta.frameworks.join(', ') || 'None'}`);
  lines.push(` * Fields found: ${fields.length}`);
  lines.push(` * Custom widgets: ${widgetTypes.join(', ') || 'None'}`);
  lines.push(` *`);
  lines.push(` * TODO: Review and customize this skeleton before use.`);
  lines.push(` */`);
  lines.push(`(function () {`);
  lines.push(`  const registry = (window.__jaosAtsAdaptersV2 = window.__jaosAtsAdaptersV2 || []);`);
  lines.push(``);
  lines.push(`  // ── Detection ──────────────────────────────────────────────────────`);
  lines.push(``);

  // Build hostname regex from actual hostname
  const hostParts = hostname.split('.');
  const hostRegex = hostParts.length >= 2
    ? hostParts.slice(-2).join('\\.').replace(/\./g, '\\.')
    : hostname.replace(/\./g, '\\.');
  lines.push(`  const ${platformConst}_HOSTNAME = /${hostRegex}/i;`);
  lines.push(``);

  // Form field pattern (if any name patterns detected)
  const namePatterns = [...new Set(fields.filter(f => f.name).map(f => {
    const match = f.name.match(/^([a-zA-Z_]+)\[/);
    return match ? match[1] : null;
  }).filter(Boolean))];
  if (namePatterns.length) {
    lines.push(`  // Field naming convention detected: ${namePatterns.join(', ')}`);
    lines.push(`  const ${platformConst}_FIELD_PATTERN = '${namePatterns.map(p => `input[name^="${p}["]`).join(', ')}';`);
    lines.push(``);
  }

  lines.push(`  const FORM_FIELD_CHECK = 'input:not([type="hidden"]), select, textarea';`);
  lines.push(``);
  lines.push(`  const detect = () => {`);
  lines.push(`    if (${platformConst}_HOSTNAME.test(window.location.hostname)) return true;`);
  if (namePatterns.length) {
    lines.push(`    if (document.querySelector(${platformConst}_FIELD_PATTERN)) return true;`);
  }
  lines.push(`    // TODO: Add additional detection signals (DOM markers, meta tags, etc.)`);
  lines.push(`    return false;`);
  lines.push(`  };`);
  lines.push(``);

  // getFormRoot
  lines.push(`  // ── Form root discovery ────────────────────────────────────────────`);
  lines.push(``);
  lines.push(`  const getFormRoot = () => {`);
  if (formRootCandidates.length) {
    lines.push(`    // Candidates found by recon:`);
    for (const cls of formRootCandidates) {
      lines.push(`    //   .${cls}`);
    }
  }
  lines.push(`    const candidates = [`);
  lines.push(`      document.querySelector('form'),`);
  lines.push(`      document.querySelector('[role="main"]'),`);
  lines.push(`      document.querySelector('#app, #root, #main'),`);
  lines.push(`    ];`);
  lines.push(`    for (const el of candidates) {`);
  lines.push(`      if (el && el.querySelector(FORM_FIELD_CHECK)) return el;`);
  lines.push(`    }`);
  lines.push(`    return document.body;`);
  lines.push(`  };`);
  lines.push(``);

  // Quirks section
  lines.push(`  // ── ${platform}-specific quirks ─────────────────────────────────────`);
  lines.push(``);

  if (meta.frameworks.includes('React') || meta.frameworks.includes('Next.js')) {
    lines.push(`  // React detected — values need event sync after setting`);
    lines.push(`  const triggerReactSync = (el) => {`);
    lines.push(`    const tracker = el._valueTracker;`);
    lines.push(`    if (tracker) tracker.setValue('');`);
    lines.push(`    el.dispatchEvent(new Event('input', { bubbles: true }));`);
    lines.push(`    el.dispatchEvent(new Event('change', { bubbles: true }));`);
    lines.push(`  };`);
    lines.push(``);
  }

  if (meta.frameworks.includes('Knockout.js') || meta.frameworks.includes('Oracle JET')) {
    lines.push(`  // Knockout.js / Oracle JET detected — use keyboard events for cx-select`);
    lines.push(`  // TODO: Implement fillCxSelect() helper — see oraclecloud-v2.js for reference`);
    lines.push(``);
  }

  if (meta.frameworks.includes('Fabric UI')) {
    lines.push(`  // Fabric UI detected — fab-SelectToggle needs Enter key to open`);
    lines.push(`  // TODO: Implement fillFabSelect() helper — see bamboohr-v2.js for reference`);
    lines.push(``);
  }

  // getFlow
  lines.push(`  // ── Flow definition ─────────────────────────────────────────────────`);
  lines.push(``);
  lines.push(`  const getFlow = (profile) => {`);
  lines.push(`    const steps = [];`);
  lines.push(``);

  if (hasMultiStep) {
    for (let i = 0; i < steps.length; i++) {
      const stepLabel = steps[i];
      const isLast = i === steps.length - 1;
      lines.push(`    // Step ${i}: ${stepLabel}`);
      lines.push(`    steps.push({`);
      lines.push(`      id: 'step-${i}',`);
      lines.push(`      label: '${stepLabel.replace(/'/g, "\\'")}',`);
      lines.push(`      waitFor: () => {`);
      lines.push(`        // TODO: Return true when this step's fields are visible`);
      lines.push(`        return document.querySelector(FORM_FIELD_CHECK) !== null;`);
      lines.push(`      },`);
      lines.push(`      action: async (ctx) => {`);
      lines.push(`        // Scanner + LLM mapper handle field detection and filling`);
      lines.push(`        // Add step-specific overrides here if needed`);
      lines.push(`      },`);
      lines.push(`      getFormRoot,`);
      if (!isLast && nextBtns.length) {
        const btn = nextBtns[0];
        const btnSel = btn.dataAutomationId
          ? `[data-automation-id="${btn.dataAutomationId}"]`
          : btn.id ? `#${btn.id}` : `button`;
        lines.push(`      advance: async () => {`);
        lines.push(`        // Click "${btn.text}" to go to next step`);
        lines.push(`        const btn = document.querySelector('${btnSel}');`);
        lines.push(`        if (btn) btn.click();`);
        lines.push(`      },`);
      }
      lines.push(`    });`);
      lines.push(``);
    }
  } else {
    lines.push(`    // Single-page form`);
    lines.push(`    steps.push({`);
    lines.push(`      id: 'main',`);
    lines.push(`      label: 'Application Form',`);
    lines.push(`      waitFor: () => document.querySelector(FORM_FIELD_CHECK) !== null,`);
    lines.push(`      action: async (ctx) => {`);
    lines.push(`        // Scanner + LLM mapper handle field detection and filling`);
    lines.push(`      },`);
    lines.push(`      getFormRoot,`);

    if (hasReactSelect) {
      lines.push(`      augmentScan: (scanResult) => {`);
      lines.push(`        // React-select widgets detected — enrich scan with options`);
      lines.push(`        // TODO: Use fiber bridge to read options from React state`);
      lines.push(`        return scanResult;`);
      lines.push(`      },`);
    }

    if (hasTypeahead) {
      lines.push(`      afterFill: async (formRoot) => {`);
      lines.push(`        // Typeahead/autocomplete fields detected — click suggestions after fill`);
      lines.push(`        // TODO: Implement autocomplete handler`);
      lines.push(`      },`);
    }

    lines.push(`    });`);
  }

  lines.push(``);
  lines.push(`    return steps;`);
  lines.push(`  };`);
  lines.push(``);

  // Registration
  lines.push(`  // ── Register ────────────────────────────────────────────────────────`);
  lines.push(``);
  lines.push(`  registry.push({`);
  lines.push(`    name: '${platformLower}',`);
  lines.push(`    detect,`);
  lines.push(`    getFormRoot,`);
  lines.push(`    getFlow,`);
  lines.push(`    shouldOverwrite: () => false,`);
  lines.push(`  });`);
  lines.push(`})();`);
  lines.push(``);
  lines.push(`// ── Recon Summary ──────────────────────────────────────────────────`);
  lines.push(`// Fields: ${fields.length}`);
  lines.push(`// Required: ${fields.filter(f => f.required).length}`);
  lines.push(`// Widgets: ${widgetTypes.join(', ') || 'None'}`);
  lines.push(`// Frameworks: ${meta.frameworks.join(', ') || 'None'}`);
  lines.push(`// Steps: ${steps.join(', ')}`);

  if (hasFileUpload) {
    lines.push(`// NOTE: File upload inputs detected — implement resume upload handler`);
  }
  if (hasRadioGroups) {
    lines.push(`// NOTE: Radio groups detected — may need LLM prompt hints for yes/no questions`);
  }

  return lines.join('\n');
}

// ============================================================
// Module exports (for recon-batch.js)
// ============================================================
module.exports = {
  detectATS,
  scanFields,
  interactWithFields,
  scanCustomWidgets,
  detectFrameworks,
  analyzeFormStructure,
  generateMarkdown,
  generateAdapterSkeleton,
};

// ============================================================
// Run (only when executed directly, not when imported)
// ============================================================
if (require.main === module) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
