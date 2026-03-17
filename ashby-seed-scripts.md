# Ashby — Seed Scripts (DevTools Console)

> Diagnostic scripts for Ashby ATS field discovery & framework detection.
> Paste in DevTools console on any `jobs.ashbyhq.com/*/application/*` page.
> **Date**: 2026-03-17

---

## 1. Framework & Environment Detection

Detects React version, hydration state, routing, CSS strategy, and Ashby-specific markers.

```javascript
(() => {
  const report = {};

  // ── React Detection ──────────────────────────────────────────────
  const reactRoot = document.getElementById('root') || document.getElementById('__next') || document.querySelector('[data-reactroot]');
  report.reactRoot = reactRoot ? { id: reactRoot.id, tag: reactRoot.tagName, classes: reactRoot.className.substring(0, 80) } : null;

  // Walk DOM to find React fiber key
  let fiberKey = null;
  const probe = document.querySelector('input, div, form');
  if (probe) {
    for (const key of Object.keys(probe)) {
      if (key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$')) {
        fiberKey = key;
        break;
      }
    }
  }
  report.reactFiberKey = fiberKey || '(not found — may be production build)';

  // React version from DevTools hook
  if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
    const renderers = window.__REACT_DEVTOOLS_GLOBAL_HOOK__.renderers;
    if (renderers && renderers.size > 0) {
      const r = renderers.values().next().value;
      report.reactVersion = r?.version || '(hook present, version unknown)';
    } else {
      report.reactVersion = '(hook present, no renderers)';
    }
  } else {
    report.reactVersion = '(no devtools hook)';
  }

  // ── Ashby-Specific Markers ───────────────────────────────────────
  report.ashbyFormTestId = !!document.querySelector('[data-testid="application-form"]');
  report.ashbyFormClass = !!document.querySelector('.ashby-application-form, [class*="ashby-application"]');
  report.ashbyJobBoard = /jobs\.ashbyhq\.com/i.test(location.hostname);
  report.ashbyEmbedded = !!document.querySelector('iframe[src*="ashbyhq.com"]');

  // ── CSS Strategy ─────────────────────────────────────────────────
  const allEls = document.querySelectorAll('[class]');
  let cssModuleCount = 0;
  let tailwindCount = 0;
  let styledCompCount = 0;
  const classSet = new Set();
  for (let i = 0; i < Math.min(allEls.length, 200); i++) {
    const cls = allEls[i].className;
    if (typeof cls === 'string') {
      cls.split(/\s+/).forEach(c => classSet.add(c));
      if (/^[a-zA-Z]+_[a-zA-Z]+__[a-zA-Z0-9]{5,}$/i.test(cls) || /_[a-f0-9]{5,8}$/i.test(cls)) cssModuleCount++;
      if (/^(bg-|text-|flex|grid|p-|m-|w-|h-|rounded|border|shadow)/.test(cls)) tailwindCount++;
      if (/^sc-|^css-[a-z0-9]+$/i.test(cls)) styledCompCount++;
    }
  }
  report.cssStrategy = {
    cssModules: cssModuleCount,
    tailwind: tailwindCount,
    styledComponents: styledCompCount,
    sampleClasses: [...classSet].slice(0, 30),
  };

  // ── Shadow DOM Check ─────────────────────────────────────────────
  let shadowCount = 0;
  document.querySelectorAll('*').forEach(el => { if (el.shadowRoot) shadowCount++; });
  report.shadowDomElements = shadowCount;

  // ── Routing ──────────────────────────────────────────────────────
  report.url = location.href;
  report.pathname = location.pathname;
  report.isSPA = !!(window.__NEXT_DATA__ || window.__remixContext || window.__NUXT__);
  report.nextData = !!window.__NEXT_DATA__;

  // ── Form tag presence ────────────────────────────────────────────
  const forms = document.querySelectorAll('form');
  report.formTags = forms.length;
  report.formActions = [...forms].map(f => ({ id: f.id, action: f.action?.substring(0, 80), method: f.method }));

  // ── iframes ──────────────────────────────────────────────────────
  const iframes = document.querySelectorAll('iframe');
  report.iframeCount = iframes.length;
  report.iframeSrcs = [...iframes].map(f => f.src?.substring(0, 80) || '(no src)');

  console.log('%c=== ASHBY FRAMEWORK DETECTION ===', 'color: #00bcd4; font-weight: bold; font-size: 14px');
  console.log(JSON.stringify(report, null, 2));
  return report;
})();
```

