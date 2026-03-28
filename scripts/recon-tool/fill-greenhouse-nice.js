/**
 * JAOS Recon — Fill validation for Greenhouse (NICE job application)
 * Fills ALL fields with realistic mock data using proper interaction patterns.
 *
 * React-select: click control → type search text → wait → click option via locator
 * Text inputs: fill + React _valueTracker hack + input/change/blur events
 * Textarea: same as text
 * Phone (intl-tel-input): just fill the number field
 */

const { chromium } = require('playwright-core');

const MOCK = {
  first_name: 'John',
  last_name: 'Anderson',
  email: 'john.anderson.test@gmail.com',
  phone: '4045551234',
  linkedin: 'https://linkedin.com/in/john-anderson-test',
  website: 'https://github.com/john-anderson-test',
  salary: '120000',
  address: '123 Peachtree St NE, Atlanta, GA 30309',
  // React-select values (search text → option will match)
  country: 'United States',
  // Custom questions
  q_relatives: 'No',           // Do you have any first-degree relatives...
  q_worked_nice: 'No',         // Have you ever worked at NICE...
  q_office: 'Yes',             // Are you willing to come into the office...
  q_us_citizen: 'Yes',         // Are you a US Citizen or Green Card Holder?
  q_atlanta: 'Yes',            // Do you currently live in the Atlanta, GA Metro...
  // EEO (voluntary)
  gender: 'Male',
  hispanic: 'No',
  veteran: 'I am not a protected veteran',
  disability: 'I do not want to answer',
};

async function fillTextInput(page, selector, value) {
  console.log(`  Filling text: ${selector} = "${value}"`);
  await page.click(selector);
  await page.waitForTimeout(100);
  // Clear existing value
  await page.fill(selector, '');
  await page.waitForTimeout(50);
  // Type with slight delay for realism
  await page.keyboard.type(value, { delay: 30 });
  // React compat: force input/change/blur events
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return;
    const tracker = el._valueTracker;
    if (tracker) tracker.setValue('');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
  }, selector);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
}

async function fillReactSelect(page, inputSelector, searchText) {
  console.log(`  Filling react-select: ${inputSelector} → "${searchText}"`);
  // Click the input to open dropdown
  await page.click(inputSelector);
  await page.waitForTimeout(300);
  // Clear and type search
  await page.fill(inputSelector, '');
  await page.keyboard.type(searchText, { delay: 40 });
  await page.waitForTimeout(1000);
  // Click the first matching option using Playwright locator (NOT page.evaluate)
  // React-select listens for mouseDown, not click
  const option = page.locator('[class*="select__option"]').first();
  try {
    await option.click({ timeout: 3000 });
    console.log(`    ✅ Selected option for "${searchText}"`);
  } catch (e) {
    console.log(`    ❌ No option found for "${searchText}" — ${e.message.split('\n')[0]}`);
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

async function fillTextarea(page, selector, value) {
  console.log(`  Filling textarea: ${selector}`);
  await page.click(selector);
  await page.waitForTimeout(100);
  await page.fill(selector, '');
  await page.keyboard.type(value, { delay: 20 });
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
  }, selector);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
}

(async () => {
  console.log('🔌 Connecting to Chrome...');
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const contexts = browser.contexts();
  const pages = contexts[0].pages();
  const page = pages.find(p => p.url().includes('greenhouse'));

  if (!page) {
    console.log('❌ No Greenhouse tab found!');
    await browser.close();
    return;
  }
  console.log(`📄 Found page: ${page.url()}\n`);

  let filled = 0;
  let failed = 0;

  try {
    // === TEXT INPUTS ===
    console.log('--- Text Fields ---');
    await fillTextInput(page, '#first_name', MOCK.first_name);
    filled++;
    await fillTextInput(page, '#last_name', MOCK.last_name);
    filled++;
    await fillTextInput(page, '#email', MOCK.email);
    filled++;
    await fillTextInput(page, '#phone', MOCK.phone);
    filled++;
    await fillTextInput(page, '#question_8366613101', MOCK.linkedin);  // LinkedIn
    filled++;
    await fillTextInput(page, '#question_8366614101', MOCK.website);   // Website
    filled++;
    await fillTextInput(page, '#question_8366618101', MOCK.salary);    // Salary
    filled++;

    // === TEXTAREA ===
    console.log('\n--- Textarea ---');
    await fillTextarea(page, '#question_8366620101', MOCK.address);    // Address
    filled++;

    // === REACT-SELECT DROPDOWNS ===
    console.log('\n--- React-Select Dropdowns ---');

    // Country (phone fieldset)
    await fillReactSelect(page, '#country', MOCK.country);
    filled++;

    // Do you have any first-degree relatives...
    await fillReactSelect(page, '#question_8366615101', MOCK.q_relatives);
    filled++;

    // Have you ever worked at NICE...
    await fillReactSelect(page, '#question_8366616101', MOCK.q_worked_nice);
    filled++;

    // Are you willing to come into the office...
    await fillReactSelect(page, '#question_8366617101', MOCK.q_office);
    filled++;

    // Are you a US Citizen or Green Card Holder?
    await fillReactSelect(page, '#question_8366619101', MOCK.q_us_citizen);
    filled++;

    // Do you currently live in the Atlanta, GA Metro...
    await fillReactSelect(page, '#question_8418215101', MOCK.q_atlanta);
    filled++;

    // === EEO (Voluntary) ===
    console.log('\n--- EEO (Voluntary) ---');
    await fillReactSelect(page, '#gender', MOCK.gender);
    filled++;

    await fillReactSelect(page, '#hispanic_ethnicity', MOCK.hispanic);
    filled++;

    await fillReactSelect(page, '#veteran_status', MOCK.veteran);
    filled++;

    await fillReactSelect(page, '#disability_status', MOCK.disability);
    filled++;

  } catch (err) {
    console.error(`\n💥 Error: ${err.message}`);
    failed++;
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`✅ Filled: ${filled} fields`);
  console.log(`❌ Failed: ${failed} fields`);
  console.log(`⏭️  Skipped: 2 (file uploads)`);
  console.log(`📊 Total fillable: ${filled + failed + 2}`);

  // Take screenshot of filled form
  await page.screenshot({ path: 'reports/greenhouse-nice-filled.png', fullPage: true });
  console.log('\n📸 Screenshot saved: reports/greenhouse-nice-filled.png');

  await browser.close();
})();
