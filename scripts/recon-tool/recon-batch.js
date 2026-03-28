/**
 * JAOS ATS Recon Tool — Batch Scanner
 *
 * Scans multiple job application portals for a single ATS platform.
 * Imports core functions from recon.js; orchestrates multi-URL scanning.
 *
 * USAGE:
 *   node recon-batch.js --ats ashby --urls urls/ashby.txt [--port 9222] [--no-interact] [--auth-pause] [--delay 5000]
 *
 * OUTPUT:
 *   reports/{ats}/
 *     portal-001-{company}/scan.json, scan.md, screenshot-*.png
 *     portal-002-{company}/...
 *     batch-summary.json
 */

const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const recon = require('./recon.js');

// ── CLI args ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(flag, defaultVal) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultVal;
}

const ATS_NAME = getArg('--ats', '');
const URLS_FILE = getArg('--urls', '');
const CDP_PORT = getArg('--port', '9222');
const DELAY_MS = parseInt(getArg('--delay', '5000'), 10);
const INTERACT = !args.includes('--no-interact');
const AUTH_PAUSE = args.includes('--auth-pause');
const TAKE_SCREENSHOTS = !args.includes('--no-screenshots');

if (!ATS_NAME || !URLS_FILE) {
  console.error('Usage: node recon-batch.js --ats <name> --urls <file> [--port 9222] [--delay 5000] [--auth-pause] [--no-interact] [--no-screenshots]');
  process.exit(1);
}

// ── Helpers ───────────────────────────────────────────────────────────

/** Read URL file — one URL per line, # comments, blank lines ignored */
function readUrlFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  return content
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'));
}

/** Extract company name from URL path */
function extractCompany(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    // Common patterns:
    //   jobs.ashbyhq.com/{company}/{jobId}
    //   boards.greenhouse.io/{company}/jobs/{id}
    //   jobs.lever.co/{company}/{id}
    //   {company}.wd5.myworkdayjobs.com/...
    //   fa-{company}-*.oraclecloud.com/...
    if (u.hostname.includes('myworkdayjobs.com')) {
      return u.hostname.split('.')[0];
    }
    if (u.hostname.includes('oraclecloud.com')) {
      const match = u.hostname.match(/^fa-([^-]+)/);
      return match ? match[1] : parts[0] || 'unknown';
    }
    return parts[0] || 'unknown';
  } catch {
    return 'unknown';
  }
}

/** Prompt user and wait for Enter (auth-pause mode) */
function waitForUser(message) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`\n⏸️  ${message}\n   Press Enter when ready... `, () => {
      rl.close();
      resolve();
    });
  });
}

/** Normalize a field label into a stable key for cross-portal grouping */
function normalizeFieldKey(field) {
  const raw = field.label || field.name || field.id || '';
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || `field_${field.index || 0}`;
}

/** Sleep helper */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── Scan a single page ────────────────────────────────────────────────

async function scanPage(page, outputDir, interact, screenshots) {
  const step = { label: 'Main Page', fields: [], interactionResults: [], widgets: [], structure: null };

  // Scan fields
  step.fields = await recon.scanFields(page);

  // Interact
  if (interact && step.fields.length > 0) {
    step.interactionResults = await recon.interactWithFields(page, step.fields);
  }

  // Custom widgets
  step.widgets = await recon.scanCustomWidgets(page);

  // Structure
  step.structure = await recon.analyzeFormStructure(page);

  // Screenshot
  if (screenshots) {
    const ssPath = path.join(outputDir, 'screenshot-form.png');
    await page.screenshot({ path: ssPath, fullPage: true });
  }

  return step;
}

// ── Click "Apply" button ──────────────────────────────────────────────

async function clickApplyButton(page) {
  const clicked = await page.evaluate(() => {
    const candidates = document.querySelectorAll('button, a, [role="button"], [role="tab"]');
    for (const el of candidates) {
      const text = (el.textContent || '').trim().toLowerCase();
      const isApply = /^(apply|apply\s*(now|for\s*this\s*job|for\s*this\s*position)?|start\s*application|begin\s*application|application)$/i.test(text);
      if (isApply) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          el.click();
          return text;
        }
      }
    }
    // Also check for Ashby application tab
    const ashbyTab = document.querySelector('.ashby-job-posting-right-pane-application-tab, [class*="application-tab"]');
    if (ashbyTab) {
      ashbyTab.click();
      return 'ashby-application-tab';
    }
    return null;
  });
  return clicked;
}

// ── Check if form fields are visible ──────────────────────────────────

async function hasFormFields(page, timeout = 10000) {
  try {
    await page.waitForSelector('input:not([type="hidden"]), select, textarea, [role="combobox"]', { timeout });
    return true;
  } catch {
    return false;
  }
}

