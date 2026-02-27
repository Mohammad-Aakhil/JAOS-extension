(window.__jaosAtsAdapters = window.__jaosAtsAdapters || []).push({
  name: "lever",
  detect: () => /jobs\.lever\.co/i.test(window.location.hostname),
  selectors: [
    ['input[name="name"]', "name"],
    ['input[name="email"]', "email"],
    ['input[name="phone"]', "phone"],
    ['input[name="org"]', "current_company"],
    ['input[name="urls[LinkedIn]"]', "linkedin"],
    ['input[name="urls[GitHub]"]', "github"],
    ['input[name="urls[Portfolio]"]', "portfolio"],
    ['input[name="urls[Twitter]"]', "twitter"],
    ['textarea[name="comments"]', "cover_letter"],
  ],
});
