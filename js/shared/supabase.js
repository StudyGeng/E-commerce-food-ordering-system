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

  function makeId(prefix) {
    return prefix + "-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
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
    var freshOrders = orders.filter(isFreshOrder);
    if (freshOrders.length === orders.length) return state;

    var keepOrderIds = freshOrders.reduce(function (ids, order) {
      ids[order.id] = true;
      return ids;
    }, {});

    state.orders = freshOrders;
    state.order_items = (state.order_items || []).filter(function (item) {
      return keepOrderIds[item.order_id];
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
      menu_items: clone(seed.menu_items || []),
      tables: clone(seed.tables || []),
      orders: clone(seed.orders || []),
      order_items: clone(seed.order_items || []),
      payments: clone(seed.payments || []),
      events: clone(seed.events || [])
    };
  }

  function normalizeState(state) {
    var fresh = initialState();
    var next = Object.assign({}, fresh, state || {});

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

    next.menu_items = (next.menu_items || []).map(function (item) {
      var seedItem = fresh.menu_items.find(function (entry) {
        return entry.id === item.id;
      }) || {};
      return Object.assign({ stock_quantity: 10, available: true }, seedItem, item);
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

  function canUseRemote() {
    return Boolean(client && !remoteUnavailable);
  }

  function isNetworkError(error) {
    var text = String(
      (error && (error.message || error.details || error.hint || error.code || error.name)) || ""
    ).toLowerCase();
    return text.includes("failed to fetch") ||
      text.includes("networkerror") ||
      text.includes("aborterror") ||
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

  function hydrateOrders(orders, orderItems, menuItems, stalls) {
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
          return Object.assign({}, item, {
            menu_item: menuItem || null,
            stall: stall || null
          });
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
          return result.data;
        }
      }
      noteRemoteError(result.error);
    }

    var state = getState();
    return state.menu_items.filter(function (item) {
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
      var remote = client
        .from("orders")
        .select("*, order_items(*, menu_items(name, image_url), stalls(name))")
        .order("created_at", { ascending: false });

      if (options.customerId && uuidPattern.test(options.customerId)) {
        remote = remote.eq("customer_id", options.customerId);
      }
      if (tableCode) {
        remote = remote.eq("table_code", tableCode);
      }

      remote = await remote;

      if (!remote.error && remote.data) {
        var remoteOrders = remote.data.map(function (order) {
          var items = order.order_items || [];
          return Object.assign({}, order, { items: items });
        });
        remoteOrders = await applyRemotePendingOrderRules(remoteOrders);
        return applyCustomerHistoryLimit(remoteOrders, options);
      }
      noteRemoteError(remote.error);
    }

    var state = getState();
    var orders = hydrateOrders(state.orders, state.order_items, state.menu_items, state.stalls);
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

    orders = applyCustomerHistoryLimit(orders, options);

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

      state.order_items.push({
        id: makeId("orderitem"),
        order_id: orderId,
        menu_item_id: entry.item.id,
        stall_id: entry.item.stall_id,
        quantity: entry.quantity,
        price: safeNumber(entry.item.price),
        notes: entry.notes || ""
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
    if (canUseRemote()) {
      var remote = await client
        .from("orders")
        .update({ status: status, updated_at: now() })
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
      order.updated_at = now();
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

    if (canUseRemote()) {
      if (payload.id) {
        var updated = await client.from("menu_items").update(clean).eq("id", payload.id).select("*").single();
        if (!updated.error && updated.data) return updated.data;
        noteRemoteError(updated.error);
      } else {
        clean.created_at = now();
        var created = await client.from("menu_items").insert(clean).select("*").single();
        if (!created.error && created.data) return created.data;
        noteRemoteError(created.error);
      }
    }

    var state = getState();
    if (payload.id) {
      var existing = state.menu_items.find(function (item) {
        return item.id === payload.id;
      });
      if (existing) Object.assign(existing, clean);
      saveState(state);
      return existing;
    }

    var item = Object.assign({ id: makeId("item"), created_at: now() }, clean);
    state.menu_items.push(item);
    saveState(state);
    return item;
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
    state.menu_items = state.menu_items.filter(function (item) {
      return item.stall_id !== stallId;
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
    listMenuItems: listMenuItems,
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
    saveStall: saveStall,
    deleteStall: deleteStall,
    toggleStallClosed: toggleStallClosed,
    saveUser: saveUser
  };
})();
