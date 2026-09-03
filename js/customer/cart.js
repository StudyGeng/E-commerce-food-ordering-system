(function () {
  var ui = window.FoodUI;
  var store = window.FoodStore;

  function cartItemHtml(entry) {
    return [
      '<article class="cart-item" data-cart-item="' + ui.escapeHtml(entry.item.id) + '">',
      '<img src="' + ui.escapeHtml(entry.item.image_url || "") + '" alt="' + ui.escapeHtml(entry.item.name) + '">',
      "<div>",
      "<h3>" + ui.escapeHtml(entry.item.name) + "</h3>",
      "<p>" + ui.escapeHtml(entry.stall ? entry.stall.name : "Food stall") + "</p>",
      '<div class="meta-row">',
      '<span class="tag teal">' + ui.escapeHtml(entry.item.category || "Menu") + "</span>",
      '<span class="tag">' + ui.money(entry.item.price) + " each</span>",
      '<span class="tag gold">' + Number(entry.item.stock_quantity || 0) + " left</span>",
      "</div>",
      "</div>",
      '<div class="cart-actions">',
      '<div class="quantity-control" aria-label="Quantity control">',
      '<button type="button" data-cart-action="decrease" aria-label="Decrease quantity"><i data-lucide="minus"></i></button>',
      "<span>" + entry.quantity + "</span>",
      '<button type="button" data-cart-action="increase" aria-label="Increase quantity"><i data-lucide="plus"></i></button>',
      "</div>",
      '<button class="button ghost" type="button" data-cart-action="remove"><i data-lucide="trash-2"></i>Remove</button>',
      "</div>",
      '<label class="note-field">',
      "<span>Note for stall</span>",
      '<input type="text" value="' + ui.escapeHtml(entry.notes || "") + '" placeholder="Example: less spicy" data-cart-note>',
      "</label>",
      "</article>"
    ].join("");
  }

  function summaryHtml(detail) {
    if (!detail.items.length) {
      return [
        '<div class="summary-title">',
        "<div><p class=\"eyebrow\">Cart</p><h2>No items yet</h2></div>",
        "</div>",
        '<p class="muted">Your cart is empty. Add food from the menu first.</p>',
        '<a class="button full" href="index.html"><i data-lucide="utensils"></i>Browse menu</a>'
      ].join("");
    }

    return [
      '<div class="summary-title">',
      "<div><p class=\"eyebrow\">Checkout</p><h2>Payment summary</h2></div>",
      '<span class="count-pill">' + detail.count + " items</span>",
      "</div>",
      '<div class="summary-line"><span>Subtotal</span><strong>' + ui.money(detail.subtotal) + "</strong></div>",
      '<div class="summary-line"><span>Service fee</span><strong>' + ui.money(detail.serviceFee) + "</strong></div>",
      '<div class="summary-line total-line"><span>Total</span><strong>' + ui.money(detail.total) + "</strong></div>",
      '<div class="summary-actions">',
      '<a class="button full" href="checkout.html"><i data-lucide="credit-card"></i>Continue to checkout</a>',
      '<button class="button ghost full" type="button" id="clear-cart"><i data-lucide="eraser"></i>Clear cart</button>',
      "</div>"
    ].join("");
  }

  async function renderCart() {
    var itemsTarget = ui.qs("#cart-items");
    var summaryTarget = ui.qs("#cart-summary");
    var detail = await store.getCartDetailed();

    if (itemsTarget) {
      itemsTarget.innerHTML = detail.items.length
        ? detail.items.map(cartItemHtml).join("")
        : ui.renderEmpty("Your cart is empty.", "index.html", "Browse menu");
    }

    if (summaryTarget) {
      summaryTarget.innerHTML = summaryHtml(detail);
    }

    await ui.refreshCartBadge();
    ui.hydrateIcons();
  }

  function bindEvents() {
    document.addEventListener("click", async function (event) {
      var actionButton = event.target.closest("[data-cart-action]");
      if (!actionButton) {
        var clearButton = event.target.closest("#clear-cart");
        if (clearButton) {
          await store.clearCart();
          ui.toast("Cart cleared.");
          renderCart();
        }
        return;
      }

      var row = actionButton.closest("[data-cart-item]");
      if (!row) return;
      var itemId = row.dataset.cartItem;
      var detail = await store.getCartDetailed();
      var entry = detail.items.find(function (item) {
        return item.item.id === itemId;
      });
      if (!entry) return;

      if (actionButton.dataset.cartAction === "increase") {
        try {
          await store.updateCartItem(itemId, entry.quantity + 1, entry.notes);
        } catch (error) {
          ui.toast(error.message || "Unable to update cart.", "error");
        }
      }

      if (actionButton.dataset.cartAction === "decrease") {
        await store.updateCartItem(itemId, entry.quantity - 1, entry.notes);
      }

      if (actionButton.dataset.cartAction === "remove") {
        await store.updateCartItem(itemId, 0, entry.notes);
      }

      renderCart();
    });

    document.addEventListener("change", async function (event) {
      var note = event.target.closest("[data-cart-note]");
      if (!note) return;
      var row = note.closest("[data-cart-item]");
      if (!row) return;
      var detail = await store.getCartDetailed();
      var entry = detail.items.find(function (item) {
        return item.item.id === row.dataset.cartItem;
      });
      if (!entry) return;
      await store.updateCartItem(row.dataset.cartItem, entry.quantity, note.value);
      ui.toast("Cart note saved.");
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (!document.body.matches('[data-page="cart"]')) return;
    renderCart();
    bindEvents();
  });
})();
