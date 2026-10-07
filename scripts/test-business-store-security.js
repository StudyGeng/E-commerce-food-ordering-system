const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

(async function () {
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
    setTimeout: setTimeout,
    clearTimeout: clearTimeout
  };
  context.window = context;
  context.fetch = function () { throw new Error("Network access is not expected in the local-store test."); };
  context.localStorage = {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null; },
    setItem: function (key, value) { memory[key] = String(value); },
    removeItem: function (key) { delete memory[key]; }
  };
  context.AppConfig = {
    supabaseUrl: "your-supabase-url",
    supabasePublishableKey: "your-supabase-publishable-key"
  };

  vm.createContext(context);
  ["js/shared/data.js", "js/shared/supabase.js"].forEach(function (relativePath) {
    const source = fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
    vm.runInContext(source, context, { filename: relativePath });
  });

  const store = context.FoodStore;
  const sessionKey = "foodorder_session_v1";
  const stateKey = "foodorder_state_v1";
  function setStaff(stallId) {
    memory[sessionKey] = JSON.stringify({ role: "staff", assigned_stall_id: stallId });
  }

  memory[sessionKey] = "";
  const publicItems = await store.listMenuItems({ includeUnavailable: true, includeClosed: true, includeCosts: true });
  assert(publicItems.every(function (item) {
    return !Object.prototype.hasOwnProperty.call(item, "estimated_cost");
  }), "A customer/Free caller must not receive private menu costs.");

  const state = JSON.parse(memory[stateKey]);
  const completedAt = new Date().toISOString();
  state.orders.push({
    id: "order-cost-scope",
    status: "Completed",
    payment_status: "Paid",
    completed_at: completedAt,
    created_at: completedAt,
    updated_at: completedAt,
    total_amount: 21.8
  });
  state.order_items.push(
    { id: "order-cost-rice", order_id: "order-cost-scope", menu_item_id: "item-chicken-rice", stall_id: "stall-rice", quantity: 1, price: 8.9 },
    { id: "order-cost-grill", order_id: "order-cost-scope", menu_item_id: "item-beef-burger", stall_id: "stall-grill", quantity: 1, price: 12.9 }
  );
  state.order_item_costs.push(
    { order_item_id: "order-cost-rice", stall_id: "stall-rice", unit_cost: 3.2, cost_source: "menu_cost_snapshot" },
    { order_item_id: "order-cost-grill", stall_id: "stall-grill", unit_cost: 5.2, cost_source: "menu_cost_snapshot" }
  );
  memory[stateKey] = JSON.stringify(state);

  setStaff("stall-rice");
  const premiumItems = await store.listMenuItems({ includeUnavailable: true, includeClosed: true, includeCosts: true });
  const riceItem = premiumItems.find(function (item) { return item.id === "item-chicken-rice"; });
  const grillItem = premiumItems.find(function (item) { return item.id === "item-beef-burger"; });
  assert.strictEqual(riceItem.estimated_cost, 3.2, "Premium should receive its own menu cost.");
  assert(!Object.prototype.hasOwnProperty.call(grillItem, "estimated_cost"), "Premium must not receive another stall's menu cost.");

  const premiumOrders = await store.listOrders({ includeCosts: true });
  const scopedOrder = premiumOrders.find(function (order) { return order.id === "order-cost-scope"; });
  const riceSale = scopedOrder.items.find(function (item) { return item.id === "order-cost-rice"; });
  const grillSale = scopedOrder.items.find(function (item) { return item.id === "order-cost-grill"; });
  assert.strictEqual(riceSale.unit_cost_snapshot, 3.2, "Premium should receive its own historical cost snapshot.");
  assert(!Object.prototype.hasOwnProperty.call(grillSale, "unit_cost_snapshot"), "Premium must not receive another stall's historical cost snapshot.");

  await store.saveMenuItem({
    id: "item-chicken-rice",
    stall_id: "stall-rice",
    name: "Hainan Chicken Rice",
    description: "Updated",
    category: "Rice",
    price: 8.9,
    estimated_cost: 3.75,
    image_url: "",
    available: true,
    stock_quantity: 18
  });
  const publicAfterSave = await store.listMenuItems({ includeUnavailable: true, includeClosed: true });
  assert(!Object.prototype.hasOwnProperty.call(
    publicAfterSave.find(function (item) { return item.id === "item-chicken-rice"; }),
    "estimated_cost"
  ), "Saving a Premium cost must not put it back on the public menu record.");
  const privateAfterSave = await store.listMenuItems({ includeUnavailable: true, includeClosed: true, includeCosts: true });
  assert.strictEqual(
    privateAfterSave.find(function (item) { return item.id === "item-chicken-rice"; }).estimated_cost,
    3.75,
    "Premium cost updates should be returned only on an authorised cost request."
  );

  setStaff("stall-drinks");
  await store.saveExpense({
    stall_id: "stall-drinks",
    expense_name: "Cups",
    category: "Packaging",
    amount: 12.5,
    expense_date: completedAt.slice(0, 10),
    description: "Featured access test"
  });
  const featuredExpenses = await store.listExpenses({ stallId: "stall-drinks" });
  assert.strictEqual(featuredExpenses.length, 1, "Featured should be allowed to manage expenses.");
  await store.requestStallUpgrade("premium");
  const featuredPromotion = (await store.listStallPromotions({ stallId: "stall-drinks" }))[0];
  assert.strictEqual(featuredPromotion.upgrade_requested_plan, "premium", "Featured should be able to submit a Premium upgrade request without losing current access.");
  await assert.rejects(function () {
    return store.saveMenuItem({
      id: "item-iced-tea",
      stall_id: "stall-drinks",
      name: "Iced Lemon Tea",
      category: "Drinks",
      price: 3.9,
      estimated_cost: 0.9,
      available: true,
      stock_quantity: 30
    });
  }, /Premium/, "Featured must not be allowed to write private menu costs.");

  setStaff("stall-noodle");
  await assert.rejects(function () {
    return store.listExpenses({ stallId: "stall-noodle" });
  }, /Featured or Premium/, "Free must not be allowed to read business expenses.");
  await assert.rejects(function () {
    return store.saveExpense({
      stall_id: "stall-noodle",
      expense_name: "Ingredients",
      category: "Ingredients",
      amount: 10,
      expense_date: completedAt.slice(0, 10)
    });
  }, /Featured or Premium/, "Free must not be allowed to write business expenses.");

  console.log("Business data-layer security test passed.");
})().catch(function (error) {
  console.error(error.stack || error);
  process.exitCode = 1;
});