---

## 2. Full Field Scan (all inputs + custom widgets)

Enumerates every fillable element on the page with label, type, section, and Ashby-specific metadata.

```javascript
(() => {
  const SKIP = '#jaos-dev-panel, #jaos-floating-launcher-wrap, [aria-hidden="true"] input';
  const fields = document.querySelectorAll('input, select, textarea');
  const results = [];

  fields.forEach((el, i) => {
    if (el.type === 'hidden' || el.type === 'submit' || el.closest(SKIP)) return;
    // Visibility check
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    if (rect.width === 0 && rect.height === 0) return;
    if (style.display === 'none' || style.visibility === 'hidden') return;

    // Label extraction (5 strategies)
    let label = '';
    // 1. aria-label / aria-labelledby
    label = el.getAttribute('aria-label') || '';
    if (!label && el.getAttribute('aria-labelledby')) {
      label = document.getElementById(el.getAttribute('aria-labelledby'))?.textContent?.trim() || '';
    }
    // 2. label[for]
    if (!label && el.id) {
      const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lbl) label = lbl.textContent.trim();
    }
    // 3. Wrapping label
    if (!label) {
      const wrap = el.closest('label');
      if (wrap) label = wrap.textContent.trim().substring(0, 60);
    }
    // 4. Sibling/parent label walk
    if (!label) {
      let p = el.parentElement;
      for (let d = 0; d < 6 && p; d++) {
        const lbl = p.querySelector('label, [class*="label"], legend');
        if (lbl && !el.contains(lbl)) { label = lbl.textContent.trim(); break; }
        p = p.parentElement;
      }
    }
    // 5. Placeholder fallback
    if (!label) label = el.placeholder || '';

    // Section context
    let section = '';
    let parent = el.parentElement;
    for (let d = 0; d < 12 && parent; d++) {
      const heading = parent.querySelector('h1, h2, h3, h4, legend, [class*="section-header"], [class*="sectionTitle"]');
      if (heading && !el.contains(heading)) { section = heading.textContent.trim(); break; }
      parent = parent.parentElement;
    }

    // _systemfield_ detection
    const name = el.name || '';
    const isSystemField = name.startsWith('_systemfield_');

    // Options for select
    const options = el.tagName === 'SELECT'
      ? [...el.options].map(o => ({ value: o.value, text: o.text })).slice(0, 30)
      : undefined;

    results.push({
      '#': i,
      tag: el.tagName.toLowerCase(),
      type: el.type || '',
      name,
      id: el.id || '',
      label: label.substring(0, 80),
      section: section.substring(0, 60),
      isSystemField,
      required: el.required || el.getAttribute('aria-required') === 'true',
      currentValue: (el.value || '').substring(0, 50),
      placeholder: (el.placeholder || '').substring(0, 50),
      role: el.getAttribute('role') || '',
      dataTestId: el.getAttribute('data-testid') || '',
      autoComplete: el.autocomplete || '',
      options,
      size: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
    });
  });

  console.log('%c=== ASHBY FULL FIELD SCAN ===', 'color: #4caf50; font-weight: bold; font-size: 14px');
  console.log(`Found ${results.length} visible fields`);
  console.table(results.map(({ options, ...r }) => r));
  console.log('\nFull data (with options):', JSON.stringify(results, null, 2));
  return results;
})();
```

---

## 3. Custom Widget Scan (aria-combobox, radio groups, checkbox groups, file inputs)

Finds all non-standard widgets that the scanner might miss.

