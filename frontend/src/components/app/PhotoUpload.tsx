"use client";

import { useRef, useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import { Button, Avatar, useToast } from "@/components/ui";
import { cn } from "@/lib/cn";

/** Lado máximo da imagem enviada — foto de perfil não precisa de mais. */
const MAX_SIDE = 512;
const JPEG_QUALITY = 0.85;

/**
 * Redimensiona e recorta em quadrado no navegador antes de enviar.
 *
 * Sem isso, a foto de 8MP da câmera do celular subiria inteira: o backend
 * rejeita acima de 512KB e o usuário não teria como saber o motivo.
 */
async function toSquareJpegBase64(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height, MAX_SIDE);

  const canvas = document.createElement("canvas");
  canvas.width = side;
  canvas.height = side;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível processar a imagem neste navegador.");

  // Recorte central: retratos costumam ter o rosto no meio
  const crop = Math.min(bitmap.width, bitmap.height);
  ctx.drawImage(
    bitmap,
    (bitmap.width - crop) / 2,
    (bitmap.height - crop) / 2,
    crop,
    crop,
    0,
    0,
    side,
    side
  );
  bitmap.close();

  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

interface PhotoUploadProps {
  /** Nome usado nas iniciais quando não há foto. */
  name: string;
  currentUrl: string | null;
  hasPhoto: boolean;
  /** Recebe o data URL JPEG já redimensionado. */
  onUpload: (imageB64: string) => Promise<unknown>;
  onRemove: () => Promise<unknown>;
  disabled?: boolean;
  shape?: "circle" | "square";
  hint?: string;
}

/**
 * Envio de foto de perfil / logo. O próprio usuário escolhe o arquivo; o
 * recorte e o resize acontecem aqui, antes de sair do navegador.
 */
export function PhotoUpload({
  name,
  currentUrl,
  hasPhoto,
  onUpload,
  onRemove,
  disabled,
  shape = "circle",
  hint,
}: PhotoUploadProps) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  // Mostra a nova imagem antes do refetch da query terminar
  const [preview, setPreview] = useState<string | null>(null);

  const shown = preview ?? currentUrl;

  const pick = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Escolha um arquivo de imagem (JPEG ou PNG).");
      return;
    }

    setBusy(true);
    try {
      const dataUrl = await toSquareJpegBase64(file);
      await onUpload(dataUrl);
      setPreview(dataUrl);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao enviar a imagem.");
    } finally {
      setBusy(false);
      // Permite reescolher o mesmo arquivo depois de um erro
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await onRemove();
      setPreview(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-4">
      {shape === "circle" ? (
        <Avatar name={name} size="xl" src={shown} />
      ) : (
        <span className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg border border-flauzino-slate-200 bg-white">
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element -- object URL / data URL
            <img src={shown} alt={name} className="h-full w-full object-contain" />
          ) : (
            <Camera size={22} className="text-flauzino-slate-400" />
          )}
        </span>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={busy}
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            iconLeft={<Camera size={14} />}
          >
            {hasPhoto || preview ? "Trocar imagem" : "Enviar imagem"}
          </Button>
          {(hasPhoto || preview) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled || busy}
              onClick={remove}
              iconLeft={<Trash2 size={14} />}
              className="text-flauzino-danger-600 hover:bg-flauzino-danger-100 hover:text-flauzino-danger-600"
            >
              Remover
            </Button>
          )}
        </div>
        <p className={cn("text-xs text-flauzino-slate-500")}>
          {hint ?? "JPEG ou PNG. A imagem é recortada em quadrado e reduzida automaticamente."}
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void pick(file);
        }}
      />
    </div>
  );
}
