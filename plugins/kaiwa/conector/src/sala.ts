// O coração da sala, sem MCP nem HTTP: dá para testar sozinho.
// Recebe o que o Claude quer dizer, passa pelo porteiro e pela supervisão, manda pelo transporte,
// abre o que chega, mantém o registro e as pendências que só o humano resolve.
import { EventEmitter } from 'node:events'
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { abrir, selar } from './protocolo.ts'
import type { Conteudo, Convite, Envelope } from './protocolo.ts'
import { conferir } from './porteiro.ts'
import type { Politica } from './porteiro.ts'
import type { Transporte } from './transporte.ts'

export type Supervisao = 'livre' | 'pausado' // o "aprovar cada fala" saiu na 0.1.2; sala antiga com ele roda como livre

export interface ConfigSala {
  id: string
  objetivo: string
  criadaEm: string
  abre: string // quem fala primeiro
  participantes: { id: string; nome: string }[]
  limites: { rodadas: number; caracteres: number } // rodadas 0: sem limite de falas (o padrão desde a 0.1.2)
  supervisao: Supervisao | 'aprovar' // 'aprovar': só em salas criadas antes da 0.1.2
  /** 1.0: a sala nasce em escuta. Os Claudes só leem até os dois humanos clicarem em "pode começar". */
  escuta?: boolean
}

export type TipoEvento =
  | 'fala' // de um Claude
  | 'humano_sala' // regra ou decisão de um humano, que os dois lados veem
  | 'humano_privado' // regra ou decisão do meu humano, só para o meu Claude
  | 'conclusao' | 'aceite' | 'recusa' | 'encerrar'
  | 'nome' // o nome que um humano escolheu (1.0)
  | 'pronto' // o "pode começar" de um humano: texto 'sim' ou 'nao' (1.0)
  | 'objetivo' // o objetivo combinado, registrado por um Claude (1.0)
  | 'sistema' // o conector avisando

export interface Evento {
  id: string
  quando: string
  de: string
  tipo: TipoEvento
  texto: string
  direcao: 'saiu' | 'chegou' | 'local'
  rodada?: number
  categoria?: 'regra' | 'decisao' // só em registros antigos: desde a 0.1.2 o humano manda mensagem pura
  ref?: string
}

export type TipoPendencia = 'porteiro' | 'permissao' | 'decisao' | 'ata'

export interface Pendencia {
  id: string
  tipo: TipoPendencia
  criadaEm: string
  titulo: string
  texto: string
  motivos?: string[]
  opcoes?: string[]
  conjunta?: boolean
  /** O que fazer ao aprovar: a fala ou a conclusão segurada, ou o request_id da permissão. */
  carga?: { tipo: 'fala' | 'conclusao'; texto: string } | { request_id: string }
}

/** Uma pendência que já saiu da fila: o que o humano fez, ou por que ela saiu sem resposta. */
export interface Resolvida {
  id: string
  tipo: TipoPendencia
  titulo: string
  texto: string
  conjunta?: boolean
  criadaEm: string
  resolvidaEm: string
  acao: string // a ação do humano (aceitar, recusar, aprovar, descartar, permitir, negar, responder) ou 'sem_resposta'
  resposta?: string // a resposta ou a nota que ele escreveu
  motivo?: string // por que saiu sem resposta (ata substituída, sala encerrada...)
}

export interface AvisoClaude {
  tipo: TipoEvento
  de: string
  texto: string
  rodada?: number
  categoria?: 'regra' | 'decisao'
  id: string
}

export interface ResultadoFala {
  estado: 'enviada' | 'segurada' | 'recusada'
  detalhe: string
}

export interface OpcoesSala {
  pasta: string // a pasta deste lado (registro, ata)
  config: ConfigSala
  convite: Convite
  eu: string
  politica: Politica
  transporte: Transporte
  avisarClaude: (a: AvisoClaude) => void
}

const ESCUTA = 'A sala ainda está em escuta: os humanos estão combinando o objetivo no campo deles. Leia o que eles escrevem e espere os dois liberarem a conversa; o conector avisa.'