```javascript
(() => {
  const report = { comboboxes: [], radioGroups: [], checkboxGroups: [], fileInputs: [], contentEditables: [], customDropdowns: [] };

  // ── ARIA Comboboxes ──────────────────────────────────────────────
  document.querySelectorAll('[role="combobox"]').forEach((el, i) => {
    const input = el.tagName === 'INPUT' ? el : el.querySelector('input');
    let label = el.getAttribute('aria-label') || '';
    if (!label) {
      const labelledBy = el.getAttribute('aria-labelledby');
      if (labelledBy) label = document.getElementById(labelledBy)?.textContent?.trim() || '';
    }
    if (!label) {
      let p = el.closest('fieldset, [class*="field"], [class*="group"], [class*="FormField"]');
      if (p) label = p.querySelector('label, legend, [class*="label"]')?.textContent?.trim() || '';
    }
    const listboxId = el.getAttribute('aria-controls') || el.getAttribute('aria-owns') || '';
    const listbox = listboxId ? document.getElementById(listboxId) : null;
    const expanded = el.getAttribute('aria-expanded') === 'true';

    report.comboboxes.push({
      '#': i,
      tag: el.tagName.toLowerCase(),
      label: label.substring(0, 80),
      name: (input?.name || el.getAttribute('name') || ''),
      id: el.id || '',
      expanded,
      listboxId,
      listboxFound: !!listbox,
      placeholder: (input?.placeholder || el.getAttribute('placeholder') || '').substring(0, 50),
      dataTestId: el.getAttribute('data-testid') || '',
      classes: el.className?.substring?.(0, 80) || '',
      inputInside: !!el.querySelector('input'),
    });
  });

  // ── Radio Groups ─────────────────────────────────────────────────
  document.querySelectorAll('[role="radiogroup"], fieldset:has(input[type="radio"])').forEach((el, i) => {
    const radios = el.querySelectorAll('[role="radio"], input[type="radio"]');
    const options = [...radios].map(r => ({
      label: r.getAttribute('aria-label') || r.closest('label')?.textContent?.trim() || r.nextElementSibling?.textContent?.trim() || '',
      value: r.value || r.getAttribute('data-value') || '',
      checked: r.checked || r.getAttribute('aria-checked') === 'true',
    }));
    const legend = el.querySelector('legend, label, [class*="label"]')?.textContent?.trim() || '';
    report.radioGroups.push({ '#': i, legend: legend.substring(0, 80), optionCount: options.length, options });
  });

  // ── Checkbox Groups ──────────────────────────────────────────────
  document.querySelectorAll('[role="group"]:has([role="checkbox"]), fieldset:has(input[type="checkbox"])').forEach((el, i) => {
    const checks = el.querySelectorAll('[role="checkbox"], input[type="checkbox"]');
    const options = [...checks].map(c => ({
      label: c.getAttribute('aria-label') || c.closest('label')?.textContent?.trim() || c.nextElementSibling?.textContent?.trim() || '',
      checked: c.checked || c.getAttribute('aria-checked') === 'true',
    }));
    const legend = el.querySelector('legend, label, [class*="label"]')?.textContent?.trim() || '';
    report.checkboxGroups.push({ '#': i, legend: legend.substring(0, 80), optionCount: options.length, options });
  });

  // ── File Inputs (resume/cover letter) ────────────────────────────
  document.querySelectorAll('input[type="file"]').forEach((el, i) => {
    let label = '';
    if (el.id) label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent?.trim() || '';
    if (!label) {
      let p = el.parentElement;
      for (let d = 0; d < 6 && p; d++) {
        const lbl = p.querySelector('label, [class*="label"], [class*="upload"]');
        if (lbl && !el.contains(lbl)) { label = lbl.textContent.trim(); break; }
        p = p.parentElement;
      }
    }
    const accept = el.accept || '';
    const container = el.closest('[class*="upload"], [class*="file"], [class*="drop"]');
    report.fileInputs.push({
      '#': i,
      label: label.substring(0, 80),
      name: el.name || '',
      id: el.id || '',
      accept,
      multiple: el.multiple,
      required: el.required,
      hidden: el.offsetWidth === 0 || el.offsetHeight === 0,
      containerClass: container?.className?.substring?.(0, 80) || '',
      dataTestId: el.getAttribute('data-testid') || '',
    });
  });

  // ── Contenteditable (rich text editors) ──────────────────────────
  document.querySelectorAll('[contenteditable="true"]').forEach((el, i) => {
    let label = '';
    let p = el.parentElement;
    for (let d = 0; d < 6 && p; d++) {
      const lbl = p.querySelector('label, [class*="label"]');
      if (lbl && !el.contains(lbl)) { label = lbl.textContent.trim(); break; }
      p = p.parentElement;
    }
    report.contentEditables.push({
      '#': i,
      label: label.substring(0, 80),
      role: el.getAttribute('role') || '',
      classes: el.className?.substring?.(0, 80) || '',
      dataTestId: el.getAttribute('data-testid') || '',
    });
  });

  // ── Custom Dropdowns (non-native selects with options) ───────────
  document.querySelectorAll('[role="listbox"], [class*="select__control"], [class*="Select__control"], [class*="dropdown"]').forEach((el, i) => {
    let label = '';
    let p = el.parentElement;
    for (let d = 0; d < 8 && p; d++) {
      const lbl = p.querySelector('label, [class*="label"], legend');
      if (lbl && !el.contains(lbl)) { label = lbl.textContent.trim(); break; }
      p = p.parentElement;
    }
    report.customDropdowns.push({
      '#': i,
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role') || '',
      label: label.substring(0, 80),
      classes: el.className?.substring?.(0, 80) || '',
      childCount: el.children.length,
    });
  });

  console.log('%c=== ASHBY CUSTOM WIDGET SCAN ===', 'color: #ff9800; font-weight: bold; font-size: 14px');
  console.log(`Comboboxes: ${report.comboboxes.length}`);
  console.table(report.comboboxes);
  console.log(`Radio groups: ${report.radioGroups.length}`);
  report.radioGroups.forEach(g => console.log(`  "${g.legend}" →`, g.options));
  console.log(`Checkbox groups: ${report.checkboxGroups.length}`);
  report.checkboxGroups.forEach(g => console.log(`  "${g.legend}" →`, g.options));
  console.log(`File inputs: ${report.fileInputs.length}`);
  console.table(report.fileInputs);
  console.log(`Contenteditable: ${report.contentEditables.length}`);
  console.table(report.contentEditables);
  console.log(`Custom dropdowns: ${report.customDropdowns.length}`);
  console.table(report.customDropdowns);
  console.log('\nFull JSON:', JSON.stringify(report, null, 2));
  return report;
})();
```

