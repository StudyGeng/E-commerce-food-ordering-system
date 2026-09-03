(function () {
  var ui = window.FoodUI;
  var store = window.FoodStore;

  function summaryHtml(detail) {
    if (!detail.items.length) {
      return [
        '<div class="summary-title">',
        "<div><p class=\"eyebrow\">Checkout</p><h2>No items</h2></div>",
        "</div>",
        '<p class="muted">Add food to your cart before placing an order.</p>',
        '<a class="button full" href="index.html"><i data-lucide="utensils"></i>Browse menu</a>'
      ].join("");
    }

    return [
      '<div class="summary-title">',
      "<div><p class=\"eyebrow\">Order</p><h2>Summary</h2></div>",
      '<span class="count-pill">' + detail.count + " items</span>",
      "</div>",
      '<ul class="summary-list">',
      detail.items.map(function (entry) {
        return [
          "<li>",
          "<span>",
          "<strong>" + ui.escapeHtml(entry.item.name) + "</strong>",
          "<small>" + ui.escapeHtml(entry.stall ? entry.stall.name : "Food stall") + " x " + entry.quantity + "</small>",
          "</span>",
          "<strong>" + ui.money(entry.line_total) + "</strong>",
          "</li>"
        ].join("");
      }).join(""),
      "</ul>",
      '<div class="summary-line"><span>Subtotal</span><strong>' + ui.money(detail.subtotal) + "</strong></div>",
      '<div class="summary-line"><span>Service fee</span><strong>' + ui.money(detail.serviceFee) + "</strong></div>",
      '<div class="summary-line total-line"><span>Total</span><strong>' + ui.money(detail.total) + "</strong></div>"
    ].join("");
  }

  function selectedPaymentMethod(form) {
    var checked = form && form.querySelector('input[name="payment_method"]:checked');
    return checked ? checked.value : "Sandbox Card";
  }

  function paymentButtonHtml(method) {
    if (method === "Sandbox Wallet") return '<i data-lucide="wallet"></i>Open e-wallet';
    if (method === "Pay at Counter") return '<i data-lucide="receipt-text"></i>Print counter e-receipt';
    return '<i data-lucide="credit-card"></i>Pay by card';
  }

  function paymentNote(method) {
    if (method === "Sandbox Wallet") {
      return "E-wallet opens a demo approval popup before the order is sent.";
    }
    if (method === "Pay at Counter") {
      return "Counter payment sends the order first, then opens a printable e-receipt.";
    }
    return "Card payment opens a secure demo confirmation before the order is sent.";
  }

  function updatePaymentState() {
    var form = ui.qs("#checkout-form");
    var button = ui.qs("#place-order-button");
    var note = ui.qs("#payment-note");
    if (!form || !button) return;

    var method = selectedPaymentMethod(form);
    button.innerHTML = paymentButtonHtml(method);
    if (note) note.textContent = paymentNote(method);
    ui.hydrateIcons();
  }

  function guestCustomerPayload(table) {
    var customer = (window.AppConfig && window.AppConfig.guestCustomer) || {};
    return {
      id: customer.id || "",
      name: customer.name || "Guest Customer",
      email: customer.email || "",
      phone: customer.phone || "",
      pickup_note: table ? ui.tableLabel(table) : ""
    };
  }

  function paymentModalTitle(method) {
    return method === "Sandbox Wallet" ? "Approve e-wallet payment" : "Confirm card payment";
  }

  function paymentModalBody(method, detail, table) {
    if (method === "Sandbox Wallet") {
      return [
        '<div class="wallet-approval">',
        '<div class="wallet-qr" aria-hidden="true"></div>',
        "<div>",
        "<strong>Waiting for e-wallet approval</strong>",
        "<p>Use the demo approval button to continue. A real wallet API can be connected later from this step.</p>",
        "</div>",
        "</div>"
      ].join("");
    }

    return [
      '<div class="payment-preview">',
      '<div><span>Card</span><strong>Sandbox card payment</strong></div>',
      '<div><span>Table</span><strong>' + ui.escapeHtml(ui.tableLabel(table)) + "</strong></div>",
      '<div><span>Total</span><strong>' + ui.money(detail.total) + "</strong></div>",
      "</div>"
    ].join("");
  }

  function confirmOnlinePayment(method, detail, table) {
    return new Promise(function (resolve) {
      var old = ui.qs("[data-payment-modal]");
      if (old) old.remove();

      var modal = document.createElement("div");
      modal.className = "modal-backdrop";
      modal.setAttribute("data-payment-modal", "");
      modal.innerHTML = [
        '<section class="payment-modal" role="dialog" aria-modal="true" aria-label="' + ui.escapeHtml(paymentModalTitle(method)) + '">',
        '<div class="live-order-popup-top">',
        "<div>",
        '<p class="eyebrow">Sandbox payment</p>',
        "<h2>" + ui.escapeHtml(paymentModalTitle(method)) + "</h2>",
        '<p>' + ui.escapeHtml(ui.tableLabel(table)) + " - " + detail.count + " item" + (detail.count === 1 ? "" : "s") + "</p>",
        "</div>",
        '<button class="icon-button" type="button" data-payment-cancel aria-label="Close payment popup">',
        '<i data-lucide="x"></i>',
        "</button>",
        "</div>",
        paymentModalBody(method, detail, table),
        '<div class="summary-line total-line"><span>Total</span><strong>' + ui.money(detail.total) + "</strong></div>",
        '<div class="payment-modal-actions">',
        '<button class="button ghost" type="button" data-payment-cancel>Cancel</button>',
        '<button class="button full" type="button" data-payment-confirm><i data-lucide="badge-check"></i>Confirm payment</button>',
        "</div>",
        "</section>"
      ].join("");

      function close(confirmed) {
        modal.remove();
        resolve(Boolean(confirmed));
      }

      modal.addEventListener("click", function (event) {
        if (event.target.matches("[data-payment-modal]") || event.target.closest("[data-payment-cancel]")) {
          close(false);
          return;
        }

        if (event.target.closest("[data-payment-confirm]")) {
          close(true);
        }
      });

      document.body.appendChild(modal);
      ui.hydrateIcons();
    });
  }

  async function renderCheckout() {
    var detail = await store.getCartDetailed();
    var target = ui.qs("#checkout-summary");
    var button = ui.qs("#place-order-button");
    var table = store.getCurrentTable();

    if (target) target.innerHTML = summaryHtml(detail);
    if (button) button.disabled = !detail.items.length;
    ui.qsa("[data-checkout-table]").forEach(function (node) {
      node.textContent = ui.tableLabel(table);
    });
    await ui.refreshCartBadge();
    updatePaymentState();
    ui.hydrateIcons();
  }

  function bindForm() {
    var form = ui.qs("#checkout-form");
    if (!form) return;

    form.addEventListener("change", function (event) {
      if (event.target.matches('input[name="payment_method"]')) {
        updatePaymentState();
      }
    });

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      var button = ui.qs("#place-order-button");
      if (button) button.disabled = true;

      try {
        var selectedPayment = selectedPaymentMethod(form);
        var table = store.getCurrentTable();
        var detail = await store.getCartDetailed();
        if (!detail.items.length) throw new Error("Cart is empty.");
        if (selectedPayment !== "Pay at Counter") {
          var approved = await confirmOnlinePayment(selectedPayment, detail, table);
          if (!approved) {
            if (button) button.disabled = false;
            return;
          }
        }

        var order = await store.createOrder({
          customer: guestCustomerPayload(table),
          paymentMethod: selectedPayment,
          table: table
        });

        await store.clearCart();
        ui.toast(selectedPayment === "Pay at Counter" ? "Order placed. Counter e-bill ready." : "Order placed successfully.");
        window.setTimeout(function () {
          var target = "orders.html?order=" + encodeURIComponent(order.id);
          if (selectedPayment === "Pay at Counter") target += "&bill=1";
          window.location.href = target;
        }, 450);
      } catch (error) {
        ui.toast(error.message || "Unable to place order.", "error");
        if (button) button.disabled = false;
      }
    });
  }

  document.addEventListener("DOMContentLoaded", async function () {
    if (!document.body.matches('[data-page="checkout"]')) return;
    var tableCode = new URLSearchParams(window.location.search).get("table");
    if (tableCode) await store.setCurrentTable(tableCode);
    renderCheckout();
    bindForm();
  });
})();
