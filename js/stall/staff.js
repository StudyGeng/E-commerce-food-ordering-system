(function () {
  var ui = window.FoodUI;
  var store = window.FoodStore;
  var statuses = ["Pending", "Preparing", "Completed"];
  var selectedKey = "foodorder_staff_selected_stall_v1";
  var cache = {
    stalls: [],
    promotionPlans: [],
    promotions: [],
    menuItems: [],
    orders: [],
    selectedStallId: "all"
  };

  function priceLabel(plan) {
    return String(plan.currency || "MYR") + " " + (Number(plan.price_minor || 0) / 100).toFixed(2) + "/month";
  }

  function activePromotion() {
    var stallId = activeStallId();
    return cache.promotions.find(function (promotion) {
      return promotion.stall_id === stallId;
    }) || null;
  }

  function promotionScheduleIsLive(promotion) {
    if (!promotion || promotion.campaign_status !== "active" || promotion.payment_status !== "paid") return false;
    if (["featured", "premium"].indexOf(promotion.plan_slug) === -1) return false;
    var startsAt = promotion.starts_at ? new Date(promotion.starts_at).getTime() : null;
    var endsAt = promotion.ends_at ? new Date(promotion.ends_at).getTime() : null;
    return Number.isFinite(startsAt) && Number.isFinite(endsAt) &&
      startsAt <= Date.now() && Date.now() < endsAt;
  }

  function promotionIsLive(promotion) {
    if (!promotionScheduleIsLive(promotion)) return false;
    var stall = cache.stalls.find(function (record) {
      return record.id === promotion.stall_id;
    });
    if (!stall || stall.closed) return false;
    return cache.menuItems.some(function (item) {
      return item.stall_id === stall.id && item.available && Number(item.stock_quantity || 0) > 0;
    });
  }

  function promotionIsApproved(promotion) {
    if (!promotion || promotion.campaign_status !== "active" || promotion.payment_status !== "paid") return false;
    if (["featured", "premium"].indexOf(promotion.plan_slug) === -1) return false;
    var endsAt = promotion.ends_at ? new Date(promotion.ends_at).getTime() : null;
    return !(Number.isFinite(endsAt) && Date.now() >= endsAt);
  }

  function promotionStatusLabel(promotion) {
    if (!promotion || promotion.plan_slug === "free") return "Organic listing";
    if (promotionIsLive(promotion)) return "Sponsored placement live";
    if (promotionScheduleIsLive(promotion)) return "Active \u00b7 unavailable to customers";
    if (promotion.payment_status === "failed") return "Payment failed";
    if (promotion.payment_status === "refunded") return "Payment refunded";
    if (promotion.campaign_status === "requested") return "Waiting for admin approval";
    if (promotion.payment_status === "pending") return "Payment confirmation pending";
    if (promotion.campaign_status === "paused") return "Promotion paused";
    if (promotion.campaign_status === "ended") return "Promotion ended";
    if (promotion.campaign_status === "cancelled") return "Promotion cancelled";
    var startsAt = promotion.starts_at ? new Date(promotion.starts_at).getTime() : null;
    var endsAt = promotion.ends_at ? new Date(promotion.ends_at).getTime() : null;
    if (Number.isFinite(startsAt) && Date.now() < startsAt) return "Scheduled";
    if (Number.isFinite(endsAt) && Date.now() >= endsAt) return "Promotion expired";
    return "Promotion inactive";
  }

  function renderPromotionPanel() {
    var statusTarget = ui.qs("#staff-promotion-status");
    var form = ui.qs("#promotion-request-form");
    if (!statusTarget || !form) return;
    var promotion = activePromotion();
    var plan = cache.promotionPlans.find(function (entry) {
      return entry.slug === (promotion && promotion.plan_slug);
    });
    var live = promotionIsLive(promotion);
    var scheduleLive = promotionScheduleIsLive(promotion);
    var requestLocked = promotionIsApproved(promotion);
    var detail = scheduleLive && !live
      ? "Open the stall and make an in-stock menu item available to show this promotion."
      : promotion && promotion.ends_at
      ? "Until " + new Date(promotion.ends_at).toLocaleDateString()
      : "Admin activation required";
    statusTarget.innerHTML = [
      '<div class="promotion-current-status' + (live ? " is-live" : "") + '">',
      '<span class="tag ' + (live ? "status-paid" : promotion && promotion.campaign_status === "requested" ? "gold" : "") + '">' +
        ui.escapeHtml(promotionStatusLabel(promotion)) + "</span>",
      "<strong>" + ui.escapeHtml(plan ? plan.name + " · " + priceLabel(plan) : "Free plan") + "</strong>",
      "<p>" + ui.escapeHtml(detail) + "</p>",
      "</div>"
    ].join("");

    var selectedPlan = form.elements.plan_slug.value || (plan && plan.slug !== "free" ? plan.slug : "featured");
    form.elements.plan_slug.innerHTML = cache.promotionPlans.filter(function (entry) {
      return entry.active && entry.slug !== "free";
    }).map(function (entry) {
      return '<option value="' + ui.escapeHtml(entry.slug) + '">' +
        ui.escapeHtml(entry.name + " · " + priceLabel(entry)) + "</option>";
    }).join("");
    form.elements.plan_slug.value = cache.promotionPlans.some(function (entry) {
      return entry.slug === selectedPlan && entry.slug !== "free";
    }) ? selectedPlan : "featured";

    if (!form.contains(document.activeElement) && !form.elements.headline.value) {
      form.elements.headline.value = promotion ? promotion.headline || "" : "";
    }
    form.elements.plan_slug.disabled = requestLocked;
    form.elements.headline.disabled = requestLocked;
    var submit = form.querySelector('button[type="submit"]');
    if (submit) {
      submit.disabled = requestLocked;
      submit.innerHTML = requestLocked
        ? '<i data-lucide="badge-check"></i>Promotion approved'
        : '<i data-lucide="send"></i>' + (promotion && promotion.campaign_status === "requested" ? "Update request" : "Request plan");
    }
    ui.hydrateIcons();
  }

  function getSessionStallId() {
    var session = store.getSession();
    return session && session.assigned_stall_id ? session.assigned_stall_id : "";
  }

  function activeStallId() {
    return cache.selectedStallId && cache.selectedStallId !== "all" ? cache.selectedStallId : "";
  }

  function orderBelongsToSelectedStall(order) {
    var selected = activeStallId();
    if (!selected) return false;
    return (order.items || []).some(function (item) {
      return item.stall_id === selected;
    });
  }

  function isCounterPaymentPending(order) {
    return Boolean(
      order &&
      order.payment_method === "Pay at Counter" &&
      order.payment_status === "Pending"
    );
  }

  function nextStatuses(current) {
    if (current === "Completed" || current === "Cancelled") return [];
    if (current === "Ready") return ["Completed"];
    var index = statuses.indexOf(current);
    if (index < 0) return [];
    return statuses.slice(index + 1, index + 2);
  }

  function filteredOrders() {
    return cache.orders.filter(function (order) {
      return orderBelongsToSelectedStall(order);
    });
  }

  function filteredMenuItems() {
    var selected = activeStallId();
    if (!selected) return [];
    return cache.menuItems.filter(function (item) {
      return item.stall_id === selected;
    });
  }

  function statsHtml() {
    var orders = filteredOrders();
    var pending = orders.filter(function (order) {
      return order.status === "Pending";
    }).length;
    var preparing = orders.filter(function (order) {
      return order.status === "Preparing";
    }).length;
    var waitingPayment = orders.filter(function (order) {
      return isCounterPaymentPending(order);
    }).length;
    var lowStock = filteredMenuItems().filter(function (item) {
      return Number(item.stock_quantity || 0) <= 3 || !item.available;
    }).length;
    var attention = orders.filter(function (order) {
      return ui.orderIssueLabel && ui.orderIssueLabel(order);
    }).length;

    return [
      '<article class="stat-card"><strong>' + pending + '</strong><span>new orders</span></article>',
      '<article class="stat-card"><strong>' + waitingPayment + '</strong><span>waiting payment</span></article>',
      '<article class="stat-card"><strong>' + preparing + '</strong><span>received orders</span></article>',
      '<article class="stat-card"><strong>' + attention + '</strong><span>order alerts</span></article>',
      '<article class="stat-card"><strong>' + lowStock + '</strong><span>low stock or unavailable</span></article>'
    ].join("");
  }

  function orderActionsHtml(order) {
    var actions = nextStatuses(order.status);
    var statusText = ui.statusLabel ? ui.statusLabel(order.status) : order.status;
    if (!actions.length) {
      return '<div class="order-actions"><span class="tag ' + ui.statusClass(order.status) + '">' + ui.escapeHtml(statusText) + "</span></div>";
    }

    var nextStatus = actions[0];
    var paymentBlocked = nextStatus === "Preparing" && isCounterPaymentPending(order);
    var label = nextStatus === "Preparing" ? "Receive order" : "Complete order";
    var icon = paymentBlocked ? "lock-keyhole" : nextStatus === "Completed" ? "badge-check" : "arrow-right";

    return [
      '<div class="order-actions">',
      '<button class="button ghost" type="button" data-order-id="' + ui.escapeHtml(order.id) + '" data-next-status="' + ui.escapeHtml(nextStatus) + '"' + (paymentBlocked ? ' disabled title="Confirm counter payment first"' : "") + ">",
      '<i data-lucide="' + icon + '"></i>',
      ui.escapeHtml(label),
      "</button>",
      "</div>",
      paymentBlocked ? '<p class="order-action-note">Confirm counter payment in the e-bill before receiving.</p>' : ""
    ].join("");
  }

  function renderOrders() {
    var target = ui.qs("#staff-orders");
    if (!target) return;

    var visibleOrders = filteredOrders().filter(function (order) {
      if (order.status !== "Completed" && order.status !== "Cancelled") return true;
      return Boolean(ui.orderIssueLabel && ui.orderIssueLabel(order));
    });

    if (!visibleOrders.length) {
      target.innerHTML = ui.renderEmpty("No active orders for this stall.", null, "");
      ui.hydrateIcons();
      return;
    }

    target.innerHTML = visibleOrders.map(function (order) {
      return ui.orderCardHtml(order, {
        filterStallId: activeStallId(),
        actions: orderActionsHtml(order)
      });
    }).join("");
    ui.hydrateIcons();
  }

  function populateStallSelects() {
    var menuStall = ui.qs('#menu-form input[name="stall_id"]');

    if (menuStall) {
      menuStall.value = activeStallId() || (cache.stalls[0] && cache.stalls[0].id) || "";
    }
  }

  function selectedProfileStall() {
    var selected = activeStallId() || (cache.stalls[0] && cache.stalls[0].id);
    return cache.stalls.find(function (stall) {
      return stall.id === selected;
    });
  }

  function loadSelectedStallProfile() {
    var form = ui.qs("#staff-stall-form");
    var stall = selectedProfileStall();
    if (!form || !stall) return;

    form.elements.id.value = stall.id;
    form.elements.name.value = stall.name || "";
    form.elements.cuisine_type.value = stall.cuisine_type || "";
    form.elements.wait_minutes.value = Number(stall.wait_minutes || 10);
    form.elements.image_url.value = stall.image_url || "";
    form.elements.description.value = stall.description || "";
    form.elements.closed.checked = Boolean(stall.closed);
  }

  function menuRowHtml(item) {
    var stall = cache.stalls.find(function (record) {
      return record.id === item.stall_id;
    });
    var stock = Number(item.stock_quantity || 0);
    var stockClass = stock <= 3 ? "coral" : "gold";
    return [
      '<article class="mini-row">',
      '<div class="mini-row-top">',
      "<div>",
      "<h3>" + ui.escapeHtml(item.name) + "</h3>",
      '<p>' + ui.escapeHtml(stall ? stall.name : "Food stall") + " - " + ui.escapeHtml(item.category || "Menu") + "</p>",
      "</div>",
      '<strong class="price">' + ui.money(item.price) + "</strong>",
      "</div>",
      '<div class="meta-row">',
      '<span class="tag ' + (item.available ? "status-paid" : "status-failed") + '">' + (item.available ? "Available" : "Unavailable") + "</span>",
      '<span class="tag ' + stockClass + '">' + stock + " in stock</span>",
      "</div>",
      '<div class="mini-actions">',
      '<button class="button ghost" type="button" data-edit-menu="' + ui.escapeHtml(item.id) + '"><i data-lucide="pencil"></i>Edit</button>',
      '<button class="button ghost" type="button" data-delete-menu="' + ui.escapeHtml(item.id) + '"><i data-lucide="trash-2"></i>Delete</button>',
      "</div>",
      "</article>"
    ].join("");
  }

  function setMenuFormMode(mode) {
    var heading = ui.qs("[data-menu-heading]");
    var button = ui.qs("#save-menu-button");
    var editing = mode === "edit";

    if (heading) heading.textContent = editing ? "Edit food item" : "Food, price, and stock";
    if (button) {
      button.innerHTML = editing
        ? '<i data-lucide="save"></i>Update menu item'
        : '<i data-lucide="save"></i>Save menu item';
    }
    ui.hydrateIcons();
  }

  function renderMenuList() {
    var target = ui.qs("#staff-menu-list");
    if (!target) return;
    var items = filteredMenuItems();
    target.innerHTML = items.length
      ? items.map(menuRowHtml).join("")
      : '<p class="muted">No menu items for this stall yet.</p>';
    ui.hydrateIcons();
  }

  function clearMenuForm() {
    var form = ui.qs("#menu-form");
    if (!form) return;
    form.reset();
    form.elements.id.value = "";
    form.elements.available.checked = true;
    form.elements.stock_quantity.value = 20;
    if (activeStallId()) form.elements.stall_id.value = activeStallId();
    setMenuFormMode("new");
  }

  function loadItemIntoForm(itemId) {
    var item = cache.menuItems.find(function (record) {
      return record.id === itemId;
    });
    var form = ui.qs("#menu-form");
    if (!item || !form) return;

    form.elements.id.value = item.id;
    form.elements.stall_id.value = item.stall_id || activeStallId();
    form.elements.name.value = item.name;
    form.elements.category.value = item.category || "";
    form.elements.price.value = Number(item.price || 0).toFixed(2);
    form.elements.stock_quantity.value = Number(item.stock_quantity || 0);
    form.elements.image_url.value = item.image_url || "";
    form.elements.description.value = item.description || "";
    form.elements.available.checked = Boolean(item.available);
    setMenuFormMode("edit");
    if (form.scrollIntoView) {
      form.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    window.setTimeout(function () {
      try {
        form.elements.name.focus({ preventScroll: true });
      } catch (error) {
        form.elements.name.focus();
      }
    }, 220);
    ui.toast("Food item loaded. Update the details and save.");
  }

  async function loadData() {
    var sessionStall = getSessionStallId();
    var allStalls = await store.listStalls({ includeClosed: true });
    cache.stalls = sessionStall
      ? allStalls.filter(function (stall) {
        return stall.id === sessionStall;
      })
      : [];
    cache.promotionPlans = store.listPromotionPlans ? await store.listPromotionPlans() : [];
    cache.promotions = store.listStallPromotions
      ? await store.listStallPromotions({ stallId: sessionStall })
      : [];
    cache.menuItems = await store.listMenuItems({ includeUnavailable: true, includeClosed: true });
    cache.orders = await store.listOrders();

    var preferred = sessionStall || (cache.stalls[0] && cache.stalls[0].id) || "";
    var exists = cache.stalls.some(function (stall) {
      return stall.id === preferred;
    });
    cache.selectedStallId = exists ? preferred : "";
    localStorage.setItem(selectedKey, cache.selectedStallId);
  }

  async function renderAll() {
    await loadData();
    var stats = ui.qs("#staff-stats");
    if (stats) stats.innerHTML = statsHtml();
    populateStallSelects();
    loadSelectedStallProfile();
    renderPromotionPanel();
    renderOrders();
    renderMenuList();
  }

  function bindEvents() {
    var refresh = ui.qs("#refresh-staff-orders");
    var clear = ui.qs("#clear-menu-form");
    var menuForm = ui.qs("#menu-form");
    var stallForm = ui.qs("#staff-stall-form");
    var promotionForm = ui.qs("#promotion-request-form");

    if (refresh) {
      refresh.addEventListener("click", function () {
        renderAll();
        ui.toast("Live order queue refreshed.");
      });
    }

    if (clear) {
      clear.addEventListener("click", clearMenuForm);
    }

    if (stallForm) {
      stallForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        try {
          await store.saveStall({
            id: stallForm.elements.id.value,
            name: stallForm.elements.name.value.trim(),
            cuisine_type: stallForm.elements.cuisine_type.value.trim(),
            wait_minutes: stallForm.elements.wait_minutes.value,
            image_url: stallForm.elements.image_url.value.trim(),
            description: stallForm.elements.description.value.trim(),
            closed: stallForm.elements.closed.checked,
            rating: selectedProfileStall() ? selectedProfileStall().rating : 4.5,
            staff_id: selectedProfileStall() ? selectedProfileStall().staff_id : null
          });
          ui.toast("Stall information saved.");
          await renderAll();
        } catch (error) {
          ui.toast(error.message || "Unable to save stall information.", "error");
        }
      });
    }

    if (promotionForm) {
      promotionForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        var button = promotionForm.querySelector('button[type="submit"]');
        if (button) button.disabled = true;
        try {
          await store.requestStallPromotion({
            plan_slug: promotionForm.elements.plan_slug.value,
            headline: promotionForm.elements.headline.value.trim()
          });
          ui.toast("Promotion request sent to the admin.");
          await renderAll();
        } catch (error) {
          ui.toast(error.message || "Unable to request this promotion.", "error");
        } finally {
          if (button && !promotionIsApproved(activePromotion())) button.disabled = false;
        }
      });
    }

    if (menuForm) {
      menuForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        var button = ui.qs("#save-menu-button");
        var editing = Boolean(menuForm.elements.id.value);
        if (button) button.disabled = true;

        try {
          var stallId = menuForm.elements.stall_id.value || activeStallId();
          if (!stallId) throw new Error("No stall assigned to this account.");

          await store.saveMenuItem({
            id: menuForm.elements.id.value,
            stall_id: stallId,
            name: menuForm.elements.name.value.trim(),
            category: menuForm.elements.category.value.trim(),
            price: menuForm.elements.price.value,
            stock_quantity: menuForm.elements.stock_quantity.value,
            image_url: menuForm.elements.image_url.value.trim(),
            description: menuForm.elements.description.value.trim(),
            available: menuForm.elements.available.checked
          });
          ui.toast(editing ? "Food item updated." : "Menu item saved.");
          clearMenuForm();
          await renderAll();
        } catch (error) {
          ui.toast(error.message || "Unable to save menu item.", "error");
        } finally {
          if (button) button.disabled = false;
        }
      });
    }

    document.addEventListener("click", async function (event) {
      var orderButton = event.target.closest("[data-next-status]");
      if (orderButton) {
        var order = cache.orders.find(function (entry) {
          return entry.id === orderButton.dataset.orderId;
        });
        var allowedNextStatus = order && nextStatuses(order.status)[0];
        if (!order || orderButton.dataset.nextStatus !== allowedNextStatus) {
          ui.toast("Please move the order one step at a time.", "error");
          return;
        }
        if (orderButton.dataset.nextStatus === "Preparing" && isCounterPaymentPending(order)) {
          ui.toast("Confirm counter payment before receiving this order.", "error");
          return;
        }

        await store.updateOrderStatus(orderButton.dataset.orderId, orderButton.dataset.nextStatus);
        ui.toast("Order status updated.");
        renderAll();
        return;
      }

      var editButton = event.target.closest("[data-edit-menu]");
      if (editButton) {
        loadItemIntoForm(editButton.dataset.editMenu);
        return;
      }

      var deleteButton = event.target.closest("[data-delete-menu]");
      if (deleteButton) {
        await store.deleteMenuItem(deleteButton.dataset.deleteMenu);
        ui.toast("Menu item deleted.");
        renderAll();
      }
    });
  }

  document.addEventListener("DOMContentLoaded", async function () {
    if (!document.body.matches('[data-page="staff"]')) return;
    if (!await store.validateSession("staff")) return;
    renderAll();
    bindEvents();
    document.addEventListener("foodorder:orders-updated", renderAll);
    window.setInterval(renderAll, 12000);
  });
})();
