/**
 * Greenhouse Fill Validation Script (v2 — fixed)
 *
 * Connects to debug Chrome and fills ALL fields with mock data.
 * Properly handles react-select dropdowns, Escape to close, and React event sync.
 *
 * Usage: node fill-greenhouse.js
 */

const { chromium } = require('playwright-core');

const MOCK = {
  firstName: 'John',
  lastName: 'Doe',
  preferredName: 'Johnny',
  email: 'john.doe.test@example.com',
  phone: '5551234567',
  company: 'Acme Corp',
  title: 'Software Engineer',
  startMonth: 'January',
  startYear: '2020',
  endMonth: 'December',
  endYear: '2024',
  school: 'Massachusetts',
  degree: "Bachelor",
  discipline: 'Computer',
  eduStartYear: '2016',
  eduEndYear: '2020',
};

async function main() {
  console.log('\n🧪 Greenhouse Fill Validation (v2)\n');

  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  console.log('✅ Connected\n');

  const pages = browser.contexts().flatMap(c => c.pages());
  const page = pages.find(p => p.url().includes('greenhouse'));
  if (!page) { console.error('❌ No Greenhouse tab found'); process.exit(1); }

  await page.bringToFront();
  let filled = 0;
  let failed = 0;

  // Close any open dropdowns first
  async function closeDropdowns() {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }

  // Fill a plain text/number input with React event sync
  async function fillInput(id, value, label) {
    try {
      await closeDropdowns();
      const selector = `#${CSS.escape(id)}`;
      await page.click(selector, { timeout: 3000 });
      await page.waitForTimeout(200);
      // Triple-click to select all existing text, then type over it
      await page.click(selector, { clickCount: 3, timeout: 2000 });
      await page.keyboard.type(value, { delay: 30 });
      // React sync via evaluate
      await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return;
        const tracker = el._valueTracker;
        if (tracker) tracker.setValue('');
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
      }, selector);
      await page.waitForTimeout(200);
      console.log(`   ✅ [${label}] = "${value}"`);
      filled++;
    } catch (e) {
      console.log(`   ❌ [${label}] failed: ${e.message.slice(0, 100)}`);
      failed++;
    }
  }

  // Fill a react-select dropdown: click → type → wait for options → mouseDown first match
  async function fillReactSelect(id, searchText, label) {
    try {
      await closeDropdowns();
      const selector = `#${CSS.escape(id)}`;

      // Click the input to open
      await page.click(selector, { timeout: 3000 });
      await page.waitForTimeout(400);

      // Clear any existing value and type search
      await page.fill(selector, '');
      await page.waitForTimeout(200);
      await page.keyboard.type(searchText, { delay: 50 });
      await page.waitForTimeout(1000);

      // Use Playwright's locator to find and click the first visible option
      // React-select options use mouseDown, not click — Playwright's .click() dispatches full event chain
      const optionLocator = page.locator('[class*="select__option"]').first();
      const optionCount = await page.locator('[class*="select__option"]').count();

      if (optionCount > 0) {
        const text = await optionLocator.textContent();
        await optionLocator.click({ timeout: 3000 });
        console.log(`   ✅ [${label}] = "${text.trim()}"`);
        filled++;
      } else {
        // Fallback: try [role="option"]
        const roleOptionCount = await page.locator('[role="option"]').count();
        if (roleOptionCount > 0) {
          const opt = page.locator('[role="option"]').first();
          const text = await opt.textContent();
          await opt.click({ timeout: 3000 });
          console.log(`   ✅ [${label}] = "${text.trim()}"`);
          filled++;
        } else {
          console.log(`   ⚠️ [${label}] no option found for "${searchText}"`);
          failed++;
        }
      }
      await page.waitForTimeout(400);
    } catch (e) {
      console.log(`   ❌ [${label}] failed: ${e.message.slice(0, 100)}`);
      failed++;
    }
  }

  // Check a checkbox
  async function fillCheckbox(id, label) {
    try {
      await closeDropdowns();
      const selector = `#${CSS.escape(id)}`;
      const checked = await page.isChecked(selector);
      if (!checked) await page.check(selector, { timeout: 3000 });
      console.log(`   ✅ [${label}] = checked`);
      filled++;
    } catch (e) {
      console.log(`   ❌ [${label}] failed: ${e.message.slice(0, 100)}`);
      failed++;
    }
  }

  // ─── FILL ALL FIELDS ─────────────────────────────────────────────

  console.log('── Personal Info ──');
  await fillInput('first_name', MOCK.firstName, 'First Name');
  await fillInput('last_name', MOCK.lastName, 'Last Name');
  await fillInput('preferred_name', MOCK.preferredName, 'Preferred First Name');
  await fillInput('email', MOCK.email, 'Email');

  console.log('\n── Phone ──');
  await fillReactSelect('country', 'United States', 'Country');
  await fillInput('phone', MOCK.phone, 'Phone');

  console.log('\n── Location ──');
  await fillReactSelect('candidate-location', 'Chicago', 'Location (City)');

  console.log('\n── Resume ──');
  console.log('   ⏭️ [Resume] skipped (file upload)');

  console.log('\n── Work Experience ──');
  await fillInput('company-name-0', MOCK.company, 'Company Name');
  await fillInput('title-0', MOCK.title, 'Title');
  await fillReactSelect('start-date-month-0', MOCK.startMonth, 'Start Month');
  await fillInput('start-date-year-0', MOCK.startYear, 'Start Year');
  await fillReactSelect('end-date-month-0', MOCK.endMonth, 'End Month');
  await fillInput('end-date-year-0', MOCK.endYear, 'End Year');
  await fillCheckbox('current-role-0_1', 'Current Role');

  console.log('\n── Education ──');
  await fillReactSelect('school--0', MOCK.school, 'School');
  await fillReactSelect('degree--0', MOCK.degree, 'Degree');
  await fillReactSelect('discipline--0', MOCK.discipline, 'Discipline');
  await fillInput('start-year--0', MOCK.eduStartYear, 'Edu Start Year');
  await fillInput('end-year--0', MOCK.eduEndYear, 'Edu End Year');

  console.log('\n── Custom Questions ──');
  await fillReactSelect('question_8322390101', 'No', 'Immigration Sponsorship (now)');
  await fillReactSelect('question_8322391101', 'No', 'Immigration Sponsorship (future)');
  await fillReactSelect('question_8322392101', 'agree', 'Privacy Statement');

  console.log('\n── EEO / Voluntary Disclosure ──');
  await fillReactSelect('4005628101', 'Male', 'Gender');
  await fillReactSelect('4005629101', 'Asian', 'Race/Ethnicity');

  // ─── SUMMARY ─────────────────────────────────────────────────────

  const total = filled + failed;
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`   Filled: ${filled}/${total + 1}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Skipped: 1 (file upload)`);
  console.log(`${'═'.repeat(50)}`);

  if (filled >= 20) {
    console.log('\n🎉 VALIDATED — recon field detection is accurate!\n');
  } else if (filled >= 15) {
    console.log('\n✅ Mostly working — some fields need adapter quirks.\n');
  } else {
    console.log('\n⚠️ Multiple failures — review output above.\n');
  }

  // Screenshot
  const ssPath = require('path').join(__dirname, 'reports', 'greenhouse-filled.png');
  await page.screenshot({ path: ssPath, fullPage: true });
  console.log(`📸 Screenshot: ${ssPath}\n`);
}

// CSS.escape polyfill for Node.js (Playwright page context has it, but we need it for selectors)
function escape(id) {
  // Handle IDs starting with digits (like 4005628101)
  if (/^\d/.test(id)) return `\\3${id[0]} ${id.slice(1)}`;
  return id.replace(/([^\w-])/g, '\\$1');
}

// Monkey-patch CSS.escape for selector building
if (typeof CSS === 'undefined') {
  globalThis.CSS = { escape };
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
