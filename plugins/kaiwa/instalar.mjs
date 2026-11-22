// Prepara o Kaiwa instalado como plugin do Claude Code: copia esta versão para a pasta de dados do plugin, que
// sobrevive às atualizações, e instala as dependências lá. As salas apontam para essa cópia, então uma atualização do
// plugin não quebra uma sala aberta. Só usa o que vem com o Node: roda antes de existir node_modules.
// Uso (as skills /kaiwa:criar e /kaiwa:entrar chamam): node instalar.mjs <pasta de dados do plugin>
// Imprime, na última linha, KAIWA_CLI=<caminho do cli.ts>.
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const [dados] = process.argv.slice(2)
if (!dados) {
  console.error('uso: node instalar.mjs <pasta de dados do plugin>')
  process.exit(1)
}
const maior = Number(process.versions.node.split('.')[0])
if (maior < 24) {
  console.error(`O Kaiwa precisa do Node 24 ou mais novo; este é o ${process.versions.node}. Instale em https://nodejs.org e rode de novo.`)
  process.exit(1)
}

const raiz = dirname(fileURLToPath(import.meta.url))
const { version } = JSON.parse(readFileSync(join(raiz, '.claude-plugin', 'plugin.json'), 'utf8'))
const destino = join(dados, `kaiwa-${version}`)
const pronto = join(destino, '.pronto')

if (!existsSync(pronto)) {
  console.log(`Preparando o Kaiwa ${version} em ${destino}`)
  const fora = new Set(['node_modules', 'testes', '.git'])
  cpSync(raiz, destino, { recursive: true, force: true, filter: origem => !fora.has(origem.split(/[\\/]/).pop()) })
  try {
    execSync('npm ci --omit=dev --no-audit --no-fund', { cwd: join(destino, 'conector'), stdio: 'inherit' })
  } catch {
    console.error('O npm não conseguiu instalar as dependências. Numa rede que inspeciona TLS (erro SELF_SIGNED_CERT_IN_CHAIN), rode de novo com NODE_OPTIONS=--use-system-ca.')
    process.exit(1)
  }
  writeFileSync(pronto, new Date().toISOString() + '\n')
}
console.log(`KAIWA_CLI=${join(destino, 'conector', 'src', 'cli.ts')}`)
