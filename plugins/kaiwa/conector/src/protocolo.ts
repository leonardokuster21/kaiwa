// O envelope da sala (contrato em protocolo/README.md).
// Cabeçalho em claro, só com o necessário para entregar; o resto vai cifrado com AES-256-GCM,
// e o cabeçalho entra como dado associado: quem não tem o segredo do convite não lê nem forja.
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, randomUUID } from 'node:crypto'

export const VERSAO = 1

export type TipoConteudo = 'fala' | 'humano' | 'conclusao' | 'aceite' | 'recusa' | 'encerrar'

export interface Conteudo {
  tipo: TipoConteudo
  texto: string
  /** fala: a rodada de quem fala. humano: 'regra' ou 'decisao'. aceite/recusa: o id da conclusão. */
  rodada?: number
  categoria?: 'regra' | 'decisao'
  ref?: string
}

export interface Envelope {
  v: number
  contextId: string // a sala
  messageId: string
  de: string // o participante que mandou
  enviadaEm: string // ISO 8601
  cifra: { iv: string; dados: string; tag: string }
}

export interface Convite {
  sala: string
  segredo: string // base64url, 32 bytes
  relay?: string // Fase 1: a URL do relay; sem ela, transporte local (Fase 0)
}

const PREFIXO_CONVITE = 'sala1'

export function novoConvite(sala: string): Convite {
  return { sala, segredo: randomBytes(32).toString('base64url') }
}

export function convitePraTexto(c: Convite): string {
  const base = `${PREFIXO_CONVITE}.${c.sala}.${c.segredo}`
  return c.relay ? `${base}.${Buffer.from(c.relay).toString('base64url')}` : base
}

export function textoPraConvite(texto: string): Convite {
  const partes = texto.trim().split('.')
  if ((partes.length !== 3 && partes.length !== 4) || partes[0] !== PREFIXO_CONVITE) throw new Error('convite inválido')
  const [, sala, segredo, relay64] = partes
  if (!/^[a-z0-9-]{3,64}$/.test(sala) || Buffer.from(segredo, 'base64url').length !== 32) throw new Error('convite inválido')
  if (relay64 === undefined) return { sala, segredo }
  const relay = Buffer.from(relay64, 'base64url').toString('utf8')
  if (!/^https?:\/\/[^\s]+$/.test(relay)) throw new Error('convite inválido')
  return { sala, segredo, relay: relay.replace(/\/+$/, '') }
}

/** O acesso ao relay: derivado do convite, diferente da chave do conteúdo. O relay guarda só o hash dele. */
export function acessoRelay(c: Convite): string {
  return Buffer.from(hkdfSync('sha256', Buffer.from(c.segredo, 'base64url'), Buffer.from(c.sala), Buffer.from('sala/v1/acesso'), 32)).toString('base64url')
}

export function verificador(acesso: string): string {
  return createHash('sha256').update(acesso).digest('hex')
}

/** Cifra um objeto qualquer (a configuração da sala guardada no relay) com a chave do conteúdo. */
export function cifrarObjeto(c: Convite, rotulo: string, obj: unknown): Envelope['cifra'] {
  const iv = randomBytes(12)
  const cifrador = createCipheriv('aes-256-gcm', chave(c), iv)
  cifrador.setAAD(Buffer.from(`${c.sala}/${rotulo}`))
  const dados = Buffer.concat([cifrador.update(JSON.stringify(obj), 'utf8'), cifrador.final()])
  return { iv: iv.toString('base64url'), dados: dados.toString('base64url'), tag: cifrador.getAuthTag().toString('base64url') }
}

export function decifrarObjeto<T>(c: Convite, rotulo: string, cifra: Envelope['cifra']): T {
  const decifrador = createDecipheriv('aes-256-gcm', chave(c), Buffer.from(cifra.iv, 'base64url'))
  decifrador.setAAD(Buffer.from(`${c.sala}/${rotulo}`))
  decifrador.setAuthTag(Buffer.from(cifra.tag, 'base64url'))
  return JSON.parse(Buffer.concat([decifrador.update(Buffer.from(cifra.dados, 'base64url')), decifrador.final()]).toString('utf8')) as T
}

function chave(c: Convite): Buffer {
  return Buffer.from(hkdfSync('sha256', Buffer.from(c.segredo, 'base64url'), Buffer.from(c.sala), Buffer.from('sala/v1/cifra'), 32))
}

function cabecalho(e: Pick<Envelope, 'v' | 'contextId' | 'messageId' | 'de' | 'enviadaEm'>): Buffer {
  return Buffer.from(JSON.stringify([e.v, e.contextId, e.messageId, e.de, e.enviadaEm]))
}

export function selar(c: Convite, de: string, conteudo: Conteudo): Envelope {
  const base = { v: VERSAO, contextId: c.sala, messageId: randomUUID(), de, enviadaEm: new Date().toISOString() }
  const iv = randomBytes(12)
  const cifrador = createCipheriv('aes-256-gcm', chave(c), iv)
  cifrador.setAAD(cabecalho(base))
  const dados = Buffer.concat([cifrador.update(JSON.stringify(conteudo), 'utf8'), cifrador.final()])
  return { ...base, cifra: { iv: iv.toString('base64url'), dados: dados.toString('base64url'), tag: cifrador.getAuthTag().toString('base64url') } }
}

/** Abre o envelope. Lança erro se a sala não bate, se foi adulterado ou se não foi selado com este convite. */
export function abrir(c: Convite, e: Envelope): Conteudo {
  if (e.v !== VERSAO) throw new Error(`versão ${e.v} desconhecida`)
  if (e.contextId !== c.sala) throw new Error('envelope de outra sala')
  const decifrador = createDecipheriv('aes-256-gcm', chave(c), Buffer.from(e.cifra.iv, 'base64url'))
  decifrador.setAAD(cabecalho(e))
  decifrador.setAuthTag(Buffer.from(e.cifra.tag, 'base64url'))
  const texto = Buffer.concat([decifrador.update(Buffer.from(e.cifra.dados, 'base64url')), decifrador.final()]).toString('utf8')
  const conteudo = JSON.parse(texto) as Conteudo
  if (typeof conteudo.tipo !== 'string' || typeof conteudo.texto !== 'string') throw new Error('conteúdo malformado')
  return conteudo
}
