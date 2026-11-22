// O transporte é plugável: a sala só conhece esta interface.
// Fase 0: TransporteArquivo, uma pasta compartilhada na mesma máquina. Fase 1: um relay hospedado (relay/).
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Envelope } from './protocolo.ts'

export interface Transporte {
  /** Entrega o envelope aos outros participantes (ou guarda até eles voltarem). */
  enviar(e: Envelope): void
  /** Começa a entregar o que chega. Na partida entrega também o que chegou com o conector desligado (a fila offline). */
  iniciar(aoReceber: (e: Envelope) => void): void
  /** Sinal de vida: quando cada participante deu notícia pela última vez. */
  vivos(): Record<string, number>
  parar(): void
}

/** Cada participante escreve só no próprio arquivo `<id>.jsonl` e lê os dos outros. Nada é apagado. */
export class TransporteArquivo implements Transporte {
  private pasta: string
  private eu: string
  private lidos = new Map<string, number>() // arquivo -> bytes já lidos
  private timers: NodeJS.Timeout[] = []

  constructor(pasta: string, eu: string) {
    this.pasta = pasta
    this.eu = eu
    mkdirSync(pasta, { recursive: true })
  }

  enviar(e: Envelope): void {
    appendFileSync(join(this.pasta, `${this.eu}.jsonl`), JSON.stringify(e) + '\n', 'utf8')
  }

  iniciar(aoReceber: (e: Envelope) => void): void {
    const varrer = () => {
      for (const nome of readdirSync(this.pasta)) {
        if (!nome.endsWith('.jsonl') || nome === `${this.eu}.jsonl`) continue
        const caminho = join(this.pasta, nome)
        const tamanho = statSync(caminho).size
        const ja = this.lidos.get(nome) ?? 0
        if (tamanho <= ja) continue
        const novo = readFileSync(caminho).subarray(ja)
        const ultimaQuebra = novo.lastIndexOf(10) // só linhas completas
        if (ultimaQuebra < 0) continue
        this.lidos.set(nome, ja + ultimaQuebra + 1)
        for (const linha of novo.subarray(0, ultimaQuebra).toString('utf8').split('\n')) {
          if (!linha.trim()) continue
          try {
            aoReceber(JSON.parse(linha) as Envelope)
          } catch {
            // linha corrompida: ignora; a sala registra só o que abre
          }
        }
      }
    }
    const pulsar = () => {
      const marca = join(this.pasta, `${this.eu}.vivo`)
      if (!existsSync(marca)) writeFileSync(marca, '')
      const agora = new Date()
      utimesSync(marca, agora, agora)
    }
    pulsar()
    varrer()
    this.timers.push(setInterval(varrer, 250), setInterval(pulsar, 5000))
  }

  vivos(): Record<string, number> {
    const r: Record<string, number> = {}
    for (const nome of readdirSync(this.pasta)) {
      if (nome.endsWith('.vivo')) r[nome.slice(0, -5)] = statSync(join(this.pasta, nome)).mtimeMs
    }
    return r
  }

  parar(): void {
    for (const t of this.timers) clearInterval(t)
    this.timers = []
  }
}

/**
 * Fase 1: o relay hospedado (relay/). Envia por POST e recebe por long-poll (o relay segura o pedido até chegar algo).
 * O que não sai na hora fica numa fila e é reenviado: a fila offline.
 */
export class TransporteRelay implements Transporte {
  private url: string
  private sala: string
  private eu: string
  private acesso: string
  private fila: Envelope[] = []
  private cursor = 0
  private ultimosVivos: Record<string, number> = {}
  private ativo = false
  private ctrl = new AbortController()
  private bombeando = false

  constructor(url: string, sala: string, eu: string, acesso: string) {
    this.url = url.replace(/\/+$/, '')
    this.sala = sala
    this.eu = eu
    this.acesso = acesso
  }

  private get base() {
    return `${this.url}/salas/${this.sala}`
  }

  private cabecalhos(extra: Record<string, string> = {}) {
    return { Authorization: `Bearer ${this.acesso}`, ...extra }
  }

  enviar(e: Envelope): void {
    this.fila.push(e)
    void this.bombear()
  }

  private async bombear() {
    if (this.bombeando) return
    this.bombeando = true
    try {
      while (this.fila.length) {
        try {
          const r = await fetch(`${this.base}/envelopes`, { method: 'POST', headers: this.cabecalhos({ 'Content-Type': 'application/json' }), body: JSON.stringify(this.fila[0]), signal: this.ctrl.signal })
          if (r.ok || (r.status >= 400 && r.status < 500 && r.status !== 429)) {
            if (!r.ok) console.error(`[sala] relay recusou um envelope: ${r.status} ${await r.text()}`)
            this.fila.shift()
          } else throw new Error(`relay ${r.status}`)
        } catch (e) {
          if (this.ctrl.signal.aborted) return
          console.error('[sala] relay fora do ar; tento de novo em 3 s:', (e as Error).message)
          await new Promise(ok => setTimeout(ok, 3000))
        }
      }
    } finally {
      this.bombeando = false
    }
  }

  iniciar(aoReceber: (e: Envelope) => void): void {
    this.ativo = true
    const laco = async () => {
      while (this.ativo) {
        try {
          const r = await fetch(`${this.base}/envelopes?de=${encodeURIComponent(this.eu)}&depois=${this.cursor}&espera=25`, { headers: this.cabecalhos(), signal: this.ctrl.signal })
          if (!r.ok) throw new Error(`relay ${r.status}`)
          const d = (await r.json()) as { envelopes: Envelope[]; ultimo: number; vivos: Record<string, number> }
          for (const e of d.envelopes) aoReceber(e)
          this.cursor = Math.max(this.cursor, d.ultimo)
          this.ultimosVivos = d.vivos
        } catch (e) {
          if (!this.ativo) return
          console.error('[sala] não consegui receber do relay; tento de novo em 3 s:', (e as Error).message)
          await new Promise(ok => setTimeout(ok, 3000))
        }
      }
    }
    void laco()
  }

  vivos(): Record<string, number> {
    return this.ultimosVivos
  }

  parar(): void {
    this.ativo = false
    this.ctrl.abort()
  }
}
