import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const formatSource=await readFile(new URL('../dist/backup-format.js',import.meta.url),'utf8');
const backsSource=await readFile(new URL('../dist/card-backs.js',import.meta.url),'utf8');
const app=await readFile(new URL('../dist/app.js',import.meta.url),'utf8');
const css=await readFile(new URL('../dist/styles.css',import.meta.url),'utf8');
const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
const worker=await readFile(new URL('../dist/service-worker.js',import.meta.url),'utf8');
const backup=vm.runInNewContext(`${formatSource}\nDECIDE_BACKUP_FORMAT`,{TextEncoder,TextDecoder,btoa,atob});
const backs=vm.runInNewContext(`${backsSource}\nDECIDE_CARD_BACKS`);

test('Obsidian note is readable and reimports every log field exactly',()=>{
  const payload={app:'DECIDE',schema:1,exportedAt:'2026-09-23T00:00:00.000Z',logs:[{
    id:'id-1',mode:'two',createdAt:'2026-09-23T00:00:00.000Z',title:'転職 #相談 -->',memo:'大切な *メモ* 🌸',story:'その後\n良かった',genre:'仕事',
    option1:'残る',option2:'転職',decision:'選択肢2',review:'良かった',nodes:[{question:'',card:{name:'愚者',orientation:'reversed',image:'./assets/rider-waite/ar00.jpg'}}]
  }]};
  const markdown=backup.render(payload);
  assert.match(markdown,/# DECIDE 決定ログ/);
  assert.match(markdown,/### メモ/);
  assert.match(markdown,/Obsidianで同期すると/);
  assert.equal(JSON.stringify(backup.parse(markdown)),JSON.stringify(payload));
  assert.equal(JSON.stringify(backup.parse(markdown.replace('転職 \\#相談','別の見出し'))),JSON.stringify(payload));
  assert.throws(()=>backup.parse('# another note'),/DECIDEのMarkdown/);
  assert.throws(()=>backup.parse(markdown.replace(/<!-- DECIDE-BACKUP-V1[\s\S]*$/, '<!-- DECIDE-BACKUP-V1\ninvalid\nEND-DECIDE-BACKUP-V1 -->')),/バックアップデータを読み取れませんでした/);
});

test('old JSON backups still import and Markdown shares the same import validation',()=>{
  assert.match(app,/function prepareImport\(payload\)/);
  assert.match(app,/pendingImport=prepareImport\(payload\)/);
  assert.match(app,/if\(!safeSetItem\(STORAGE_KEY,JSON\.stringify\(mergedLogs\)\)\)/);
  assert.match(app,/markdown\?DECIDE_BACKUP_FORMAT\.parse\(content\):JSON\.parse\(content\)/);
  assert.match(app,/format='markdown'/);
  assert.match(app,/data-action="export-markdown"/);
  assert.match(app,/data-action="import-markdown"/);
  assert.match(html,/\.\/backup-format\.js/);
  assert.match(worker,/\.\/backup-format\.js/);
});

test('the single celestial card back defines the visual identity',()=>{
  assert.equal(backs.length,1);
  assert.deepEqual(Array.from(backs[0]),['celestial','星と月']);
  for(const [id] of backs)assert.match(css,new RegExp(`\\.back-${id}(?:,|\\s*\\{)`),`${id} missing style`);
  assert.match(app,/DECIDE_CARD_BACKS\.map\(choice\)/);
  assert.match(app,/settings\.back = DEFAULT_CARD_BACK/);
  assert.match(html,/\.\/card-backs\.js/);
  assert.match(worker,/\.\/card-backs\.js/);
});
