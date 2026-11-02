// Utilidades para leer el texto plano de los correos (getPlainBody de Gmail).
// En ese texto los valores vienen en negrita con asteriscos: "Empresa *DELICASS*".

const ENTITIES: Record<string, string> = { "&apos;": "'", "&#39;": "'", "&quot;": '"', "&amp;": "&", "&nbsp;": " " };

/** Limpia el cuerpo: entidades HTML, caracteres invisibles, "<#>" y <br />. */
export function normalizeBody(body: string): string {
  return body
    .replace(/&(apos|quot|amp|nbsp|#39);/g, (m) => ENTITIES[m] ?? m)
    .replace(/[​‌‍⁠﻿]/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<#>/g, "")
    .replace(/ /g, " ")
    .replace(/\r\n?/g, "\n");
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Valor de un campo "Etiqueta *valor*" o "Etiqueta: valor".
 * Toma lo que está entre asteriscos; si no hay, el resto de la línea (o la siguiente).
 * Distingue mayúsculas: las etiquetas empiezan con mayúscula y así no se confunden con
 * frases del texto ("desde tu *Cuenta sueldo*" vs. "Desde *Cuenta sueldo*").
 */
export function field(body: string, label: string): string | null {
  // Un "*" dentro del valor (p. ej. "MP*ARUMA") no lo cierra: solo cierra si le sigue un espacio o el fin.
  const re = new RegExp(
    `(?<![\\p{L}])${escapeRegex(label)}\\s*:?[ \\t]*\\n?[ \\t]*(\\*((?:[^*\\n]|\\*(?=\\S))*?)\\*(?=\\s|$)|([^\\n]*))`,
    "u",
  );
  const m = re.exec(body);
  if (!m) return null;
  const value = (m[2] ?? m[3] ?? "").replace(/\s+/g, " ").trim();
  return value || null;
}

/** Últimos dígitos que siguen a una etiqueta, aunque estén en la línea siguiente ("Desde *Clasica*\n**** 2046"). */
export function last4After(body: string, label: string): string | null {
  const i = body.search(new RegExp(`(?<![\\p{L}])${escapeRegex(label)}`, "u"));
  if (i < 0) return null;
  const m = /\*{2,}\s?(\d{3,4})\b/.exec(body.slice(i, i + 160));
  return m ? m[1] : null;
}

/** Quita el punto final de frases como "en *AQUA HOTEL 933.*". */
export function cleanMerchant(s: string | null): string | null {
  if (!s) return null;
  return s.replace(/\s+/g, " ").replace(/\.$/, "").trim() || null;
}
