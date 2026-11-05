// ΑΛΛΑΞΕ: το email στο οποίο θα πηγαίνουν τα μηνύματα της φόρμας
const CONTACT_EMAIL = "info@wellnesslab.gr";

document.getElementById("year").textContent = new Date().getFullYear();

// Sticky nav border on scroll
const nav = document.querySelector(".nav");
const onScroll = () => nav.classList.toggle("is-scrolled", window.scrollY > 10);
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

// Mobile menu
const toggle = document.querySelector(".nav__toggle");
const menu = document.getElementById("menu");
toggle.addEventListener("click", () => {
  const open = toggle.getAttribute("aria-expanded") === "true";
  toggle.setAttribute("aria-expanded", String(!open));
  menu.classList.toggle("is-open", !open);
});
menu.querySelectorAll("a").forEach((a) =>
  a.addEventListener("click", () => {
    toggle.setAttribute("aria-expanded", "false");
    menu.classList.remove("is-open");
  })
);

// Reveal on scroll
if ("IntersectionObserver" in window) {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("is-visible");
          io.unobserve(e.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
  );
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
} else {
  document.querySelectorAll(".reveal").forEach((el) => el.classList.add("is-visible"));
}

// Contact form → opens the visitor's email app with the message pre-filled
const form = document.getElementById("contact-form");
const note = document.getElementById("form-note");
form.addEventListener("submit", (e) => {
  e.preventDefault();
  const f = form.elements;
  const name = f.name.value.trim();
  const phone = f.phone.value.trim();
  const message = f.message.value.trim();
  f.name.classList.toggle("is-invalid", !name);
  if (!name) {
    note.textContent = "Συμπλήρωσε το όνομά σου για να συνεχίσουμε.";
    f.name.focus();
    return;
  }
  const subject = `Ραντεβού – ${f.topic.value}`;
  const lines = [`Όνομα: ${name}`];
  if (phone) lines.push(`Τηλέφωνο: ${phone}`);
  lines.push(`Ενδιαφέρομαι για: ${f.topic.value}`);
  if (message) lines.push("", message);
  const body = lines.join("\n");
  window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  note.textContent = "Ανοίγει η εφαρμογή email σου… Ευχαριστώ! 🌿";
});
