const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function localDateValue(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

(async function run() {
  const callbacks = {};
  const targets = {};
  [
    "#business-metrics",
    "#performance-summary",
    "#sales-trend-chart",
    "#expense-breakdown-chart",
    "#menu-performance",
    "#expense-summary",
    "#expense-list"
  ].forEach(function (selector) {
    targets[selector] = {
      innerHTML: "",
      setAttribute: function () {},
      removeAttribute: function () {}
    };
  });

  const now = new Date();
  const completedAt = now.toISOString();
  const expenseDate = localDateValue(now);
  const memory = {};

  global.window = global;
  global.localStorage = {
    getItem: function (key) { return memory[key] || null; },
    setItem: function (key, value) { memory[key] = String(value); },
    removeItem: function (key) { delete memory[key]; }
  };
  global.document = {
    activeElement: null,
    body: { matches: function () { return true; } },
    addEventListener: function (name, callback) { callbacks[name] = callback; }
  };
  global.confirm = function () { return true; };
  global.setInterval = function () { return 0; };

  window.FoodUI = {
    qs: function (selector) { return targets[selector] || null; },
    qsa: function () { return []; },
    escapeHtml: escapeHtml,
    money: function (value) { return "RM " + Number(value || 0).toFixed(2); },
    hydrateIcons: function () {},
    toast: function () {},
    orderIssueLabel: function () { return ""; },
    statusClass: function () { return ""; },
    statusLabel: function (value) { return value; }
  };

  const menuItems = [
    { id: "item-a", stall_id: "stall-a", name: "Chicken Rice", price: 10, estimated_cost: 3, available: true, stock_quantity: 10 },
    { id: "item-b", stall_id: "stall-b", name: "Noodles", price: 50, estimated_cost: 20, available: true, stock_quantity: 10 }
  ];
  const orders = [
    {
      id: "order-multi-stall",
      status: "Completed",
      payment_status: "Paid",
      total_amount: 70,
      completed_at: completedAt,
      updated_at: completedAt,
      created_at: completedAt,
      items: [
        { menu_item_id: "item-a", stall_id: "stall-a", quantity: 2, price: 10 },
        { menu_item_id: "item-b", stall_id: "stall-b", quantity: 1, price: 50 }
      ]
    },
    {
      id: "order-unpaid",
      status: "Completed",
      payment_status: "Pending",
      total_amount: 10,
      completed_at: completedAt,
      updated_at: completedAt,
      created_at: completedAt,
      items: [{ menu_item_id: "item-a", stall_id: "stall-a", quantity: 1, price: 10 }]
    },
    {
      id: "order-pending",
      status: "Pending",
      payment_status: "Paid",
      total_amount: 10,
      updated_at: completedAt,
      created_at: completedAt,
      items: [{ menu_item_id: "item-a", stall_id: "stall-a", quantity: 1, price: 10 }]
    }
  ];

  window.FoodStore = {
    validateSession: async function () { return true; },
    getSession: function () { return { role: "staff", assigned_stall_id: "stall-a" }; },
    listStalls: async function () { return [{ id: "stall-a", name: "Stall A", rating: 4.6 }]; },
    listPromotionPlans: async function () { return [{ slug: "premium", name: "Premium", active: true }]; },
    listStallPromotions: async function () {
      return [{
        stall_id: "stall-a",
        plan_slug: "premium",
        campaign_status: "active",
        payment_status: "paid",
        starts_at: new Date(now.getTime() - 86400000).toISOString(),
        ends_at: new Date(now.getTime() + 86400000).toISOString()
      }];
    },
    listMenuItems: async function () { return menuItems; },
    listOrders: async function () { return orders; },
    listExpenses: async function () {
      return [
        { id: "expense-ingredients", stall_id: "stall-a", expense_name: "Chicken", category: "Ingredients", amount: 5, expense_date: expenseDate },
        { id: "expense-staff", stall_id: "stall-a", expense_name: "Helper", category: "Staff", amount: 4, expense_date: expenseDate },
        { id: "expense-other-stall", stall_id: "stall-b", expense_name: "Rent", category: "Rent & Utilities", amount: 100, expense_date: expenseDate }
      ];
    }
  };

  const source = fs.readFileSync(path.join(__dirname, "..", "js", "stall", "staff.js"), "utf8");
  vm.runInThisContext(source, { filename: "js/stall/staff.js" });
  assert(callbacks.DOMContentLoaded, "The stall dashboard should register its startup handler.");
  await callbacks.DOMContentLoaded();

  const metrics = targets["#business-metrics"].innerHTML;
  assert(metrics.includes("RM 20.00"), "Revenue should use this stall's line items, not the RM 70 multi-stall order total.");
  assert(metrics.includes("RM 9.00"), "Only this stall's expenses should be included.");
  assert(metrics.includes("RM 11.00"), "Net profit should be revenue minus all selected-period expenses.");
  assert(metrics.includes("55.0%"), "Profit margin should be calculated from net profit and revenue.");
  assert(metrics.includes("Chicken Rice (2)"), "Best seller should be ranked by completed item quantity.");
  assert(!metrics.includes("RM 70.00"), "A multi-stall order total must never be counted as one stall's revenue.");

  const summary = targets["#performance-summary"].innerHTML;
  assert(summary.includes("RM 5.00"), "COGS should include ingredient and packaging expenses only.");
  assert(summary.includes("Ingredients - RM 5.00"), "Top expense category should be reported.");

  const menu = targets["#menu-performance"].innerHTML;
  assert(menu.includes("Chicken Rice"), "Sold menu items should appear in menu performance.");
  assert(menu.includes("RM 14.00"), "Estimated menu profit should use estimated unit cost multiplied by quantity.");
  assert(!menu.includes("Noodles"), "Another stall's items should not appear in menu performance.");

  const expenseList = targets["#expense-list"].innerHTML;
  assert(expenseList.includes("Chicken") && expenseList.includes("Helper"), "Own-stall expenses should be listed.");
  assert(!expenseList.includes("Rent"), "Another stall's expenses should be excluded.");

  console.log("Business analytics integration smoke test passed.");
})().catch(function (error) {
  console.error(error.stack || error);
  process.exitCode = 1;
});
