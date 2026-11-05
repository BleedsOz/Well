import { h, toast } from "./ui.js";
import { createDemoApi } from "./api-demo.js";

const root = document.getElementById("app");
const userBox = document.getElementById("user-box");

async function createApi() {
  const cfg = window.WELLNESS_CONFIG || {};
  if (cfg.supabaseUrl && cfg.supabaseAnonKey) {
    const { createSupabaseApi } = await import("./api-supabase.js");
    return createSupabaseApi({ url: cfg.supabaseUrl, anonKey: cfg.supabaseAnonKey });
  }
  return createDemoApi();
}

let api;

async function start() {
  try {
    api = await createApi();
  } catch (e) {
    root.replaceChildren(h("section", { class: "panel empty" },
      h("h2", {}, "Δεν ήταν δυνατή η σύνδεση"),
      h("p", { class: "muted" }, "Έλεγξε τη σύνδεσή σου στο internet και δοκίμασε ξανά."),
      h("p", { class: "error" }, e.message)));
    return;
  }
  document.body.classList.toggle("is-demo", api.mode === "demo");
  api.onPasswordRecovery(showNewPassword);
  const profile = await api.getSession().catch(() => null);
  profile ? enter(profile) : showAuth(location.hash === "#register" ? "register" : "login");
}

async function enter(profile) {
  userBox.replaceChildren(
    h("span", { class: "user-box__name" }, profile.full_name || profile.email,
      profile.role === "admin" ? h("span", { class: "chip" }, "admin") : null),
    h("button", {
      class: "btn btn--small btn--ghost",
      onclick: async () => {
        await api.signOut();
        userBox.replaceChildren();
        history.replaceState(null, "", location.pathname);
        showAuth("login");
      },
    }, "Αποσύνδεση"));
  root.replaceChildren(h("p", { class: "loading" }, "Φόρτωση…"));
  try {
    if (profile.role === "admin") {
      const { mountAdmin } = await import("./admin-view.js");
      await mountAdmin(root, api);
    } else {
      const { mountClient } = await import("./client-view.js");
      await mountClient(root, api, profile);
    }
  } catch (e) {
    console.error(e);
    root.replaceChildren(h("section", { class: "panel empty" }, h("h2", {}, "Κάτι πήγε στραβά"), h("p", { class: "error" }, e.message)));
  }
}