export class Sala extends EventEmitter {
  readonly config: ConfigSala
  readonly eu: string
  supervisao: Supervisao
  private o: OpcoesSala
  private registro: Evento[] = []
  private vistos = new Set<string>()
  private pendencias = new Map<string, Pendencia>()
  private resolvidas: Resolvida[] = []
  private rodadas = new Map<string, number>()
  private conclusao: { ref: string; texto: string; aceites: Set<string> } | null = null
  encerrada: string | null = null
  descartados = 0
  private nomes = new Map<string, string>()
  private prontos = new Set<string>()
  iniciada: boolean
  private objetivoCombinado = ''

  constructor(o: OpcoesSala) {
    super()
    this.o = o
    this.config = o.config
    this.eu = o.eu
    this.supervisao = o.config.supervisao === 'pausado' ? 'pausado' : 'livre'
    this.iniciada = !o.config.escuta
    if (!o.config.participantes.some(p => p.id === o.eu)) throw new Error(`${o.eu} não é participante desta sala`)
    this.recarregar()
  }

  private get arquivoRegistro() {
    return join(this.o.pasta, 'registro.jsonl')
  }

  private get arquivoResolvidas() {
    return join(this.o.pasta, 'pendencias-resolvidas.jsonl')
  }

  /** Reconstrói o estado a partir do registro (o conector pode reiniciar sem perder a conversa). */
  private recarregar() {
    if (existsSync(this.arquivoResolvidas)) {
      for (const linha of readFileSync(this.arquivoResolvidas, 'utf8').split('\n')) if (linha.trim()) this.resolvidas.push(JSON.parse(linha) as Resolvida)
    }
    if (!existsSync(this.arquivoRegistro)) return
    for (const linha of readFileSync(this.arquivoRegistro, 'utf8').split('\n')) {
      if (!linha.trim()) continue
      const ev = JSON.parse(linha) as Evento
      this.registro.push(ev)
      this.vistos.add(ev.id)
      this.aplicar(ev)
    }
  }

  private aplicar(ev: Evento) {
    if (ev.tipo === 'fala') this.rodadas.set(ev.de, Math.max(this.rodadas.get(ev.de) ?? 0, ev.rodada ?? 0))
    if (ev.tipo === 'conclusao') this.conclusao = { ref: ev.ref ?? ev.id, texto: ev.texto, aceites: new Set() }
    if (ev.tipo === 'aceite' && this.conclusao && ev.ref === this.conclusao.ref) this.conclusao.aceites.add(ev.de)
    if (ev.tipo === 'recusa') this.conclusao = null
    if (ev.tipo === 'encerrar') this.encerrada = ev.texto
    if (ev.tipo === 'nome') this.nomes.set(ev.de, ev.texto)
    if (ev.tipo === 'objetivo') this.objetivoCombinado = ev.texto
    if (ev.tipo === 'pronto') {
      if (ev.texto === 'sim') this.prontos.add(ev.de)
      else this.prontos.delete(ev.de)
      if (!this.iniciada && this.config.participantes.every(p => this.prontos.has(p.id))) this.iniciada = true
    }
  }

  private anotar(ev: Evento) {
    const antes = this.iniciada
    this.registro.push(ev)
    this.vistos.add(ev.id)
    this.aplicar(ev)
    appendFileSync(this.arquivoRegistro, JSON.stringify(ev) + '\n', 'utf8')
    if (!antes && this.iniciada) this.comecou()
    this.emit('mudou')
  }

  private avisar(ev: Evento) {
    if (ev.tipo === 'sistema' || !this.encerrada || ev.tipo === 'encerrar') {
      this.o.avisarClaude({ tipo: ev.tipo, de: ev.de, texto: ev.texto, rodada: ev.rodada, categoria: ev.categoria, id: ev.id })
    }
  }

  /** Os dois humanos liberaram: avisa o Claude, dizendo quem abre. */
  private comecou() {
    if (this.config.abre === this.eu) {
      this.sistema('Os dois humanos liberaram a conversa. Você abre: primeiro registre o objetivo que eles combinaram, com definir_objetivo (uma ou duas frases); depois apresente-se e proponha a pauta, com falar.')
    } else {
      this.sistema(`Os dois humanos liberaram a conversa. O Claude de ${this.nome(this.config.abre)} abre: espere a primeira fala dele e responda.`)
    }
  }

