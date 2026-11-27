(function () {
  function fixViewportHeight() {
    var h = window.innerHeight || document.documentElement.clientHeight;
    document.documentElement.style.height = h + "px";
    document.body.style.height = h + "px";
    var sign = document.querySelector(".sign");
    if (sign) {
      sign.style.height = h + "px";
    }
  }

  function onViewportChange() {
    fixViewportHeight();
    window.setTimeout(fixViewportHeight, 250);
  }

  fixViewportHeight();
  window.addEventListener("resize", onViewportChange);
  window.addEventListener("orientationchange", onViewportChange);

  var stateEl = document.getElementById("state");
  var messageEl = document.getElementById("message");
  var backAtEl = document.getElementById("back-at");
  var clockEl = document.getElementById("clock");
  var lastSeenOnline = 0;
  var cacheKey = "rssign:last-status";

  function applyStatus(status) {
    document.body.classList.remove("open", "closed", "back-in");

    if (status.backAt) {
      document.body.classList.add("closed", "back-in");
      stateEl.textContent = "We'll be back @";
      backAtEl.hidden = false;
      backAtEl.textContent = formatBackAt(status);
      messageEl.textContent = "";
      return;
    }

    backAtEl.hidden = true;
    document.body.classList.add(status.state);
    stateEl.textContent = status.state === "open" ? "We're open" : "Closed";
    messageEl.textContent = status.message || defaultMessage(status);
  }

  function formatBackAt(status) {
    return window.StudioTime.time(status.backAt, status.backAtLabel);
  }

  function defaultMessage(status) {
    if (status.state === "open") {
      return "Come on in.";
    }

    if (status.nextChange) {
      return "Next change: " + (status.nextChangeLabel || window.StudioTime.time(status.nextChange));
    }

    return "Please check back soon.";
  }

  function updateClock() {
    var now = new Date();
    clockEl.textContent = window.StudioTime.clock();
    clockEl.dateTime = now.toISOString();
  }

  function loadCachedStatus() {
    try {
      var cached = window.localStorage.getItem(cacheKey);
      if (cached) {
        applyStatus(JSON.parse(cached));
      }
    } catch (_error) {
      // Ignore malformed cache; the next successful poll will replace it.
    }
  }

  function poll() {
    fetch("/api/status", { cache: "no-store" })
      .then(function (response) {
        if (!response.ok) {
          throw new Error("status request failed");
        }
        return response.json();
      })
      .then(function (status) {
        lastSeenOnline = Date.now();
        window.StudioTime.sync(status);
        window.localStorage.setItem(cacheKey, JSON.stringify(status));
        applyStatus(status);
        updateClock();
      })
      .catch(function () {
        if (!lastSeenOnline || Date.now() - lastSeenOnline > 30000) {
          loadCachedStatus();
        }
      });
  }

  loadCachedStatus();
  updateClock();
  poll();
  window.setInterval(poll, 5000);
  window.setInterval(updateClock, 1000);
})();
