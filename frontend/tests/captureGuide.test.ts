/**
 * Regras compartilhadas da captura guiada (src/components/totem/captureGuide.ts).
 *
 * As poses valem para o cadastro e para a calibração, e o backend escolhe o
 * corte de detecção de cada foto pelo mesmo ciclo (utils/enrollmentPose.ts):
 * se a ordem mudar só de um lado, a foto virada é cobrada como frontal.
 */

import { describe, it, expect } from "vitest";
import { capturePose, framingFromFaceRatio } from "@/components/totem/captureGuide";

describe("capturePose", () => {
  it("pede frontal → direita → esquerda e recomeça", () => {
    expect([0, 1, 2, 3].map((n) => capturePose(n).instruction)).toEqual([
      "Olhe para o centro",
      "Vire levemente para a direita",
      "Vire levemente para a esquerda",
      "Olhe para o centro",
    ]);
  });

  it("cada pose virada tem a sua fala; a frontal não tem", () => {
    expect(capturePose(0).cue).toBeNull();
    expect(capturePose(1).cue).toBe("virar_rosto_direita");
    expect(capturePose(2).cue).toBe("virar_rosto_esquerda");
  });

  it("frontal a cada 3 fotos — o mesmo ciclo do backend", () => {
    for (let photos = 0; photos < 9; photos++) {
      expect(capturePose(photos).cue === null, `foto ${photos}`).toBe(photos % 3 === 0);
    }
  });
});

describe("framingFromFaceRatio", () => {
  it("rosto pequeno na imagem pede para aproximar", () => {
    expect(framingFromFaceRatio(0.12)).toBe("far");
  });

  it("rosto acima de 38% da largura pede para afastar — a engine recusaria", () => {
    expect(framingFromFaceRatio(0.45)).toBe("close");
  });

  it("entre os dois limites, o enquadramento está bom", () => {
    expect(framingFromFaceRatio(0.18)).toBe("good");
    expect(framingFromFaceRatio(0.3)).toBe("good");
    expect(framingFromFaceRatio(0.38)).toBe("good");
  });
});
