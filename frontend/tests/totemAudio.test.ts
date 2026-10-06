/**
 * Canal único de áudio do totem (src/components/totem/totemAudio.ts).
 *
 * Contratos:
 *   - áudio desligado na instituição: nenhuma fala toca (os bipes seguem
 *     como sempre foram);
 *   - a voz escolhida decide qual arquivo toca, e todo arquivo existe;
 *   - um áudio novo interrompe o atual ANTES de começar;
 *   - nunca dois áudios ao mesmo tempo — um só elemento <audio> na página.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  TotemAudio,
  TOTEM_VOICES,
  voiceCueUrl,
  type VoiceCue,
} from "@/components/totem/totemAudio";

const CUES: VoiceCue[] = [
  "virar_rosto_direita",
  "virar_rosto_esquerda",
  "reconhecimento_facial_cadastrado",
  "dados_removidos",
];

/**
 * <audio> de mentira: registra a ordem das operações e conta quantos clipes
 * estavam tocando no instante em que outro começou.
 */
class FakeAudio {
  static instances: FakeAudio[] = [];
  static log: string[] = [];
  static overlaps = 0;

  playing = false;
  private current = "";

  constructor() {
    FakeAudio.instances.push(this);
  }

  get src() {
    return this.current;
  }

  set src(value: string) {
    FakeAudio.log.push(`src ${value}`);
    this.current = value;
  }

  play = vi.fn(() => {
    if (FakeAudio.instances.some((audio) => audio.playing)) FakeAudio.overlaps += 1;
    FakeAudio.log.push("play");
    this.playing = true;
    return Promise.resolve();
  });

  pause = vi.fn(() => {
    FakeAudio.log.push("pause");
    this.playing = false;
  });
}

const createElement = vi.fn(() => new FakeAudio() as unknown as HTMLAudioElement);

let audio: TotemAudio;

function player(): FakeAudio {
  return FakeAudio.instances[0];
}

beforeEach(() => {
  FakeAudio.instances = [];
  FakeAudio.log = [];
  FakeAudio.overlaps = 0;
  createElement.mockClear();
  audio = new TotemAudio(createElement);
});

describe("áudio desativado", () => {
  it("nenhuma fala toca quando a instituição desligou o áudio", () => {
    audio.configure({ enabled: false, voice: "telma" });

    for (const cue of CUES) expect(audio.say(cue)).toBe(false);
    // Nem o player é criado: desligado é exatamente o totem de antes
    expect(createElement).not.toHaveBeenCalled();
  });

  it("sem configuração (carregando, backend antigo) também não fala", () => {
    audio.configure(null);

    expect(audio.say("reconhecimento_facial_cadastrado")).toBe(false);
    expect(createElement).not.toHaveBeenCalled();
  });

  it("os bipes de sucesso e erro continuam tocando", () => {
    audio.configure({ enabled: false, voice: "telma" });

    audio.play("/audio/sucesso.wav");

    expect(player().src).toBe("/audio/sucesso.wav");
    expect(player().play).toHaveBeenCalledOnce();
  });

  it("desligado, a troca de pose não corta o bipe que estiver tocando", () => {
    audio.configure({ enabled: false, voice: "telma" });
    audio.play("/audio/erro.wav");

    audio.say(null);

    expect(player().playing).toBe(true);
  });
});

