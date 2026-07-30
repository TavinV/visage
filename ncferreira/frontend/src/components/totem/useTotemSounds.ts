"use client";

import { useCallback, useEffect, useRef } from "react";

/** Feedback sonoro do totem — mesmos áudios do projeto de referência. */
export function useTotemSounds() {
  const successRef = useRef<HTMLAudioElement | null>(null);
  const errorRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    successRef.current = new Audio("/audio/sucesso.wav");
    errorRef.current = new Audio("/audio/erro.wav");
    successRef.current.volume = 1;
    errorRef.current.volume = 1;
  }, []);

  const play = useCallback((audio: HTMLAudioElement | null) => {
    if (!audio) return;
    try {
      audio.currentTime = 0;
      void audio.play();
    } catch {
      // autoplay bloqueado antes do primeiro gesto — silencioso
    }
  }, []);

  const playSuccess = useCallback(() => play(successRef.current), [play]);
  const playError = useCallback(() => play(errorRef.current), [play]);

  return { playSuccess, playError };
}
