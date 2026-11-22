// A tela da sala: recebe o retrato do conector por SSE e manda as ações do humano por POST.
const $ = s => document.querySelector(s)
let ultimo = null

function el(tag, attrs = {}, ...filhos) {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v)
    else e.setAttribute(k, v)
  }
  for (const f of filhos) if (f != null) e.append(f)
  return e
}

const hora = iso => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

async function postar(caminho, corpo) {
  const r = await fetch(caminho, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
  if (!r.ok) alertaFaixa(`Falhou: ${r.status}`)
}

function alertaFaixa(t) {
  const f = $('#faixa')
  f.textContent = t
  f.hidden = false
}

function linhaTerminal(ev, r) {
  const nome = id => r.sala.participantes.find(p => p.id === id)?.nome ?? id
  if (ev.tipo === 'sistema') return el('li', { class: 'sistema' }, `· ${ev.texto}`)
  if (ev.tipo === 'encerrar') return el('li', { class: 'fim' }, el('span', { class: 'meta' }, hora(ev.quando)), `■ sala encerrada: ${ev.texto}`)
  if (ev.tipo === 'conclusao') return el('li', { class: 'ata' }, el('span', { class: 'meta' }, `${hora(ev.quando)} · propôs a ata`), ev.texto)
  if (ev.tipo === 'aceite') return el('li', { class: 'sistema' }, `· ${nome(ev.de)} aceitou a ata`)
  if (ev.tipo === 'recusa') return el('li', { class: 'sistema' }, `· ${nome(ev.de)} recusou a ata: ${ev.texto}`)
  return el('li', {}, el('span', { class: 'meta' }, `${hora(ev.quando)} · fala ${ev.rodada ?? ''}`), ev.texto)
}

function pintarTerminal(sel, id, r, comSistema) {
  const t = $(sel)
  const p = r.sala.participantes.find(x => x.id === id)
  t.querySelector('.nome').textContent = `Claude de ${p?.nome ?? id}`
  t.querySelector('.rodada').textContent = `${r.rodadas[id] ?? 0}/${r.sala.limites.rodadas} falas`
  const vivo = r.vivos[id] && Date.now() - r.vivos[id] < 45000
  t.querySelector('[data-vivo]').classList.toggle('vivo', !!vivo)
  const ol = t.querySelector('.linhas')
  const embaixo = ol.scrollTop + ol.clientHeight >= ol.scrollHeight - 30
  ol.replaceChildren(
    ...r.eventos
      .filter(ev => (ev.de === id && ['fala', 'conclusao', 'aceite', 'recusa', 'encerrar'].includes(ev.tipo)) || (comSistema && (ev.tipo === 'sistema' || (ev.tipo === 'encerrar' && ev.de === 'conector'))))
      .map(ev => linhaTerminal(ev, r)),
  )
  if (embaixo) ol.scrollTop = ol.scrollHeight
}

const ROTULOS = { saida: 'Aprovar fala', porteiro: 'Porteiro segurou', permissao: 'Permissão do Claude Code', decisao: 'Decisão pedida', ata: 'Ata' }

function pendencia(p) {
  const resposta = el('input', { type: 'text', placeholder: p.tipo === 'decisao' ? 'Sua resposta' : 'Nota (opcional)' })
  const agir = acao => postar(`/pendencias/${p.id}`, { acao, resposta: resposta.value })
  const botoes = {
    saida: [['Aprovar e enviar', 'aprovar'], ['Descartar', 'descartar']],
    porteiro: [['Enviar mesmo assim', 'aprovar'], ['Descartar', 'descartar']],
    permissao: [['Permitir', 'permitir'], ['Negar', 'negar']],
    decisao: [['Responder', 'responder']],
    ata: [['Aceitar a ata', 'aceitar'], ['Recusar', 'recusar']],
  }[p.tipo] ?? []
  const opcoes = (p.opcoes ?? []).map(o => el('button', { class: 'leve', type: 'button', onclick: () => postar(`/pendencias/${p.id}`, { acao: 'responder', resposta: o }) }, o))
  return el(
    'li',
    {},
    el('span', { class: 'tipo' }, `${ROTULOS[p.tipo] ?? p.tipo}${p.conjunta ? ' · conjunta' : ''} · ${hora(p.criadaEm)}`),
    el('strong', {}, p.titulo),
    el('div', { class: 'corpo' }, p.texto),
    p.motivos?.length ? el('div', { class: 'motivos' }, p.motivos.join(' · ')) : null,
    opcoes.length ? el('div', { class: 'acoes' }, ...opcoes) : null,
    p.tipo === 'permissao' ? null : resposta,
    el('div', { class: 'acoes' }, ...botoes.map(([t, a], i) => el('button', { type: 'button', class: i ? 'leve' : '', onclick: () => agir(a) }, t))),
  )
}

function pintar(r) {
  ultimo = r
  document.title = `${r.projeto} · ${r.sala.id}`
  $('#projeto').textContent = r.projeto
  $('#sala-id').textContent = r.sala.id
  $('#objetivo').textContent = `Objetivo: ${r.sala.objetivo}`
  $('#modo').textContent = r.modo === 'channel' ? 'modo channel (push)' : 'modo aguardar'
  if (document.activeElement !== $('#supervisao')) $('#supervisao').value = r.supervisao
  const outro = r.sala.participantes.find(p => p.id !== r.eu)
  pintarTerminal('#term-eu', r.eu, r, true)
  pintarTerminal('#term-outro', outro.id, r, false)

  const n = r.pendencias.length
  $('#n-pend').textContent = n
  $('#n-pend').classList.toggle('zero', n === 0)
  // não repinta o painel enquanto o humano digita numa pendência
  if (!$('#pendencias').contains(document.activeElement)) $('#pendencias').replaceChildren(...r.pendencias.map(pendencia))

  const nome = id => r.sala.participantes.find(p => p.id === id)?.nome ?? id
  $('#decisoes').replaceChildren(
    ...r.eventos
      .filter(ev => ev.tipo === 'humano_sala' || ev.tipo === 'humano_privado')
      .map(ev => el('li', { class: ev.tipo === 'humano_privado' ? 'privado' : '', title: hora(ev.quando) }, `${ev.tipo === 'humano_privado' ? '🔒 ' : ''}${ev.categoria === 'decisao' ? 'Decisão' : 'Regra'} (${nome(ev.de)}): ${ev.texto}`)),
  )

  const f = $('#faixa')
  if (r.encerrada) {
    f.textContent = `Sala encerrada: ${r.encerrada}`
    f.className = 'faixa fim'
    f.hidden = false
  } else if (r.supervisao === 'pausado') {
    f.textContent = 'Sala pausada: os Claudes não falam até você retomar.'
    f.className = 'faixa'
    f.hidden = false
  } else if (r.descartados) {
    f.textContent = `${r.descartados} mensagem(ns) descartada(s): não abriram com o convite desta sala.`
    f.className = 'faixa'
    f.hidden = false
  } else f.hidden = true
}

$('#supervisao').addEventListener('change', e => postar('/supervisao', { modo: e.target.value }))
$('#encerrar').addEventListener('click', () => {
  if (ultimo && !ultimo.encerrada) postar('/encerrar', { motivo: 'encerrada pelo humano na tela' })
})
$('#form-humano').addEventListener('submit', e => {
  e.preventDefault()
  const texto = $('#texto-humano').value.trim()
  if (!texto) return
  postar('/humano', { categoria: $('#categoria').value, destino: $('#destino').value, texto })
  $('#texto-humano').value = ''
})

function conectar() {
  const es = new EventSource('/eventos')
  es.onmessage = m => pintar(JSON.parse(m.data))
  es.onerror = () => {
    alertaFaixa('Sem conexão com o conector. A sessão da sala está aberta?')
    es.close()
    setTimeout(conectar, 2000)
  }
}
conectar()
