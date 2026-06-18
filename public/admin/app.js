(function () {
  var passwordInput = document.getElementById("password");
  var savePasswordButton = document.getElementById("save-password");
  var statusBadgeEl = document.getElementById("status-badge");
  var statusDetailsEl = document.getElementById("status-details");
  var hoursEl = document.getElementById("hours");
  var noticeEl = document.getElementById("notice");
  var passwordKey = "rssign:admin-password";
  var timezone = "America/Vancouver";

  passwordInput.value = window.localStorage.getItem(passwordKey) || "";

  savePasswordButton.addEventListener("click", function () {
    window.localStorage.setItem(passwordKey, passwordInput.value);
    notify("Password saved in this browser.");
  });

  document.querySelectorAll("[data-override]").forEach(function (button) {
    button.addEventListener("click", function () {
      postJson("/api/override", { state: button.getAttribute("data-override") }).then(refresh);
    });
  });

  document.getElementById("auto").addEventListener("click", function () {
    postJson("/api/auto", {}).then(refresh);
  });

  document.getElementById("message-form").addEventListener("submit", function (event) {
    event.preventDefault();
    var message = document.getElementById("message").value;
    postJson("/api/override", { state: "closed", message: message }).then(refresh);
  });

  document.getElementById("back-in-form").addEventListener("submit", function (event) {
    event.preventDefault();
    var time = document.getElementById("back-in-time").value;
    postJson("/api/back-in", { time: time }).then(refresh);
  });

  document.getElementById("hours-form").addEventListener("submit", function (event) {
    event.preventDefault();
    postJson("/api/hours", {
      day: document.getElementById("day").value,
      isOpen: document.getElementById("is-open").checked,
      openTime: document.getElementById("open-time").value,
      closeTime: document.getElementById("close-time").value,
    }).then(refresh);
  });

  function headers() {
    return {
      "content-type": "application/json",
      "x-admin-password": passwordInput.value,
    };
  }

  function postJson(url, body) {
    return fetch(url, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
    })
      .then(handleResponse)
      .then(function (data) {
        notify("Saved.");
        return data;
      })
      .catch(function (error) {
        notify(error.message, true);
      });
  }

  function handleResponse(response) {
    return response.json().then(function (body) {
      if (!response.ok) {
        throw new Error(body.error || "Request failed");
      }
      return body;
    });
  }

  function formatTime(isoDate) {
    return new Date(isoDate).toLocaleString("en-CA", {
      timeZone: timezone,
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }

  function renderStatus(status) {
    statusBadgeEl.className = "status-badge";

    if (status.backAt) {
      statusBadgeEl.className = "status-badge back-in";
      statusBadgeEl.innerHTML =
        'We&rsquo;ll be back @ <span>' + formatTime(status.backAt) + "</span>";
    } else if (status.state === "open") {
      statusBadgeEl.className = "status-badge open";
      statusBadgeEl.textContent = "We're open";
    } else {
      statusBadgeEl.className = "status-badge closed";
      statusBadgeEl.textContent = "Closed";
    }

    var details = [];
    if (status.message) {
      details.push(["Message", status.message]);
    }
    details.push(["Source", status.source === "override" ? "Manual override" : "Automatic schedule"]);
    if (status.nextChange) {
      details.push(["Next change", formatTime(status.nextChange)]);
    }

    statusDetailsEl.innerHTML = details
      .map(function (item) {
        return "<dt>" + item[0] + "</dt><dd>" + item[1] + "</dd>";
      })
      .join("");
  }

  function refresh() {
    fetch("/api/status", { cache: "no-store" })
      .then(handleResponse)
      .then(renderStatus)
      .catch(function (error) {
        statusBadgeEl.className = "status-badge closed";
        statusBadgeEl.textContent = "Unavailable";
        statusDetailsEl.innerHTML = "<dt>Error</dt><dd>" + error.message + "</dd>";
      });

    fetch("/api/hours", { cache: "no-store" })
      .then(handleResponse)
      .then(function (payload) {
        hoursEl.innerHTML = payload.hours
          .map(function (item) {
            var label = item.dayName.charAt(0).toUpperCase() + item.dayName.slice(1);
            var value = item.isOpen ? item.openTime + " – " + item.closeTime : "Closed";
            var rowClass = item.isOpen ? "hours-row" : "hours-row is-closed";
            return (
              '<div class="' +
              rowClass +
              '"><span>' +
              label +
              '</span><span class="hours-value">' +
              value +
              "</span></div>"
            );
          })
          .join("");
      })
      .catch(function (error) {
        hoursEl.textContent = error.message;
      });
  }

  function notify(message, isError) {
    noticeEl.textContent = message || "";
    noticeEl.classList.toggle("is-error", Boolean(isError));
  }

  refresh();
  window.setInterval(refresh, 10000);
})();
