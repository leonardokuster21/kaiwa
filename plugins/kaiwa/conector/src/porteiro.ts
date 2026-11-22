// O porteiro confere cada mensagem antes de sair. É determinístico de propósito:
// a mesma mensagem dá sempre o mesmo resultado, e dá para medir (canários).
// Não entende sentido: paráfrase passa. Por isso o dossiê mínimo vem antes e o humano vem depois.

export interface Politica {
  /** Para o Claude da sala (vão para o CLAUDE.md da sessão). */
  pode_dizer?: string[]
  nao_pode?: string[]
  perguntar_antes?: string[]
  /** Para o porteiro. */
  termos_proibidos?: string[]
  canarios?: string[]
  padroes?: string[] // nomes de PADROES abaixo
  max_caracteres?: number
}

export interface Veredito {
  ok: boolean
  motivos: string[]
}

const PADROES: Record<string, RegExp> = {
  cpf: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/,
  cnpj: /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/,
  email: /[\w.+-]+@[\w-]+\.[\w.-]+/,
  telefone: /(?:\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b/,
  cartao: /\b(?:\d[ -]?){13,19}\b/,
}

export const PADROES_CONHECIDOS = Object.keys(PADROES)

function normalizar(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

export function conferir(texto: string, p: Politica): Veredito {
  const motivos: string[] = []
  const max = p.max_caracteres ?? 4000
  if (texto.length > max) motivos.push(`passa de ${max} caracteres (${texto.length})`)
  const t = normalizar(texto)
  for (const c of p.canarios ?? []) if (c && t.includes(normalizar(c))) motivos.push(`canário: ${c}`)
  for (const termo of p.termos_proibidos ?? []) if (termo && t.includes(normalizar(termo))) motivos.push(`termo proibido: ${termo}`)
  for (const nome of p.padroes ?? []) {
    const re = PADROES[nome]
    if (re && re.test(texto)) motivos.push(`parece ${nome}`)
  }
  return { ok: motivos.length === 0, motivos }
}
