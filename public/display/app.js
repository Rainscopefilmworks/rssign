(function () {
  var stateEl = document.getElementById("state");
  var messageEl = document.getElementById("message");
  var sourceEl = document.getElementById("source");
  var offlineEl = document.getElementById("offline");
  var lastSeenOnline = 0;
  var cacheKey = "rssign:last-status";

  function applyStatus(status, fromCache) {
    document.body.classList.remove("open", "closed");
    document.body.classList.add(status.state);

    stateEl.textContent = status.state === "open" ? "We're open" : "Closed";
    messageEl.textContent = status.message || defaultMessage(status);
    sourceEl.textContent = fromCache
      ? "Last known status"
      : status.source === "override"
        ? "Manual override"
        : "Automatic schedule";
  }

  function defaultMessage(status) {
    if (status.state === "open") {
      return "Come on in.";
    }

    if (status.nextChange) {
      return "Next change: " + new Date(status.nextChange).toLocaleString([], {
        weekday: "long",
        hour: "numeric",
        minute: "2-digit",
      });
    }

    return "Please check back soon.";
  }

  function setOffline(isOffline) {
    offlineEl.hidden = !isOffline;
  }

  function loadCachedStatus() {
    try {
      var cached = window.localStorage.getItem(cacheKey);
      if (cached) {
        applyStatus(JSON.parse(cached), true);
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
        setOffline(false);
        window.localStorage.setItem(cacheKey, JSON.stringify(status));
        applyStatus(status, false);
      })
      .catch(function () {
        if (!lastSeenOnline || Date.now() - lastSeenOnline > 30000) {
          setOffline(true);
          loadCachedStatus();
        }
      });
  }

  loadCachedStatus();
  poll();
  window.setInterval(poll, 5000);
})();