  private sistema(texto: string) {
    const ev: Evento = { id: randomUUID(), quando: new Date().toISOString(), de: 'conector', tipo: 'sistema', texto, direcao: 'local' }
    this.anotar(ev)
    this.avisar(ev)
  }

  private mandar(c: Conteudo): Evento {
    const env = selar(this.o.convite, this.eu, c)
    this.o.transporte.enviar(env)
    const ev: Evento = { id: env.messageId, quando: env.enviadaEm, de: this.eu, tipo: mapear(c), texto: c.texto, direcao: 'saiu', rodada: c.rodada, categoria: c.categoria, ref: c.ref }
    if (c.tipo === 'conclusao') ev.ref = env.messageId
    this.anotar(ev)
    return ev
  }

  iniciar() {
    this.o.transporte.iniciar(e => this.receber(e))
  }

  parar() {
    this.o.transporte.parar()
  }

  rodadaDe(id: string) {
    return this.rodadas.get(id) ?? 0
  }

  // ---------- o que o Claude da sala faz (ferramentas) ----------

  falar(texto: string): ResultadoFala {
    if (this.encerrada) return { estado: 'recusada', detalhe: `A sala está encerrada (${this.encerrada}).` }
    if (!this.iniciada) return { estado: 'recusada', detalhe: ESCUTA }
    if (this.supervisao === 'pausado') return { estado: 'recusada', detalhe: 'O humano pausou a sala. Espere ele retomar.' }
    const limite = this.config.limites.rodadas
    if (limite > 0 && this.rodadaDe(this.eu) >= limite) return { estado: 'recusada', detalhe: `Você chegou ao limite de ${limite} falas. Use propor_conclusao com a ata, ou encerrar.` }
    const v = conferir(texto, { ...this.o.politica, max_caracteres: this.config.limites.caracteres })
    if (!v.ok) {
      this.anotarPorteiro(v.motivos)
      this.novaPendencia({ tipo: 'porteiro', titulo: 'O porteiro segurou uma fala', texto, motivos: v.motivos, carga: { tipo: 'fala', texto } })
      return { estado: 'segurada', detalhe: `O porteiro segurou a mensagem (${v.motivos.join('; ')}). Ela não saiu. O humano decide no painel; reformule sem esse conteúdo se puder.` }
    }
    return this.enviarFala(texto)
  }

  private enviarFala(texto: string): ResultadoFala {
    const rodada = this.rodadaDe(this.eu) + 1
    this.mandar({ tipo: 'fala', texto, rodada })
    const limite = this.config.limites.rodadas
    if (!limite) return { estado: 'enviada', detalhe: `Enviada (fala ${rodada}; a sala não tem limite de falas).` }
    const restam = limite - rodada
    return { estado: 'enviada', detalhe: `Enviada (fala ${rodada} de ${limite}; restam ${restam}).${restam <= 2 ? ' Está perto do fim: prepare a ata.' : ''}` }
  }

  /** O Claude registra o objetivo que os humanos combinaram; aparece no topo das duas telas. */
  definirObjetivo(texto: string): ResultadoFala {
    if (this.encerrada) return { estado: 'recusada', detalhe: 'A sala está encerrada.' }
    if (!this.iniciada) return { estado: 'recusada', detalhe: ESCUTA }
    if (!texto.trim()) return { estado: 'recusada', detalhe: 'O objetivo veio vazio.' }
    const v = conferir(texto, { ...this.o.politica, max_caracteres: 1000 })
    if (!v.ok) return { estado: 'segurada', detalhe: `O porteiro segurou o objetivo (${v.motivos.join('; ')}). Reescreva sem esse conteúdo.` }
    this.mandar({ tipo: 'objetivo', texto: texto.trim() })
    this.emit('mudou')
    return { estado: 'enviada', detalhe: 'O objetivo está no topo das duas telas.' }
  }

