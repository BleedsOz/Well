import { h, toast, keyedDebounce, progress, modal } from "./ui.js";
import {
  SLOTS, slotLabel, itemsMacros, itemMacros, sum, stepFor, unitLabel, fmt, kcalFromMacros,
  toISODate, addDays, prettyDate, suggestTargets, ACTIVITY_LEVELS, GOALS, scaleItems,
} from "./nutrition.js";
import { progressSection } from "./progress.js";
import { printPlan } from "./print.js";
import { parseCSV, detectColumns, toMeasurements, readFileText, IMPORT_FIELDS, norm } from "./bodycomp.js";

export async function mountAdmin(root, api) {
  const state = {
    tab: "clients",
    clients: [],
    foods: [],
    foodsById: new Map(),
    templates: [],
    clientId: null,
    clientTab: "plan",
    meals: [],
    measurements: [],
    day: 1,
    search: "",
    foodSearch: "",
    openRecipe: null, // `${day}-${slot}` του γεύματος με ανοιχτή συνταγή
  };

  const setFoods = (list) => {
    state.foods = list;
    state.foodsById = new Map(list.map((f) => [f.id, f]));
  };

  const [clients, foods, templates] = await Promise.all([api.listClients(), api.listFoods(), api.listTemplates()]);
  state.clients = clients;
  state.templates = templates;
  setFoods(foods);

  const client = () => state.clients.find((c) => c.id === state.clientId);
  const mealOf = (day, slot) => state.meals.find((m) => m.day === day && m.slot === slot);
  const latest = (key) => [...state.measurements].reverse().find((m) => m[key] != null)?.[key] ?? null;

  const saveMeal = keyedDebounce(async (meal) => {
    try {
      const saved = await api.saveMeal(meal);
      const existing = mealOf(meal.day, meal.slot);
      if (existing) existing.id = saved.id;
      toast("Το πρόγραμμα αποθηκεύτηκε");
    } catch (e) { toast(e.message, "error"); }
  }, 700);

  const saveFood = keyedDebounce(async (food) => {
    try {
      const saved = await api.saveFood(food);
      Object.assign(state.foodsById.get(food.id) || {}, saved);
      toast("Το τρόφιμο αποθηκεύτηκε");
    } catch (e) { toast(e.message, "error"); }
  }, 700);

  async function selectClient(id) {
    state.clientId = id;
    state.day = 1;
    state.openRecipe = null;
    [state.meals, state.measurements] = id
      ? await Promise.all([api.listMeals(id), api.listMeasurements(id)])
      : [[], []];
    render();
  }

  /** Αλλάζει πεδία ενός γεύματος (items, title, recipe, photo_url) και αποθηκεύει. */
  function setMeal(day, slot, patch, { rerender = true } = {}) {
    let m = mealOf(day, slot);
    if (!m) state.meals.push((m = { client_id: state.clientId, day, slot, items: [], title: "", recipe: "", photo_url: "", recipe_url: "" }));
    Object.assign(m, patch);
    saveMeal(`${state.clientId}-${day}-${slot}`, {
      client_id: state.clientId, day, slot, items: m.items, title: m.title || "", recipe: m.recipe || "", photo_url: m.photo_url || "", recipe_url: m.recipe_url || "",
    });
    if (rerender) render();
  }

  // ───────────── Στόχοι & στοιχεία ─────────────
  function targetsCard(c) {
    const age = (y) => (y ? new Date().getFullYear() - Number(y) : null);
    const weight = latest("weight");
    const fatPct = latest("fat_pct");
    const suggestBox = h("div", { class: "suggest" });

    const form = h("form", {
      class: "targets",
      onsubmit: async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const num = (k) => (fd.get(k) === "" || fd.get(k) == null ? null : Number(fd.get(k)));
        const int = (k) => (num(k) == null ? null : Math.round(num(k)));
        const patch = {
          kcal: int("kcal"), protein: int("protein"), carbs: int("carbs"), fat: int("fat"),
          plan_days: Math.min(14, Math.max(1, int("plan_days") || 7)),
          notes: String(fd.get("notes") || ""),
          sex: fd.get("sex") || null, birth_year: int("birth_year"), height_cm: num("height_cm"),
          activity: num("activity"), goal: fd.get("goal") || null,
        };
        try {
          Object.assign(c, await api.updateClient(c.id, patch));
          if (state.day > c.plan_days) state.day = 1;
          toast("Αποθηκεύτηκε");
          render();
        } catch (err) { toast(err.message, "error"); }
      },
    });

    const field = (name, label, unit, extra = {}) =>
      h("label", { class: "field" },
        h("span", {}, label),
        h("div", { class: "field__input" },
          h("input", { name, type: "number", min: 0, value: c[name] ?? "", inputmode: "decimal", ...extra }),
          unit ? h("em", {}, unit) : null));
    const select = (name, label, options, value) =>
      h("label", { class: "field" }, h("span", {}, label),
        h("select", { name },
          h("option", { value: "" }, "—"),
          options.map(([v, l]) => h("option", { value: v, selected: String(value ?? "") === String(v) }, l))));

    const calc = h("p", { class: "hint" });
    const update = () => {
      const fd = new FormData(form);
      const k = kcalFromMacros(+fd.get("protein"), +fd.get("carbs"), +fd.get("fat"));
      calc.textContent = k ? `Από τα μακροθρεπτικά βγαίνουν ≈ ${fmt(k)} kcal (4 / 4 / 9 kcal ανά g).` : "";

      const s = suggestTargets({
        sex: fd.get("sex"), weight, height: +fd.get("height_cm"), age: age(fd.get("birth_year")),
        activity: +fd.get("activity") || undefined, goal: fd.get("goal") || "maintain", fatPct,
      });
      if (!weight) {
        suggestBox.replaceChildren(h("p", { class: "hint" }, "Για πρόταση θερμίδων χρειάζεται τουλάχιστον μία μέτρηση βάρους (καρτέλα «Μετρήσεις»)."));
      } else if (!s) {
        suggestBox.replaceChildren(h("p", { class: "hint" }, `Συμπλήρωσε φύλο, έτος γέννησης και ύψος για πρόταση θερμίδων (βάρος: ${fmt(weight, 1)} kg).`));
      } else {
        suggestBox.replaceChildren(
          h("div", {},
            h("strong", {}, `Πρόταση: ${fmt(s.kcal)} kcal · Π ${s.protein}g · Υ ${s.carbs}g · Λ ${s.fat}g`),
            h("p", { class: "hint" }, `Βάρος ${fmt(weight, 1)} kg${fatPct ? `, λίπος ${fmt(fatPct, 1)}%` : ""} · BMR ${fmt(s.bmr)} kcal (${s.method}) · TDEE ${fmt(s.tdee)} kcal. Λιπαρά 30% των θερμίδων, πρωτεΐνη ανά kg σωματικού βάρους.`)),
          h("button", {
            type: "button", class: "btn btn--small btn--ghost",
            onclick: () => {
              for (const k of ["kcal", "protein", "carbs", "fat"]) form.elements[k].value = s[k];
              update();
              toast("Οι τιμές συμπληρώθηκαν — πάτα «Αποθήκευση»");
            },
          }, "Χρήση πρότασης"));
      }
    };
    form.addEventListener("input", update);
    form.addEventListener("change", update);

    form.append(
      h("h3", { class: "sub" }, "Στοιχεία πελάτη"),
      h("div", { class: "targets__grid" },
        select("sex", "Φύλο", [["female", "Γυναίκα"], ["male", "Άνδρας"]], c.sex),
        field("birth_year", "Έτος γέννησης", "", { min: 1920, max: new Date().getFullYear(), step: 1 }),
        field("height_cm", "Ύψος", "cm", { step: 0.5 }),
        select("activity", "Δραστηριότητα", ACTIVITY_LEVELS.map((a) => [a.value, a.label]), c.activity),
        select("goal", "Στόχος", GOALS.map((g) => [g.value, g.label]), c.goal)),
      suggestBox,
      h("h3", { class: "sub" }, "Ημερήσιοι στόχοι"),
      h("div", { class: "targets__grid" },
        field("kcal", "Θερμίδες", "kcal", { step: 1 }),
        field("protein", "Πρωτεΐνη", "g", { step: 1 }),
        field("carbs", "Υδατάνθρακες", "g", { step: 1 }),
        field("fat", "Λιπαρά", "g", { step: 1 }),
        field("plan_days", "Ημέρες προγράμματος", "", { min: 1, max: 14, step: 1 })),
      calc,
      h("label", { class: "field" },
        h("span", {}, "Σημείωση για τον πελάτη"),
        h("textarea", { name: "notes", rows: 2, placeholder: "π.χ. 2 λίτρα νερό, περπάτημα 30'…" }, c.notes || "")),
      h("button", { class: "btn", type: "submit" }, "Αποθήκευση"));
    update();
    return h("section", { class: "panel" }, h("h2", {}, "Στοιχεία & στόχοι"), form);
  }

  // ───────────── Πρόγραμμα ─────────────
  function foodSelect(value, onchange) {
    const cats = [...new Set(state.foods.map((f) => f.category || "Άλλα"))].sort((a, b) => a.localeCompare(b, "el"));
    return h("select", { class: "food-select", onchange: (e) => onchange(e.target.value), "aria-label": "Τρόφιμο" },
      value ? null : h("option", { value: "" }, "+ Πρόσθεσε τρόφιμο…"),
      cats.map((cat) => h("optgroup", { label: cat },
        state.foods.filter((f) => (f.category || "Άλλα") === cat).map((f) => h("option", { value: f.id, selected: f.id === value }, f.name)))));
  }

  async function resizeImage(file, max = 1000) {
    const img = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    return new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.82));
  }

  function recipeEditor(day, key, meal) {
    const photoInput = h("input", {
      type: "file", accept: "image/*", class: "visually-hidden",
      onchange: async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          toast("Ανέβασμα φωτογραφίας…");
          const url = await api.uploadPhoto(await resizeImage(file));
          setMeal(day, key, { photo_url: url });
        } catch (err) { toast(err.message, "error"); }
      },
    });
    return h("div", { class: "recipe-edit" },
      h("label", { class: "field" }, h("span", {}, "Σύνδεσμος συνταγής (π.χ. από site συνταγών)"),
        h("input", {
          type: "url", placeholder: "https://…", value: meal?.recipe_url || "",
          onchange: (e) => {
            const v = e.target.value.trim();
            if (v && !/^https?:\/\//i.test(v)) return toast("Ο σύνδεσμος πρέπει να ξεκινά με https://", "error");
            setMeal(day, key, { recipe_url: v }, { rerender: false });
          },
        })),
      h("label", { class: "field" }, h("span", {}, "Οδηγίες / συνταγή (δικό σου κείμενο)"),
        h("textarea", {
          rows: 4, placeholder: "Υλικά, τρόπος παρασκευής…",
          oninput: (e) => setMeal(day, key, { recipe: e.target.value }, { rerender: false }),
        }, meal?.recipe || "")),
      h("div", { class: "recipe-edit__photo" },
        meal?.photo_url ? h("img", { src: meal.photo_url, alt: "" }) : null,
        h("label", { class: "btn btn--small btn--ghost" }, meal?.photo_url ? "Αλλαγή φωτογραφίας" : "Πρόσθεσε φωτογραφία", photoInput),
        meal?.photo_url ? h("button", { type: "button", class: "link-btn", onclick: () => setMeal(day, key, { photo_url: "" }) }, "Αφαίρεση") : null));
  }

  function planSlot(day, { key, label }) {
    const meal = mealOf(day, key);
    const items = meal?.items ?? [];
    const mac = itemsMacros(items, state.foodsById);
    const update = (idx, patch) => setMeal(day, key, { items: items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) });
    const rk = `${day}-${key}`;
    const open = state.openRecipe === rk;
    return h("article", { class: "meal meal--edit" },
      h("header", { class: "meal__head" }, h("h3", {}, label),
        h("span", { class: "macros" }, h("strong", {}, `${fmt(mac.kcal)} kcal`), ` · Π ${fmt(mac.protein)} · Υ ${fmt(mac.carbs)} · Λ ${fmt(mac.fat)}`)),
      h("input", {
        class: "meal__title-input", placeholder: "Τίτλος γεύματος (προαιρετικό), π.χ. «Κοτόπουλο λεμονάτο»", value: meal?.title || "",
        "aria-label": `Τίτλος ${label}`,
        oninput: (e) => setMeal(day, key, { title: e.target.value }, { rerender: false }),
      }),
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
            h("button", { class: "icon-btn icon-btn--sm", "aria-label": "Αφαίρεση", onclick: () => setMeal(day, key, { items: items.filter((_, i) => i !== idx) }) }, "✕"));
        })),
      h("div", { class: "add-item" },
        foodSelect("", (id) => {
          if (!id) return;
          const f = state.foodsById.get(id);
          setMeal(day, key, { items: [...items, { food_id: id, amount: f.unit === "piece" ? 1 : 100 }] });
        })),
      h("button", {
        class: "link-btn recipe-toggle", "aria-expanded": String(open),
        onclick: () => { state.openRecipe = open ? null : rk; render(); },
      }, open ? "Κλείσιμο συνταγής" : meal?.recipe || meal?.photo_url || meal?.recipe_url ? "Συνταγή ✓ (επεξεργασία)" : "+ Συνταγή & φωτογραφία"),
      open ? recipeEditor(day, key, meal) : null);
  }

  function saveAsTemplate(c) {
    const name = prompt("Όνομα προτύπου:", `${c.kcal ? fmt(c.kcal) + " kcal · " : ""}${c.plan_days || 7} ημέρες`);
    if (!name) return;
    const meals = state.meals
      .filter((m) => m.day <= (c.plan_days || 7) && (m.items?.length || m.recipe || m.title || m.recipe_url))
      .map(({ day, slot, items, title, recipe, photo_url, recipe_url }) => ({ day, slot, items, title: title || "", recipe: recipe || "", photo_url: photo_url || "", recipe_url: recipe_url || "" }));
    api.saveTemplate({ name, kcal: c.kcal, protein: c.protein, carbs: c.carbs, fat: c.fat, plan_days: c.plan_days || 7, meals })
      .then((t) => { state.templates.push(t); toast(`Αποθηκεύτηκε το πρότυπο «${name}»`); })
      .catch((e) => toast(e.message, "error"));
  }

  function avgDayKcal(t) {
    const days = new Set(t.meals.map((m) => m.day));
    if (!days.size) return 0;
    return sum(t.meals.map((m) => itemsMacros(m.items, state.foodsById))).kcal / days.size;
  }

  function applyTemplateDialog(c) {
    if (!state.templates.length) return toast("Δεν υπάρχουν πρότυπα ακόμα — αποθήκευσε πρώτα ένα πρόγραμμα ως πρότυπο.", "error");
    const form = h("form", { class: "apply-tpl" },
      h("label", { class: "field" }, h("span", {}, "Πρότυπο"),
        h("select", { name: "tpl" }, state.templates.map((t) => h("option", { value: t.id }, `${t.name} (${t.plan_days} ημ.)`)))),
      h("label", { class: "switch" }, h("input", { type: "checkbox", name: "scale", checked: !!c.kcal, disabled: !c.kcal }),
        c.kcal ? ` Κλιμάκωση ποσοτήτων στις θερμίδες του πελάτη (${fmt(c.kcal)} kcal)` : " Κλιμάκωση ποσοτήτων (όρισε πρώτα θερμίδες στον πελάτη)"),
      h("label", { class: "switch" }, h("input", { type: "checkbox", name: "targets", checked: !c.kcal }), " Αντιγραφή και των στόχων του προτύπου στον πελάτη"),
      h("p", { class: "warn" }, "Προσοχή: το τρέχον πρόγραμμα του πελάτη θα αντικατασταθεί."),
      h("button", { class: "btn", type: "submit" }, "Εφαρμογή"));
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const t = state.templates.find((x) => x.id === fd.get("tpl"));
      const copyTargets = !!fd.get("targets");
      const targetKcal = copyTargets ? t.kcal : c.kcal;
      const avg = avgDayKcal(t);
      const factor = fd.get("scale") && targetKcal && avg ? targetKcal / avg : 1;
      const meals = t.meals.map((m) => ({ ...m, items: factor === 1 ? structuredClone(m.items) : scaleItems(m.items, factor, state.foodsById) }));
      try {
        state.meals = await api.replaceMeals(c.id, meals);
        const patch = { plan_days: t.plan_days };
        if (copyTargets) Object.assign(patch, { kcal: t.kcal, protein: t.protein, carbs: t.carbs, fat: t.fat });
        Object.assign(c, await api.updateClient(c.id, patch));
        state.day = 1;
        close();
        toast(`Εφαρμόστηκε το «${t.name}»${factor !== 1 ? ` (κλιμάκωση ×${fmt(factor, 2)})` : ""}`);
        render();
      } catch (err) { toast(err.message, "error"); }
    });
    const close = modal("Εφαρμογή προτύπου", form);
  }

  function planCard(c) {
    const days = c.plan_days || 7;
    const day = Math.min(state.day, days);
    const totals = sum(SLOTS.map((s) => itemsMacros(mealOf(day, s.key)?.items ?? [], state.foodsById)));
    const copyFrom = (src) => {
      for (const s of SLOTS) {
        const m = mealOf(src, s.key);
        setMeal(day, s.key, { items: structuredClone(m?.items ?? []), title: m?.title || "", recipe: m?.recipe || "", photo_url: m?.photo_url || "", recipe_url: m?.recipe_url || "" }, { rerender: false });
      }
      render();
      toast(`Αντιγράφηκε η Ημέρα ${src} στην Ημέρα ${day}`);
    };
    return h("section", { class: "panel" },
      h("div", { class: "panel__head" },
        h("h2", {}, "Πρόγραμμα διατροφής"),
        h("div", { class: "row" },
          h("button", { class: "btn btn--small btn--ghost", onclick: () => applyTemplateDialog(c) }, "Εφαρμογή προτύπου"),
          h("button", { class: "btn btn--small btn--ghost", onclick: () => saveAsTemplate(c) }, "Αποθήκευση ως πρότυπο"),
          h("button", { class: "btn btn--small btn--ghost", onclick: () => printPlan({ client: c, meals: state.meals, foodsById: state.foodsById }) }, "Εκτύπωση / PDF"))),
      h("div", { class: "plan-toolbar" },
        h("div", { class: "tabs tabs--days", role: "tablist" },
          Array.from({ length: days }, (_, i) => i + 1).map((d) =>
            h("button", { role: "tab", "aria-selected": String(d === day), class: d === day ? "is-active" : "", onclick: () => { state.day = d; state.openRecipe = null; render(); } }, `Ημέρα ${d}`))),
        days > 1 ? h("label", { class: "dayselect" }, "Αντιγραφή από:",
          h("select", { onchange: (e) => e.target.value && copyFrom(Number(e.target.value)) },
            h("option", { value: "" }, "—"),
            Array.from({ length: days }, (_, i) => i + 1).filter((d) => d !== day).map((d) => h("option", { value: d }, `Ημέρα ${d}`)))) : null),
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

  // ───────────── Μετρήσεις: εισαγωγή λιπομέτρησης ─────────────
  function importCard(c) {
    const box = h("section", { class: "panel" });
    let parsed = null; // { rows, headerRow, mapping }

    const fileInput = h("input", {
      type: "file", accept: ".csv,.txt,text/csv", class: "visually-hidden",
      onchange: async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (/\.xlsx?$/i.test(file.name)) return toast("Αποθήκευσε πρώτα το αρχείο ως CSV από το Excel (Αρχείο → Αποθήκευση ως → CSV).", "error");
        try { load(await readFileText(file)); } catch (err) { toast(err.message, "error"); }
      },
    });
    const paste = h("textarea", { rows: 3, placeholder: "…ή επικόλλησε εδώ τα δεδομένα (π.χ. αντιγραφή από Excel)" });
    paste.addEventListener("input", () => paste.value.trim() && load(paste.value));

    function load(text) {
      const rows = parseCSV(text);
      if (rows.length < 2) return toast("Δεν βρέθηκαν δεδομένα στο αρχείο.", "error");
      const det = detectColumns(rows);
      parsed = { rows, headerRow: det.headerRow, mapping: det.mapping };
      draw();
    }

    function draw() {
      const parts = [
        h("h2", {}, "Εισαγωγή από πρόγραμμα λιπομέτρησης"),
        h("p", { class: "hint" }, "Από το πρόγραμμα της ζυγαριάς κάνε «Εξαγωγή» σε CSV/Excel και ανέβασε το αρχείο. Οι στήλες αναγνωρίζονται αυτόματα — έλεγξε την αντιστοίχιση πριν την εισαγωγή."),
        h("div", { class: "row" }, h("label", { class: "btn btn--small" }, "Επιλογή αρχείου CSV", fileInput)),
        paste,
      ];
      if (parsed) {
        const header = parsed.rows[parsed.headerRow];
        const options = [["", "— (καμία)"], ...header.map((hd, i) => [String(i), hd || `Στήλη ${i + 1}`])];
        const all = toMeasurements(parsed.rows, parsed.headerRow, parsed.mapping);
        const hasName = parsed.mapping.name != null;
        const target = norm(c.full_name);
        const matchesClient = (m) => !hasName || !target || norm(m.name).includes(target) || target.includes(norm(m.name));
        const existing = new Set(state.measurements.map((m) => `${m.date}|${m.weight ?? ""}`));
        const rows = all.map((m) => ({ m, dup: existing.has(`${m.date}|${m.weight ?? ""}`), checked: matchesClient(m) && !existing.has(`${m.date}|${m.weight ?? ""}`) }));
        const shownFields = IMPORT_FIELDS.filter(([f]) => f !== "date" && f !== "name" && f !== "water_kg" && rows.some((r) => r.m[f] != null));

        parts.push(
          h("details", { class: "mapping", open: !parsed.mapping.date },
            h("summary", {}, `Αντιστοίχιση στηλών (${Object.keys(parsed.mapping).length} αναγνωρίστηκαν)`),
            h("div", { class: "mapping__grid" },
              IMPORT_FIELDS.map(([f, label]) => h("label", { class: "field" }, h("span", {}, label),
                h("select", { onchange: (e) => { if (e.target.value === "") delete parsed.mapping[f]; else parsed.mapping[f] = Number(e.target.value); draw(); } },
                  options.map(([v, l]) => h("option", { value: v, selected: String(parsed.mapping[f] ?? "") === v }, l))))))),
          !parsed.mapping.date ? h("p", { class: "error" }, "Δεν βρέθηκε στήλη ημερομηνίας — διάλεξέ την στην αντιστοίχιση.") : null,
          rows.length ? h("div", { class: "table-wrap" },
            h("table", { class: "table" },
              h("thead", {}, h("tr", {}, h("th", {}, ""), h("th", {}, "Ημερομηνία"), hasName ? h("th", {}, "Όνομα") : null, shownFields.map(([, l]) => h("th", {}, l)))),
              h("tbody", {}, rows.map((r) => h("tr", { class: r.dup ? "is-dup" : "" },
                h("td", {}, h("input", { type: "checkbox", checked: r.checked, "aria-label": "Εισαγωγή γραμμής", onchange: (e) => (r.checked = e.target.checked) })),
                h("td", {}, prettyDate(r.m.date), r.dup ? h("span", { class: "chip chip--soft" }, "υπάρχει ήδη") : null),
                hasName ? h("td", {}, r.m.name) : null,
                shownFields.map(([f]) => h("td", {}, r.m[f] == null ? "—" : fmt(r.m[f], 1)))))))) : h("p", { class: "muted" }, "Δεν βρέθηκαν μετρήσεις με έγκυρη ημερομηνία."),
          hasName ? h("p", { class: "hint" }, `Το αρχείο έχει στήλη ονόματος: προεπιλέχθηκαν οι γραμμές που ταιριάζουν με «${c.full_name}».`) : null,
          rows.length ? h("button", {
            class: "btn",
            onclick: async () => {
              const chosen = rows.filter((r) => r.checked).map(({ m }) => {
                const { name, ...rest } = m;
                return { ...rest, client_id: c.id, source: "import", notes: "" };
              });
              if (!chosen.length) return toast("Δεν επιλέχθηκε καμία γραμμή.", "error");
              try {
                const saved = await api.importMeasurements(chosen);
                state.measurements = [...state.measurements, ...saved].sort((a, b) => a.date.localeCompare(b.date));
                parsed = null;
                toast(`Εισήχθησαν ${saved.length} μετρήσεις`);
                render();
              } catch (err) { toast(err.message, "error"); }
            },
          }, `Εισαγωγή επιλεγμένων στον/στην ${c.full_name || c.email}`) : null);
      }
      box.replaceChildren(...parts.flat(Infinity).filter(Boolean));
    }
    draw();
    return box;
  }

  function measurementsTab(c) {
    return [
      importCard(c),
      progressSection({
        api, clientId: c.id, role: "admin", measurements: state.measurements,
        onChanged: (list) => { state.measurements = list; },
      }),
    ];
  }

  // ───────────── Ημερολόγιο πελάτη ─────────────
  function diaryCard(c) {
    const box = h("section", { class: "panel" }, h("h2", {}, "Τι έφαγε τις τελευταίες 14 ημέρες"), h("p", { class: "muted" }, "Φόρτωση…"));
    const to = toISODate(new Date());
    const from = addDays(to, -13);
    Promise.all([api.listSelections(c.id, from, to), api.listDayLogs(c.id, from, to)]).then(([rows, logs]) => {
      const byDate = new Map();
      rows.forEach((r) => byDate.set(r.date, [...(byDate.get(r.date) || []), r]));
      const logOf = (d) => logs.find((l) => l.date === d);
      const table = h("table", { class: "table diary" },
        h("thead", {}, h("tr", {}, ["Ημερομηνία", "Θερμίδες", "Πρωτεΐνη", "Γεύματα", "Νερό", "Σημειώσεις"].map((t) => h("th", {}, t)))),
        h("tbody", {},
          Array.from({ length: 14 }, (_, i) => addDays(to, -i)).map((d) => {
            const list = byDate.get(d) || [];
            const done = list.filter((r) => r.done);
            const mac = sum(done.map((r) => itemsMacros(r.items, state.foodsById)));
            const log = logOf(d);
            return h("tr", {},
              h("td", {}, prettyDate(d)),
              h("td", {}, done.length ? `${fmt(mac.kcal)}${c.kcal ? " / " + fmt(c.kcal) : ""}` : "—"),
              h("td", {}, done.length ? `${fmt(mac.protein)} g` : "—"),
              h("td", {}, `${done.length} / ${SLOTS.length}`),
              h("td", {}, log?.water_ml ? `${fmt(log.water_ml / 1000, 2)} L` : "—"),
              h("td", { class: "diary__notes" }, log?.notes || "—"));
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
    const tabs = [["plan", "Στόχοι & πρόγραμμα"], ["measure", "Μετρήσεις"], ["diary", "Ημερολόγιο"]];
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
          ? h("section", { class: "panel empty" }, h("h2", {}, "Διάλεξε πελάτη"), h("p", { class: "muted" }, "Επίλεξε πελάτη από τη λίστα για να ορίσεις στόχους, πρόγραμμα και μετρήσεις."))
          : [
              h("div", { class: "client-head" },
                h("div", {}, h("h1", {}, c.full_name || c.email), h("p", { class: "muted" }, c.email)),
                h("div", { class: "tabs" },
                  tabs.map(([k, l]) =>
                    h("button", { class: state.clientTab === k ? "is-active" : "", onclick: () => { state.clientTab = k; render(); } }, l)))),
              state.clientTab === "plan" ? [targetsCard(c), planCard(c)]
                : state.clientTab === "measure" ? measurementsTab(c)
                : diaryCard(c),
            ]));
  }

  // ───────────── Τρόφιμα ─────────────
  function foodsTab() {
    const q = state.foodSearch.trim().toLowerCase();
    const list = state.foods.filter((f) => !q || `${f.name} ${f.category || ""}`.toLowerCase().includes(q));
    const cats = [...new Set(state.foods.map((f) => f.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "el"));
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
                const f = await api.saveFood({ name: "Νέο τρόφιμο", unit: "g", kcal: 0, protein: 0, carbs: 0, fat: 0, category: "" });
                setFoods([f, ...state.foods]);
                state.foodSearch = "";
                render();
                root.querySelector(".foods-table tbody input")?.select();
              } catch (e) { toast(e.message, "error"); }
            },
          }, "+ Νέο τρόφιμο"))),
      h("p", { class: "hint" }, "Οι τιμές είναι ανά 100 g για τρόφιμα σε γραμμάρια, ή ανά τεμάχιο. Η κατηγορία καθορίζει ποια τρόφιμα προτείνονται ως ισοδύναμα στον πελάτη (π.χ. κοτόπουλο ↔ γαλοπούλα ↔ ψάρι). Οι αλλαγές αποθηκεύονται αυτόματα."),
      h("datalist", { id: "food-cats" }, cats.map((c) => h("option", { value: c }))),
      h("div", { class: "table-wrap" },
        h("table", { class: "table foods-table" },
          h("thead", {}, h("tr", {}, ["Όνομα", "Κατηγορία", "Μονάδα", "kcal", "Πρωτ. g", "Υδατ. g", "Λιπ. g", ""].map((t) => h("th", {}, t)))),
          h("tbody", {}, list.map((f) => h("tr", {},
            h("td", {}, h("input", { value: f.name, "aria-label": "Όνομα", onchange: (e) => { f.name = e.target.value.trim() || f.name; saveFood(f.id, { ...f }); } })),
            h("td", {}, h("input", { value: f.category || "", list: "food-cats", "aria-label": "Κατηγορία", class: "cat-input", onchange: (e) => { f.category = e.target.value.trim(); saveFood(f.id, { ...f }); } })),
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

  // ───────────── Πρότυπα ─────────────
  function templatesTab() {
    return h("section", { class: "panel" },
      h("h2", {}, `Πρότυπα προγραμμάτων (${state.templates.length})`),
      h("p", { class: "hint" }, "Για νέο πρότυπο: άνοιξε έναν πελάτη, φτιάξε το πρόγραμμα και πάτα «Αποθήκευση ως πρότυπο». Για να το δώσεις σε άλλον πελάτη: «Εφαρμογή προτύπου» — οι ποσότητες μπορούν να κλιμακωθούν αυτόματα στις θερμίδες του."),
      !state.templates.length ? h("p", { class: "muted" }, "Δεν υπάρχουν πρότυπα ακόμα.") :
        h("ul", { class: "tpl-list" }, state.templates.map((t) => {
          const avg = avgDayKcal(t);
          return h("li", { class: "tpl" },
            h("input", {
              value: t.name, "aria-label": "Όνομα προτύπου",
              onchange: async (e) => {
                const name = e.target.value.trim();
                if (!name) return;
                try { Object.assign(t, await api.saveTemplate({ ...t, name })); toast("Μετονομάστηκε"); } catch (err) { toast(err.message, "error"); }
              },
            }),
            h("span", { class: "muted" }, `${t.plan_days} ημέρες · ~${fmt(avg)} kcal/ημέρα${t.kcal ? ` · στόχος ${fmt(t.kcal)} kcal` : ""}`),
            h("button", {
              class: "icon-btn icon-btn--sm", "aria-label": `Διαγραφή ${t.name}`,
              onclick: async () => {
                if (!confirm(`Διαγραφή του προτύπου «${t.name}»;`)) return;
                try {
                  await api.deleteTemplate(t.id);
                  state.templates = state.templates.filter((x) => x.id !== t.id);
                  render();
                } catch (err) { toast(err.message, "error"); }
              },
            }, "✕"));
        })));
  }

  function render() {
    const focusKey = document.activeElement?.dataset?.fk;
    const main = [["clients", "Πελάτες"], ["foods", "Τρόφιμα"], ["templates", "Πρότυπα"]];
    root.replaceChildren(
      h("div", { class: "tabs tabs--main" },
        main.map(([k, l]) => h("button", { class: state.tab === k ? "is-active" : "", onclick: () => { state.tab = k; render(); } }, l))),
      state.tab === "clients" ? clientsTab() : state.tab === "foods" ? foodsTab() : templatesTab());
    if (focusKey) {
      const el = root.querySelector(`[data-fk="${focusKey}"]`);
      if (el) { el.focus(); el.setSelectionRange?.(el.value.length, el.value.length); }
    }
  }

  render();
}
