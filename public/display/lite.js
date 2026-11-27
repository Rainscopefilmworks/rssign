(function () {
  function fixViewportHeight() {
    var h = window.innerHeight || document.documentElement.clientHeight;
    var w = window.innerWidth || document.documentElement.clientWidth;
    document.documentElement.style.height = h + "px";
    document.documentElement.style.width = w + "px";
    document.body.style.height = h + "px";
    document.body.style.width = w + "px";
    var sign = document.querySelector(".sign");
    if (sign) {
      sign.style.height = h + "px";
      sign.style.width = w + "px";
    }
  }

  function setRootScale() {
    var w = window.innerWidth || document.documentElement.clientWidth;
    var h = window.innerHeight || document.documentElement.clientHeight;
    var isLandscape = w >= h;
    // Kiosk sign: scale type from the short edge so landscape fills the height.
    var basis = isLandscape ? h : w;
    var size = Math.max(14, basis / 20);
    document.documentElement.style.fontSize = size + "px";
    fixViewportHeight();
  }

  function onViewportChange() {
    setRootScale();
    window.setTimeout(setRootScale, 250);
    window.setTimeout(setRootScale, 750);
  }

  setRootScale();
  window.addEventListener("resize", onViewportChange);
  window.addEventListener("orientationchange", onViewportChange);

  var stateEl = document.getElementById("state");
  var messageEl = document.getElementById("message");
  var backAtEl = document.getElementById("back-at");
  var clockEl = document.getElementById("clock");
  var lastSeenOnline = 0;
  var cacheKey = "rssign:last-status";

  function applyStatus(status) {
    document.body.className = "";

    if (status.backAt) {
      document.body.className = "closed back-in";
      stateEl.textContent = "We'll be back @";
      backAtEl.textContent = formatBackAt(status);
      messageEl.textContent = "";
      return;
    }

    document.body.className = status.state;
    stateEl.textContent = status.state === "open" ? "We're open" : "Closed";
    messageEl.textContent = status.message || defaultMessage(status);
    backAtEl.textContent = "";
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
    clockEl.textContent = window.StudioTime.clock();
  }

  function loadCachedStatus() {
    try {
      var cached = window.localStorage.getItem(cacheKey);
      if (cached) {
        applyStatus(JSON.parse(cached));
      }
    } catch (_error) {
      // Ignore malformed cache.
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
