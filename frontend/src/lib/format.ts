/** Formatação pt-BR para datas, moeda e percentuais. */

export function formatDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

/**
 * Datas sem hora (ex.: startsAt/endsAt de período acadêmico). Formata o
 * componente de data direto da string — converter via Date deslocaria um
 * dia em fusos negativos, já que o backend serializa como meia-noite UTC.
 */
export function formatDateOnly(value?: string | null): string {
  if (!value) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return formatDate(value);
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function formatCurrency(value: string | number): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatPercent(value?: number | null, digits = 1): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "—";
  return `${value.toFixed(digits).replace(".", ",")}%`;
}

export function formatTime(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** Duração em minutos legível: "50 min", "1h", "1h30". */
export function formatDuration(minutes?: number | null): string {
  if (minutes === undefined || minutes === null || Number.isNaN(minutes)) return "—";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h${String(rest).padStart(2, "0")}`;
}

/** "2 aulas" / "1 aula" — concordância aparece em muitas telas. */
export function formatLessons(count: number): string {
  return `${count} ${count === 1 ? "aula" : "aulas"}`;
}

/**
 * Converte um instante para o formato de <input type="datetime-local">, que
 * espera hora LOCAL sem fuso (toISOString devolveria UTC e adiantaria o
 * relógio do professor em 3h no Brasil).
 */
export function toDateTimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** IDs longos (UUID) exibidos de forma compacta em células mono. */
export function shortId(id?: string | null): string {
  if (!id) return "—";
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}
