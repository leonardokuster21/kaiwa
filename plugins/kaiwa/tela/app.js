// A tela da sala: recebe o retrato do conector por SSE e manda as ações do humano por POST.
// A conversa aparece como um chat: as falas do seu Claude à direita, as do outro à esquerda, os avisos no meio.
// Os humanos têm um chat próprio, menor, à direita (o campo do humano). As pendências abrem numa gaveta.
const $ = s => document.querySelector(s)
let ultimo = null
let pendenciasVistas = new Set()

function el(tag, attrs = {}, ...filhos) {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v
    else if (k === 'html') e.innerHTML = v // só para os ícones fixos deste arquivo, nunca para texto que chega
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v)
    else e.setAttribute(k, v)
  }
  for (const f of filhos) if (f != null) e.append(f)
  return e
}

const hora = iso => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
const horaCurta = iso => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
const iniciais = nome => nome.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('')
const falas = (r, id) => (r.sala.limites.rodadas ? `${r.rodadas[id] ?? 0}/${r.sala.limites.rodadas} falas` : `${r.rodadas[id] ?? 0} falas`)
/** O nome que cada humano escolheu na sala (1.0); antes disso, um nome genérico. */
const nomeDe = (r, id) => r.nomes?.[id] || (id === r.eu ? 'você' : 'o outro lado')

async function postar(caminho, corpo) {
  const r = await fetch(caminho, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
  if (!r.ok) alertaFaixa(`Falhou: ${r.status}`)
}

function alertaFaixa(t) {
  const f = $('#faixa')
  f.textContent = t
  f.className = 'faixa'
  f.hidden = false
}

/** Um grupo de segmentos (botões com aria-pressed) que guarda o valor escolhido. */
function segmentos(sel, aoMudar) {
  const g = $(sel)
  const valorDe = b => b.dataset.valor ?? b.dataset.modo
  const marcar = v => g.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(valorDe(b) === v)))
  g.addEventListener('click', e => {
    const b = e.target.closest('button')
    if (!b) return
    marcar(valorDe(b))
    aoMudar?.(valorDe(b))
  })
  return { marcar, valor: () => g.querySelector('[aria-pressed="true"]')?.dataset.valor }
}

// ---------- a conversa dos Claudes ----------

/** Uma linha do chat: fala e ata em balão (o seu lado à direita); o resto como aviso no meio. */
function itemChat(ev, r, anterior) {
  const nome = id => nomeDe(r, id)
  if (ev.tipo === 'sistema') return el('li', { class: 'aviso' }, ev.texto)
  if (ev.tipo === 'encerrar') return el('li', { class: 'aviso fim' }, `${horaCurta(ev.quando)} · sala encerrada: ${ev.texto}`)
  if (ev.tipo === 'aceite') return el('li', { class: 'aviso' }, `${nome(ev.de)} aceitou a ata`)
  if (ev.tipo === 'recusa') return el('li', { class: 'aviso' }, `${nome(ev.de)} recusou a ata: ${ev.texto}`)
  if (ev.tipo === 'conclusao') return el('li', { class: 'aviso' }, `${horaCurta(ev.quando)} · ${nome(ev.de)} propôs a ata: ela está na coluna à esquerda`)
  const lado = ev.de === r.eu ? 'eu' : 'outro'
  const segue = anterior && anterior.de === ev.de && anterior.tipo === 'fala' && ev.tipo === 'fala'
  const quem = `Claude de ${nome(ev.de)}${ev.tipo === 'fala' && ev.rodada ? ` · fala ${ev.rodada}` : ''}`
  return el(
    'li',
    { class: `msg ${lado}${ev.tipo === 'conclusao' ? ' ata' : ''}${segue ? ' segue' : ''}` },
    el('span', { class: 'quem' }, quem),
    el('div', { class: 'balao', title: hora(ev.quando) }, ev.texto, el('span', { class: 'hora' }, horaCurta(ev.quando))),
  )
}

const TIPOS_CHAT = ['fala', 'conclusao', 'aceite', 'recusa', 'encerrar', 'sistema']

function pintarLista(ol, itens) {
  const embaixo = ol.scrollTop + ol.clientHeight >= ol.scrollHeight - 40
  ol.replaceChildren(...itens)
  if (embaixo || !ol.dataset.pintado) ol.scrollTop = ol.scrollHeight
  ol.dataset.pintado = '1'
}

