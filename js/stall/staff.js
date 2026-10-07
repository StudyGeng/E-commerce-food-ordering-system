(function () {
  var ui = window.FoodUI;
  var store = window.FoodStore;
  var statuses = ["Pending", "Preparing", "Completed"];
  var selectedKey = "foodorder_staff_selected_stall_v1";
  var analyticsRange = {
    preset: "month",
    from: "",
    to: ""
  };
  var cache = {
    stalls: [],
    promotionPlans: [],
    promotions: [],
    menuItems: [],
    orders: [],
    expenses: [],
    financialError: null,
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

  function businessAccessTier() {
    var promotion = activePromotion();
    if (!promotionScheduleIsLive(promotion)) return "free";
    var enabledPlan = cache.promotionPlans.some(function (plan) {
      return plan.slug === promotion.plan_slug && plan.active !== false;
    });
    if (!enabledPlan) return "free";
    if (promotion.plan_slug === "premium") return "premium";
    if (promotion.plan_slug === "featured") return "featured";
    return "free";
  }

  function hasBusinessAccess() {
    return businessAccessTier() !== "free";
  }

  function hasPremiumAnalytics() {
    return businessAccessTier() === "premium";
  }

  function renderBusinessAccess() {
    var tier = businessAccessTier();
    var locked = tier === "free";
    var badge = ui.qs("#business-access-badge");
    var lock = ui.qs("#business-calculator-lock");
    var premiumLock = ui.qs("#premium-analytics-lock");
    var upgradeButton = ui.qs('#premium-analytics-lock [data-request-business-plan="premium"]');
    var upgradePending = Boolean(activePromotion() && activePromotion().upgrade_requested_plan === "premium");

    if (tier !== "premium" && analyticsRange.preset === "custom") {
      var featuredRange = presetDateWindow("month");
      analyticsRange.preset = "month";
      analyticsRange.from = localDateValue(featuredRange.start);
      analyticsRange.to = localDateValue(featuredRange.end);
    }

    if (badge) {
      badge.classList.toggle("is-featured", tier === "featured");
      badge.classList.toggle("is-premium", tier === "premium");
      badge.textContent = tier === "premium"
        ? "Premium - full business analytics"
        : tier === "featured"
        ? "Featured - business essentials"
        : "Free - business calculator locked";
    }
    if (lock) lock.classList.toggle("hidden", !locked);
    if (premiumLock) premiumLock.classList.toggle("hidden", tier !== "featured");
    if (upgradeButton) {
      upgradeButton.disabled = upgradePending;
      upgradeButton.textContent = upgradePending ? "Premium upgrade requested" : "Request Premium upgrade";
    }

    ui.qsa("[data-business-tools]").forEach(function (section) {
      section.classList.toggle("hidden", locked);
      section.setAttribute("aria-hidden", locked ? "true" : "false");
    });
    ui.qsa("[data-premium-analytics]").forEach(function (section) {
      var premiumOnlyLocked = tier !== "premium";
      section.classList.toggle("hidden", premiumOnlyLocked);
      section.setAttribute("aria-hidden", premiumOnlyLocked ? "true" : "false");
      section.querySelectorAll("input, select, textarea, button").forEach(function (control) {
        control.disabled = premiumOnlyLocked;
      });
    });
    ui.qsa("[data-business-nav]").forEach(function (link) {
      link.classList.toggle("is-locked", locked);
      link.setAttribute("aria-disabled", locked ? "true" : "false");
    });
    ui.hydrateIcons();
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
    var detail = promotion && promotion.upgrade_requested_plan === "premium"
      ? "Premium upgrade requested - waiting for admin payment confirmation."
      : scheduleLive && !live
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

  function localDateValue(value) {
    var date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")
    ].join("-");
  }

  function parseLocalDate(value, endOfDay) {
    var parts = String(value || "").split("-").map(Number);
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return null;
    return new Date(
      parts[0],
      parts[1] - 1,
      parts[2],
      endOfDay ? 23 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 999 : 0
    );
  }

  function startOfDay(value) {
    var date = value ? new Date(value) : new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function endOfDay(value) {
    var date = value ? new Date(value) : new Date();
    date.setHours(23, 59, 59, 999);
    return date;
  }

  function offsetDays(value, amount) {
    var date = new Date(value);
    date.setDate(date.getDate() + amount);
    return date;
  }

  function presetDateWindow(preset) {
    var today = startOfDay();
    var start = new Date(today);
    var end = endOfDay(today);
    var normalized = preset === "this-week" ? "week" : preset === "this-month" ? "month" : preset;

    if (normalized === "yesterday") {
      start = offsetDays(today, -1);
      end = endOfDay(start);
    } else if (normalized === "week") {
      var mondayOffset = (today.getDay() + 6) % 7;
      start = offsetDays(today, -mondayOffset);
    } else if (normalized === "month") {
      start = new Date(today.getFullYear(), today.getMonth(), 1);
    }

    return { start: start, end: end };
  }

  function currentAnalyticsWindow() {
    if (analyticsRange.preset === "custom") {
      var customStart = parseLocalDate(analyticsRange.from, false);
      var customEnd = parseLocalDate(analyticsRange.to, true);
      if (customStart && customEnd && customStart <= customEnd) {
        return { start: customStart, end: customEnd };
      }
    }
    return presetDateWindow(analyticsRange.preset || "month");
  }

  function syncAnalyticsControls() {
    var windowRange = currentAnalyticsWindow();
    var from = ui.qs("#analytics-date-from");
    var to = ui.qs("#analytics-date-to");
    if (from && document.activeElement !== from) from.value = analyticsRange.from || localDateValue(windowRange.start);
    if (to && document.activeElement !== to) to.value = analyticsRange.to || localDateValue(windowRange.end);

    ui.qsa("[data-date-preset], [data-analytics-range]").forEach(function (button) {
      var value = button.dataset.datePreset || button.dataset.analyticsRange || "";
      var normalized = value === "this-week" ? "week" : value === "this-month" ? "month" : value;
      var active = normalized === analyticsRange.preset;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function initializeAnalyticsRange() {
    var range = presetDateWindow("month");
    analyticsRange.preset = "month";
    analyticsRange.from = localDateValue(range.start);
    analyticsRange.to = localDateValue(range.end);
    syncAnalyticsControls();
  }

  function dateIsInWindow(value, windowRange) {
    var date = value instanceof Date ? value : new Date(value);
    var time = date.getTime();
    return Number.isFinite(time) && time >= windowRange.start.getTime() && time <= windowRange.end.getTime();
  }

  function orderCompletedAt(order) {
    return order.completed_at || order.updated_at || order.created_at;
  }

  function selectedOrderItems(order) {
    var stallId = activeStallId();
    return (order.items || []).filter(function (item) {
      return item.stall_id === stallId;
    });
  }

  function menuItemForSale(item) {
    return cache.menuItems.find(function (menuItem) {
      return menuItem.id === item.menu_item_id;
    }) || null;
  }

  function soldItemName(item) {
    var menuItem = menuItemForSale(item);
    var nested = item.menu_item || item.menu_items || {};
    return (menuItem && menuItem.name) || nested.name || "Menu item";
  }

  function analyticsSnapshot() {
    var range = currentAnalyticsWindow();
    var completedOrders = filteredOrders().filter(function (order) {
      return order.status === "Completed" && order.payment_status === "Paid" &&
        dateIsInWindow(orderCompletedAt(order), range);
    });
    var expenses = cache.expenses.filter(function (expense) {
      if (expense.stall_id !== activeStallId()) return false;
      var expenseDate = parseLocalDate(expense.expense_date || expense.date, false);
      return expenseDate && dateIsInWindow(expenseDate, range);
    });
    var itemTotals = {};
    var salesEvents = [];
    var revenue = 0;
    var itemsSold = 0;

    completedOrders.forEach(function (order) {
      var orderRevenue = 0;
      selectedOrderItems(order).forEach(function (item) {
        var quantity = Math.max(0, Number(item.quantity || 0));
        var itemRevenue = Math.max(0, Number(item.price || 0)) * quantity;
        var menuItem = menuItemForSale(item);
        var key = item.menu_item_id || soldItemName(item);
        var hasSnapshotCost = Object.prototype.hasOwnProperty.call(item, "unit_cost_snapshot");
        var estimatedCost = Math.max(0, Number(hasSnapshotCost
          ? item.unit_cost_snapshot
          : menuItem && menuItem.estimated_cost || 0));
        if (!itemTotals[key]) {
          itemTotals[key] = {
            id: item.menu_item_id || key,
            name: soldItemName(item),
            quantity: 0,
            revenue: 0,
            estimatedCost: estimatedCost,
            estimatedTotalCost: 0
          };
        }
        itemTotals[key].quantity += quantity;
        itemTotals[key].revenue += itemRevenue;
        itemTotals[key].estimatedTotalCost += estimatedCost * quantity;
        revenue += itemRevenue;
        orderRevenue += itemRevenue;
        itemsSold += quantity;
      });
      salesEvents.push({ date: orderCompletedAt(order), amount: orderRevenue });
    });

    var totalExpenses = expenses.reduce(function (sum, expense) {
      return sum + Math.max(0, Number(expense.amount || 0));
    }, 0);
    var cogs = expenses.reduce(function (sum, expense) {
      var category = String(expense.category || "").toLowerCase();
      return category === "ingredients" || category === "ingredient" || category === "packaging"
        ? sum + Math.max(0, Number(expense.amount || 0))
        : sum;
    }, 0);
    var menuPerformance = Object.keys(itemTotals).map(function (key) {
      var item = itemTotals[key];
      item.estimatedCost = item.quantity ? item.estimatedTotalCost / item.quantity : item.estimatedCost;
      item.estimatedProfit = item.revenue - item.estimatedTotalCost;
      item.foodCostPercentage = item.revenue ? item.estimatedTotalCost / item.revenue * 100 : 0;
      return item;
    }).sort(function (a, b) {
      return b.quantity - a.quantity || b.revenue - a.revenue || a.name.localeCompare(b.name);
    });
    var netProfit = revenue - totalExpenses;

    return {
      range: range,
      completedOrders: completedOrders,
      expenses: expenses.slice().sort(function (a, b) {
        return new Date(b.expense_date || b.date) - new Date(a.expense_date || a.date);
      }),
      salesEvents: salesEvents,
      revenue: revenue,
      itemsSold: itemsSold,
      orderCount: completedOrders.length,
      averageOrderValue: completedOrders.length ? revenue / completedOrders.length : 0,
      bestSeller: menuPerformance[0] || null,
      menuPerformance: menuPerformance,
      totalExpenses: totalExpenses,
      cogs: cogs,
      grossProfit: revenue - cogs,
      netProfit: netProfit,
      profitMargin: revenue ? netProfit / revenue * 100 : 0,
      expensePercentage: revenue ? totalExpenses / revenue * 100 : 0
    };
  }

  function percentLabel(value) {
    var number = Number(value || 0);
    return (Number.isFinite(number) ? number : 0).toFixed(1) + "%";
  }

  function profitClass(value) {
    return Number(value || 0) >= 0 ? "profit-positive" : "profit-negative";
  }

  function periodLabel(range) {
    var options = { day: "numeric", month: "short", year: "numeric" };
    var start = range.start.toLocaleDateString([], options);
    var end = range.end.toLocaleDateString([], options);
    return start === end ? start : start + " - " + end;
  }

  function renderBusinessMetrics(snapshot) {
    var target = ui.qs("#business-metrics");
    if (!target) return;
    var bestSeller = snapshot.bestSeller
      ? snapshot.bestSeller.name + " (" + snapshot.bestSeller.quantity + ")"
      : "No completed sales";
    var cards = [
      '<article class="analytics-metric"><span>Total revenue</span><strong>' + ui.money(snapshot.revenue) + '</strong><small>Completed, paid sales</small></article>',
      '<article class="analytics-metric"><span>Total expenses</span><strong>' + ui.money(snapshot.totalExpenses) + '</strong><small>Recorded in this period</small></article>',
      '<article class="analytics-metric"><span>Net profit</span><strong class="' + profitClass(snapshot.netProfit) + '">' + ui.money(snapshot.netProfit) + '</strong><small>Revenue minus all expenses</small></article>',
      '<article class="analytics-metric"><span>Profit margin</span><strong class="' + profitClass(snapshot.profitMargin) + '">' + percentLabel(snapshot.profitMargin) + '</strong><small>Net profit / revenue</small></article>',
      '<article class="analytics-metric"><span>Completed orders</span><strong>' + snapshot.orderCount + '</strong><small>Paid orders containing this stall</small></article>',
      '<article class="analytics-metric"><span>Items sold</span><strong>' + snapshot.itemsSold + '</strong><small>Completed item quantity</small></article>',
      '<article class="analytics-metric"><span>Average order value</span><strong>' + ui.money(snapshot.averageOrderValue) + '</strong><small>Stall revenue per order</small></article>',
      '<article class="analytics-metric"><span>Best-selling item</span><strong class="metric-text">' + ui.escapeHtml(bestSeller) + '</strong><small>Ranked by quantity sold</small></article>'
    ];
    if (hasPremiumAnalytics()) {
      cards.splice(4, 0, '<article class="analytics-metric"><span>Gross profit</span><strong class="' + profitClass(snapshot.grossProfit) + '">' + ui.money(snapshot.grossProfit) + '</strong><small>Revenue minus ingredients &amp; packaging</small></article>');
    }
    target.innerHTML = cards.join("");
  }

  function expenseCategoryTotals(expenses) {
    return expenses.reduce(function (totals, expense) {
      var category = expense.category || "Other";
      totals[category] = (totals[category] || 0) + Math.max(0, Number(expense.amount || 0));
      return totals;
    }, {});
  }

  function renderPerformanceSummary(snapshot) {
    var target = ui.qs("#performance-summary");
    if (!target) return;
    var categories = expenseCategoryTotals(snapshot.expenses);
    var topCategory = Object.keys(categories).sort(function (a, b) {
      return categories[b] - categories[a];
    })[0];
    var stall = selectedProfileStall();
    target.innerHTML = [
      '<div><span>Reporting period</span><strong>' + ui.escapeHtml(periodLabel(snapshot.range)) + '</strong></div>',
      '<div><span>Cost of goods sold</span><strong>' + ui.money(snapshot.cogs) + '</strong></div>',
      '<div><span>Expense percentage</span><strong>' + percentLabel(snapshot.expensePercentage) + '</strong></div>',
      '<div><span>Top expense category</span><strong>' + ui.escapeHtml(topCategory ? topCategory + " - " + ui.money(categories[topCategory]) : "No expenses") + '</strong></div>',
      '<div><span>Stall rating</span><strong>' + (stall ? Number(stall.rating || 0).toFixed(1) + " / 5" : "-") + '</strong></div>'
    ].join("");
  }

  function trendBucket(value, mode) {
    var date = new Date(value);
    if (mode === "month") {
      return {
        key: date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0"),
        label: date.toLocaleDateString([], { month: "short", year: "numeric" })
      };
    }
    if (mode === "week") {
      var weekStart = startOfDay(date);
      weekStart = offsetDays(weekStart, -((weekStart.getDay() + 6) % 7));
      return {
        key: localDateValue(weekStart),
        label: weekStart.toLocaleDateString([], { day: "numeric", month: "short" })
      };
    }
    return {
      key: localDateValue(date),
      label: date.toLocaleDateString([], { day: "numeric", month: "short" })
    };
  }

  function trendData(snapshot) {
    var days = Math.floor((snapshot.range.end - snapshot.range.start) / 86400000) + 1;
    var mode = days > 93 ? "month" : days > 35 ? "week" : "day";
    var buckets = {};

    if (mode === "day" && days <= 35) {
      for (var cursor = startOfDay(snapshot.range.start); cursor <= snapshot.range.end; cursor = offsetDays(cursor, 1)) {
        var emptyBucket = trendBucket(cursor, mode);
        buckets[emptyBucket.key] = { key: emptyBucket.key, label: emptyBucket.label, revenue: 0, expenses: 0 };
      }
    }

    snapshot.salesEvents.forEach(function (event) {
      var bucket = trendBucket(event.date, mode);
      if (!buckets[bucket.key]) buckets[bucket.key] = { key: bucket.key, label: bucket.label, revenue: 0, expenses: 0 };
      buckets[bucket.key].revenue += event.amount;
    });
    snapshot.expenses.forEach(function (expense) {
      var bucket = trendBucket(parseLocalDate(expense.expense_date || expense.date, false), mode);
      if (!buckets[bucket.key]) buckets[bucket.key] = { key: bucket.key, label: bucket.label, revenue: 0, expenses: 0 };
      buckets[bucket.key].expenses += Math.max(0, Number(expense.amount || 0));
    });

    return Object.keys(buckets).sort().map(function (key) {
      var bucket = buckets[key];
      bucket.profit = bucket.revenue - bucket.expenses;
      return bucket;
    });
  }

  function renderSalesTrend(snapshot) {
    var target = ui.qs("#sales-trend-chart");
    if (!target) return;
    var data = trendData(snapshot);
    var hasData = data.some(function (entry) {
      return entry.revenue || entry.expenses;
    });
    if (!hasData) {
      target.setAttribute("role", "status");
      target.setAttribute("aria-label", "No sales or expense activity in the selected period.");
      target.innerHTML = '<div class="analytics-empty"><strong>No activity in this period</strong><span>Completed sales and recorded expenses will appear here.</span></div>';
      return;
    }
    var maxValue = data.reduce(function (max, entry) {
      return Math.max(max, entry.revenue, entry.expenses, Math.abs(entry.profit));
    }, 1);
    target.setAttribute("role", "group");
    target.setAttribute("aria-label", "Revenue, expenses and profit trend for " + periodLabel(snapshot.range));
    target.innerHTML = [
      '<div class="chart-legend" aria-hidden="true"><span><i class="legend-dot revenue"></i>Revenue</span><span><i class="legend-dot expenses"></i>Expenses</span><span><i class="legend-dot profit"></i>Profit</span></div>',
      '<div class="trend-chart" aria-hidden="true">',
      data.map(function (entry) {
        function height(value) {
          if (!value) return 0;
          return Math.max(4, Math.round(Math.abs(value) / maxValue * 100));
        }
        var title = entry.label + ": revenue " + ui.money(entry.revenue) + ", expenses " + ui.money(entry.expenses) + ", profit " + ui.money(entry.profit);
        return [
          '<div class="trend-column" title="' + ui.escapeHtml(title) + '">',
          '<div class="trend-bars">',
          '<span class="trend-bar revenue" style="height:' + height(entry.revenue) + '%"></span>',
          '<span class="trend-bar expenses" style="height:' + height(entry.expenses) + '%"></span>',
          '<span class="trend-bar profit' + (entry.profit < 0 ? " is-negative" : "") + '" style="height:' + height(entry.profit) + '%"></span>',
          '</div>',
          '<span class="trend-label">' + ui.escapeHtml(entry.label) + '</span>',
          '</div>'
        ].join("");
      }).join(""),
      '</div>',
      '<table class="sr-only"><caption>Revenue, expenses and profit trend for ' + ui.escapeHtml(periodLabel(snapshot.range)) + '</caption><thead><tr><th>Period</th><th>Revenue</th><th>Expenses</th><th>Profit</th></tr></thead><tbody>',
      data.map(function (entry) {
        return '<tr><th scope="row">' + ui.escapeHtml(entry.label) + '</th><td>' + ui.money(entry.revenue) + '</td><td>' + ui.money(entry.expenses) + '</td><td>' + ui.money(entry.profit) + '</td></tr>';
      }).join(""),
      '</tbody></table>'
    ].join("");
  }

  function renderExpenseBreakdown(snapshot) {
    var target = ui.qs("#expense-breakdown-chart");
    if (!target) return;
    var categories = expenseCategoryTotals(snapshot.expenses);
    var rows = Object.keys(categories).map(function (category) {
      return { category: category, amount: categories[category] };
    }).sort(function (a, b) {
      return b.amount - a.amount;
    });
    if (!rows.length) {
      target.setAttribute("role", "status");
      target.setAttribute("aria-label", "No expenses recorded in the selected period.");
      target.innerHTML = '<div class="analytics-empty"><strong>No expenses recorded</strong><span>Add an expense to see where the stall is spending.</span></div>';
      return;
    }
    var max = rows[0].amount || 1;
    target.setAttribute("role", "group");
    target.setAttribute("aria-label", "Expenses grouped by category for " + periodLabel(snapshot.range));
    target.innerHTML = '<div class="expense-breakdown">' + rows.map(function (row) {
      var share = snapshot.totalExpenses ? row.amount / snapshot.totalExpenses * 100 : 0;
      return [
        '<div class="breakdown-row">',
        '<div class="breakdown-label"><span>' + ui.escapeHtml(row.category) + '</span><strong>' + ui.money(row.amount) + ' &middot; ' + percentLabel(share) + '</strong></div>',
        '<div class="breakdown-track" role="meter" aria-label="' + ui.escapeHtml(row.category) + ' expenses" aria-valuemin="0" aria-valuemax="' + max + '" aria-valuenow="' + row.amount + '"><span class="breakdown-fill" style="width:' + Math.max(2, row.amount / max * 100) + '%"></span></div>',
        '</div>'
      ].join("");
    }).join("") + '</div>';
  }

  function renderMenuPerformance(snapshot) {
    var target = ui.qs("#menu-performance");
    if (!target) return;
    if (!snapshot.menuPerformance.length) {
      target.innerHTML = '<div class="analytics-empty"><strong>No completed item sales</strong><span>Menu performance will appear after paid orders are completed.</span></div>';
      return;
    }
    target.innerHTML = [
      '<table class="analytics-table">',
      '<thead><tr><th>Menu item</th><th>Sold</th><th>Revenue</th><th>Unit cost</th><th>Est. profit</th><th>Food cost</th></tr></thead>',
      '<tbody>',
      snapshot.menuPerformance.map(function (item) {
        return [
          '<tr><th scope="row">' + ui.escapeHtml(item.name) + '</th>',
          '<td>' + item.quantity + '</td>',
          '<td>' + ui.money(item.revenue) + '</td>',
          '<td>' + ui.money(item.estimatedCost) + '</td>',
          '<td class="' + profitClass(item.estimatedProfit) + '">' + ui.money(item.estimatedProfit) + '</td>',
          '<td>' + percentLabel(item.foodCostPercentage) + '</td></tr>'
        ].join("");
      }).join(""),
      '</tbody></table>'
    ].join("");
  }

  function renderBusinessAnalytics() {
    if (!activeStallId() || !hasBusinessAccess()) return;
    if (cache.financialError) {
      var metrics = ui.qs("#business-metrics");
      if (metrics) {
        metrics.innerHTML = '<div class="analytics-empty"><strong>Business figures are temporarily unavailable</strong><span>' +
          ui.escapeHtml(cache.financialError) + '</span></div>';
      }
      ["#performance-summary", "#sales-trend-chart", "#expense-breakdown-chart", "#menu-performance"].forEach(function (selector) {
        var target = ui.qs(selector);
        if (target) target.innerHTML = "";
      });
      return;
    }
    var snapshot = analyticsSnapshot();
    syncAnalyticsControls();
    renderBusinessMetrics(snapshot);
    if (hasPremiumAnalytics()) {
      renderPerformanceSummary(snapshot);
      renderSalesTrend(snapshot);
      renderExpenseBreakdown(snapshot);
      renderMenuPerformance(snapshot);
    }
  }

  function renderExpenseSummary(snapshot) {
    var target = ui.qs("#expense-summary");
    if (!target) return;
    var categories = expenseCategoryTotals(snapshot.expenses);
    target.innerHTML = [
      '<div><span>Expenses in period</span><strong>' + ui.money(snapshot.totalExpenses) + '</strong></div>',
      '<div><span>Entries</span><strong>' + snapshot.expenses.length + '</strong></div>',
      '<div><span>Categories</span><strong>' + Object.keys(categories).length + '</strong></div>'
    ].join("");
  }

  function formatExpenseDate(value) {
    var date = parseLocalDate(value, false);
    return date ? date.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" }) : "-";
  }

  function renderExpenseList(snapshot) {
    var target = ui.qs("#expense-list");
    if (!target) return;
    if (!snapshot.expenses.length) {
      target.innerHTML = '<div class="analytics-empty"><strong>No expenses in this period</strong><span>Use the form to record ingredients, packaging, staffing, utilities, or other business costs.</span></div>';
      return;
    }
    target.innerHTML = [
      '<table class="analytics-table expense-table">',
      '<thead><tr><th>Date</th><th>Expense</th><th>Category</th><th>Amount</th><th><span class="sr-only">Actions</span></th></tr></thead>',
      '<tbody>',
      snapshot.expenses.map(function (expense) {
        return [
          '<tr class="expense-row">',
          '<td>' + ui.escapeHtml(formatExpenseDate(expense.expense_date || expense.date)) + '</td>',
          '<th scope="row"><span>' + ui.escapeHtml(expense.expense_name || "Expense") + '</span>' + (expense.description ? '<small>' + ui.escapeHtml(expense.description) + '</small>' : '') + '</th>',
          '<td><span class="tag gold">' + ui.escapeHtml(expense.category || "Other") + '</span></td>',
          '<td><strong>' + ui.money(expense.amount) + '</strong></td>',
          '<td><div class="expense-actions">',
          '<button class="button ghost" type="button" data-edit-expense="' + ui.escapeHtml(expense.id) + '"><i data-lucide="pencil"></i>Edit</button>',
          '<button class="button ghost danger" type="button" data-delete-expense="' + ui.escapeHtml(expense.id) + '"><i data-lucide="trash-2"></i>Delete</button>',
          '</div></td>',
          '</tr>'
        ].join("");
      }).join(""),
      '</tbody></table>'
    ].join("");
    ui.hydrateIcons();
  }

  function renderExpenses() {
    if (!activeStallId() || !hasBusinessAccess()) return;
    if (cache.financialError) {
      var summary = ui.qs("#expense-summary");
      var list = ui.qs("#expense-list");
      if (summary) summary.innerHTML = "";
      if (list) {
        list.innerHTML = '<div class="analytics-empty"><strong>Expense records are temporarily unavailable</strong><span>' +
          ui.escapeHtml(cache.financialError) + '</span></div>';
      }
      return;
    }
    var snapshot = analyticsSnapshot();
    renderExpenseSummary(snapshot);
    renderExpenseList(snapshot);
  }

  function setExpenseFormMode(mode) {
    var heading = ui.qs("[data-expense-heading]");
    var button = ui.qs("#save-expense-button");
    var editing = mode === "edit";
    if (heading) heading.textContent = editing ? "Edit expense" : "Record an expense";
    if (button) {
      button.innerHTML = editing
        ? '<i data-lucide="save"></i>Update expense'
        : '<i data-lucide="plus"></i>Add expense';
    }
    ui.hydrateIcons();
  }

  function clearExpenseForm() {
    var form = ui.qs("#expense-form");
    if (!form) return;
    form.reset();
    if (form.elements.id) form.elements.id.value = "";
    if (form.elements.date) form.elements.date.value = localDateValue(new Date());
    if (form.elements.expense_date) form.elements.expense_date.value = localDateValue(new Date());
    setExpenseFormMode("new");
  }

  function loadExpenseIntoForm(expenseId) {
    var expense = cache.expenses.find(function (entry) {
      return entry.id === expenseId;
    });
    var form = ui.qs("#expense-form");
    if (!expense || !form) return;
    form.elements.id.value = expense.id;
    form.elements.expense_name.value = expense.expense_name || "";
    form.elements.category.value = expense.category || "Other";
    form.elements.amount.value = Number(expense.amount || 0).toFixed(2);
    if (form.elements.date) form.elements.date.value = expense.expense_date || expense.date || "";
    if (form.elements.expense_date) form.elements.expense_date.value = expense.expense_date || expense.date || "";
    form.elements.description.value = expense.description || "";
    setExpenseFormMode("edit");
    if (form.scrollIntoView) form.scrollIntoView({ behavior: "smooth", block: "center" });
    try {
      form.elements.expense_name.focus({ preventScroll: true });
    } catch (error) {
      form.elements.expense_name.focus();
    }
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
    var costHtml = hasPremiumAnalytics()
      ? '<small>Est. cost ' + ui.money(item.estimated_cost || 0) + "</small>"
      : "";
    return [
      '<article class="mini-row">',
      '<div class="mini-row-top">',
      "<div>",
      "<h3>" + ui.escapeHtml(item.name) + "</h3>",
      '<p>' + ui.escapeHtml(stall ? stall.name : "Food stall") + " - " + ui.escapeHtml(item.category || "Menu") + "</p>",
      "</div>",
      '<div class="menu-pricing"><strong class="price">' + ui.money(item.price) + "</strong>" + costHtml + "</div>",
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
    if (form.elements.estimated_cost) form.elements.estimated_cost.value = "";
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
    if (form.elements.estimated_cost) {
      form.elements.estimated_cost.value = Number(item.estimated_cost || 0) > 0
        ? Number(item.estimated_cost).toFixed(2)
        : "";
    }
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
    var preferred = sessionStall || (cache.stalls[0] && cache.stalls[0].id) || "";
    var exists = cache.stalls.some(function (stall) {
      return stall.id === preferred;
    });
    cache.selectedStallId = exists ? preferred : "";
    localStorage.setItem(selectedKey, cache.selectedStallId);

    if (!sessionStall || !cache.selectedStallId) {
      cache.menuItems = [];
      cache.orders = [];
      cache.expenses = [];
      cache.financialError = null;
      return;
    }

    var menuOptions = {
      includeUnavailable: true,
      includeClosed: true,
      stallId: sessionStall
    };
    var businessAccess = hasBusinessAccess();
    var premiumAccess = hasPremiumAnalytics();
    cache.expenses = [];
    cache.financialError = null;

    try {
      cache.menuItems = await store.listMenuItems(Object.assign({}, menuOptions, {
        includeCosts: premiumAccess
      }));
    } catch (error) {
      cache.financialError = error.message || "Private menu costs could not be loaded.";
      cache.menuItems = await store.listMenuItems(menuOptions);
    }

    try {
      cache.orders = await store.listOrders({
        stallId: sessionStall,
        operationalOnly: !businessAccess,
        includeCosts: premiumAccess
      });
    } catch (error) {
      cache.financialError = cache.financialError || error.message || "Historical order costs could not be loaded.";
      cache.orders = await store.listOrders({ stallId: sessionStall, operationalOnly: true });
    }

    if (businessAccess) {
      try {
        if (store.listExpenses && sessionStall) {
          cache.expenses = await store.listExpenses({ stallId: sessionStall });
        }
      } catch (error) {
        cache.expenses = [];
        cache.financialError = cache.financialError || error.message || "The financial database could not be reached.";
      }
    }
  }

  async function renderAll() {
    await loadData();
    var stats = ui.qs("#staff-stats");
    if (stats) stats.innerHTML = statsHtml();
    populateStallSelects();
    loadSelectedStallProfile();
    renderPromotionPanel();
    renderBusinessAccess();
    renderOrders();
    renderMenuList();
    renderBusinessAnalytics();
    renderExpenses();
  }

  async function refreshLiveOrders(showConfirmation) {
    var stallId = activeStallId();
    if (!stallId) return;
    try {
      var liveOrders = await store.listOrders({
        stallId: stallId,
        operationalOnly: true,
        includeCosts: hasPremiumAnalytics()
      });
      var refreshedIds = liveOrders.reduce(function (ids, order) {
        ids[order.id] = true;
        return ids;
      }, {});
      cache.orders = liveOrders.concat(cache.orders.filter(function (order) {
        return !refreshedIds[order.id];
      }));
      var stats = ui.qs("#staff-stats");
      if (stats) stats.innerHTML = statsHtml();
      renderBusinessAccess();
      renderOrders();
      renderBusinessAnalytics();
      if (showConfirmation) ui.toast("Live order queue refreshed.");
    } catch (error) {
      if (showConfirmation) ui.toast(error.message || "Unable to refresh live orders.", "error");
    }
  }

  async function refreshBusinessEntitlement() {
    var stallId = activeStallId();
    if (!stallId || !store.listStallPromotions) return;
    var previousTier = businessAccessTier();
    try {
      if (store.listPromotionPlans) cache.promotionPlans = await store.listPromotionPlans();
      cache.promotions = await store.listStallPromotions({ stallId: stallId });
      if (businessAccessTier() !== previousTier) {
        await renderAll();
        return;
      }
      renderPromotionPanel();
      renderBusinessAccess();
    } catch (error) {
      console.warn(error);
    }
  }

  function bindEvents() {
    var refresh = ui.qs("#refresh-staff-orders");
    var clear = ui.qs("#clear-menu-form");
    var menuForm = ui.qs("#menu-form");
    var expenseForm = ui.qs("#expense-form");
    var stallForm = ui.qs("#staff-stall-form");
    var promotionForm = ui.qs("#promotion-request-form");

    if (refresh) {
      refresh.addEventListener("click", function () {
        refreshLiveOrders(true);
      });
    }

    if (clear) {
      clear.addEventListener("click", clearMenuForm);
    }

    var clearExpense = ui.qs("#clear-expense-form");
    if (clearExpense) {
      clearExpense.addEventListener("click", clearExpenseForm);
    }

    ui.qsa("[data-date-preset], [data-analytics-range]").forEach(function (button) {
      button.addEventListener("click", function () {
        var value = button.dataset.datePreset || button.dataset.analyticsRange || "month";
        var preset = value === "this-week" ? "week" : value === "this-month" ? "month" : value;
        if (preset === "custom") {
          analyticsRange.preset = "custom";
          syncAnalyticsControls();
          var fromInput = ui.qs("#analytics-date-from");
          if (fromInput) fromInput.focus();
          return;
        }
        var windowRange = presetDateWindow(preset);
        analyticsRange.preset = preset;
        analyticsRange.from = localDateValue(windowRange.start);
        analyticsRange.to = localDateValue(windowRange.end);
        renderBusinessAnalytics();
        renderExpenses();
      });
    });

    var applyRange = ui.qs("#apply-analytics-range");
    var customRangeForm = applyRange && applyRange.closest("form");
    var applyCustomRange = function (event) {
        if (event) event.preventDefault();
        if (!hasPremiumAnalytics()) {
          ui.toast("Custom date ranges are available on Premium.");
          return;
        }
        var fromInput = ui.qs("#analytics-date-from");
        var toInput = ui.qs("#analytics-date-to");
        var fromDate = fromInput && parseLocalDate(fromInput.value, false);
        var toDate = toInput && parseLocalDate(toInput.value, true);
        if (!fromDate || !toDate || fromDate > toDate) {
          ui.toast("Choose a valid date range. The start date must be before the end date.", "error");
          return;
        }
        analyticsRange.preset = "custom";
        analyticsRange.from = fromInput.value;
        analyticsRange.to = toInput.value;
        renderBusinessAnalytics();
        renderExpenses();
    };
    if (customRangeForm) {
      customRangeForm.addEventListener("submit", applyCustomRange);
    } else if (applyRange) {
      applyRange.addEventListener("click", applyCustomRange);
    }

    if (expenseForm) {
      expenseForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        var button = ui.qs("#save-expense-button");
        var editing = Boolean(expenseForm.elements.id.value);
        var dateField = expenseForm.elements.date || expenseForm.elements.expense_date;
        var amount = Number(expenseForm.elements.amount.value);
        if (!Number.isFinite(amount) || amount <= 0) {
          ui.toast("Expense amount must be greater than zero.", "error");
          return;
        }
        if (button) button.disabled = true;
        try {
          if (!hasBusinessAccess()) throw new Error("A paid Featured or Premium plan is required for expense tracking.");
          if (!store.saveExpense) throw new Error("Expense storage is not available.");
          var stallId = activeStallId();
          if (!stallId) throw new Error("No stall assigned to this account.");
          await store.saveExpense({
            id: expenseForm.elements.id.value,
            stall_id: stallId,
            expense_name: expenseForm.elements.expense_name.value.trim(),
            category: expenseForm.elements.category.value,
            amount: amount,
            expense_date: dateField && dateField.value,
            description: expenseForm.elements.description.value.trim()
          });
          ui.toast(editing ? "Expense updated." : "Expense recorded.");
          clearExpenseForm();
          await renderAll();
        } catch (error) {
          ui.toast(error.message || "Unable to save this expense.", "error");
        } finally {
          if (button) button.disabled = false;
        }
      });
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

          var menuPayload = {
            id: menuForm.elements.id.value,
            stall_id: stallId,
            name: menuForm.elements.name.value.trim(),
            category: menuForm.elements.category.value.trim(),
            price: menuForm.elements.price.value,
            stock_quantity: menuForm.elements.stock_quantity.value,
            image_url: menuForm.elements.image_url.value.trim(),
            description: menuForm.elements.description.value.trim(),
            available: menuForm.elements.available.checked
          };
          if (hasPremiumAnalytics() && menuForm.elements.estimated_cost) {
            menuPayload.estimated_cost = menuForm.elements.estimated_cost.value;
          }
          await store.saveMenuItem(menuPayload);
          ui.toast(editing ? "Food item updated." : "Menu item saved.");
          clearMenuForm();
          await renderAll();
        } catch (error) {
          if (error.savedMenuItemId && !menuForm.elements.id.value) {
            menuForm.elements.id.value = error.savedMenuItemId;
          }
          ui.toast(error.message || "Unable to save menu item.", "error");
        } finally {
          if (button) button.disabled = false;
        }
      });
    }

    document.addEventListener("click", async function (event) {
      var businessNav = event.target.closest("[data-business-nav]");
      if (businessNav && !hasBusinessAccess()) {
        event.preventDefault();
        var calculatorLock = ui.qs("#business-calculator-lock");
        if (calculatorLock && calculatorLock.scrollIntoView) {
          calculatorLock.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        ui.toast("Business calculation is available on Featured and Premium plans.");
        return;
      }

      var requestPlanButton = event.target.closest("[data-request-business-plan]");
      if (requestPlanButton) {
        var requestedPlan = requestPlanButton.dataset.requestBusinessPlan;
        if (businessAccessTier() === "featured" && requestedPlan === "premium") {
          try {
            if (!store.requestStallUpgrade) throw new Error("Premium upgrade requests are not available.");
            await store.requestStallUpgrade("premium");
            ui.toast("Premium upgrade requested. The admin can now confirm payment and activate it.");
            await renderAll();
          } catch (error) {
            ui.toast(error.message || "Unable to request the Premium upgrade.", "error");
          }
          return;
        }
        if (promotionForm && promotionForm.elements.plan_slug) {
          promotionForm.elements.plan_slug.value = requestedPlan;
          if (promotionForm.scrollIntoView) {
            promotionForm.scrollIntoView({ behavior: "smooth", block: "center" });
          }
          window.setTimeout(function () {
            if (!promotionForm.elements.plan_slug.disabled) promotionForm.elements.plan_slug.focus({ preventScroll: true });
          }, 220);
          ui.toast("Review the " + (requestedPlan === "premium" ? "Premium" : "Featured") + " plan and send your request.");
        }
        return;
      }

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
        await refreshLiveOrders(false);
        return;
      }

      var editExpenseButton = event.target.closest("[data-edit-expense]");
      if (editExpenseButton) {
        loadExpenseIntoForm(editExpenseButton.dataset.editExpense);
        return;
      }

      var deleteExpenseButton = event.target.closest("[data-delete-expense]");
      if (deleteExpenseButton) {
        var expense = cache.expenses.find(function (entry) {
          return entry.id === deleteExpenseButton.dataset.deleteExpense;
        });
        if (!expense) return;
        if (!window.confirm('Delete the expense "' + expense.expense_name + '"?')) return;
        try {
          if (!store.deleteExpense) throw new Error("Expense storage is not available.");
          await store.deleteExpense(expense.id);
          ui.toast("Expense deleted.");
          clearExpenseForm();
          await renderAll();
        } catch (error) {
          ui.toast(error.message || "Unable to delete this expense.", "error");
        }
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
    initializeAnalyticsRange();
    clearExpenseForm();
    await renderAll();
    bindEvents();
    document.addEventListener("foodorder:orders-updated", function () {
      refreshLiveOrders(false);
    });
    window.setInterval(function () {
      refreshLiveOrders(false);
    }, 12000);
    window.setInterval(refreshBusinessEntitlement, 60000);
  });
})();
