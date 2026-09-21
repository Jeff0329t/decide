import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../dist/styles.css',import.meta.url),'utf8');

test('safeSetItem catches storage exceptions and persist returns a result',()=>{
  assert.match(app,/function safeSetItem\(key, value\) \{ try \{ localStorage\.setItem\(key, value\); return true; \} catch \{ return false; \} \}/);
  assert.match(app,/function persist\(\)[\s\S]*return !storageSaveFailed;/);
  const source=app.match(/function safeSetItem\(key, value\) \{[^\n]+\}/)?.[0];
  const succeeds=Function('localStorage',`${source}; return safeSetItem('key','value');`)({setItem(){}});
  const fails=Function('localStorage',`${source}; return safeSetItem('key','value');`)({setItem(){throw Object.assign(new Error('full'),{name:'QuotaExceededError'});}});
  assert.equal(succeeds,true);
  assert.equal(fails,false);
});

test('save failure keeps the pending record and offers a one-record export',()=>{
  assert.match(app,/if\(!persist\(\)\) \{ pendingSave=\{log,firstRecord,requestPersistence\}; openSaveFailure\(log\); return; \}/);
  assert.match(app,/保存できませんでした/);
  assert.match(app,/この記録を書き出す/);
  assert.match(app,/exportLogs\(\[failed\],false\)/);
  assert.match(app,/function backupPayloadFor\(records=logs\)[\s\S]*logs:records/);
});

test('iOS standalone and in-app browser conditions are present',()=>{
  assert.match(app,/navigator\.standalone===true/);
  assert.match(app,/display-mode: standalone/);
  assert.match(app,/iPhone\|iPad\|iPod/);
  assert.match(app,/navigator\.platform==='MacIntel'/);
  assert.match(app,/Line\\\/\|FBAN\|FBAV\|Instagram\|Twitter/);
  assert.match(app,/isIOS\(\) && !isStandalone\(\)/);
});

test('A2HS copy, help steps, and seven-day suppression are wired',()=>{
  assert.match(app,/記録を消さないために、ホーム画面に追加しておきませんか/);
  assert.match(app,/画面下の共有ボタン（□に↑）を押す/);
  assert.match(app,/「ホーム画面に追加」を選ぶ/);
  assert.match(app,/右上の「追加」を押す/);
  assert.match(app,/a2hsDismissedUntil=Date\.now\(\)\+7\*DAY_MS/);
});

test('backup reminder requires three logs and uses fourteen-day suppression',()=>{
  assert.match(app,/logs\.length<3/);
  assert.match(app,/Date\.now\(\)-last>14\*DAY_MS/);
  assert.match(app,/backupReminderDismissedUntil=Date\.now\(\)\+14\*DAY_MS/);
  assert.match(app,/バックアップしておきませんか/);
});

test('persistent storage is requested once after the first successful record',()=>{
  assert.match(app,/settings\.storagePersistRequested=true/);
  assert.match(app,/navigator\.storage\?\.persist\?\.\(\)/);
  assert.match(app,/if\(requestPersistence\)requestPersistentStorage\(\)/);
});

test('all required local-only storage events are dispatched',()=>{
  for(const action of ['saveFailed','a2hsShown','a2hsHelp','a2hsDismiss','exportFromError'])assert.match(app,new RegExp(`storageEvent\\('${action}'\\)`));
  assert.match(app,/new CustomEvent\('decide:storage',\{detail:\{action\}\}\)/);
});

test('settings show failure and Safari-specific guidance',()=>{
  assert.match(app,/この端末では保存できない状態です/);
  assert.match(app,/Safariでは、記録は端末内に保存されます。しばらく開かないと消えることがあるため、ホーム画面への追加と、書き出しをおすすめします。/);
  assert.match(app,/storage-error/);
  assert.match(css,/\.storage-error/);
  assert.match(css,/\.storage-banner/);
});

test('touched detail user fields use textContent or value, not innerHTML interpolation',()=>{
  assert.match(app,/querySelector\('\[data-detail-title\]'\)\.textContent=log\.title/);
  assert.match(app,/memo\.textContent=log\.memo/);
  assert.match(app,/querySelector\('#story-text'\)\.value=log\.story \|\| ''/);
  assert.doesNotMatch(app,/<h1>\$\{esc\(log\.title\)\}<\/h1>/);
});
