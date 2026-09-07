(function () {
  var ui = window.FoodUI;
  var store = window.FoodStore;
  var cache = {
    stalls: [],
    users: [],
    orders: [],
    menuItems: [],
    tables: []
  };

  function statsHtml() {
    var revenue = cache.orders.reduce(function (sum, order) {
      return sum + Number(order.total_amount || 0);
    }, 0);
    var active = cache.orders.filter(function (order) {
      return order.status !== "Completed" && order.status !== "Cancelled";
    }).length;
    var attention = cache.orders.filter(function (order) {
      return ui.orderIssueLabel && ui.orderIssueLabel(order);
    }).length;
    var closed = cache.stalls.filter(function (stall) {
      return stall.closed;
    }).length;
    var activeTables = cache.tables.filter(function (table) {
      return table.active;
    }).length;

    return [
      '<article class="stat-card"><strong>' + cache.stalls.length + '</strong><span>food stalls</span></article>',
      '<article class="stat-card"><strong>' + closed + '</strong><span>closed stalls</span></article>',
      '<article class="stat-card"><strong>' + activeTables + " / " + cache.tables.length + '</strong><span>active tables</span></article>',
      '<article class="stat-card"><strong>' + active + '</strong><span>active orders</span></article>',
      '<article class="stat-card"><strong>' + attention + '</strong><span>order alerts</span></article>',
      '<article class="stat-card"><strong>' + ui.money(revenue) + '</strong><span>sales</span></article>'
    ].join("");
  }

  function stallCardHtml(stall) {
    var itemCount = cache.menuItems.filter(function (item) {
      return item.stall_id === stall.id;
    }).length;

    return [
      '<article class="vendor-card">',
      '<div class="vendor-thumb" style="' + ui.imageStyle(stall.image_url) + '"></div>',
      "<div>",
      '<div class="vendor-card-top">',
      "<div>",
      "<h3>" + ui.escapeHtml(stall.name) + "</h3>",
      '<p>' + ui.escapeHtml(stall.cuisine_type || "Cuisine") + " - " + itemCount + " menu items</p>",
      "</div>",
      '<span class="tag ' + (stall.closed ? "status-failed" : "status-paid") + '">' + (stall.closed ? "Closed" : "Open") + "</span>",
      "</div>",
      '<div class="meta-row">',
      '<span class="tag gold">' + Number(stall.rating || 0).toFixed(1) + " rating</span>",
      '<span class="tag">' + Number(stall.wait_minutes || 10) + " min wait</span>",
      "</div>",
      '<div class="vendor-actions">',
      '<button class="button ghost" type="button" data-edit-stall="' + ui.escapeHtml(stall.id) + '"><i data-lucide="pencil"></i>Edit</button>',
      '<button class="button ghost" type="button" data-toggle-stall="' + ui.escapeHtml(stall.id) + '" data-closed="' + (stall.closed ? "false" : "true") + '"><i data-lucide="' + (stall.closed ? "unlock" : "lock") + '"></i>' + (stall.closed ? "Reopen" : "Close") + "</button>",
      '<button class="button danger" type="button" data-delete-stall="' + ui.escapeHtml(stall.id) + '"><i data-lucide="trash-2"></i>Delete</button>',
      "</div>",
      "</div>",
      "</article>"
    ].join("");
  }

  function manageableUsers() {
    return cache.users.filter(function (user) {
      return user.role === "staff" || user.role === "admin";
    });
  }

  function roleLabel(role) {
    return role === "staff" ? "Food stall owner" : "Admin";
  }

  function userOptions() {
    return [
      '<option value="staff">Food stall owner</option>',
      '<option value="admin">Admin</option>'
    ].join("");
  }

  function accountRole(form) {
    return form.elements.account_select.value === "admin" ? "admin" : "staff";
  }

  function assignedStallOptions(selectedId) {
    return [
      '<option value="">Choose stall</option>',
      cache.stalls.map(function (stall) {
        var selected = stall.id === selectedId ? " selected" : "";
        var status = stall.closed ? " closed" : "";
        return '<option value="' + ui.escapeHtml(stall.id) + '"' + selected + '>' +
          ui.escapeHtml(stall.name + status) + "</option>";
      }).join("")
    ].join("");
  }

  function userRowHtml(user) {
    return [
      '<article class="mini-row">',
      '<div class="mini-row-top">',
      "<div>",
      "<h3>" + ui.escapeHtml(user.name) + "</h3>",
      "<p>" + ui.escapeHtml(user.username || user.email || "") + "</p>",
      "</div>",
      '<span class="tag teal account-role-tag">' + ui.escapeHtml(roleLabel(user.role)) + "</span>",
      "</div>",
      '<div class="mini-actions">',
      '<button class="button ghost" type="button" data-edit-user="' + ui.escapeHtml(user.id) + '"><i data-lucide="pencil"></i>Edit account</button>',
      "</div>",
      "</article>"
    ].join("");
  }

  function tableUrl(table) {
    var parts = window.location.pathname.split("/");
    var roleIndex = parts.findIndex(function (part) {
      return part === "admin" || part === "stall" || part === "customer";
    });
    var basePath = roleIndex >= 0 ? parts.slice(0, roleIndex).join("/") + "/customer/" : "/customer/";
    return window.location.origin + basePath + "scan.html?table=" + encodeURIComponent(table.code);
  }

  function qrImageUrl(value, size) {
    var imageSize = size || 180;
    return "https://api.qrserver.com/v1/create-qr-code/?size=" + imageSize + "x" + imageSize +
      "&margin=8&data=" + encodeURIComponent(value);
  }

  function qrCardHtml(table) {
    var url = tableUrl(table);
    return [
      '<article class="qr-card' + (table.active ? "" : " is-inactive") + '" data-table-card="' + ui.escapeHtml(table.id) + '">',
      '<div class="qr-visual" data-qr-shell>',
      '<canvas class="qr-code" data-table-qr data-qr-value="' + ui.escapeHtml(url) + '" aria-label="QR for ' + ui.escapeHtml(table.label) + '"></canvas>',
      '<img class="qr-code qr-code-fallback" data-table-qr-img data-qr-value="' + ui.escapeHtml(url) + '" src="' + ui.escapeHtml(qrImageUrl(url, 180)) + '" alt="QR for ' + ui.escapeHtml(table.label) + '" hidden>',
      "</div>",
      "<div>",
      '<div class="mini-row-top">',
      "<div>",
      "<h3>" + ui.escapeHtml(table.label) + "</h3>",
      "<p>" + ui.escapeHtml(table.code) + "</p>",
      "</div>",
      '<span class="tag ' + (table.active ? "status-paid" : "status-failed") + '">' + (table.active ? "Active" : "Inactive") + "</span>",
      "</div>",
      '<input type="text" readonly value="' + ui.escapeHtml(url) + '">',
      '<div class="mini-actions">',
      '<button class="button ghost" type="button" data-copy-table-url="' + ui.escapeHtml(url) + '"><i data-lucide="copy"></i>Copy</button>',
      '<button class="button ghost" type="button" data-generate-table-qr="' + ui.escapeHtml(table.id) + '"><i data-lucide="qr-code"></i>Generate QR</button>',
      '<button class="button ghost" type="button" data-toggle-table="' + ui.escapeHtml(table.id) + '" data-active="' + (table.active ? "false" : "true") + '"><i data-lucide="' + (table.active ? "ban" : "check-circle-2") + '"></i>' + (table.active ? "Disable" : "Enable") + "</button>",
      '<button class="button danger" type="button" data-delete-table="' + ui.escapeHtml(table.id) + '"><i data-lucide="trash-2"></i>Delete</button>',
      "</div>",
      "</div>",
      "</article>"
    ].join("");
  }

  function showFallbackQRCode(canvas) {
    var shell = canvas.closest("[data-qr-shell]");
    var image = shell && shell.querySelector("[data-table-qr-img]");
    if (!image) return;

    image.src = qrImageUrl(canvas.dataset.qrValue || "", 180);
    image.hidden = false;
    canvas.hidden = true;
  }

  function renderQRCode(canvas) {
    var value = canvas.dataset.qrValue || "";
    if (!value) {
      showFallbackQRCode(canvas);
      return;
    }

    if (!window.QRCode || typeof window.QRCode.toCanvas !== "function") {
      showFallbackQRCode(canvas);
      return;
    }

    canvas.hidden = false;
    var image = canvas.closest("[data-qr-shell]") && canvas.closest("[data-qr-shell]").querySelector("[data-table-qr-img]");
    if (image) image.hidden = true;

    window.QRCode.toCanvas(canvas, value, {
      width: 132,
      margin: 1,
      color: {
        dark: "#221b17",
        light: "#ffffff"
      }
    }, function (error) {
      if (error) {
        console.warn(error);
        showFallbackQRCode(canvas);
      }
    });
  }

  function renderQRCodes() {
    var canvases = ui.qsa("[data-table-qr]");
    canvases.forEach(function (canvas) {
      renderQRCode(canvas);
    });
  }

  function orderRowHtml(order) {
    var issue = ui.orderIssueLabel ? ui.orderIssueLabel(order) : "";
    return [
      "<tr>",
      "<td>#" + ui.escapeHtml(order.id) + "</td>",
      "<td>" + ui.escapeHtml(order.table_label || order.pickup_note || "Counter pickup") + "</td>",
      "<td>" + ui.escapeHtml(order.customer_name || "Customer") + "</td>",
      '<td><span class="tag ' + ui.statusClass(order.status) + '">' + ui.escapeHtml(ui.statusLabel ? ui.statusLabel(order.status) : order.status) + "</span></td>",
      '<td class="issue-cell">' + (issue ? ui.escapeHtml(issue) : "-") + "</td>",
      '<td><span class="tag ' + ui.statusClass(order.payment_status) + '">' + ui.escapeHtml(order.payment_status || "Pending") + "</span></td>",
      "<td>" + ui.money(order.total_amount) + "</td>",
      "<td>" + ui.escapeHtml(ui.formatDate(order.created_at)) + "</td>",
      "</tr>"
    ].join("");
  }

  function renderAll() {
    var stats = ui.qs("#admin-stats");
    var stalls = ui.qs("#admin-stalls");
    var users = ui.qs("#admin-users");
    var tables = ui.qs("#admin-tables");
    var orders = ui.qs("#admin-orders");

    if (stats) stats.innerHTML = statsHtml();
    if (stalls) stalls.innerHTML = cache.stalls.map(stallCardHtml).join("");
    if (users) users.innerHTML = manageableUsers().map(userRowHtml).join("");
    if (tables) tables.innerHTML = cache.tables.map(qrCardHtml).join("");
    if (orders) {
      orders.innerHTML = cache.orders.length
        ? cache.orders.map(orderRowHtml).join("")
        : '<tr><td colspan="8">No orders found.</td></tr>';
    }
    populateAccountSelects();
    ui.hydrateIcons();
    renderQRCodes();
  }

  async function loadData() {
    cache.stalls = await store.listStalls({ includeClosed: true });
    cache.users = await store.listUsers();
    cache.orders = await store.listOrders();
    cache.menuItems = await store.listMenuItems({ includeUnavailable: true, includeClosed: true });
    cache.tables = await store.listTables();
    renderAll();
    clearAccountForm("staff");
  }

  function clearStallForm() {
    var form = ui.qs("#stall-form");
    if (!form) return;
    form.reset();
    form.elements.id.value = "";
    form.elements.wait_minutes.value = 10;
  }

  function clearTableForm() {
    var form = ui.qs("#table-form");
    if (!form) return;
    form.reset();
    form.elements.id.value = "";
    form.elements.active.checked = true;
  }

  function loadStallIntoForm(stallId) {
    var stall = cache.stalls.find(function (record) {
      return record.id === stallId;
    });
    var form = ui.qs("#stall-form");
    if (!stall || !form) return;

    form.elements.id.value = stall.id;
    form.elements.name.value = stall.name;
    form.elements.cuisine_type.value = stall.cuisine_type || "";
    form.elements.wait_minutes.value = Number(stall.wait_minutes || 10);
    form.elements.image_url.value = stall.image_url || "";
    form.elements.description.value = stall.description || "";
    form.elements.closed.checked = Boolean(stall.closed);
  }

  function loadTableIntoForm(tableId) {
    var table = cache.tables.find(function (record) {
      return record.id === tableId;
    });
    var form = ui.qs("#table-form");
    if (!table || !form) return;

    form.elements.id.value = table.id;
    form.elements.code.value = table.code || "";
    form.elements.active.checked = Boolean(table.active);
  }

  function populateAccountSelects() {
    var form = ui.qs("#account-form");
    if (!form) return;
    var selectedStall = form.elements.assigned_stall_id ? form.elements.assigned_stall_id.value : "";
    form.elements.account_select.innerHTML = userOptions();
    if (form.elements.assigned_stall_id) {
      form.elements.assigned_stall_id.innerHTML = assignedStallOptions(selectedStall);
    }
  }

  function syncAccountRoleFields() {
    var form = ui.qs("#account-form");
    if (!form) return;
    var isStaff = accountRole(form) === "staff";
    ui.qsa("[data-staff-account-field]", form).forEach(function (node) {
      node.classList.toggle("hidden", !isStaff);
    });
    if (form.elements.assigned_stall_id) {
      form.elements.assigned_stall_id.disabled = !isStaff;
      if (!isStaff) form.elements.assigned_stall_id.value = "";
    }
  }

  function loadAccountIntoForm(userId) {
    var user = cache.users.find(function (record) {
      return record.id === userId;
    });
    var form = ui.qs("#account-form");
    if (!user || !form) return;

    form.elements.id.value = user.id;
    form.elements.auth_user_id.value = user.id;
    form.elements.account_select.value = user.role === "admin" ? "admin" : "staff";
    form.elements.name.value = user.name || "";
    form.elements.username.value = user.username || "";
    form.elements.email.value = user.email || "";
    form.elements.phone.value = user.phone || "";
    if (form.elements.assigned_stall_id) {
      form.elements.assigned_stall_id.value = user.assigned_stall_id || "";
    }
    form.elements.auth_user_id.readOnly = true;
    syncAccountRoleFields();
  }

  function clearAccountForm(role) {
    var form = ui.qs("#account-form");
    if (!form) return;
    var nextRole = role === "admin" ? "admin" : "staff";
    form.reset();
    form.elements.id.value = "";
    form.elements.auth_user_id.readOnly = false;
    form.elements.account_select.value = nextRole;
    if (form.elements.assigned_stall_id) form.elements.assigned_stall_id.value = "";
    syncAccountRoleFields();
  }

  async function linkStaffToStall(staffId, stallId) {
    if (!staffId || !stallId) return;
    var stall = cache.stalls.find(function (record) {
      return record.id === stallId;
    });
    if (!stall) {
      var stalls = await store.listStalls({ includeClosed: true });
      stall = stalls.find(function (record) {
        return record.id === stallId;
      });
    }
    if (!stall) return;

    await store.saveStall({
      id: stall.id,
      name: stall.name,
      cuisine_type: stall.cuisine_type || "Food",
      wait_minutes: stall.wait_minutes || 10,
      image_url: stall.image_url || "",
      description: stall.description || "",
      closed: Boolean(stall.closed),
      rating: stall.rating || 4.5,
      staff_id: staffId
    });
  }

  function bulkTableCode(prefix, number) {
    return String(prefix || "T").trim().toUpperCase() + String(number).padStart(2, "0");
  }

  function copyText(value) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(value);
    }
    window.prompt("Copy table link", value);
    return Promise.resolve();
  }

  function bindEvents() {
    var stallForm = ui.qs("#stall-form");
    var accountForm = ui.qs("#account-form");
    var clearButton = ui.qs("#clear-stall-form");
    var clearAccountButton = ui.qs("#clear-account-form");

    if (clearButton) {
      clearButton.addEventListener("click", clearStallForm);
    }

    if (clearAccountButton) {
      clearAccountButton.addEventListener("click", function () {
        clearAccountForm("staff");
      });
    }

    if (stallForm) {
      stallForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        await store.saveStall({
          id: stallForm.elements.id.value,
          name: stallForm.elements.name.value.trim(),
          cuisine_type: stallForm.elements.cuisine_type.value.trim(),
          wait_minutes: stallForm.elements.wait_minutes.value,
          image_url: stallForm.elements.image_url.value.trim(),
          description: stallForm.elements.description.value.trim(),
          closed: stallForm.elements.closed.checked,
          rating: 4.5
        });
        ui.toast("Stall saved.");
        clearStallForm();
        loadData();
      });
    }

    if (accountForm) {
      accountForm.elements.account_select.addEventListener("change", function () {
        syncAccountRoleFields();
      });

      accountForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        try {
          var authUserId = accountForm.elements.auth_user_id.value.trim();
          if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(authUserId)) {
            ui.toast("Enter the UUID created in Supabase Authentication.", "error");
            return;
          }
          var selectedRole = accountRole(accountForm);
          var assignedStallId = selectedRole === "staff" && accountForm.elements.assigned_stall_id
            ? accountForm.elements.assigned_stall_id.value
            : "";
          if (selectedRole === "staff" && !assignedStallId) {
            ui.toast("Choose a stall for this owner.", "error");
            return;
          }
          var savedUser = await store.saveUser({
            id: accountForm.elements.id.value || authUserId,
            name: accountForm.elements.name.value.trim(),
            username: accountForm.elements.username.value.trim(),
            email: accountForm.elements.email.value.trim(),
            phone: accountForm.elements.phone.value.trim(),
            role: selectedRole,
            assigned_stall_id: assignedStallId
          });
          if (selectedRole === "staff" && savedUser) {
            await linkStaffToStall(savedUser.id, assignedStallId);
          }
          ui.toast("Account saved.");
          await loadData();
        } catch (error) {
          ui.toast(error.message || "Unable to save account.", "error");
        }
      });
    }

    document.addEventListener("click", async function (event) {
      var generateQr = event.target.closest("[data-generate-table-qr]");
      if (generateQr) {
        var card = generateQr.closest("[data-table-card]");
        var canvas = card && card.querySelector("[data-table-qr]");
        if (canvas) {
          renderQRCode(canvas);
          ui.toast("QR code generated.");
        }
        return;
      }

      var editStall = event.target.closest("[data-edit-stall]");
      if (editStall) {
        loadStallIntoForm(editStall.dataset.editStall);
        return;
      }

      var toggleStall = event.target.closest("[data-toggle-stall]");
      if (toggleStall) {
        await store.toggleStallClosed(toggleStall.dataset.toggleStall, toggleStall.dataset.closed === "true");
        ui.toast("Stall status updated.");
        loadData();
        return;
      }

      var deleteStall = event.target.closest("[data-delete-stall]");
      if (deleteStall) {
        var stall = cache.stalls.find(function (record) {
          return record.id === deleteStall.dataset.deleteStall;
        });
        if (window.confirm("Delete " + (stall ? stall.name : "this stall") + " and its menu items?")) {
          await store.deleteStall(deleteStall.dataset.deleteStall);
          ui.toast("Stall deleted.");
          clearStallForm();
          loadData();
        }
        return;
      }

      var toggleTable = event.target.closest("[data-toggle-table]");
      if (toggleTable) {
        await store.toggleTableActive(toggleTable.dataset.toggleTable, toggleTable.dataset.active === "true");
        ui.toast("Table QR status updated.");
        clearTableForm();
        loadData();
        return;
      }

      var deleteTable = event.target.closest("[data-delete-table]");
      if (deleteTable) {
        var table = cache.tables.find(function (record) {
          return record.id === deleteTable.dataset.deleteTable;
        });
        if (window.confirm("Delete " + (table ? table.label : "this table") + " QR link?")) {
          await store.deleteTable(deleteTable.dataset.deleteTable);
          ui.toast("Table deleted.");
          clearTableForm();
          loadData();
        }
        return;
      }

      var copyTableUrl = event.target.closest("[data-copy-table-url]");
      if (copyTableUrl) {
        await copyText(copyTableUrl.dataset.copyTableUrl);
        ui.toast("Table link copied.");
        return;
      }

      var editUser = event.target.closest("[data-edit-user]");
      if (editUser) {
        loadAccountIntoForm(editUser.dataset.editUser);
      }
    });
  }

  document.addEventListener("DOMContentLoaded", async function () {
    if (!document.body.matches('[data-page="admin"]')) return;
    if (!await store.validateSession("admin")) return;
    loadData();
    bindEvents();
  });
})();
