import fs from 'node:fs';

const [cardsPath,patchPath]=process.argv.slice(2);
if(!cardsPath || !patchPath)throw new Error('usage: node apply-p16a-card-patch.mjs CARDS_JSON PATCH_JSON');

let raw=fs.readFileSync(cardsPath,'utf8');
const cardsDocument=JSON.parse(raw);
const patch=JSON.parse(fs.readFileSync(patchPath,'utf8'));
const cardsById=new Map(cardsDocument.cards.map(card=>[card.id,card]));
const applied=[];
const skipped=[];

for(const change of patch.changes) {
  const card=cardsById.get(change.id);
  const current=change.theme==='meaning'
    ? card?.[change.orientation]?.meaning
    : card?.[change.orientation]?.themes?.[change.theme];
  if(current!==change.old) {
    skipped.push({id:change.id,orientation:change.orientation,theme:change.theme,current:current ?? null});
    continue;
  }
  const oldToken=JSON.stringify(change.old);
  const newToken=JSON.stringify(change.new);
  const occurrences=raw.split(oldToken).length-1;
  if(occurrences!==1) {
    skipped.push({id:change.id,orientation:change.orientation,theme:change.theme,current,reason:`old token occurrences: ${occurrences}`});
    continue;
  }
  raw=raw.replace(oldToken,newToken);
  applied.push({id:change.id,orientation:change.orientation,theme:change.theme});
}

fs.writeFileSync(cardsPath,raw,'utf8');
process.stdout.write(`${JSON.stringify({requested:patch.changes.length,applied:applied.length,skipped},null,2)}\n`);
