// Shows times in the studio's time zone without relying on the tablet.
//
// Old kiosk tablets often have the wrong time zone (or clock) set, and older
// Android browsers ignore the Intl `timeZone` option entirely, so
// toLocaleString() quietly falls back to the device's zone. Instead, the
// server sends its clock and the studio's current UTC offset (DST-aware) with
// every status poll, and we do the arithmetic here with plain UTC getters.
(function () {
  var timezone = "America/Vancouver";
  var studioMinusDeviceMs = null; // (studio wall clock as UTC) - device clock
  var studioOffsetMinutes = null;

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function formatWallClock(wall) {
    var hours = wall.getUTCHours();
    var suffix = hours < 12 ? "a.m." : "p.m.";
    var hour12 = hours % 12 === 0 ? 12 : hours % 12;
    return hour12 + ":" + pad2(wall.getUTCMinutes()) + " " + suffix;
  }

  function intlHandlesZone() {
    try {
      var resolved = new Intl.DateTimeFormat("en-US", { timeZone: timezone }).resolvedOptions();
      return resolved.timeZone === timezone;
    } catch (_error) {
      return false;
    }
  }

  function formatWithIntl(date) {
    return date.toLocaleString("en-CA", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }

  window.StudioTime = {
    // Call with every fresh /api/status response (not cached ones).
    sync: function (status) {
      if (!status || typeof status.utcOffsetMinutes !== "number") {
        return;
      }
      var serverMs = new Date(status.serverTime).getTime();
      if (isNaN(serverMs)) {
        return;
      }
      if (typeof status.timezone === "string" && status.timezone) {
        timezone = status.timezone;
      }
      studioOffsetMinutes = status.utcOffsetMinutes;
      studioMinusDeviceMs = serverMs + studioOffsetMinutes * 60000 - Date.now();
    },

    // Current studio time, e.g. "1:50 p.m.".
    clock: function () {
      if (studioMinusDeviceMs !== null) {
        return formatWallClock(new Date(Date.now() + studioMinusDeviceMs));
      }
      return intlHandlesZone() ? formatWithIntl(new Date()) : "";
    },

    // Studio time for an ISO timestamp. Prefer the server's label when given.
    time: function (isoDate, serverLabel) {
      if (serverLabel) {
        return serverLabel;
      }
      var ms = new Date(isoDate).getTime();
      if (isNaN(ms)) {
        return "";
      }
      if (intlHandlesZone()) {
        return formatWithIntl(new Date(ms));
      }
      if (studioOffsetMinutes !== null) {
        return formatWallClock(new Date(ms + studioOffsetMinutes * 60000));
      }
      return "";
    },
  };
})();
