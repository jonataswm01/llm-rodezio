/**
 * Correcoes pontuais para nomes de cidades mal transcritos em audio.
 * Mantem mapeamento explicito para evitar over-correction.
 */

function normalizeForLookup(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const CITY_CORRECTIONS: Record<string, string> = {
  dilberaba: "Uberaba",
  diuberaba: "Uberaba",
  deuberaba: "Uberaba",
};

/**
 * Tenta corrigir uma cidade mal transcrita.
 * Retorna o nome corrigido quando houver mapeamento conhecido; senao, null.
 */
export function tryCorrectCityName(rawName: string): string | null {
  const key = normalizeForLookup(rawName);
  if (!key) return null;
  return CITY_CORRECTIONS[key] ?? null;
}