function pintarChat(r) {
  const outro = r.sala.participantes.find(p => p.id !== r.eu)
  const vivo = id => Boolean(r.vivos[id] && Date.now() - r.vivos[id] < 45000)
  const nomeOutro = r.nomes?.[outro.id]
  $('#av-outro').textContent = nomeOutro ? iniciais(nomeOutro) : '?'
  $('#nome-outro').textContent = nomeOutro ? `Claude de ${nomeOutro}` : 'O Claude do outro lado'
  $('#vivo-outro').classList.toggle('vivo', vivo(outro.id))
  $('#estado-outro').textContent = `${vivo(outro.id) ? 'conectado' : 'sem sinal'} · ${falas(r, outro.id)}`
  $('#vivo-eu').classList.toggle('vivo', vivo(r.eu))
  $('#estado-eu').textContent = `${r.nomes?.[r.eu] ? `${r.nomes[r.eu]} · ` : ''}seu Claude · ${falas(r, r.eu)}`
  const evs = r.eventos.filter(ev => TIPOS_CHAT.includes(ev.tipo))
  pintarLista($('#mensagens'), evs.map((ev, i) => itemChat(ev, r, evs[i - 1])))
}

// ---------- a ata, em tópicos ----------

/** Quebra o texto da ata em seções ("Acordo:", "Divergências:"...) e tópicos (linhas com -, •, · ou número). */
function secoesDaAta(texto) {
  const secoes = []
  let atual = null
  for (const bruta of texto.split('\n')) {
    const linha = bruta.trim()
    if (!linha) continue
    const topico = linha.match(/^(?:[-•·*]|\d+[.)])\s+(.*)$/)
    const cab = !topico && linha.match(/^\**([^:*]{2,40}?)\**:\s*(.*)$/)
    if (cab) {
      atual = { titulo: cab[1].trim(), itens: [] }
      secoes.push(atual)
      if (cab[2]) atual.itens.push(cab[2])
    } else {
      if (!atual) secoes.push((atual = { titulo: '', itens: [] }))
      atual.itens.push(topico ? topico[1] : linha)
    }
  }
  return secoes
}

function pintarAta(r) {
  const c = r.conclusao
  const corpo = $('#ata-corpo')
  const estadoAta = $('#ata-estado')
  $('#ata-responder').hidden = !r.pendencias.some(p => p.tipo === 'ata')
  if (!c) {
    estadoAta.textContent = 'sem proposta'
    estadoAta.className = 'tag'
    $('#ata-aceites').replaceChildren()
    corpo.replaceChildren(el('p', { class: 'vazio' }, 'Quando um dos Claudes propuser a ata, ela aparece aqui em tópicos, para os dois humanos aceitarem.'))
    return
  }
  const aprovada = r.sala.participantes.every(p => c.aceites.includes(p.id))
  estadoAta.textContent = aprovada ? 'aprovada' : 'proposta'
  estadoAta.className = `tag${aprovada ? ' aprovada' : ''}`
  $('#ata-aceites').replaceChildren(
    ...r.sala.participantes.map(p => {
      const sim = c.aceites.includes(p.id)
      return el('div', { class: `aceite${sim ? ' sim' : ''}` }, el('i', {}, sim ? '✓' : ''), `${p.id === r.eu ? 'Você' : nomeDe(r, p.id)}: ${sim ? 'aceitou' : 'ainda não respondeu'}`)
    }),
  )
  corpo.replaceChildren(
    ...secoesDaAta(c.texto).map(sec =>
      el(
        'section',
        { class: `ata-secao${/^acordo/i.test(sec.titulo) ? ' acordo' : ''}` },
        sec.titulo ? el('h3', {}, sec.titulo) : null,
        el('ul', {}, ...sec.itens.map(i => el('li', {}, i))),
      ),
    ),
  )
}

// ---------- 1.0: o convite, a escuta e o nome ----------

