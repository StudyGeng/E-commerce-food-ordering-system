(function () {
  window.AppConfig = {
    appName: "ChillOrder",
    currency: "RM",
    completedOrderRetentionMinutes: 40,
    pendingOrderWarningMinutes: 10,
    pendingOrderAutoCancelMinutes: 15,
    // Keep placeholders in GitHub. The build script injects env values into dist/.
    supabaseUrl: "your-supabase-url",
    supabasePublishableKey: "your-supabase-publishable-key",
    supabaseRequestTimeoutMs: 2500,
    guestCustomer: {
      id: "",
      name: "",
      email: "",
      phone: ""
    }
  };
})();
