(function () {
  var ui = window.FoodUI;
  var store = window.FoodStore;
  var state = {
    query: "",
    stallId: "all",
    category: "all",
    stalls: [],
    menuItems: []
  };

  function uniqueCategories(items) {
    var seen = {};
    return items
      .map(function (item) {
        return item.category;
      })
      .filter(function (category) {
        if (!category || seen[category]) return false;
        seen[category] = true;
        return true;
      })
      .sort();
  }

  function selectedStallName() {
    if (state.stallId === "all") return "All food items";
    var stall = state.stalls.find(function (item) {
      return item.id === state.stallId;
    });
    return stall ? stall.name : "All food items";
  }

  function selectedMenuTitle() {
    var stallName = selectedStallName();
    if (state.category === "all") return stallName;
    if (state.stallId === "all") return state.category + " from matching stalls";
    return state.category + " from " + stallName;
  }

  function renderStallFilters() {
    var stallFilter = ui.qs("#stall-filter");
    if (!stallFilter) return;

    stallFilter.innerHTML = [
      '<option value="all">All stalls</option>',
      state.stalls.map(function (stall) {
        return '<option value="' + ui.escapeHtml(stall.id) + '">' + ui.escapeHtml(stall.name) + "</option>";
      }).join("")
    ].join("");
    stallFilter.value = state.stallId;
  }

  function renderCategoryFilters() {
    var categoryFilter = ui.qs("#category-filter");
    if (!categoryFilter) return;

    var categoryItems = state.stallId === "all"
      ? state.menuItems
      : state.menuItems.filter(function (item) {
        return item.stall_id === state.stallId;
      });
    var categories = uniqueCategories(categoryItems);
    if (state.category !== "all" && categories.indexOf(state.category) === -1) {
      state.category = "all";
    }
    categoryFilter.innerHTML = [
      '<option value="all">All categories</option>',
      categories.map(function (category) {
        return '<option value="' + ui.escapeHtml(category) + '">' + ui.escapeHtml(category) + "</option>";
      }).join("")
    ].join("");
    categoryFilter.value = state.category;
  }

  function renderStalls(filteredItems) {
    var target = ui.qs("#stall-list");
    if (!target) return;

    var hasActiveFilter = Boolean(state.query || state.category !== "all");
    var matchingStallIds = (filteredItems || []).reduce(function (ids, item) {
      ids[item.stall_id] = true;
      return ids;
    }, {});
    var allStallsCard = [
      '<button class="stall-card active" type="button" data-stall-id="all">',
      '<span class="stall-thumb" style="' + ui.imageStyle("https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=900&q=80") + '"></span>',
      "<span>",
      "<h3>" + (hasActiveFilter ? "All matching stalls" : "All stalls") + "</h3>",
      "<p>" + (hasActiveFilter ? "Browse every matching menu item." : "Browse every menu item available today.") + "</p>",
      '<span class="meta-row"><span class="tag teal">Multi-vendor</span></span>',
      "</span>",
      "</button>"
    ].join("");
    var selectedStalls = state.stallId === "all"
      ? state.stalls.filter(function (stall) {
        return !hasActiveFilter || matchingStallIds[stall.id];
      })
      : state.stalls.filter(function (stall) {
        return stall.id === state.stallId;
      });

    if (!selectedStalls.length && hasActiveFilter) {
      target.innerHTML = ui.renderEmpty("No vendors match this filter.", null, "");
      ui.hydrateIcons();
      return;
    }

    target.innerHTML = [
      state.stallId === "all" && !hasActiveFilter ? allStallsCard : "",
      selectedStalls.map(function (stall) {
        return [
          '<button class="stall-card' + (state.stallId === stall.id ? " active" : "") + '" type="button" data-stall-id="' + ui.escapeHtml(stall.id) + '">',
          '<span class="stall-thumb" style="' + ui.imageStyle(stall.image_url) + '"></span>',
          "<span>",
          "<h3>" + ui.escapeHtml(stall.name) + "</h3>",
          "<p>" + ui.escapeHtml(stall.description || "") + "</p>",
          '<span class="meta-row">',
          '<span class="tag gold">' + Number(stall.rating || 0).toFixed(1) + " rating</span>",
          '<span class="tag">' + Number(stall.wait_minutes || 10) + " min</span>",
          "</span>",
          "</span>",
          "</button>"
        ].join("");
      }).join("")
    ].join("");
  }

  function renderMenu(items) {
    var target = ui.qs("#menu-grid");
    var resultCount = ui.qs("#result-count");
    var menuTitleNode = ui.qs("#menu-title");
    if (!target) return;

    if (resultCount) resultCount.textContent = items.length + (items.length === 1 ? " item" : " items");
    if (menuTitleNode) menuTitleNode.textContent = selectedMenuTitle();

    if (!items.length) {
      target.innerHTML = ui.renderEmpty("No menu items found.", null, "");
      return;
    }

    target.innerHTML = items.map(function (item) {
      var stall = state.stalls.find(function (record) {
        return record.id === item.stall_id;
      });

      return [
        '<article class="menu-card">',
        '<div class="menu-image" style="' + ui.imageStyle(item.image_url) + '"></div>',
        '<div class="menu-card-body">',
        '<div class="meta-row">',
        '<span class="tag teal">' + ui.escapeHtml(item.category || "Menu") + "</span>",
        stall ? '<span class="tag">' + ui.escapeHtml(stall.name) + "</span>" : "",
        '<span class="tag gold">' + Number(item.stock_quantity || 0) + " left</span>",
        "</div>",
        "<div>",
        "<h3>" + ui.escapeHtml(item.name) + "</h3>",
        "<p>" + ui.escapeHtml(item.description || "") + "</p>",
        "</div>",
        "</div>",
        '<div class="menu-card-footer">',
        '<strong class="price">' + ui.money(item.price) + "</strong>",
        '<button class="button" type="button" data-add-item="' + ui.escapeHtml(item.id) + '"' + (!item.available || Number(item.stock_quantity || 0) <= 0 ? " disabled" : "") + '>',
        '<i data-lucide="plus"></i>Add',
        "</button>",
        "</div>",
        "</article>"
      ].join("");
    }).join("");

    ui.hydrateIcons();
  }

  async function applyFilters() {
    var items = await store.listMenuItems({
      query: state.query,
      stallId: state.stallId,
      category: state.category
    });
    renderStalls(items);
    renderMenu(items);
  }

  function bindEvents() {
    var search = ui.qs("#menu-search");
    var stallFilter = ui.qs("#stall-filter");
    var categoryFilter = ui.qs("#category-filter");
    var clearButton = ui.qs("#clear-filters");

    if (search) {
      search.addEventListener("input", function () {
        state.query = search.value;
        applyFilters();
      });
    }

    if (stallFilter) {
      stallFilter.addEventListener("change", function () {
        state.stallId = stallFilter.value;
        renderCategoryFilters();
        applyFilters();
      });
    }

    if (categoryFilter) {
      categoryFilter.addEventListener("change", function () {
        state.category = categoryFilter.value;
        applyFilters();
      });
    }

    if (clearButton) {
      clearButton.addEventListener("click", function () {
        state.query = "";
        state.stallId = "all";
        state.category = "all";
        if (search) search.value = "";
        renderStallFilters();
        renderCategoryFilters();
        applyFilters();
      });
    }

    document.addEventListener("click", async function (event) {
      var stallButton = event.target.closest("[data-stall-id]");
      if (stallButton) {
        state.stallId = stallButton.dataset.stallId;
        if (stallFilter) stallFilter.value = state.stallId;
        renderCategoryFilters();
        applyFilters();
        return;
      }

      var addButton = event.target.closest("[data-add-item]");
      if (addButton) {
        try {
          await store.addToCart(addButton.dataset.addItem);
          await ui.refreshCartBadge();
          await ui.renderCartPreview("cart-preview");
          ui.toast("Added to cart.");
        } catch (error) {
          ui.toast(error.message || "Unable to add item.", "error");
        }
      }
    });
  }

  document.addEventListener("DOMContentLoaded", async function () {
    if (!document.body.matches('[data-page="menu"]')) return;

    state.stalls = await store.listStalls();
    state.menuItems = await store.listMenuItems({ includeUnavailable: true });

    var stallCount = ui.qs("#stall-count");
    var menuCount = ui.qs("#menu-count");
    if (stallCount) stallCount.textContent = state.stalls.length;
    if (menuCount) menuCount.textContent = state.menuItems.filter(function (item) { return item.available; }).length;

    renderStallFilters();
    renderCategoryFilters();
    renderStalls();
    await applyFilters();
    await ui.renderCartPreview("cart-preview");
    bindEvents();
    ui.hydrateIcons();
  });
})();
