import { h } from "./ui.js";
import { SLOTS, itemsMacros, sum, fmt, formatAmount } from "./nutrition.js";

/** Γεμίζει το #print-area και ανοίγει τον διάλογο εκτύπωσης (από εκεί «Αποθήκευση ως PDF»). */
function printNodes(title, nodes) {
  let area = document.getElementById("print-area");
  if (!area) {
    area = h("div", { id: "print-area" });
    document.body.append(area);
  }
  area.replaceChildren(
    h("header", { class: "print-head" },
      h("img", { src: new URL("../../assets/logo.svg", import.meta.url).href, alt: "" }),
      h("div", {}, h("strong", {}, "wellness.lab"), h("span", {}, "διατροφή | υγεία | ευεξία"))),
    h("h1", {}, title),
    ...[nodes].flat(Infinity).filter(Boolean));
  const prevTitle = document.title;
  document.title = title;
  document.body.classList.add("is-printing");
  const done = () => {
    document.body.classList.remove("is-printing");
    document.title = prevTitle;
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  // μικρή καθυστέρηση ώστε να φορτώσουν οι εικόνες
  setTimeout(() => window.print(), 150);
}

const itemLine = (it, foodsById) => {
  const f = foodsById.get(it.food_id);
  return f ? `${f.name} — ${formatAmount(f, it.amount)}` : "—";
};

/** Πρόγραμμα διατροφής: όλες οι ημέρες, στόχοι, συνταγές. */
export function printPlan({ client, meals, foodsById }) {
  const days = client.plan_days || 7;
  const mealOf = (d, s) => meals.find((m) => m.day === d && m.slot === s);
  const targets = [
    ["Θερμίδες", client.kcal, "kcal"], ["Πρωτεΐνη", client.protein, "g"],
    ["Υδατάνθρακες", client.carbs, "g"], ["Λιπαρά", client.fat, "g"],
  ].filter(([, v]) => v);

  const dayBlocks = [];
  for (let d = 1; d <= days; d++) {
    const dayMeals = SLOTS.map((s) => ({ slot: s, meal: mealOf(d, s.key) }));
    if (!dayMeals.some((x) => x.meal?.items?.length)) continue;
    const tot = sum(dayMeals.map((x) => itemsMacros(x.meal?.items ?? [], foodsById)));
    dayBlocks.push(h("section", { class: "print-day" },
      h("h2", {}, `Ημέρα ${d}`, h("small", {}, ` · ${fmt(tot.kcal)} kcal · Π ${fmt(tot.protein)}g · Υ ${fmt(tot.carbs)}g · Λ ${fmt(tot.fat)}g`)),
      h("table", {},
        h("tbody", {}, dayMeals.map(({ slot, meal }) => {
          const mac = itemsMacros(meal?.items ?? [], foodsById);
          return h("tr", {},
            h("th", {}, slot.label),
            h("td", {},
              meal?.title ? h("strong", {}, meal.title) : null,
              h("ul", {}, (meal?.items ?? []).map((it) => h("li", {}, itemLine(it, foodsById))))),
            h("td", { class: "num" }, meal?.items?.length ? `${fmt(mac.kcal)} kcal` : ""));
        })))));
  }

  const recipes = meals
    .filter((m) => m.recipe || m.photo_url || m.recipe_url)
    .sort((a, b) => a.day - b.day || SLOTS.findIndex((s) => s.key === a.slot) - SLOTS.findIndex((s) => s.key === b.slot));

  printNodes(`Πρόγραμμα διατροφής — ${client.full_name || client.email || ""}`, [
    targets.length ? h("p", { class: "print-targets" }, "Ημερήσιοι στόχοι: ", targets.map(([l, v, u]) => `${l} ${fmt(v)} ${u}`).join(" · ")) : null,
    client.notes ? h("p", { class: "print-note" }, client.notes) : null,
    dayBlocks.length ? dayBlocks : h("p", {}, "Δεν έχει οριστεί πρόγραμμα."),
    recipes.length ? h("section", { class: "print-recipes" },
      h("h2", {}, "Συνταγές"),
      recipes.map((m) => h("article", { class: "print-recipe" },
        h("h3", {}, m.title || `${SLOTS.find((s) => s.key === m.slot)?.label} · Ημέρα ${m.day}`),
        m.photo_url ? h("img", { src: m.photo_url, alt: "" }) : null,
        m.recipe ? h("p", {}, m.recipe) : null,
        m.recipe_url ? h("p", { class: "print-link" }, `Συνταγή: ${m.recipe_url}`) : null))) : null,
    h("p", { class: "print-foot" }, `Εκτυπώθηκε ${new Date().toLocaleDateString("el-GR")}`),
  ]);
}

/** Λίστα για ψώνια. groups: [{ category, items: [{ food, amount }] }] */
export function printShopping({ title, groups }) {
  printNodes(title, groups.map((g) => h("section", { class: "print-shop" },
    h("h2", {}, g.category),
    h("ul", {}, g.items.map(({ food, amount }) => h("li", {}, h("span", { class: "box" }), `${food.name} — ${formatAmount(food, amount)}`))))));
}
