"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface NativeFaceDetector {
  detect(source: CanvasImageSource): Promise<Array<{ boundingBox: DOMRectReadOnly }>>;
}

/**
 * Detecção facial nativa e leve via Shape Detection API (window.FaceDetector),
 * disponível em Chromium para tablets/totens. Quando indisponível, `supported`
 * fica false e o chamador usa a heurística de movimento como fallback.
 */
export function useFaceDetection() {
  const detectorRef = useRef<NativeFaceDetector | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);

  useEffect(() => {
    const Ctor = (window as unknown as { FaceDetector?: new (opts?: object) => NativeFaceDetector })
      .FaceDetector;
    if (!Ctor) {
      setSupported(false);
      return;
    }
    try {
      detectorRef.current = new Ctor({ fastMode: true, maxDetectedFaces: 2 });
      setSupported(true);
    } catch {
      setSupported(false);
    }
  }, []);

  /** null = detector indisponível; [] = nenhum rosto no frame. */
  const detect = useCallback(async (video: HTMLVideoElement): Promise<FaceBox[] | null> => {
    const detector = detectorRef.current;
    if (!detector || !video.videoWidth) return null;
    try {
      const faces = await detector.detect(video);
      return faces.map((f) => ({
        x: f.boundingBox.x,
        y: f.boundingBox.y,
        width: f.boundingBox.width,
        height: f.boundingBox.height,
      }));
    } catch {
      return null;
    }
  }, []);

  return { supported, detect };
}
