"use client";

import { useRef, useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import { Button, Avatar, useToast } from "@/components/ui";
import { cn } from "@/lib/cn";
import { ImageCropper } from "./ImageCropper";

interface PhotoUploadProps {
  /** Nome usado nas iniciais quando não há foto. */
  name: string;
  currentUrl: string | null;
  hasPhoto: boolean;
  /** Recebe o data URL JPEG já recortado e redimensionado. */
  onUpload: (imageB64: string) => Promise<unknown>;
  onRemove: () => Promise<unknown>;
  disabled?: boolean;
  shape?: "circle" | "square";
  hint?: string;
  /** Título do recorte — a logo e a foto de perfil pedem textos diferentes. */
  cropTitle?: string;
}

/**
 * Envio de foto de perfil / logo. O usuário escolhe o arquivo, enquadra no
 * recorte e só então a imagem sai do navegador — já quadrada e reduzida, do
 * tamanho que o backend aceita.
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
  cropTitle,
}: PhotoUploadProps) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  // Arquivo aguardando enquadramento no modal de recorte
  const [cropping, setCropping] = useState<File | null>(null);
  // Mostra a nova imagem antes do refetch da query terminar
  const [preview, setPreview] = useState<string | null>(null);

  const shown = preview ?? currentUrl;

  const pick = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Escolha um arquivo de imagem (JPEG ou PNG).");
      return;
    }
    setCropping(file);
  };

  const upload = async (dataUrl: string) => {
    await onUpload(dataUrl);
    setPreview(dataUrl);
    setCropping(null);
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

  /** Libera reescolher o mesmo arquivo depois de cancelar ou falhar. */
  const resetInput = () => {
    if (inputRef.current) inputRef.current.value = "";
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
          {hint ?? "JPEG ou PNG. Você escolhe o enquadramento antes de enviar."}
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) pick(file);
        }}
      />

      {cropping && (
        <ImageCropper
          file={cropping}
          shape={shape}
          title={cropTitle ?? "Ajustar imagem"}
          onCancel={() => {
            setCropping(null);
            resetInput();
          }}
          onConfirm={async (dataUrl) => {
            await upload(dataUrl);
            resetInput();
          }}
        />
      )}
    </div>
  );
}
