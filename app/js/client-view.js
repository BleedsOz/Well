import { h, toast, keyedDebounce, modal, progress } from "./ui.js";
import {
  SLOTS, slotLabel, itemsMacros, itemMacros, sum, stepFor, unitLabel, roundAmount,
  fitToTarget, planDayFor, fmt, toISODate, addDays, prettyDate, equivalentAmount,
  shoppingList, formatAmount, startOfWeek,
} from "./nutrition.js";
import { progressSection } from "./progress.js";
import { printPlan, printShopping } from "./print.js";

const WATER_GLASS = 250; // ml
const WATER_GOAL = 2000; // ml

export async function mountClient(root, api, profile) {
  const state = {
    tab: "today",
    foods: new Map(),
    meals: [],
    date: toISODate(new Date()),
    sels: {}, // slot → { meal_id, items, done }
    log: { water_ml: 0, notes: "" },
    week: startOfWeek(toISODate(new Date())),
    measurements: null,
  };

  const [foods, meals] = await Promise.all([api.listFoods(), api.listMeals(profile.id)]);
  foods.forEach((f) => state.foods.set(f.id, f));
  state.meals = meals;

  const mealById = (id) => state.meals.find((m) => m.id === id);
  const mealFor = (day, slot) => state.meals.find((m) => m.day === day && m.slot === slot);
  const planDays = () => profile.plan_days || 7;
  const hasPlan = () => state.meals.some((m) => m.items?.length);

  let statusEl;
  const setStatus = (text) => statusEl && (statusEl.textContent = text);

  const persist = keyedDebounce(async (slot, date) => {
    const s = state.sels[slot];
    if (date !== state.date || !s) return;
    try {
      await api.saveSelection({ client_id: profile.id, date, slot, meal_id: s.meal_id ?? null, items: s.items, done: !!s.done });
      setStatus("Αποθηκεύτηκε ✓");
    } catch (e) { toast(e.message, "error"); }
  }, 500);

  const persistLog = keyedDebounce(async (date) => {
    if (date !== state.date) return;
    try {
      await api.saveDayLog({ client_id: profile.id, date, water_ml: state.log.water_ml, notes: state.log.notes });
      setStatus("Αποθηκεύτηκε ✓");
    } catch (e) { toast(e.message, "error"); }
  }, 600);

  function defaultSel(slot, date = state.date) {
    const m = mealFor(planDayFor(date, planDays()), slot);
    return { meal_id: m?.id ?? null, items: structuredClone(m?.items ?? []), done: false };
  }

  function change(slot, patch) {
    Object.assign(state.sels[slot], patch);
    setStatus("Αποθήκευση…");
    persist(slot + state.date, slot, state.date);
    render();
  }

  async function loadDate(date) {
    state.date = date;
    const [rows, logs] = await Promise.all([
      api.listSelections(profile.id, date, date),
      api.listDayLogs(profile.id, date, date),
    ]);
    state.sels = {};
    for (const { key } of SLOTS) {
      const r = rows.find((x) => x.slot === key);
      state.sels[key] = r ? { meal_id: r.meal_id, items: r.items || [], done: r.done } : defaultSel(key);
    }
    state.log = { water_ml: logs[0]?.water_ml ?? 0, notes: logs[0]?.notes ?? "" };
    render();
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

  const describe = (it) => {
    const f = state.foods.get(it.food_id);
    return f ? `${f.name} ${formatAmount(f, it.amount)}` : "—";
  };

  // ───────────── Διάλογοι ─────────────

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
        list.append(h("button", {
          class: "picker__opt" + (state.sels[slot].meal_id === m.id ? " is-current" : ""),
          onclick: () => { close(); change(slot, { meal_id: m.id, items: structuredClone(m.items) }); },
        },
          h("span", { class: "picker__tag" }, `Ημέρα ${m.day}${showAll || m.slot !== slot ? " · " + slotLabel(m.slot) : ""}`),
          m.title ? h("strong", {}, m.title) : null,
          h("span", { class: "picker__items" }, m.items.map(describe).join(" · ")),
          h("span", { class: "picker__kcal" }, `${fmt(mac.kcal)} kcal · Π ${fmt(mac.protein)}g`)));
      }
    };
    const toggle = h("label", { class: "switch" },
      h("input", { type: "checkbox", onchange: (e) => { showAll = e.target.checked; draw(); } }),
      " Δείξε γεύματα και από άλλες ώρες της ημέρας");
    draw();
    const close = modal(`Διάλεξε ${slotLabel(slot).toLowerCase()}`, [toggle, list]);
  }

  function openSwap(slot, idx) {
    const sel = state.sels[slot];
    const it = sel.items[idx];
    const from = state.foods.get(it.food_id);
    if (!from) return;
    let by = from.protein * (from.unit === "piece" ? 1 : 0.01) * it.amount >= 8 ? "protein" : "kcal";
    let showAll = false;
    const list = h("div", { class: "picker" });
    const draw = () => {
      const candidates = [...state.foods.values()]
        .filter((f) => f.id !== from.id && (showAll || !from.category || f.category === from.category))
        .sort((a, b) => a.name.localeCompare(b.name, "el"));
      list.replaceChildren(...(candidates.length ? candidates.map((f) => {
        const amount = equivalentAmount(from, it.amount, f, by);
        const mac = itemMacros(f, amount);
        return h("button", {
          class: "picker__opt picker__opt--row",
          onclick: () => {
            close();
            change(slot, { items: sel.items.map((x, i) => (i === idx ? { food_id: f.id, amount } : x)) });
            toast(`${from.name} → ${f.name}`);
          },
        },
          h("span", {}, h("strong", {}, f.name), h("span", { class: "picker__kcal" }, ` · ${formatAmount(f, amount)}`)),
          h("span", { class: "picker__kcal" }, `${fmt(mac.kcal)} kcal · Π ${fmt(mac.protein)}g`));
      }) : [h("p", { class: "muted" }, "Δεν υπάρχουν άλλα τρόφιμα σε αυτή την κατηγορία.")]));
    };
    const fromMac = itemMacros(from, it.amount);
    const head = h("div", { class: "swap-head" },
      h("p", {}, "Αντί για ", h("strong", {}, `${from.name} ${formatAmount(from, it.amount)}`),
        ` (${fmt(fromMac.kcal)} kcal · Π ${fmt(fromMac.protein)}g), διάλεξε ισοδύναμο:`),
      h("div", { class: "seg", role: "radiogroup", "aria-label": "Ισοδυναμία με βάση" },
        [["kcal", "Ίδιες θερμίδες"], ["protein", "Ίδια πρωτεΐνη"]].map(([k, l]) =>
          h("label", {}, h("input", { type: "radio", name: "by", value: k, checked: by === k, onchange: () => { by = k; draw(); } }), h("span", {}, l)))),
      from.category ? h("label", { class: "switch" },
        h("input", { type: "checkbox", onchange: (e) => { showAll = e.target.checked; draw(); } }),
        ` Δείξε όλα τα τρόφιμα (όχι μόνο «${from.category}»)`) : null);
    draw();
    const close = modal("Ισοδύναμο τρόφιμο", [head, list]);
  }

  function openRecipe(meal) {
    modal(meal.title || "Συνταγή", h("div", { class: "recipe" },
      meal.photo_url ? h("img", { src: meal.photo_url, alt: meal.title || "", class: "recipe__img" }) : null,
      meal.recipe ? h("p", { class: "recipe__text" }, meal.recipe) : null));
  }

  // ───────────── Σήμερα ─────────────

  function itemRow(slot, it, idx) {
    const f = state.foods.get(it.food_id);
    const sel = state.sels[slot];
    const set = (amount) => change(slot, { items: sel.items.map((x, i) => (i === idx ? { ...x, amount: roundAmount(amount, f) } : x)) });
    const step = stepFor(f);
    return h("li", { class: "item item--client" + (it.amount === 0 ? " item--zero" : "") },
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
      h("span", { class: "item__kcal" }, `${fmt(itemMacros(f, it.amount).kcal)} kcal`),
      h("button", {
        class: "icon-btn icon-btn--sm swap-btn", title: "Ισοδύναμο τρόφιμο", "aria-label": `Αλλαγή ${f?.name ?? ""} με ισοδύναμο`,
        disabled: sel.done || !f, onclick: () => openSwap(slot, idx),
      }, "⇄"));
  }

  function slotCard({ key, label }) {
    const sel = state.sels[key];
    const mac = itemsMacros(sel.items, state.foods);
    const src = sourceLabel(sel, key);
    const meal = sel.meal_id && mealById(sel.meal_id);
    const hasRecipe = meal && (meal.recipe || meal.photo_url);
    return h("article", { class: "meal" + (sel.done ? " meal--done" : "") },
      h("header", { class: "meal__head" },
        h("div", {},
          h("h3", {}, label),
          src ? h("span", { class: "chip" }, src) : null),
        h("label", { class: "done-toggle" },
          h("input", { type: "checkbox", checked: sel.done, "data-fk": `${key}-done`, onchange: (e) => change(key, { done: e.target.checked }) }),
          h("span", {}, "Το έφαγα"))),
      meal?.title ? h("p", { class: "meal__title" }, meal.title) : null,
      sel.items.length
        ? h("ul", { class: "items" }, sel.items.map((it, i) => itemRow(key, it, i)))
        : h("p", { class: "muted meal__empty" }, "Δεν έχει οριστεί γεύμα."),
      h("footer", { class: "meal__foot" },
        h("span", { class: "macros" }, h("strong", {}, `${fmt(mac.kcal)} kcal`), ` · Π ${fmt(mac.protein)}g · Υ ${fmt(mac.carbs)}g · Λ ${fmt(mac.fat)}g`),
        h("div", { class: "meal__actions" },
          hasRecipe ? h("button", { class: "link-btn", onclick: () => openRecipe(meal) }, "Συνταγή") : null,
          isCustom(sel, key) ? h("button", {
            class: "link-btn", disabled: sel.done,
            onclick: async () => {
              state.sels[key] = defaultSel(key);
              render();
              try { await api.deleteSelection(profile.id, state.date, key); setStatus("Επαναφέρθηκε ✓"); }
              catch (e) { toast(e.message, "error"); }
            },
          }, "Επαναφορά") : null,
          h("button", { class: "btn btn--small btn--ghost", disabled: sel.done, onclick: () => openPicker(key) }, "Άλλαξε γεύμα"))));
  }

  function applyWholeDay(day) {
    for (const { key } of SLOTS) {
      if (state.sels[key].done) continue;
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

  function waterPanel() {
    const glasses = Math.round(state.log.water_ml / WATER_GLASS);
    const total = Math.max(8, glasses + 1);
    const setWater = (ml) => {
      state.log.water_ml = Math.max(0, Math.min(10000, ml));
      setStatus("Αποθήκευση…");
      persistLog(state.date, state.date);
      render();
    };
    return h("section", { class: "panel daylog" },
      h("div", { class: "daylog__water" },
        h("div", { class: "daylog__head" },
          h("h2", {}, "Νερό"),
          h("span", { class: "muted" }, h("strong", {}, `${fmt(state.log.water_ml / 1000, 2)} L`), ` / ${fmt(WATER_GOAL / 1000, 1)} L`)),
        h("div", { class: "glasses", role: "group", "aria-label": "Ποτήρια νερού (250 ml)" },
          Array.from({ length: total }, (_, i) => h("button", {
            class: "glass" + (i < glasses ? " is-full" : ""),
            "aria-label": `${i + 1} ποτήρια`, "aria-pressed": String(i < glasses), "data-fk": `glass-${i}`,
            onclick: () => setWater((i + 1 === glasses ? i : i + 1) * WATER_GLASS),
          }, h("span", {})))),
        h("p", { class: "hint" }, "Κάθε ποτήρι = 250 ml. Πάτα για να προσθέσεις ή να αφαιρέσεις.")),
      h("label", { class: "field daylog__notes" },
        h("span", {}, "Σημειώσεις ημέρας"),
        h("textarea", {
          rows: 3, placeholder: "π.χ. ένιωθα φούσκωμα μετά το μεσημεριανό, κοιμήθηκα λίγο…", "data-fk": "day-notes",
          oninput: (e) => { state.log.notes = e.target.value; setStatus("Αποθήκευση…"); persistLog(state.date, state.date); },
        }, state.log.notes)));
  }

  function todayView() {
    const total = sum(SLOTS.map(({ key }) => itemsMacros(state.sels[key].items, state.foods)));
    const today = planDayFor(state.date, planDays());
    statusEl = h("span", { class: "save-status", "aria-live": "polite" });
    return [
      h("section", { class: "panel daybar" },
        h("div", { class: "datenav" },
          h("button", { class: "icon-btn", "aria-label": "Προηγούμενη ημέρα", onclick: () => loadDate(addDays(state.date, -1)) }, "‹"),
          h("div", { class: "datenav__label" },
            h("strong", {}, prettyDate(state.date)),
            state.date !== toISODate(new Date())
              ? h("button", { class: "link-btn", onclick: () => loadDate(toISODate(new Date())) }, "Σήμερα")
              : h("span", { class: "muted" }, "Σήμερα")),
          h("button", { class: "icon-btn", "aria-label": "Επόμενη ημέρα", onclick: () => loadDate(addDays(state.date, 1)) }, "›")),
        hasPlan() ? h("div", { class: "row" },
          h("label", { class: "dayselect" }, "Πρόγραμμα ημέρας:",
            h("select", { onchange: (e) => applyWholeDay(Number(e.target.value)) },
              Array.from({ length: planDays() }, (_, i) => i + 1).map((d) =>
                h("option", { value: d, selected: d === today }, `Ημέρα ${d}${d === today ? " (προτεινόμενη)" : ""}`)))),
          h("button", { class: "btn btn--small btn--ghost", onclick: () => printPlan({ client: profile, meals: state.meals, foodsById: state.foods }) }, "Εκτύπωση / PDF")) : null),

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
              h("p", { class: "hint" }, "Άλλαξε ποσότητες με τα − / +, άλλαξε τρόφιμο με το ⇄, ή πάτα το κουμπί για να προσαρμοστούν αυτόματα τα γεύματα που δεν έχεις φάει ακόμα."),
              statusEl),
            h("div", { class: "meals" }, SLOTS.map(slotCard))),
      waterPanel(),
    ];
  }

  // ───────────── Ψώνια ─────────────

  function shopKey() { return `wl-shop-${profile.id}-${state.week}`; }
  function loadChecked() {
    try { return new Set(JSON.parse(localStorage.getItem(shopKey()) || "[]")); } catch { return new Set(); }
  }
  function saveChecked(set) {
    try { localStorage.setItem(shopKey(), JSON.stringify([...set])); } catch {}
  }

  async function shoppingView() {
    const box = h("section", { class: "panel" }, h("p", { class: "loading" }, "Φόρτωση…"));
    const from = state.week, to = addDays(state.week, 6);
    const rows = await api.listSelections(profile.id, from, to);
    const lists = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(from, i);
      for (const { key } of SLOTS) {
        const r = rows.find((x) => x.date === date && x.slot === key);
        lists.push(r ? r.items : defaultSel(key, date).items);
      }
    }
    const list = shoppingList(lists, state.foods);
    const groups = [];
    for (const x of list) {
      const cat = x.food.category || "Άλλα";
      (groups.find((g) => g.category === cat) || (groups.push({ category: cat, items: [] }), groups.at(-1))).items.push(x);
    }
    const checked = loadChecked();
    const label = `${new Date(from + "T12:00:00").toLocaleDateString("el-GR", { day: "numeric", month: "short" })} – ${new Date(to + "T12:00:00").toLocaleDateString("el-GR", { day: "numeric", month: "short" })}`;
    const asText = () => groups.map((g) => `${g.category}\n` + g.items.map(({ food, amount }) => `- ${food.name}: ${formatAmount(food, amount)}`).join("\n")).join("\n\n");

    box.replaceChildren(...[
      h("div", { class: "panel__head" },
        h("h2", {}, "Λίστα για ψώνια"),
        h("div", { class: "datenav" },
          h("button", { class: "icon-btn", "aria-label": "Προηγούμενη εβδομάδα", onclick: () => { state.week = addDays(state.week, -7); render(); } }, "‹"),
          h("strong", { class: "week-label" }, label),
          h("button", { class: "icon-btn", "aria-label": "Επόμενη εβδομάδα", onclick: () => { state.week = addDays(state.week, 7); render(); } }, "›"))),
      h("p", { class: "hint" }, "Η λίστα βγαίνει από τα γεύματα που έχεις διαλέξει για κάθε μέρα της εβδομάδας (ή από το πρόγραμμα, όπου δεν έχεις αλλάξει κάτι), με τις ποσότητές τους."),
      !list.length ? h("p", { class: "muted" }, "Δεν υπάρχουν γεύματα για αυτή την εβδομάδα.") : [
        h("div", { class: "shop" }, groups.map((g) => h("div", { class: "shop__group" },
          h("h3", {}, g.category),
          h("ul", {}, g.items.map(({ food, amount }) => h("li", {},
            h("label", { class: "shop__item" + (checked.has(food.id) ? " is-checked" : "") },
              h("input", {
                type: "checkbox", checked: checked.has(food.id),
                onchange: (e) => {
                  e.target.checked ? checked.add(food.id) : checked.delete(food.id);
                  saveChecked(checked);
                  e.target.closest(".shop__item").classList.toggle("is-checked", e.target.checked);
                },
              }),
              h("span", {}, food.name),
              h("span", { class: "shop__amt" }, formatAmount(food, amount))))))))),
        h("div", { class: "row shop__actions" },
          h("button", {
            class: "btn btn--small",
            onclick: async () => {
              const text = `Ψώνια ${label}\n\n${asText()}`;
              if (navigator.share) { try { await navigator.share({ title: "Λίστα για ψώνια", text }); return; } catch {} }
              navigator.clipboard?.writeText(text).then(() => toast("Η λίστα αντιγράφηκε"), () => toast("Δεν ήταν δυνατή η αντιγραφή", "error"));
            },
          }, "Κοινοποίηση / αντιγραφή"),
          h("button", { class: "btn btn--small btn--ghost", onclick: () => printShopping({ title: `Λίστα για ψώνια · ${label}`, groups }) }, "Εκτύπωση"),
          checked.size ? h("button", { class: "link-btn", onclick: () => { saveChecked(new Set()); render(); } }, "Καθάρισμα σημαδιών") : null),
      ],
    ].flat(Infinity).filter(Boolean));
    return box;
  }

  // ───────────── Πρόοδος ─────────────

  async function progressView() {
    if (!state.measurements) state.measurements = await api.listMeasurements(profile.id);
    return progressSection({
      api, clientId: profile.id, role: "client", measurements: state.measurements,
      onChanged: (list) => { state.measurements = list; },
    });
  }

  // ───────────── Render ─────────────

  let renderToken = 0;
  async function render() {
    const token = ++renderToken;
    const focusKey = document.activeElement?.dataset?.fk;
    const head = [
      h("section", { class: "panel hello" },
        h("div", { class: "hello__top" },
          h("div", {}, h("p", { class: "eyebrow" }, "Το πρόγραμμά μου"), h("h1", {}, "Γεια σου 👋")),
          h("div", { class: "tabs", role: "tablist" },
            [["today", "Σήμερα"], ["progress", "Πρόοδος"], ["shopping", "Ψώνια"]].map(([k, l]) =>
              h("button", { role: "tab", "aria-selected": String(state.tab === k), class: state.tab === k ? "is-active" : "", onclick: () => { state.tab = k; render(); } }, l)))),
        profile.notes ? h("div", { class: "note" }, h("strong", {}, "Σημείωση από τη διατροφολόγο: "), profile.notes) : null),
    ];
    let body;
    if (state.tab === "today") body = todayView();
    else {
      root.replaceChildren(...head, h("p", { class: "loading" }, "Φόρτωση…"));
      try {
        body = state.tab === "progress" ? await progressView() : await shoppingView();
      } catch (e) {
        body = h("section", { class: "panel" }, h("p", { class: "error" }, e.message));
      }
      if (token !== renderToken) return;
    }
    root.replaceChildren(...head, ...[body].flat(Infinity).filter(Boolean));
    if (focusKey) root.querySelector(`[data-fk="${focusKey}"]`)?.focus();
  }

  await loadDate(state.date);
}
