(function () {
  function setRootScale() {
    var w = window.innerWidth || document.documentElement.clientWidth;
    var h = window.innerHeight || document.documentElement.clientHeight;
    var size = Math.max(10, Math.min(w, h) / 50);
    document.documentElement.style.fontSize = size + "px";
  }

  setRootScale();
  window.addEventListener("resize", setRootScale);
  window.addEventListener("orientationchange", setRootScale);

  var stateEl = document.getElementById("state");
  var messageEl = document.getElementById("message");
  var backAtEl = document.getElementById("back-at");
  var clockEl = document.getElementById("clock");
  var lastSeenOnline = 0;
  var cacheKey = "rssign:last-status";
  var timezone = "America/Vancouver";

  function applyStatus(status) {
    document.body.className = "";

    if (status.backAt) {
      document.body.className = "closed back-in";
      stateEl.textContent = "We'll be back @";
      backAtEl.textContent = formatBackAt(status.backAt);
      messageEl.textContent = "";
      return;
    }

    document.body.className = status.state;
    stateEl.textContent = status.state === "open" ? "We're open" : "Closed";
    messageEl.textContent = status.message || defaultMessage(status);
    backAtEl.textContent = "";
  }

  function formatBackAt(isoDate) {
    return new Date(isoDate).toLocaleString("en-CA", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }

  function defaultMessage(status) {
    if (status.state === "open") {
      return "Come on in.";
    }

    if (status.nextChange) {
      return (
        "Next change: " +
        new Date(status.nextChange).toLocaleString([], {
          weekday: "long",
          hour: "numeric",
          minute: "2-digit",
        })
      );
    }

    return "Please check back soon.";
  }

  function updateClock() {
    var now = new Date();
    clockEl.textContent = now.toLocaleString("en-CA", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
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
        window.localStorage.setItem(cacheKey, JSON.stringify(status));
        applyStatus(status);
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
