// ═══════════════════════════════════════════════════════════════
// JAOS Workday Universal Field Discovery v2
// Detects ALL field types, widget patterns, popup structures,
// hierarchical dropdowns, and interaction requirements
// Run on EACH page of the Workday form
// ═══════════════════════════════════════════════════════════════
(async () => {
  const delay = ms => new Promise(r => setTimeout(r, ms));
  const out = {
    url: location.href,
    hostname: location.hostname,
    timestamp: new Date().toISOString(),
    pageTitle: '',
    pageStep: '',
    fields: [],
    navigation: [],
    warnings: [],
  };

  // ─── Page info ───
  out.pageTitle = (
    document.querySelector('[data-automation-id="pageHeaderText"]')?.textContent?.trim() ||
    document.querySelector('h1, h2')?.textContent?.trim() || ''
  );
  const stepItems = document.querySelectorAll('[data-automation-id="progressIndicator"] li, [class*="css-"] > [tabindex]');
  const activeStep = [...document.querySelectorAll('[aria-current="step"], [aria-current="true"], [class*="css-"][aria-selected="true"]')];
  out.pageStep = activeStep.map(s => s.textContent.trim()).join(' | ') || '';

  // ─── Helpers ───
  function getLabel(wrapper, input) {
    const tries = [
      () => input.id && document.querySelector(`label[for="${input.id}"]`)?.textContent?.trim(),
      () => wrapper?.querySelector('label')?.textContent?.trim(),
      () => wrapper?.querySelector('legend')?.textContent?.trim(),
      () => wrapper?.querySelector('[data-automation-id="formLabel"]')?.textContent?.trim(),
      () => {
        // Walk up to find nearest label-like element before the input
        let prev = wrapper?.previousElementSibling;
        for (let i = 0; i < 3 && prev; i++) {
          const t = prev.textContent?.trim();
          if (t && t.length < 150 && !prev.querySelector('input, select, textarea, button')) return t;
          prev = prev.previousElementSibling;
        }
        return null;
      },
      () => input.getAttribute('aria-label'),
      () => input.getAttribute('placeholder'),
    ];
    for (const fn of tries) {
      const r = fn();
      if (r && r.length > 0 && r.length < 300) return r.replace(/\s*\*\s*$/, '').trim();
    }
    return null;
  }

  function getSection(el) {
    let cur = el;
    for (let i = 0; i < 12 && cur; i++) {
      const aid = cur.getAttribute?.('data-automation-id') || '';
      if (/section/i.test(aid) || cur.tagName === 'FIELDSET') {
        const heading = cur.querySelector('h2, h3, h4, legend, [data-automation-id="sectionHeader"], [data-automation-id="pageHeaderText"]');
        return heading?.textContent?.trim() || aid;
      }
      cur = cur.parentElement;
    }
    return null;
  }

  function getAutoIdChain(el) {
    const ids = [];
    let cur = el;
    for (let i = 0; i < 8 && cur; i++) {
      const aid = cur.getAttribute?.('data-automation-id');
      if (aid) ids.push(aid);
      cur = cur.parentElement;
    }
    return ids;
  }

  // ─── Detect widget type for a wrapper ───
  function classifyWidget(wrapper, input) {
    const aid = wrapper?.getAttribute('data-automation-id') || '';
    const aidChain = getAutoIdChain(input || wrapper).join(' > ');

    // Hierarchical multiselect (How Did You Hear)
    if (aid === 'multiselectInputContainer' || aid === 'multiSelectContainer' || aidChain.includes('multiSelectContainer')) {
      const hasPromptIcon = !!wrapper.closest('[data-automation-id="multiSelectContainer"]')?.querySelector('[data-automation-id="promptIcon"]');
      return {
        widgetType: 'hierarchical-multiselect',
        interactionSteps: [
          'click promptIcon (≡ button) to open popup',
          'popup is UL with LI[role="presentation"] > DIV[role="option"]',
          'categories have > arrow — click to expand sub-menu',
          'sub-options are also DIV[role="option"] — click to select',
          'selected item appears as chip with × remove button'
        ],
        hasPromptIcon,
        popupSelector: '[role="listbox"], [data-automation-id="selectWidget"]',
        optionSelector: '[role="option"]',
      };
    }

    // Custom button dropdown (Country, Phone Type, Degree, etc.)
    if (input?.tagName === 'BUTTON' || input?.getAttribute('aria-haspopup') === 'listbox') {
      const ariaLabel = input?.getAttribute('aria-label') || '';
      return {
        widgetType: 'button-dropdown',
        interactionSteps: [
          'click button to open listbox',
          'options are [role="option"]',
          'click matching option to select'
        ],
        currentValue: input?.textContent?.trim() || '',
        ariaLabel,
      };
    }

    // Searchable combobox
    if (input?.getAttribute('role') === 'combobox' || input?.getAttribute('aria-autocomplete')) {
      return {
        widgetType: 'searchable-combobox',
        interactionSteps: [
          'focus input and type search text',
          'wait for dropdown with [role="option"]',
          'click matching option'
        ],
      };
    }

    // Radio group
    const radios = wrapper?.querySelectorAll('input[type="radio"]');
    if (radios?.length > 0) {
      return {
        widgetType: 'radio-group',
        options: [...radios].map(r => ({
          value: r.value,
          label: r.closest('label')?.textContent?.trim() || document.querySelector(`label[for="${r.id}"]`)?.textContent?.trim() || r.value,
          id: r.id,
          name: r.name,
          checked: r.checked,
        })),
        interactionSteps: ['click the input[type="radio"] matching desired value'],
      };
    }

    // Checkbox
    if (input?.type === 'checkbox') {
      return {
        widgetType: 'checkbox',
        interactionSteps: ['click to toggle, or check el.checked first'],
        checked: input.checked,
      };
    }

    // File upload
    if (input?.type === 'file') {
      return {
        widgetType: 'file-upload',
        accept: input.getAttribute('accept') || '',
        interactionSteps: ['DataTransfer API or trigger via click + file dialog'],
      };
    }

    // Date fields (month/year split)
    if (/date/i.test(aid)) {
      const isMonth = /month/i.test(aid);
      const isYear = /year/i.test(aid);
      return {
        widgetType: isMonth ? 'date-month' : isYear ? 'date-year' : 'date',
        interactionSteps: ['setReactInput with month number (MM) or year (YYYY)'],
      };
    }

    // Textarea
    if (input?.tagName === 'TEXTAREA') {
      return { widgetType: 'textarea', interactionSteps: ['setReactInput with text'] };
    }

    // Native select
    if (input?.tagName === 'SELECT') {
      return {
        widgetType: 'native-select',
        options: [...input.options].map(o => ({ text: o.textContent.trim(), value: o.value })),
        interactionSteps: ['set selectedIndex + dispatch change event'],
      };
    }

    // Default text input
    return {
      widgetType: 'text-input',
      interactionSteps: ['setReactInput (native value setter + input/change/blur events)'],
    };
  }

  // ═══════════════════════════════════════
  // SCAN 1: All inputs / selects / textareas
  // ═══════════════════════════════════════
  const seen = new Set();

  document.querySelectorAll('input, select, textarea').forEach(input => {
    if (input.offsetWidth === 0 && input.offsetHeight === 0) return;
    if (input.type === 'hidden') return;

    const key = input.id || input.name || (input.getAttribute('aria-label') + input.type) || Math.random().toString();
    if (seen.has(key)) return;
    seen.add(key);

    const wrapper = input.closest('[data-automation-id]') || input.parentElement;
    const wrapperAid = wrapper?.getAttribute('data-automation-id') || null;
    const label = getLabel(wrapper, input);
    const widget = classifyWidget(wrapper, input);

    out.fields.push({
      label: label || '⚠️ NO LABEL',
      tag: input.tagName,
      type: input.type || 'text',
      id: input.id || null,
      name: input.name || null,
      ariaLabel: input.getAttribute('aria-label') || null,
      ariaRequired: input.getAttribute('aria-required') || null,
      required: input.required || input.getAttribute('aria-required') === 'true',
      placeholder: input.placeholder || null,
      value: input.value?.substring(0, 60) || '',
      checked: (input.type === 'checkbox' || input.type === 'radio') ? input.checked : undefined,
      wrapperAutoId: wrapperAid,
      autoIdChain: getAutoIdChain(input),
      section: getSection(input),
      widget,
    });
  });

  // ═══════════════════════════════════════
  // SCAN 2: Button-based dropdowns
  // ═══════════════════════════════════════
  document.querySelectorAll('button[aria-haspopup="listbox"], button[aria-haspopup="dialog"]').forEach(btn => {
    if (btn.offsetWidth === 0) return;
    const ariaLabel = btn.getAttribute('aria-label') || '';
    const wrapper = btn.closest('[data-automation-id]') || btn.parentElement;
    const wrapperAid = wrapper?.getAttribute('data-automation-id') || null;

    const key = 'btn-' + (ariaLabel || wrapperAid || Math.random());
    if (seen.has(key)) return;
    seen.add(key);

    // Skip language selector / non-form buttons
    if (getAutoIdChain(btn).join(',').includes('utilityMenu') || getAutoIdChain(btn).join(',').includes('navigation')) return;

    const label = getLabel(wrapper, btn) || ariaLabel.replace(/\s*(Required|Select One).*$/i, '').trim();
    const widget = classifyWidget(wrapper, btn);

    out.fields.push({
      label: label || '⚠️ NO LABEL',
      tag: 'BUTTON',
      type: 'custom-dropdown',
      id: btn.id || null,
      name: null,
      ariaLabel: ariaLabel || null,
      ariaRequired: /required/i.test(ariaLabel) ? 'true' : null,
      required: /required/i.test(ariaLabel),
      placeholder: null,
      value: btn.textContent?.trim()?.substring(0, 60) || '',
      wrapperAutoId: wrapperAid,
      autoIdChain: getAutoIdChain(btn),
      section: getSection(btn),
      widget,
    });
  });

  // ═══════════════════════════════════════
  // SCAN 3: Probe hierarchical dropdowns
  // (open each multiselect popup, dump structure, close)
  // ═══════════════════════════════════════
  const multiselects = document.querySelectorAll('[data-automation-id="multiSelectContainer"]');
  for (const ms of multiselects) {
    const input = ms.querySelector('input');
    if (!input || input.offsetWidth === 0) continue;

    const label = getLabel(ms, input) || input.id || 'unknown';
    const icon = ms.querySelector('[data-automation-id="promptIcon"]')
              || [...ms.querySelectorAll('button')].find(b => {
                const t = b.textContent.trim();
                return t === '' || b.querySelector('img, svg');
              });

    if (!icon) {
      out.warnings.push(`Multiselect "${label}" — no promptIcon found`);
      continue;
    }

    // Open popup
    icon.click();
    await delay(1200);

    // Dump popup structure
    const popup = document.querySelector('[role="listbox"], [data-automation-id="selectWidget"]')
               || document.querySelector('ul[class*="css-"]');

    if (popup) {
      const topLevel = [...popup.querySelectorAll(':scope > li, :scope > [role="presentation"], :scope > [role="option"]')];
      const categories = topLevel.map(li => {
        const optDiv = li.querySelector('[role="option"]') || li;
        const text = optDiv.textContent.trim().replace(/[\n\r]+/g, ' ').substring(0, 60);
        const hasArrow = !!li.querySelector('svg, [class*="arrow"], [class*="chevron"]') || text.includes('>');
        return {
          text: text.replace(/\s*>?\s*$/, '').trim(),
          tag: li.tagName,
          role: li.getAttribute('role') || '',
          optionRole: optDiv.getAttribute('role') || '',
          hasSubMenu: hasArrow,
          optionTag: optDiv.tagName,
          optionClass: (optDiv.className || '').toString().substring(0, 40),
        };
      });

      // Update the matching field entry
      const fieldEntry = out.fields.find(f => f.id === input.id);
      if (fieldEntry) {
        fieldEntry.widget.popupStructure = {
          popupTag: popup.tagName,
          popupRole: popup.getAttribute('role') || '',
          popupClass: (popup.className || '').toString().substring(0, 60),
          topLevelCount: categories.length,
          categories,
          note: 'Categories with hasSubMenu=true require 2-step click: category → sub-option',
        };
      }
    } else {
      out.warnings.push(`Multiselect "${label}" — popup did not appear`);
    }

    // Close popup — press Escape
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await delay(500);
    // Also click body to dismiss
    document.body.click();
    await delay(300);
  }

  // ═══════════════════════════════════════
  // SCAN 4: Radio groups (grouped by name)
  // ═══════════════════════════════════════
  const radioNames = new Set();
  document.querySelectorAll('input[type="radio"]').forEach(r => {
    if (r.offsetWidth > 0 && r.name) radioNames.add(r.name);
  });

  for (const name of radioNames) {
    if (out.fields.some(f => f.name === name)) continue; // already captured
    const radios = document.querySelectorAll(`input[name="${name}"]`);
    const first = radios[0];
    const wrapper = first.closest('[data-automation-id]') || first.parentElement?.parentElement;

    // Find the question text above the radio group
    let questionText = '';
    let searchEl = wrapper || first.parentElement;
    for (let i = 0; i < 5 && searchEl; i++) {
      const prev = searchEl.previousElementSibling;
      if (prev && prev.textContent?.trim().length > 5 && !prev.querySelector('input')) {
        questionText = prev.textContent.trim();
        break;
      }
      searchEl = searchEl.parentElement;
    }

    out.fields.push({
      label: questionText || getLabel(wrapper, first) || name,
      tag: 'INPUT',
      type: 'radio',
      id: null,
      name,
      ariaLabel: null,
      ariaRequired: first.getAttribute('aria-required') || null,
      required: first.required,
      value: [...radios].find(r => r.checked)?.value || '',
      wrapperAutoId: wrapper?.getAttribute('data-automation-id') || null,
      autoIdChain: getAutoIdChain(first),
      section: getSection(first),
      widget: {
        widgetType: 'radio-group',
        options: [...radios].map(r => ({
          value: r.value,
          label: r.closest('label')?.textContent?.trim() || document.querySelector(`label[for="${r.id}"]`)?.textContent?.trim() || r.value,
          id: r.id,
        })),
        interactionSteps: [`document.querySelector('input[name="${name}"][value="VALUE"]').click()`],
      },
    });
  }

  // ═══════════════════════════════════════
  // SCAN 5: Navigation buttons
  // ═══════════════════════════════════════
  document.querySelectorAll('button, [role="button"]').forEach(btn => {
    if (btn.offsetWidth === 0) return;
    const text = btn.textContent?.trim()?.substring(0, 60) || '';
    const aid = btn.getAttribute('data-automation-id') || '';
    const ariaLabel = btn.getAttribute('aria-label') || '';
    const combined = `${text} ${aid} ${ariaLabel}`.toLowerCase();

    if (!/add|next|continue|save|back|submit|previous|delete|remove|upload|attach/.test(combined)) return;

    let category = 'other';
    if (/submit/.test(combined)) category = 'submit';
    else if (/next|continue|save and continue|pageFooterNext/i.test(combined)) category = 'next';
    else if (/back|previous|pageFooterPrevious/i.test(combined)) category = 'back';
    else if (/^add|add another|add-button/i.test(combined)) category = 'add';
    else if (/delete|remove/i.test(combined)) category = 'delete';
    else if (/upload|attach/i.test(combined)) category = 'upload';

    out.navigation.push({
      text,
      automationId: aid || null,
      ariaLabel: ariaLabel || null,
      category,
      selector: aid ? `[data-automation-id="${aid}"]` : null,
    });
  });

  // ═══════════════════════════════════════
  // SCAN 6: File upload zones
  // ═══════════════════════════════════════
  document.querySelectorAll('input[type="file"], [data-automation-id*="file"], [data-automation-id*="upload"], [data-automation-id*="attach"]').forEach(el => {
    const key = 'file-' + (el.id || el.getAttribute('data-automation-id') || Math.random());
    if (seen.has(key)) return;
    seen.add(key);
    if (el.tagName === 'INPUT' && el.type === 'file' && out.fields.some(f => f.id === el.id)) return;

    const wrapper = el.closest('[data-automation-id]') || el.parentElement;
    out.fields.push({
      label: getLabel(wrapper, el) || 'File Upload',
      tag: el.tagName,
      type: 'file',
      id: el.id || null,
      wrapperAutoId: wrapper?.getAttribute('data-automation-id') || null,
      autoIdChain: getAutoIdChain(el),
      section: getSection(el),
      widget: {
        widgetType: 'file-upload',
        accept: el.getAttribute('accept') || '',
        interactionSteps: ['DataTransfer API: create File, set input.files'],
      },
    });
  });

  // ═══ Dedupe: remove radio individuals if radio-group already captured ═══
  const radioGroupNames = new Set(out.fields.filter(f => f.widget?.widgetType === 'radio-group').map(f => f.name));
  out.fields = out.fields.filter(f => {
    if (f.type === 'radio' && f.widget?.widgetType !== 'radio-group' && radioGroupNames.has(f.name)) return false;
    return true;
  });

  // ═══ Summary ═══
  const summary = {};
  out.fields.forEach(f => {
    const wt = f.widget?.widgetType || f.type;
    summary[wt] = (summary[wt] || 0) + 1;
  });
  out.summary = summary;
  out.totalFields = out.fields.length;

  // ═══ Output ═══
  const json = JSON.stringify(out, null, 2);
  console.log(json);
  try { copy(json); console.log('\n✅ Copied to clipboard! Paste to Claude.'); } catch(e) { console.log('\n⚠️ Auto-copy failed — manually select the JSON above and copy.'); }
  return out;
})();


