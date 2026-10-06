/**
 * O que o totem pede durante a captura facial guiada — no cadastro, na
 * calibração e na confirmação da exclusão da biometria.
 */

import type { FramingHint } from "./CaptureStage";
import type { VoiceCue } from "./totemAudio";

/**
 * Poses na ordem em que o totem pede: frontal → direita → esquerda,
 * repetindo a cada 3 fotos. O backend espelha o ciclo em
 * utils/enrollmentPose.ts para escolher o corte de detecção de cada foto.
 * `cue` é a fala da pose — a frontal não tem.
 */
export const CAPTURE_POSES: ReadonlyArray<{ instruction: string; cue: VoiceCue | null }> = [
  { instruction: "Olhe para o centro", cue: null },
  { instruction: "Vire levemente para a direita", cue: "virar_rosto_direita" },
  { instruction: "Vire levemente para a esquerda", cue: "virar_rosto_esquerda" },
];

/** Pose pedida depois de `photosTaken` fotos aceitas. */
export function capturePose(photosTaken: number) {
  return CAPTURE_POSES[photosTaken % CAPTURE_POSES.length];
}

/**
 * Enquadramento pela largura do rosto (fração da largura do vídeo), para
 * fotos que a engine confere com det_score ≥ 0.75: cadastro e confirmação
 * da exclusão.
 */
export function framingFromFaceRatio(ratio: number): Exclude<FramingHint, null> {
  if (ratio < 0.18) return "far";
  // Teto 0.38: acima de ~40% da largura o detector da engine perde
  // confiança e recusa a foto como "pouco nítida"
  if (ratio > 0.38) return "close";
  return "good";
}

/** Recusas de foto vindas da engine, na linguagem do totem. */
export const CAPTURE_REJECTION_MESSAGES: Record<string, string> = {
  no_face_detected: "Nenhum rosto encontrado. Centralize o rosto na guia.",
  multiple_faces_detected: "Mais de um rosto na imagem. Uma pessoa por vez.",
  low_detection_score: "Imagem pouco nítida. Ajuste a iluminação.",
  liveness_failed: "Não conseguimos confirmar que é você ao vivo. Evite fotos ou telas.",
};
