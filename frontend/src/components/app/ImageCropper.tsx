"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Move, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { cn } from "@/lib/cn";

/** Lado da imagem enviada — foto de perfil e logo não precisam de mais. */
const OUTPUT_SIDE = 512;
const JPEG_QUALITY = 0.85;
/** Lado da área de recorte na tela. O canvas usa a mesma proporção. */
const VIEWPORT = 320;
const MAX_ZOOM = 4;

interface Transform {
  /** Multiplicador sobre a escala que preenche o quadrado ("cover"). */
  zoom: number;
  /** Deslocamento do centro, em pixels da área de recorte. */
  x: number;
  y: number;
}

interface ImageCropperProps {
  /** Arquivo escolhido pelo usuário. */
  file: File;
  /** Círculo (foto de perfil) ou quadrado (logo). Só muda a máscara. */
  shape?: "circle" | "square";
  title?: string;
  description?: string;
  onCancel: () => void;
  /** Recebe o data URL JPEG já recortado no tamanho final. */
  onConfirm: (imageB64: string) => Promise<unknown>;
}

/**
 * Recorte manual antes do envio.
 *
 * O usuário arrasta e aproxima até o enquadramento certo — antes, o corte era
 * central e cego, o que decepava cabeças em fotos verticais e espremia logos
 * largas. O zoom mínimo cabe a imagem inteira dentro do quadrado (logo
 * horizontal continua legível, com margem branca); o máximo é 4× o
 * enquadramento que preenche a área.
 */