---

## 4. Combobox Option Extraction (click-open each combobox, read options)

Opens each aria-combobox, waits for the listbox to appear, and reads all options.
**Note**: This script INTERACTS with the page — it clicks fields and presses Escape. Run on a fresh form.

```javascript
(async () => {
  const comboboxes = document.querySelectorAll('[role="combobox"]');
  const results = [];

  for (let i = 0; i < comboboxes.length; i++) {
    const cb = comboboxes[i];
    const input = cb.tagName === 'INPUT' ? cb : cb.querySelector('input');
    let label = cb.getAttribute('aria-label') || '';
    if (!label) {
      const p = cb.closest('fieldset, [class*="field"], [class*="group"], [class*="FormField"]');
      if (p) label = p.querySelector('label, legend, [class*="label"]')?.textContent?.trim() || '';
    }

    // Click to open
    (input || cb).focus();
    (input || cb).click();
    await new Promise(r => setTimeout(r, 600));

    // Find the listbox
    const listboxId = cb.getAttribute('aria-controls') || cb.getAttribute('aria-owns') || '';
    let listbox = listboxId ? document.getElementById(listboxId) : null;
    if (!listbox) listbox = document.querySelector('[role="listbox"]:not([aria-hidden="true"])');

    let options = [];
    if (listbox) {
      const items = listbox.querySelectorAll('[role="option"], li, [class*="option"]');
      options = [...items].slice(0, 50).map(o => ({
        text: o.textContent.trim().substring(0, 80),
        value: o.getAttribute('data-value') || o.getAttribute('value') || '',
        selected: o.getAttribute('aria-selected') === 'true',
      }));
    }

    results.push({
      '#': i,
      label: label.substring(0, 80),
      name: (input?.name || cb.getAttribute('name') || ''),
      optionCount: options.length,
      options,
      listboxFound: !!listbox,
    });

    // Close dropdown
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    (input || cb).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    (input || cb).blur();
    await new Promise(r => setTimeout(r, 400));
  }

  console.log('%c=== ASHBY COMBOBOX OPTIONS ===', 'color: #e91e63; font-weight: bold; font-size: 14px');
  results.forEach(r => {
    console.log(`\n"${r.label}" (${r.optionCount} options):`);
    if (r.options.length > 0) console.table(r.options);
    else console.log('  (no options found or listbox not detected)');
  });
  console.log('\nFull JSON:', JSON.stringify(results, null, 2));
  return results;
})();
```

