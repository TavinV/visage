/**
 * Testes críticos — AES-256-GCM no backend (utils/crypto.ts).
 *
 * Garante que InvalidTag (tag GCM adulterada) NUNCA é silenciado:
 * decipher.final() deve lançar e o erro deve propagar ao caller.
 */

import { describe, it, expect } from "vitest";
import { randomBytes } from "crypto";
import { aesGcmEncrypt, aesGcmDecrypt, generateIV, generateKey } from "../src/utils/crypto";

describe("AES-256-GCM (utils/crypto)", () => {
  it("roundtrip cifra → decifra recupera o plaintext", () => {
    const key = generateKey(32);
    const plaintext = randomBytes(2048); // mesmo tamanho de um embedding

    const { iv, tag, ciphertext } = aesGcmEncrypt(key, plaintext);
    const recovered = aesGcmDecrypt(key, iv, tag, ciphertext);

    expect(recovered.equals(plaintext)).toBe(true);
  });

  it("lança ao decifrar com a chave errada (cross-tenant) — nunca retorna dados", () => {
    const keyA = generateKey(32);
    const keyB = generateKey(32);
    const { iv, tag, ciphertext } = aesGcmEncrypt(keyA, randomBytes(2048));

    expect(() => aesGcmDecrypt(keyB, iv, tag, ciphertext)).toThrow();
  });

  it("lança quando o ciphertext é adulterado (InvalidTag nunca silenciado)", () => {
    const key = generateKey(32);
    const { iv, tag, ciphertext } = aesGcmEncrypt(key, randomBytes(2048));

    const tampered = Buffer.from(ciphertext);
    tampered[0] ^= 0xff;

    expect(() => aesGcmDecrypt(key, iv, tag, tampered)).toThrow();
  });

  it("lança quando a tag é adulterada", () => {
    const key = generateKey(32);
    const { iv, tag, ciphertext } = aesGcmEncrypt(key, randomBytes(2048));

    const tamperedTag = Buffer.from(tag);
    tamperedTag[15] ^= 0x01;

    expect(() => aesGcmDecrypt(key, iv, tamperedTag, ciphertext)).toThrow();
  });

  it("gera IV único por operação (nunca reutilizar)", () => {
    const ivs = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ivs.add(generateIV().toString("hex"));
    }
    expect(ivs.size).toBe(100);
  });
});
