(window.__jaosAtsAdapters = window.__jaosAtsAdapters || []).push({
  name: "jobvite",
  detect: () =>
    /jobvite\.com/i.test(window.location.hostname) ||
    !!document.querySelector(".jv-application-form"),
  selectors: [
    ['input[name="firstName"]', "first_name"],
    ['input[name="lastName"]', "last_name"],
    ['input[name="email"]', "email"],
    ['input[name="phone"]', "phone"],
    ['input[name="address.city"]', "city"],
    ['input[name="address.state"]', "state"],
    ['input[name="linkedIn"]', "linkedin"],
  ],
});
