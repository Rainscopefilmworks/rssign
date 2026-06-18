(function () {
  var passwordInput = document.getElementById("password");
  var savePasswordButton = document.getElementById("save-password");
  var statusEl = document.getElementById("status");
  var hoursEl = document.getElementById("hours");
  var noticeEl = document.getElementById("notice");
  var passwordKey = "rssign:admin-password";

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

  function refresh() {
    fetch("/api/status", { cache: "no-store" })
      .then(handleResponse)
      .then(function (status) {
        statusEl.textContent = JSON.stringify(status, null, 2);
      })
      .catch(function (error) {
        statusEl.textContent = error.message;
      });

    fetch("/api/hours", { cache: "no-store" })
      .then(handleResponse)
      .then(function (payload) {
        hoursEl.innerHTML = payload.hours
          .map(function (item) {
            var label = item.dayName.charAt(0).toUpperCase() + item.dayName.slice(1);
            var value = item.isOpen ? item.openTime + "-" + item.closeTime : "Closed";
            return "<div><strong>" + label + ":</strong> " + value + "</div>";
          })
          .join("");
      })
      .catch(function (error) {
        hoursEl.textContent = error.message;
      });
  }

  function notify(message, isError) {
    noticeEl.textContent = message || "";
    noticeEl.style.color = isError ? "#b66464" : "#8ba68f";
  }

  refresh();
  window.setInterval(refresh, 10000);
})();
