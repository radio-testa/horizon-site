import {createHash} from 'node:crypto';

const tagPattern = /^v(0|[1-9]\d{0,4})\.(0|[1-9]\d{0,4})\.(0|[1-9]\d{0,4})(?![\s\S])/;
const shaPattern = /^[0-9a-f]{64}(?![\s\S])/;
export const emptyCatalog = () => ({schemaVersion:2, channel:'stable', current:null, releases:[]});

function check(ok, message) {
  if (!ok) throw new Error(message);
}

function infoAsset(release, name, repository, limit) {
  const matches = release.assets.filter(asset => asset.name === name);
  check(matches.length === 1, release.tag_name + ': allegato richiesto ' + name);
  const asset = matches[0];
  const url = 'https://github.com/' + repository + '/releases/download/' + release.tag_name + '/' + name;
  check(asset.state === 'uploaded' && asset.browser_download_url === url &&
    Number.isSafeInteger(asset.size) && asset.size > 0 && asset.size <= limit &&
    typeof asset.digest === 'string' && asset.digest.startsWith('sha256:') && shaPattern.test(asset.digest.slice(7)),
  release.tag_name + ': metadati allegato non validi');
  return asset;
}

async function verifyBytes(asset, read, collect = false) {
  const hash = createHash('sha256');
  let size = 0;
  const buffers = [];
  const stream = await read(asset.browser_download_url);
  for await (const value of stream) {
    const chunk = Buffer.from(value);
    size += chunk.length;
    check(size <= asset.size, 'Dimensione allegato eccedente');
    hash.update(chunk);
    if (collect) buffers.push(chunk);
  }
  check(size === asset.size && 'sha256:' + hash.digest('hex') === asset.digest, 'Byte o SHA-256 allegato non coerenti');
  return collect ? Buffer.concat(buffers) : undefined;
}

export async function buildCatalog(source, repository, enabled = false) {
  if (!enabled) return emptyCatalog();
  check(typeof repository === 'string' && /^radio-testa\/[A-Za-z0-9_.-]+(?![\s\S])$/.test(repository), 'Repository non autorizzato');
  const releases = await source.releases();
  const latest = await source.latest();
  check(Array.isArray(releases), 'Elenco GitHub non valido');
  const catalog = emptyCatalog();
  const seen = new Set();
  for (const release of releases) {
    check(release && typeof release.draft === 'boolean' && typeof release.prerelease === 'boolean', 'Record API malformato');
    if (release.draft || release.prerelease) continue;
    const match = typeof release.tag_name === 'string' && release.tag_name.match(tagPattern);
    check(match && match.slice(1).every(part => Number(part) <= 65535), 'Tag Stable non valido');
    const version = match.slice(1).join('.');
    check(!seen.has(version), 'Versione duplicata');
    seen.add(version);
    check(Number.isSafeInteger(release.id) && release.id > 0 && Array.isArray(release.assets) &&
      typeof release.published_at === 'string' && Number.isFinite(Date.parse(release.published_at)) &&
      typeof release.name === 'string' && release.name.trim() && release.name.length <= 200 &&
      typeof release.body === 'string' && release.body.length <= 32000, version + ': metadati release non validi');
    const info = infoAsset(release, 'horizon-release.json', repository, 65536);
    const metadataBytes = await verifyBytes(info, source.asset, true);
    const meta = JSON.parse(metadataBytes.toString('utf8').replace(/^\uFEFF/, ''));
    check(meta?.schemaVersion === 1 && meta.publicVersion === version &&
      typeof meta.technicalVersion === 'string' && /^\d+\.\d+\.\d+\.\d+(?![\s\S])/.test(meta.technicalVersion) &&
      meta.technicalVersion.split('.').every(part => Number(part) <= 65535) &&
      typeof meta.buildId === 'string' && /^[A-Za-z0-9_.-]{1,120}(?![\s\S])/.test(meta.buildId) &&
      typeof meta.installerSha256 === 'string' && shaPattern.test(meta.installerSha256), version + ': handoff pubblico non valido');
    const name = 'HORIZON_Setup.exe';
    const asset = infoAsset(release, name, repository, 2147483647);
    check(asset.digest === 'sha256:' + meta.installerSha256, version + ': SHA-256 diverso dal handoff');
    await verifyBytes(asset, source.asset);
    catalog.releases.push({version, tag:release.tag_name, technicalVersion:meta.technicalVersion,
      buildId:meta.buildId, channel:'stable', title:release.name, notes:release.body,
      publishedAt:release.published_at, releaseId:release.id, status:'supported',
      provenance:'https://github.com/' + repository + '/releases/tag/' + release.tag_name,
      installer:{name, bytes:asset.size, sha256:meta.installerSha256, url:asset.browser_download_url}});
  }
  catalog.releases.sort((a,b) => b.version.localeCompare(a.version, 'en', {numeric:true}));
  if (latest !== null) {
    const active = catalog.releases.find(item => item.releaseId === latest.id && item.tag === latest.tag_name);
    check(active, 'Latest incoerente con il catalogo Stable');
    catalog.current = active.version;
  } else {
    check(catalog.releases.length === 0, 'Latest mancante con Stable presenti');
  }
  return catalog;
}

export function githubSource(repository, token = '', fetcher = fetch) {
  const base = 'https://api.github.com/repos/' + repository + '/releases';
  async function api(suffix, nullable = false) {
    const headers = {Accept:'application/vnd.github+json', 'X-GitHub-Api-Version':'2026-03-10'};
    if (token) headers.Authorization = 'Bearer ' + token;
    const res = await fetcher(base + suffix, {headers, redirect:'error', signal:AbortSignal.timeout(30000)});
    if (nullable && res.status === 404) return null;
    if (!res.ok) throw new Error('GitHub Releases HTTP ' + res.status);
    return res.json();
  }
  return {
    async releases() {
      const rows = [];
      for (let page = 1; page <= 20; page++) {
        const batch = await api('?per_page=100&page=' + page);
        check(Array.isArray(batch), 'Risposta GitHub inattesa');
        rows.push(...batch);
        if (batch.length < 100) return rows;
      }
      throw new Error('Limite di paginazione superato');
    },
    latest: () => api('/latest', true),
    async asset(url) {
      for (let n = 0; n < 4; n++) {
        const target = new URL(url);
        check(target.protocol === 'https:' && !target.port && !target.username && !target.password &&
          ['github.com','release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(target.hostname),
        'Host di download non autorizzato');
        const res = await fetcher(url, {redirect:'manual', signal:AbortSignal.timeout(300000)});
        if ([301,302,303,307,308].includes(res.status)) {
          const location = res.headers.get('location');
          await res.body?.cancel();
          check(location, 'Redirect senza destinazione');
          url = new URL(location, url).href;
          continue;
        }
        check(res.status === 200 && res.body, 'Allegato non disponibile via HTTPS');
        return res.body;
      }
      throw new Error('Troppi redirect allegato');
    }
  };
}

