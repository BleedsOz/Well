import { h, toast } from "./ui.js";
import { METRICS, fmt, toISODate } from "./nutrition.js";

const LINE = "#4F7A3A"; // ελεγμένο: chroma & contrast πάνω στο λευκό της κάρτας

const fmtDateShort = (d) => new Date(d + "T12:00:00").toLocaleDateString("el-GR", { day: "numeric", month: "short" });
const fmtDateLong = (d) => new Date(d + "T12:00:00").toLocaleDateString("el-GR", { day: "numeric", month: "long", year: "numeric" });

function niceTicks(min, max, count = 4) {
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) || 10 * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toFixed(6));
  return ticks;
}

/** Γράφημα γραμμής μίας σειράς με crosshair & tooltip. points: [{ date, value }] ταξινομημένα. */
export function lineChart(points, metric) {
  const wrap = h("div", { class: "chart" });
  const tip = h("div", { class: "chart__tip", role: "status" });
  const NS = "http://www.w3.org/2000/svg";
  const s = (tag, attrs = {}) => {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  };

  function draw() {
    const W = Math.max(280, wrap.clientWidth || 600);
    const H = W < 480 ? 220 : 260;
    const m = { t: 16, r: 16, b: 28, l: 44 };
    const values = points.map((p) => p.value);
    const ticks = niceTicks(Math.min(...values), Math.max(...values));
    const y0 = ticks[0], y1 = ticks[ticks.length - 1];
    const t = points.map((p) => new Date(p.date + "T12:00:00").getTime());
    const tMin = t[0], tMax = t[t.length - 1];
    const x = (ms) => (tMax === tMin ? (m.l + W - m.r) / 2 : m.l + ((ms - tMin) / (tMax - tMin)) * (W - m.l - m.r));
    const y = (v) => m.t + (1 - (v - y0) / (y1 - y0 || 1)) * (H - m.t - m.b);

    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, role: "img",
      "aria-label": `${metric.label}: από ${fmt(values[0], metric.digits)} σε ${fmt(values.at(-1), metric.digits)} ${metric.unit}` });

    // Grid & άξονας Y (διακριτικά)
    for (const v of ticks) {
      svg.append(s("line", { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: "chart__grid" }));
      const lbl = s("text", { x: m.l - 8, y: y(v) + 4, "text-anchor": "end", class: "chart__axis" });
      lbl.textContent = fmt(v, metric.digits);
      svg.append(lbl);
    }
    // Ετικέτες X: η πρώτη, η τελευταία και ενδιάμεσες με ελάχιστη απόσταση, χωρίς επικαλύψεις
    const GAP = 64;
    const keep = [];
    points.forEach((_, i) => {
      const px = x(t[i]);
      if (!keep.length || px - x(t[keep.at(-1)]) >= GAP) keep.push(i);
    });
    const lastIdx = points.length - 1;
    if (keep.at(-1) !== lastIdx) {
      while (keep.length > 1 && x(t[lastIdx]) - x(t[keep.at(-1)]) < GAP) keep.pop();
      keep.push(lastIdx);
    }
    keep.forEach((i) => {
      const anchor = points.length > 1 && i === 0 ? "start" : points.length > 1 && i === lastIdx ? "end" : "middle";
      const lbl = s("text", { x: x(t[i]), y: H - 8, "text-anchor": anchor, class: "chart__axis" });
      lbl.textContent = fmtDateShort(points[i].date);
      svg.append(lbl);
    });

    // Γραμμή
    if (points.length > 1) {
      svg.append(s("path", {
        d: points.map((p, i) => `${i ? "L" : "M"}${x(t[i]).toFixed(1)},${y(p.value).toFixed(1)}`).join(""),
        fill: "none", stroke: LINE, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round",
      }));
    }
    // Σημεία (8px με δαχτυλίδι επιφάνειας)
    points.forEach((p, i) => svg.append(s("circle", { cx: x(t[i]), cy: y(p.value), r: 4, fill: LINE, stroke: "var(--white)", "stroke-width": 2 })));
    // Direct label στην τελευταία τιμή
    const last = points.at(-1);
    const lastLbl = s("text", { x: x(t.at(-1)), y: y(last.value) - 12, "text-anchor": points.length > 1 ? "end" : "middle", class: "chart__value" });
    lastLbl.textContent = `${fmt(last.value, metric.digits)} ${metric.unit}`;
    svg.append(lastLbl);

    // Crosshair & tooltip
    const cross = s("line", { y1: m.t, y2: H - m.b, class: "chart__cross", visibility: "hidden" });
    const focus = s("circle", { r: 6, fill: LINE, stroke: "var(--white)", "stroke-width": 2, visibility: "hidden" });
    svg.append(cross, focus);
    const hit = s("rect", { x: m.l - 10, y: 0, width: W - m.l - m.r + 20, height: H, fill: "transparent" });
    svg.append(hit);
    const show = (ev) => {
      const box = svg.getBoundingClientRect();
      const px = ((ev.clientX - box.left) / box.width) * W;
      let i = 0;
      t.forEach((ms, k) => { if (Math.abs(x(ms) - px) < Math.abs(x(t[i]) - px)) i = k; });
      const cx = x(t[i]), cy = y(points[i].value);
      cross.setAttribute("x1", cx); cross.setAttribute("x2", cx); cross.setAttribute("visibility", "visible");
      focus.setAttribute("cx", cx); focus.setAttribute("cy", cy); focus.setAttribute("visibility", "visible");
      const prev = points[i - 1];
      const diff = prev ? points[i].value - prev.value : null;
      tip.replaceChildren(...[
        h("span", { class: "chart__tip-date" }, fmtDateLong(points[i].date)),
        h("strong", {}, `${fmt(points[i].value, metric.digits)} ${metric.unit}`),
        diff != null ? h("span", { class: "chart__tip-diff" }, `${diff > 0 ? "+" : ""}${fmt(diff, metric.digits)} από την προηγούμενη`) : null,
      ].filter(Boolean));
      tip.style.left = `${(cx / W) * 100}%`;
      tip.style.top = `${(cy / H) * 100}%`;
      tip.classList.toggle("chart__tip--left", cx > W * 0.6);
      tip.classList.add("is-visible");
    };
    const hide = () => { cross.setAttribute("visibility", "hidden"); focus.setAttribute("visibility", "hidden"); tip.classList.remove("is-visible"); };
    hit.addEventListener("pointermove", show);
    hit.addEventListener("pointerdown", show);
    hit.addEventListener("pointerleave", hide);

    wrap.replaceChildren(svg, tip);
  }

  let lastW = 0;
  const ro = new ResizeObserver(() => {
    if (!wrap.isConnected) return ro.disconnect();
    const w = wrap.clientWidth;
    if (w && Math.abs(w - lastW) > 4) { lastW = w; draw(); }
  });
  ro.observe(wrap);
  queueMicrotask(draw);
  return wrap;
}

