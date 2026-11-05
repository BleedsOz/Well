import { h, toast, keyedDebounce, modal, progress } from "./ui.js";
import {
  SLOTS, slotLabel, itemsMacros, itemMacros, sum, stepFor, unitLabel, roundAmount,
  fitToTarget, planDayFor, fmt, toISODate, addDays, prettyDate,
} from "./nutrition.js";

export async function mountClient(root, api, profile) {
  const state = {
    foods: new Map(),
    meals: [],
    date: toISODate(new Date()),
    sels: {}, // slot → { meal_id, items, done, saved }
  };

  const [foods, meals] = await Promise.all([api.listFoods(), api.listMeals(profile.id)]);
  foods.forEach((f) => state.foods.set(f.id, f));
  state.meals = meals;

  const mealById = (id) => state.meals.find((m) => m.id === id);
  const mealFor = (day, slot) => state.meals.find((m) => m.day === day && m.slot === slot);
  const planDays = () => profile.plan_days || 7;
  const hasPlan = () => state.meals.some((m) => m.items?.length);

  const persist = keyedDebounce(async (slot, date) => {
    const s = state.sels[slot];
    if (date !== state.date || !s) return;
    try {
      await api.saveSelection({
        client_id: profile.id, date, slot, meal_id: s.meal_id ?? null, items: s.items, done: !!s.done,
      });
      s.saved = true;
      setStatus("Αποθηκεύτηκε ✓");
    } catch (e) {
      toast(e.message, "error");
    }
  }, 500);

  function defaultSel(slot) {
    const m = mealFor(planDayFor(state.date, planDays()), slot);
    return { meal_id: m?.id ?? null, items: structuredClone(m?.items ?? []), done: false, saved: false };
  }

  function change(slot, patch) {
    Object.assign(state.sels[slot], patch);
    setStatus("Αποθήκευση…");
    persist(slot + state.date, slot, state.date);
    render();
  }

  async function loadDate(date) {
    state.date = date;
    const rows = await api.listSelections(profile.id, date, date);
    state.sels = {};
    for (const { key } of SLOTS) {
      const r = rows.find((x) => x.slot === key);
      state.sels[key] = r
        ? { meal_id: r.meal_id, items: r.items || [], done: r.done, saved: true }
        : defaultSel(key);
    }
    render();
  }

  let statusEl;
  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  function sourceLabel(sel, slot) {
    const m = sel.meal_id && mealById(sel.meal_id);
    if (!m) return null;
    const today = planDayFor(state.date, planDays());
    if (m.day === today && m.slot === slot) return null;
    return m.slot === slot ? `από Ημέρα ${m.day}` : `${slotLabel(m.slot)} · Ημέρα ${m.day}`;
  }

  function isCustom(sel, slot) {
    const def = defaultSel(slot);
    return sel.meal_id !== def.meal_id || JSON.stringify(sel.items) !== JSON.stringify(def.items);
  }

  function openPicker(slot) {
    let showAll = false;
    const list = h("div", { class: "picker" });
    const draw = () => {
      list.replaceChildren();
      const options = state.meals
        .filter((m) => m.items?.length && (showAll || m.slot === slot))
        .sort((a, b) => a.day - b.day || SLOTS.findIndex((s) => s.key === a.slot) - SLOTS.findIndex((s) => s.key === b.slot));
      if (!options.length) list.append(h("p", { class: "muted" }, "Δεν υπάρχουν άλλα γεύματα."));
      for (const m of options) {
        const mac = itemsMacros(m.items, state.foods);
        const current = state.sels[slot].meal_id === m.id;
        list.append(h("button", {
          class: "picker__opt" + (current ? " is-current" : ""),
          onclick: () => {
            close();
            change(slot, { meal_id: m.id, items: structuredClone(m.items) });
          },
        },
          h("span", { class: "picker__tag" }, `Ημέρα ${m.day}${showAll || m.slot !== slot ? " · " + slotLabel(m.slot) : ""}`),
          h("span", { class: "picker__items" }, m.items.map((it) => describe(it)).join(" · ")),
          h("span", { class: "picker__kcal" }, `${fmt(mac.kcal)} kcal · Π ${fmt(mac.protein)}g`)));
      }
    };
    const toggle = h("label", { class: "switch" },
      h("input", { type: "checkbox", onchange: (e) => { showAll = e.target.checked; draw(); } }),
      " Δείξε γεύματα και από άλλες ώρες της ημέρας");
    draw();
    const close = modal(`Διάλεξε ${slotLabel(slot).toLowerCase()}`, [toggle, list]);
  }

  function describe(it) {
    const f = state.foods.get(it.food_id);
    if (!f) return "—";
    return `${f.name} ${fmt(it.amount, 1)}${f.unit === "piece" ? " τεμ." : "g"}`;
  }

  function itemRow(slot, it, idx) {
    const f = state.foods.get(it.food_id);
    const sel = state.sels[slot];
    const set = (amount) => {
      const items = sel.items.map((x, i) => (i === idx ? { ...x, amount: roundAmount(amount, f) } : x));
      change(slot, { items });
    };
    const step = stepFor(f);
    return h("li", { class: "item" + (it.amount === 0 ? " item--zero" : "") },
      h("span", { class: "item__name" }, f?.name ?? "Τρόφιμο που διαγράφηκε"),
      h("div", { class: "stepper" },
        h("button", { "aria-label": "Λιγότερο", "data-fk": `${slot}-${idx}-m`, disabled: sel.done, onclick: () => set(it.amount - step) }, "−"),
        h("input", {
          type: "number", inputmode: "decimal", min: 0, step, value: it.amount, disabled: sel.done,
          "aria-label": `Ποσότητα ${f?.name ?? ""}`, "data-fk": `${slot}-${idx}-i`,
          onchange: (e) => set(Number(e.target.value) || 0),
        }),
        h("button", { "aria-label": "Περισσότερο", "data-fk": `${slot}-${idx}-p`, disabled: sel.done, onclick: () => set(it.amount + step) }, "+"),
        h("span", { class: "stepper__unit" }, unitLabel(f))),
      h("span", { class: "item__kcal" }, `${fmt(itemMacros(f, it.amount).kcal)} kcal`));
  }

  function slotCard({ key, label }) {
    const sel = state.sels[key];
    const mac = itemsMacros(sel.items, state.foods);
    const src = sourceLabel(sel, key);
    const custom = isCustom(sel, key);
    return h("article", { class: "meal" + (sel.done ? " meal--done" : "") },
      h("header", { class: "meal__head" },
        h("div", {},
          h("h3", {}, label),
          src ? h("span", { class: "chip" }, src) : null),
        h("label", { class: "done-toggle" },
          h("input", { type: "checkbox", checked: sel.done, "data-fk": `${key}-done`, onchange: (e) => change(key, { done: e.target.checked }) }),
          h("span", {}, "Το έφαγα"))),
      sel.items.length
        ? h("ul", { class: "items" }, sel.items.map((it, i) => itemRow(key, it, i)))
        : h("p", { class: "muted meal__empty" }, "Δεν έχει οριστεί γεύμα."),
      h("footer", { class: "meal__foot" },
        h("span", { class: "macros" },
          h("strong", {}, `${fmt(mac.kcal)} kcal`),
          ` · Π ${fmt(mac.protein)}g · Υ ${fmt(mac.carbs)}g · Λ ${fmt(mac.fat)}g`),
        h("div", { class: "meal__actions" },
          custom ? h("button", {
            class: "link-btn", disabled: sel.done,
            onclick: async () => {
              state.sels[key] = defaultSel(key);
              render();
              try {
                await api.deleteSelection(profile.id, state.date, key);
                setStatus("Επαναφέρθηκε ✓");
              } catch (e) { toast(e.message, "error"); }
            },
          }, "Επαναφορά") : null,
          h("button", { class: "btn btn--small btn--ghost", disabled: sel.done, onclick: () => openPicker(key) }, "Άλλαξε γεύμα"))));
  }

  function applyWholeDay(day) {
    for (const { key } of SLOTS) {
      const s = state.sels[key];
      if (s.done) continue;
      const m = mealFor(day, key);
      state.sels[key] = { meal_id: m?.id ?? null, items: structuredClone(m?.items ?? []), done: false };
      persist(key + state.date, key, state.date);
    }
    setStatus("Αποθήκευση…");
    render();
  }

  function fitDay() {
    const fitted = fitToTarget(SLOTS.map(({ key }) => state.sels[key]), profile.kcal, state.foods);
    SLOTS.forEach(({ key }, i) => {
      if (state.sels[key].items !== fitted[i].items) {
        state.sels[key] = { ...state.sels[key], items: fitted[i].items };
        persist(key + state.date, key, state.date);
      }
    });
    setStatus("Αποθήκευση…");
    toast("Οι ποσότητες προσαρμόστηκαν στον στόχο θερμίδων");
    render();
  }

  function render() {
    const focusKey = document.activeElement?.dataset?.fk;
    const total = sum(SLOTS.map(({ key }) => itemsMacros(state.sels[key].items, state.foods)));
    const today = planDayFor(state.date, planDays());
    statusEl = h("span", { class: "save-status", "aria-live": "polite" });

    root.replaceChildren(
      h("section", { class: "panel hello" },
        h("div", {},
          h("p", { class: "eyebrow" }, "Το πρόγραμμά μου"),
          h("h1", {}, "Γεια σου 👋")),
        profile.notes ? h("div", { class: "note" }, h("strong", {}, "Σημείωση από τη διατροφολόγο: "), profile.notes) : null),

      h("section", { class: "panel daybar" },
        h("div", { class: "datenav" },
          h("button", { class: "icon-btn", "aria-label": "Προηγούμενη ημέρα", onclick: () => loadDate(addDays(state.date, -1)) }, "‹"),
          h("div", { class: "datenav__label" },
            h("strong", {}, prettyDate(state.date)),
            state.date !== toISODate(new Date())
              ? h("button", { class: "link-btn", onclick: () => loadDate(toISODate(new Date())) }, "Σήμερα")
              : h("span", { class: "muted" }, "Σήμερα")),
          h("button", { class: "icon-btn", "aria-label": "Επόμενη ημέρα", onclick: () => loadDate(addDays(state.date, 1)) }, "›")),
        hasPlan() ? h("label", { class: "dayselect" },
          "Πρόγραμμα ημέρας:",
          h("select", { onchange: (e) => applyWholeDay(Number(e.target.value)) },
            Array.from({ length: planDays() }, (_, i) => i + 1).map((d) =>
              h("option", { value: d, selected: d === today }, `Ημέρα ${d}${d === today ? " (προτεινόμενη)" : ""}`)))) : null),

      !hasPlan()
        ? h("section", { class: "panel empty" },
            h("h2", {}, "Το πρόγραμμά σου ετοιμάζεται 🌱"),
            h("p", { class: "muted" }, "Μόλις η διατροφολόγος σου περάσει το πρόγραμμα, θα το βρεις εδώ."))
        : h("div", { class: "client-grid" },
            h("aside", { class: "panel totals" },
              h("h2", {}, "Σύνολο ημέρας"),
              progress("Θερμίδες", total.kcal, profile.kcal, "kcal"),
              progress("Πρωτεΐνη", total.protein, profile.protein, "g"),
              progress("Υδατάνθρακες", total.carbs, profile.carbs, "g"),
              progress("Λιπαρά", total.fat, profile.fat, "g"),
              profile.kcal ? h("button", { class: "btn btn--full", onclick: fitDay }, "Προσάρμοσε ποσότητες στον στόχο") : null,
              h("p", { class: "hint" }, "Άλλαξε ποσότητες με τα − / +, ή πάτα το κουμπί για να προσαρμοστούν αυτόματα τα γεύματα που δεν έχεις φάει ακόμα."),
              statusEl),
            h("div", { class: "meals" }, SLOTS.map(slotCard))));

    if (focusKey) root.querySelector(`[data-fk="${focusKey}"]`)?.focus();
  }

  await loadDate(state.date);
}
