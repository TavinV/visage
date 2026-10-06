/**
 * Pose de cada foto do cadastro biométrico e o det_score mínimo que a engine
 * exige dela.
 *
 * O totem alterna as instruções na ordem frontal → direita → esquerda
 * (frontend/src/components/totem/captureGuide.ts, CAPTURE_POSES),
 * indexadas pelos frames já aceitos — a mesma contagem que a sessão guarda.
 *
 * O det_score do SCRFD é a confiança de que há um rosto, não nitidez: rostos
 * frontais bem iluminados ficam em 0.74–0.85 conforme a pessoa, e virar a
 * cabeça derruba 0.05–0.15. Por isso o corte das fotos laterais é menor.
 * Liveness (0.90 no cadastro) segue sendo a barreira anti-fraude.
 */

export type EnrollmentPose = "frontal" | "lateral";

export const ENROLLMENT_DET_SCORE_MIN: Record<EnrollmentPose, number> = {
  frontal: 0.75,
  lateral: 0.68,
};

/** Mesmo ciclo de instruções do totem: a cada 3 fotos, a 1ª é frontal. */
export function enrollmentPose(framesCollected: number): EnrollmentPose {
  return framesCollected % 3 === 0 ? "frontal" : "lateral";
}

export function enrollmentDetScoreMin(framesCollected: number): number {
  return ENROLLMENT_DET_SCORE_MIN[enrollmentPose(framesCollected)];
}