---

## 5. Form Structure & Multi-Page Detection

Detects sections, steps, progress bars, and navigation buttons to understand if the form is multi-page.

```javascript
(() => {
  const report = { sections: [], navigation: [], progressIndicators: [], pageState: {} };

  // ── Sections ─────────────────────────────────────────────────────
  const sectionEls = document.querySelectorAll(
    'section, fieldset, [class*="section"], [class*="Section"], [class*="step"], [class*="Step"], [data-testid*="section"]'
  );
  sectionEls.forEach((el, i) => {
    const heading = el.querySelector('h1, h2, h3, h4, legend, [class*="title"], [class*="header"]');
    const fieldCount = el.querySelectorAll('input:not([type="hidden"]), select, textarea, [role="combobox"]').length;
    if (fieldCount === 0) return;
    report.sections.push({
      '#': i,
      tag: el.tagName.toLowerCase(),
      heading: heading?.textContent?.trim()?.substring(0, 80) || '(no heading)',
      fieldCount,
      visible: el.offsetHeight > 0 && getComputedStyle(el).display !== 'none',
      classes: el.className?.substring?.(0, 80) || '',
      dataTestId: el.getAttribute('data-testid') || '',
    });
  });

  // ── Navigation Buttons ───────────────────────────────────────────
  const buttons = document.querySelectorAll('button, [role="button"], input[type="submit"], a[class*="btn"]');
  buttons.forEach((btn, i) => {
    const text = btn.textContent?.trim()?.substring(0, 60) || '';
    if (!text) return;
    const isNav = /next|continue|submit|back|previous|save|apply|review/i.test(text);
    const isAdvance = /next|continue|submit|apply|review/i.test(text);
    if (isNav) {
      report.navigation.push({
        '#': i,
        text,
        tag: btn.tagName.toLowerCase(),
        type: btn.type || '',
        disabled: btn.disabled || btn.getAttribute('aria-disabled') === 'true',
        isAdvance,
        classes: btn.className?.substring?.(0, 80) || '',
        dataTestId: btn.getAttribute('data-testid') || '',
      });
    }
  });

  // ── Progress Indicators ──────────────────────────────────────────
  document.querySelectorAll(
    '[role="progressbar"], [class*="progress"], [class*="stepper"], [class*="step-indicator"], [class*="wizard"], [class*="breadcrumb"]'
  ).forEach((el, i) => {
    report.progressIndicators.push({
      '#': i,
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role') || '',
      classes: el.className?.substring?.(0, 80) || '',
      text: el.textContent?.trim()?.substring(0, 120) || '',
      ariaValueNow: el.getAttribute('aria-valuenow') || '',
      ariaValueMax: el.getAttribute('aria-valuemax') || '',
    });
  });

  // ── Page State ───────────────────────────────────────────────────
  const urlParams = new URLSearchParams(location.search);
  report.pageState = {
    url: location.href,
    hash: location.hash,
    queryParams: Object.fromEntries(urlParams),
    title: document.title,
    totalVisibleFields: document.querySelectorAll('input:not([type="hidden"]):not([style*="display: none"]), select, textarea').length,
    totalHiddenSections: [...document.querySelectorAll('section, fieldset, [class*="section"]')].filter(
      el => el.offsetHeight === 0 || getComputedStyle(el).display === 'none'
    ).length,
  };

  console.log('%c=== ASHBY FORM STRUCTURE ===', 'color: #9c27b0; font-weight: bold; font-size: 14px');
  console.log('Sections:');
  console.table(report.sections);
  console.log('Navigation buttons:');
  console.table(report.navigation);
  console.log('Progress indicators:', report.progressIndicators);
  console.log('Page state:', report.pageState);
  console.log('\nFull JSON:', JSON.stringify(report, null, 2));
  return report;
})();
```