let pediuNome = false
function pintarCartoes(r) {
  const outro = r.sala.participantes.find(p => p.id !== r.eu)
  const outroChegou = Boolean(r.nomes?.[outro.id] || r.vivos[outro.id] || r.eventos.some(e => e.de === outro.id))
  const souQuemCriou = r.sala.abre === r.eu
  $('#cartao-convite').hidden = !(souQuemCriou && r.convite && !outroChegou && r.iniciada === false)
  if (r.convite) $('#comando-convite').textContent = `/kaiwa:entrar ${r.convite}`

  const escuta = r.iniciada === false && !r.encerrada
  $('#cartao-escuta').hidden = !escuta
  if (escuta) {
    const prontos = new Set(r.prontos ?? [])
    $('#prontos').replaceChildren(
      ...r.sala.participantes.map(p => {
        const sim = prontos.has(p.id)
        return el('div', { class: `aceite${sim ? ' sim' : ''}` }, el('i', {}, sim ? '✓' : ''), `${p.id === r.eu ? 'Você' : nomeDe(r, p.id)}: ${sim ? 'pode começar' : 'ainda não'}`)
      }),
    )
    const eu = prontos.has(r.eu)
    const b = $('#pode-comecar')
    b.textContent = eu ? 'Ainda não' : 'Pode começar'
    b.className = eu ? 'btn btn-fantasma' : 'btn btn-acento'
    b.dataset.sim = String(!eu)
  }

  // na primeira vez, cada humano escolhe o próprio nome
  if (!r.nomes?.[r.eu] && !pediuNome && !$('#nome-dialogo').open) {
    pediuNome = true
    $('#nome-dialogo').returnValue = ''
    $('#nome-dialogo').showModal()
  }
}

$('#pode-comecar').addEventListener('click', e => postar('/pronto', { sim: e.currentTarget.dataset.sim !== 'false' }))
$('#copiar-convite').addEventListener('click', async e => {
  const b = e.currentTarget
  try {
    await navigator.clipboard.writeText($('#comando-convite').textContent)
    b.textContent = 'Copiado'
  } catch {
    b.textContent = 'Selecione e copie'
  }
  setTimeout(() => (b.textContent = 'Copiar'), 1800)
})
$('#mudar-nome').addEventListener('click', () => {
  $('#nome-campo').value = ultimo?.nomes?.[ultimo.eu] ?? ''
  $('#nome-dialogo').returnValue = ''
  $('#nome-dialogo').showModal()
})
$('#nome-dialogo').addEventListener('close', () => {
  const nome = $('#nome-campo').value.trim()
  if ($('#nome-dialogo').returnValue === 'ok' && nome) postar('/nome', { nome })
})

// ---------- o campo do humano ----------

/** O chat dos humanos: as suas regras e decisões à direita, as do outro humano à esquerda. */
function pintarHumanos(r) {
  const nome = id => nomeDe(r, id)
  const evs = r.eventos.filter(ev => ev.tipo === 'humano_sala' || ev.tipo === 'humano_privado')
  pintarLista(
    $('#humanos'),
    evs.length
      ? evs.map(ev => {
          const privado = ev.tipo === 'humano_privado'
          const quem = `${ev.de === r.eu ? 'Você' : nome(ev.de)}${privado ? ' · só para o seu Claude' : ''}`
          return el(
            'li',
            { class: `msg ${ev.de === r.eu ? 'eu' : 'outro'}${privado ? ' privado' : ''}` },
            el('span', { class: 'quem' }, quem),
            el('div', { class: 'balao', title: hora(ev.quando) }, ev.texto, el('span', { class: 'hora' }, horaCurta(ev.quando))),
          )
        })
      : [el('li', { class: 'vazio' }, 'Nada por aqui ainda. Escreva o que quiser: o seu Claude interpreta. Para a sala, o outro humano e os dois Claudes leem.')],
  )
}

// ---------- as pendências ----------

const ICONE = {
  ata: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="m10 14 2 2 4-4"/></svg>',
  porteiro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z"/><path d="M9.5 12.5 11 14l3.5-3.5"/></svg>',
  decisao: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6"/><path d="M12 17h.01"/></svg>',
  saida: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12 20 4l-4 16-4-7z"/><path d="m12 13 8-9"/></svg>',
  permissao: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M16 7l3 3"/></svg>',
}
const ROTULOS = { saida: 'Aprovar fala', porteiro: 'O porteiro segurou', permissao: 'Permissão do Claude Code', decisao: 'Decisão pedida', ata: 'Proposta de ata' }
const EXPLICA = {
  saida: 'A supervisão está em "aprovo cada fala": esta fala do seu Claude só sai com o seu ok.',
  porteiro: 'A fala trazia algo que a sua política não deixa sair. Ela não saiu. Descarte, ou envie se tiver certeza.',
  permissao: 'O Claude Code pede permissão para uma ferramenta.',
  decisao: 'O seu Claude parou para perguntar. A resposta chega só para ele.',
  ata: 'A sala só fecha quando os dois humanos aceitam a ata.',
}

