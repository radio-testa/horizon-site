import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = process.argv[2];
const allowed = ['.nojekyll','assets/HORIZON_WEB_HERO_APPROVATO.png','community.html','download.html','guida.html',
  'index.html','privacy.html','releases.json','styles.css','verifica.html'];
function list(directory, prefix = '') {
  return fs.readdirSync(directory,{withFileTypes:true}).flatMap(file => {
    const name = prefix + file.name;
    if (file.isDirectory()) return list(path.join(directory,file.name), name + '/');
    assert(file.isFile(), 'File non regolare: ' + name);
    return [name];
  });
}
assert.deepEqual(list(root).sort(), [...allowed].sort());
const read = name => fs.readFileSync(path.join(root,name),'utf8');
const catalog = JSON.parse(read('releases.json'));
assert.equal(catalog.schemaVersion,2);
assert.equal(catalog.channel,'stable');
const current = catalog.releases.find(release => release.version === catalog.current);
assert(catalog.current === null ? catalog.releases.length === 0 : current);
const download = read('download.html');
if (current) assert(download.includes('href="' + current.installer.url + '">Scarica HORIZON'));
const assets = new Set(catalog.releases.map(release => release.installer.url));
let count = 0;
for (const name of allowed.filter(file=>file.endsWith('.html'))) {
  const html = read(name);
  assert(!/<(?:script|iframe|form|object|embed)\b|<[a-z][^>]*\son\w+\s*=/i.test(html));
  assert(!/(?:github_pat_|ghp_|BEGIN (?:RSA |EC )?PRIVATE KEY|[A-Z]:\\Users\\)/.test(html));
  for (const [, attr, ref] of html.matchAll(/\b(href|src)="([^"]+)"/gi)) {
    if (/^https:\/\//.test(ref)) {
      assert.equal(attr,'href');
      if (/\/releases\/download\/|\.exe(?:$|[?#])/.test(ref)) assert(assets.has(ref));
      continue;
    }
    const [target, anchor] = ref.split('#');
    const file = target || name;
    assert(allowed.includes(file), 'Percorso: ' + ref);
    if (anchor) assert(read(file).includes('id="' + anchor + '"'), 'Ancora: ' + ref);
    count++;
  }
}
console.log(JSON.stringify({files:allowed.length, localLinks:count, stable:catalog.releases.length}));