function showAuth(mode) {
  const err = h("p", { class: "error", role: "alert" });
  const busy = (form, on) => form.querySelectorAll("button, input").forEach((el) => (el.disabled = on));

  const forms = {
    login: () => {
      const form = h("form", { class: "auth__form" },
        h("label", { class: "field" }, h("span", {}, "Email"), h("input", { name: "email", type: "email", autocomplete: "email", required: true })),
        h("label", { class: "field" }, h("span", {}, "Κωδικός"), h("input", { name: "password", type: "password", autocomplete: "current-password", required: true })),
        err,
        h("button", { class: "btn btn--full", type: "submit" }, "Σύνδεση"),
        h("div", { class: "auth__links" },
          h("button", { type: "button", class: "link-btn", onclick: () => showAuth("forgot") }, "Ξέχασα τον κωδικό μου"),
          h("button", { type: "button", class: "link-btn", onclick: () => showAuth("register") }, "Δεν έχω λογαριασμό")));
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        busy(form, true);
        try {
          enter(await api.signIn(String(fd.get("email")), String(fd.get("password"))));
        } catch (ex) {
          err.textContent = ex.message;
          busy(form, false);
        }
      });
      return form;
    },

    register: () => {
      const form = h("form", { class: "auth__form" },
        h("label", { class: "field" }, h("span", {}, "Ονοματεπώνυμο"), h("input", { name: "name", autocomplete: "name", required: true })),
        h("label", { class: "field" }, h("span", {}, "Email"), h("input", { name: "email", type: "email", autocomplete: "email", required: true })),
        h("label", { class: "field" }, h("span", {}, "Κωδικός (τουλάχιστον 6 χαρακτήρες)"), h("input", { name: "password", type: "password", minLength: 6, autocomplete: "new-password", required: true })),
        err,
        h("button", { class: "btn btn--full", type: "submit" }, "Δημιουργία λογαριασμού"),
        h("div", { class: "auth__links" },
          h("button", { type: "button", class: "link-btn", onclick: () => showAuth("login") }, "Έχω ήδη λογαριασμό")));
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        busy(form, true);
        try {
          const profile = await api.signUp(String(fd.get("name")).trim(), String(fd.get("email")), String(fd.get("password")));
          if (profile) enter(profile);
          else {
            form.replaceChildren(h("p", { class: "success" }, "Σου στείλαμε email επιβεβαίωσης. Πάτα τον σύνδεσμο που περιέχει και μετά συνδέσου."),
              h("button", { type: "button", class: "btn btn--full", onclick: () => showAuth("login") }, "Στη σύνδεση"));
          }
        } catch (ex) {
          err.textContent = ex.message;
          busy(form, false);
        }
      });
      return form;
    },

    forgot: () => {
      const form = h("form", { class: "auth__form" },
        h("p", { class: "muted" }, "Γράψε το email σου και θα σου στείλουμε σύνδεσμο για νέο κωδικό."),
        h("label", { class: "field" }, h("span", {}, "Email"), h("input", { name: "email", type: "email", autocomplete: "email", required: true })),
        err,
        h("button", { class: "btn btn--full", type: "submit" }, "Αποστολή συνδέσμου"),
        h("div", { class: "auth__links" },
          h("button", { type: "button", class: "link-btn", onclick: () => showAuth("login") }, "Πίσω στη σύνδεση")));
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        busy(form, true);
        try {
          await api.resetPassword(String(new FormData(form).get("email")));
          form.replaceChildren(h("p", { class: "success" }, "Έλεγξε το email σου για τον σύνδεσμο αλλαγής κωδικού."));
        } catch (ex) {
          err.textContent = ex.message;
          busy(form, false);
        }
      });
      return form;
    },
  };

  const titles = { login: "Σύνδεση", register: "Νέος λογαριασμός", forgot: "Ξέχασες τον κωδικό;" };

  root.replaceChildren(h("section", { class: "auth" },
    h("div", { class: "auth__card panel" },
      h("img", { src: "../assets/logo.svg", alt: "", class: "auth__logo" }),
      h("h1", {}, titles[mode]),
      forms[mode](),
      api.mode === "demo" && mode === "login" ? demoBox() : null)));
  root.querySelector("input")?.focus();
}

function demoBox() {
  const login = async (email) => {
    try { enter(await api.signIn(email, "demo")); } catch (e) { toast(e.message, "error"); }
  };
  return h("div", { class: "demo-box" },
    h("p", {}, h("strong", {}, "Λειτουργία demo. "), "Δοκίμασε την εφαρμογή με έτοιμους λογαριασμούς (τα δεδομένα μένουν μόνο σε αυτόν τον browser):"),
    h("div", { class: "row" },
      h("button", { class: "btn btn--small", onclick: () => login("admin@demo.gr") }, "Ως διατροφολόγος"),
      h("button", { class: "btn btn--small btn--ghost", onclick: () => login("pelatis@demo.gr") }, "Ως πελάτης")),
    h("button", {
      class: "link-btn",
      onclick: async () => { await api.resetDemo(); toast("Τα δεδομένα demo επαναφέρθηκαν"); },
    }, "Επαναφορά δεδομένων demo"));
}

function showNewPassword() {
  const err = h("p", { class: "error", role: "alert" });
  const form = h("form", { class: "auth__form" },
    h("label", { class: "field" }, h("span", {}, "Νέος κωδικός"), h("input", { name: "password", type: "password", minLength: 6, autocomplete: "new-password", required: true })),
    err,
    h("button", { class: "btn btn--full", type: "submit" }, "Αποθήκευση κωδικού"));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api.updatePassword(String(new FormData(form).get("password")));
      toast("Ο κωδικός άλλαξε");
      enter(await api.getSession());
    } catch (ex) {
      err.textContent = ex.message;
    }
  });
  root.replaceChildren(h("section", { class: "auth" }, h("div", { class: "auth__card panel" }, h("h1", {}, "Νέος κωδικός"), form)));
}

start();
