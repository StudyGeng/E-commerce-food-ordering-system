(function () {
  var ui = window.FoodUI;
  var store = window.FoodStore;
  var state = {
    query: "",
    stallId: "all",
    category: "all",
    stalls: [],
    menuItems: [],
    discovery: {}
  };
  var discoveryRefreshPromise = null;

  function uniqueCategories(items) {
    var seen = {};
    return items
      .map(function (item) { return item.category; })
      .filter(function (category) {
        if (!category || seen[category]) return false;
        seen[category] = true;
        return true;
      })
      .sort();
  }

  function stallFor(stallId) {
    return state.stalls.find(function (stall) {
      return stall.id === stallId;
    }) || null;
  }

  function discoveryFor(stallId) {
    return state.discovery[stallId] || {
      stall_id: stallId,
      is_sponsored: false,
      promotion_plan: null,
      promotion_headline: "",
      sponsor_rank: 0,
      recent_orders: 0,
      recent_items: 0
    };
  }

  function replaceDiscovery(entries) {
    var nextDiscovery = {};
    (entries || []).forEach(function (entry) {
      if (entry && entry.stall_id) nextDiscovery[entry.stall_id] = entry;
    });
    state.discovery = nextDiscovery;
  }

  function refreshDiscovery() {
    if (!store.listStallDiscovery) return Promise.resolve([]);
    if (discoveryRefreshPromise) return discoveryRefreshPromise;

    discoveryRefreshPromise = store.listStallDiscovery()
      .then(function (entries) {
        replaceDiscovery(entries);
        applyFilters();
        return entries;
      })
      .catch(function (error) {
        console.warn(error);
        // Paid placement must fail closed so a stale ad cannot outlive its campaign.
        replaceDiscovery([]);
        applyFilters();
        return [];
      })
      .then(function (entries) {
        discoveryRefreshPromise = null;
        return entries;
      }, function (error) {
        discoveryRefreshPromise = null;
        throw error;
      });
    return discoveryRefreshPromise;
  }

  function isSponsored(stall) {
    return Boolean(stall && discoveryFor(stall.id).is_sponsored);
  }

  function planLabel(value) {
    if (value === "premium") return "Premium";
    if (value === "featured") return "Featured";
    return "Sponsored";
  }

  function selectedStallName() {
    if (state.stallId === "all") return "All food items";
    var stall = stallFor(state.stallId);
    return stall ? stall.name : "All food items";
  }

  function selectedMenuTitle() {
    var stallName = selectedStallName();
    if (state.category === "all") return stallName;
    if (state.stallId === "all") return state.category + " from matching stalls";
    return state.category + " from " + stallName;
  }

  function itemIsOrderable(item) {
    return Boolean(item && item.available && Number(item.stock_quantity || 0) > 0 && stallFor(item.stall_id));
  }

  function itemMatchesSearch(item, query) {
    if (!query) return true;
    var stall = stallFor(item.stall_id);
    var text = [
      item.name,
      item.category,
      item.description,
      stall && stall.name,
      stall && stall.cuisine_type,
      stall && stall.description
    ].join(" ").toLowerCase();
    return text.includes(query);
  }

  function filteredMenuItems() {
    var query = String(state.query || "").trim().toLowerCase();
    return state.menuItems.filter(function (item) {
      return itemIsOrderable(item) &&
        itemMatchesSearch(item, query) &&
        (state.stallId === "all" || item.stall_id === state.stallId) &&
        (state.category === "all" || item.category === state.category);
    });
  }

  function compareOrganicStalls(a, b) {
    var aDiscovery = discoveryFor(a.id);
    var bDiscovery = discoveryFor(b.id);
    var soldDifference = Number(bDiscovery.recent_items || 0) - Number(aDiscovery.recent_items || 0);
    if (soldDifference) return soldDifference;
    var orderDifference = Number(bDiscovery.recent_orders || 0) - Number(aDiscovery.recent_orders || 0);
    if (orderDifference) return orderDifference;
    var ratingDifference = Number(b.rating || 0) - Number(a.rating || 0);
    if (ratingDifference) return ratingDifference;
    return String(a.name || "").localeCompare(String(b.name || ""));
  }

  function compareSponsoredStalls(a, b) {
    var priorityDifference = Number(discoveryFor(b.id).sponsor_rank || 0) - Number(discoveryFor(a.id).sponsor_rank || 0);
    if (priorityDifference) return priorityDifference;

    // Equal-tier campaigns rotate predictably once per day instead of jumping on every render.
    var day = new Date().toISOString().slice(0, 10);
    function dailyRank(stall) {
      var text = day + ":" + String(stall.id || "");
      var hash = 0;
      for (var index = 0; index < text.length; index += 1) {
        hash = ((hash * 31) + text.charCodeAt(index)) >>> 0;
      }
      return hash;
    }
    return dailyRank(a) - dailyRank(b) || String(a.name || "").localeCompare(String(b.name || ""));
  }

  function compareMenuItems(a, b) {
    var aStall = stallFor(a.stall_id);
    var bStall = stallFor(b.stall_id);
    var aSponsored = isSponsored(aStall);
    var bSponsored = isSponsored(bStall);
    if (aSponsored !== bSponsored) return aSponsored ? -1 : 1;
    if (aSponsored && bSponsored) {
      var sponsorDifference = Number(discoveryFor(b.stall_id).sponsor_rank || 0) -
        Number(discoveryFor(a.stall_id).sponsor_rank || 0);
      if (sponsorDifference) return sponsorDifference;
    }
    var popularityDifference = compareOrganicStalls(aStall, bStall);
    if (popularityDifference) return popularityDifference;
    return String(a.name || "").localeCompare(String(b.name || ""));
  }

  function matchingStalls(items) {
    var ids = (items || []).reduce(function (result, item) {
      result[item.stall_id] = true;
      return result;
    }, {});
    return state.stalls.filter(function (stall) { return ids[stall.id]; });
  }

  function renderStallFilters() {
    var stallFilter = ui.qs("#stall-filter");
    if (!stallFilter) return;
    var alphabetical = state.stalls.slice().sort(function (a, b) {
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
    stallFilter.innerHTML = [
      '<option value="all">All stalls</option>',
      alphabetical.map(function (stall) {
        return '<option value="' + ui.escapeHtml(stall.id) + '">' + ui.escapeHtml(stall.name) + "</option>";
      }).join("")
    ].join("");
    stallFilter.value = state.stallId;
  }

  function renderCategoryFilters() {
    var categoryFilter = ui.qs("#category-filter");
    if (!categoryFilter) return;
    var categoryItems = state.menuItems.filter(function (item) {
      return itemIsOrderable(item) && (state.stallId === "all" || item.stall_id === state.stallId);
    });
    var categories = uniqueCategories(categoryItems);
    if (state.category !== "all" && categories.indexOf(state.category) === -1) state.category = "all";
    categoryFilter.innerHTML = [
      '<option value="all">All categories</option>',
      categories.map(function (category) {
        return '<option value="' + ui.escapeHtml(category) + '">' + ui.escapeHtml(category) + "</option>";
      }).join("")
    ].join("");
    categoryFilter.value = state.category;
  }

  function compactStallCardHtml(stall, options) {
    var settings = options || {};
    var discovery = discoveryFor(stall.id);
    var soldLabel = Number(discovery.recent_items || 0) > 0
      ? Number(discovery.recent_items) + " sold recently"
      : Number(stall.rating || 0).toFixed(1) + " rating";
    return [
      '<button class="stall-card' + (state.stallId === stall.id ? " active" : "") +
        (settings.sponsored ? " is-sponsored" : "") + '" type="button" data-stall-id="' + ui.escapeHtml(stall.id) + '">',
      '<span class="stall-thumb" style="' + ui.imageStyle(stall.image_url) + '"></span>',
      "<span>",
      settings.sponsored ? '<span class="tag sponsored-badge">Sponsored</span>' : "",
      "<h3>" + ui.escapeHtml(stall.name) + "</h3>",
      "<p>" + ui.escapeHtml(stall.description || stall.cuisine_type || "") + "</p>",
      '<span class="meta-row">',
      '<span class="tag gold">' + ui.escapeHtml(soldLabel) + "</span>",
      '<span class="tag">' + Number(stall.wait_minutes || 10) + " min</span>",
      "</span>",
      "</span>",
      "</button>"
    ].join("");
  }

  function renderSponsoredStalls(items) {
    var section = ui.qs("#sponsored-section");
    var target = ui.qs("#sponsored-stalls");
    if (!section || !target) return;
    var sponsored = matchingStalls(items).filter(isSponsored).sort(compareSponsoredStalls);
    section.hidden = !sponsored.length;
    if (!sponsored.length) {
      target.innerHTML = "";
      return;
    }

    target.innerHTML = sponsored.map(function (stall) {
      var discovery = discoveryFor(stall.id);
      return [
        '<button class="sponsored-card' + (discovery.promotion_plan === "premium" ? " premium" : "") +
          (state.stallId === stall.id ? " active" : "") + '" type="button" data-stall-id="' + ui.escapeHtml(stall.id) +
          '" aria-label="Sponsored stall: ' + ui.escapeHtml(stall.name) + '. View menu">',
        '<span class="sponsored-image" style="' + ui.imageStyle(stall.image_url) + '"></span>',
        '<span class="sponsored-body">',
        '<span class="sponsored-label-row">',
        '<span class="tag sponsored-badge"><i data-lucide="badge-dollar-sign"></i>Sponsored</span>',
        '<span class="tag promotion-plan-tag">' + ui.escapeHtml(planLabel(discovery.promotion_plan)) + "</span>",
        "</span>",
        "<strong>" + ui.escapeHtml(stall.name) + "</strong>",
        "<span>" + ui.escapeHtml(discovery.promotion_headline || stall.description || "") + "</span>",
        '<span class="sponsored-meta">' + ui.escapeHtml(stall.cuisine_type || "Food") + " &middot; " +
          Number(stall.rating || 0).toFixed(1) + " rating &middot; " + Number(stall.wait_minutes || 10) + " min</span>",
        '<span class="sponsored-cta">View menu <i data-lucide="arrow-right"></i></span>',
        "</span>",
        "</button>"
      ].join("");
    }).join("");
    ui.hydrateIcons();
  }

  function stallGroupHtml(title, subtitle, stalls, options) {
    if (!stalls.length) return "";
    return [
      '<section class="stall-group">',
      '<div class="stall-group-heading"><strong>' + ui.escapeHtml(title) + "</strong><span>" + ui.escapeHtml(subtitle) + "</span></div>",
      stalls.map(function (stall) { return compactStallCardHtml(stall, options); }).join(""),
      "</section>"
    ].join("");
  }

  function renderStalls(filteredItems) {
    var target = ui.qs("#stall-list");
    if (!target) return;
    var hasActiveFilter = Boolean(String(state.query || "").trim() || state.category !== "all");
    var matches = matchingStalls(filteredItems);
    var sponsored = matches.filter(isSponsored);
    var organic = matches.filter(function (stall) { return !isSponsored(stall); }).sort(compareOrganicStalls);

    var allStallsCard = state.stallId === "all" && !hasActiveFilter ? [
      '<button class="stall-card active all-stalls-card" type="button" data-stall-id="all">',
      '<span class="stall-thumb" style="' + ui.imageStyle("https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=900&q=80") + '"></span>',
      "<span><h3>All stalls</h3><p>Browse every menu item available today.</p>",
      '<span class="meta-row"><span class="tag teal">Multi-vendor</span></span></span>',
      "</button>"
    ].join("") : "";

    var hasDemandData = organic.some(function (stall) {
      var discovery = discoveryFor(stall.id);
      return Number(discovery.recent_items || 0) > 0 || Number(discovery.recent_orders || 0) > 0;
    });
    var popularTitle = hasDemandData
      ? (hasActiveFilter ? "Popular matches" : "Popular right now")
      : (hasActiveFilter ? "Top-rated matches" : "Top rated");
    var popularSubtitle = hasDemandData ? "Based on recent paid orders" : "Based on customer ratings";
    var popular = organic.slice(0, 3);
    var more = organic.slice(3);
    var html = [
      allStallsCard,
      stallGroupHtml(popularTitle, popularSubtitle, popular),
      stallGroupHtml(hasActiveFilter ? "Other matches" : "More stalls", "More orderable choices", more)
    ].join("");

    if (!html) {
      target.innerHTML = sponsored.length
        ? '<p class="muted stall-list-note">Matching paid stalls are shown in the Sponsored section above.</p>'
        : ui.renderEmpty("No stalls match this filter.", null, "");
    } else {
      target.innerHTML = html;
    }
    ui.hydrateIcons();
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
      var stall = stallFor(item.stall_id);
      var sponsored = isSponsored(stall);
      return [
        '<article class="menu-card' + (sponsored ? " is-sponsored" : "") + '">',
        '<div class="menu-image" style="' + ui.imageStyle(item.image_url) + '">',
        sponsored ? '<span class="menu-sponsored-label">Sponsored</span>' : "",
        "</div>",
        '<div class="menu-card-body"><div class="meta-row">',
        sponsored ? '<span class="tag sponsored-badge">Sponsored</span>' : "",
        '<span class="tag teal">' + ui.escapeHtml(item.category || "Menu") + "</span>",
        stall ? '<span class="tag">' + ui.escapeHtml(stall.name) + "</span>" : "",
        '<span class="tag gold">' + Number(item.stock_quantity || 0) + " left</span>",
        "</div>",
        "<div><h3>" + ui.escapeHtml(item.name) + "</h3><p>" + ui.escapeHtml(item.description || "") + "</p></div></div>",
        '<div class="menu-card-footer"><strong class="price">' + ui.money(item.price) + "</strong>",
        '<button class="button" type="button" data-add-item="' + ui.escapeHtml(item.id) + '">',
        '<i data-lucide="plus"></i>Add</button></div></article>'
      ].join("");
    }).join("");
    ui.hydrateIcons();
  }

  function applyFilters() {
    var items = filteredMenuItems().sort(compareMenuItems);
    renderSponsoredStalls(items);
    renderStalls(items);
    renderMenu(items);
  }

  function focusMenuAfterStallSelection() {
    var menuTitle = ui.qs("#menu-title");
    if (!menuTitle) return;
    window.setTimeout(function () {
      try {
        menuTitle.focus({ preventScroll: true });
      } catch (error) {
        menuTitle.focus();
      }
      if (menuTitle.scrollIntoView && window.matchMedia && window.matchMedia("(max-width: 1080px)").matches) {
        menuTitle.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 80);
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
        focusMenuAfterStallSelection();
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
    var discoveryPromise = store.listStallDiscovery
      ? store.listStallDiscovery().catch(function (error) {
        console.warn(error);
        return [];
      })
      : Promise.resolve([]);
    var results = await Promise.all([
      store.listStalls(),
      store.listMenuItems({ includeUnavailable: true }),
      discoveryPromise
    ]);
    state.stalls = results[0];
    state.menuItems = results[1];
    replaceDiscovery(results[2]);

    var stallCount = ui.qs("#stall-count");
    var menuCount = ui.qs("#menu-count");
    if (stallCount) stallCount.textContent = state.stalls.length;
    if (menuCount) menuCount.textContent = state.menuItems.filter(itemIsOrderable).length;
    renderStallFilters();
    renderCategoryFilters();
    applyFilters();
    await ui.renderCartPreview("cart-preview");
    bindEvents();
    window.setInterval(refreshDiscovery, 60000);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") refreshDiscovery();
    });
    ui.hydrateIcons();
  });
})();
