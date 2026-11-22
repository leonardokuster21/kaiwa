// Confia também nos certificados do sistema operacional, como o navegador já faz.
// Antivírus com "escaneamento HTTPS" e proxies de empresa trocam o certificado de todo site por um assinado por eles,
// com a raiz instalada só no Windows (ou no macOS). O Node usa a própria lista e recusa a conexão
// (SELF_SIGNED_CERT_IN_CHAIN): o conector ficava sem falar com o relay, sem avisar ninguém (achado de 22/11/2026, 1.0.1).
// Importar este arquivo primeiro basta: o padrão de certificados do Node vale também para o fetch.
import tls from 'node:tls'

export function confiarNoSistema(): void {
  try {
    if (typeof tls.setDefaultCACertificates !== 'function' || typeof tls.getCACertificates !== 'function') return
    const todos = new Set([...tls.getCACertificates('default'), ...tls.getCACertificates('system')])
    tls.setDefaultCACertificates([...todos])
  } catch (e) {
    console.error('[sala] não consegui somar os certificados do sistema:', (e as Error).message)
  }
}

confiarNoSistema()