  pedirDecisao(pergunta: string, opcoes: string[] = []) {
    this.novaPendencia({ tipo: 'decisao', titulo: 'O seu Claude pede uma decisão', texto: pergunta, opcoes })
    return 'A pergunta está no painel do seu humano. A resposta chega como decisão privada.'
  }

  proporConclusao(texto: string): ResultadoFala {
    if (this.encerrada) return { estado: 'recusada', detalhe: 'A sala está encerrada.' }
    if (!this.iniciada) return { estado: 'recusada', detalhe: ESCUTA }
    const abertas = [...this.pendencias.values()].filter(p => p.tipo === 'decisao' || p.tipo === 'porteiro')
    if (abertas.length) return { estado: 'recusada', detalhe: `Há ${abertas.length} pendência(s) do seu humano em aberto (decisão ou fala segurada). Espere ele resolver; a ata precisa refletir o que ele decidir.` }
    const v = conferir(texto, { ...this.o.politica, max_caracteres: Math.max(this.config.limites.caracteres, 8000) })
    if (!v.ok) {
      this.anotarPorteiro(v.motivos)
      this.novaPendencia({ tipo: 'porteiro', titulo: 'O porteiro segurou a ata', texto, motivos: v.motivos, carga: { tipo: 'conclusao', texto } })
      return { estado: 'segurada', detalhe: `O porteiro segurou a ata (${v.motivos.join('; ')}).` }
    }
    this.enviarConclusao(texto)
    return { estado: 'enviada', detalhe: 'A ata foi proposta. Os dois humanos aprovam ou recusam no painel; a sala conclui quando os dois aceitarem.' }
  }

  private enviarConclusao(texto: string) {
    this.limparPendencias('ata', 'substituída por uma nova proposta de ata')
    this.mandar({ tipo: 'conclusao', texto })
    this.novaPendencia({ tipo: 'ata', titulo: 'Aprovar a ata (os dois lados precisam aceitar)', texto, conjunta: true })
  }

  encerrar(motivo: string, por: 'claude' | 'humano') {
    if (this.encerrada) return
    this.mandar({ tipo: 'encerrar', texto: `${por === 'humano' ? 'humano' : 'Claude'} de ${this.nome(this.eu)}: ${motivo}` })
    this.limparPendencias(undefined, 'a sala foi encerrada')
    if (por === 'humano') this.sistema(`O humano encerrou a sala: ${motivo}. Não fale mais.`)
    this.emit('mudou')
  }

  // ---------- o que o humano faz (a tela) ----------

  /** Mensagem pura do humano (desde a 0.1.2, sem "regra" ou "decisão"): o Claude interpreta pelo conteúdo. */
  humano(destino: 'sala' | 'meu', texto: string) {
    if (!texto.trim()) return
    if (destino === 'sala') {
      const ev = this.mandar({ tipo: 'humano', texto })
      this.avisar(ev)
    } else {
      const ev: Evento = { id: randomUUID(), quando: new Date().toISOString(), de: this.eu, tipo: 'humano_privado', texto, direcao: 'local' }
      this.anotar(ev)
      this.avisar(ev)
    }
  }

  /** O humano escolhe como aparece na sala; o nome vai ao outro lado e aos dois Claudes. */
  definirNome(nome: string) {
    const n = nome.trim().replace(/\s+/g, ' ').slice(0, 60)
    if (!n || this.nomes.get(this.eu) === n) return
    const ev = this.mandar({ tipo: 'nome', texto: n })
    this.avisar(ev)
    this.emit('mudou')
  }

  /** O "pode começar" do humano (ou "ainda não"). Quando os dois dizem sim, a conversa começa e não volta à escuta. */
  marcarPronto(sim: boolean) {
    if (this.iniciada || this.encerrada) return
    this.mandar({ tipo: 'pronto', texto: sim ? 'sim' : 'nao' })
    this.emit('mudou')
  }

  mudarSupervisao(modo: Supervisao) {
    this.supervisao = modo
    this.sistema(modo === 'pausado' ? 'O humano pausou a sala: não fale até ele retomar.' : 'O humano retomou a sala: a conversa pode continuar.')
  }

