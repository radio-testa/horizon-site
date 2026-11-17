import {createHash} from 'node:crypto';

export const repository = 'radio-testa/horizon-fixture';
const hash = data => createHash('sha256').update(data).digest('hex');

export function fixtures({metadataBom = false} = {}) {
  const blobs = new Map();
  function release(version, id, extra = {}) {
    const tag = 'v' + version;
    const installer = Buffer.from('fixture-' + version);
    const meta = Buffer.from((metadataBom ? '\uFEFF' : '') + JSON.stringify({schemaVersion:1, publicVersion:version,
      technicalVersion:'0.0.0.' + id, buildId:'synthetic-' + id, installerSha256:hash(installer)}));
    function asset(name, data) {
      const url = 'https://github.com/' + repository + '/releases/download/' + tag + '/' + name;
      blobs.set(url, data);
      return {name, browser_download_url:url, state:'uploaded', size:data.length, digest:'sha256:' + hash(data)};
    }
    return {id, tag_name:tag, name:'HORIZON ' + version, body:'<script>alert(1)</script>\nNote di collaudo.',
      draft:false, prerelease:false, published_at:'2026-11-13T10:00:00Z',
      assets:[asset('horizon-release.json', meta),asset('HORIZON_Setup.exe', installer)], ...extra};
  }
  const first = release('1.1.5',1);
  const next = release('1.1.6',2);
  return {
    first, next, draft:release('1.1.7',3,{draft:true}), candidate:release('1.1.8',4,{prerelease:true}),
    source(rows, latest, tamper = false) {
      return {
        releases:async () => rows,
        latest:async () => latest,
        async *asset(url) {
          const data = Buffer.from(blobs.get(url));
          if (tamper && url.endsWith(tamper === true ? '.exe' : tamper)) data[0] ^= 1;
          yield data;
        }
      };
    }
  };
}

