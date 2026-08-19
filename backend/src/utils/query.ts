/**
 * "a,b,c" → ["a","b","c"]. Os filtros de múltipla escolha do painel (evento,
 * cargo, status…) mandam a seleção como uma string separada por vírgula em
 * vez de repetir o parâmetro na querystring.
 */
export function strList(value: unknown): string[] | undefined {
  if (typeof value !== "string" || !value) return undefined;
  const parts = value.split(",").map((v) => v.trim()).filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

/** "true"/"false" (ou ausente) → boolean | undefined — filtro tri-state opcional. */
export function boolParam(value: unknown): boolean | undefined {
  return value === undefined ? undefined : value === "true";
}

/** Converte YYYY-MM-DD ou ISO completo em Date; ignora entrada inválida. */
export function parseDate(value: unknown, endOfDay = false): Date | undefined {
  if (typeof value !== "string" || !value) return undefined;

  // Data pura (do date picker) vira o dia inteiro no fuso local do servidor:
  // "de 10/03" tem de incluir o que aconteceu às 23h de 10/03.
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const parsed = new Date(dateOnly ? `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}` : value);

  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}
