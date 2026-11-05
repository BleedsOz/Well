// Καθαρές συναρτήσεις υπολογισμών — χωρίς DOM, για να δοκιμάζονται εύκολα.

export const SLOTS = [
  { key: "breakfast", label: "Πρωινό" },
  { key: "snack1", label: "Δεκατιανό" },
  { key: "lunch", label: "Μεσημεριανό" },
  { key: "snack2", label: "Απογευματινό" },
  { key: "dinner", label: "Βραδινό" },
];
export const slotLabel = (key) => SLOTS.find((s) => s.key === key)?.label ?? key;

export const MACROS = [
  { key: "kcal", label: "Θερμίδες", unit: "kcal" },
  { key: "protein", label: "Πρωτεΐνη", unit: "g" },
  { key: "carbs", label: "Υδατάνθρακες", unit: "g" },
  { key: "fat", label: "Λιπαρά", unit: "g" },
];

export const zero = () => ({ kcal: 0, protein: 0, carbs: 0, fat: 0 });

/** Μακροθρεπτικά για ποσότητα τροφίμου (g για unit 'g', τεμάχια για 'piece'). */
export function itemMacros(food, amount) {
  if (!food) return zero();
  const f = food.unit === "piece" ? amount : amount / 100;
  return {
    kcal: food.kcal * f,
    protein: food.protein * f,
    carbs: food.carbs * f,
    fat: food.fat * f,
  };
}

export function sum(list) {
  return list.reduce((acc, m) => {
    for (const k in acc) acc[k] += m[k] || 0;
    return acc;
  }, zero());
}

export function itemsMacros(items, foodsById) {
  return sum((items || []).map((it) => itemMacros(foodsById.get(it.food_id), it.amount)));
}

/** Βήμα ποσότητας: 5 g για γραμμάρια, μισό τεμάχιο για τεμάχια. */
export const stepFor = (food) => (food?.unit === "piece" ? 0.5 : 5);
export const unitLabel = (food) => (food?.unit === "piece" ? "τεμ." : "g");

export function roundAmount(amount, food) {
  const step = stepFor(food);
  return Math.max(0, Math.round(amount / step) * step);
}

export function scaleItems(items, factor, foodsById) {
  return items.map((it) => {
    const food = foodsById.get(it.food_id);
    const scaled = roundAmount(it.amount * factor, food);
    // μην μηδενίζεις κάτι που υπήρχε: κράτα τουλάχιστον ένα βήμα
    return { ...it, amount: it.amount > 0 && scaled === 0 ? stepFor(food) : scaled };
  });
}

/**
 * Κλιμακώνει τα γεύματα που δεν έχουν φαγωθεί ακόμα ώστε οι θερμίδες της ημέρας
 * να πλησιάσουν τον στόχο. meals: [{ items, done }]. Επιστρέφει νέο πίνακα.
 */
export function fitToTarget(meals, targetKcal, foodsById) {
  if (!targetKcal) return meals;
  const fixed = sum(meals.filter((m) => m.done).map((m) => itemsMacros(m.items, foodsById))).kcal;
  const flexible = sum(meals.filter((m) => !m.done).map((m) => itemsMacros(m.items, foodsById))).kcal;
  if (flexible <= 0) return meals;
  const factor = Math.max(0, targetKcal - fixed) / flexible;
  // όρια ασφαλείας ώστε να μη βγαίνουν παράλογες μερίδες
  const f = Math.min(2, Math.max(0.5, factor));
  return meals.map((m) => (m.done ? m : { ...m, items: scaleItems(m.items, f, foodsById) }));
}

/** Ποια ημέρα του προγράμματος αντιστοιχεί σε μια ημερομηνία (Δευτέρα = Ημέρα 1, κυκλικά). */
export function planDayFor(dateStr, planDays) {
  const d = new Date(dateStr + "T12:00:00");
  const weekday = (d.getDay() + 6) % 7; // Δευτέρα = 0
  return (weekday % Math.max(1, planDays)) + 1;
}

export const fmt = (n, digits = 0) =>
  Number(n || 0).toLocaleString("el-GR", { maximumFractionDigits: digits, minimumFractionDigits: 0 });

export function toISODate(d) {
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

export function addDays(dateStr, n) {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function prettyDate(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("el-GR", { weekday: "long", day: "numeric", month: "long" });
}

/** kcal από μακροθρεπτικά (4/4/9). */
export const kcalFromMacros = (p, c, f) => (p || 0) * 4 + (c || 0) * 4 + (f || 0) * 9;
