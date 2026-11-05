// Demo έκδοση του API: τα δεδομένα μένουν στον browser (localStorage), χωρίς server.
// Χρησιμοποιείται όταν δεν έχει ρυθμιστεί το Supabase στο config.js.

const KEY = "wellnesslab-demo-v3";
const SESSION_KEY = "wellnesslab-demo-session";

const FOODS = [
  ["Κοτόπουλο στήθος ψητό", "g", 165, 31, 0, 3.6, "Κρέας, ψάρι, αυγά"],
  ["Γαλοπούλα φιλέτο ψητό", "g", 135, 30, 0, 1.5, "Κρέας, ψάρι, αυγά"],
  ["Μοσχάρι άπαχο ψητό", "g", 217, 26, 0, 12, "Κρέας, ψάρι, αυγά"],
  ["Χοιρινό άπαχο ψητό", "g", 200, 29, 0, 9, "Κρέας, ψάρι, αυγά"],
  ["Σολομός ψητός", "g", 206, 22, 0, 12, "Κρέας, ψάρι, αυγά"],
  ["Μπακαλιάρος ψητός", "g", 105, 23, 0, 0.9, "Κρέας, ψάρι, αυγά"],
  ["Τόνος σε νερό", "g", 116, 26, 0, 1, "Κρέας, ψάρι, αυγά"],
  ["Αυγό", "piece", 72, 6.3, 0.4, 4.8, "Κρέας, ψάρι, αυγά"],
  ["Φασολάκια λαδερά", "g", 95, 2, 8, 6.5, "Μαγειρευτά"],
  ["Φακές βρασμένες", "g", 116, 9, 20, 0.4, "Όσπρια"],
  ["Ρεβίθια βρασμένα", "g", 164, 8.9, 27, 2.6, "Όσπρια"],
  ["Ρύζι βρασμένο", "g", 130, 2.7, 28, 0.3, "Αμυλούχα"],
  ["Ζυμαρικά βρασμένα", "g", 158, 5.8, 31, 0.9, "Αμυλούχα"],
  ["Κινόα βρασμένη", "g", 120, 4.4, 21, 1.9, "Αμυλούχα"],
  ["Πατάτα βραστή", "g", 87, 1.9, 20, 0.1, "Αμυλούχα"],
  ["Γλυκοπατάτα ψητή", "g", 90, 2, 21, 0.1, "Αμυλούχα"],
  ["Βρώμη", "g", 389, 16.9, 66, 6.9, "Αμυλούχα"],
  ["Ψωμί ολικής άλεσης", "g", 247, 13, 41, 3.4, "Αμυλούχα"],
  ["Φρυγανιά ολικής", "piece", 35, 1.3, 6, 0.6, "Αμυλούχα"],
  ["Ρυζογκοφρέτα", "piece", 35, 0.7, 7.3, 0.3, "Αμυλούχα"],
  ["Μπρόκολο βραστό", "g", 35, 2.4, 7, 0.4, "Λαχανικά"],
  ["Σαλάτα εποχής (χωρίς λάδι)", "g", 20, 1, 4, 0.2, "Λαχανικά"],
  ["Φέτα", "g", 264, 14, 4, 21, "Γαλακτοκομικά"],
  ["Γιαούρτι στραγγιστό 2%", "g", 73, 10, 3.6, 2, "Γαλακτοκομικά"],
  ["Τυρί cottage", "g", 98, 11, 3.4, 4.3, "Γαλακτοκομικά"],
  ["Γάλα 1,5%", "g", 47, 3.4, 4.9, 1.5, "Γαλακτοκομικά"],
  ["Ελαιόλαδο", "g", 884, 0, 0, 100, "Λιπαρά & ξηροί καρποί"],
  ["Καρύδια", "g", 654, 15, 14, 65, "Λιπαρά & ξηροί καρποί"],
  ["Αμύγδαλα", "g", 579, 21, 22, 50, "Λιπαρά & ξηροί καρποί"],
  ["Φυστικοβούτυρο", "g", 588, 25, 20, 50, "Λιπαρά & ξηροί καρποί"],
  ["Μήλο", "piece", 95, 0.5, 25, 0.3, "Φρούτα"],
  ["Μπανάνα", "piece", 105, 1.3, 27, 0.4, "Φρούτα"],
  ["Πορτοκάλι", "piece", 62, 1.2, 15, 0.2, "Φρούτα"],
  ["Αχλάδι", "piece", 100, 0.6, 27, 0.2, "Φρούτα"],
  ["Ακτινίδιο", "piece", 42, 0.8, 10, 0.4, "Φρούτα"],
  ["Μέλι", "g", 304, 0.3, 82, 0, "Σνακ & γλυκά"],
  ["Τοστ (ψωμί, γαλοπούλα, τυρί)", "piece", 300, 18, 30, 11, "Σνακ & γλυκά"],
  ["Πουτίγκα light (κεσεδάκι)", "piece", 110, 3.5, 18, 2.5, "Σνακ & γλυκά"],
].map(([name, unit, kcal, protein, carbs, fat, category], i) => ({
  id: `food-${i + 1}`, name, unit, kcal, protein, carbs, fat, category,
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
  // Δοκιμαστικές συνταγές (πρωτότυπα κείμενα) & εικονογραφήσεις για το demo.
  const R = (title, photo, recipe) => ({ title, photo_url: photo ? `assets/recipes/${photo}.svg` : "", recipe });
  const recipes = {
    "1-breakfast": R("Τοστ ολικής με γαλοπούλα και τυρί", "tost",
      "Υλικά: 2 φέτες ψωμί ολικής, 2 φέτες γαλοπούλα, 1 φέτα τυρί light, λίγα φύλλα μαρούλι και ντομάτα.\n\n1. Βάζεις γαλοπούλα και τυρί ανάμεσα στις φέτες.\n2. Ψήνεις στην τοστιέρα 3–4' μέχρι να λιώσει το τυρί.\n3. Ανοίγεις και προσθέτεις μαρούλι και ντομάτα πριν το σερβίρεις."),
    "1-lunch": R("Φασολάκια λαδερά με αυγά και φέτα", "fasolakia",
      "Υλικά (για 3 μερίδες): 750 g φασολάκια, 1 κρεμμύδι, 1 σκελίδα σκόρδο, 2 ώριμες ντομάτες τριμμένες, 2 κ.σ. ελαιόλαδο, μαϊντανό, αλάτι, πιπέρι.\n\n1. Σοτάρεις κρεμμύδι και σκόρδο στο ελαιόλαδο για 3'.\n2. Προσθέτεις τα φασολάκια και ανακατεύεις να γυαλίσουν.\n3. Ρίχνεις ντομάτα και μισό ποτήρι νερό, σκεπάζεις και σιγοβράζεις 35–40'.\n4. Βράζεις τα αυγά 9' και τα σερβίρεις μαζί με σαλάτα και τη φέτα."),
    "1-snack2": R("Πουτίγκα με φρέσκα φρούτα", "pudding",
      "Σερβίρεις την πουτίγκα κρύα με 2–3 φράουλες ή λίγα μύρτιλα από πάνω. Αν θέλεις κάτι πιο τραγανό, πασπαλίζεις μια πρέζα κανέλα."),
    "1-dinner": R("Κοτόπουλο λεμονάτο στη σχάρα με σαλάτα", "kotopoulo",
      "Υλικά: 150 g στήθος κοτόπουλο, χυμό από μισό λεμόνι, ρίγανη, θυμάρι, 1 κ.γ. μουστάρδα, σαλάτα εποχής, 10 g ελαιόλαδο.\n\n1. Ανοίγεις το στήθος σε φιλέτο ώστε να έχει ομοιόμορφο πάχος.\n2. Μαρινάρεις με λεμόνι, μουστάρδα και μυρωδικά για 20–30'.\n3. Ψήνεις σε καυτή αντικολλητική γκριλιέρα 5–6' από κάθε πλευρά.\n4. Σερβίρεις με σαλάτα και το ελαιόλαδο ωμό από πάνω."),
    "2-breakfast": R("Γιαούρτι με βρώμη και μέλι", "giaourti",
      "Υλικά: 200 g γιαούρτι στραγγιστό 2%, 40 g βρώμη, 1 κ.σ. μέλι, κανέλα.\n\n1. Αν θέλεις πιο μαλακή βρώμη, την αφήνεις από το βράδυ μέσα στο γιαούρτι (overnight oats).\n2. Το πρωί προσθέτεις μέλι και κανέλα.\n3. Για ποικιλία βάζεις μισή μπανάνα σε ροδέλες (μετράει στο δεκατιανό)."),
    "2-lunch": R("Φακές σούπα με φέτα και ψωμί ολικής", "fakes",
      "Υλικά (για 4 μερίδες): 300 g ξερές φακές, 1 κρεμμύδι, 1 καρότο, 2 σκελίδες σκόρδο, 1 φύλλο δάφνης, 1 κ.σ. πελτέ ντομάτας, 2 κ.σ. ελαιόλαδο, λίγο ξίδι.\n\n1. Ξεπλένεις τις φακές και τις βράζεις 5', πετάς το πρώτο νερό.\n2. Τις ξαναβάζεις με φρέσκο νερό, κρεμμύδι, καρότο, σκόρδο και δάφνη.\n3. Μετά από 25' προσθέτεις πελτέ, αλάτι και ελαιόλαδο και βράζεις άλλα 10'.\n4. Σερβίρεις με λίγο ξίδι, τη φέτα και το ψωμί."),
    "2-dinner": R("Σολομός φούρνου με πατάτες και μπρόκολο", "solomos",
      "Υλικά: 150 g φιλέτο σολομού, 200 g πατάτες, 150 g μπρόκολο, λεμόνι, άνηθο, πιπέρι.\n\n1. Προθερμαίνεις τον φούρνο στους 200°C.\n2. Ψήνεις τις πατάτες σε κομμάτια για 20' σε λαδόκολλα.\n3. Προσθέτεις τον σολομό και το μπρόκολο, πασπαλίζεις άνηθο και πιπέρι.\n4. Ψήνεις άλλα 12–15' και σερβίρεις με λεμόνι."),
    "3-breakfast": R("Αυγά ποσέ με ψωμί ολικής", "avga",
      "Υλικά: 2 αυγά, 60 g ψωμί ολικής, λίγο ξίδι, σχοινόπρασο, πιπέρι.\n\n1. Ζεσταίνεις νερό με 1 κ.σ. ξίδι μέχρι να σιγοβράζει.\n2. Ανακατεύεις το νερό κυκλικά και ρίχνεις απαλά ένα-ένα τα αυγά.\n3. Τα αφήνεις 3' και τα βγάζεις με τρυπητή κουτάλα.\n4. Σερβίρεις πάνω στο φρυγανισμένο ψωμί με σχοινόπρασο και πιπέρι."),
    "3-lunch": R("Κοτόπουλο με ρύζι και σαλάτα", "rizi",
      "Υλικά: 150 g στήθος κοτόπουλο, 180 g βρασμένο ρύζι (περίπου 60 g ωμό), σαλάτα εποχής, πάπρικα, σκόρδο σε σκόνη.\n\n1. Βράζεις το ρύζι σύμφωνα με τις οδηγίες της συσκευασίας.\n2. Κόβεις το κοτόπουλο σε κύβους και το πασπαλίζεις με πάπρικα και σκόρδο.\n3. Το σοτάρεις σε αντικολλητικό τηγάνι 8–10' μέχρι να ροδίσει.\n4. Σερβίρεις με το ρύζι και τη σαλάτα. Μπορείς να το ετοιμάσεις από το προηγούμενο βράδυ (meal prep)."),
    "3-snack2": R("Cottage με καρύδια", "cottage",
      "Βάζεις το cottage σε ένα μπολ και από πάνω τα καρύδια σπασμένα. Αν θέλεις γλυκιά εκδοχή, προσθέτεις κανέλα· για αλμυρή, πιπέρι και φρέσκο θυμάρι."),
    "3-dinner": R("Τονοσαλάτα με φρυγανιές", "tonos",
      "Υλικά: 120 g τόνο σε νερό (στραγγισμένο), σαλάτα με μαρούλι, ντομάτα, αγγούρι και κρεμμύδι, 10 g ελαιόλαδο, λεμόνι, 2 φρυγανιές ολικής.\n\n1. Κόβεις τα λαχανικά σε μπουκιές.\n2. Προσθέτεις τον τόνο σε κομμάτια.\n3. Περιχύνεις με ελαιόλαδο και λεμόνι, ρίγανη και πιπέρι.\n4. Σερβίρεις με τις φρυγανιές."),
  };
  const meals = [];
  for (const [day, slots] of Object.entries(plan))
    for (const [slot, items] of Object.entries(slots))
      meals.push({
        id: `meal-${day}-${slot}`, client_id: client, day: Number(day), slot, items,
        title: recipes[`${day}-${slot}`]?.title ?? "", recipe: recipes[`${day}-${slot}`]?.recipe ?? "",
        photo_url: recipes[`${day}-${slot}`]?.photo_url ?? "",
      });

  // 8 εβδομάδες λιπομετρήσεων με σταδιακή πρόοδο
  const today = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  const measurements = Array.from({ length: 8 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (7 - i) * 7);
    const w = +(92.4 - i * 0.65 - (i % 3 === 2 ? 0.2 : 0)).toFixed(1);
    const fp = +(29.8 - i * 0.45).toFixed(1);
    return {
      id: `m-${i}`, client_id: client, date: iso(d), source: "import",
      weight: w, fat_pct: fp, fat_kg: +(w * fp / 100).toFixed(1), muscle_kg: +(61.2 + i * 0.12).toFixed(1),
      water_pct: +(51.5 + i * 0.3).toFixed(1), visceral_fat: Math.round(13 - i * 0.4), bone_kg: 3.4,
      bmr: Math.round(1920 - i * 4), metabolic_age: 44 - Math.floor(i / 2), bmi: +(w / (1.80 * 1.80)).toFixed(1),
      waist_cm: +(101 - i * 0.8).toFixed(1), hip_cm: null, notes: "",
    };
  });

  const templates = [{
    id: "tpl-1", name: "Μεσογειακό 1.900 kcal (3 ημέρες)", kcal: 1900, protein: 120, carbs: 200, fat: 65, plan_days: 3,
    meals: meals.map(({ day, slot, items, title, recipe, photo_url }) => ({ day, slot, items, title, recipe, photo_url })),
  }];

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
        sex: "male", birth_year: 1984, height_cm: 180, activity: 1.375, goal: "lose",
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
    measurements,
    day_logs: [],
    templates,
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
  const allowed = (clientId) => {
    if (me()?.role !== "admin" && clientId !== current) throw new Error("Δεν επιτρέπεται.");
  };
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
      const fields = { items: meal.items, title: meal.title ?? "", recipe: meal.recipe ?? "", photo_url: meal.photo_url ?? "" };
      if (row) Object.assign(row, fields);
      else db.meals.push((row = { id: uid(), client_id: meal.client_id, day: meal.day, slot: meal.slot, ...fields }));
      save(db);
      return delay(row);
    },

    async replaceMeals(clientId, meals) {
      requireAdmin();
      const db = load();
      db.meals = db.meals.filter((m) => m.client_id !== clientId);
      const ids = new Set(db.meals.map((m) => m.id));
      db.selections.forEach((s) => { if (s.client_id === clientId && !ids.has(s.meal_id)) s.meal_id = null; });
      const rows = meals.map((m) => ({
        id: uid(), client_id: clientId, day: m.day, slot: m.slot, items: m.items || [],
        title: m.title ?? "", recipe: m.recipe ?? "", photo_url: m.photo_url ?? "",
      }));
      db.meals.push(...rows);
      save(db);
      return delay(rows);
    },

    async uploadPhoto(blob) {
      requireAdmin();
      return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(new Error("Αποτυχία ανάγνωσης εικόνας"));
        r.readAsDataURL(blob);
      });
    },

    async listMeasurements(clientId) {
      allowed(clientId);
      return delay(load().measurements.filter((m) => m.client_id === clientId).sort((a, b) => a.date.localeCompare(b.date)));
    },

    async saveMeasurement(m) {
      const admin = me()?.role === "admin";
      if (!admin && (m.client_id !== current || m.source !== "client")) throw new Error("Δεν επιτρέπεται.");
      const db = load();
      let row = m.id && db.measurements.find((x) => x.id === m.id);
      if (row) {
        if (!admin && row.source !== "client") throw new Error("Δεν επιτρέπεται.");
        Object.assign(row, m);
      } else db.measurements.push((row = { notes: "", ...m, id: uid() }));
      save(db);
      return delay(row);
    },

    async importMeasurements(rows) {
      requireAdmin();
      const db = load();
      const out = rows.map((r) => ({ notes: "", ...r, id: uid() }));
      db.measurements.push(...out);
      save(db);
      return delay(out);
    },

    async deleteMeasurement(id) {
      const db = load();
      const row = db.measurements.find((x) => x.id === id);
      if (!row) return;
      if (me()?.role !== "admin" && (row.client_id !== current || row.source !== "client")) throw new Error("Δεν επιτρέπεται.");
      db.measurements = db.measurements.filter((x) => x.id !== id);
      save(db);
    },

    async listDayLogs(clientId, from, to) {
      allowed(clientId);
      return delay(load().day_logs.filter((l) => l.client_id === clientId && l.date >= from && l.date <= to));
    },

    async saveDayLog(log) {
      if (log.client_id !== current) throw new Error("Δεν επιτρέπεται.");
      const db = load();
      const i = db.day_logs.findIndex((l) => l.client_id === log.client_id && l.date === log.date);
      if (i >= 0) db.day_logs[i] = { ...log };
      else db.day_logs.push({ ...log });
      save(db);
      return delay(log);
    },

    async listTemplates() {
      requireAdmin();
      return delay(load().templates.slice().sort((a, b) => a.name.localeCompare(b.name, "el")));
    },

    async saveTemplate(t) {
      requireAdmin();
      const db = load();
      let row = t.id && db.templates.find((x) => x.id === t.id);
      if (row) Object.assign(row, t);
      else db.templates.push((row = { ...t, id: uid() }));
      save(db);
      return delay(row);
    },

    async deleteTemplate(id) {
      requireAdmin();
      const db = load();
      db.templates = db.templates.filter((x) => x.id !== id);
      save(db);
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
