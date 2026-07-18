"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";

export type CameraStatus = "idle" | "starting" | "ready" | "error";

/**
 * Ciclo de vida da câmera frontal + utilidades de captura compartilhadas
 * pelos fluxos do totem (presença, cadastro e calibração).
 */
export function useTotemCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const probeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus("idle");
  }, []);

  const start = useCallback(async () => {
    if (streamRef.current) return;
    setStatus("starting");
    try {
      // 1080p ideal: navegadores degradam sozinhos, e partir de um frame
      // maior deixa a captura reduzida bem mais nítida (menos rejeição
      // por low_detection_score no cadastro)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  // O <video> costuma montar só DEPOIS de status="ready" (o consumidor o
  // renderiza condicionalmente) — anexa o stream assim que ele existir.
  useEffect(() => {
    if (status !== "ready") return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (video && stream && video.srcObject !== stream) {
      video.srcObject = stream;
      void video.play().catch(() => undefined);
    }
  }, [status]);

  /**
   * Ref de callback para o <video>: reanexa o stream sempre que o elemento
   * REmonta (ex.: wrapper com key trocando de fase) — o efeito acima só cobre
   * a transição de status, não a troca do elemento.
   */
  const bindVideo = useCallback((el: HTMLVideoElement | null) => {
    (videoRef as MutableRefObject<HTMLVideoElement | null>).current = el;
    const stream = streamRef.current;
    if (el && stream && el.srcObject !== stream) {
      el.srcObject = stream;
      void el.play().catch(() => undefined);
    }
  }, []);

  useEffect(() => stop, [stop]);

  /**
   * Frame atual em JPEG base64 (sem prefixo data:). Padrão 960px/0.85 para o
   * reconhecimento; o cadastro usa 1280px/0.92 — os limites de body das rotas
   * /device e /enrollment (2 MB) acomodam ambos com folga.
   */
  const captureJpegB64 = useCallback((maxWidth = 960, quality = 0.85): string | null => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;
    if (!captureCanvasRef.current) captureCanvasRef.current = document.createElement("canvas");
    const canvas = captureCanvasRef.current;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    return dataUrl.slice(dataUrl.indexOf(",") + 1);
  }, []);

  /** Luminância 64×64 do crop central — variação de pixels (anti-estático). */
  const grabLuminance = useCallback((): Uint8ClampedArray | null => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;
    if (!probeCanvasRef.current) probeCanvasRef.current = document.createElement("canvas");
    const size = 64;
    const canvas = probeCanvasRef.current;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    canvas.width = size;
    canvas.height = size;
    const crop = Math.min(video.videoWidth, video.videoHeight) * 0.6;
    ctx.drawImage(
      video,
      (video.videoWidth - crop) / 2,
      (video.videoHeight - crop) / 2,
      crop,
      crop,
      0,
      0,
      size,
      size
    );
    const { data } = ctx.getImageData(0, 0, size, size);
    const lum = new Uint8ClampedArray(size * size);
    for (let i = 0; i < lum.length; i++) {
      const o = i * 4;
      lum[i] = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
    }
    return lum;
  }, []);

  return { videoRef, bindVideo, status, start, stop, captureJpegB64, grabLuminance };
}

export function meanAbsDiff(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}
