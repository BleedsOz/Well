// Demo έκδοση του API: τα δεδομένα μένουν στον browser (localStorage), χωρίς server.
// Χρησιμοποιείται όταν δεν έχει ρυθμιστεί το Supabase στο config.js.

const KEY = "wellnesslab-demo-v1";
const SESSION_KEY = "wellnesslab-demo-session";

const FOODS = [
  ["Κοτόπουλο στήθος ψητό", "g", 165, 31, 0, 3.6],
  ["Μοσχάρι άπαχο ψητό", "g", 217, 26, 0, 12],
  ["Σολομός ψητός", "g", 206, 22, 0, 12],
  ["Τόνος σε νερό", "g", 116, 26, 0, 1],
  ["Φασολάκια λαδερά", "g", 95, 2, 8, 6.5],
  ["Φακές βρασμένες", "g", 116, 9, 20, 0.4],
  ["Ρεβίθια βρασμένα", "g", 164, 8.9, 27, 2.6],
  ["Ρύζι βρασμένο", "g", 130, 2.7, 28, 0.3],
  ["Ζυμαρικά βρασμένα", "g", 158, 5.8, 31, 0.9],
  ["Πατάτα βραστή", "g", 87, 1.9, 20, 0.1],
  ["Μπρόκολο βραστό", "g", 35, 2.4, 7, 0.4],
  ["Σαλάτα εποχής (χωρίς λάδι)", "g", 20, 1, 4, 0.2],
  ["Φέτα", "g", 264, 14, 4, 21],
  ["Γιαούρτι στραγγιστό 2%", "g", 73, 10, 3.6, 2],
  ["Τυρί cottage", "g", 98, 11, 3.4, 4.3],
  ["Γάλα 1,5%", "g", 47, 3.4, 4.9, 1.5],
  ["Βρώμη", "g", 389, 16.9, 66, 6.9],
  ["Ψωμί ολικής άλεσης", "g", 247, 13, 41, 3.4],
  ["Ελαιόλαδο", "g", 884, 0, 0, 100],
  ["Μέλι", "g", 304, 0.3, 82, 0],
  ["Καρύδια", "g", 654, 15, 14, 65],
  ["Αμύγδαλα", "g", 579, 21, 22, 50],
  ["Αυγό", "piece", 72, 6.3, 0.4, 4.8],
  ["Τοστ (ψωμί, γαλοπούλα, τυρί)", "piece", 300, 18, 30, 11],
  ["Μήλο", "piece", 95, 0.5, 25, 0.3],
  ["Μπανάνα", "piece", 105, 1.3, 27, 0.4],
  ["Πορτοκάλι", "piece", 62, 1.2, 15, 0.2],
  ["Πουτίγκα light (κεσεδάκι)", "piece", 110, 3.5, 18, 2.5],
  ["Φρυγανιά ολικής", "piece", 35, 1.3, 6, 0.6],
  ["Ρυζογκοφρέτα", "piece", 35, 0.7, 7.3, 0.3],
].map(([name, unit, kcal, protein, carbs, fat], i) => ({
  id: `food-${i + 1}`, name, unit, kcal, protein, carbs, fat,
}));

function seed() {
  const f = (name) => FOODS.find((x) => x.name.startsWith(name)).id;
  const it = (name, amount) => ({ food_id: f(name), amount });
  const client = "client-1";
  const plan = {
    1: {
      breakfast: [it("Τοστ", 1)],
      snack1: [it("Μήλο", 1)],
      lunch: [it("Φασολάκια", 250), it("Αυγό", 2), it("Σαλάτα", 150), it("Φέτα", 60)],
      snack2: [it("Πουτίγκα", 1)],
      dinner: [it("Κοτόπουλο", 150), it("Σαλάτα", 200), it("Ελαιόλαδο", 10)],
    },
    2: {
      breakfast: [it("Γιαούρτι", 200), it("Μέλι", 15), it("Βρώμη", 40)],
      snack1: [it("Μπανάνα", 1)],
      lunch: [it("Φακές", 300), it("Φέτα", 40), it("Ψωμί", 50)],
      snack2: [it("Αμύγδαλα", 25)],
      dinner: [it("Σολομός", 150), it("Πατάτα", 200), it("Μπρόκολο", 150)],
    },
    3: {
      breakfast: [it("Αυγό", 2), it("Ψωμί", 60)],
      snack1: [it("Πορτοκάλι", 1)],
      lunch: [it("Κοτόπουλο", 150), it("Ρύζι", 180), it("Σαλάτα", 150)],
      snack2: [it("Τυρί cottage", 150), it("Καρύδια", 15)],
      dinner: [it("Τόνος", 120), it("Σαλάτα", 200), it("Ελαιόλαδο", 10), it("Φρυγανιά", 2)],
    },
  };
  const meals = [];
  for (const [day, slots] of Object.entries(plan))
    for (const [slot, items] of Object.entries(slots))
      meals.push({ id: `meal-${day}-${slot}`, client_id: client, day: Number(day), slot, items });

  return {
    users: [
      { email: "admin@demo.gr", password: "demo", id: "admin-1" },
      { email: "pelatis@demo.gr", password: "demo", id: client },
    ],
    profiles: [
      { id: "admin-1", email: "admin@demo.gr", full_name: "Διατροφολόγος (demo)", role: "admin", plan_days: 7, notes: "" },
      {
        id: client, email: "pelatis@demo.gr", full_name: "Γιώργος Παπαδόπουλος", role: "client",
        kcal: 1900, protein: 120, carbs: 200, fat: 65, plan_days: 3,
        notes: "Πολύ νερό (2–2,5 λίτρα) και περπάτημα 30' την ημέρα.",
      },
      {
        id: "client-2", email: "maria@demo.gr", full_name: "Μαρία Ιωάννου", role: "client",
        kcal: 1600, protein: 95, carbs: 170, fat: 55, plan_days: 7, notes: "",
      },
    ],
    foods: FOODS,
    meals,
    selections: [],
  };
}

