(function () {
  var ui = window.FoodUI;
  var store = window.FoodStore;

  function applyRoleFromUrl() {
    var form = ui.qs("#login-form");
    if (!form) return;
    var role = new URLSearchParams(window.location.search).get("role") || document.body.dataset.loginRole;
    if (role === "admin" || role === "staff") {
      form.elements.role.value = role;
      form.elements.username.value = role;
    }
  }

  function bindLogin() {
    var form = ui.qs("#login-form");
    if (!form) return;

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      try {
        var session = await store.login(
          form.elements.username.value,
          form.elements.password.value,
          form.elements.role.value
        );
        ui.toast("Logged in as " + session.name + ".");
        window.setTimeout(function () {
          window.location.href = session.role === "admin" ? "../admin/index.html" : "../stall/index.html";
        }, 350);
      } catch (error) {
        ui.toast(error.message || "Unable to login.", "error");
      }
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (!document.body.matches('[data-page="login"]')) return;
    applyRoleFromUrl();
    bindLogin();
  });
})();
