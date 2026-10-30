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
  assert.match(markdown,/# DECIDE\. 決定ログ/);
  assert.match(markdown,/### メモ/);
  assert.match(markdown,/Obsidianで同期すると/);
  assert.equal(JSON.stringify(backup.parse(markdown)),JSON.stringify(payload));
  assert.equal(JSON.stringify(backup.parse(markdown.replace('転職 \\#相談','別の見出し'))),JSON.stringify(payload));
  assert.throws(()=>backup.parse('# another note'),/DECIDE\.のMarkdown/);
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

test('the original celestial back remains available alongside six optional artwork backs',async()=>{
  assert.equal(backs.length,7);
  assert.deepEqual(Array.from(backs[0]),['celestial','星と月']);
  assert.equal(new Set(backs.map(([id])=>id)).size,backs.length);
  for(const [id] of backs)assert.match(css,new RegExp(`\\.back-${id}(?:,|\\s*\\{)`),`${id} missing style`);
  for(const [id] of backs.slice(1)) {
    const file=`./assets/card-backs/${id}.webp`;
    const bytes=await readFile(new URL(`../dist/${file}`,import.meta.url));
    assert.equal(bytes.subarray(0,4).toString(),'RIFF',`${id} missing WebP data`);
    assert.equal(bytes.subarray(8,12).toString(),'WEBP',`${id} missing WebP format`);
    assert.ok(worker.includes(`'${file}'`),`${id} missing offline cache entry`);
  }
  assert.match(app,/DECIDE_CARD_BACKS\.map\(choice\)/);
  assert.match(html,/\.\/card-backs\.js/);
  assert.match(worker,/\.\/card-backs\.js/);
});

test('saved card-back choices survive startup and unknown choices fall back safely',()=>{
  const initialization=app.slice(app.indexOf('const savedSettings = '),app.indexOf('const DECK_MODES = '));
  for(const [id] of backs) {
    const saved={back:id,feedback:true,cloudSync:false,deckMode:'major-upright'};
    const result=vm.runInNewContext(`${initialization}\nsettings`,{load:()=>saved,SETTINGS_KEY:'settings',DECIDE_CARD_BACKS:backs});
    assert.equal(result.back,id);
    assert.equal(result.feedback,true);
  }
  for(const saved of [{},{back:'deleted-design'},{back:null},{back:'<bad>'}]) {
    const result=vm.runInNewContext(`${initialization}\nsettings`,{load:()=>saved,SETTINGS_KEY:'settings',DECIDE_CARD_BACKS:backs});
    assert.equal(result.back,'celestial');
  }
});

test('card-back names retain their complete words in at most two explicit lines',()=>{
  const source=app.slice(app.indexOf('function backPicker()'),app.indexOf('function selectBack('));
  const markup=vm.runInNewContext(`${source}\nbackPicker()`,{DECIDE_CARD_BACKS:backs,settings:{back:'celestial'}});
  const buttons=[...markup.matchAll(/<button\b[^>]*aria-label="([^"]+)"[^>]*>[\s\S]*?<small>([\s\S]*?)<\/small>/g)];
  assert.equal(buttons.length,backs.length);
  for(const [,label,content] of buttons){
    const lines=[...content.matchAll(/<span>([^<]+)<\/span>/g)].map(match=>match[1]);
    assert.ok(lines.length>=1&&lines.length<=2,`${label}: unexpected line count`);
    assert.equal(lines.join('・'),label,`${label}: the full accessible name must remain available`);
    assert.ok(lines.every(line=>[...line].length<=7),`${label}: a word is too wide for the mobile grid`);
  }
});
