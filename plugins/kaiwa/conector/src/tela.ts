// A tela da sala: uma página em 127.0.0.1 que mostra a conversa ao vivo,
// o campo do humano e o painel de pendências. Só esta máquina alcança.
import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Sala, Supervisao } from './sala.ts'

const TIPOS: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' }
const ARQUIVOS = new Set(['/index.html', '/app.js', '/estilo.css'])

export interface Tela {
  url: string
  fechar(): Promise<void>
}

export function abrirTela(sala: Sala, porta: number, pastaTela: string, extra: () => Record<string, unknown>): Promise<Tela> {
  const ouvintes = new Set<ServerResponse>()
  let origem = ''
  let agendado: NodeJS.Timeout | null = null

  const retrato = () => JSON.stringify({ ...sala.retrato(), ...extra() })
  const transmitir = () => {
    agendado = null
    const dados = `data: ${retrato()}\n\n`
    for (const r of ouvintes) r.write(dados)
  }
  const agendar = () => {
    if (!agendado) agendado = setTimeout(transmitir, 40)
  }
  sala.on('mudou', agendar)
  const pulso = setInterval(agendar, 5000) // o sinal de vida do outro lado muda sem evento

  const corpo = (req: IncomingMessage) =>
    new Promise<Record<string, string>>((ok, erro) => {
      let s = ''
      req.on('data', d => {
        s += d
        if (s.length > 100_000) req.destroy()
      })
      req.on('end', () => {
        try {
          ok(JSON.parse(s || '{}'))
        } catch (e) {
          erro(e)
        }
      })
    })

  const servidor = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', origem)
    if (req.method === 'HEAD' && url.pathname === '/eventos') {
      res.writeHead(200).end()
      return
    }
    if (req.method === 'GET') {
      if (url.pathname === '/eventos') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
        res.write(`data: ${retrato()}\n\n`)
        ouvintes.add(res)
        req.on('close', () => ouvintes.delete(res))
        return
      }
      const caminho = url.pathname === '/' ? '/index.html' : url.pathname
      if (ARQUIVOS.has(caminho)) {
        res.writeHead(200, { 'Content-Type': TIPOS[caminho.slice(caminho.lastIndexOf('.'))], 'Cache-Control': 'no-store' })
        res.end(readFileSync(join(pastaTela, caminho.slice(1))))
        return
      }
      res.writeHead(404).end()
      return
    }
    // POST: só da própria página (Origin igual) e só JSON. Bloqueia outro site aberto no navegador.
    const o = req.headers.origin
    if (req.method !== 'POST' || (o !== origem && o !== origem.replace('127.0.0.1', 'localhost')) || !String(req.headers['content-type']).startsWith('application/json')) {
      res.writeHead(403).end('proibido')
      return
    }
    try {
      const b = await corpo(req)
      let r = 'ok'
      if (url.pathname === '/humano') {
        sala.humano(b.destino === 'sala' ? 'sala' : 'meu', String(b.texto ?? ''))
      } else if (url.pathname.startsWith('/pendencias/')) {
        r = sala.resolver(url.pathname.split('/')[2], String(b.acao ?? ''), String(b.resposta ?? ''))
      } else if (url.pathname === '/supervisao' && ['livre', 'pausado'].includes(b.modo)) {
        sala.mudarSupervisao(b.modo as Supervisao)
      } else if (url.pathname === '/nome') {
        sala.definirNome(String(b.nome ?? ''))
      } else if (url.pathname === '/pronto') {
        sala.marcarPronto(String(b.sim) !== 'false') // o JSON traz true ou false
      } else if (url.pathname === '/encerrar') {
        sala.encerrar(String(b.motivo || 'encerrada pelo humano'), 'humano')
      } else {
        res.writeHead(404).end()
        return
      }
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ r }))
    } catch {
      res.writeHead(400).end('pedido inválido')
    }
  })

  return escutar(servidor, porta).then(p => {
      origem = `http://127.0.0.1:${p}`
      return {
        url: origem,
        fechar: () =>
          new Promise<void>(fim => {
            clearInterval(pulso)
            sala.off('mudou', agendar)
            for (const r of ouvintes) r.end()
            servidor.close(() => fim())
          }),
      }
  })
}

/**
 * Escuta em 127.0.0.1 na porta pedida; se ela estiver ocupada (EADDRINUSE), tenta as próximas, até 20.
 * Porta 0 deixa o sistema escolher (testes). A tela da sala e a página de preparação usam a mesma regra,
 * então as duas acabam no mesmo endereço.
 */
export function escutar(servidor: import('node:http').Server, porta: number, tentativas = 20): Promise<number> {
  return new Promise((ok, erro) => {
    let p = porta
    const tentar = () => {
      servidor.once('error', (e: NodeJS.ErrnoException) => {
        if (e.code === 'EADDRINUSE' && porta !== 0 && p < porta + tentativas) {
          p++
          tentar()
        } else erro(e)
      })
      servidor.listen(p, '127.0.0.1', () => {
        servidor.removeAllListeners('error')
        const end = servidor.address()
        ok(typeof end === 'object' && end ? end.port : p)
      })
    }
    tentar()
  })
}