export function ImageCropper({
  file,
  shape = "circle",
  title = "Ajustar imagem",
  description = "Arraste para posicionar e use o zoom para enquadrar.",
  onCancel,
  onConfirm,
}: ImageCropperProps) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [transform, setTransform] = useState<Transform>({ zoom: 1, x: 0, y: 0 });

  const dragRef = useRef<{ pointerId: number; startX: number; startY: number } | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  // Carrega o arquivo escolhido (objectURL é liberado ao trocar/desmontar)
  useEffect(() => {
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;

    const img = new Image();
    img.onload = () => {
      setImage(img);
      setTransform({ zoom: 1, x: 0, y: 0 });
    };
    img.onerror = () => setError("Não foi possível abrir esta imagem.");
    img.src = url;

    return () => {
      URL.revokeObjectURL(url);
      objectUrlRef.current = null;
    };
  }, [file]);

  // Escala que preenche o quadrado; base de todos os cálculos
  const coverScale = image
    ? Math.max(VIEWPORT / image.naturalWidth, VIEWPORT / image.naturalHeight)
    : 1;
  const containScale = image
    ? Math.min(VIEWPORT / image.naturalWidth, VIEWPORT / image.naturalHeight)
    : 1;
  const minZoom = containScale / coverScale;

  const displayWidth = image ? image.naturalWidth * coverScale * transform.zoom : 0;
  const displayHeight = image ? image.naturalHeight * coverScale * transform.zoom : 0;

  /**
   * Impede que apareça vazio na borda: com a imagem maior que a área, o
   * deslocamento fica preso ao limite; menor que a área, ela é centralizada.
   */
  const clamp = useCallback(
    (next: Transform): Transform => {
      if (!image) return next;
      const width = image.naturalWidth * coverScale * next.zoom;
      const height = image.naturalHeight * coverScale * next.zoom;
      const limitX = Math.max(0, (width - VIEWPORT) / 2);
      const limitY = Math.max(0, (height - VIEWPORT) / 2);
      return {
        zoom: next.zoom,
        x: Math.min(limitX, Math.max(-limitX, next.x)),
        y: Math.min(limitY, Math.max(-limitY, next.y)),
      };
    },
    [image, coverScale]
  );

  const applyZoom = useCallback(
    (zoom: number) => {
      setTransform((t) => clamp({ ...t, zoom: Math.min(MAX_ZOOM, Math.max(minZoom, zoom)) }));
    },
    [clamp, minZoom]
  );

  // ── Arrastar ────────────────────────────────────────────────────────────────

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!image) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX - transform.x,
      startY: e.clientY - transform.y,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    setTransform((t) =>
      clamp({ ...t, x: e.clientX - drag.startX, y: e.clientY - drag.startY })
    );
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
  };

  // wheel com passive: false — o listener nativo é o único que pode chamar
  // preventDefault e impedir o scroll da página durante o zoom
  const viewportRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      applyZoom(transform.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08));
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [applyZoom, transform.zoom]);

  // ── Saída ───────────────────────────────────────────────────────────────────

  const buildDataUrl = (): string => {
    if (!image) throw new Error("Imagem ainda não carregada.");

    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIDE;
    canvas.height = OUTPUT_SIDE;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Não foi possível processar a imagem neste navegador.");

    // JPEG não tem transparência: o fundo branco evita que PNG transparente
    // (comum em logo) vire uma mancha preta
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, OUTPUT_SIDE, OUTPUT_SIDE);

    // Mesma geometria da prévia, em escala — o que se vê é o que sobe
    const ratio = OUTPUT_SIDE / VIEWPORT;
    const width = displayWidth * ratio;
    const height = displayHeight * ratio;
    const dx = OUTPUT_SIDE / 2 - width / 2 + transform.x * ratio;
    const dy = OUTPUT_SIDE / 2 - height / 2 + transform.y * ratio;

    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, dx, dy, width, height);

    return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  };

  const confirm = async () => {
    setSaving(true);
    setError(null);
    try {
      await onConfirm(buildDataUrl());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao enviar a imagem.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={saving ? () => {} : onCancel}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={confirm} loading={saving} disabled={!image}>
            Usar esta imagem
          </Button>
        </>
      }
    >
      <div className="flex flex-col items-center gap-4">
        <div
          ref={viewportRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          style={{ width: VIEWPORT, height: VIEWPORT, touchAction: "none" }}
          className={cn(
            "relative max-w-full cursor-grab overflow-hidden bg-flauzino-slate-100 active:cursor-grabbing",
            shape === "circle" ? "rounded-full" : "rounded-xl"
          )}
        >
          {image && (
            // eslint-disable-next-line @next/next/no-img-element -- object URL local
            <img
              src={image.src}
              alt="Prévia do recorte"
              draggable={false}
              className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
              style={{
                width: displayWidth,
                height: displayHeight,
                transform: `translate(-50%, -50%) translate(${transform.x}px, ${transform.y}px)`,
              }}
            />
          )}
          {/* Guia do enquadramento — some no arrasto para não poluir */}
          <div
            className={cn(
              "pointer-events-none absolute inset-0 border-2 border-white/70",
              shape === "circle" ? "rounded-full" : "rounded-xl"
            )}
          />
        </div>

        <div className="flex w-full max-w-[320px] items-center gap-3">
          <button
            type="button"
            aria-label="Diminuir zoom"
            onClick={() => applyZoom(transform.zoom / 1.2)}
            className="rounded-md p-1.5 text-flauzino-slate-500 transition-colors hover:bg-flauzino-slate-100 hover:text-flauzino-navy-900"
          >
            <ZoomOut size={16} />
          </button>
          <input
            type="range"
            aria-label="Zoom"
            min={minZoom}
            max={MAX_ZOOM}
            step={0.01}
            value={transform.zoom}
            onChange={(e) => applyZoom(Number(e.target.value))}
            className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-flauzino-slate-200 accent-flauzino-accent-600"
          />
          <button
            type="button"
            aria-label="Aumentar zoom"
            onClick={() => applyZoom(transform.zoom * 1.2)}
            className="rounded-md p-1.5 text-flauzino-slate-500 transition-colors hover:bg-flauzino-slate-100 hover:text-flauzino-navy-900"
          >
            <ZoomIn size={16} />
          </button>
          <button
            type="button"
            aria-label="Restaurar enquadramento"
            onClick={() => setTransform({ zoom: 1, x: 0, y: 0 })}
            className="rounded-md p-1.5 text-flauzino-slate-500 transition-colors hover:bg-flauzino-slate-100 hover:text-flauzino-navy-900"
          >
            <RotateCcw size={16} />
          </button>
        </div>

        <p className="flex items-center gap-1.5 text-xs text-flauzino-slate-500">
          <Move size={13} /> Arraste a imagem para escolher o que fica visível.
        </p>

        {error && (
          <p role="alert" className="text-sm text-flauzino-danger-600">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
