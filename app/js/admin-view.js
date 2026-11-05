import { h, toast, keyedDebounce, progress } from "./ui.js";
import {
  SLOTS, itemsMacros, itemMacros, sum, stepFor, unitLabel, fmt, kcalFromMacros,
  toISODate, addDays, prettyDate,
} from "./nutrition.js";

export async function mountAdmin(root, api) {
  const state = {
    tab: "clients",
    clients: [],
    foods: [],
    foodsById: new Map(),
    clientId: null,
    clientTab: "plan",
    meals: [],
    day: 1,
    search: "",
    foodSearch: "",
  };

  const setFoods = (list) => {
    state.foods = list;
    state.foodsById = new Map(list.map((f) => [f.id, f]));
  };

  const [clients, foods] = await Promise.all([api.listClients(), api.listFoods()]);
  state.clients = clients;
  setFoods(foods);

  const client = () => state.clients.find((c) => c.id === state.clientId);
  const mealOf = (day, slot) => state.meals.find((m) => m.day === day && m.slot === slot);

  const saveMeal = keyedDebounce(async (meal) => {
    try {
      const saved = await api.saveMeal(meal);
      const existing = mealOf(meal.day, meal.slot);
      if (existing) existing.id = saved.id;
      toast("Το πρόγραμμα αποθηκεύτηκε");
    } catch (e) {
      toast(e.message, "error");
    }
  }, 700);

  const saveFood = keyedDebounce(async (food) => {
    try {
      const saved = await api.saveFood(food);
      Object.assign(state.foodsById.get(food.id) || {}, saved);
      toast("Το τρόφιμο αποθηκεύτηκε");
    } catch (e) {
      toast(e.message, "error");
    }
  }, 700);

  async function selectClient(id) {
    state.clientId = id;
    state.day = 1;
    state.meals = id ? await api.listMeals(id) : [];
    render();
  }

  function setMealItems(day, slot, items) {
    let m = mealOf(day, slot);
    if (!m) state.meals.push((m = { client_id: state.clientId, day, slot, items }));
    m.items = items;
    saveMeal(`${state.clientId}-${day}-${slot}`, { client_id: state.clientId, day, slot, items });
    render();
  }

  // ───────────── Στόχοι ─────────────
  function targetsCard(c) {
    const form = h("form", {
      class: "targets",
      onsubmit: async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const num = (k) => (fd.get(k) === "" ? null : Math.round(Number(fd.get(k))));
        const patch = {
          kcal: num("kcal"), protein: num("protein"), carbs: num("carbs"), fat: num("fat"),
          plan_days: Math.min(14, Math.max(1, num("plan_days") || 7)),
          notes: String(fd.get("notes") || ""),
        };
        try {
          Object.assign(c, await api.updateClient(c.id, patch));
          if (state.day > c.plan_days) state.day = 1;
          toast("Οι στόχοι αποθηκεύτηκαν");
          render();
        } catch (err) {
          toast(err.message, "error");
        }
      },
    });
    const field = (name, label, unit, extra = {}) =>
      h("label", { class: "field" },
        h("span", {}, label),
        h("div", { class: "field__input" },
          h("input", { name, type: "number", min: 0, value: c[name] ?? "", inputmode: "numeric", ...extra }),
          unit ? h("em", {}, unit) : null));
    const calc = h("p", { class: "hint" });
    const updateCalc = () => {
      const fd = new FormData(form);
      const k = kcalFromMacros(+fd.get("protein"), +fd.get("carbs"), +fd.get("fat"));
      calc.textContent = k ? `Από τα μακροθρεπτικά βγαίνουν ≈ ${fmt(k)} kcal (4 / 4 / 9 kcal ανά g).` : "";
    };
    form.addEventListener("input", updateCalc);
    form.append(
      h("div", { class: "targets__grid" },
        field("kcal", "Θερμίδες", "kcal"),
        field("protein", "Πρωτεΐνη", "g"),
        field("carbs", "Υδατάνθρακες", "g"),
        field("fat", "Λιπαρά", "g"),
        field("plan_days", "Ημέρες προγράμματος", "", { min: 1, max: 14 })),
      calc,
      h("label", { class: "field" },
        h("span", {}, "Σημείωση για τον πελάτη"),
        h("textarea", { name: "notes", rows: 2, placeholder: "π.χ. 2 λίτρα νερό, περπάτημα 30'…" }, c.notes || "")),
      h("button", { class: "btn", type: "submit" }, "Αποθήκευση στόχων"));
    updateCalc();
    return h("section", { class: "panel" }, h("h2", {}, "Στόχοι"), form);
  }

  // ───────────── Πρόγραμμα ─────────────
  function foodSelect(value, onchange) {
    return h("select", { class: "food-select", onchange: (e) => onchange(e.target.value), "aria-label": "Τρόφιμο" },
      value ? null : h("option", { value: "" }, "Διάλεξε τρόφιμο…"),
      state.foods.map((f) => h("option", { value: f.id, selected: f.id === value }, f.name)));
  }

  function planSlot(day, { key, label }) {
    const items = mealOf(day, key)?.items ?? [];
    const mac = itemsMacros(items, state.foodsById);
    const update = (idx, patch) => setMealItems(day, key, items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
    return h("article", { class: "meal meal--edit" },
      h("header", { class: "meal__head" }, h("h3", {}, label),
        h("span", { class: "macros" }, h("strong", {}, `${fmt(mac.kcal)} kcal`), ` · Π ${fmt(mac.protein)} · Υ ${fmt(mac.carbs)} · Λ ${fmt(mac.fat)}`)),
      h("ul", { class: "items" },
        items.map((it, idx) => {
          const f = state.foodsById.get(it.food_id);
          return h("li", { class: "item item--edit" },
            foodSelect(it.food_id, (id) => update(idx, { food_id: id })),
            h("div", { class: "field__input field__input--sm" },
              h("input", {
                type: "number", min: 0, step: stepFor(f), value: it.amount, "aria-label": "Ποσότητα",
                onchange: (e) => update(idx, { amount: Math.max(0, Number(e.target.value) || 0) }),
              }),
              h("em", {}, unitLabel(f))),
            h("span", { class: "item__kcal" }, `${fmt(itemMacros(f, it.amount).kcal)} kcal`),
            h("button", { class: "icon-btn icon-btn--sm", "aria-label": "Αφαίρεση", onclick: () => setMealItems(day, key, items.filter((_, i) => i !== idx)) }, "✕"));
        })),
      h("div", { class: "add-item" },
        foodSelect("", (id) => {
          if (!id) return;
          const f = state.foodsById.get(id);
          setMealItems(day, key, [...items, { food_id: id, amount: f.unit === "piece" ? 1 : 100 }]);
        })));
  }

  function planCard(c) {
    const days = c.plan_days || 7;
    const day = Math.min(state.day, days);
    const totals = sum(SLOTS.map((s) => itemsMacros(mealOf(day, s.key)?.items ?? [], state.foodsById)));
    const copyFrom = (src) => {
      for (const s of SLOTS) setMealItems(day, s.key, structuredClone(mealOf(src, s.key)?.items ?? []));
      toast(`Αντιγράφηκε η Ημέρα ${src} στην Ημέρα ${day}`);
    };
    return h("section", { class: "panel" },
      h("div", { class: "panel__head" },
        h("h2", {}, "Πρόγραμμα διατροφής"),
        days > 1 ? h("label", { class: "dayselect" }, "Αντιγραφή από:",
          h("select", { onchange: (e) => e.target.value && copyFrom(Number(e.target.value)) },
            h("option", { value: "" }, "—"),
            Array.from({ length: days }, (_, i) => i + 1).filter((d) => d !== day).map((d) => h("option", { value: d }, `Ημέρα ${d}`)))) : null),
      h("div", { class: "tabs tabs--days", role: "tablist" },
        Array.from({ length: days }, (_, i) => i + 1).map((d) =>
          h("button", { role: "tab", "aria-selected": String(d === day), class: d === day ? "is-active" : "", onclick: () => { state.day = d; render(); } }, `Ημέρα ${d}`))),
      h("div", { class: "plan-grid" },
        h("div", { class: "meals" }, SLOTS.map((s) => planSlot(day, s))),
        h("aside", { class: "totals totals--inline" },
          h("h3", {}, `Σύνολο Ημέρας ${day}`),
          progress("Θερμίδες", totals.kcal, c.kcal, "kcal"),
          progress("Πρωτεΐνη", totals.protein, c.protein, "g"),
          progress("Υδατάνθρακες", totals.carbs, c.carbs, "g"),
          progress("Λιπαρά", totals.fat, c.fat, "g"),
          h("p", { class: "hint" }, "Οι αλλαγές αποθηκεύονται αυτόματα. Ο πελάτης βλέπει την Ημέρα 1 τη Δευτέρα, την Ημέρα 2 την Τρίτη κ.ο.κ. (κυκλικά), και μπορεί να διαλέξει γεύματα από οποιαδήποτε ημέρα."))));
  }

  // ───────────── Ημερολόγιο πελάτη ─────────────
  function diaryCard(c) {
    const box = h("section", { class: "panel" }, h("h2", {}, "Τι έφαγε τις τελευταίες 14 ημέρες"), h("p", { class: "muted" }, "Φόρτωση…"));
    const to = toISODate(new Date());
    const from = addDays(to, -13);
    api.listSelections(c.id, from, to).then((rows) => {
      const byDate = new Map();
      rows.forEach((r) => byDate.set(r.date, [...(byDate.get(r.date) || []), r]));
      const table = h("table", { class: "table" },
        h("thead", {}, h("tr", {}, ["Ημερομηνία", "Θερμίδες", "Πρωτεΐνη", "Γεύματα που έφαγε", "Αλλαγές"].map((t) => h("th", {}, t)))),
        h("tbody", {},
          Array.from({ length: 14 }, (_, i) => addDays(to, -i)).map((d) => {
            const list = byDate.get(d) || [];
            const done = list.filter((r) => r.done);
            const mac = sum(done.map((r) => itemsMacros(r.items, state.foodsById)));
            return h("tr", {},
              h("td", {}, prettyDate(d)),
              h("td", {}, done.length ? `${fmt(mac.kcal)}${c.kcal ? " / " + fmt(c.kcal) : ""}` : "—"),
              h("td", {}, done.length ? `${fmt(mac.protein)} g` : "—"),
              h("td", {}, `${done.length} / ${SLOTS.length}`),
              h("td", {}, list.length ? `${list.length} γεύματα` : "—"));
          })));
      box.replaceChildren(box.firstChild,
        h("p", { class: "hint" }, "Οι θερμίδες μετράνε μόνο τα γεύματα που ο πελάτης σημείωσε «Το έφαγα»."),
        h("div", { class: "table-wrap" }, table));
    }).catch((e) => box.append(h("p", { class: "error" }, e.message)));
    return box;
  }

  // ───────────── Πελάτες ─────────────
  function clientsTab() {
    const q = state.search.trim().toLowerCase();
    const list = state.clients.filter((c) => !q || `${c.full_name} ${c.email}`.toLowerCase().includes(q));
    const signupLink = location.href.split("#")[0] + "#register";
    const c = client();
    return h("div", { class: "admin-grid" },
      h("aside", { class: "panel clients" },
        h("h2", {}, `Πελάτες (${state.clients.length})`),
        h("input", {
          type: "search", placeholder: "Αναζήτηση…", value: state.search, "data-fk": "client-search",
          oninput: (e) => { state.search = e.target.value; render(); },
        }),
        h("ul", { class: "clients__list" },
          list.map((x) => h("li", {},
            h("button", { class: x.id === state.clientId ? "is-active" : "", onclick: () => selectClient(x.id) },
              h("strong", {}, x.full_name || x.email),
              h("small", {}, x.kcal ? `${fmt(x.kcal)} kcal` : "χωρίς στόχους"))))),
        h("div", { class: "invite" },
          h("p", {}, h("strong", {}, "Νέος πελάτης; "), "Στείλε του αυτόν τον σύνδεσμο για να φτιάξει λογαριασμό:"),
          h("div", { class: "copy" },
            h("input", { readOnly: true, value: signupLink, onfocus: (e) => e.target.select() }),
            h("button", {
              class: "btn btn--small",
              onclick: () => navigator.clipboard?.writeText(signupLink).then(() => toast("Αντιγράφηκε!"), () => toast("Αντέγραψέ το χειροκίνητα", "error")),
            }, "Αντιγραφή")))),
      h("div", { class: "client-detail" },
        !c
          ? h("section", { class: "panel empty" }, h("h2", {}, "Διάλεξε πελάτη"), h("p", { class: "muted" }, "Επίλεξε πελάτη από τη λίστα για να ορίσεις στόχους και πρόγραμμα."))
          : [
              h("div", { class: "client-head" },
                h("div", {}, h("h1", {}, c.full_name || c.email), h("p", { class: "muted" }, c.email)),
                h("div", { class: "tabs" },
                  [["plan", "Στόχοι & πρόγραμμα"], ["diary", "Ημερολόγιο"]].map(([k, l]) =>
                    h("button", { class: state.clientTab === k ? "is-active" : "", onclick: () => { state.clientTab = k; render(); } }, l)))),
              state.clientTab === "plan" ? [targetsCard(c), planCard(c)] : diaryCard(c),
            ]));
  }

  // ───────────── Τρόφιμα ─────────────
  function foodsTab() {
    const q = state.foodSearch.trim().toLowerCase();
    const list = state.foods.filter((f) => !q || f.name.toLowerCase().includes(q));
    const numCell = (f, k) => h("td", {}, h("input", {
      type: "number", min: 0, step: "0.1", value: f[k], "aria-label": k,
      onchange: (e) => { f[k] = Math.max(0, Number(e.target.value) || 0); saveFood(f.id, { ...f }); },
    }));
    return h("section", { class: "panel" },
      h("div", { class: "panel__head" },
        h("h2", {}, `Τρόφιμα (${state.foods.length})`),
        h("div", { class: "row" },
          h("input", { type: "search", placeholder: "Αναζήτηση…", value: state.foodSearch, "data-fk": "food-search", oninput: (e) => { state.foodSearch = e.target.value; render(); } }),
          h("button", {
            class: "btn btn--small",
            onclick: async () => {
              try {
                const f = await api.saveFood({ name: "Νέο τρόφιμο", unit: "g", kcal: 0, protein: 0, carbs: 0, fat: 0 });
                setFoods([f, ...state.foods]);
                state.foodSearch = "";
                render();
                root.querySelector(".foods-table tbody input")?.select();
              } catch (e) { toast(e.message, "error"); }
            },
          }, "+ Νέο τρόφιμο"))),
      h("p", { class: "hint" }, "Οι τιμές είναι ανά 100 g για τρόφιμα σε γραμμάρια, ή ανά τεμάχιο. Οι αρχικές τιμές είναι ενδεικτικές — διόρθωσέ τες όπως θέλεις. Οι αλλαγές αποθηκεύονται αυτόματα."),
      h("div", { class: "table-wrap" },
        h("table", { class: "table foods-table" },
          h("thead", {}, h("tr", {}, ["Όνομα", "Μονάδα", "kcal", "Πρωτ. g", "Υδατ. g", "Λιπ. g", ""].map((t) => h("th", {}, t)))),
          h("tbody", {}, list.map((f) => h("tr", {},
            h("td", {}, h("input", { value: f.name, "aria-label": "Όνομα", onchange: (e) => { f.name = e.target.value.trim() || f.name; saveFood(f.id, { ...f }); } })),
            h("td", {}, h("select", { onchange: (e) => { f.unit = e.target.value; saveFood(f.id, { ...f }); } },
              h("option", { value: "g", selected: f.unit === "g" }, "ανά 100 g"),
              h("option", { value: "piece", selected: f.unit === "piece" }, "ανά τεμάχιο"))),
            numCell(f, "kcal"), numCell(f, "protein"), numCell(f, "carbs"), numCell(f, "fat"),
            h("td", {}, h("button", {
              class: "icon-btn icon-btn--sm", "aria-label": `Διαγραφή ${f.name}`,
              onclick: async () => {
                if (!confirm(`Διαγραφή «${f.name}»;`)) return;
                try {
                  await api.deleteFood(f.id);
                  setFoods(state.foods.filter((x) => x.id !== f.id));
                  render();
                } catch (e) { toast(e.message, "error"); }
              },
            }, "✕"))))))));
  }

  function render() {
    const focusKey = document.activeElement?.dataset?.fk;
    root.replaceChildren(
      h("div", { class: "tabs tabs--main" },
        [["clients", "Πελάτες"], ["foods", "Τρόφιμα"]].map(([k, l]) =>
          h("button", { class: state.tab === k ? "is-active" : "", onclick: () => { state.tab = k; render(); } }, l))),
      state.tab === "clients" ? clientsTab() : foodsTab());
    if (focusKey) {
      const el = root.querySelector(`[data-fk="${focusKey}"]`);
      if (el) { el.focus(); el.setSelectionRange?.(el.value.length, el.value.length); }
    }
  }

  render();
}
