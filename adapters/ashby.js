(window.__jaosAtsAdapters = window.__jaosAtsAdapters || []).push({
  name: "ashby",
  detect: () =>
    /jobs\.ashbyhq\.com/i.test(window.location.hostname) ||
    !!document.querySelector('[data-testid="application-form"]'),
  selectors: [
    ['input[name="name"], input[name="_systemfield_name"]', "name"],
    ['input[name="email"], input[name="_systemfield_email"]', "email"],
    ['input[name="phone"], input[name="_systemfield_phone"]', "phone"],
    ['input[name="org"], input[name="_systemfield_company"]', "current_company"],
    ['input[name="linkedIn"], input[name="_systemfield_linkedin"]', "linkedin"],
    ['input[name="github"]', "github"],
    ['input[name="portfolio"]', "portfolio"],
    ['textarea[name="coverLetter"]', "cover_letter"],
  ],
});