function pendencia(p) {
  const resposta = el('input', { type: 'text', class: 'campo', placeholder: p.tipo === 'decisao' ? 'Sua resposta' : 'Nota (opcional)' })
  const agir = acao => postar(`/pendencias/${p.id}`, { acao, resposta: resposta.value })
  const botoes = {
    saida: [['Aprovar e enviar', 'aprovar'], ['Descartar', 'descartar']],
    porteiro: [['Descartar', 'descartar'], ['Enviar mesmo assim', 'aprovar']], // o seguro em destaque
    permissao: [['Permitir', 'permitir'], ['Negar', 'negar']],
    decisao: [['Responder', 'responder']],
    ata: [['Aceitar a ata', 'aceitar'], ['Recusar', 'recusar']],
  }[p.tipo] ?? []
  const opcoes = (p.opcoes ?? []).map(o => el('button', { class: 'btn btn-fantasma', type: 'button', onclick: () => postar(`/pendencias/${p.id}`, { acao: 'responder', resposta: o }) }, o))
  return el(
    'article',
    { class: `pend${p.conjunta ? ' conjunta' : ''}` },
    el(
      'div',
      { class: 'pend-cab' },
      el('span', { class: 'pend-icone', html: ICONE[p.tipo] ?? ICONE.decisao }),
      el('div', {}, el('span', { class: 'rotulo' }, `${ROTULOS[p.tipo] ?? p.tipo}${p.conjunta ? ' · conjunta' : ''} · ${horaCurta(p.criadaEm)}`), el('strong', {}, p.titulo)),
    ),
    EXPLICA[p.tipo] ? el('p', { class: 'pend-explica' }, EXPLICA[p.tipo]) : null,
    p.texto ? el('div', { class: 'pend-corpo' }, p.texto) : null,
    p.motivos?.length ? el('div', { class: 'pend-motivos' }, ...p.motivos.map(m => el('span', { class: 'tag' }, m))) : null,
    opcoes.length ? el('div', { class: 'acoes' }, ...opcoes) : null,
    p.tipo === 'permissao' ? null : resposta,
    el('div', { class: 'acoes' }, ...botoes.map(([t, a], i) => el('button', { type: 'button', class: i ? 'btn btn-fantasma' : 'btn btn-acento', onclick: () => agir(a) }, t))),
  )
}

