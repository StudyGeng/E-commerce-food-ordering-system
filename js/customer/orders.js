(function () {
  var ui = window.FoodUI;
  var store = window.FoodStore;
  var activeFilter = "all";
  var openedBill = false;

  function getHighlightId() {
    return new URLSearchParams(window.location.search).get("order");
  }

  async function renderOrders() {
    var target = ui.qs("#order-list");
    if (!target) return;

    var customer = (window.AppConfig && window.AppConfig.guestCustomer) || {};
    var table = store.getCurrentTable();
    var orders = table && table.code
      ? await store.listOrders({ customerId: customer.id, tableCode: table.code })
      : [];
    if (activeFilter !== "all") {
      orders = orders.filter(function (order) {
        return order.status === activeFilter;
      });
    }

    if (!orders.length) {
      target.innerHTML = ui.renderEmpty("No orders found.", "index.html", "Start an order");
      ui.hydrateIcons();
      return;
    }

    var highlightId = getHighlightId();
    target.innerHTML = orders.map(function (order) {
      return ui.orderCardHtml(order, { highlightId: highlightId });
    }).join("");
    ui.hydrateIcons();

    if (!openedBill && highlightId && new URLSearchParams(window.location.search).get("bill") === "1" && ui.showOrderBill) {
      openedBill = true;
      ui.showOrderBill(highlightId);
    }
  }

  function bindFilters() {
    ui.qsa("[data-order-filter]").forEach(function (button) {
      button.addEventListener("click", function () {
        activeFilter = button.dataset.orderFilter;
        ui.qsa("[data-order-filter]").forEach(function (item) {
          item.classList.toggle("active", item === button);
        });
        renderOrders();
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (!document.body.matches('[data-page="orders"]')) return;
    bindFilters();
    renderOrders();
    window.setInterval(renderOrders, 12000);
  });
})();
