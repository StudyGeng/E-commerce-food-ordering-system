const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function classList(initial) {
  const values = new Set(initial || []);
  return {
    toggle: function (name, force) {
      if (force === undefined) force = !values.has(name);
      if (force) values.add(name);
      else values.delete(name);
      return force;
    },
    contains: function (name) { return values.has(name); }
  };
}

function element(initialClasses) {
  const attributes = {};
  const controls = [];
  return {
    innerHTML: "",
    textContent: "",
    disabled: false,
    classList: classList(initialClasses),
    setAttribute: function (name, value) { attributes[name] = String(value); },
    getAttribute: function (name) { return attributes[name]; },
    querySelectorAll: function () { return controls; },
    controls: controls
  };
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function runTier(tier, planActive) {
  if (planActive === undefined) planActive = true;
  const callbacks = {};
  const calls = { menus: [], orders: [], expenses: 0 };
  const lock = element(["hidden"]);
  const premiumLock = element(["hidden"]);
  const badge = element();
  const expenseSection = element();
  const analyticsSection = element();
  const premiumCost = element();
  const premiumRange = element();
  const premiumGrid = element();
  const premiumControl = { disabled: false };
  premiumCost.controls.push(premiumControl);
  const expenseNav = element();
  const analyticsNav = element();
  const metrics = element();
  const expenseSummary = element();
  const expenseList = element();

  const targets = {
    "#business-calculator-lock": lock,
    "#premium-analytics-lock": premiumLock,
    "#business-access-badge": badge,
    "#business-metrics": metrics,
    "#expense-summary": expenseSummary,
    "#expense-list": expenseList
  };
  const qsa = {
    "[data-business-tools]": [expenseSection, analyticsSection],
    "[data-premium-analytics]": [premiumCost, premiumRange, premiumGrid],
    "[data-business-nav]": [expenseNav, analyticsNav],
    "[data-date-preset]": []
  };
  const now = Date.now();
  const promotion = tier === "free" ? [] : [{
    stall_id: "stall-a",
    plan_slug: tier,
    campaign_status: "active",
    payment_status: "paid",
    starts_at: new Date(now - 3600000).toISOString(),
    ends_at: new Date(now + 3600000).toISOString()
  }];
  const memory = {};
  const context = {
    console: console,
    Date: Date,
    JSON: JSON,
    Math: Math,
    Number: Number,
    Object: Object,
    Array: Array,
    String: String,
    Boolean: Boolean,
    Promise: Promise,
    setTimeout: function (callback) { callback(); return 0; },
    setInterval: function () { return 0; },
    confirm: function () { return true; }
  };
  context.window = context;
  context.localStorage = {
    getItem: function (key) { return memory[key] || null; },
    setItem: function (key, value) { memory[key] = String(value); },
    removeItem: function (key) { delete memory[key]; }
  };
  context.document = {
    activeElement: null,
    body: { matches: function () { return true; } },
    addEventListener: function (name, callback) { callbacks[name] = callback; }
  };
  context.FoodUI = {
    qs: function (selector) { return targets[selector] || null; },
    qsa: function (selector) { return qsa[selector] || []; },
    escapeHtml: escapeHtml,
    money: function (value) { return "RM " + Number(value || 0).toFixed(2); },
    hydrateIcons: function () {},
    toast: function () {},
    orderIssueLabel: function () { return ""; },
    statusClass: function () { return ""; },
    statusLabel: function (value) { return value; }
  };
  context.FoodStore = {
    validateSession: async function () { return true; },
    getSession: function () { return { role: "staff", assigned_stall_id: "stall-a" }; },
    listStalls: async function () { return [{ id: "stall-a", name: "Stall A", rating: 4.5 }]; },
    listPromotionPlans: async function () {
      return tier === "free" ? [] : [{ slug: tier, active: planActive }];
    },
    listStallPromotions: async function () { return promotion; },
    listMenuItems: async function (options) {
      calls.menus.push(Object.assign({}, options));
      return [{ id: "item-a", stall_id: "stall-a", name: "Rice", price: 10, available: true, stock_quantity: 5 }];
    },
    listOrders: async function (options) {
      calls.orders.push(Object.assign({}, options));
      return [];
    },
    listExpenses: async function () { calls.expenses += 1; return []; }
  };

  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, "..", "js", "stall", "staff.js"), "utf8");
  vm.runInContext(source, context, { filename: "js/stall/staff.js" });
  await callbacks.DOMContentLoaded();

  return {
    calls: calls,
    lock: lock,
    premiumLock: premiumLock,
    badge: badge,
    tools: [expenseSection, analyticsSection],
    premiumNodes: [premiumCost, premiumRange, premiumGrid],
    premiumControl: premiumControl,
    nav: [expenseNav, analyticsNav],
    metrics: metrics
  };
}

