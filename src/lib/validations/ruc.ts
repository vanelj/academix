/**
 * Validación matemática del RUC peruano (11 dígitos + dígito verificador).
 *
 * Algoritmo (módulo 11): los 10 primeros dígitos se multiplican por los pesos
 * 5, 4, 3, 2, 7, 6, 5, 4, 3, 2; se suma; el verificador es 11 − (suma mod 11),
 * y si el resultado es 10 se usa 0 y si es 11 se usa 1.
 *
 * Superar esta validación NO significa que el RUC esté registrado o activo en
 * SUNAT: solo descarta números mal escritos.
 */
const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2] as const

export function rucTieneOnceDigitos(ruc: string): boolean {
  return /^\d{11}$/.test(ruc)
}

export function digitoVerificadorRuc(primerosDiez: string): number {
  const suma = PESOS.reduce((total, peso, i) => total + peso * Number(primerosDiez[i]), 0)
  const resultado = 11 - (suma % 11)
  return resultado === 10 ? 0 : resultado === 11 ? 1 : resultado
}

export function rucEsValido(ruc: string): boolean {
  return rucTieneOnceDigitos(ruc) && digitoVerificadorRuc(ruc.slice(0, 10)) === Number(ruc[10])
}
