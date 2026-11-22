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

export type Supervisao = 'livre' | 'aprovar' | 'pausado'

export interface ConfigSala {
  id: string
  objetivo: string
  criadaEm: string
  abre: string // quem fala primeiro
  participantes: { id: string; nome: string }[]
  limites: { rodadas: number; caracteres: number }
  supervisao: Supervisao
}

export type TipoEvento =
  | 'fala' // de um Claude
  | 'humano_sala' // regra ou decisão de um humano, que os dois lados veem
  | 'humano_privado' // regra ou decisão do meu humano, só para o meu Claude
  | 'conclusao' | 'aceite' | 'recusa' | 'encerrar'
  | 'sistema' // o conector avisando

export interface Evento {
  id: string
  quando: string
  de: string
  tipo: TipoEvento
  texto: string
  direcao: 'saiu' | 'chegou' | 'local'
  rodada?: number
  categoria?: 'regra' | 'decisao'
  ref?: string
}

export type TipoPendencia = 'saida' | 'porteiro' | 'permissao' | 'decisao' | 'ata'

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

export interface AvisoClaude {
  tipo: TipoEvento
  de: string
  texto: string
  rodada?: number
  categoria?: 'regra' | 'decisao'
  id: string
}

export interface ResultadoFala {
  estado: 'enviada' | 'segurada' | 'aguardando_aprovacao' | 'recusada'
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

export class Sala extends EventEmitter {
  readonly config: ConfigSala
  readonly eu: string
  supervisao: Supervisao
  private o: OpcoesSala
  private registro: Evento[] = []
  private vistos = new Set<string>()
  private pendencias = new Map<string, Pendencia>()
  private rodadas = new Map<string, number>()
  private conclusao: { ref: string; texto: string; aceites: Set<string> } | null = null
  encerrada: string | null = null
  descartados = 0

  constructor(o: OpcoesSala) {
    super()
    this.o = o
    this.config = o.config
    this.eu = o.eu
    this.supervisao = o.config.supervisao
    if (!o.config.participantes.some(p => p.id === o.eu)) throw new Error(`${o.eu} não é participante desta sala`)
    this.recarregar()
  }

  private get arquivoRegistro() {
    return join(this.o.pasta, 'registro.jsonl')
  }

  /** Reconstrói o estado a partir do registro (o conector pode reiniciar sem perder a conversa). */
  private recarregar() {
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
  }

  private anotar(ev: Evento) {
    this.registro.push(ev)
    this.vistos.add(ev.id)
    this.aplicar(ev)
    appendFileSync(this.arquivoRegistro, JSON.stringify(ev) + '\n', 'utf8')
    this.emit('mudou')
  }