let memory = null;
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return memory || (memory = seed());
}
function save(db) {
  memory = db;
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {}
}
const clone = (x) => JSON.parse(JSON.stringify(x));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));
const delay = (v) => new Promise((r) => setTimeout(() => r(clone(v)), 60));

export function createDemoApi() {
  let current = null;
  try { current = sessionStorage.getItem(SESSION_KEY); } catch {}

  const me = () => load().profiles.find((p) => p.id === current) || null;
  const requireAdmin = () => {
    if (me()?.role !== "admin") throw new Error("Δεν επιτρέπεται.");
  };

  return {
    mode: "demo",

    async getSession() { return delay(me()); },

    async signIn(email, password) {
      const u = load().users.find((x) => x.email === email.trim().toLowerCase() && x.password === password);
      if (!u) throw new Error("Λάθος email ή κωδικός.");
      current = u.id;
      try { sessionStorage.setItem(SESSION_KEY, u.id); } catch {}
      return delay(me());
    },

    async signUp(fullName, email, password) {
      const db = load();
      email = email.trim().toLowerCase();
      if (db.users.some((u) => u.email === email)) throw new Error("Υπάρχει ήδη λογαριασμός με αυτό το email.");
      if (password.length < 6) throw new Error("Ο κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες.");
      const id = uid();
      db.users.push({ email, password, id });
      db.profiles.push({ id, email, full_name: fullName, role: "client", plan_days: 7, notes: "" });
      save(db);
      return this.signIn(email, password);
    },

    async resetPassword() {
      throw new Error("Στο demo δεν στέλνονται email. Χρησιμοποίησε τον κωδικό «demo».");
    },
    async updatePassword() {},
    onPasswordRecovery() {},

    async signOut() {
      current = null;
      try { sessionStorage.removeItem(SESSION_KEY); } catch {}
    },

    async resetDemo() {
      save(seed());
    },

    async listClients() {
      requireAdmin();
      return delay(load().profiles.filter((p) => p.role === "client").sort((a, b) => a.full_name.localeCompare(b.full_name, "el")));
    },

    async updateClient(id, patch) {
      requireAdmin();
      const db = load();
      const p = db.profiles.find((x) => x.id === id);
      Object.assign(p, patch);
      save(db);
      return delay(p);
    },

    async listFoods() {
      return delay(load().foods.slice().sort((a, b) => a.name.localeCompare(b.name, "el")));
    },

    async saveFood(food) {
      requireAdmin();
      const db = load();
      let row = food.id && db.foods.find((f) => f.id === food.id);
      if (row) Object.assign(row, food);
      else db.foods.push((row = { ...food, id: uid() }));
      save(db);
      return delay(row);
    },

    async deleteFood(id) {
      requireAdmin();
      const db = load();
      db.foods = db.foods.filter((f) => f.id !== id);
      save(db);
    },

    async listMeals(clientId) {
      if (me()?.role !== "admin" && clientId !== current) throw new Error("Δεν επιτρέπεται.");
      return delay(load().meals.filter((m) => m.client_id === clientId));
    },

    async saveMeal(meal) {
      requireAdmin();
      const db = load();
      let row = db.meals.find((m) => m.client_id === meal.client_id && m.day === meal.day && m.slot === meal.slot);
      if (row) row.items = meal.items;
      else db.meals.push((row = { id: uid(), client_id: meal.client_id, day: meal.day, slot: meal.slot, items: meal.items }));
      save(db);
      return delay(row);
    },

    async listSelections(clientId, from, to) {
      if (me()?.role !== "admin" && clientId !== current) throw new Error("Δεν επιτρέπεται.");
      return delay(load().selections.filter((s) => s.client_id === clientId && s.date >= from && s.date <= to));
    },

    async saveSelection(sel) {
      if (sel.client_id !== current) throw new Error("Δεν επιτρέπεται.");
      const db = load();
      const i = db.selections.findIndex((s) => s.client_id === sel.client_id && s.date === sel.date && s.slot === sel.slot);
      if (i >= 0) db.selections[i] = { ...sel };
      else db.selections.push({ ...sel });
      save(db);
      return delay(sel);
    },

    async deleteSelection(clientId, date, slot) {
      if (clientId !== current) throw new Error("Δεν επιτρέπεται.");
      const db = load();
      db.selections = db.selections.filter((s) => !(s.client_id === clientId && s.date === date && s.slot === slot));
      save(db);
    },
  };
}