// ── Main batch loop ───────────────────────────────────────────────────

async function main() {
  console.log(`\n🔍 JAOS Batch Recon — ATS: ${ATS_NAME}\n`);

  // Read URLs
  const urlsPath = path.resolve(URLS_FILE);
  if (!fs.existsSync(urlsPath)) {
    console.error(`❌ URL file not found: ${urlsPath}`);
    process.exit(1);
  }
  const urls = readUrlFile(urlsPath);
  console.log(`📋 Loaded ${urls.length} URLs from ${URLS_FILE}\n`);

  // Connect to Chrome
  let browser;
  try {
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
  } catch (e) {
    console.error('❌ Could not connect to Chrome.');
    console.error('   Make sure Chrome is running with: chrome.exe --remote-debugging-port=9222');
    process.exit(1);
  }
  console.log('✅ Connected to Chrome\n');

  // Prepare output directory
  const baseOutputDir = path.join(__dirname, 'reports', ATS_NAME);
  fs.mkdirSync(baseOutputDir, { recursive: true });

  // Results tracking
  const portalResults = [];
  const failedUrls = [];
  const fieldFrequency = {};
  const optionRegistry = {};

  // Get a page to work with
  const contexts = browser.contexts();
  let page = null;
  for (const ctx of contexts) {
    const pages = ctx.pages();
    if (pages.length > 0) {
      page = pages[0];
      break;
    }
  }
  if (!page) {
    console.error('❌ No browser pages found. Open at least one tab in Chrome.');
    process.exit(1);
  }

  // ── Scan each URL ──────────────────────────────────────────────────

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const company = extractCompany(url);
    const portalId = `portal-${String(i + 1).padStart(3, '0')}-${company}`;
    const portalDir = path.join(baseOutputDir, portalId);
    fs.mkdirSync(portalDir, { recursive: true });

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`[${i + 1}/${urls.length}] ${company} — ${url}`);
    console.log('═'.repeat(60));

    try {
      // Navigate
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(2000); // Let SPA render

      // Take initial screenshot
      if (TAKE_SCREENSHOTS) {
        await page.screenshot({ path: path.join(portalDir, 'screenshot-initial.png'), fullPage: true });
      }

      // Check for form fields — if none, try clicking Apply
      let hasFields = await hasFormFields(page, 5000);
      if (!hasFields) {
        console.log('   No form fields found — looking for Apply button...');
        const clicked = await clickApplyButton(page);
        if (clicked) {
          console.log(`   Clicked: "${clicked}"`);
          await sleep(3000); // Wait for form to render
          hasFields = await hasFormFields(page, 10000);
        }
      }

      // Auth-pause check — if still no fields and auth mode
      if (!hasFields && AUTH_PAUSE) {
        await waitForUser(`No form fields found on ${company}. Please log in / navigate to the form.`);
        hasFields = await hasFormFields(page, 15000);
      }

      if (!hasFields) {
        throw new Error('No form fields found after navigation + Apply click');
      }

      // Wait for DOM to settle (React hydration, etc.)
      await sleep(1500);

      // Detect ATS
      const atsInfo = await recon.detectATS(page);

      // Scan the page
      const step = await scanPage(page, portalDir, INTERACT, TAKE_SCREENSHOTS);

      // Detect frameworks
      const frameworks = await recon.detectFrameworks(page);

      // Build report
      const fields = step.fields.map((f, idx) => ({
        ...f,
        step: step.label,
        index: idx,
        interaction: step.interactionResults[idx] || null,
      }));

      const report = {
        meta: {
          url: page.url(),
          portalIndex: i + 1,
          company,
          timestamp: new Date().toISOString(),
          ats: atsInfo,
          frameworks,
          stepsScanned: [step.label],
        },
        structure: step.structure,
        fields,
        widgets: step.widgets,
      };

      // Save JSON + Markdown
      fs.writeFileSync(path.join(portalDir, 'scan.json'), JSON.stringify(report, null, 2));
      fs.writeFileSync(path.join(portalDir, 'scan.md'), recon.generateMarkdown(report));

      // Track results
      const portalInfo = {
        index: i + 1,
        directory: portalId,
        url,
        company,
        fieldCount: fields.length,
        requiredFieldCount: fields.filter(f => f.required).length,
        widgetTypes: [...new Set(step.widgets.map(w => w.type))],
        frameworks,
        status: 'success',
      };
      portalResults.push(portalInfo);

      console.log(`   ✅ ${fields.length} fields (${portalInfo.requiredFieldCount} required), ${step.widgets.length} widgets`);

      // ── Aggregate field frequency + option registry ──────────────────

      for (const field of fields) {
        const key = normalizeFieldKey(field);
        if (!fieldFrequency[key]) {
          fieldFrequency[key] = { count: 0, requiredCount: 0, type: field.type || field.tag, labels: [] };
        }
        fieldFrequency[key].count++;
        if (field.required) fieldFrequency[key].requiredCount++;
        const label = field.label || '';
        if (label && !fieldFrequency[key].labels.includes(label)) {
          fieldFrequency[key].labels.push(label);
        }

        // Collect options (from native selects, interaction results, etc.)
        const options = field.options || [];
        const interactionOpts = field.interaction?.dropdownOptions || [];
        const allOpts = [...options, ...interactionOpts];

        if (allOpts.length > 0) {
          if (!optionRegistry[key]) optionRegistry[key] = {};
          for (const opt of allOpts) {
            const optText = typeof opt === 'string' ? opt : (opt.text || opt.label || opt.value || '');
            if (optText && optText !== '--' && optText !== 'Select' && optText !== 'Select...') {
              optionRegistry[key][optText] = (optionRegistry[key][optText] || 0) + 1;
            }
          }
        }
      }

      // Also aggregate widget options
      for (const widget of step.widgets) {
        if (widget.options && widget.options.length > 0) {
          const key = normalizeFieldKey(widget);
          if (!optionRegistry[key]) optionRegistry[key] = {};
          for (const opt of widget.options) {
            const optText = typeof opt === 'string' ? opt : (opt.text || opt.label || '');
            if (optText) {
              optionRegistry[key][optText] = (optionRegistry[key][optText] || 0) + 1;
            }
          }
        }
      }

    } catch (err) {
      console.log(`   ❌ Failed: ${err.message.slice(0, 120)}`);
      failedUrls.push({ url, company, error: err.message.slice(0, 200) });
      portalResults.push({
        index: i + 1,
        directory: portalId,
        url,
        company,
        status: 'failed',
        error: err.message.slice(0, 200),
      });
    }

    // Delay between portals (avoid bot detection)
    if (i < urls.length - 1) {
      console.log(`   ⏳ Waiting ${DELAY_MS / 1000}s before next portal...`);
      await sleep(DELAY_MS);
    }
  }

  // ── Build batch summary ───────────────────────────────────────────

  const summary = {
    ats: ATS_NAME,
    scanDate: new Date().toISOString(),
    totalUrls: urls.length,
    successfulScans: portalResults.filter(p => p.status === 'success').length,
    failedUrls,
    portals: portalResults,
    fieldFrequency,
    optionRegistry,
  };

  const summaryPath = path.join(baseOutputDir, 'batch-summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

  // ── Print summary ─────────────────────────────────────────────────

  console.log(`\n${'═'.repeat(60)}`);
  console.log('BATCH SCAN COMPLETE');
  console.log('═'.repeat(60));
  console.log(`ATS:        ${ATS_NAME}`);
  console.log(`Scanned:    ${summary.successfulScans}/${summary.totalUrls} portals`);
  console.log(`Failed:     ${failedUrls.length}`);
  console.log(`Output:     ${baseOutputDir}`);
  console.log(`Summary:    ${summaryPath}`);

  if (failedUrls.length > 0) {
    console.log('\nFailed URLs:');
    for (const f of failedUrls) {
      console.log(`  ❌ ${f.company}: ${f.error.slice(0, 80)}`);
    }
  }

  // Field frequency top 10
  const sortedFields = Object.entries(fieldFrequency)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 15);
  console.log('\nTop fields by frequency:');
  for (const [key, info] of sortedFields) {
    const reqMark = info.requiredCount > 0 ? ` (required: ${info.requiredCount}/${info.count})` : '';
    console.log(`  ${info.count}x  ${key}${reqMark} — labels: ${info.labels.slice(0, 3).join(', ')}`);
  }

  // Option variance highlights
  const variantFields = Object.entries(optionRegistry)
    .filter(([, opts]) => Object.keys(opts).length >= 2)
    .sort((a, b) => Object.keys(b[1]).length - Object.keys(a[1]).length)
    .slice(0, 10);
  if (variantFields.length > 0) {
    console.log('\nFields with option variants:');
    for (const [key, opts] of variantFields) {
      const optList = Object.entries(opts).sort((a, b) => b[1] - a[1]).map(([t, c]) => `"${t}"(${c})`);
      console.log(`  ${key}: ${optList.slice(0, 6).join(', ')}${optList.length > 6 ? ` +${optList.length - 6} more` : ''}`);
    }
  }

  console.log('\n✅ Run `/recon-analyze ' + ATS_NAME + '` to analyze cross-portal patterns.\n');
}

// ── Run ───────────────────────────────────────────────────────────────
main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