  private avisar(ev: Evento) {
    if (ev.tipo === 'sistema' || !this.encerrada || ev.tipo === 'encerrar') {
      this.o.avisarClaude({ tipo: ev.tipo, de: ev.de, texto: ev.texto, rodada: ev.rodada, categoria: ev.categoria, id: ev.id })
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
    if (this.supervisao === 'pausado') return { estado: 'recusada', detalhe: 'O humano pausou a sala. Espere ele retomar.' }
    const limite = this.config.limites.rodadas
    if (this.rodadaDe(this.eu) >= limite) return { estado: 'recusada', detalhe: `Você chegou ao limite de ${limite} falas. Use propor_conclusao com a ata, ou encerrar.` }
    const v = conferir(texto, { ...this.o.politica, max_caracteres: this.config.limites.caracteres })
    if (!v.ok) {
      this.anotarPorteiro(v.motivos)
      this.novaPendencia({ tipo: 'porteiro', titulo: 'O porteiro segurou uma fala', texto, motivos: v.motivos, carga: { tipo: 'fala', texto } })
      return { estado: 'segurada', detalhe: `O porteiro segurou a mensagem (${v.motivos.join('; ')}). Ela não saiu. O humano decide no painel; reformule sem esse conteúdo se puder.` }
    }
    if (this.supervisao === 'aprovar') {
      this.novaPendencia({ tipo: 'saida', titulo: 'Aprovar a fala antes de sair', texto, carga: { tipo: 'fala', texto } })
      return { estado: 'aguardando_aprovacao', detalhe: 'A mensagem espera a aprovação do humano. Você será avisado quando sair.' }
    }
    return this.enviarFala(texto)
  }

  private enviarFala(texto: string): ResultadoFala {
    const rodada = this.rodadaDe(this.eu) + 1
    this.mandar({ tipo: 'fala', texto, rodada })
    const restam = this.config.limites.rodadas - rodada
    return { estado: 'enviada', detalhe: `Enviada (fala ${rodada} de ${this.config.limites.rodadas}; restam ${restam}).${restam <= 2 ? ' Está perto do fim: prepare a ata.' : ''}` }
  }

  pedirDecisao(pergunta: string, opcoes: string[] = []) {
    this.novaPendencia({ tipo: 'decisao', titulo: 'O seu Claude pede uma decisão', texto: pergunta, opcoes })
    return 'A pergunta está no painel do seu humano. A resposta chega como decisão privada.'
  }

  proporConclusao(texto: string): ResultadoFala {
    if (this.encerrada) return { estado: 'recusada', detalhe: 'A sala está encerrada.' }
    const abertas = [...this.pendencias.values()].filter(p => p.tipo === 'decisao' || p.tipo === 'saida' || p.tipo === 'porteiro')
    if (abertas.length) return { estado: 'recusada', detalhe: `Há ${abertas.length} pendência(s) do seu humano em aberto (decisão ou fala esperando). Espere ele resolver; a ata precisa refletir o que ele decidir.` }
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
    this.limparPendencias('ata')
    this.mandar({ tipo: 'conclusao', texto })
    this.novaPendencia({ tipo: 'ata', titulo: 'Aprovar a ata (os dois lados precisam aceitar)', texto, conjunta: true })
  }

  encerrar(motivo: string, por: 'claude' | 'humano') {
    if (this.encerrada) return
    this.mandar({ tipo: 'encerrar', texto: `${por === 'humano' ? 'humano' : 'Claude'} de ${this.nome(this.eu)}: ${motivo}` })
    this.limparPendencias()
    if (por === 'humano') this.sistema(`O humano encerrou a sala: ${motivo}. Não fale mais.`)
    this.emit('mudou')
  }

  // ---------- o que o humano faz (a tela) ----------

  humano(categoria: 'regra' | 'decisao', destino: 'sala' | 'meu', texto: string) {
    if (!texto.trim()) return
    if (destino === 'sala') {
      const ev = this.mandar({ tipo: 'humano', texto, categoria })
      this.avisar(ev)
    } else {
      const ev: Evento = { id: randomUUID(), quando: new Date().toISOString(), de: this.eu, tipo: 'humano_privado', texto, direcao: 'local', categoria }
      this.anotar(ev)
      this.avisar(ev)
    }
  }

  mudarSupervisao(modo: Supervisao) {
    this.supervisao = modo
    this.sistema(modo === 'pausado' ? 'O humano pausou a sala: não fale até ele retomar.' : `O humano mudou a supervisão para "${modo}".`)
  }

  resolver(id: string, acao: string, resposta = ''): string {
    const p = this.pendencias.get(id)
    if (!p) return 'pendência não encontrada'
    if (p.tipo === 'saida' || p.tipo === 'porteiro') {
      const carga = p.carga as { tipo: 'fala' | 'conclusao'; texto: string }
      if (acao === 'aprovar') {
        this.pendencias.delete(id)
        if (carga.tipo === 'fala') {
          const r = this.enviarFala(carga.texto)
          this.sistema(p.tipo === 'porteiro' ? `O humano liberou a mensagem que o porteiro segurou. ${r.detalhe}` : `O humano aprovou a sua mensagem. ${r.detalhe}`)
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
      const ev: Evento = { id: randomUUID(), quando: new Date().toISOString(), de: this.eu, tipo: 'humano_privado', categoria: 'decisao', texto: `Resposta à sua pergunta "${p.texto}": ${resposta || acao}`, direcao: 'local' }
      this.anotar(ev)
      this.avisar(ev)
    } else if (p.tipo === 'permissao') {
      this.pendencias.delete(id)
      const { request_id } = p.carga as { request_id: string }
      this.emit('veredito', { request_id, behavior: acao === 'permitir' ? 'allow' : 'deny' })
    } else if (p.tipo === 'ata') {
      if (!this.conclusao) {
        this.pendencias.delete(id)
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
      this.limparPendencias('ata')
      this.novaPendencia({ tipo: 'ata', titulo: 'O outro lado propôs a ata (os dois lados precisam aceitar)', texto: c.texto, conjunta: true })
    }
    if (c.tipo === 'aceite') this.conferirConclusao()
    if (c.tipo === 'recusa') this.limparPendencias('ata')
    if (c.tipo === 'encerrar') this.limparPendencias()
    if (c.tipo !== 'aceite') this.avisar(ev)
  }

  private conferirConclusao() {
    if (!this.conclusao) return
    const todos = this.config.participantes.every(p => this.conclusao!.aceites.has(p.id))
    if (!todos) return
    writeFileSync(join(this.o.pasta, 'ata.md'), `# Ata da sala ${this.config.id}\n\n> Objetivo: ${this.config.objetivo}\n> Aprovada pelos dois lados em ${new Date().toISOString()}.\n\n${this.conclusao.texto}\n`, 'utf8')
    const ev: Evento = { id: randomUUID(), quando: new Date().toISOString(), de: 'conector', tipo: 'encerrar', texto: 'ata aprovada pelos dois lados', direcao: 'local' }
    this.anotar(ev)
    this.limparPendencias()
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

  private limparPendencias(tipo?: TipoPendencia) {
    for (const [id, p] of this.pendencias) if (!tipo || p.tipo === tipo) this.pendencias.delete(id)
  }

  nome(id: string) {
    return this.config.participantes.find(p => p.id === id)?.nome ?? id
  }

  retrato() {
    return {
      sala: this.config,
      eu: this.eu,
      supervisao: this.supervisao,
      rodadas: Object.fromEntries(this.config.participantes.map(p => [p.id, this.rodadaDe(p.id)])),
      eventos: this.registro.slice(-500),
      pendencias: [...this.pendencias.values()],
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