  resolver(id: string, acao: string, resposta = ''): string {
    const p = this.pendencias.get(id)
    if (!p) return 'pendência não encontrada'
    if (p.tipo === 'porteiro') {
      const carga = p.carga as { tipo: 'fala' | 'conclusao'; texto: string }
      if (acao === 'aprovar') {
        this.pendencias.delete(id)
        if (carga.tipo === 'fala') {
          const r = this.enviarFala(carga.texto)
          this.sistema(`O humano liberou a mensagem que o porteiro segurou. ${r.detalhe}`)
        } else {
          this.enviarConclusao(carga.texto)
          this.sistema('O humano liberou a ata que o porteiro segurou; ela foi proposta.')
        }
      } else {
        this.pendencias.delete(id)
        this.sistema(`O humano descartou a sua ${carga.tipo === 'fala' ? 'mensagem' : 'ata'}; ela não saiu.${resposta ? ` Nota dele: ${resposta}` : ''}`)
      }
    } else if (p.tipo === 'decisao') {
      this.pendencias.delete(id)
      const ev: Evento = { id: randomUUID(), quando: new Date().toISOString(), de: this.eu, tipo: 'humano_privado', texto: `Resposta à sua pergunta "${p.texto}": ${resposta || acao}`, direcao: 'local' }
      this.anotar(ev)
      this.avisar(ev)
    } else if (p.tipo === 'permissao') {
      this.pendencias.delete(id)
      const { request_id } = p.carga as { request_id: string }
      this.emit('veredito', { request_id, behavior: acao === 'permitir' ? 'allow' : 'deny' })
    } else if (p.tipo === 'ata') {
      if (!this.conclusao) {
        this.pendencias.delete(id)
        this.arquivar(p, 'sem_resposta', '', 'a ata já não estava em aberto')
        this.emit('mudou')
        return 'não há ata em aberto'
      }
      this.pendencias.delete(id)
      if (acao === 'aceitar') {
        this.mandar({ tipo: 'aceite', texto: 'aceito', ref: this.conclusao.ref })
        this.conferirConclusao()
      } else {
        this.mandar({ tipo: 'recusa', texto: resposta || 'recusada sem motivo', ref: this.conclusao.ref })
        this.sistema(`O seu humano recusou a ata: ${resposta || 'sem motivo'}. Continuem e proponham outra.`)
      }
    }
    if (!this.pendencias.has(id)) this.arquivar(p, acao, resposta)
    this.emit('mudou')
    return 'ok'
  }

  pedirPermissao(r: { request_id: string; tool_name: string; description: string; input_preview: string }) {
    this.novaPendencia({ tipo: 'permissao', titulo: `O Claude Code pede permissão: ${r.tool_name}`, texto: `${r.description}\n${r.input_preview}`, carga: { request_id: r.request_id } })
  }

  // ---------- o que chega ----------

  receber(e: Envelope) {
    if (this.vistos.has(e.messageId) || e.de === this.eu) return
    if (!this.config.participantes.some(p => p.id === e.de)) {
      this.descartados++
      return
    }
    let c: Conteudo
    try {
      c = abrir(this.o.convite, e)
    } catch {
      this.descartados++ // não abre com o convite: não é desta sala, ou foi adulterado
      this.emit('mudou')
      return
    }
    const ev: Evento = { id: e.messageId, quando: e.enviadaEm, de: e.de, tipo: mapear(c), texto: c.texto, direcao: 'chegou', rodada: c.rodada, categoria: c.categoria, ref: c.tipo === 'conclusao' ? e.messageId : c.ref }
    const estavaEncerrada = this.encerrada
    this.anotar(ev)
    if (estavaEncerrada) return
    if (c.tipo === 'conclusao') {
      this.limparPendencias('ata', 'o outro lado propôs uma nova ata')
      this.novaPendencia({ tipo: 'ata', titulo: 'O outro lado propôs a ata (os dois lados precisam aceitar)', texto: c.texto, conjunta: true })
    }
    if (c.tipo === 'aceite') this.conferirConclusao()
    if (c.tipo === 'recusa') this.limparPendencias('ata', 'o outro lado recusou a ata')
    if (c.tipo === 'encerrar') this.limparPendencias(undefined, 'a sala foi encerrada')
    if (c.tipo !== 'aceite' && c.tipo !== 'pronto') this.avisar(ev)
  }