describe("seleção de voz", () => {
  it.each(TOTEM_VOICES.map((voice) => voice.value))(
    "voz %s toca a fala da própria pasta",
    (voice) => {
      audio.configure({ enabled: true, voice });

      expect(audio.say("virar_rosto_esquerda")).toBe(true);
      expect(player().src).toBe(`/audio/${voice}/virar_rosto_esquerda_${voice}.mp3`);
    }
  );

  it("trocar a voz vale a partir da próxima fala", () => {
    audio.configure({ enabled: true, voice: "telma" });
    audio.say("dados_removidos");

    audio.configure({ enabled: true, voice: "eduardo" });
    audio.say("dados_removidos");

    expect(player().src).toBe("/audio/eduardo/dados_removidos_eduardo.mp3");
  });

  it("toda fala de toda voz aponta para um arquivo gravado (com a grafia exata)", () => {
    const audioDir = path.join(process.cwd(), "public", "audio");

    for (const { value: voice } of TOTEM_VOICES) {
      // readdir devolve o nome real em disco: pega "Telma" x "telma" até no
      // Windows, que ignora maiúsculas, antes de virar 404 no servidor Linux
      expect(fs.readdirSync(audioDir), voice).toContain(voice);
      const files = fs.readdirSync(path.join(audioDir, voice));
      for (const cue of CUES) {
        expect(files, voiceCueUrl(voice, cue)).toContain(path.basename(voiceCueUrl(voice, cue)));
      }
    }
  });
});

describe("interrupção e não sobreposição", () => {
  it("interrompe a fala atual antes de começar a próxima", () => {
    audio.configure({ enabled: true, voice: "telma" });

    audio.say("virar_rosto_direita");
    const start = FakeAudio.log.length;
    audio.say("virar_rosto_esquerda");

    expect(FakeAudio.log.slice(start)).toEqual([
      "pause",
      "src /audio/telma/virar_rosto_esquerda_telma.mp3",
      "play",
    ]);
  });

  it("aluno rápido: a direita é cortada no meio e só a esquerda segue tocando", () => {
    audio.configure({ enabled: true, voice: "eduardo" });

    audio.say("virar_rosto_direita");
    audio.say("virar_rosto_esquerda");

    expect(FakeAudio.overlaps).toBe(0);
    expect(player().playing).toBe(true);
    expect(player().src).toBe("/audio/eduardo/virar_rosto_esquerda_eduardo.mp3");
  });

  it("nunca dois áudios ao mesmo tempo, com falas e bipes misturados", () => {
    audio.configure({ enabled: true, voice: "telma" });

    audio.say("virar_rosto_direita");
    audio.play("/audio/erro.wav");
    audio.say("virar_rosto_esquerda");
    audio.say(null);
    audio.say("reconhecimento_facial_cadastrado");
    audio.play("/audio/sucesso.wav");
    audio.say("dados_removidos");

    expect(FakeAudio.overlaps).toBe(0);
    // Um só player para tudo — nada de um <audio> novo por clipe
    expect(createElement).toHaveBeenCalledOnce();
  });

  it("orientação sem fala (centro) cala a anterior", () => {
    audio.configure({ enabled: true, voice: "telma" });
    audio.say("virar_rosto_esquerda");

    expect(audio.say(null)).toBe(false);
    expect(player().playing).toBe(false);
  });

  it("stop interrompe o que estiver tocando", () => {
    audio.configure({ enabled: true, voice: "telma" });
    audio.say("dados_removidos");

    audio.stop();

    expect(player().playing).toBe(false);
  });
});

describe("navegador bloqueando o autoplay", () => {
  it("play rejeitado não vira erro sem tratamento", async () => {
    const blocked = new FakeAudio();
    blocked.play = vi.fn(() => Promise.reject(new DOMException("blocked", "NotAllowedError")));
    const channel = new TotemAudio(() => blocked as unknown as HTMLAudioElement);
    channel.configure({ enabled: true, voice: "telma" });

    expect(channel.say("dados_removidos")).toBe(true);
    // Uma rejeição não tratada derrubaria a suíte aqui
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it("play que lança direto (navegador antigo) também é silencioso", () => {
    const legacy = new FakeAudio();
    legacy.play = vi.fn(() => {
      throw new Error("not supported");
    });
    const channel = new TotemAudio(() => legacy as unknown as HTMLAudioElement);

    expect(() => channel.play("/audio/sucesso.wav")).not.toThrow();
  });
});
