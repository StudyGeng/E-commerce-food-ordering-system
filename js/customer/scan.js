(function () {
  var ui = window.FoodUI;
  var store = window.FoodStore;
  var stream = null;
  var scanning = false;
  var tableCache = [];

  function readTableCode(value) {
    var text = String(value || "").trim();
    try {
      var url = new URL(text);
      return url.searchParams.get("table") || url.searchParams.get("table_code") || text;
    } catch (error) {
      return text;
    }
  }

  function normalizeTableText(value) {
    return String(value || "").trim().toUpperCase();
  }

  function tableSearchCandidates(value) {
    var clean = normalizeTableText(readTableCode(value));
    if (!clean) return [];

    var candidates = [clean];
    var match = clean.match(/^([A-Z]+)(\d+)$/);
    if (match) {
      var number = String(Number(match[2]));
      var paddedCode = match[1] + number.padStart(2, "0");
      if (candidates.indexOf(paddedCode) === -1) candidates.push(paddedCode);
    }
    return candidates;
  }

  function tableMatches(query, table) {
    var cleanQuery = normalizeTableText(readTableCode(query));
    if (!cleanQuery) return true;

    var code = normalizeTableText(table.code);
    var label = normalizeTableText(table.label);
    return tableSearchCandidates(cleanQuery).some(function (candidate) {
      return code.indexOf(candidate) !== -1 || label.indexOf(candidate) !== -1;
    });
  }

  function quickTableHtml(table) {
    return [
      '<button class="quick-table" type="button" data-table-code="' + ui.escapeHtml(table.code) + '">',
      "<strong>" + ui.escapeHtml(table.code) + "</strong>",
      "<span>" + ui.escapeHtml(table.label) + "</span>",
      "</button>"
    ].join("");
  }

  async function selectTable(code) {
    var message = ui.qs("#scanner-message");
    try {
      if (message) message.textContent = "Checking table code...";
      var table = await store.setCurrentTable(readTableCode(code));
      ui.toast("Table selected: " + ui.tableLabel(table));
      window.setTimeout(function () {
        window.location.href = "index.html?table=" + encodeURIComponent(table.code);
      }, 350);
    } catch (error) {
      var text = error.message || "This table QR/code cannot be used.";
      if (message) message.textContent = text;
      ui.toast(text, "error");
    }
  }

  function renderQuickTables(query) {
    var target = ui.qs("#quick-table-grid");
    if (!target) return;
    var activeTables = tableCache.filter(function (table) {
      return table.active;
    }).filter(function (table) {
      return tableMatches(query, table);
    });
    target.innerHTML = activeTables.length
      ? activeTables.map(quickTableHtml).join("")
      : '<p class="muted">No active tables match this code.</p>';
  }

  async function loadQuickTables() {
    var target = ui.qs("#quick-table-grid");
    var form = ui.qs("#table-form");
    if (target) target.innerHTML = '<p class="muted">Loading available tables...</p>';
    tableCache = await store.listTables();
    renderQuickTables(form ? form.elements.table_code.value : "");
  }

  async function scanLoop(detector, video) {
    if (!scanning) return;
    try {
      var codes = await detector.detect(video);
      if (codes.length) {
        scanning = false;
        await stopScanner();
        selectTable(codes[0].rawValue);
        return;
      }
    } catch (error) {
      ui.qs("#scanner-message").textContent = "Unable to read code from the camera frame.";
    }
    requestAnimationFrame(function () {
      scanLoop(detector, video);
    });
  }

  function createScanCanvas(video) {
    var canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    return canvas;
  }

  async function scanQrFallbackLoop(video, canvas) {
    if (!scanning) return;
    var message = ui.qs("#scanner-message");

    try {
      if (video.readyState >= 2 && video.videoWidth && video.videoHeight) {
        if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
        if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
        var context = canvas.getContext("2d", { willReadFrequently: true });
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        var image = context.getImageData(0, 0, canvas.width, canvas.height);
        var code = window.jsQR(image.data, image.width, image.height, {
          inversionAttempts: "attemptBoth"
        });

        if (code && code.data) {
          scanning = false;
          await stopScanner();
          selectTable(code.data);
          return;
        }
      }
    } catch (error) {
      if (message) message.textContent = "Unable to read QR code from the camera frame.";
    }

    requestAnimationFrame(function () {
      scanQrFallbackLoop(video, canvas);
    });
  }

  async function stopScanner() {
    scanning = false;
    if (stream) {
      stream.getTracks().forEach(function (track) {
        track.stop();
      });
      stream = null;
    }
  }

  async function createNativeDetector() {
    if (!("BarcodeDetector" in window)) return null;

    try {
      var formats = ["qr_code", "code_128", "ean_13"];
      if (typeof window.BarcodeDetector.getSupportedFormats === "function") {
        var supported = await window.BarcodeDetector.getSupportedFormats();
        formats = formats.filter(function (format) {
          return supported.indexOf(format) !== -1;
        });
      }
      if (!formats.length) return null;
      return new window.BarcodeDetector({ formats: formats });
    } catch (error) {
      return null;
    }
  }

  async function startScanner() {
    var video = ui.qs("#scanner-video");
    var message = ui.qs("#scanner-message");
    if (!video || !navigator.mediaDevices) {
      if (message) message.textContent = "Camera access needs HTTPS or localhost. Use manual table entry here, or open the app from a local server.";
      return;
    }

    if (scanning) {
      if (message) message.textContent = "Scanner is already running.";
      return;
    }

    try {
      await stopScanner();
      var detector = await createNativeDetector();
      var canScanQr = typeof window.jsQR === "function";
      if (!detector && !canScanQr) {
        if (message) message.textContent = "QR scanner support did not load. Enter the table code manually.";
        return;
      }

      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false
      });
      video.srcObject = stream;
      await video.play();
      scanning = true;
      if (message) message.textContent = "Scanning... hold the table QR code inside the frame.";
      if (detector) {
        scanLoop(detector, video);
      } else {
        scanQrFallbackLoop(video, createScanCanvas(video));
      }
    } catch (error) {
      await stopScanner();
      if (message) message.textContent = "Camera permission was blocked or unavailable. Use manual table entry.";
    }
  }

  function bindEvents() {
    var form = ui.qs("#table-form");
    var scanner = ui.qs("#start-scanner");

    if (form) {
      form.elements.table_code.addEventListener("input", function () {
        renderQuickTables(form.elements.table_code.value);
      });

      form.addEventListener("submit", function (event) {
        event.preventDefault();
        selectTable(form.elements.table_code.value);
      });
    }

    if (scanner) {
      scanner.addEventListener("click", startScanner);
    }

    document.addEventListener("click", function (event) {
      var button = event.target.closest("[data-table-code]");
      if (button) selectTable(button.dataset.tableCode);
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (!document.body.matches('[data-page="scan"]')) return;
    loadQuickTables();
    bindEvents();
  });

  window.addEventListener("beforeunload", stopScanner);
})();
