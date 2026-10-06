/**
 * Canal único de áudio do totem.
 *
 * Tudo que o totem toca — os bipes de sucesso/erro e as falas — passa por um
 * só elemento <audio>. Tocar algo novo interrompe na hora o que estava
 * tocando: dois áudios nunca se sobrepõem, e uma orientação que perdeu a
 * validade (o aluno já virou o rosto) não segue falando por cima da próxima.
 *
 * As falas obedecem à configuração da instituição (GET /device/context →
 * audio). Desligadas, `say` não toca nada e o totem fica só com os bipes,
 * como sempre foi.
 */

import type { TotemVoice } from "@/lib/types";
import type { TotemAudioSettings } from "@/lib/deviceApi";

/** Falas gravadas: public/audio/<voz>/<fala>_<voz>.mp3. */
export type VoiceCue =
  | "virar_rosto_direita"
  | "virar_rosto_esquerda"
  | "reconhecimento_facial_cadastrado"
  | "dados_removidos";

/** Vozes oferecidas em Configurações. */
export const TOTEM_VOICES: ReadonlyArray<{ value: TotemVoice; label: string; description: string }> =
  [
    { value: "telma", label: "Telma", description: "Voz feminina" },
    { value: "eduardo", label: "Eduardo", description: "Voz masculina" },
  ];

export function voiceCueUrl(voice: TotemVoice, cue: VoiceCue): string {
  return `/audio/${voice}/${cue}_${voice}.mp3`;
}

export class TotemAudio {
  private element: HTMLAudioElement | null = null;
  private settings: TotemAudioSettings | null = null;

  /** `createElement` existe para os testes trocarem o <audio> do navegador. */
  constructor(private readonly createElement: () => HTMLAudioElement = () => new Audio()) {}

  /** Configuração da instituição. `null` (carregando, backend antigo) = sem falas. */
  configure(settings: TotemAudioSettings | null): void {
    this.settings = settings;
  }

  /** Toca um clipe no lugar do atual — tudo que o totem toca passa por aqui. */
  play(src: string): void {
    const audio = this.ensureElement();
    if (!audio) return;
    this.stop();
    audio.src = src;
    try {
      // Autoplay bloqueado antes do primeiro gesto, ou clipe interrompido
      // pelo seguinte: silencioso, o totem segue sem som
      void audio.play()?.catch(() => undefined);
    } catch {
      // navegadores antigos lançam em vez de rejeitar
    }
  }

  /** Interrompe o que estiver tocando. */
  stop(): void {
    this.element?.pause();
  }

  /**
   * Fala da instituição, se ela usa áudio nos totens. Devolve se falou —
   * quem chama decide se toca o bipe no lugar.
   *
   * `null` avisa que a orientação mudou para uma que não tem fala (olhar
   * para o centro, consolidando o cadastro): a anterior já não vale e para.
   */
  say(cue: VoiceCue | null): boolean {
    if (!this.settings?.enabled) return false;
    if (cue === null) {
      this.stop();
      return false;
    }
    this.play(voiceCueUrl(this.settings.voice, cue));
    return true;
  }

  private ensureElement(): HTMLAudioElement | null {
    if (!this.element && typeof window !== "undefined") {
      this.element = this.createElement();
    }
    return this.element;
  }
}

/** Um só player para a página inteira — totem e prévia das vozes no console. */
export const totemAudio = new TotemAudio();
