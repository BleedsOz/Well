// Εισαγωγή αποτελεσμάτων λιπομέτρησης από αρχείο CSV (π.χ. export από Tanita, InBody, Omron κ.ά.).
// Αναγνωρίζει αυτόματα τις συνήθεις ονομασίες στηλών (ελληνικά & αγγλικά) — η διατροφολόγος
// μπορεί να διορθώσει την αντιστοίχιση πριν την εισαγωγή.

/** Αφαιρεί τόνους, πεζά, ενιαία κενά. */
export function norm(s) {
  return String(s ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();
}

/** CSV parser: αναγνωρίζει ; , ή tab, εισαγωγικά και αλλαγές γραμμής μέσα σε εισαγωγικά. */
export function parseCSV(text) {
  text = String(text).replace(/^﻿/, "");
  const firstLine = text.split(/\r?\n/).find((l) => l.trim()) || "";
  const delim = [";", "\t", ","]
    .map((d) => [d, firstLine.split(d).length])
    .sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') q = false;
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows.map((r) => r.map((c) => c.trim()));
}

/** Αριθμός από κείμενο: δέχεται δεκαδικό κόμμα, μονάδες, κενά. */
export function parseNum(v) {
  if (v == null) return null;
  let s = String(v).trim().replace(/[^\d,.\-]/g, "");
  if (!s || s === "-") return null;
  if (s.includes(",") && s.includes(".")) {
    // 1.234,5 → 1234.5   ή   1,234.5 → 1234.5
    s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Ημερομηνία → YYYY-MM-DD. Δέχεται ISO, ΗΗ/ΜΜ/ΕΕΕΕ, ΗΗ.ΜΜ.ΕΕΕΕ, ΗΗ-ΜΜ-ΕΕ, με ή χωρίς ώρα. */
export function parseDate(v) {
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    let [a, b, y] = [+m[1], +m[2], +m[3]];
    if (y < 100) y += 2000;
    // Ευρωπαϊκή μορφή (ΗΗ/ΜΜ) εκτός αν είναι σαφώς αμερικάνικη (ΜΜ/ΗΗ με ημέρα > 12)
    const [day, month] = b > 12 && a <= 12 ? [b, a] : [a, b];
    return iso(y, month, day);
  }
  return null;
}
function iso(y, mo, d) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// Κανόνες αναγνώρισης στηλών: [πεδίο, regex πάνω στο κανονικοποιημένο header]. Η σειρά μετράει.
const RULES = [
  ["date", /(^|\b)(date|datetime|test date|measurement date|ημερομηνια|ημ\/νια|ημερ)/],
  ["name", /(^|\b)(name|full name|client|patient|ονομα|ονοματεπωνυμο|πελατης|επωνυμο)/],
  ["fat_pct", /(fat|λιπ|pbf).*(%|pct|percent|ποσοστο)|(%|ποσοστο).*(fat|λιπ)|^pbf$|percent body fat/],
  ["fat_kg", /(body fat mass|fat mass|λιπωδης μαζα|μαζα λιπους|bfm|λιπος.*kg|fat.*kg)/],
  ["visceral_fat", /(visceral|σπλαχνικ|vfl)/],
  ["muscle_kg", /(muscle|μυικ|μυϊκ|smm)/],
  ["water_pct", /(water|νερο|υγρα|tbw).*(%|pct|percent|ποσοστο)|(%|ποσοστο).*(water|νερο)/],
  ["water_kg", /(water|νερο|υγρα|tbw)/],
  ["bone_kg", /(bone|οστ)/],
  ["bmr", /(bmr|basal|μεταβολισμ|βμρ)/],
  ["metabolic_age", /(metabolic age|μεταβολικη ηλικια|body age)/],
  ["bmi", /(bmi|δμς|δεικτης μαζας)/],
  ["waist_cm", /(waist|μεση)/],
  ["hip_cm", /(hip|γοφ|περιφερεια ισχ)/],
  ["weight", /(weight|βαρος|wt\b|kg$)/],
];

export const IMPORT_FIELDS = [
  ["date", "Ημερομηνία"], ["name", "Όνομα (για αρχεία με πολλούς πελάτες)"],
  ["weight", "Βάρος (kg)"], ["fat_pct", "Λίπος %"], ["fat_kg", "Λιπώδης μάζα (kg)"],
  ["muscle_kg", "Μυϊκή μάζα (kg)"], ["water_pct", "Νερό %"], ["water_kg", "Νερό (kg / L)"],
  ["visceral_fat", "Σπλαχνικό λίπος"], ["bone_kg", "Οστική μάζα (kg)"], ["bmr", "Βασικός μεταβολισμός (kcal)"],
  ["metabolic_age", "Μεταβολική ηλικία"], ["bmi", "BMI"], ["waist_cm", "Μέση (cm)"], ["hip_cm", "Γοφοί (cm)"],
];

/** Βρίσκει τη γραμμή κεφαλίδων (την πρώτη με ≥2 αναγνωρίσιμες στήλες) και προτείνει αντιστοίχιση. */
export function detectColumns(rows) {
  let best = { headerRow: 0, mapping: {}, score: -1 };
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const mapping = {};
    rows[r].forEach((h, col) => {
      const n = norm(h);
      if (!n) return;
      for (const [field, re] of RULES) {
        if (mapping[field] == null && re.test(n)) { mapping[field] = col; break; }
      }
    });
    const score = Object.keys(mapping).length;
    if (score > best.score) best = { headerRow: r, mapping, score };
  }
  return best;
}

/** Μετατρέπει τις γραμμές δεδομένων σε μετρήσεις σύμφωνα με την αντιστοίχιση. */
export function toMeasurements(rows, headerRow, mapping) {
  const out = [];
  for (const row of rows.slice(headerRow + 1)) {
    const get = (f) => (mapping[f] == null || mapping[f] === "" ? null : row[mapping[f]]);
    const date = parseDate(get("date"));
    if (!date) continue;
    const m = { date, name: get("name") ?? "" };
    for (const [f] of IMPORT_FIELDS) {
      if (f === "date" || f === "name") continue;
      m[f] = parseNum(get(f));
    }
    // Λογικά όρια/μετατροπές
    if (m.fat_pct == null && m.fat_kg != null && m.weight) m.fat_pct = +((m.fat_kg / m.weight) * 100).toFixed(1);
    if (m.fat_kg == null && m.fat_pct != null && m.weight) m.fat_kg = +((m.weight * m.fat_pct) / 100).toFixed(1);
    if (m.water_pct == null && m.water_kg != null && m.weight) m.water_pct = +((m.water_kg / m.weight) * 100).toFixed(1);
    delete m.water_kg;
    const values = Object.entries(m).filter(([k, v]) => k !== "date" && k !== "name" && v != null);
    if (values.length) out.push(m);
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function readFileText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const buf = new Uint8Array(r.result);
      // UTF-8 πρώτα· αν βγουν σύμβολα αντικατάστασης, δοκίμασε Windows-1253 (ελληνικά Windows)
      let text = new TextDecoder("utf-8").decode(buf);
      if (text.includes("�")) {
        try { text = new TextDecoder("windows-1253").decode(buf); } catch {}
      }
      resolve(text);
    };
    r.onerror = () => reject(new Error("Δεν ήταν δυνατή η ανάγνωση του αρχείου."));
    r.readAsArrayBuffer(file);
  });
}
