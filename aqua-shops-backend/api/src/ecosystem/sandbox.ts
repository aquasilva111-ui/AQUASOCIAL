import type { AppManifest } from '../../../../src/lib/ecosystem/types.ts';
import { EcosystemError } from './store.ts';

/** Untrusted code runs on a dedicated origin WITHOUT same-origin, forms or navigation privileges. */
export function sandboxDocument(manifest: AppManifest, origins: string[]) {
  const entry = new URL(manifest.entry);
  if (
    entry.protocol !== 'https:' ||
    entry.username ||
    entry.password ||
    !origins.includes(entry.origin) ||
    !entry.pathname.endsWith('.js') ||
    manifest.permissions.length
  )
    throw new EcosystemError(403, 'Manifesto sem autorização para execução');
  const escape = (s: string) =>
    s
      .replaceAll('&', '&amp;')
      .replaceAll('"', '&quot;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  return {
    // No network fetch, child frames, service workers, form submissions or host credentials.
    csp: `default-src 'none'; script-src ${entry.origin}${entry.pathname}${manifest.runtime === 'wasm' ? " 'wasm-unsafe-eval'" : ''}; style-src 'unsafe-inline'; img-src data: blob:; media-src blob:; connect-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; sandbox allow-scripts`,
    html: `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>${escape(manifest.name)}</title></head><body><main id="app"></main><script src="${escape(entry.href)}" crossorigin="anonymous"></script></body></html>`,
  };
}