const FEZ = { aceitar: 'Você aceitou', recusar: 'Você recusou', aprovar: 'Você enviou mesmo assim', descartar: 'Você descartou', permitir: 'Você permitiu', negar: 'Você negou', responder: 'Você respondeu' }
const quandoFoi = iso => {
  const d = new Date(iso)
  const hoje = new Date().toDateString() === d.toDateString()
  return hoje ? `hoje, ${horaCurta(iso)}` : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/** Uma pendência já resolvida: o que era, o que você fez (ou por que saiu sem resposta) e quando. */
function resolvida(h) {
  const sem = h.acao === 'sem_resposta'
  return el(
    'article',
    { class: 'pend resolvida' },
    el(
      'div',
      { class: 'pend-cab' },
      el('span', { class: 'pend-icone', html: ICONE[h.tipo] ?? ICONE.decisao }),
      el('div', {}, el('span', { class: 'rotulo' }, `${ROTULOS[h.tipo] ?? h.tipo}${h.conjunta ? ' · conjunta' : ''} · ${quandoFoi(h.resolvidaEm)}`), el('strong', {}, h.titulo)),
    ),
    el('p', { class: `resultado${sem ? ' sem' : ''}` }, sem ? `Saiu sem resposta${h.motivo ? `: ${h.motivo}` : ''}` : FEZ[h.acao] ?? h.acao, !sem && h.resposta ? el('q', {}, h.resposta) : null),
    h.texto ? el('details', {}, el('summary', {}, 'Ver o pedido'), el('div', { class: 'pend-corpo' }, h.texto)) : null,
  )
}

function pintarHistorico(r) {
  const hs = [...(r.resolvidas ?? [])].reverse()
  $('#n-historico').textContent = hs.length
  const corpo = $('#historico')
  const assinatura = hs.map(h => h.id).join(',')
  if (corpo.dataset.assinatura === assinatura) return // nada mudou: não mexe no que o humano está lendo
  corpo.dataset.assinatura = assinatura
  corpo.replaceChildren(...(hs.length ? hs.map(resolvida) : [el('p', { class: 'vazio' }, 'Nada resolvido ainda. O que você aceitar, recusar ou responder fica guardado aqui.')]))
}

function pintarPendencias(r) {
  const n = r.pendencias.length
  $('#n-pend').textContent = n
  $('#n-pend').classList.toggle('zero', n === 0)
  $('#n-esperando').textContent = n
  pintarHistorico(r)
  $('#aviso-pend').hidden = n === 0
  $('#aviso-pend-texto').textContent = n === 1 ? '1 pendência espera por você' : `${n} pendências esperam por você`
  const novas = r.pendencias.filter(p => !pendenciasVistas.has(p.id))
  if (novas.length && pendenciasVistas.size + novas.length > 0 && ultimo) {
    const b = $('#abrir-pend')
    b.classList.remove('chamando')
    void b.offsetWidth // reinicia a animação
    b.classList.add('chamando')
  }
  pendenciasVistas = new Set(r.pendencias.map(p => p.id))

  // a gaveta só redesenha quando a lista muda (o retrato chega a cada 5 s) e nunca enquanto o humano digita nela
  const corpo = $('#pendencias')
  const assinatura = `${r.pendencias.map(p => p.id).join(',')}|${(r.resolvidas ?? []).length}`
  if (corpo.dataset.assinatura === assinatura) return
  if (corpo.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return
  corpo.dataset.assinatura = assinatura
  if (!n) {
    const verHistorico = el('button', { type: 'button', class: 'btn btn-fantasma btn-sm', onclick: () => abas.ir('historico') }, 'Ver o histórico →')
    return corpo.replaceChildren(el('div', { class: 'vazio' }, el('p', {}, 'Nada esperando por você. Quando o seu Claude precisar de você, aparece aqui.'), (r.resolvidas ?? []).length ? verHistorico : null))
  }
  const grupo = (titulo, ps) => (ps.length ? el('section', { class: 'grupo' }, el('span', { class: 'rotulo' }, titulo), ...ps.map(pendencia)) : null)
  corpo.replaceChildren(
    ...[grupo('Conjuntas: os dois humanos decidem', r.pendencias.filter(p => p.conjunta)), grupo('Só você', r.pendencias.filter(p => !p.conjunta))].filter(Boolean),
  )
}

const abas = (() => {
  const g = segmentos('#abas-pend', v => mostrar(v))
  const mostrar = v => {
    $('#pendencias').hidden = v !== 'esperando'
    $('#historico').hidden = v !== 'historico'
    $('#gaveta-rotulo').textContent = v === 'historico' ? 'O que já foi resolvido' : 'Esperando por você'
  }
  return { ir: v => { g.marcar(v); mostrar(v) } }
})()

const gaveta = {
  abrir(aba = 'esperando') {
    abas.ir(aba)
    $('#gaveta').hidden = false
    $('#abrir-pend').setAttribute('aria-expanded', 'true')
    $('#gaveta [data-fechar].btn').focus()
  },
  fechar() {
    $('#gaveta').hidden = true
    $('#abrir-pend').setAttribute('aria-expanded', 'false')
  },
}

// ---------- o retrato inteiro ----------

const destino = segmentos('#destino')

function pintar(r) {
  document.title = `${r.pendencias.length ? `(${r.pendencias.length}) ` : ''}${r.projeto} · ${r.sala.id}`
  $('#projeto').textContent = r.projeto
  $('#sala-id').textContent = r.sala.id
  $('#objetivo').textContent = r.objetivo || r.sala.objetivo || 'Os humanos estão combinando o objetivo no campo do humano.'
  // na escuta (1.0) o interruptor some: quem libera a conversa são os dois "pode começar"
  $('.interruptor').hidden = r.iniciada === false
  // o interruptor só alterna livre e pausado; uma sala criada com "aprovar" conta como rodando
  $('#rodando').checked = r.supervisao !== 'pausado'
  $('#rotulo-rodando').textContent = r.supervisao === 'pausado' ? 'Pausado' : 'Conversando'
  pintarChat(r)
  pintarCartoes(r)
  pintarHumanos(r)
  pintarAta(r)
  pintarPendencias(r)
  ultimo = r

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

$('#encerrar').addEventListener('click', () => {
  if (ultimo && !ultimo.encerrada) postar('/encerrar', { motivo: 'encerrada pelo humano na tela' })
})
// Religar é direto; pausar pede confirmação, porque para os dois Claudes.
$('#rodando').addEventListener('change', e => {
  if (e.target.checked) {
    $('#rotulo-rodando').textContent = 'Conversando'
    return postar('/supervisao', { modo: 'livre' })
  }
  e.target.checked = true // só desliga se confirmar
  $('#confirmar-pausa').returnValue = '' // Esc não pode herdar um "sim" antigo
  $('#confirmar-pausa').showModal()
})
$('#confirmar-pausa').addEventListener('close', e => {
  if (e.target.returnValue !== 'sim') return
  $('#rodando').checked = false
  $('#rotulo-rodando').textContent = 'Pausado'
  postar('/supervisao', { modo: 'pausado' })
})
$('#abrir-pend').addEventListener('click', () => gaveta.abrir())
$('#aviso-pend').addEventListener('click', () => gaveta.abrir())
$('#ata-responder').addEventListener('click', () => gaveta.abrir())
$('#gaveta').addEventListener('click', e => {
  if (e.target.closest('[data-fechar]')) gaveta.fechar()
})
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('#gaveta').hidden) gaveta.fechar()
})

