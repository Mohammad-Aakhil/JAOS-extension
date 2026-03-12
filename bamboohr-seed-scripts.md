# BambooHR — Seed Scripts (DevTools Console)

> Diagnostic scripts for debugging BambooHR autofill.
> Paste in DevTools console on any `*.bamboohr.com/careers/*` page.

---

## 1. Full Field Scan (all inputs + fab widgets)

```javascript
(() => {
  const fields = document.querySelectorAll('input, select, textarea, button.fab-SelectToggle');
  const results = [];
  fields.forEach((el) => {
    if (el.type === 'hidden' || el.type === 'submit') return;
    if (el.closest('#jaos-dev-panel, #jaos-floating-launcher-wrap')) return;
    let label = '';
    if (el.getAttribute('aria-label')) label = el.getAttribute('aria-label');
    if (!label && el.id) { const lbl = document.querySelector(`label[for="${el.id}"]`); if (lbl) label = lbl.textContent.trim(); }
    if (!label) { let p = el.parentElement; for (let d = 0; d < 5 && p; d++) { const lbl = p.querySelector('label'); if (lbl && !el.contains(lbl)) { label = lbl.textContent.trim(); break; } p = p.parentElement; } }
    const fabricComp = el.getAttribute('data-fabric-component') || el.closest('[data-fabric-component]')?.getAttribute('data-fabric-component') || '';
    let value = '';
    if (el.tagName === 'BUTTON' && el.classList.contains('fab-SelectToggle')) value = el.querySelector('.fab-SelectToggle__content')?.textContent?.trim() || el.querySelector('.fab-SelectToggle__placeholder')?.textContent?.trim() || '';
    else if (el.tagName === 'SELECT') value = el.options[el.selectedIndex]?.text || el.value;
    else value = el.value || '';
    results.push({ tag: el.tagName.toLowerCase(), type: el.type || '', id: el.id || '', name: el.name || '', label: label.substring(0, 60), fabricComp, value: String(value).substring(0, 50), ariaHidden: el.getAttribute('aria-hidden') || '', required: el.required || false, readonly: el.readOnly || false, rect: `${el.offsetWidth}x${el.offsetHeight}` });
  });
  console.table(results);
  return results;
})();
```

---

## 2. Scan Fabric Select Widgets Only

```javascript
(() => {
  const toggles = document.querySelectorAll('button.fab-SelectToggle');
  toggles.forEach((btn, i) => {
    const content = btn.querySelector('.fab-SelectToggle__content')?.textContent?.trim();
    const placeholder = btn.querySelector('.fab-SelectToggle__placeholder')?.textContent?.trim();
    const ariaLabel = btn.getAttribute('aria-label') || '';
    const backingSelect = btn.closest('[data-fabric-component]')?.querySelector('select');
    const isFilled = !!content && !placeholder;
    console.log(`fab-Select #${i + 1}:`, {
      ariaLabel,
      filled: isFilled,
      displayText: content || placeholder || '(empty)',
      backingSelectName: backingSelect?.name || '',
      backingRequired: backingSelect?.required || false,
      backingValue: backingSelect?.value || '',
    });
  });
})();
```

---

## 3. Test Fabric Select Fill (manually fill State)

```javascript
(async () => {
  // Find the State toggle button
  const toggles = document.querySelectorAll('button.fab-SelectToggle');
  let stateBtn = null;
  for (const btn of toggles) {
    if (/state/i.test(btn.getAttribute('aria-label') || '')) { stateBtn = btn; break; }
  }
  if (!stateBtn) { console.error('State fab-SelectToggle not found'); return; }

  // Open via Enter key (Fabric UI does NOT respond to .click() or PointerEvent)
  stateBtn.focus();
  stateBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
  stateBtn.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
  await new Promise(r => setTimeout(r, 400));

  // Find search input
  const search = document.querySelector('input.fab-MenuSearch__input');
  if (!search) { console.error('Search input not found'); return; }

  // Type state name
  search.focus();
  search.value = 'New York';
  search.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => setTimeout(r, 500));

  // Click first matching option
  const menuList = document.querySelector('div.fab-MenuList[role="menu"]');
  const options = menuList?.querySelectorAll('.fab-MenuOption, [role="menuitem"]') || [];
  console.log(`Found ${options.length} filtered options:`, Array.from(options).map(o => o.textContent.trim()));

  const match = Array.from(options).find(o => /new york/i.test(o.textContent));
  if (match) {
    match.click();
    console.log('Selected:', match.textContent.trim());
  } else {
    console.error('No match found for "New York"');
    document.body.click(); // close menu
  }
})();
```

---

## 4. Check Honeypot Field

```javascript
(() => {
  const hp = document.getElementById('preferredName');
  if (!hp) { console.log('No honeypot found'); return; }
  console.log('Honeypot field:', {
    id: hp.id,
    name: hp.name,
    value: hp.value,
    visible: hp.offsetParent !== null,
    size: `${hp.offsetWidth}x${hp.offsetHeight}`,
    label: hp.closest('[data-fabric-component]')?.querySelector('label')?.textContent?.trim() || '',
    isEmpty: hp.value === '',
  });
  console.log(hp.value === '' ? '✓ Honeypot is empty (GOOD)' : '✗ Honeypot has value — WILL BE FLAGGED AS SPAM');
})();
```

---

## 5. Check Required Fields Status

```javascript
(() => {
  const results = [];
  // Text inputs with asterisk in label
  document.querySelectorAll('input[type="text"], textarea').forEach(el => {
    if (el.closest('#jaos-dev-panel')) return;
    let label = '';
    let p = el.parentElement;
    for (let d = 0; d < 5 && p; d++) { const lbl = p.querySelector('label'); if (lbl && !el.contains(lbl)) { label = lbl.textContent.trim(); break; } p = p.parentElement; }
    if (!/\*/.test(label)) return;
    results.push({ field: label.replace(/\*/g, '').trim(), filled: !!el.value.trim(), value: el.value.substring(0, 30) });
  });
  // Fabric selects (check backing select for required)
  document.querySelectorAll('button.fab-SelectToggle').forEach(btn => {
    const backing = btn.closest('[data-fabric-component]')?.querySelector('select[required]');
    if (!backing) return;
    const content = btn.querySelector('.fab-SelectToggle__content')?.textContent?.trim();
    const ariaLabel = (btn.getAttribute('aria-label') || '').replace(/–Select–/g, '').trim();
    results.push({ field: ariaLabel, filled: !!content, value: content || '(empty)' });
  });
  console.table(results);
  const missing = results.filter(r => !r.filled);
  console.log(`${results.length - missing.length}/${results.length} required fields filled.`, missing.length > 0 ? 'Missing:' : '', missing.map(m => m.field));
})();
```

---

## 6. Dump fab-MenuOption Values (when dropdown is open)

```javascript
// Open a fab-Select first (click it), then run this:
(() => {
  const menuList = document.querySelector('div.fab-MenuList[role="menu"]');
  if (!menuList) { console.error('No open fab-MenuList found — click a fab-Select first'); return; }
  const options = menuList.querySelectorAll('.fab-MenuOption, [role="menuitem"]');
  const values = Array.from(options).map(o => o.textContent.trim());
  console.log(`${values.length} options:`, values);
  return values;
})();
```
