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

// ───────────── Ισοδύναμα τρόφιμα ─────────────

/**
 * Πόσο από το toFood δίνει τις ίδιες θερμίδες (by='kcal') ή την ίδια πρωτεΐνη (by='protein')
 * με fromAmount από το fromFood. Αν η πρωτεΐνη του στόχου είναι ~0, γυρνά σε θερμίδες.
 */
export function equivalentAmount(fromFood, fromAmount, toFood, by = "kcal") {
  const src = itemMacros(fromFood, fromAmount);
  let key = by;
  if (key === "protein" && (!(toFood.protein > 0) || !(src.protein > 0))) key = "kcal";
  const perUnit = toFood.unit === "piece" ? toFood[key] : toFood[key] / 100;
  if (!(perUnit > 0)) return roundAmount(fromAmount, toFood);
  const raw = src[key] / perUnit;
  const r = roundAmount(raw, toFood);
  return r === 0 && raw > 0 ? stepFor(toFood) : r;
}

// ───────────── Πρόταση θερμίδων ─────────────

export const ACTIVITY_LEVELS = [
  { value: 1.2, label: "Καθιστική ζωή" },
  { value: 1.375, label: "Ελαφριά (1–3 φορές/εβδ.)" },
  { value: 1.55, label: "Μέτρια (3–5 φορές/εβδ.)" },
  { value: 1.725, label: "Έντονη (6–7 φορές/εβδ.)" },
  { value: 1.9, label: "Πολύ έντονη / αθλητής" },
];
export const GOALS = [
  { value: "lose", label: "Απώλεια βάρους", factor: 0.85, proteinPerKg: 1.8 },
  { value: "maintain", label: "Διατήρηση", factor: 1, proteinPerKg: 1.4 },
  { value: "gain", label: "Αύξηση μυϊκής μάζας", factor: 1.1, proteinPerKg: 1.8 },
];

/** Mifflin-St Jeor BMR. */
export function mifflinBMR({ sex, weight, height, age }) {
  if (!weight || !height || !age || !sex) return null;
  return 10 * weight + 6.25 * height - 5 * age + (sex === "male" ? 5 : -161);
}

/** Katch-McArdle BMR από άλιπη μάζα (όταν υπάρχει λιπομέτρηση). */
export function katchBMR({ weight, fatPct }) {
  if (!weight || !fatPct) return null;
  return 370 + 21.6 * weight * (1 - fatPct / 100);
}

/**
 * Πρόταση στόχων. Επιστρέφει { bmr, tdee, kcal, protein, carbs, fat, method } ή null.
 * Λιπαρά 30% των θερμίδων, πρωτεΐνη ανά kg ανάλογα με τον στόχο, υδατάνθρακες το υπόλοιπο.
 */
export function suggestTargets({ sex, weight, height, age, activity = 1.375, goal = "maintain", fatPct }) {
  const katch = katchBMR({ weight, fatPct });
  const bmr = katch ?? mifflinBMR({ sex, weight, height, age });
  if (!bmr) return null;
  const g = GOALS.find((x) => x.value === goal) || GOALS[1];
  const tdee = bmr * (activity || 1.375);
  const kcal = Math.round((tdee * g.factor) / 10) * 10;
  const protein = Math.round(weight * g.proteinPerKg);
  const fat = Math.round((kcal * 0.3) / 9);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return {
    bmr: Math.round(bmr), tdee: Math.round(tdee), kcal, protein, carbs, fat,
    method: katch ? "Katch-McArdle (από λιπομέτρηση)" : "Mifflin-St Jeor",
  };
}

// ───────────── Λίστα για ψώνια ─────────────

/** lists: πίνακας από πίνακες items. Επιστρέφει [{ food, amount }] ταξινομημένα ανά κατηγορία/όνομα. */
export function shoppingList(lists, foodsById) {
  const totals = new Map();
  for (const items of lists)
    for (const it of items || []) {
      if (!(it.amount > 0)) continue;
      totals.set(it.food_id, (totals.get(it.food_id) || 0) + it.amount);
    }
  return [...totals]
    .map(([id, amount]) => ({ food: foodsById.get(id), amount }))
    .filter((x) => x.food)
    .sort((a, b) =>
      (a.food.category || "~").localeCompare(b.food.category || "~", "el") ||
      a.food.name.localeCompare(b.food.name, "el"));
}

export function formatAmount(food, amount) {
  if (food.unit === "piece") return `${fmt(amount, 1)} τεμ.`;
  return amount >= 1000 ? `${fmt(amount / 1000, 2)} kg` : `${fmt(amount)} g`;
}

// ───────────── Μετρήσεις σώματος ─────────────

export const METRICS = [
  { key: "weight", label: "Βάρος", unit: "kg", digits: 1 },
  { key: "fat_pct", label: "Λίπος", unit: "%", digits: 1 },
  { key: "fat_kg", label: "Λιπώδης μάζα", unit: "kg", digits: 1 },
  { key: "muscle_kg", label: "Μυϊκή μάζα", unit: "kg", digits: 1 },
  { key: "water_pct", label: "Νερό σώματος", unit: "%", digits: 1 },
  { key: "visceral_fat", label: "Σπλαχνικό λίπος", unit: "", digits: 1 },
  { key: "bone_kg", label: "Οστική μάζα", unit: "kg", digits: 1 },
  { key: "bmr", label: "Βασικός μεταβολισμός", unit: "kcal", digits: 0 },
  { key: "metabolic_age", label: "Μεταβολική ηλικία", unit: "έτη", digits: 0 },
  { key: "bmi", label: "ΔΜΣ (BMI)", unit: "", digits: 1 },
  { key: "waist_cm", label: "Περιφέρεια μέσης", unit: "cm", digits: 1 },
  { key: "hip_cm", label: "Περιφέρεια γοφών", unit: "cm", digits: 1 },
];

export function startOfWeek(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  return addDays(dateStr, -((d.getDay() + 6) % 7));
}