(async function () {
  const free = await runTier("free");
  assert(!free.lock.classList.contains("hidden"), "Free should see the upgrade paywall.");
  assert(free.tools.every(function (node) { return node.classList.contains("hidden"); }), "Free should not see any business-calculator section.");
  assert(free.nav.every(function (node) { return node.classList.contains("is-locked"); }), "Free business navigation should be marked locked.");
  assert.strictEqual(free.calls.expenses, 0, "Free should not load expense records.");
  assert.strictEqual(free.calls.orders.length, 1, "Free should load only the operational order queue.");
  assert.strictEqual(free.calls.orders[0].operationalOnly, true, "Free should not request historical reporting orders.");
  assert.strictEqual(free.calls.menus.some(function (options) { return options.includeCosts; }), false, "Free should never request private menu costs.");

  const featured = await runTier("featured");
  assert(featured.lock.classList.contains("hidden"), "Featured should not see the main paywall.");
  assert(featured.tools.every(function (node) { return !node.classList.contains("hidden"); }), "Featured should see expense and core analytics sections.");
  assert(!featured.premiumLock.classList.contains("hidden"), "Featured should see the Premium upgrade callout.");
  assert(featured.premiumNodes.every(function (node) { return node.classList.contains("hidden"); }), "Featured should not see Premium-only reporting controls.");
  assert.strictEqual(featured.calls.expenses, 1, "Featured should load expense records.");
  assert.strictEqual(featured.calls.menus.some(function (options) { return options.includeCosts; }), false, "Featured should not request private menu costs.");
  assert(!featured.metrics.innerHTML.includes("Gross profit"), "Featured metrics should omit Premium gross-profit detail.");

  const premium = await runTier("premium");
  assert(premium.lock.classList.contains("hidden"), "Premium should not see the main paywall.");
  assert(premium.premiumLock.classList.contains("hidden"), "Premium should not see an upgrade callout.");
  assert(premium.premiumNodes.every(function (node) { return !node.classList.contains("hidden"); }), "Premium should see all advanced analytics controls.");
  assert.strictEqual(premium.premiumControl.disabled, false, "Premium cost controls should remain enabled.");
  assert(premium.calls.menus.some(function (options) { return options.includeCosts === true; }), "Premium should request private menu costs.");
  assert(premium.calls.orders.some(function (options) { return options.includeCosts === true; }), "Premium should request historical item-cost snapshots.");
  assert(premium.metrics.innerHTML.includes("Gross profit"), "Premium should receive gross-profit detail.");

  const disabledPremium = await runTier("premium", false);
  assert(!disabledPremium.lock.classList.contains("hidden"), "A globally disabled paid plan must fail closed to Free.");
  assert.strictEqual(disabledPremium.calls.expenses, 0, "A disabled plan must not load financial records.");
  assert.strictEqual(disabledPremium.calls.menus.some(function (options) { return options.includeCosts; }), false, "A disabled Premium plan must not request private costs.");

  console.log("Business tier entitlement test passed.");
})().catch(function (error) {
  console.error(error.stack || error);
  process.exitCode = 1;
});