---

## 6. React State & Value Tracker Verification

Tests whether React's `_valueTracker` pattern works on Ashby inputs and verifies which event dispatch sequence triggers React state updates.

```javascript
(async () => {
  const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="file"]):not([type="submit"])');
  if (inputs.length === 0) { console.warn('No inputs found'); return; }

  const target = inputs[0]; // Test on first visible input
  const label = target.getAttribute('aria-label') || target.name || target.id || '(unknown)';
  const testValue = 'JAOS_TEST_123';
  const report = { field: label, strategies: [] };

  const readReactState = (el) => {
    for (const key of Object.keys(el)) {
      if (key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$')) {
        try {
          let fiber = el[key];
          // Walk up to find memoizedProps
          for (let i = 0; i < 10 && fiber; i++) {
            if (fiber.memoizedProps?.value !== undefined) return fiber.memoizedProps.value;
            if (fiber.memoizedProps?.defaultValue !== undefined) return fiber.memoizedProps.defaultValue;
            fiber = fiber.return;
          }
        } catch (e) {}
      }
    }
    return '(fiber not accessible)';
  };

  const strategies = [
    {
      name: 'Native setter + input event',
      fill: (el, val) => {
        const nativeSet = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        if (nativeSet) nativeSet.call(el, val);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      },
    },
    {
      name: 'Native setter + input + change',
      fill: (el, val) => {
        const nativeSet = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        if (nativeSet) nativeSet.call(el, val);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      },
    },
    {
      name: '_valueTracker reset + native setter + input + change',
      fill: (el, val) => {
        const tracker = el._valueTracker;
        if (tracker) tracker.setValue('');
        const nativeSet = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        if (nativeSet) nativeSet.call(el, val);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      },
    },
    {
      name: 'Focus + _valueTracker + setter + input + change + blur',
      fill: (el, val) => {
        el.focus();
        const tracker = el._valueTracker;
        if (tracker) tracker.setValue('');
        const nativeSet = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        if (nativeSet) nativeSet.call(el, val);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.blur();
      },
    },
  ];

  for (const strat of strategies) {
    // Reset
    const nativeSet = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (nativeSet) nativeSet.call(target, '');
    target.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 200));

    // Apply strategy
    strat.fill(target, testValue);
    await new Promise(r => setTimeout(r, 300));

    const domValue = target.value;
    const reactValue = readReactState(target);
    const hasTracker = !!target._valueTracker;

    report.strategies.push({
      strategy: strat.name,
      domValue,
      reactValue: String(reactValue).substring(0, 50),
      domMatches: domValue === testValue,
      reactMatches: String(reactValue) === testValue,
      hasTracker,
    });
  }

  // Clean up — clear the test value
  const nativeSet = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (nativeSet) nativeSet.call(target, '');
  target.dispatchEvent(new Event('input', { bubbles: true }));
  target.dispatchEvent(new Event('change', { bubbles: true }));

  console.log('%c=== ASHBY REACT VALUE STRATEGY TEST ===', 'color: #f44336; font-weight: bold; font-size: 14px');
  console.log(`Tested on field: "${label}"`);
  console.table(report.strategies);
  console.log('\nFull JSON:', JSON.stringify(report, null, 2));
  return report;
})();
```

---

## Quick Reference: What To Look For

After running scripts 1-5, document the following in `ashby-rules.md`:

| Question | Script # |
|----------|---------|
| Is it React? What version? | 1 |
| CSS modules or Tailwind or styled-components? | 1 |
| Any Shadow DOM? | 1 |
| Any iframes? | 1 |
| What are ALL fillable fields? | 2 |
| Which fields use `_systemfield_` prefix? | 2 |
| Is "Name" combined or split first/last? | 2 |
| What custom widgets exist (combobox, radio, checkbox)? | 3 |
| What are the combobox dropdown options? | 4 |
| Are there file upload inputs? How are they structured? | 3 |
| Is the form single-page or multi-step? | 5 |
| What navigation buttons exist? | 5 |
| What's the best React fill strategy? | 6 |
| Does `_valueTracker` work? | 6 |
