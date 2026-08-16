/**
 * Diff de estado para a trilha de auditoria.
 *
 * Produz o par antes/depois que a coluna beforeState/afterState guarda, com
 * duas garantias inegociáveis:
 *
 *   1. Só os campos que MUDARAM entram. Gravar o registro inteiro em toda
 *      edição incha a tabela e esconde o que interessa no meio do ruído.
 *   2. Nada sensível é gravado. Hash de senha, chave de API, embedding facial e
 *      afins viram "[redigido]" — a trilha diz QUE o segredo mudou, nunca qual
 *      era. Um vazamento da tabela de auditoria não pode virar vazamento de
 *      credenciais.
 */

/** Substituto gravado no lugar de qualquer valor sensível. */
export const REDACTED = "[redigido]";

/**
 * Campos redigidos por correspondência parcial e case-insensitive no nome.
 * "passwordHash", "apiKeyHash" e "temporaryPassword" caem todos aqui.
 */
const SENSITIVE_PATTERNS = [
  "password",
  "senha",
  "apikey",
  "api_key",
  "token",
  "secret",
  "embedding",
  "hash",
  "dek",
  "masterkey",
];

function isSensitive(field: string): boolean {
  const lower = field.toLowerCase();
  return SENSITIVE_PATTERNS.some((pattern) => lower.includes(pattern));
}

/**
 * Normaliza um valor para JSON estável: Date vira ISO, Decimal/BigInt viram
 * string, undefined vira null. Sem isso o mesmo dado geraria diffs falsos entre
 * uma leitura e outra.
 */
function normalize(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return REDACTED; // bytes cifrados nunca vão para a trilha
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === "object") {
    // Decimal do Prisma e afins expõem toString/toJSON
    const obj = value as Record<string, unknown>;
    if (typeof (obj as { toJSON?: unknown }).toJSON === "function") {
      return (obj as { toJSON: () => unknown }).toJSON();
    }
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(obj)) {
      out[key] = isSensitive(key) ? REDACTED : normalize(inner);
    }
    return out;
  }
  return value;
}

/** Igualdade estrutural sobre valores já normalizados. */
function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Snapshot de um registro inteiro, pronto para beforeState/afterState de
 * criação e exclusão (onde não existe "o outro lado" para comparar).
 * Campos sensíveis já saem redigidos.
 */
export function snapshot(
  entity: Record<string, unknown> | null | undefined,
  fields?: readonly string[],
): Record<string, unknown> | undefined {
  if (!entity) return undefined;
  const keys = fields ?? Object.keys(entity);
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (!(key in entity)) continue;
    out[key] = isSensitive(key) ? REDACTED : normalize(entity[key]);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export interface StateDiff {
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  changedFields: string[];
}

/**
 * Compara dois estados e devolve só o que mudou.
 *
 * @param fields Restringe a comparação a estes campos. Sem isso, compara a
 *   união das chaves dos dois lados — o que serve para entidades pequenas mas
 *   arrasta lixo (updatedAt, contadores desnormalizados) em entidades grandes.
 *
 * Um campo sensível que mudou aparece em changedFields com ambos os lados
 * redigidos: o auditor vê que a senha foi trocada, sem ver senha nenhuma.
 */
export function diffStates(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  fields?: readonly string[],
): StateDiff {
  const beforeObj = before ?? {};
  const afterObj = after ?? {};

  const keys =
    fields ?? [...new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)])];

  const changedFields: string[] = [];
  const beforeState: Record<string, unknown> = {};
  const afterState: Record<string, unknown> = {};

  for (const key of keys) {
    // Campo ausente no payload de update significa "não mexeu", não "apagou"
    if (!(key in beforeObj) && !(key in afterObj)) continue;

    const beforeValue = normalize(beforeObj[key]);
    const afterValue = normalize(afterObj[key]);
    if (sameValue(beforeValue, afterValue)) continue;

    changedFields.push(key);
    if (isSensitive(key)) {
      beforeState[key] = REDACTED;
      afterState[key] = REDACTED;
    } else {
      beforeState[key] = beforeValue;
      afterState[key] = afterValue;
    }
  }

  return {
    changedFields,
    beforeState: changedFields.length ? beforeState : undefined,
    afterState: changedFields.length ? afterState : undefined,
  };
}
