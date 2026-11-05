// Υλοποίηση του API πάνω στο Supabase.
const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";

export async function createSupabaseApi({ url, anonKey }) {
  const { createClient } = await import(SUPABASE_JS);
  const sb = createClient(url, anonKey);

  const check = ({ data, error }) => {
    if (error) throw new Error(translate(error.message));
    return data;
  };

  async function profileOf(userId) {
    return check(await sb.from("profiles").select("*").eq("id", userId).single());
  }

  return {
    mode: "supabase",

    async getSession() {
      const { data } = await sb.auth.getSession();
      return data.session ? profileOf(data.session.user.id) : null;
    },

    async signIn(email, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(translate(error.message));
      return profileOf(data.user.id);
    },

    async signUp(fullName, email, password) {
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName }, emailRedirectTo: location.href.split("#")[0] },
      });
      if (error) throw new Error(translate(error.message));
      // Αν το Supabase ζητά επιβεβαίωση email, δεν υπάρχει ακόμα session
      return data.session ? profileOf(data.user.id) : null;
    },

    async resetPassword(email) {
      const { error } = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: location.href.split("#")[0],
      });
      if (error) throw new Error(translate(error.message));
    },

    async updatePassword(password) {
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw new Error(translate(error.message));
    },

    onPasswordRecovery(cb) {
      sb.auth.onAuthStateChange((event) => {
        if (event === "PASSWORD_RECOVERY") cb();
      });
    },

    async signOut() {
      await sb.auth.signOut();
    },

    async listClients() {
      return check(await sb.from("profiles").select("*").eq("role", "client").order("full_name"));
    },

    async updateClient(id, patch) {
      return check(await sb.from("profiles").update(patch).eq("id", id).select().single());
    },

    async listFoods() {
      return check(await sb.from("foods").select("*").order("name"));
    },

    async saveFood(food) {
      const { id, created_at, ...rest } = food;
      const q = id
        ? sb.from("foods").update(rest).eq("id", id)
        : sb.from("foods").insert(rest);
      return check(await q.select().single());
    },

    async deleteFood(id) {
      check(await sb.from("foods").delete().eq("id", id));
    },

    async listMeals(clientId) {
      return check(await sb.from("meals").select("*").eq("client_id", clientId));
    },

    async saveMeal(meal) {
      const row = {
        client_id: meal.client_id,
        day: meal.day,
        slot: meal.slot,
        items: meal.items,
        title: meal.title ?? "",
        recipe: meal.recipe ?? "",
        photo_url: meal.photo_url ?? "",
        updated_at: new Date().toISOString(),
      };
      return check(
        await sb.from("meals").upsert(row, { onConflict: "client_id,day,slot" }).select().single()
      );
    },

    async replaceMeals(clientId, meals) {
      check(await sb.from("meals").delete().eq("client_id", clientId));
      if (!meals.length) return [];
      const rows = meals.map((m) => ({
        client_id: clientId, day: m.day, slot: m.slot, items: m.items || [],
        title: m.title ?? "", recipe: m.recipe ?? "", photo_url: m.photo_url ?? "",
      }));
      return check(await sb.from("meals").insert(rows).select());
    },

    async uploadPhoto(blob) {
      const path = `${crypto.randomUUID()}.jpg`;
      const { error } = await sb.storage.from("recipes").upload(path, blob, { contentType: "image/jpeg" });
      if (error) throw new Error(error.message);
      return sb.storage.from("recipes").getPublicUrl(path).data.publicUrl;
    },

    async listMeasurements(clientId) {
      return check(await sb.from("measurements").select("*").eq("client_id", clientId).order("date"));
    },

    async saveMeasurement(m) {
      const { id, created_at, ...rest } = m;
      const q = id ? sb.from("measurements").update(rest).eq("id", id) : sb.from("measurements").insert(rest);
      return check(await q.select().single());
    },

    async importMeasurements(rows) {
      if (!rows.length) return [];
      return check(await sb.from("measurements").insert(rows).select());
    },

    async deleteMeasurement(id) {
      check(await sb.from("measurements").delete().eq("id", id));
    },

    async listDayLogs(clientId, from, to) {
      return check(await sb.from("day_logs").select("*").eq("client_id", clientId).gte("date", from).lte("date", to));
    },

    async saveDayLog(log) {
      const row = { ...log, updated_at: new Date().toISOString() };
      return check(await sb.from("day_logs").upsert(row, { onConflict: "client_id,date" }).select().single());
    },

    async listTemplates() {
      return check(await sb.from("templates").select("*").order("name"));
    },

    async saveTemplate(t) {
      const { id, created_at, ...rest } = t;
      const q = id ? sb.from("templates").update(rest).eq("id", id) : sb.from("templates").insert(rest);
      return check(await q.select().single());
    },

    async deleteTemplate(id) {
      check(await sb.from("templates").delete().eq("id", id));
    },

    async listSelections(clientId, from, to) {
      return check(
        await sb
          .from("selections")
          .select("*")
          .eq("client_id", clientId)
          .gte("date", from)
          .lte("date", to)
      );
    },

    async saveSelection(sel) {
      const row = { ...sel, updated_at: new Date().toISOString() };
      return check(
        await sb.from("selections").upsert(row, { onConflict: "client_id,date,slot" }).select().single()
      );
    },

    async deleteSelection(clientId, date, slot) {
      check(
        await sb.from("selections").delete().eq("client_id", clientId).eq("date", date).eq("slot", slot)
      );
    },
  };
}

function translate(msg) {
  const map = {
    "Invalid login credentials": "Λάθος email ή κωδικός.",
    "Email not confirmed": "Επιβεβαίωσε πρώτα το email σου από τον σύνδεσμο που σου στάλθηκε.",
    "User already registered": "Υπάρχει ήδη λογαριασμός με αυτό το email.",
    "Password should be at least 6 characters.": "Ο κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες.",
  };
  return map[msg] || msg;
}
