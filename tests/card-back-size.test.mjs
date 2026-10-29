import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';

const css=fs.readFileSync(new URL('../dist/styles.css',import.meta.url),'utf8');
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/card-back-visible-bounds.json',import.meta.url),'utf8'));
const frames=[[50,80],[39,62],[92,147.2],[120,192],[156,249.6],[166,266]];

test('all six artwork backs fill the visible card frame despite their different transparent margins',()=>{
  assert.equal(fixture.cards.length,6);
  assert.match(css,/background:\s*var\(--card-back-art\) var\(--card-back-position,center\) \/ var\(--card-back-size,100% 100%\)/);
  for(const card of fixture.cards){
    const image=fs.readFileSync(new URL(`../${card.file}`,import.meta.url));
    assert.equal(createHash('sha256').update(image).digest('hex'),card.sha256,`${card.id}: regenerate bounds when the image changes`);
    const rule=css.match(new RegExp(`\\.back-${card.id} \\{([^}]+)\\}`))?.[1];
    const size=rule?.match(/--card-back-size:\s*([\d.]+)%\s+([\d.]+)%/);
    const position=rule?.match(/--card-back-position:\s*([\d.]+)%\s+([\d.]+)%/);
    assert.ok(size&&position,`${card.id}: missing artwork normalization`);
    for(const [width,height] of frames){
      const iw=width*Number(size[1])/100,ih=height*Number(size[2])/100;
      const x=(width-iw)*Number(position[1])/100+card.visibleBounds.left/card.canvas.width*iw;
      const y=(height-ih)*Number(position[2])/100+card.visibleBounds.top/card.canvas.height*ih;
      const visibleWidth=card.visibleBounds.width/card.canvas.width*iw;
      const visibleHeight=card.visibleBounds.height/card.canvas.height*ih;
      assert.ok(Math.abs(x)<0.01&&Math.abs(y)<0.01,`${card.id} ${width}x${height}: visible origin ${x},${y}`);
      assert.ok(Math.abs(visibleWidth-width)<0.01&&Math.abs(visibleHeight-height)<0.01,`${card.id} ${width}x${height}: visible size ${visibleWidth}x${visibleHeight}`);
    }
  }
});
