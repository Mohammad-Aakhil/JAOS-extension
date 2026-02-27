(window.__jaosAtsAdapters = window.__jaosAtsAdapters || []).push({
  name: "taleo",
  detect: () =>
    /taleo\.net/i.test(window.location.hostname) ||
    /oracle\.com.*\/hcmUI\//i.test(window.location.href) ||
    !!document.querySelector("#requisitionDescriptionInterface"),
  selectors: [
    ['input[id*="FirstName"], input[name*="FirstName"]', "first_name"],
    ['input[id*="LastName"], input[name*="LastName"]', "last_name"],
    ['input[id*="Email"], input[name*="Email"]', "email"],
    ['input[id*="Phone"], input[name*="Phone"]', "phone"],
    ['input[id*="City"], input[name*="City"]', "city"],
    ['select[id*="State"], select[name*="State"]', "state"],
    ['select[id*="Country"], select[name*="Country"]', "country"],
  ],
});
