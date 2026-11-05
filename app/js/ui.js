// Μικρά βοηθητικά για DOM.

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k in el && typeof v !== "string") el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

let toastTimer;
export function toast(msg, kind = "ok") {
  let el = document.getElementById("toast");
  if (!el) {
    el = h("div", { id: "toast", role: "status", "aria-live": "polite" });
    document.body.append(el);
  }
  el.textContent = msg;
  el.className = `toast toast--${kind} is-visible`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("is-visible"), 2600);
}

/** Debounce ανά κλειδί: κάθε κλειδί (π.χ. γεύμα) έχει τον δικό του χρονοδιακόπτη. */
export function keyedDebounce(fn, ms = 600) {
  const timers = new Map();
  return (key, ...args) => {
    clearTimeout(timers.get(key));
    timers.set(key, setTimeout(() => {
      timers.delete(key);
      fn(...args);
    }, ms));
  };
}

export function modal(title, body) {
  const close = () => {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (e) => e.key === "Escape" && close();
  const overlay = h("div", { class: "modal", onclick: (e) => e.target === overlay && close() },
    h("div", { class: "modal__box", role: "dialog", "aria-modal": "true", "aria-label": title },
      h("div", { class: "modal__head" },
        h("h3", {}, title),
        h("button", { class: "icon-btn", "aria-label": "Κλείσιμο", onclick: close }, "✕")),
      h("div", { class: "modal__body" }, body)));
  document.addEventListener("keydown", onKey);
  document.body.append(overlay);
  overlay.querySelector("button, input, select")?.focus();
  return close;
}

export function progress(label, value, target, unit) {
  const pct = target ? Math.min(100, (value / target) * 100) : 0;
  const over = target && value > target * 1.05;
  const left = target ? Math.round(target - value) : null;
  return h("div", { class: "meter" + (over ? " meter--over" : "") },
    h("div", { class: "meter__top" },
      h("span", { class: "meter__label" }, label),
      h("span", { class: "meter__value" },
        h("strong", {}, Math.round(value).toLocaleString("el-GR")),
        target ? ` / ${target.toLocaleString("el-GR")} ${unit}` : ` ${unit}`)),
    h("div", { class: "meter__bar" }, h("span", { style: { width: pct + "%" } })),
    target ? h("div", { class: "meter__hint" },
      left >= 0 ? `απομένουν ${left.toLocaleString("el-GR")} ${unit}` : `+${(-left).toLocaleString("el-GR")} ${unit} πάνω από τον στόχο`) : null);
}