  private conferirConclusao() {
    if (!this.conclusao) return
    const todos = this.config.participantes.every(p => this.conclusao!.aceites.has(p.id))
    if (!todos) return
    writeFileSync(join(this.o.pasta, 'ata.md'), `# Ata da sala ${this.config.id}\n\n> Objetivo: ${this.objetivoCombinado || this.config.objetivo || '(combinado pelos humanos na sala)'}\n> Aprovada pelos dois lados em ${new Date().toISOString()}.\n\n${this.conclusao.texto}\n`, 'utf8')
    const ev: Evento = { id: randomUUID(), quando: new Date().toISOString(), de: 'conector', tipo: 'encerrar', texto: 'ata aprovada pelos dois lados', direcao: 'local' }
    this.anotar(ev)
    this.limparPendencias(undefined, 'a ata foi aprovada pelos dois lados')
    this.o.avisarClaude({ tipo: 'sistema', de: 'conector', texto: 'A ata foi aprovada pelos dois humanos. A sala está concluída: não fale mais.', id: ev.id })
  }

  // ---------- pendências e retrato ----------

  /** O que o porteiro segurou, sem o texto: serve à medição (sala medir). */
  private anotarPorteiro(motivos: string[]) {
    appendFileSync(join(this.o.pasta, 'porteiro.jsonl'), JSON.stringify({ quando: new Date().toISOString(), motivos }) + '\n', 'utf8')
  }

  private novaPendencia(p: Omit<Pendencia, 'id' | 'criadaEm'>) {
    const id = randomUUID().slice(0, 8)
    this.pendencias.set(id, { id, criadaEm: new Date().toISOString(), ...p })
    this.emit('mudou')
  }

  private limparPendencias(tipo: TipoPendencia | undefined, motivo: string) {
    for (const [id, p] of this.pendencias) {
      if (tipo && p.tipo !== tipo) continue
      this.pendencias.delete(id)
      this.arquivar(p, 'sem_resposta', '', motivo)
    }
  }

  /** Guarda a pendência resolvida no histórico (e no disco: sobrevive a um reinício do conector). */
  private arquivar(p: Pendencia, acao: string, resposta = '', motivo = '') {
    const r: Resolvida = { id: p.id, tipo: p.tipo, titulo: p.titulo, texto: p.texto, criadaEm: p.criadaEm, resolvidaEm: new Date().toISOString(), acao, ...(p.conjunta ? { conjunta: true } : {}), ...(resposta ? { resposta } : {}), ...(motivo ? { motivo } : {}) }
    this.resolvidas.push(r)
    appendFileSync(this.arquivoResolvidas, JSON.stringify(r) + '\n', 'utf8')
  }

  nome(id: string) {
    return this.nomes.get(id) ?? this.config.participantes.find(p => p.id === id)?.nome ?? id
  }

  retrato() {
    return {
      sala: this.config,
      eu: this.eu,
      supervisao: this.supervisao,
      rodadas: Object.fromEntries(this.config.participantes.map(p => [p.id, this.rodadaDe(p.id)])),
      eventos: this.registro.slice(-500),
      pendencias: [...this.pendencias.values()],
      resolvidas: this.resolvidas.slice(-300),
      nomes: Object.fromEntries(this.nomes),
      prontos: [...this.prontos],
      iniciada: this.iniciada,
      objetivo: this.objetivoCombinado || this.config.objetivo,
      vivos: this.o.transporte.vivos(),
      encerrada: this.encerrada,
      conclusao: this.conclusao ? { ref: this.conclusao.ref, texto: this.conclusao.texto, aceites: [...this.conclusao.aceites] } : null,
      descartados: this.descartados,
    }
  }
}

function mapear(c: Conteudo): TipoEvento {
  return c.tipo === 'humano' ? 'humano_sala' : c.tipo
}
