import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildCatalog, githubSource} from './catalog.mjs';

const base = fileURLToPath(new URL('../', import.meta.url));
const names = ['.nojekyll','assets/HORIZON_WEB_HERO_APPROVATO.png','community.html','download.html',
  'guida.html','index.html','privacy.html','releases.json','styles.css','verifica.html'];
const escape = value => String(value).replace(/[&<>"']/g,
  ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]);

function block(html, key, replacement) {
  const pattern = new RegExp('<!-- ' + key + ':start -->[\\s\\S]*?<!-- ' + key + ':end -->', 'g');
  if ([...html.matchAll(pattern)].length !== 1) throw new Error('Segnaposto non univoco: ' + key);
  return html.replace(pattern, () => replacement);
}

export function render(input, name, catalog) {
  const active = catalog.releases.find(item => item.version === catalog.current);
  if (name === 'releases.json') return JSON.stringify(catalog, null, 2) + '\n';
  if (!name.endsWith('.html')) return input;
  let html = input.replace('Nessuna Stable disponibile.<br>Download non attivi.',
    active ? 'Stable corrente: ' + escape(active.version) : 'Nessuna Stable disponibile.<br>Download non attivi.');
  if (name === 'index.html' && active) {
    html = html.replace('HORIZON 1.1.5 Stable · Pubblicazione in attesa di approvazione', 'HORIZON ' + escape(active.version) + ' Stable');
  }
  if (active) {
    html = html.replace("Le funzioni descritte non corrispondono a una versione già scaricabile. La dotazione della prima Stable sarà indicata nelle sue note di rilascio.", "La dotazione delle versioni pubblicate è descritta nelle note di rilascio.");
    html = html.replace("Non è ancora disponibile una Stable da installare. Le funzioni qui descritte illustrano HORIZON; disponibilità, requisiti e istruzioni operative saranno specificati per ciascuna versione pubblicata.", "Consulta le note di rilascio per la dotazione, i requisiti e le istruzioni della versione corrente.");
    html = html.replace("Nessuna Stable è attualmente disponibile per il download.", "La versione disponibile è indicata nella pagina Download.");
    html = html.replace("Al momento non sono disponibili release Stable o installer autorizzati.", "Verifica che il file scelto corrisponda alla Stable indicata nella pagina Download.");
    html = html.replace("Non è pubblicato alcun checksum di installer su questa pagina perché nessun installer è disponibile.", "Il checksum della versione scelta è riportato nelle relative note di rilascio.");
    html = html.replace(" Non sono ancora disponibili requisiti completi per una Stable.", " Consulta le note di rilascio per i requisiti specifici.");
    html = html.replace(" Nessun installer è collegato finché questi dati non sono approvati.", " Verifica questi dati prima di installare.");
  }
  if (name !== 'download.html' || !active) return html;
  html = block(html, 'stable-current', '<div class="panel release-preview"><h2 id="titolo-stato">Stable corrente</h2>' +
    '<p>HORIZON ' + escape(active.version) + ' Stable</p><a class="button primary" href="' +
    escape(active.installer.url) + '">Scarica HORIZON</a></div>');
  const rows = catalog.releases.map(item => '<tr><th scope="row">' + escape(item.version) +
    '</th><td>' + escape(item.publishedAt.slice(0,10)) + '</td><td><a href="#release-' +
    escape(item.version) + '">Note di rilascio</a></td><td><a href="' + escape(item.installer.url) +
    '">Installer</a> · ' + item.installer.bytes + ' byte</td></tr>').join('\n');
  const notes = catalog.releases.map(item => '<article class="panel" id="release-' + escape(item.version) +
    '"><h3>' + escape(item.title) + '</h3><p>Versione tecnica ' + escape(item.technicalVersion) +
    '</p><p>SHA-256 <code>' + escape(item.installer.sha256) + '</code></p><pre>' + escape(item.notes) +
    '</pre><p><a href="' + escape(item.provenance) + '">Provenienza GitHub</a></p></article>').join('\n');
  return block(html, 'stable-rows', rows)
    .replace('0 release pubblicate', catalog.releases.length + ' release pubblicate')
    .replace('</table></div></section>', '</table></div><div class="release-notes">' + notes + '</div></section>');
}

export function writeBuild(output, catalog) {
  const rendered = names.map(name => {
    const bytes = fs.readFileSync(path.join(base, 'site', name));
    return [name, name.endsWith('.html') || name.endsWith('.json')
      ? render(bytes.toString('utf8'), name, catalog) : bytes];
  });
  fs.mkdirSync(output);
  for (const [name, body] of rendered) {
    const target = path.join(output, name);
    fs.mkdirSync(path.dirname(target), {recursive:true});
    fs.writeFileSync(target, body, {flag:'wx'});
  }
  return names.length;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = process.argv[2];
  if (!output) throw new Error('Indicare una nuova directory per la build');
  const repository = process.env.GITHUB_REPOSITORY;
  const enabled = process.env.HORIZON_DISTRIBUTION_ENABLED === 'true';
  const catalog = await buildCatalog(githubSource(repository, process.env.GH_TOKEN), repository, enabled);
  console.log(JSON.stringify({files:writeBuild(output, catalog), current:catalog.current, releases:catalog.releases.length}));
}



