(function () {
  var statusOrder = ["Pending", "Preparing", "Completed"];
  var liveProgressTimer = null;
  var livePopupKeyPrefix = "foodorder_live_progress_popup_v1_";
  var pendingReminderKeyPrefix = "foodorder_pending_reminder_v1_";

  function qs(selector, scope) {
    return (scope || document).querySelector(selector);
  }

  function qsa(selector, scope) {
    return Array.prototype.slice.call((scope || document).querySelectorAll(selector));
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function money(value) {
    var currency = (window.AppConfig && window.AppConfig.currency) || "RM";
    return currency + " " + Number(value || 0).toFixed(2);
  }

  function formatDate(value) {
    if (!value) return "-";
    return new Date(value).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function statusClass(status) {
    return "status-" + String(status || "").toLowerCase().replace(/\s+/g, "-");
  }

  function statusLabel(status) {
    if (status === "Preparing") return "Received";
    if (status === "Ready") return "Received";
    return status || "Pending";
  }

  function progressStatus(status) {
    return status === "Ready" ? "Preparing" : status;
  }

  function configMinutes(name, fallback) {
    var value = window.AppConfig && Number(window.AppConfig[name]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  function pendingWarningMinutes() {
    return configMinutes("pendingOrderWarningMinutes", 10);
  }

  function pendingAutoCancelMinutes() {
    return configMinutes("pendingOrderAutoCancelMinutes", 15);
  }

  function orderAgeMinutes(order) {
    var created = new Date(order && order.created_at).getTime();
    if (!Number.isFinite(created)) return 0;
    return Math.max(0, Math.floor((Date.now() - created) / 60000));
  }

  function orderElapsedMinutes(order) {
    var created = new Date(order && order.created_at).getTime();
    var updated = new Date(order && order.updated_at).getTime();
    if (!Number.isFinite(created) || !Number.isFinite(updated)) return 0;
    return Math.max(0, Math.floor((updated - created) / 60000));
  }

  function isPendingTooLong(order) {
    return order && order.status === "Pending" && orderAgeMinutes(order) >= pendingWarningMinutes();
  }

  function isAutoCancelled(order) {
    return Boolean(
      order &&
      order.status === "Cancelled" &&
      (order.auto_cancelled_at || order.cancellation_reason || orderElapsedMinutes(order) >= pendingAutoCancelMinutes())
    );
  }

  function orderIssueLabel(order) {
    if (isAutoCancelled(order)) {
      return "Auto-cancelled after " + pendingAutoCancelMinutes() + " min without stall acceptance.";
    }
    if (isPendingTooLong(order)) {
      return "Pending for " + orderAgeMinutes(order) + " min. Please remind stall staff.";
    }
    return "";
  }

  function orderIssueHtml(order) {
    var message = orderIssueLabel(order);
    if (!message) return "";
    return [
      '<div class="order-alert-note">',
      '<i data-lucide="' + (isAutoCancelled(order) ? "circle-x" : "triangle-alert") + '"></i>',
      '<span>' + escapeHtml(message) + "</span>",
      "</div>"
    ].join("");
  }

  function imageStyle(url) {
    var fallback = "linear-gradient(135deg, #d9e9e2, #f2d7cc)";
    if (!url) return "background-image: " + fallback;
    return "background-image: url('" + escapeHtml(url) + "')";
  }

  function itemName(entry) {
    var item = entry.menu_item || entry.menu_items || entry.item || {};
    return item.name || "Menu item";
  }

  function stallName(entry) {
    var stall = entry.stall || entry.stalls || {};
    return stall.name || "Food stall";
  }

  function tableLabel(table) {
    var selected = table || (window.FoodStore && window.FoodStore.getCurrentTable && window.FoodStore.getCurrentTable());
    if (!selected) return "Please scan a table";
    return selected.label || selected.code || "Please scan a table";
  }

  function toast(message, type) {
    var old = qs(".toast");
    if (old) old.remove();

    var note = document.createElement("div");
    note.className = "toast" + (type === "error" ? " error" : "");
    note.textContent = message;
    document.body.appendChild(note);

    window.setTimeout(function () {
      note.remove();
    }, 2800);
  }

  function hydrateIcons() {
    if (window.lucide && typeof window.lucide.createIcons === "function") {
      window.lucide.createIcons();
    }
  }

  function hasOrderAccess() {
    if (!window.FoodStore) return false;
    return window.FoodStore.hasCurrentTable
      ? window.FoodStore.hasCurrentTable()
      : Boolean(window.FoodStore.getCurrentTable && window.FoodStore.getCurrentTable());
  }

  function updateAccessState() {
    var requiredRole = document.body.dataset.requiresRole;
    var session = window.FoodStore && window.FoodStore.getSession && window.FoodStore.getSession();
    var orderAccess = hasOrderAccess();
    var roleAccess = !requiredRole || Boolean(session && session.role === requiredRole);
    var sessionAccess = Boolean(session);
    document.body.classList.toggle("has-order-access", orderAccess);
    document.body.classList.toggle("has-session-access", sessionAccess);
    document.body.classList.toggle("has-role-access", roleAccess);
    document.body.classList.toggle("has-private-access", orderAccess || sessionAccess);
  }

  function requireOrderAccess() {
    if (!document.body.hasAttribute("data-requires-order-access")) return true;
    if (hasOrderAccess()) return true;
    window.location.replace("scan.html");
    return false;
  }

  async function requireRoleAccess() {
    var requiredRole = document.body.dataset.requiresRole;
    if (!requiredRole) return true;

    var session = window.FoodStore && window.FoodStore.validateSession
      ? await window.FoodStore.validateSession(requiredRole)
      : null;
    if (session && session.role === requiredRole) return true;

    window.location.replace("../main/login.html?role=" + encodeURIComponent(requiredRole));
    return false;
  }

  async function refreshCartBadge() {
    if (!window.FoodStore) return;
    var detail = await window.FoodStore.getCartDetailed();
    qsa("[data-cart-count]").forEach(function (node) {
      node.textContent = detail.count;
    });
  }

  function renderStatusSteps(status) {
    var currentIndex = statusOrder.indexOf(progressStatus(status));
    if (status === "Cancelled") currentIndex = -1;

    return '<div class="status-steps">' + statusOrder.map(function (step, index) {
      var done = currentIndex >= index ? " done" : "";
      return '<span class="status-step' + done + '">' + escapeHtml(statusLabel(step)) + "</span>";
    }).join("") + "</div>";
  }

  function isCustomerOrderPage() {
    return ["scan", "menu", "cart", "checkout", "orders"].indexOf(document.body.dataset.page) !== -1;
  }

  function canShowLiveOrderProgress() {
    return isCustomerOrderPage() && (document.body.dataset.page === "scan" || hasOrderAccess());
  }

  function selectCustomerLiveOrder(orders) {
    return orders.find(function (order) {
      return order.status !== "Completed" && order.status !== "Cancelled";
    }) || null;
  }

  async function getCustomerOrdersForCurrentTable() {
    if (!window.FoodStore || !window.FoodStore.listOrders) return [];
    var customer = (window.AppConfig && window.AppConfig.guestCustomer) || {};
    var table = window.FoodStore.getCurrentTable && window.FoodStore.getCurrentTable();
    if (!table || !table.code) return [];
    return window.FoodStore.listOrders({
      customerId: customer.id,
      tableCode: table.code
    });
  }

  async function getCustomerLiveOrder() {
    var orders = await getCustomerOrdersForCurrentTable();
    return selectCustomerLiveOrder(orders);
  }

  function liveOrderHref(order) {
    return "orders.html?order=" + encodeURIComponent(order.id);
  }

  function liveOrderPopupKey(order) {
    return livePopupKeyPrefix + order.id + "_" + (order.status || "Pending");
  }

  function orderAttentionPopupKey(order) {
    var state = isAutoCancelled(order) ? "cancelled" : "warning";
    return pendingReminderKeyPrefix + order.id + "_" + state;
  }

  function liveOrderItemsHtml(order) {
    var items = order.items || [];
    if (!items.length) return "";

    var visible = items.slice(0, 2).map(function (entry) {
      return [
        "<div>",
        "<span>" + escapeHtml(itemName(entry)) + " x " + Number(entry.quantity || 1) + "</span>",
        "<strong>" + money(Number(entry.price || 0) * Number(entry.quantity || 1)) + "</strong>",
        "</div>"
      ].join("");
    }).join("");

    var remaining = items.length > 2
      ? '<small>+' + (items.length - 2) + " more item" + (items.length - 2 === 1 ? "" : "s") + "</small>"
      : "";

    return '<div class="live-order-items">' + visible + remaining + "</div>";
  }

  function lineTotal(entry) {
    return Number(entry.price || 0) * Number(entry.quantity || 1);
  }

  function orderSubtotal(order) {
    return (order.items || []).reduce(function (sum, entry) {
      return sum + lineTotal(entry);
    }, 0);
  }

  function orderServiceFee(order) {
    return Math.max(0, Number(order.total_amount || 0) - orderSubtotal(order));
  }

  function paymentMethodLabel(value) {
    if (value === "Sandbox Card") return "Card";
    if (value === "Sandbox Wallet") return "E-wallet";
    if (value === "Pay at Counter") return "Pay at counter";
    return value || "";
  }

  function eBillCode(order) {
    return order.transaction_id || ("BILL-" + String(order.id || "").replace(/[^a-z0-9]/gi, "").slice(-8).toUpperCase());
  }

  function orderBillButtonHtml(order) {
    var counterPayment = order && (order.payment_method === "Pay at Counter" || order.payment_status === "Pending");
    if (!counterPayment || order.status === "Cancelled") return "";
    return [
      '<div class="order-actions">',
      '<button class="button ghost" type="button" data-show-ebill="' + escapeHtml(order.id) + '">',
      '<i data-lucide="receipt-text"></i>',
      "Counter e-bill",
      "</button>",
      "</div>"
    ].join("");
  }

  function canConfirmCounterPayment(order) {
    return Boolean(
      order &&
      document.body.dataset.page === "staff" &&
      order.payment_method === "Pay at Counter" &&
      order.payment_status === "Pending" &&
      order.status !== "Cancelled"
    );
  }

  function orderBillHtml(order) {
    var items = order.items || [];
    var subtotal = orderSubtotal(order);
    var serviceFee = orderServiceFee(order);
    var totalLabel = order.payment_status === "Paid" ? "Total paid" : "Total due";
    return [
      '<div class="bill-code">',
      '<span>E-bill code</span>',
      '<strong>' + escapeHtml(eBillCode(order)) + "</strong>",
      "</div>",
      '<div class="bill-meta">',
      "<div><span>Order</span><strong>#" + escapeHtml(order.id) + "</strong></div>",
      "<div><span>Table</span><strong>" + escapeHtml(order.table_label || order.pickup_note || "Counter pickup") + "</strong></div>",
      "<div><span>Payment</span><strong>" + escapeHtml(order.payment_status || "Pending") + "</strong></div>",
      "</div>",
      '<div class="bill-lines">',
      items.map(function (entry) {
        return [
          "<div>",
          "<span><strong>" + escapeHtml(itemName(entry)) + "</strong><small>" + escapeHtml(stallName(entry)) + " x " + Number(entry.quantity || 1) + "</small></span>",
          "<strong>" + money(lineTotal(entry)) + "</strong>",
          "</div>"
        ].join("");
      }).join(""),
      "</div>",
      '<div class="bill-total-block">',
      '<div class="summary-line"><span>Subtotal</span><strong>' + money(subtotal) + "</strong></div>",
      serviceFee ? '<div class="summary-line"><span>Service fee</span><strong>' + money(serviceFee) + "</strong></div>" : "",
      '<div class="summary-line total-line"><span>' + escapeHtml(totalLabel) + "</span><strong>" + money(order.total_amount) + "</strong></div>",
      "</div>"
    ].join("");
  }

  async function showOrderBill(orderId) {
    if (!window.FoodStore || !window.FoodStore.listOrders || !orderId) return;
    var orders = await window.FoodStore.listOrders({ includeExpired: true });
    var order = orders.find(function (entry) {
      return entry.id === orderId;
    });
    if (!order) return;

    var old = qs("[data-order-bill-modal]");
    if (old) old.remove();

    var modal = document.createElement("div");
    modal.className = "modal-backdrop";
    modal.setAttribute("data-order-bill-modal", "");
    modal.innerHTML = [
      '<section class="bill-modal" role="dialog" aria-modal="true" aria-label="Counter e-bill">',
      '<div class="live-order-popup-top">',
      "<div>",
      '<p class="eyebrow">Counter payment</p>',
      "<h2>Show this e-bill at the counter</h2>",
      '<p>' + escapeHtml(formatDate(order.created_at)) + "</p>",
      "</div>",
      '<button class="icon-button" type="button" data-ebill-close aria-label="Close e-bill">',
      '<i data-lucide="x"></i>',
      "</button>",
      "</div>",
      orderBillHtml(order),
      '<div class="receipt-actions">',
      canConfirmCounterPayment(order)
        ? '<button class="button full" type="button" data-ebill-mark-paid="' + escapeHtml(order.id) + '"><i data-lucide="badge-check"></i>Confirm counter paid</button>'
        : "",
      '<button class="button full" type="button" data-ebill-print><i data-lucide="printer"></i>Print receipt</button>',
      '<button class="button ghost full" type="button" data-ebill-close><i data-lucide="badge-check"></i>Done</button>',
      "</div>",
      "</section>"
    ].join("");
    document.body.appendChild(modal);
    hydrateIcons();
  }

  function removeLiveOrderUi() {
    qsa("[data-live-order-chip], [data-live-order-popup]").forEach(function (node) {
      node.remove();
    });
  }

  function renderLiveOrderHeader(order) {
    qsa(".top-actions").forEach(function (actions) {
      var chip = qs("[data-live-order-chip]", actions);
      if (!order || order.status === "Cancelled") {
        if (chip) chip.remove();
        return;
      }

      if (!chip) {
        chip = document.createElement("a");
        chip.setAttribute("data-live-order-chip", "");
        actions.insertBefore(chip, qs(".cart-chip", actions));
      }

      chip.href = liveOrderHref(order);
      chip.className = "live-order-chip " + statusClass(order.status);
      chip.title = "Live order progress: " + statusLabel(order.status);
      chip.innerHTML = [
        '<i data-lucide="activity"></i>',
        "<span>Live</span>",
        "<strong>" + escapeHtml(statusLabel(order.status)) + "</strong>"
      ].join("");
    });
  }

  function renderLiveOrderPopup(order) {
    var old = qs("[data-live-order-popup]");
    if (!order || order.status === "Cancelled" || isPendingTooLong(order) || document.body.dataset.page === "orders") {
      if (old) old.remove();
      return;
    }

    var key = liveOrderPopupKey(order);
    if (localStorage.getItem(key)) {
      if (old) old.remove();
      return;
    }

    var popup = old || document.createElement("section");
    popup.className = "live-order-popup";
    popup.setAttribute("data-live-order-popup", "");
    popup.dataset.liveOrderPopupKey = key;
    popup.innerHTML = [
      '<div class="live-order-popup-top">',
      "<div>",
      '<p class="eyebrow">Live order</p>',
      "<h2>" + escapeHtml(statusLabel(order.status)) + "</h2>",
      '<p>' + escapeHtml(order.table_label || order.pickup_note || tableLabel()) + " - #" + escapeHtml(order.id) + "</p>",
      "</div>",
      '<button class="icon-button" type="button" data-live-order-popup-close aria-label="Close live order popup">',
      '<i data-lucide="x"></i>',
      "</button>",
      "</div>",
      liveOrderItemsHtml(order),
      renderStatusSteps(order.status),
      '<a class="button full" href="' + escapeHtml(liveOrderHref(order)) + '"><i data-lucide="list-checks"></i>View progress</a>'
    ].join("");

    if (!old) document.body.appendChild(popup);
  }

  function selectCustomerAttentionOrder(orders) {
    return orders.find(isPendingTooLong) || orders.find(isAutoCancelled) || null;
  }

  function renderOrderAttentionPopup(order) {
    var old = qs("[data-order-attention-popup]");
    if (!order || document.body.dataset.page === "orders") {
      if (old) old.remove();
      return;
    }

    var key = orderAttentionPopupKey(order);
    if (localStorage.getItem(key)) {
      if (old) old.remove();
      return;
    }

    var title = isAutoCancelled(order) ? "Order auto-cancelled" : "Order not accepted yet";
    var message = isAutoCancelled(order)
      ? "This order stayed pending for " + pendingAutoCancelMinutes() + " minutes, so it was removed from the active queue."
      : "This order has been pending for over " + pendingWarningMinutes() + " minutes. Please find stall staff to remind them or ask why.";

    var popup = old || document.createElement("section");
    popup.className = "order-attention-popup";
    popup.setAttribute("data-order-attention-popup", "");
    popup.dataset.orderAttentionPopupKey = key;
    popup.innerHTML = [
      '<div class="live-order-popup-top">',
      "<div>",
      '<p class="eyebrow">Order alert</p>',
      "<h2>" + escapeHtml(title) + "</h2>",
      "<p>" + escapeHtml(message) + "</p>",
      "</div>",
      '<button class="icon-button" type="button" data-order-attention-close aria-label="Close order alert">',
      '<i data-lucide="x"></i>',
      "</button>",
      "</div>",
      '<div class="order-alert-note">',
      '<i data-lucide="' + (isAutoCancelled(order) ? "circle-x" : "triangle-alert") + '"></i>',
      '<span>#' + escapeHtml(order.id) + " - " + escapeHtml(order.table_label || tableLabel()) + "</span>",
      "</div>",
      '<a class="button full" href="' + escapeHtml(liveOrderHref(order)) + '"><i data-lucide="list-checks"></i>View order</a>'
    ].join("");

    if (!old) document.body.appendChild(popup);
  }

  async function refreshLiveOrderProgress() {
    if (!canShowLiveOrderProgress()) return;
    var orders = await getCustomerOrdersForCurrentTable();
    var order = selectCustomerLiveOrder(orders);
    if (!order) {
      removeLiveOrderUi();
    } else {
      renderLiveOrderHeader(order);
      renderLiveOrderPopup(order);
    }
    renderOrderAttentionPopup(selectCustomerAttentionOrder(orders));
    hydrateIcons();
  }

  function setupLiveOrderProgress() {
    if (!canShowLiveOrderProgress()) return;

    document.addEventListener("click", function (event) {
      var close = event.target.closest("[data-live-order-popup-close]");
      if (!close) return;
      var popup = close.closest("[data-live-order-popup]");
      if (!popup) return;
      if (popup.dataset.liveOrderPopupKey) {
        localStorage.setItem(popup.dataset.liveOrderPopupKey, "1");
      }
      popup.remove();
    });

    document.addEventListener("click", function (event) {
      var close = event.target.closest("[data-order-attention-close]");
      if (!close) return;
      var popup = close.closest("[data-order-attention-popup]");
      if (!popup) return;
      if (popup.dataset.orderAttentionPopupKey) {
        localStorage.setItem(popup.dataset.orderAttentionPopupKey, "1");
      }
      popup.remove();
    });

    refreshLiveOrderProgress();
    if (!liveProgressTimer) {
      liveProgressTimer = window.setInterval(refreshLiveOrderProgress, 12000);
    }
  }

  async function renderCartPreview(targetId) {
    var target = qs("#" + targetId);
    if (!target || !window.FoodStore) return;
    var detail = await window.FoodStore.getCartDetailed();

    if (!detail.items.length) {
      target.innerHTML = [
        '<div class="summary-title">',
        "<div><p class=\"eyebrow\">Cart</p><h2>No items yet</h2></div>",
        '<i data-lucide="shopping-basket"></i>',
        "</div>",
        '<p class="muted">Add menu items from any stall to prepare a combined order.</p>',
        '<a class="button full" href="index.html"><i data-lucide="utensils"></i>Browse menu</a>'
      ].join("");
      hydrateIcons();
      return;
    }

    target.innerHTML = [
      '<div class="summary-title">',
      "<div><p class=\"eyebrow\">Cart</p><h2>Order summary</h2></div>",
      '<span class="count-pill">' + detail.count + " items</span>",
      "</div>",
      '<ul class="summary-list">',
      detail.items.map(function (entry) {
        return [
          "<li>",
          "<span>",
          "<strong>" + escapeHtml(entry.item.name) + "</strong>",
          "<small>" + escapeHtml(entry.stall ? entry.stall.name : "Food stall") + " x " + entry.quantity + "</small>",
          "</span>",
          "<strong>" + money(entry.line_total) + "</strong>",
          "</li>"
        ].join("");
      }).join(""),
      "</ul>",
      '<div class="summary-line"><span>Subtotal</span><strong>' + money(detail.subtotal) + "</strong></div>",
      '<div class="summary-line"><span>Service fee</span><strong>' + money(detail.serviceFee) + "</strong></div>",
      '<div class="summary-line total-line"><span>Total</span><strong>' + money(detail.total) + "</strong></div>",
      '<a class="button full" href="cart.html"><i data-lucide="shopping-cart"></i>Review cart</a>'
    ].join("");
    hydrateIcons();
  }

  function orderItemsHtml(order, filterStallId) {
    var items = order.items || [];
    if (filterStallId) {
      items = items.filter(function (entry) {
        return entry.stall_id === filterStallId;
      });
    }
    if (!items.length) return '<div class="order-items"><div><span>No item detail available</span><span></span></div></div>';

    return [
      '<div class="order-items">',
      items.map(function (entry) {
        var lineTotal = Number(entry.price || 0) * Number(entry.quantity || 1);
        return [
          "<div>",
          "<span>" + escapeHtml(itemName(entry)) + " x " + Number(entry.quantity || 1) + "</span>",
          "<span>" + money(lineTotal) + "</span>",
          "</div>"
        ].join("");
      }).join(""),
      "</div>"
    ].join("");
  }

  function orderCardHtml(order, options) {
    var settings = options || {};
    var highlight = settings.highlightId === order.id ? " is-highlight" : "";
    var payment = order.payment_status || "Pending";
    var actions = settings.actions || "";
    var paymentMethod = paymentMethodLabel(order.payment_method);

    return [
      '<article class="order-card' + highlight + '">',
      '<div class="order-top">',
      "<div>",
      '<p class="eyebrow">' + escapeHtml(formatDate(order.created_at)) + "</p>",
      "<h3>#" + escapeHtml(order.id) + "</h3>",
      '<p>' + escapeHtml(order.customer_name || "Customer") + " - " + escapeHtml(order.table_label || order.pickup_note || "Counter pickup") + "</p>",
      "</div>",
      '<div class="meta-row">',
      '<span class="tag ' + statusClass(order.status) + '">' + escapeHtml(statusLabel(order.status)) + "</span>",
      '<span class="tag ' + statusClass(payment) + '">' + escapeHtml(payment) + "</span>",
      paymentMethod ? '<span class="tag">' + escapeHtml(paymentMethod) + "</span>" : "",
      '<span class="tag teal">' + money(order.total_amount) + "</span>",
      "</div>",
      "</div>",
      orderItemsHtml(order, settings.filterStallId),
      orderIssueHtml(order),
      renderStatusSteps(order.status),
      orderBillButtonHtml(order),
      actions,
      "</article>"
    ].join("");
  }

  function renderEmpty(message, actionHref, actionLabel) {
    return [
      '<section class="empty-state">',
      "<div>",
      "<h2>" + escapeHtml(message) + "</h2>",
      actionHref ? '<a class="button" href="' + escapeHtml(actionHref) + '">' + escapeHtml(actionLabel) + "</a>" : "",
      "</div>",
      "</section>"
    ].join("");
  }

  function setupNavigation() {
    var page = document.body.dataset.navPage || document.body.dataset.page;
    qsa("[data-nav-item]").forEach(function (link) {
      if (
        link.dataset.navItem === page ||
        (document.body.dataset.page === "login" && link.dataset.navItem === "login") ||
        (page === "checkout" && link.dataset.navItem === "cart")
      ) {
        link.classList.add("active");
      }
    });

    var toggle = qs("[data-nav-toggle]");
    var nav = qs("[data-nav]");
    if (toggle && nav) {
      toggle.addEventListener("click", function () {
        nav.classList.toggle("open");
      });
    }
  }

  async function setupTableContext() {
    if (!window.FoodStore) return;
    var params = new URLSearchParams(window.location.search);
    var code = params.get("table") || params.get("table_code");
    var isScanPage = document.body.dataset.page === "scan";
    var table = null;

    if (code) {
      table = await window.FoodStore.setCurrentTable(code);
    } else if (isScanPage && window.FoodStore.clearCurrentTable) {
      var currentTable = window.FoodStore.getCurrentTable();
      var customerOrders = currentTable ? await getCustomerOrdersForCurrentTable() : [];
      var liveOrder = selectCustomerLiveOrder(customerOrders);
      var attentionOrder = selectCustomerAttentionOrder(customerOrders);
      if (currentTable && (liveOrder || attentionOrder)) {
        table = currentTable;
      } else {
        window.FoodStore.clearCurrentTable();
      }
    } else {
      table = window.FoodStore.getCurrentTable();
    }

    qsa("[data-table-chip]").forEach(function (node) {
      node.textContent = tableLabel(table);
      node.title = "Current table: " + tableLabel(table);
    });

    qsa("[data-current-table]").forEach(function (node) {
      node.textContent = tableLabel(table);
    });
    updateAccessState();
  }

  function setupLogout() {
    qsa("[data-logout]").forEach(function (button) {
      button.addEventListener("click", function () {
        if (!window.FoodStore) return;
        var role = document.body.dataset.requiresRole || "";
        window.FoodStore.logout();
        updateAccessState();
        toast("Logged out.");
        window.setTimeout(function () {
          window.location.href = "../main/login.html" + (role ? "?role=" + encodeURIComponent(role) : "");
        }, 350);
      });
    });
  }

  function setupOrderBillActions() {
    document.addEventListener("click", async function (event) {
      var billButton = event.target.closest("[data-show-ebill]");
      if (billButton) {
        showOrderBill(billButton.dataset.showEbill);
        return;
      }

      var paidButton = event.target.closest("[data-ebill-mark-paid]");
      if (paidButton) {
        event.preventDefault();
        if (!window.FoodStore || !window.FoodStore.markOrderPaid || document.body.dataset.page !== "staff") return;
        paidButton.disabled = true;
        try {
          await window.FoodStore.markOrderPaid(paidButton.dataset.ebillMarkPaid);
          toast("Counter payment marked paid.");
          var paidModal = qs("[data-order-bill-modal]");
          if (paidModal) paidModal.remove();
          document.dispatchEvent(new CustomEvent("foodorder:orders-updated", {
            detail: { orderId: paidButton.dataset.ebillMarkPaid }
          }));
        } catch (error) {
          toast(error.message || "Unable to mark payment paid.", "error");
          paidButton.disabled = false;
        }
        return;
      }

      var printButton = event.target.closest("[data-ebill-print]");
      if (printButton) {
        window.print();
        return;
      }

      var close = event.target.closest("[data-ebill-close]");
      if (close || event.target.matches("[data-order-bill-modal]")) {
        var modal = qs("[data-order-bill-modal]");
        if (modal) modal.remove();
      }
    });
  }

  document.addEventListener("DOMContentLoaded", async function () {
    await setupTableContext();
    var canUsePage = requireOrderAccess() && await requireRoleAccess();
    setupNavigation();
    setupLogout();
    setupOrderBillActions();
    if (!canUsePage) {
      hydrateIcons();
      return;
    }
    refreshCartBadge();
    setupLiveOrderProgress();
    hydrateIcons();
  });

  window.FoodUI = {
    qs: qs,
    qsa: qsa,
    escapeHtml: escapeHtml,
    money: money,
    formatDate: formatDate,
    statusClass: statusClass,
    statusLabel: statusLabel,
    imageStyle: imageStyle,
    toast: toast,
    hydrateIcons: hydrateIcons,
    hasOrderAccess: hasOrderAccess,
    refreshCartBadge: refreshCartBadge,
    refreshLiveOrderProgress: refreshLiveOrderProgress,
    renderCartPreview: renderCartPreview,
    renderStatusSteps: renderStatusSteps,
    orderCardHtml: orderCardHtml,
    orderItemsHtml: orderItemsHtml,
    orderIssueLabel: orderIssueLabel,
    showOrderBill: showOrderBill,
    renderEmpty: renderEmpty,
    itemName: itemName,
    stallName: stallName,
    tableLabel: tableLabel
  };
})();
