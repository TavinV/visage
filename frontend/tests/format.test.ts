/**
 * Formatação pt-BR (src/lib/format.ts).
 *
 * Duas armadilhas de fuso justificam metade destes casos: uma data sem hora
 * convertida via `Date` volta um dia no Brasil, e `toISOString()` num campo
 * datetime-local adianta o relógio do professor em 3 horas. As duas funções
 * que existem para evitar isso são testadas com afinco.
 */

import { describe, it, expect } from "vitest";
import {
  formatDate,
  formatDateOnly,
  formatDateTime,
  formatCurrency,
  formatPercent,
  formatTime,
  formatDuration,
  formatLessons,
  toDateTimeLocalValue,
  shortId,
} from "@/lib/format";

describe("formatDate", () => {
  it("formata no padrão brasileiro", () => {
    // Meio-dia UTC: mesmo dia em qualquer fuso do Brasil
    expect(formatDate("2026-03-10T15:00:00Z")).toBe("10/03/2026");
  });

  it("devolve travessão para valor ausente", () => {
    expect(formatDate(undefined)).toBe("—");
    expect(formatDate(null)).toBe("—");
    expect(formatDate("")).toBe("—");
  });

  it("devolve travessão para data inválida em vez de 'Invalid Date'", () => {
    expect(formatDate("não é data")).toBe("—");
  });
});

describe("formatDateOnly", () => {
  it("formata a data pura sem converter para Date", () => {
    expect(formatDateOnly("2026-03-10")).toBe("10/03/2026");
  });

  it("NÃO volta um dia em meia-noite UTC — a razão de a função existir", () => {
    // O backend serializa período acadêmico como meia-noite UTC. Passar isso
    // por `new Date()` no Brasil (UTC-3) daria 09/03.
    expect(formatDateOnly("2026-03-10T00:00:00.000Z")).toBe("10/03/2026");
  });

  it("preserva o primeiro e o último dia do mês", () => {
    expect(formatDateOnly("2026-01-01T00:00:00.000Z")).toBe("01/01/2026");
    expect(formatDateOnly("2026-12-31T00:00:00.000Z")).toBe("31/12/2026");
  });

  it("cai para formatDate quando não reconhece o formato", () => {
    expect(formatDateOnly("lixo")).toBe("—");
  });

  it("data já localizada TROCA dia e mês no fallback — só alimente com ISO", () => {
    // O fallback usa `new Date()`, que lê "10/03/2026" como formato americano
    // (3 de outubro). A função é para strings do backend, sempre ISO; este
    // caso existe para deixar a armadilha registrada, não para abençoá-la.
    expect(formatDateOnly("10/03/2026")).toBe("03/10/2026");
  });

  it("devolve travessão para valor ausente", () => {
    expect(formatDateOnly(undefined)).toBe("—");
    expect(formatDateOnly(null)).toBe("—");
  });
});

describe("formatDateTime e formatTime", () => {
  it("juntam data e hora", () => {
    const saida = formatDateTime("2026-03-10T15:00:00Z");
    expect(saida).toContain("10/03/2026");
    expect(saida).toMatch(/\d{2}:\d{2}/);
  });

  it("formatTime devolve só horas e minutos, com dois dígitos", () => {
    expect(formatTime("2026-03-10T15:00:00Z")).toMatch(/^\d{2}:\d{2}$/);
  });

  it("ambos devolvem travessão para entrada inválida ou ausente", () => {
    expect(formatDateTime("lixo")).toBe("—");
    expect(formatDateTime(null)).toBe("—");
    expect(formatTime("lixo")).toBe("—");
    expect(formatTime(undefined)).toBe("—");
  });
});

describe("formatCurrency", () => {
  it("formata número como real", () => {
    const saida = formatCurrency(89);
    expect(saida).toContain("89,00");
    expect(saida).toContain("R$");
  });

  it("aceita string — o preço do plano vem como decimal do Prisma", () => {
    expect(formatCurrency("149.90")).toContain("149,90");
  });

  it("usa separador de milhar brasileiro", () => {
    expect(formatCurrency(1234.5)).toContain("1.234,50");
  });

  it("devolve travessão para valor não numérico", () => {
    expect(formatCurrency("grátis")).toBe("—");
  });

  it("formata zero como valor, não como ausência", () => {
    expect(formatCurrency(0)).toContain("0,00");
  });
});

describe("formatPercent", () => {
  it("usa vírgula decimal e uma casa por padrão", () => {
    expect(formatPercent(87.5)).toBe("87,5%");
  });

  it("respeita o número de casas pedido", () => {
    expect(formatPercent(87.456, 2)).toBe("87,46%");
    expect(formatPercent(87.456, 0)).toBe("87%");
  });

  it("distingue zero de ausência", () => {
    expect(formatPercent(0)).toBe("0,0%");
    expect(formatPercent(null)).toBe("—");
    expect(formatPercent(undefined)).toBe("—");
    expect(formatPercent(NaN)).toBe("—");
  });
});

describe("formatDuration", () => {
  it("mostra minutos abaixo de uma hora", () => {
    expect(formatDuration(50)).toBe("50 min");
    expect(formatDuration(59)).toBe("59 min");
  });

  it("mostra hora cheia sem minutos", () => {
    expect(formatDuration(60)).toBe("1h");
    expect(formatDuration(120)).toBe("2h");
  });

  it("preenche os minutos com zero à esquerda", () => {
    expect(formatDuration(90)).toBe("1h30");
    expect(formatDuration(65)).toBe("1h05");
  });

  it("trata zero e ausência", () => {
    expect(formatDuration(0)).toBe("0 min");
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(undefined)).toBe("—");
  });
});

describe("formatLessons", () => {
  it("concorda o número com o substantivo", () => {
    expect(formatLessons(1)).toBe("1 aula");
    expect(formatLessons(2)).toBe("2 aulas");
    expect(formatLessons(0)).toBe("0 aulas");
  });
});

describe("toDateTimeLocalValue", () => {
  it("usa a hora LOCAL — toISOString adiantaria o relógio do professor", () => {
    // Construído com componentes locais: a saída tem de repeti-los tal e qual.
    const data = new Date(2026, 2, 10, 19, 5);

    expect(toDateTimeLocalValue(data)).toBe("2026-03-10T19:05");
  });

  it("preenche mês, dia, hora e minuto com dois dígitos", () => {
    expect(toDateTimeLocalValue(new Date(2026, 0, 2, 3, 4))).toBe("2026-01-02T03:04");
  });

  it("produz um valor que o input datetime-local aceita de volta", () => {
    const data = new Date(2026, 7, 19, 23, 59);
    const valor = toDateTimeLocalValue(data);

    const reconstruida = new Date(valor);
    expect(reconstruida.getHours()).toBe(23);
    expect(reconstruida.getMinutes()).toBe(59);
    expect(reconstruida.getDate()).toBe(19);
  });
});

describe("shortId", () => {
  it("encurta UUID preservando o prefixo reconhecível", () => {
    expect(shortId("6f1a2b3c-0000-4000-8000-000000000001")).toBe("6f1a2b3c…");
  });

  it("mantém identificadores curtos intactos", () => {
    expect(shortId("abc123")).toBe("abc123");
    expect(shortId("123456789012")).toBe("123456789012");
  });

  it("devolve travessão para ausente", () => {
    expect(shortId(null)).toBe("—");
    expect(shortId(undefined)).toBe("—");
    expect(shortId("")).toBe("—");
  });
});
