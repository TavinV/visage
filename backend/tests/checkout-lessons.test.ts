/**
 * Cálculo de aulas no checkout individual.
 *
 * A contagem parte da hora REAL de início da aula (informada pelo professor),
 * não de quando a chamada foi aberta no sistema — é justamente por isso que o
 * formulário pede o horário.
 */

import { describe, it, expect } from "vitest";
import { lessonsCompletedOnCheckout } from "../src/services/class-sessions.service";
import { lessonDurationToMinutes } from "../src/services/subjects.service";

const at = (hhmm: string) => new Date(`2026-08-12T${hhmm}:00.000Z`);

describe("lessonsCompletedOnCheckout", () => {
  it("conta apenas aulas inteiras cumpridas", () => {
    // 4 aulas de 50 min a partir das 19:00; saída às 20:45 = 105 min
    expect(lessonsCompletedOnCheckout(at("19:00"), at("20:45"), 50, 4)).toBe(2);
  });

  it("conta a aula exatamente no minuto de virada", () => {
    expect(lessonsCompletedOnCheckout(at("19:00"), at("20:40"), 50, 4)).toBe(2);
  });

  it("não conta a aula em curso quando falta um minuto", () => {
    expect(lessonsCompletedOnCheckout(at("19:00"), at("20:39"), 50, 4)).toBe(1);
  });

  it("devolve 0 quando o aluno sai antes de completar a primeira aula", () => {
    expect(lessonsCompletedOnCheckout(at("19:00"), at("19:10"), 50, 4)).toBe(0);
  });

  it("nunca ultrapassa o valor da sessão mesmo saindo depois do fim", () => {
    // A sessão vale 2 aulas, mas o aluno ficou 5 aulas de tempo
    expect(lessonsCompletedOnCheckout(at("19:00"), at("23:10"), 50, 2)).toBe(2);
  });

  it("trata saída anterior ao início como 0, sem número negativo", () => {
    expect(lessonsCompletedOnCheckout(at("19:00"), at("18:30"), 50, 4)).toBe(0);
  });

  it("usa a hora real informada, não a de abertura da chamada", () => {
    // Aula começou 19:00, professor só abriu a chamada 19:40. Aluno sai 20:45.
    // Pela hora real são 2 aulas; pela hora de abertura seria só 1.
    const pelaHoraReal = lessonsCompletedOnCheckout(at("19:00"), at("20:45"), 50, 4);
    const pelaAbertura = lessonsCompletedOnCheckout(at("19:40"), at("20:45"), 50, 4);
    expect(pelaHoraReal).toBe(2);
    expect(pelaAbertura).toBe(1);
  });

  it("sobrevive a duração zerada sem dividir por zero", () => {
    expect(Number.isFinite(lessonsCompletedOnCheckout(at("19:00"), at("20:00"), 0, 4))).toBe(true);
  });
});

describe("lessonDurationToMinutes", () => {
  it("mantém minutos como estão", () => {
    expect(lessonDurationToMinutes(50, "minutes")).toBe(50);
  });

  it("converte horas para minutos", () => {
    expect(lessonDurationToMinutes(2, "hours")).toBe(120);
  });

  it("garante piso de 1 minuto para não quebrar o cálculo de aulas", () => {
    expect(lessonDurationToMinutes(0, "minutes")).toBe(1);
  });
});
