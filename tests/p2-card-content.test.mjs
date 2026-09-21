import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const data=JSON.parse(readFileSync(new URL('../dist/assets/cards.json',import.meta.url),'utf8'));
const directions=['upright','reversed'];
const themeKeys=['blind','caution','want','letgo','diff'];
const forbidden=/undefined|null/i;

assert.equal(data.cards.length,78,'カードは78枚必要です');
assert.equal(new Set(data.cards.map(card=>card.id)).size,78,'カードIDが重複しています');

let rendered=0;
for(const card of data.cards) {
  assert.match(card.id,/^(ar|wa|cu|sw|pe)\d{2}$/);
  for(const direction of directions) {
    const copy=card[direction];
    assert.ok(copy.meaning.trim(),`${card.id}/${direction}: meaningが空です`);
    assert.ok(copy.keywords.length,`${card.id}/${direction}: keywordsが空です`);
    for(const themeKey of themeKeys) {
      const html=`<h3>${copy.keywords.join('・')}</h3><p>${copy.meaning}</p><section>${copy.themes[themeKey]}</section>`;
      assert.ok(copy.themes[themeKey]?.trim(),`${card.id}/${direction}/${themeKey}: テーマ文が空です`);
      assert.doesNotMatch(html,forbidden,`${card.id}/${direction}/${themeKey}: 不正な表示値があります`);
      rendered++;
    }
  }
}

const emperor=data.cards.find(card=>card.id==='ar04');
assert.notEqual(emperor.upright.themes.blind,emperor.upright.themes.letgo,'皇帝のテーマ文が同一です');
console.log(`P2 card content: OK (${rendered} combinations rendered)`);
