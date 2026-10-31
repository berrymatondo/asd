/** "2026-11-07" → "07/11/2026" */
export function fmtDate(d?: string) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

/** Date locale du jour au format AAAA-MM-JJ */
export function today() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function newId() {
  return Date.now() + Math.floor(Math.random() * 1000);
}

/** Nettoie le HTML de l’éditeur enrichi (scripts, attributs dangereux…). Côté client uniquement. */
export function safeSummary(html: string) {
  if (typeof window === "undefined") return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script,style,iframe,object,embed,svg,form").forEach((x) => x.remove());
  doc.body.querySelectorAll("*").forEach((el) => {
    for (const a of [...el.attributes]) {
      if (a.name.startsWith("on") || ["href", "src", "style", "contenteditable"].includes(a.name)) el.removeAttribute(a.name);
    }
  });
  return doc.body.innerHTML;
}

export function plural(n: number, word: string) {
  return `${n} ${word}${n > 1 ? "s" : ""}`;
}
