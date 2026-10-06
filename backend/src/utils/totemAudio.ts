/**
 * Áudio dos totens — configuração por instituição.
 *
 * As falas já vêm gravadas em frontend/public/audio/<voz>/; o backend só
 * guarda se a instituição quer o totem falando e com qual voz.
 */

/** Vozes disponíveis — mesmo nome da pasta dos áudios no frontend. */
export const TOTEM_VOICE_VALUES = ["telma", "eduardo"] as const;

export type TotemVoice = (typeof TOTEM_VOICE_VALUES)[number];

export const DEFAULT_TOTEM_VOICE: TotemVoice = "telma";

export interface TotemAudioSettings {
  enabled: boolean;
  voice: TotemVoice;
}

/**
 * Configuração efetiva entregue ao totem. Voz desconhecida (valor editado à
 * mão no banco) cai na padrão em vez de apontar para uma pasta que não existe.
 */
export function resolveTotemAudio(settings: {
  totemAudioEnabled?: boolean | null;
  totemVoice?: string | null;
} | null): TotemAudioSettings {
  const voice = (TOTEM_VOICE_VALUES as readonly string[]).includes(settings?.totemVoice ?? "")
    ? (settings!.totemVoice as TotemVoice)
    : DEFAULT_TOTEM_VOICE;
  return { enabled: settings?.totemAudioEnabled ?? false, voice };
}
