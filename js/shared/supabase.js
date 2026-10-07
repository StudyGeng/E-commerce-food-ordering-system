(function () {
  var config = window.AppConfig || {};
  var seed = window.FoodSeed || {};
  var stateKey = "foodorder_state_v1";
  var cartKey = "foodorder_cart_v1";
  var tableKey = "foodorder_table_v1";
  var sessionKey = "foodorder_session_v1";
  var uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  var remoteUnavailable = false;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function now() {
    return new Date().toISOString();
  }

  function safeNumber(value) {
    var number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function normalizeExpenseRecord(expense) {
    var normalized = Object.assign({
      description: "",
      expense_name: "",
      category: "",
      expense_date: ""
    }, expense || {});
    normalized.amount = Math.max(0, safeNumber(normalized.amount));
    return normalized;
  }

  function makeId(prefix) {
    return prefix + "-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
  }

  function makeUuid() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (character) {
      var random = Math.floor(Math.random() * 16);
      var value = character === "x" ? random : (random & 0x3) | 0x8;
      return value.toString(16);
    });
  }

  function historyRetentionMs() {
    var minutes = safeNumber(config.completedOrderRetentionMinutes || config.orderHistoryRetentionMinutes || 40);
    return Math.max(1, minutes) * 60 * 1000;
  }

  function pendingWarningMs() {
    var minutes = safeNumber(config.pendingOrderWarningMinutes || 10);
    return Math.max(1, minutes) * 60 * 1000;
  }

  function pendingAutoCancelMs() {
    var minutes = safeNumber(config.pendingOrderAutoCancelMinutes || 15);
    return Math.max(1, minutes) * 60 * 1000;
  }

  function normalizeTableCode(value) {
    return String(value || "").trim().toUpperCase();
  }

  function tableCodeCandidates(value) {
    var clean = normalizeTableCode(value);
    if (!clean) return [];

    var candidates = [clean];
    var match = clean.match(/^([A-Z]+)(\d+)$/);
    if (match) {
      var compactNumber = String(Number(match[2]));
      var paddedNumber = compactNumber.padStart(2, "0");
      var compactCode = match[1] + compactNumber;
      var paddedCode = match[1] + paddedNumber;
      if (candidates.indexOf(compactCode) === -1) candidates.push(compactCode);
      if (candidates.indexOf(paddedCode) === -1) candidates.push(paddedCode);
    }

    return candidates;
  }

  function findTableByCode(tables, value) {
    var candidates = tableCodeCandidates(value);
    return (tables || []).find(function (entry) {
      return candidates.indexOf(normalizeTableCode(entry.code)) !== -1;
    });
  }

  function isTerminalOrder(order) {
    return ["Completed", "Cancelled"].indexOf(order.status) !== -1;
  }

  function isCurrentServiceDay(value) {
    var date = new Date(value);
    if (!Number.isFinite(date.getTime())) return true;
    var today = new Date();
    return date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate();
  }

  function isFreshOrder(order) {
    var activity = new Date(order.updated_at || order.created_at).getTime();
    if (!Number.isFinite(activity)) return true;
    if (!isTerminalOrder(order)) return isCurrentServiceDay(order.created_at || order.updated_at);
    return Date.now() - activity <= historyRetentionMs();
  }

  function orderAgeMs(order) {
    var created = new Date(order && order.created_at).getTime();
    if (!Number.isFinite(created)) return 0;
    return Date.now() - created;
  }

  function scheduledOrderTime(order, waitMs) {
    var created = new Date(order && order.created_at).getTime();
    if (!Number.isFinite(created)) return now();
    return new Date(created + waitMs).toISOString();
  }

  function orderStallIds(state, orderId) {
    var seen = {};
    return (state.order_items || []).filter(function (item) {
      if (item.order_id !== orderId || seen[item.stall_id]) return false;
      seen[item.stall_id] = true;
      return true;
    }).map(function (item) {
      return item.stall_id;
    });
  }

  function addOrderEvent(state, order, type, message, createdAt) {
    state.events = state.events || [];
    var exists = state.events.some(function (event) {
      return event.order_id === order.id && event.type === type;
    });
    if (exists) return;

    state.events.push({
      id: makeId("event"),
      type: type,
      order_id: order.id,
      table_code: order.table_code || "",
      table_label: order.table_label || "",
      customer_name: order.customer_name || "Customer",
      stall_ids: orderStallIds(state, order.id),
      message: message,
      created_at: createdAt || now()
    });
  }

  function restoreOrderStock(state, order, restoredAt) {
    if (order.stock_released_at) return;
    (state.order_items || []).forEach(function (entry) {
      if (entry.order_id !== order.id) return;
      var menuItem = (state.menu_items || []).find(function (item) {
        return item.id === entry.menu_item_id;
      });
      if (!menuItem) return;
      menuItem.stock_quantity = safeNumber(menuItem.stock_quantity) + safeNumber(entry.quantity);
      if (safeNumber(menuItem.stock_quantity) > 0) menuItem.available = true;
      menuItem.updated_at = restoredAt;
    });
    order.stock_released_at = restoredAt;
  }

  function applyPendingOrderRules(state) {
    var warningMs = pendingWarningMs();
    var autoCancelMs = Math.max(pendingAutoCancelMs(), warningMs);
    var warningMinutes = Math.round(warningMs / 60000);
    var autoCancelMinutes = Math.round(autoCancelMs / 60000);
    (state.orders || []).forEach(function (order) {
      if (!order || order.status !== "Pending") return;

      var age = orderAgeMs(order);
      if (age >= warningMs && !order.pending_warning_at) {
        order.pending_warning_at = scheduledOrderTime(order, warningMs);
        addOrderEvent(
          state,
          order,
          "pending-warning",
          "Order has been pending for over " + warningMinutes + " minutes without stall acceptance.",
          order.pending_warning_at
        );
      }

      if (age >= autoCancelMs) {
        var cancelledAt = scheduledOrderTime(order, autoCancelMs);
        order.status = "Cancelled";
        order.auto_cancelled_at = order.auto_cancelled_at || cancelledAt;
        order.cancellation_reason = "Auto-cancelled after " + autoCancelMinutes + " minutes without stall acceptance.";
        order.updated_at = order.auto_cancelled_at;
        restoreOrderStock(state, order, order.auto_cancelled_at);

        order.payment_status = "Failed";
        (state.payments || []).forEach(function (payment) {
          if (payment.order_id === order.id) {
            payment.status = "Failed";
            payment.updated_at = order.auto_cancelled_at;
          }
        });

        addOrderEvent(
          state,
          order,
          "auto-cancelled",
          "Order was auto-cancelled after " + autoCancelMinutes + " minutes without stall acceptance.",
          order.auto_cancelled_at
        );
      }
    });
    return state;
  }

  async function applyRemotePendingOrderRules(orders) {
    if (!canUseRemote()) return orders;
    var autoCancelMs = Math.max(pendingAutoCancelMs(), pendingWarningMs());
    var autoCancelMinutes = Math.round(autoCancelMs / 60000);
    var expired = (orders || []).filter(function (order) {
      return order && order.status === "Pending" && orderAgeMs(order) >= autoCancelMs;
    });
    if (!expired.length) return orders;

    var updatedAt = now();
    await Promise.all(expired.map(function (order) {
      return Promise.all([
        client
          .from("orders")
          .update({ status: "Cancelled", payment_status: "Failed", updated_at: updatedAt })
          .eq("id", order.id),
        client
          .from("payments")
          .update({ status: "Failed" })
          .eq("order_id", order.id)
      ]);
    }));

    var expiredIds = expired.reduce(function (ids, order) {
      ids[order.id] = true;
      return ids;
    }, {});

    return orders.map(function (order) {
      if (!expiredIds[order.id]) return order;
      return Object.assign({}, order, {
        status: "Cancelled",
        payment_status: "Failed",
        auto_cancelled_at: updatedAt,
        cancellation_reason: "Auto-cancelled after " + autoCancelMinutes + " minutes without stall acceptance.",
        updated_at: updatedAt
      });
    });
  }

  function pruneExpiredOrders(state) {
    var orders = state.orders || [];
    var freshOrders = orders.filter(function (order) {
      return order.status === "Completed" || isFreshOrder(order);
    });
    if (freshOrders.length === orders.length) return state;

    var keepOrderIds = freshOrders.reduce(function (ids, order) {
      ids[order.id] = true;
      return ids;
    }, {});

    state.orders = freshOrders;
    state.order_items = (state.order_items || []).filter(function (item) {
      return keepOrderIds[item.order_id];
    });
    var keepOrderItemIds = state.order_items.reduce(function (ids, item) {
      ids[item.id] = true;
      return ids;
    }, {});
    state.order_item_costs = (state.order_item_costs || []).filter(function (cost) {
      return keepOrderItemIds[cost.order_item_id];
    });
    state.payments = (state.payments || []).filter(function (payment) {
      return keepOrderIds[payment.order_id];
    });
    state.events = (state.events || []).filter(function (event) {
      return !event.order_id || keepOrderIds[event.order_id];
    });

    return state;
  }

  function initialState() {
    return {
      users: clone(seed.users || []),
      stalls: clone(seed.stalls || []),
      promotion_plans: clone(seed.promotion_plans || []),
      stall_promotions: clone(seed.stall_promotions || []),
      stall_popularity_metrics: clone(seed.stall_popularity_metrics || []),
      menu_items: clone(seed.menu_items || []),
      menu_item_costs: clone(seed.menu_item_costs || []),
      expenses: clone(seed.expenses || []),
      tables: clone(seed.tables || []),
      orders: clone(seed.orders || []),
      order_items: clone(seed.order_items || []),
      order_item_costs: clone(seed.order_item_costs || []),
      payments: clone(seed.payments || []),
      events: clone(seed.events || [])
    };
  }

  function normalizeState(state) {
    var fresh = initialState();
    var next = Object.assign({}, fresh, state || {});
    var hadStoredMenuItemCosts = Boolean(state && Array.isArray(state.menu_item_costs));

    next.users = (next.users || []).map(function (user) {
      var seedUser = fresh.users.find(function (entry) {
        return entry.id === user.id;
      }) || {};
      return Object.assign({}, seedUser, user);
    });

    next.stalls = (next.stalls || []).map(function (stall) {
      var seedStall = fresh.stalls.find(function (entry) {
        return entry.id === stall.id;
      }) || {};
      return Object.assign({ closed: false, wait_minutes: 10 }, seedStall, stall);
    });

    next.promotion_plans = (next.promotion_plans && next.promotion_plans.length)
      ? next.promotion_plans
      : fresh.promotion_plans;
    next.stall_promotions = (next.stall_promotions || []).map(function (promotion) {
      return Object.assign({
        plan_slug: "free",
        campaign_status: "inactive",
        payment_status: "pending",
        headline: "",
        price_minor: 0,
        currency: "MYR",
        starts_at: null,
        ends_at: null,
        upgrade_requested_plan: null,
        upgrade_requested_at: null
      }, promotion);
    });
    next.stall_popularity_metrics = (next.stall_popularity_metrics && next.stall_popularity_metrics.length)
      ? next.stall_popularity_metrics
      : fresh.stall_popularity_metrics;

    next.menu_item_costs = (Array.isArray(next.menu_item_costs) ? next.menu_item_costs : fresh.menu_item_costs).map(function (cost) {
      return Object.assign({}, cost, { estimated_cost: Math.max(0, safeNumber(cost.estimated_cost)) });
    });
    next.menu_items = (next.menu_items || []).map(function (item) {
      var seedItem = fresh.menu_items.find(function (entry) {
        return entry.id === item.id;
      }) || {};
      var legacyCost = Object.prototype.hasOwnProperty.call(item, "estimated_cost")
        ? Math.max(0, safeNumber(item.estimated_cost))
        : null;
      var normalized = Object.assign({ stock_quantity: 10, available: true }, seedItem, item);
      delete normalized.estimated_cost;
      if (legacyCost !== null) {
        var migratedCost = next.menu_item_costs.find(function (cost) {
          return cost.menu_item_id === item.id;
        });
        if (migratedCost && !hadStoredMenuItemCosts) {
          migratedCost.stall_id = item.stall_id;
          migratedCost.estimated_cost = legacyCost;
        } else if (!migratedCost) {
          next.menu_item_costs.push({
            menu_item_id: item.id,
            stall_id: item.stall_id,
            estimated_cost: legacyCost
          });
        }
      }
      return normalized;
    });

    next.expenses = (Array.isArray(next.expenses) ? next.expenses : fresh.expenses).map(normalizeExpenseRecord);
    next.order_item_costs = (Array.isArray(next.order_item_costs) ? next.order_item_costs : fresh.order_item_costs).map(function (cost) {
      return Object.assign({}, cost, { unit_cost: Math.max(0, safeNumber(cost.unit_cost)) });
    });

    next.orders = (next.orders || []).map(function (order) {
      var normalized = Object.assign({ completed_at: null }, order);
      if (normalized.status === "Completed" && !normalized.completed_at) {
        normalized.completed_at = normalized.updated_at || normalized.created_at || null;
      }
      if (normalized.status !== "Completed") normalized.completed_at = null;
      return normalized;
    });

    next.tables = next.tables && next.tables.length ? next.tables : fresh.tables;
    next.events = Array.isArray(next.events) ? next.events : [];
    next = applyPendingOrderRules(next);
    next = pruneExpiredOrders(next);
    saveState(next);
    return next;
  }

  function getState() {
    var stored = localStorage.getItem(stateKey);
    if (!stored) {
      var fresh = normalizeState(initialState());
      return fresh;
    }

    try {
      return normalizeState(JSON.parse(stored));
    } catch (error) {
      var reset = normalizeState(initialState());
      return reset;
    }
  }

  function saveState(state) {
    localStorage.setItem(stateKey, JSON.stringify(state));
  }

  function normalizeLoginIdentity(value) {
    return String(value || "").trim().toLowerCase();
  }

  function isConfigured(value) {
    return Boolean(value && !String(value).includes("your-"));
  }

  function supabaseTimeoutMs() {
    var value = Number(config.supabaseRequestTimeoutMs || 2500);
    return Number.isFinite(value) && value > 0 ? value : 2500;
  }

  function remoteFetch(resource, options) {
    if (!window.AbortController) return fetch(resource, options);

    var controller = new AbortController();
    var timeout = window.setTimeout(function () {
      controller.abort();
    }, supabaseTimeoutMs());
    var nextOptions = Object.assign({}, options || {}, { signal: controller.signal });

    return fetch(resource, nextOptions).finally(function () {
      window.clearTimeout(timeout);
    });
  }

  function getClient() {
    if (!window.supabase) return null;
    var supabaseKey = config.supabasePublishableKey || config.supabaseAnonKey;
    if (!isConfigured(config.supabaseUrl) || !isConfigured(supabaseKey)) return null;
    return window.supabase.createClient(config.supabaseUrl, supabaseKey, {
      global: { fetch: remoteFetch }
    });
  }

  var client = getClient();
  var promotionRemoteConfigured = isConfigured(config.supabaseUrl) &&
    isConfigured(config.supabasePublishableKey || config.supabaseAnonKey);

  function canUseRemote() {
    return Boolean(client && !remoteUnavailable);
  }

  function isNetworkError(error) {
    var text = error ? [error.message, error.details, error.hint, error.code, error.name]
      .filter(Boolean)
      .join(" ")
      .toLowerCase() : "";
    return text.includes("failed to fetch") ||
      text.includes("fetch failed") ||
      text.includes("networkerror") ||
      text.includes("network request failed") ||
      text.includes("aborterror") ||
      text.includes("aborted") ||
      text.includes("load failed");
  }

  function noteRemoteError(error) {
    if (!error) return false;
    console.warn(error);
    if (!isNetworkError(error)) throw new Error(error.message || "Database request was rejected.");

    remoteUnavailable = true;
    return true;
  }

  function shouldUseRemoteRows(rows, seedRows, label) {
    if (!Array.isArray(rows)) return Boolean(rows);
    if (rows.length || !(seedRows || []).length) return true;

    console.warn("Supabase " + label + " has no rows. Using local demo data for this browser session.");
    remoteUnavailable = true;
    return false;
  }

  function getLocalCart() {
    var stored = localStorage.getItem(cartKey);
    if (!stored) return [];

    try {
      return JSON.parse(stored);
    } catch (error) {
      return [];
    }
  }

  function saveLocalCart(cart) {
    localStorage.setItem(cartKey, JSON.stringify(cart));
  }

  function sortByName(rows) {
    return rows.slice().sort(function (a, b) {
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
  }

  function promotionIsLive(promotion, referenceTime) {
    if (!promotion) return false;
    if (["featured", "premium"].indexOf(promotion.plan_slug) === -1) return false;
    if (promotion.campaign_status !== "active" || promotion.payment_status !== "paid") return false;

    if (!promotion.starts_at || !promotion.ends_at) return false;
    var timestamp = referenceTime === undefined ? Date.now() : new Date(referenceTime).getTime();
    var startsAt = new Date(promotion.starts_at).getTime();
    var endsAt = new Date(promotion.ends_at).getTime();
    if (!Number.isFinite(timestamp) || !Number.isFinite(startsAt) || !Number.isFinite(endsAt)) return false;
    return startsAt <= timestamp && timestamp < endsAt;
  }

  function localBusinessTier(state, stallId) {
    var session = getSession();
    if (session && session.role === "admin") return "premium";
    if (!session || session.role !== "staff" || !stallId || session.assigned_stall_id !== stallId) {
      return "free";
    }

    // A configured deployment must use its server-side entitlement records. It
    // must never inherit a paid tier from bundled demo data while offline.
    if (promotionRemoteConfigured) return "free";

    var promotion = (state.stall_promotions || []).find(function (entry) {
      return entry.stall_id === stallId;
    });
    if (!promotionIsLive(promotion)) return "free";
    var enabledPlan = (state.promotion_plans || []).some(function (plan) {
      return plan.slug === promotion.plan_slug && plan.active !== false;
    });
    if (!enabledPlan) return "free";
    return promotion.plan_slug === "premium" ? "premium" : "featured";
  }

  function assertLocalBusinessAccess(state, stallId, premiumOnly) {
    var session = getSession();
    if (session && session.role === "admin") return;
    var tier = localBusinessTier(state, stallId);
    if (premiumOnly ? tier !== "premium" : tier === "free") {
      throw new Error(premiumOnly
        ? "An active Premium plan is required for menu costing."
        : "An active Featured or Premium plan is required for business calculations.");
    }
  }

  function financialRequestError(error, fallbackMessage) {
    if (error && isNetworkError(error)) noteRemoteError(error);
    else if (error) console.warn(error);
    return new Error(fallbackMessage || (error && error.message) || "Financial data is unavailable.");
  }

  function localStallDiscovery(includeSponsored) {
    var state = getState();

    return (state.stalls || []).filter(function (stall) {
      return !stall.closed && (state.menu_items || []).some(function (item) {
        return item.stall_id === stall.id && item.available && safeNumber(item.stock_quantity) > 0;
      });
    }).map(function (stall) {
      var popularity = (state.stall_popularity_metrics || []).find(function (entry) {
        return entry.stall_id === stall.id;
      });

      var promotion = (state.stall_promotions || []).find(function (entry) {
        return entry.stall_id === stall.id;
      });
      var live = Boolean(includeSponsored && promotionIsLive(promotion));
      var plan = live && (state.promotion_plans || []).find(function (entry) {
        return entry.slug === promotion.plan_slug;
      });

      return {
        stall_id: stall.id,
        is_sponsored: live,
        promotion_plan: live ? promotion.plan_slug : null,
        promotion_headline: live ? promotion.headline || "" : "",
        sponsor_rank: live ? safeNumber(plan && plan.placement_priority) : 0,
        recent_orders: Math.max(0, Math.floor(safeNumber(popularity && popularity.completed_orders_30d))),
        recent_items: Math.max(0, Math.floor(safeNumber(popularity && popularity.items_sold_30d)))
      };
    });
  }

  async function listPromotionPlans(filters) {
    var options = filters || {};
    if (canUseRemote()) {
      var remote = client.from("promotion_plans").select("*").order("placement_priority", { ascending: true });
      if (!options.includeInactive) remote = remote.eq("active", true);
      remote = await remote;
      if (!remote.error && remote.data) return remote.data;
      if (!isNetworkError(remote.error)) {
        console.warn(remote.error);
        return [];
      }
      noteRemoteError(remote.error);
    }

    if (promotionRemoteConfigured) return [];

    var plans = clone(getState().promotion_plans || []);
    if (!options.includeInactive) {
      plans = plans.filter(function (plan) { return plan.active; });
    }
    return plans.sort(function (a, b) {
      return safeNumber(a.placement_priority) - safeNumber(b.placement_priority);
    });
  }

  async function listStallPromotions(filters) {
    var options = filters || {};
    if (client && canUseRemote()) {
      var remote;
      try {
        remote = client.from("stall_promotions").select("*").order("updated_at", { ascending: false });
        if (options.stallId) remote = remote.eq("stall_id", options.stallId);
        remote = await remote;
      } catch (error) {
        if (isNetworkError(error)) noteRemoteError(error);
        else console.warn(error);
        return [];
      }
      if (!remote.error && remote.data) return remote.data;
      if (!isNetworkError(remote.error)) {
        console.warn(remote.error);
        return [];
      }
      noteRemoteError(remote.error);
    }

    // Never expose seeded/demo paid entitlements when a configured database is offline.
    if (promotionRemoteConfigured) return [];

    var promotions = clone(getState().stall_promotions || []);
    if (options.stallId) {
      promotions = promotions.filter(function (promotion) {
        return promotion.stall_id === options.stallId;
      });
    }
    return promotions;
  }

  async function listStallDiscovery() {
    if (canUseRemote()) {
      var remote;
      try {
        remote = await client.rpc("get_stall_discovery");
      } catch (error) {
        if (isNetworkError(error)) noteRemoteError(error);
        else console.warn(error);
        return localStallDiscovery(false);
      }
      if (!remote.error && remote.data) return remote.data;

      // A configured production database must never inherit demo paid entitlements.
      if (!isNetworkError(remote.error)) {
        console.warn(remote.error);
        return [];
      }
      noteRemoteError(remote.error);
      return localStallDiscovery(false);
    }

    // If a configured client went offline earlier in this session, keep fallback rankings organic.
    return localStallDiscovery(!promotionRemoteConfigured);
  }

  async function saveStallPromotion(payload) {
    if (!payload || !payload.stall_id) throw new Error("Choose a stall for this promotion.");

    var startsAt = payload.starts_at || null;
    var endsAt = payload.ends_at || null;
    var startsAtTime = startsAt ? new Date(startsAt).getTime() : null;
    var endsAtTime = endsAt ? new Date(endsAt).getTime() : null;
    if ((startsAt && !Number.isFinite(startsAtTime)) || (endsAt && !Number.isFinite(endsAtTime))) {
      throw new Error("Enter a valid promotion start and end time.");
    }
    if (startsAt && endsAt && endsAtTime <= startsAtTime) {
      throw new Error("Promotion end time must be after its start time.");
    }

    var clean = {
      stall_id: payload.stall_id,
      plan_slug: payload.plan_slug || "free",
      campaign_status: payload.campaign_status || "inactive",
      payment_status: payload.payment_status || "pending",
      headline: payload.headline || "",
      price_minor: Math.max(0, Math.floor(safeNumber(payload.price_minor))),
      currency: String(payload.currency || "MYR").slice(0, 3).toUpperCase(),
      starts_at: startsAt,
      ends_at: endsAt,
      payment_reference: payload.payment_reference || null,
      requested_at: payload.requested_at || now(),
      paid_at: payload.payment_status === "paid" ? (payload.paid_at || now()) : null,
      updated_at: now()
    };
    if (Object.prototype.hasOwnProperty.call(payload, "upgrade_requested_plan")) {
      clean.upgrade_requested_plan = payload.upgrade_requested_plan || null;
      clean.upgrade_requested_at = payload.upgrade_requested_plan
        ? payload.upgrade_requested_at || now()
        : null;
    }

    if (clean.plan_slug === "free") {
      clean.campaign_status = "inactive";
      clean.payment_status = "pending";
      clean.price_minor = 0;
      clean.paid_at = null;
    }

    var requiresSchedule = ["featured", "premium"].indexOf(clean.plan_slug) !== -1 &&
      clean.campaign_status === "active" && clean.payment_status === "paid";
    if (requiresSchedule && (!startsAt || !endsAt)) {
      throw new Error("Active paid promotions require both a start and end time.");
    }

    if (promotionRemoteConfigured) {
      if (!client || !canUseRemote()) {
        throw new Error("Promotion service is unavailable; nothing was saved.");
      }

      var remote;
      try {
        remote = await client
          .from("stall_promotions")
          .upsert(clean, { onConflict: "stall_id" })
          .select("*")
          .single();
      } catch (error) {
        if (isNetworkError(error)) {
          noteRemoteError(error);
          throw new Error("Promotion service is unavailable; nothing was saved.");
        }
        throw error;
      }
      if (!remote.error && remote.data) return remote.data;
      if (isNetworkError(remote.error)) {
        noteRemoteError(remote.error);
        throw new Error("Promotion service is unavailable; nothing was saved.");
      }
      throw new Error((remote.error && remote.error.message) || "Promotion could not be saved.");
    }

    var state = getState();
    var existing = (state.stall_promotions || []).find(function (promotion) {
      return promotion.stall_id === clean.stall_id;
    });
    if (existing) {
      Object.assign(existing, clean);
    } else {
      existing = Object.assign({ created_at: now() }, clean);
      state.stall_promotions.push(existing);
    }
    saveState(state);
    return clone(existing);
  }

  async function requestStallPromotion(payload) {
    var planSlug = payload && payload.plan_slug;
    var headline = String((payload && payload.headline) || "").trim();
    if (["featured", "premium"].indexOf(planSlug) === -1) {
      throw new Error("Choose Featured or Premium.");
    }

    if (promotionRemoteConfigured) {
      if (!client || !canUseRemote()) {
        throw new Error("Promotion service is unavailable; nothing was requested.");
      }

      var remote;
      try {
        remote = await client.rpc("request_stall_promotion", {
          requested_plan: planSlug,
          requested_headline: headline
        });
      } catch (error) {
        if (isNetworkError(error)) {
          noteRemoteError(error);
          throw new Error("Promotion service is unavailable; nothing was requested.");
        }
        throw error;
      }
      if (!remote.error) return true;
      if (isNetworkError(remote.error)) {
        noteRemoteError(remote.error);
        throw new Error("Promotion service is unavailable; nothing was requested.");
      }
      throw new Error((remote.error && remote.error.message) || "Promotion request could not be submitted.");
    }

    var session = getSession();
    var stallId = session && session.role === "staff" ? session.assigned_stall_id : null;
    if (!stallId) throw new Error("No stall is assigned to this account.");
    var state = getState();
    var current = (state.stall_promotions || []).find(function (promotion) {
      return promotion.stall_id === stallId;
    });
    var currentEnd = current && current.ends_at ? new Date(current.ends_at).getTime() : null;
    var hasApprovedCampaign = Boolean(
      current &&
      current.campaign_status === "active" &&
      current.payment_status === "paid" &&
      ["featured", "premium"].indexOf(current.plan_slug) !== -1 &&
      !(Number.isFinite(currentEnd) && currentEnd <= Date.now())
    );
    if (hasApprovedCampaign) throw new Error("This stall already has an approved promotion.");
    var plan = (state.promotion_plans || []).find(function (entry) {
      return entry.slug === planSlug && entry.active;
    });
    if (!plan) throw new Error("This promotion plan is not available.");

    await saveStallPromotion({
      stall_id: stallId,
      plan_slug: plan.slug,
      campaign_status: "requested",
      payment_status: "pending",
      headline: headline,
      price_minor: plan.price_minor,
      currency: plan.currency,
      requested_at: now(),
      upgrade_requested_plan: null,
      upgrade_requested_at: null
    });
    return true;
  }

  async function requestStallUpgrade(planSlug) {
    if (planSlug !== "premium") throw new Error("Only the Premium upgrade is available.");

    if (promotionRemoteConfigured) {
      if (!client || !canUseRemote()) {
        throw new Error("Upgrade service is unavailable; nothing was requested.");
      }
      var remote;
      try {
        remote = await client.rpc("request_stall_upgrade", { requested_plan: planSlug });
      } catch (error) {
        if (isNetworkError(error)) noteRemoteError(error);
        throw new Error("Upgrade service is unavailable; nothing was requested.");
      }
      if (!remote.error) return true;
      if (isNetworkError(remote.error)) {
        noteRemoteError(remote.error);
        throw new Error("Upgrade service is unavailable; nothing was requested.");
      }
      throw new Error((remote.error && remote.error.message) || "Premium upgrade could not be requested.");
    }

    var session = getSession();
    var stallId = session && session.role === "staff" ? session.assigned_stall_id : null;
    if (!stallId) throw new Error("No stall is assigned to this account.");
    var state = getState();
    var premiumPlan = (state.promotion_plans || []).find(function (plan) {
      return plan.slug === "premium" && plan.active;
    });
    var featuredPlan = (state.promotion_plans || []).find(function (plan) {
      return plan.slug === "featured" && plan.active;
    });
    var promotion = (state.stall_promotions || []).find(function (entry) {
      return entry.stall_id === stallId;
    });
    if (!premiumPlan) throw new Error("The Premium plan is not available.");
    if (!featuredPlan || !promotion || promotion.plan_slug !== "featured" || !promotionIsLive(promotion)) {
      throw new Error("Only an active Featured plan can request this upgrade.");
    }
    promotion.upgrade_requested_plan = "premium";
    promotion.upgrade_requested_at = now();
    promotion.updated_at = now();
    saveState(state);
    return true;
  }

  function hydrateOrders(orders, orderItems, menuItems, stalls, orderItemCosts, costStallId) {
    return orders.map(function (order) {
      var items = orderItems
        .filter(function (item) {
          return item.order_id === order.id;
        })
        .map(function (item) {
          var menuItem = menuItems.find(function (menu) {
            return menu.id === item.menu_item_id;
          });
          var stall = stalls.find(function (record) {
            return record.id === item.stall_id;
          });
          var hydrated = Object.assign({}, item, {
            menu_item: menuItem || null,
            stall: stall || null
          });
          if (costStallId !== null && (!costStallId || item.stall_id === costStallId)) {
            var cost = (orderItemCosts || []).find(function (entry) {
              return entry.order_item_id === item.id;
            });
            if (cost) {
              hydrated.unit_cost_snapshot = Math.max(0, safeNumber(cost.unit_cost));
              hydrated.cost_source = cost.cost_source || "menu_cost_snapshot";
            }
          }
          return hydrated;
        });

      return Object.assign({}, order, { items: items });
    });
  }

  function applyCustomerHistoryLimit(orders, options) {
    if (!options || options.includeExpired) return orders;
    if (!options.customerId && !options.tableCode) return orders;
    return orders.filter(isFreshOrder);
  }

  async function listStalls(filters) {
    var options = filters || {};
    if (canUseRemote()) {
      var remote = client.from("stalls").select("*").order("name", { ascending: true });
      if (!options.includeClosed) remote = remote.eq("closed", false);
      remote = await remote;
      if (!remote.error && remote.data && shouldUseRemoteRows(remote.data, seed.stalls, "stalls")) return remote.data;
      noteRemoteError(remote.error);
    }

    var stalls = getState().stalls;
    if (!options.includeClosed) {
      stalls = stalls.filter(function (stall) {
        return !stall.closed;
      });
    }
    return sortByName(stalls);
  }

  async function listMenuItems(filters) {
    var options = filters || {};
    var query = String(options.query || "").trim().toLowerCase();
    var stallId = options.stallId || "all";
    var category = options.category || "all";

    if (canUseRemote()) {
      var remote = client.from("menu_items").select("*").order("name", { ascending: true });
      if (stallId !== "all") remote = remote.eq("stall_id", stallId);
      if (category !== "all") remote = remote.eq("category", category);
      if (!options.includeUnavailable) {
        remote = remote.eq("available", true).gt("stock_quantity", 0);
      }
      if (query) remote = remote.ilike("name", "%" + query + "%");
      var result = await remote;
      if (!result.error && result.data) {
        var unfiltered = !query && stallId === "all" && category === "all";
        if (!unfiltered || shouldUseRemoteRows(result.data, seed.menu_items, "menu items")) {
          var remoteItems = result.data;
          if (options.includeCosts) {
            var session = getSession();
            if (!session || ["staff", "admin"].indexOf(session.role) === -1) {
              throw new Error("Staff or admin access is required for menu costing.");
            }
            var costScope = session.role === "staff" ? session.assigned_stall_id : (stallId !== "all" ? stallId : "");
            var costQuery = client.from("menu_item_costs").select("menu_item_id, stall_id, estimated_cost");
            if (costScope) costQuery = costQuery.eq("stall_id", costScope);
            var costResult;
            try {
              costResult = await costQuery;
            } catch (error) {
              throw financialRequestError(error, "Private menu costs are unavailable; no cost data was shown.");
            }
            if (costResult.error) {
              throw financialRequestError(costResult.error, "Private menu costs are unavailable; no cost data was shown.");
            }
            var costsByItem = (costResult.data || []).reduce(function (lookup, cost) {
              lookup[cost.menu_item_id] = Math.max(0, safeNumber(cost.estimated_cost));
              return lookup;
            }, {});
            remoteItems = remoteItems.map(function (item) {
              var copy = Object.assign({}, item);
              if (Object.prototype.hasOwnProperty.call(costsByItem, item.id)) {
                copy.estimated_cost = costsByItem[item.id];
              }
              return copy;
            });
          }
          return remoteItems;
        }
      }
      noteRemoteError(result.error);
    }

    var state = getState();
    var localItems = state.menu_items.filter(function (item) {
      var stall = state.stalls.find(function (record) {
        return record.id === item.stall_id;
      });
      var text = [item.name, item.category, item.description, stall && stall.name].join(" ").toLowerCase();
      var matchesQuery = !query || text.includes(query);
      var matchesStall = stallId === "all" || item.stall_id === stallId;
      var matchesCategory = category === "all" || item.category === category;
      var inStock = safeNumber(item.stock_quantity) > 0;
      var stallIsOpen = !stall || !stall.closed || options.includeClosed;
      var matchesAvailability = options.includeUnavailable || (item.available && inStock);
      return matchesQuery && matchesStall && matchesCategory && matchesAvailability && stallIsOpen;
    });
    return localItems.map(function (item) {
      var copy = Object.assign({}, item);
      delete copy.estimated_cost;
      if (options.includeCosts && localBusinessTier(state, item.stall_id) === "premium") {
        var cost = (state.menu_item_costs || []).find(function (entry) {
          return entry.menu_item_id === item.id && entry.stall_id === item.stall_id;
        });
        if (cost) copy.estimated_cost = Math.max(0, safeNumber(cost.estimated_cost));
      }
      return copy;
    });
  }

  function expenseStallScope(requestedStallId) {
    var session = getSession();
    var requested = requestedStallId && requestedStallId !== "all"
      ? String(requestedStallId)
      : "";

    if (!session || ["staff", "admin"].indexOf(session.role) === -1) {
      throw new Error("Staff or admin access is required.");
    }

    if (session.role === "admin") return requested;
    if (!session.assigned_stall_id) throw new Error("No stall is assigned to this account.");
    if (requested && requested !== session.assigned_stall_id) {
      throw new Error("You can only manage expenses for your assigned stall.");
    }
    return session.assigned_stall_id;
  }

  async function listExpenses(filters) {
    var options = filters || {};
    var stallId = expenseStallScope(options.stallId);

    if (promotionRemoteConfigured) {
      if (!canUseRemote()) {
        throw new Error("Financial data is unavailable while the database is offline.");
      }
      var expenseRows = [];
      var expenseOffset = 0;
      var expenseCount = null;
      var pageSize = 1000;
      while (expenseCount === null || expenseRows.length < expenseCount) {
        var remote = client
          .from("expenses")
          .select("*", { count: "exact" })
          .order("expense_date", { ascending: false })
          .order("created_at", { ascending: false })
          .order("id", { ascending: true });
        if (stallId) remote = remote.eq("stall_id", stallId);
        var result;
        try {
          result = await remote.range(expenseOffset, expenseOffset + pageSize - 1);
        } catch (error) {
          throw financialRequestError(error, "Financial data could not be loaded from the database.");
        }
        if (result.error || !result.data) {
          throw financialRequestError(result.error, "Financial data could not be loaded from the database.");
        }
        if (expenseCount === null && result.count !== null && result.count !== undefined &&
          Number.isFinite(Number(result.count))) {
          expenseCount = Number(result.count);
        }
        if (!result.data.length) break;
        expenseRows = expenseRows.concat(result.data);
        expenseOffset += result.data.length;
      }
      return expenseRows.map(normalizeExpenseRecord);
    }

    var state = getState();
    if (stallId) assertLocalBusinessAccess(state, stallId, false);
    var expenses = clone(state.expenses || []).map(normalizeExpenseRecord);
    if (stallId) {
      expenses = expenses.filter(function (expense) {
        return expense.stall_id === stallId;
      });
    }
    return expenses.sort(function (a, b) {
      var dateOrder = String(b.expense_date || "").localeCompare(String(a.expense_date || ""));
      if (dateOrder) return dateOrder;
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
  }

  async function listUsers() {
    if (canUseRemote()) {
      var remote = await client.from("users").select("*").order("created_at", { ascending: true });
      if (!remote.error && remote.data && shouldUseRemoteRows(remote.data, seed.users, "users")) {
        return remote.data;
      }
      noteRemoteError(remote.error);
    }

    return clone(getState().users);
  }

  async function listOrders(filters) {
    var options = filters || {};
    var tableCode = normalizeTableCode(options.tableCode || (options.table && options.table.code));
    options.tableCode = tableCode;

    if (canUseRemote()) {
      var orderItemFields = options.includeCosts
        ? "*, menu_items(name, image_url), stalls(name), order_item_costs(unit_cost, cost_source)"
        : "*, menu_items(name, image_url), stalls(name)";
      var orderSelect = "*, " + (options.stallId ? "order_items!inner(" : "order_items(") + orderItemFields + ")";
      var serviceDayStartIso = "";
      if (options.operationalOnly) {
        var serviceDayStart = new Date();
        serviceDayStart.setHours(0, 0, 0, 0);
        serviceDayStartIso = serviceDayStart.toISOString();
      }
      var remoteRows = [];
      var orderOffset = 0;
      var orderCount = null;
      var orderPageSize = 1000;
      var orderResult;
      do {
        var remote = client
          .from("orders")
          .select(orderSelect, { count: "exact" })
          .order("created_at", { ascending: false })
          .order("id", { ascending: true });
        if (options.customerId && uuidPattern.test(options.customerId)) {
          remote = remote.eq("customer_id", options.customerId);
        }
        if (tableCode) remote = remote.eq("table_code", tableCode);
        if (options.stallId) remote = remote.eq("order_items.stall_id", options.stallId);
        if (serviceDayStartIso) remote = remote.gte("updated_at", serviceDayStartIso);
        try {
          orderResult = await remote.range(orderOffset, orderOffset + orderPageSize - 1);
        } catch (error) {
          orderResult = { error: error, data: null };
        }
        if (orderResult.error || !orderResult.data) break;
        if (orderCount === null && orderResult.count !== null && orderResult.count !== undefined &&
          Number.isFinite(Number(orderResult.count))) {
          orderCount = Number(orderResult.count);
        }
        if (!orderResult.data.length) break;
        remoteRows = remoteRows.concat(orderResult.data);
        orderOffset += orderResult.data.length;
      } while ((orderCount !== null && remoteRows.length < orderCount) ||
        (orderCount === null && orderResult.data.length > 0));

      if (!orderResult.error && orderResult.data) {
        var remoteOrders = remoteRows.map(function (order) {
          var items = (order.order_items || []).map(function (item) {
            var copy = Object.assign({}, item);
            var rawCost = copy.order_item_costs;
            var cost = Array.isArray(rawCost) ? rawCost[0] : rawCost;
            delete copy.order_item_costs;
            if (options.includeCosts && cost) {
              copy.unit_cost_snapshot = Math.max(0, safeNumber(cost.unit_cost));
              copy.cost_source = cost.cost_source || "menu_cost_snapshot";
            }
            return copy;
          });
          return Object.assign({}, order, { items: items });
        });
        remoteOrders = await applyRemotePendingOrderRules(remoteOrders);
        if (options.operationalOnly) remoteOrders = remoteOrders.filter(isFreshOrder);
        return applyCustomerHistoryLimit(remoteOrders, options);
      }
      noteRemoteError(orderResult.error);
    }

    var state = getState();
    var localSession = getSession();
    var localCostStallId = null;
    if (options.includeCosts && localSession && localSession.role === "admin") {
      localCostStallId = "";
    } else if (options.includeCosts && localSession && localSession.role === "staff" &&
      localBusinessTier(state, localSession.assigned_stall_id) === "premium") {
      localCostStallId = localSession.assigned_stall_id;
    }
    var orders = hydrateOrders(
      state.orders,
      state.order_items,
      state.menu_items,
      state.stalls,
      state.order_item_costs,
      localCostStallId
    );
    if (options.customerId) {
      orders = orders.filter(function (order) {
        return order.customer_id === options.customerId;
      });
    }
    if (tableCode) {
      orders = orders.filter(function (order) {
        return normalizeTableCode(order.table_code) === tableCode;
      });
    }
    if (options.stallId) {
      orders = orders.map(function (order) {
        return Object.assign({}, order, {
          items: (order.items || []).filter(function (item) {
            return item.stall_id === options.stallId;
          })
        });
      }).filter(function (order) {
        return order.items.length > 0;
      });
    }

    orders = applyCustomerHistoryLimit(orders, options);
    if (options.operationalOnly) orders = orders.filter(isFreshOrder);

    return orders.sort(function (a, b) {
      return new Date(b.created_at) - new Date(a.created_at);
    });
  }

  async function listOrderEvents(filters) {
    var options = filters || {};
    if (canUseRemote()) return [];

    var tableCode = normalizeTableCode(options.tableCode || "");
    var state = getState();
    var events = clone(state.events || []);

    if (tableCode) {
      events = events.filter(function (event) {
        return normalizeTableCode(event.table_code) === tableCode;
      });
    }

    if (options.stallId) {
      events = events.filter(function (event) {
        return (event.stall_ids || []).indexOf(options.stallId) !== -1;
      });
    }

    events.sort(function (a, b) {
      return new Date(b.created_at) - new Date(a.created_at);
    });

    return options.limit ? events.slice(0, options.limit) : events;
  }

  async function addToCart(itemId) {
    var cart = getLocalCart();
    var allItems = await listMenuItems({ includeUnavailable: true, includeClosed: true });
    var item = allItems.find(function (record) {
      return record.id === itemId;
    });
    if (!item || !item.available || safeNumber(item.stock_quantity) <= 0) {
      throw new Error("This item is not available right now.");
    }

    var existing = cart.find(function (entry) {
      return entry.menu_item_id === itemId;
    });
    var currentQuantity = existing ? safeNumber(existing.quantity) : 0;
    if (currentQuantity + 1 > safeNumber(item.stock_quantity)) {
      throw new Error("Not enough stock for this item.");
    }

    if (existing) {
      existing.quantity += 1;
    } else {
      cart.push({ menu_item_id: itemId, quantity: 1, notes: "" });
    }

    saveLocalCart(cart);
    return cart;
  }

  async function updateCartItem(itemId, quantity, notes) {
    var cart = getLocalCart();
    var nextQuantity = Math.max(0, Number(quantity) || 0);
    if (nextQuantity > 0) {
      var allItems = await listMenuItems({ includeUnavailable: true, includeClosed: true });
      var item = allItems.find(function (record) {
        return record.id === itemId;
      });
      if (!item || !item.available || safeNumber(item.stock_quantity) <= 0) {
        throw new Error("This item is not available right now.");
      }
      if (nextQuantity > safeNumber(item.stock_quantity)) {
        throw new Error("Not enough stock for this item.");
      }
    }

    var entry = cart.find(function (item) {
      return item.menu_item_id === itemId;
    });

    if (!entry && nextQuantity > 0) {
      cart.push({ menu_item_id: itemId, quantity: nextQuantity, notes: notes || "" });
    } else if (entry && nextQuantity <= 0) {
      cart = cart.filter(function (item) {
        return item.menu_item_id !== itemId;
      });
    } else if (entry) {
      entry.quantity = nextQuantity;
      if (typeof notes === "string") entry.notes = notes;
    }

    saveLocalCart(cart);
    return cart;
  }

  async function clearCart() {
    saveLocalCart([]);
  }

  async function getCartDetailed() {
    var cart = getLocalCart();
    var allItems = await listMenuItems({ includeUnavailable: true });
    var stalls = await listStalls({ includeClosed: true });
    var detailed = cart
      .map(function (entry) {
        var item = allItems.find(function (menuItem) {
          return menuItem.id === entry.menu_item_id;
        });
        if (!item) return null;
        var stall = stalls.find(function (record) {
          return record.id === item.stall_id;
        });
        var quantity = Number(entry.quantity) || 1;
        return {
          menu_item_id: item.id,
          item: item,
          stall: stall || null,
          quantity: quantity,
          notes: entry.notes || "",
          line_total: quantity * safeNumber(item.price)
        };
      })
      .filter(Boolean);

    var subtotal = detailed.reduce(function (sum, entry) {
      return sum + entry.line_total;
    }, 0);
    var serviceFee = subtotal > 0 ? 1.2 : 0;

    return {
      items: detailed,
      subtotal: subtotal,
      serviceFee: serviceFee,
      total: subtotal + serviceFee,
      count: detailed.reduce(function (sum, entry) {
        return sum + entry.quantity;
      }, 0)
    };
  }

  async function listTables() {
    if (canUseRemote()) {
      var remote = await client.from("tables").select("*").order("code", { ascending: true });
      if (!remote.error && remote.data && shouldUseRemoteRows(remote.data, seed.tables, "tables")) return remote.data;
      noteRemoteError(remote.error);
    }

    return clone(getState().tables || []);
  }

  function defaultTableLabel(code) {
    if (code === "COUNTER") return "Counter pickup";
    return "Table " + code.replace(/^T0*/, "");
  }

  async function saveTable(payload) {
    var code = normalizeTableCode(payload.code);
    if (!code) throw new Error("Table code is required.");

    var clean = {
      code: code,
      label: String(payload.label || "").trim() || defaultTableLabel(code),
      seats: Math.max(0, Math.floor(safeNumber(payload.seats))),
      active: Boolean(payload.active),
      updated_at: now()
    };

    if (canUseRemote()) {
      if (payload.id) {
        var updated = await client.from("tables").update(clean).eq("id", payload.id).select("*").single();
        if (!updated.error && updated.data) return updated.data;
        noteRemoteError(updated.error);
      } else {
        clean.created_at = now();
        var created = await client.from("tables").insert(clean).select("*").single();
        if (!created.error && created.data) return created.data;
        noteRemoteError(created.error);
      }
    }

    var state = getState();
    if (payload.id) {
      var existing = state.tables.find(function (table) {
        return table.id === payload.id;
      });
      if (existing) Object.assign(existing, clean);
      saveState(state);
      return existing;
    }

    var duplicate = state.tables.find(function (table) {
      return findTableByCode([table], code);
    });
    if (duplicate) {
      Object.assign(duplicate, clean);
      saveState(state);
      return duplicate;
    }

    var table = Object.assign({ id: makeId("table"), created_at: now() }, clean);
    state.tables.push(table);
    saveState(state);
    return table;
  }

  async function deleteTable(tableId) {
    if (canUseRemote()) {
      var remote = await client.from("tables").delete().eq("id", tableId);
      if (!remote.error) return true;
      noteRemoteError(remote.error);
    }

    var state = getState();
    state.tables = (state.tables || []).filter(function (table) {
      return table.id !== tableId;
    });
    saveState(state);
    return true;
  }

  async function toggleTableActive(tableId, active) {
    if (canUseRemote()) {
      var remote = await client
        .from("tables")
        .update({ active: Boolean(active), updated_at: now() })
        .eq("id", tableId)
        .select("*")
        .single();
      if (!remote.error && remote.data) return remote.data;
      noteRemoteError(remote.error);
    }

    var state = getState();
    var table = (state.tables || []).find(function (entry) {
      return entry.id === tableId;
    });
    if (table) {
      table.active = Boolean(active);
      table.updated_at = now();
      saveState(state);
    }
    return table;
  }

  async function setCurrentTable(code) {
    var cleanCode = String(code || "").trim().toUpperCase();
    if (!cleanCode) throw new Error("Please enter a table code.");

    var tables = await listTables();
    var table = findTableByCode(tables, cleanCode);

    if (!table) {
      throw new Error("This table QR/code is not registered.");
    }
    if (!table.active) {
      throw new Error("This table QR/code is inactive.");
    }

    localStorage.setItem(tableKey, JSON.stringify(table));
    return table;
  }

  function getCurrentTable() {
    var stored = localStorage.getItem(tableKey);
    if (!stored) return null;

    try {
      return JSON.parse(stored);
    } catch (error) {
      return null;
    }
  }

  function hasCurrentTable() {
    return Boolean(localStorage.getItem(tableKey));
  }

  function clearCurrentTable() {
    localStorage.removeItem(tableKey);
  }

  function localCreateOrder(detail, customer, paymentMethod, table) {
    var state = getState();
    var created = now();
    var orderId = makeId("order");
    var transactionId = "SBX-" + Math.floor(100000 + Math.random() * 900000);
    var order = {
      id: orderId,
      customer_id: customer.id || (config.guestCustomer && config.guestCustomer.id) || null,
      customer_name: customer.name,
      customer_email: customer.email,
      customer_phone: customer.phone,
      pickup_note: customer.pickup_note || "",
      table_code: table.code,
      table_label: table.label,
      total_amount: Number(detail.total.toFixed(2)),
      status: "Pending",
      payment_status: paymentMethod === "Pay at Counter" ? "Pending" : "Paid",
      payment_method: paymentMethod,
      transaction_id: transactionId,
      completed_at: null,
      created_at: created,
      updated_at: created
    };

    state.orders.push(order);
    detail.items.forEach(function (entry) {
      var menuItem = state.menu_items.find(function (item) {
        return item.id === entry.item.id;
      });
      if (menuItem) {
        menuItem.stock_quantity = Math.max(0, safeNumber(menuItem.stock_quantity) - safeNumber(entry.quantity));
        if (menuItem.stock_quantity <= 0) menuItem.available = false;
        menuItem.updated_at = created;
      }

      var orderItem = {
        id: makeId("orderitem"),
        order_id: orderId,
        menu_item_id: entry.item.id,
        stall_id: entry.item.stall_id,
        quantity: entry.quantity,
        price: safeNumber(entry.item.price),
        notes: entry.notes || ""
      };
      state.order_items.push(orderItem);

      var privateCost = (state.menu_item_costs || []).find(function (cost) {
        return cost.menu_item_id === entry.item.id && cost.stall_id === entry.item.stall_id;
      });
      state.order_item_costs = state.order_item_costs || [];
      state.order_item_costs.push({
        order_item_id: orderItem.id,
        stall_id: entry.item.stall_id,
        unit_cost: Math.max(0, safeNumber(privateCost && privateCost.estimated_cost)),
        cost_source: "menu_cost_snapshot",
        captured_at: created
      });
    });

    state.payments.push({
      id: makeId("payment"),
      order_id: orderId,
      customer_id: order.customer_id,
      amount: order.total_amount,
      payment_method: paymentMethod,
      status: order.payment_status,
      transaction_id: transactionId,
      created_at: created
    });

    saveState(state);
    return order;
  }

  async function createOrder(payload) {
    var customer = payload.customer || {};
    var paymentMethod = payload.paymentMethod || "Sandbox Card";
    var table = payload.table || getCurrentTable();
    var detail = await getCartDetailed();
    if (!detail.items.length) throw new Error("Cart is empty.");
    if (!table) throw new Error("Please scan a table before placing an order.");

    detail.items.forEach(function (entry) {
      if (!entry.item.available || safeNumber(entry.item.stock_quantity) <= 0) {
        throw new Error(entry.item.name + " is no longer available.");
      }
      if (entry.quantity > safeNumber(entry.item.stock_quantity)) {
        throw new Error("Only " + safeNumber(entry.item.stock_quantity) + " left for " + entry.item.name + ".");
      }
    });

    if (canUseRemote()) {
      var customerId = uuidPattern.test(customer.id || "") ? customer.id : null;
      var transactionId = "SBX-" + Math.floor(100000 + Math.random() * 900000);
      var orderPayload = {
        customer_id: customerId,
        customer_name: customer.name || "",
        customer_email: customer.email || "",
        customer_phone: customer.phone || "",
        pickup_note: customer.pickup_note || "",
        total_amount: Number(detail.total.toFixed(2)),
        status: "Pending",
        payment_status: paymentMethod === "Pay at Counter" ? "Pending" : "Paid",
        payment_method: paymentMethod,
        transaction_id: transactionId,
        table_code: table.code,
        table_label: table.label
      };
      var createdOrder = await client.from("orders").insert(orderPayload).select("*").single();
      if (createdOrder.error) {
        if (noteRemoteError(createdOrder.error)) return localCreateOrder(detail, customer, paymentMethod, table);
        throw createdOrder.error;
      }

      var orderItems = detail.items.map(function (entry) {
        return {
          order_id: createdOrder.data.id,
          menu_item_id: entry.item.id,
          stall_id: entry.item.stall_id,
          quantity: entry.quantity,
          price: safeNumber(entry.item.price),
          notes: entry.notes || ""
        };
      });

      var insertedItems = await client.from("order_items").insert(orderItems);
      if (insertedItems.error) throw insertedItems.error;

      var payment = await client.from("payments").insert({
        order_id: createdOrder.data.id,
        customer_id: customerId,
        amount: Number(detail.total.toFixed(2)),
        payment_method: paymentMethod,
        status: paymentMethod === "Pay at Counter" ? "Pending" : "Paid",
        transaction_id: transactionId
      });
      if (payment.error) throw payment.error;

      await Promise.all(detail.items.map(function (entry) {
        var nextStock = Math.max(0, safeNumber(entry.item.stock_quantity) - safeNumber(entry.quantity));
        return client
          .from("menu_items")
          .update({
            stock_quantity: nextStock,
            available: nextStock > 0 && Boolean(entry.item.available),
            updated_at: now()
          })
          .eq("id", entry.item.id);
      }));

      return createdOrder.data;
    }

    return localCreateOrder(detail, customer, paymentMethod, table);
  }

  async function updateOrderStatus(orderId, status) {
    var changedAt = now();
    if (canUseRemote()) {
      var remote = await client
        .from("orders")
        .update({ status: status, updated_at: changedAt })
        .eq("id", orderId)
        .select("*")
        .single();
      if (!remote.error && remote.data) return remote.data;
      noteRemoteError(remote.error);
    }

    var state = getState();
    var order = state.orders.find(function (entry) {
      return entry.id === orderId;
    });
    if (order) {
      order.status = status;
      order.completed_at = status === "Completed" ? changedAt : null;
      order.updated_at = changedAt;
      saveState(state);
    }
    return order;
  }

  async function markOrderPaid(orderId) {
    var paidAt = now();

    if (canUseRemote()) {
      var remote = await client
        .from("orders")
        .update({ payment_status: "Paid", updated_at: paidAt })
        .eq("id", orderId)
        .select("*")
        .single();
      if (!remote.error && remote.data) {
        var payment = await client
          .from("payments")
          .update({ status: "Paid", updated_at: paidAt })
          .eq("order_id", orderId);
        if (payment.error) noteRemoteError(payment.error);
        return remote.data;
      }
      noteRemoteError(remote.error);
    }

    var state = getState();
    var order = state.orders.find(function (entry) {
      return entry.id === orderId;
    });
    if (!order) throw new Error("Order not found.");
    order.payment_status = "Paid";
    order.updated_at = paidAt;
    (state.payments || []).forEach(function (payment) {
      if (payment.order_id === orderId) {
        payment.status = "Paid";
        payment.updated_at = paidAt;
      }
    });
    saveState(state);
    return order;
  }

  async function saveMenuItem(payload) {
    var hasEstimatedCost = Object.prototype.hasOwnProperty.call(payload || {}, "estimated_cost");
    var clean = {
      stall_id: payload.stall_id,
      name: payload.name,
      description: payload.description || "",
      price: safeNumber(payload.price),
      image_url: payload.image_url || "",
      category: payload.category,
      available: Boolean(payload.available),
      stock_quantity: Math.max(0, Math.floor(safeNumber(payload.stock_quantity))),
      updated_at: now()
    };

    if (hasEstimatedCost && promotionRemoteConfigured && !canUseRemote()) {
      throw new Error("Private menu costs cannot be saved while the database is offline.");
    }

    if (hasEstimatedCost && promotionRemoteConfigured) {
      var premiumItemId = payload.id || makeUuid();
      if (!uuidPattern.test(premiumItemId)) {
        throw new Error("This menu item must be reloaded before its private cost can be saved.");
      }
      var premiumSave;
      try {
        premiumSave = await client.rpc("save_premium_menu_item", {
          requested_item_id: premiumItemId,
          requested_stall_id: clean.stall_id,
          requested_name: clean.name,
          requested_description: clean.description,
          requested_price: clean.price,
          requested_image_url: clean.image_url,
          requested_category: clean.category,
          requested_available: clean.available,
          requested_stock_quantity: clean.stock_quantity,
          requested_estimated_cost: Math.max(0, safeNumber(payload.estimated_cost))
        });
      } catch (error) {
        var premiumNetworkError = financialRequestError(error, "The menu item and private cost could not be saved together.");
        premiumNetworkError.savedMenuItemId = premiumItemId;
        throw premiumNetworkError;
      }
      if (premiumSave.error || !premiumSave.data) {
        var premiumError = financialRequestError(premiumSave.error, "The menu item and private cost could not be saved together.");
        premiumError.savedMenuItemId = premiumItemId;
        throw premiumError;
      }
      var premiumRow = Array.isArray(premiumSave.data) ? premiumSave.data[0] : premiumSave.data;
      return Object.assign({}, premiumRow, {
        estimated_cost: Math.max(0, safeNumber(payload.estimated_cost))
      });
    }

    if (canUseRemote()) {
      if (payload.id) {
        var updated = await client.from("menu_items").update(clean).eq("id", payload.id).select("*").single();
        if (!updated.error && updated.data) return updated.data;
        else noteRemoteError(updated.error);
      } else {
        clean.created_at = now();
        var created = await client.from("menu_items").insert(clean).select("*").single();
        if (!created.error && created.data) return created.data;
        else noteRemoteError(created.error);
      }
    }

    var state = getState();
    if (hasEstimatedCost) assertLocalBusinessAccess(state, clean.stall_id, true);
    var localEstimatedCost = Math.max(0, safeNumber(payload.estimated_cost));
    var item;
    if (payload.id) {
      item = state.menu_items.find(function (entry) {
        return entry.id === payload.id;
      });
      if (!item) throw new Error("Menu item not found.");
      Object.assign(item, clean);
    } else {
      item = Object.assign({ id: makeId("item"), created_at: now() }, clean);
      state.menu_items.push(item);
    }

    if (hasEstimatedCost) {
      state.menu_item_costs = state.menu_item_costs || [];
      var localCost = state.menu_item_costs.find(function (entry) {
        return entry.menu_item_id === item.id;
      });
      if (localCost) {
        localCost.stall_id = item.stall_id;
        localCost.estimated_cost = localEstimatedCost;
        localCost.updated_at = now();
      } else {
        state.menu_item_costs.push({
          menu_item_id: item.id,
          stall_id: item.stall_id,
          estimated_cost: localEstimatedCost,
          created_at: now(),
          updated_at: now()
        });
      }
    }
    saveState(state);
    return hasEstimatedCost
      ? Object.assign({}, item, { estimated_cost: localEstimatedCost })
      : item;
  }

  async function deleteMenuItem(itemId) {
    if (canUseRemote()) {
      var remote = await client.from("menu_items").delete().eq("id", itemId);
      if (!remote.error) return true;
      noteRemoteError(remote.error);
    }

    var state = getState();
    state.menu_items = state.menu_items.filter(function (item) {
      return item.id !== itemId;
    });
    state.menu_item_costs = (state.menu_item_costs || []).filter(function (cost) {
      return cost.menu_item_id !== itemId;
    });
    saveState(state);
    return true;
  }

  function validExpenseDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    var parsed = new Date(value + "T00:00:00.000Z");
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }

  async function saveExpense(payload) {
    var input = payload || {};
    var stallId = String(input.stall_id || "").trim();
    var expenseName = String(input.expense_name || "").trim();
    var category = String(input.category || "").trim();
    var expenseDate = String(input.expense_date || "").trim();
    var amount = Number(input.amount);

    if (!stallId) throw new Error("Choose a stall for this expense.");
    if (!expenseName) throw new Error("Enter an expense name.");
    if (!category) throw new Error("Choose an expense category.");
    if (!expenseDate) throw new Error("Choose an expense date.");
    if (!validExpenseDate(expenseDate)) throw new Error("Enter a valid expense date.");
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Expense amount must be greater than zero.");

    amount = Number(amount.toFixed(2));
    if (amount <= 0) throw new Error("Expense amount must be at least 0.01.");
    stallId = expenseStallScope(stallId);

    var clean = {
      stall_id: stallId,
      expense_name: expenseName,
      category: category,
      amount: amount,
      description: String(input.description || "").trim(),
      expense_date: expenseDate,
      updated_at: now()
    };

    if (promotionRemoteConfigured) {
      if (!canUseRemote()) {
        throw new Error("This expense was not saved because the database is offline.");
      }
      if (input.id) {
        var updated;
        try {
          updated = await client.from("expenses").update(clean).eq("id", input.id).select("*").single();
        } catch (error) {
          throw financialRequestError(error, "This expense could not be saved to the database.");
        }
        if (!updated.error && updated.data) return normalizeExpenseRecord(updated.data);
        throw financialRequestError(updated.error, "This expense could not be saved to the database.");
      } else {
        clean.created_at = now();
        var created;
        try {
          created = await client.from("expenses").insert(clean).select("*").single();
        } catch (error) {
          throw financialRequestError(error, "This expense could not be saved to the database.");
        }
        if (!created.error && created.data) return normalizeExpenseRecord(created.data);
        throw financialRequestError(created.error, "This expense could not be saved to the database.");
      }
    }

    var state = getState();
    assertLocalBusinessAccess(state, stallId, false);
    if (input.id) {
      var existing = (state.expenses || []).find(function (expense) {
        return expense.id === input.id;
      });
      if (!existing) throw new Error("Expense not found.");
      expenseStallScope(existing.stall_id);
      Object.assign(existing, clean);
      saveState(state);
      return clone(normalizeExpenseRecord(existing));
    }

    var expense = Object.assign({ id: makeId("expense"), created_at: now() }, clean);
    state.expenses = state.expenses || [];
    state.expenses.push(expense);
    saveState(state);
    return clone(normalizeExpenseRecord(expense));
  }

  async function deleteExpense(expenseId) {
    if (!expenseId) throw new Error("Choose an expense to delete.");
    expenseStallScope("");

    if (promotionRemoteConfigured) {
      if (!canUseRemote()) {
        throw new Error("This expense was not deleted because the database is offline.");
      }
      var remote;
      try {
        remote = await client.from("expenses").delete().eq("id", expenseId);
      } catch (error) {
        throw financialRequestError(error, "This expense could not be deleted from the database.");
      }
      if (!remote.error) return true;
      throw financialRequestError(remote.error, "This expense could not be deleted from the database.");
    }

    var state = getState();
    var existing = (state.expenses || []).find(function (expense) {
      return expense.id === expenseId;
    });
    if (!existing) return true;
    expenseStallScope(existing.stall_id);
    assertLocalBusinessAccess(state, existing.stall_id, false);
    state.expenses = state.expenses.filter(function (expense) {
      return expense.id !== expenseId;
    });
    saveState(state);
    return true;
  }

  async function saveStall(payload) {
    var clean = {
      name: payload.name,
      cuisine_type: payload.cuisine_type,
      description: payload.description || "",
      image_url: payload.image_url || "",
      rating: safeNumber(payload.rating || 0),
      wait_minutes: Math.max(0, Math.floor(safeNumber(payload.wait_minutes || 10))),
      closed: Boolean(payload.closed),
      updated_at: now()
    };

    if (Object.prototype.hasOwnProperty.call(payload, "staff_id")) {
      clean.staff_id = payload.staff_id || null;
    }

    if (canUseRemote()) {
      if (payload.id) {
        var updated = await client.from("stalls").update(clean).eq("id", payload.id).select("*").single();
        if (!updated.error && updated.data) return updated.data;
        noteRemoteError(updated.error);
      } else {
        clean.created_at = now();
        var created = await client.from("stalls").insert(clean).select("*").single();
        if (!created.error && created.data) return created.data;
        noteRemoteError(created.error);
      }
    }

    var state = getState();
    if (payload.id) {
      var existing = state.stalls.find(function (stall) {
        return stall.id === payload.id;
      });
      if (existing) Object.assign(existing, clean);
      saveState(state);
      return existing;
    }

    var stall = Object.assign({ id: makeId("stall"), created_at: now() }, clean);
    state.stalls.push(stall);
    saveState(state);
    return stall;
  }

  async function deleteStall(stallId) {
    if (canUseRemote()) {
      var remote = await client.from("stalls").delete().eq("id", stallId);
      if (!remote.error) return true;
      noteRemoteError(remote.error);
    }

    var state = getState();
    state.stalls = state.stalls.filter(function (stall) {
      return stall.id !== stallId;
    });
    state.stall_promotions = (state.stall_promotions || []).filter(function (promotion) {
      return promotion.stall_id !== stallId;
    });
    state.menu_items = state.menu_items.filter(function (item) {
      return item.stall_id !== stallId;
    });
    state.menu_item_costs = (state.menu_item_costs || []).filter(function (cost) {
      return cost.stall_id !== stallId;
    });
    state.order_item_costs = (state.order_item_costs || []).filter(function (cost) {
      return cost.stall_id !== stallId;
    });
    state.expenses = (state.expenses || []).filter(function (expense) {
      return expense.stall_id !== stallId;
    });
    saveState(state);
    return true;
  }

  async function toggleStallClosed(stallId, closed) {
    if (canUseRemote()) {
      var remote = await client
        .from("stalls")
        .update({ closed: Boolean(closed), updated_at: now() })
        .eq("id", stallId)
        .select("*")
        .single();
      if (!remote.error && remote.data) return remote.data;
      noteRemoteError(remote.error);
    }

    var state = getState();
    var stall = state.stalls.find(function (entry) {
      return entry.id === stallId;
    });
    if (stall) {
      stall.closed = Boolean(closed);
      stall.updated_at = now();
      saveState(state);
    }
    return stall;
  }

  async function saveUser(payload) {
    var session = getSession();
    if (!session || session.role !== "admin") throw new Error("Admin access is required.");
    var clean = {
      name: payload.name,
      email: payload.email,
      phone: payload.phone || "",
      role: payload.role || "customer",
      username: payload.username || "",
      assigned_stall_id: payload.assigned_stall_id || null,
      updated_at: now()
    };

    if (canUseRemote()) {
      clean.id = payload.id;
      var saved = await client.from("users").upsert(clean, { onConflict: "id" }).select("*").single();
      if (!saved.error && saved.data) return saved.data;
      noteRemoteError(saved.error);
    }

    var state = getState();
    var user = null;
    if (payload.id) {
      user = state.users.find(function (entry) {
        return entry.id === payload.id;
      });
      if (user) Object.assign(user, clean);
    } else {
      user = Object.assign({ id: makeId("user"), created_at: now() }, clean);
      state.users.push(user);
    }
    saveState(state);
    return user;
  }

  async function login(username, password, role) {
    if (!client) throw new Error("Secure login requires Supabase configuration.");
    var authResult = await client.auth.signInWithPassword({
      email: normalizeLoginIdentity(username),
      password: String(password || "")
    });
    if (authResult.error) throw new Error("Invalid email or password.");

    var profileResult = await client.from("users").select("*").eq("id", authResult.data.user.id).single();
    if (profileResult.error || !profileResult.data) {
      await client.auth.signOut();
      throw new Error("This login has no staff or admin profile.");
    }
    var user = profileResult.data;
    if (role && user.role !== role) {
      await client.auth.signOut();
      throw new Error("This account does not have " + role + " access.");
    }
    var session = {
      id: user.id,
      name: user.name,
      email: user.email,
      username: user.username,
      role: user.role,
      assigned_stall_id: user.assigned_stall_id || null
    };
    localStorage.setItem(sessionKey, JSON.stringify(session));
    return session;
  }

  function getSession() {
    var stored = localStorage.getItem(sessionKey);
    if (!stored) return null;
    try {
      return JSON.parse(stored);
    } catch (error) {
      return null;
    }
  }

  async function validateSession(requiredRole) {
    if (!client) return null;
    var authResult = await client.auth.getSession();
    var authSession = authResult.data && authResult.data.session;
    if (!authSession || !authSession.user) {
      localStorage.removeItem(sessionKey);
      return null;
    }
    var profileResult = await client.from("users").select("*").eq("id", authSession.user.id).single();
    if (profileResult.error || !profileResult.data || (requiredRole && profileResult.data.role !== requiredRole)) {
      localStorage.removeItem(sessionKey);
      return null;
    }
    var profile = profileResult.data;
    var session = {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      username: profile.username,
      role: profile.role,
      assigned_stall_id: profile.assigned_stall_id || null
    };
    localStorage.setItem(sessionKey, JSON.stringify(session));
    return session;
  }

  function logout() {
    localStorage.removeItem(sessionKey);
    if (client) client.auth.signOut();
  }

  window.FoodStore = {
    listStalls: listStalls,
    listPromotionPlans: listPromotionPlans,
    listStallPromotions: listStallPromotions,
    listStallDiscovery: listStallDiscovery,
    listMenuItems: listMenuItems,
    listExpenses: listExpenses,
    listUsers: listUsers,
    listOrders: listOrders,
    listOrderEvents: listOrderEvents,
    listTables: listTables,
    saveTable: saveTable,
    deleteTable: deleteTable,
    toggleTableActive: toggleTableActive,
    setCurrentTable: setCurrentTable,
    getCurrentTable: getCurrentTable,
    hasCurrentTable: hasCurrentTable,
    clearCurrentTable: clearCurrentTable,
    login: login,
    getSession: getSession,
    validateSession: validateSession,
    logout: logout,
    addToCart: addToCart,
    updateCartItem: updateCartItem,
    clearCart: clearCart,
    getCartDetailed: getCartDetailed,
    createOrder: createOrder,
    updateOrderStatus: updateOrderStatus,
    markOrderPaid: markOrderPaid,
    saveMenuItem: saveMenuItem,
    deleteMenuItem: deleteMenuItem,
    saveExpense: saveExpense,
    deleteExpense: deleteExpense,
    saveStall: saveStall,
    saveStallPromotion: saveStallPromotion,
    requestStallPromotion: requestStallPromotion,
    requestStallUpgrade: requestStallUpgrade,
    deleteStall: deleteStall,
    toggleStallClosed: toggleStallClosed,
    saveUser: saveUser
  };
})();
