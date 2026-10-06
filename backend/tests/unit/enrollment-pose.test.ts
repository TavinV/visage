/**
 * Pose e det_score mínimo por foto do cadastro (utils/enrollmentPose.ts).
 *
 * A ordem precisa casar com as instruções do totem (frontal → direita →
 * esquerda): se desalinhar, a foto frontal recebe o corte frouxo e a virada
 * o rigoroso — exatamente o erro repetido que esse corte por pose resolve.
 */

import { describe, it, expect } from "vitest";
import {
  enrollmentPose,
  enrollmentDetScoreMin,
  ENROLLMENT_DET_SCORE_MIN,
} from "../../src/utils/enrollmentPose";

describe("enrollmentPose", () => {
  it("segue o ciclo frontal → lateral → lateral do totem", () => {
    expect([0, 1, 2, 3, 4, 5].map(enrollmentPose)).toEqual([
      "frontal",
      "lateral",
      "lateral",
      "frontal",
      "lateral",
      "lateral",
    ]);
  });
});

describe("enrollmentDetScoreMin", () => {
  it("é menor nas fotos de rosto virado", () => {
    expect(enrollmentDetScoreMin(0)).toBe(ENROLLMENT_DET_SCORE_MIN.frontal);
    expect(enrollmentDetScoreMin(1)).toBe(ENROLLMENT_DET_SCORE_MIN.lateral);
    expect(ENROLLMENT_DET_SCORE_MIN.lateral).toBeLessThan(ENROLLMENT_DET_SCORE_MIN.frontal);
  });

  it("nunca fica abaixo do piso de detecção da engine (0.5)", () => {
    for (const v of Object.values(ENROLLMENT_DET_SCORE_MIN)) {
      expect(v).toBeGreaterThan(0.5);
      expect(v).toBeLessThanOrEqual(0.8);
    }
  });
});
