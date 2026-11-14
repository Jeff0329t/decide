// Builds dist/assets/cards-en.json (the English card-data overlay used by the
// app when the UI language is English) from the translation sources:
//   scripts/data/cards-en.json        base card texts (name/keywords/meaning/themes)
//   scripts/data/cards-extra-en.json  guide texts (hint/scene/check/decision)
// The Japanese data (dist/assets/cards.json) is never modified by this script.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const base = JSON.parse(readFileSync(join(root, 'scripts/data/cards-en.json'), 'utf8'));
const extra = JSON.parse(readFileSync(join(root, 'scripts/data/cards-extra-en.json'), 'utf8'));
const ja = JSON.parse(readFileSync(join(root, 'dist/assets/cards.json'), 'utf8'));

const cards = {};
for (const [id, c] of Object.entries(base.cards)) {
  const e = extra[id];
  if (!e) throw new Error(`cards-extra-en.json is missing ${id}`);
  cards[id] = { ...c, hint: e.hint, scene: e.scene, check: e.check, decision: e.decision };
}

// Sanity checks against the Japanese source data.
const jaIds = ja.cards.map((c) => c.id);
if (Object.keys(cards).length !== jaIds.length) throw new Error('card count mismatch');
for (const jc of ja.cards) {
  const ec = cards[jc.id];
  if (!ec) throw new Error(`missing English card ${jc.id}`);
  if (ec.name !== jc.en) throw new Error(`${jc.id}: name "${ec.name}" != cards.json en "${jc.en}"`);
  for (const o of ['upright', 'reversed']) {
    if (!Array.isArray(ec[o].keywords) || ec[o].keywords.length !== 3) throw new Error(`${jc.id} ${o}: keywords`);
    if (!ec[o].meaning) throw new Error(`${jc.id} ${o}: meaning`);
    for (const t of Object.keys(base.themes)) if (!ec[o].themes?.[t]) throw new Error(`${jc.id} ${o}: theme ${t}`);
  }
  if (ec.decision.worry !== jc.id && !ec.decision.worry) throw new Error(`${jc.id}: decision`);
}

const out = { meta: { lang: 'en', source: 'scripts/data/cards-en.json + scripts/data/cards-extra-en.json' }, themes: base.themes, cards };
writeFileSync(join(root, 'dist/assets/cards-en.json'), JSON.stringify(out) + '\n');
console.log(`cards-en.json written: ${Object.keys(cards).length} cards`);