////////////////////////////////////////////////////////////////////

// ═══ JAOS Workday Page 1 Fill v7 — force close + country code ═══
(async () => {
  const delay = ms => new Promise(r => setTimeout(r, ms));

  function setVal(el, val) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
                || Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    setter?.call(el, val);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function pressEnter(el) {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
  }

  function forceClosePopup() {
    // Triple kill: Escape on document, Escape on active element, click body
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    document.body.click();
    // Also click outside any popup
    const overlay = document.querySelector('[data-automation-id="overlay"], [class*="overlay"], [class*="blanket"]');
    if (overlay) overlay.click();
  }

  function fillText(id, val) {
    const el = document.getElementById(id);
    if (!el) { console.log(`❌ #${id} not found`); return; }
    setVal(el, val);
    el.dispatchEvent(new Event('blur', { bubbles: true }));
    console.log(`✅ #${id} = "${val}"`);
  }

  async function fillMultiselect(inputId, searchText, exactMatch) {
    const input = document.getElementById(inputId);
    if (!input) { console.log(`❌ #${inputId} not found`); return false; }
    const ms = input.closest('[data-automation-id="multiSelectContainer"]');

    if (ms?.querySelector('[data-automation-id="DELETE_charm"]')) {
      console.log(`✅ #${inputId} already selected — skip`);
      return true;
    }

    forceClosePopup(); await delay(800);

    // Type search
    input.focus(); input.click();
    await delay(300);
    setVal(input, searchText);
    await delay(500);
    pressEnter(input);
    console.log(`⌨️ #${inputId}: typed "${searchText}" + Enter`);
    await delay(4000);

    // Click match
    let found = false;
    for (let i = 0; i < 6; i++) {
      for (const o of document.querySelectorAll('[role="option"]')) {
        const text = o.textContent.trim();
        if (/^search results/i.test(text)) continue;
        const match = exactMatch ? text === exactMatch : text.toLowerCase().includes(searchText.toLowerCase());
        if (match) {
          o.click();
          console.log(`✅ #${inputId}: clicked "${text}"`);
          found = true; break;
        }
      }
      if (found) break;
      const lb = document.querySelector('[role="listbox"]');
      if (lb) lb.scrollTop += 200;
      await delay(1000);
    }

    // Force close popup no matter what
    await delay(500);
    forceClosePopup();
    await delay(500);
    forceClosePopup(); // double close for stubborn popups
    await delay(500);

    // Blur the input to dismiss
    input.blur();
    document.querySelector('[data-automation-id="pageHeaderText"], h1, h2')?.click();
    await delay(1000);

    if (!found) console.log(`❌ #${inputId}: failed for "${searchText}"`);
    return found;
  }

  const p = {
    firstName: 'Akhil', middleName: '', lastName: 'Mohammad',
    address: '123 Main Street', city: 'Visakhapatnam', postalCode: '530001',
    phone: '9876543210',
  };

  console.log('═══ JAOS Page 1 Fill v7 ═══');

  await fillMultiselect('source--source', 'Social Media', 'Social Media');
  document.querySelector('input[name="candidateIsPreviousWorker"][value="false"]')?.click();
  console.log('✅ radio: No');
  fillText('name--legalName--firstName', p.firstName);
  fillText('name--legalName--middleName', p.middleName);
  fillText('name--legalName--lastName', p.lastName);
  fillText('address--addressLine1', p.address);
  fillText('address--city', p.city);
  fillText('address--postalCode', p.postalCode);
  await fillMultiselect('phoneNumber--countryPhoneCode', '+91', 'India (+91)');
  fillText('phoneNumber--phoneNumber', p.phone);

  console.log('═══ JAOS Page 1 Fill v7 Complete ═══');
})();