const caixa = $('#texto-humano')
$('#form-humano').addEventListener('submit', e => {
  e.preventDefault()
  const texto = caixa.value.trim()
  if (!texto) return
  postar('/humano', { destino: destino.valor(), texto })
  caixa.value = ''
  ajustarCaixa()
})
// Enter envia; Shift+Enter quebra a linha. A caixa cresce com o texto.
caixa.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    $('#form-humano').requestSubmit()
  }
})
// A caixa cresce com o texto até a altura máxima do CSS; só depois disso aparece a barra de rolagem.
function ajustarCaixa() {
  caixa.style.height = 'auto'
  const max = parseFloat(getComputedStyle(caixa).maxHeight) || 160
  const borda = caixa.offsetHeight - caixa.clientHeight
  const preciso = caixa.scrollHeight + borda
  caixa.style.height = `${Math.min(preciso, max)}px`
  caixa.classList.toggle('longo', preciso > max)
}
caixa.addEventListener('input', ajustarCaixa)

// ---------- falar em vez de digitar ----------
// Usa o reconhecimento de voz do navegador (no Chrome, o áudio é transcrito pelo Google). Só o texto fica:
// ele cai na caixa para o humano revisar e enviar; o áudio nunca vai para a sala.
const Reconhecimento = window.SpeechRecognition || window.webkitSpeechRecognition
if (Reconhecimento) {
  const mic = $('#microfone')
  mic.hidden = false
  let rec = null
  let base = ''
  const parar = () => rec?.stop()
  mic.addEventListener('click', () => {
    if (rec) return parar()
    rec = new Reconhecimento()
    rec.lang = 'pt-BR'
    rec.continuous = true
    rec.interimResults = true
    base = caixa.value ? `${caixa.value.trimEnd()} ` : ''
    rec.onresult = e => {
      let texto = ''
      for (const r of e.results) texto += r[0].transcript
      caixa.value = base + texto.trim()
      caixa.dispatchEvent(new Event('input'))
    }
    rec.onend = () => {
      rec = null
      mic.classList.remove('gravando')
      mic.setAttribute('aria-label', 'Falar em vez de digitar')
      $('#ouvindo').hidden = true
      caixa.focus()
    }
    rec.onerror = e => {
      if (e.error === 'not-allowed') alertaFaixa('O navegador não deixou usar o microfone. Libere o microfone para esta página e tente de novo.')
      else if (e.error !== 'aborted' && e.error !== 'no-speech') alertaFaixa(`Não consegui transcrever (${e.error}).`)
    }
    rec.start()
    mic.classList.add('gravando')
    mic.setAttribute('aria-label', 'Parar de ouvir')
    $('#ouvindo').hidden = false
  })
  $('#form-humano').addEventListener('submit', parar)
}

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