/**
 * Ενότητα «Πρόοδος»: επιλογή μέτρησης, κάρτες, γράφημα, φόρμα καταχώρισης, πίνακας.
 * opts: { api, clientId, role: 'admin' | 'client', measurements, onChanged, extra }
 */
export function progressSection(opts) {
  const { api, clientId, role } = opts;
  let list = opts.measurements.slice().sort((a, b) => a.date.localeCompare(b.date));
  let metricKey = "weight";
  const root = h("div", { class: "progress" });
  const canEdit = (m) => role === "admin" || m.source === "client";

  function available() {
    return METRICS.filter((mt) => list.some((m) => m[mt.key] != null));
  }

  function addForm() {
    const fields = role === "admin"
      ? METRICS
      : METRICS.filter((m) => ["weight", "fat_pct", "waist_cm", "hip_cm"].includes(m.key));
    const form = h("form", { class: "measure-form" },
      h("div", { class: "measure-form__grid" },
        h("label", { class: "field" }, h("span", {}, "Ημερομηνία"), h("input", { name: "date", type: "date", value: toISODate(new Date()), required: true })),
        fields.map((mt) => h("label", { class: "field" }, h("span", {}, mt.label),
          h("div", { class: "field__input" },
            h("input", { name: mt.key, type: "number", step: "0.1", min: 0, inputmode: "decimal" }),
            mt.unit ? h("em", {}, mt.unit) : null)))),
      role === "admin" ? h("label", { class: "field" }, h("span", {}, "Σημείωση"), h("input", { name: "notes" })) : null,
      h("button", { class: "btn btn--small", type: "submit" }, "Καταχώριση"));
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const row = { client_id: clientId, date: String(fd.get("date")), source: role === "admin" ? "admin" : "client", notes: String(fd.get("notes") || "") };
      let any = false;
      for (const mt of fields) {
        const v = fd.get(mt.key);
        row[mt.key] = v === "" || v == null ? null : Number(v);
        if (row[mt.key] != null) any = true;
      }
      if (!any) return toast("Συμπλήρωσε τουλάχιστον μία τιμή", "error");
      try {
        const saved = await api.saveMeasurement(row);
        list = [...list, saved].sort((a, b) => a.date.localeCompare(b.date));
        toast("Η μέτρηση καταχωρίστηκε");
        opts.onChanged?.(list);
        render();
      } catch (err) { toast(err.message, "error"); }
    });
    return form;
  }

  function table() {
    const cols = available();
    if (!list.length) return null;
    return h("details", { class: "measure-table" },
      h("summary", {}, `Όλες οι μετρήσεις (${list.length})`),
      h("div", { class: "table-wrap" },
        h("table", { class: "table" },
          h("thead", {}, h("tr", {}, h("th", {}, "Ημερομηνία"), cols.map((c) => h("th", {}, c.unit ? `${c.label} (${c.unit})` : c.label)), h("th", {}, ""))),
          h("tbody", {}, list.slice().reverse().map((m) => h("tr", {},
            h("td", {}, fmtDateLong(m.date), m.source === "client" ? h("span", { class: "chip chip--soft" }, "από πελάτη") : null),
            cols.map((c) => h("td", {}, m[c.key] == null ? "—" : fmt(m[c.key], c.digits))),
            h("td", {}, canEdit(m) ? h("button", {
              class: "icon-btn icon-btn--sm", "aria-label": "Διαγραφή μέτρησης",
              onclick: async () => {
                if (!confirm("Διαγραφή αυτής της μέτρησης;")) return;
                try {
                  await api.deleteMeasurement(m.id);
                  list = list.filter((x) => x.id !== m.id);
                  opts.onChanged?.(list);
                  render();
                } catch (err) { toast(err.message, "error"); }
              },
            }, "✕") : null)))))));
  }

  function render() {
    const avail = available();
    if (avail.length && !avail.some((m) => m.key === metricKey)) metricKey = avail[0].key;
    const metric = METRICS.find((m) => m.key === metricKey);
    const pts = list.filter((m) => m[metricKey] != null).map((m) => ({ date: m.date, value: Number(m[metricKey]) }));
    const first = pts[0], last = pts.at(-1);
    const diff = first && last && pts.length > 1 ? last.value - first.value : null;

    root.replaceChildren(
      h("section", { class: "panel" },
        h("div", { class: "panel__head" },
          h("h2", {}, "Πρόοδος"),
          opts.extra || null),
        !pts.length
          ? h("p", { class: "muted" }, role === "admin"
              ? "Δεν υπάρχουν ακόμα μετρήσεις. Κάνε εισαγωγή από το πρόγραμμα λιπομέτρησης ή καταχώρισε μια μέτρηση."
              : "Δεν υπάρχουν ακόμα μετρήσεις. Θα εμφανιστούν εδώ μετά την πρώτη σου λιπομέτρηση — ή καταχώρισε μόνος σου το βάρος σου παρακάτω.")
          : [
              h("div", { class: "metric-chips", role: "tablist", "aria-label": "Μέτρηση" },
                avail.map((mt) => h("button", {
                  role: "tab", "aria-selected": String(mt.key === metricKey), class: mt.key === metricKey ? "is-active" : "",
                  onclick: () => { metricKey = mt.key; render(); },
                }, mt.label))),
              h("div", { class: "stat-row" },
                h("div", { class: "stat" }, h("span", {}, "Τελευταία μέτρηση"), h("strong", {}, `${fmt(last.value, metric.digits)} ${metric.unit}`), h("small", {}, fmtDateLong(last.date))),
                diff != null ? h("div", { class: "stat" }, h("span", {}, "Μεταβολή"), h("strong", {}, `${diff > 0 ? "+" : ""}${fmt(diff, metric.digits)} ${metric.unit}`), h("small", {}, `από ${fmtDateLong(first.date)}`)) : null,
                h("div", { class: "stat" }, h("span", {}, "Μετρήσεις"), h("strong", {}, String(pts.length)), h("small", {}, metric.label.toLowerCase()))),
              h("h3", { class: "chart-title" }, `${metric.label}${metric.unit ? ` (${metric.unit})` : ""}`),
              lineChart(pts, metric),
            ],
        table()),
      h("section", { class: "panel" },
        h("h2", {}, role === "admin" ? "Νέα μέτρηση (χειροκίνητα)" : "Κατέγραψε μέτρηση"),
        addForm()));
  }

  render();
  return root;
}
