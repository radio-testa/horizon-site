import {fixtures, repository} from './fixture.mjs';
import {buildCatalog} from '../hosting/catalog.mjs';
import {writeBuild} from '../hosting/build.mjs';

const [mode, output] = process.argv.slice(2);
if (!output || !['empty','first','latest','withdrawn','fallback'].includes(mode)) {
  throw new Error('Uso: node tests/preview.mjs empty|first|latest|withdrawn|fallback nuova-cartella');
}
const f = fixtures();
const scenarios = {empty:[[],null], first:[[f.first],f.first], latest:[[f.first,f.next],f.next],
  withdrawn:[[f.first],f.first], fallback:[[f.first,f.next],f.first]};
const [rows, latest] = scenarios[mode];
const catalog = await buildCatalog(f.source(rows, latest), repository, true);
writeBuild(output, catalog);
console.log('Build di collaudo ' + mode + ' · current=' + catalog.current + ' · ' + catalog.releases.length + ' release');

