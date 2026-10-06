"use client";

import { useCallback } from "react";
import { totemAudio } from "./totemAudio";

/**
 * Feedback sonoro do totem — mesmos áudios do projeto de referência.
 * Toca pelo canal único (totemAudio): um bipe novo interrompe o que estiver
 * tocando, inclusive uma fala, em vez de sobrepor.
 */
export function useTotemSounds() {
  const playSuccess = useCallback(() => totemAudio.play("/audio/sucesso.wav"), []);
  const playError = useCallback(() => totemAudio.play("/audio/erro.wav"), []);

  return { playSuccess, playError };
}
