// Reading comfort for the static card and worry pages: long paragraphs are split
// between sentences, and links answer the finger. Both steps are idempotent.

const OPEN = '「『（(【';
const CLOSE = '」』）)】';

// Split Japanese text after 。！？ that sit outside brackets.
export function sentences(text) {
  const out = [];
  let depth = 0, start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (OPEN.includes(ch)) depth++;
    else if (CLOSE.includes(ch)) depth = Math.max(0, depth - 1);
    else if (depth === 0 && '。！？'.includes(ch)) { out.push(text.slice(start, i + 1)); start = i + 1; }
  }
  if (start < text.length) out.push(text.slice(start));
  return out.filter((s) => s.trim());
}

// Group sentences into paragraphs of about `target` characters; short text is left alone.
export function splitParagraph(text, { limit = 110, target = 90 } = {}) {
  if ([...text].length <= limit) return [text];
  const parts = [];
  let current = '';
  for (const s of sentences(text)) {
    if (current && [...current].length + [...s].length > target) { parts.push(current); current = ''; }
    current += s;
  }
  if (current) parts.push(current);
  // Do not leave a lone short sentence behind.
  if (parts.length > 1 && [...parts.at(-1)].length < 24) parts.splice(-2, 2, parts.at(-2) + parts.at(-1));
  return parts;
}

// Only plain <p> elements (no attributes, no inner markup) are split.
export function splitLongParagraphs(html) {
  return html.replace(/<p>([^<]+)<\/p>/g, (whole, text) => {
    const parts = splitParagraph(text);
    return parts.length > 1 ? parts.map((p) => `<p>${p}</p>`).join('\n') : whole;
  });
}

export const FEEL_CSS = `/* reading-feel:start */
a{-webkit-tap-highlight-color:transparent;touch-action:manipulation}
main p{text-wrap:pretty;line-break:strict}
.cta a,.pager a,.cats a,.wjump a,.wtile-cards a,.wtile-more,.grid a,.wcards a,.alist a,.wtile-head,.back,.crumbs a{transition:transform .14s cubic-bezier(.3,1.5,.5,1),box-shadow .12s ease,background-color .15s ease,opacity .15s ease}
.cta a:active{transform:scale(.96)}
.pager a:active,.pager a.is-pressed,.wtile-cards a:active{transform:translate(1px,1px);background:var(--accent);color:#111}
/* .cats marks the current page in yellow, so a pressed chip turns black to stay distinct */
.cats a:active,.cats a.is-pressed{transform:translate(1px,1px);background:#111;color:var(--accent)}
.wjump a:active,.wjump a.is-pressed{transform:translate(2px,2px);box-shadow:0 0 0 #111;background:var(--accent);color:#111}
.wtile:has(.wtile-head:active){transform:translate(2px,2px);box-shadow:2px 2px 0 #111}
.pager a:active,.pager a.is-pressed{box-shadow:1px 1px 0 #111}
.wtile{transition:transform .12s ease,box-shadow .12s ease}
.wtile-head:active{background:#f7e88a}
.wtile-more:active{opacity:.85}
.grid a,.cgrid a{margin:-4px;padding:4px}
.grid a:active,.grid a.is-pressed{transform:scale(.96);background:var(--accent);color:#111}
/* same as the app's reading links: yellow while going, a quick shrink only under the finger */
.wcards a:active{scale:.985}
.wcards a:active,.wcards a.is-pressed{background:var(--accent);color:#111}
/* Every link shows it was chosen, at once, until the next page opens (the page change waits 150ms).
   Yellow by default, as in the app; the current-page chip is already yellow, so a chosen chip turns black,
   and the black button on the yellow CTA turns white. In-page jumps (the doors, suit tabs) only press:
   the scroll shows where they went. */
a.is-pressed{background:var(--accent)!important;color:#111!important;transition-duration:0s!important}
a.is-pressed :is(small,.kicker),a.is-pressed::before,a.is-pressed::after{color:#111!important}
.cats a.is-pressed{background:#111!important;color:var(--accent)!important}
.cta a.is-pressed{background:var(--card)!important}
.wcell.is-pressed{transform:translate(2px,2px);box-shadow:1px 1px 0 #111}
.wtile:has(.wtile-head.is-pressed,.wtile-more.is-pressed){transform:translate(2px,2px);box-shadow:2px 2px 0 #111}
.crumbs a:active,.alist a:active,.note a:active{opacity:.55}
@media (hover:hover){.pager a:hover,.cats a:hover,.wjump a:hover,.wtile-cards a:hover{background:#fff6c2}.cta a:hover{transform:translateY(-1px)}}
@view-transition{navigation:auto}
::view-transition-old(root){animation:feel-out .2s ease both}
::view-transition-new(root){animation:feel-in .32s cubic-bezier(.2,.8,.2,1) both}
html:active-view-transition-type(back)::view-transition-old(root){animation-name:feel-out-back}
html:active-view-transition-type(back)::view-transition-new(root){animation-name:feel-in-back}
::view-transition-group(card-art){animation-duration:.38s;animation-timing-function:cubic-bezier(.2,.8,.2,1)}
.app-nav{view-transition-name:app-nav}
::view-transition-group(app-nav){animation:none}
@keyframes feel-in{from{opacity:0;transform:translateX(28px)}}
@keyframes feel-out{to{opacity:0;transform:translateX(-28px)}}
@keyframes feel-in-back{from{opacity:0;transform:translateX(-28px)}}
@keyframes feel-out-back{to{opacity:0;transform:translateX(28px)}}
@media (prefers-reduced-motion:reduce){*{transition:none!important}@view-transition{navigation:none}}
/* reading-feel:end */`;

// Every link stays lit from the tap until the next page opens (cleared on 戻る via pageshow),
// so a slow page load never looks like a missed tap. Page changes slide like the app's screens:
// forward from the right, back (戻る links or history) from the left, and a tapped card's picture
// grows into the card page's hero. 戻る (top pill and bottom nav) retraces the reader's last step
// when that step was on this site, e.g. the splash's 転職 link returns to the splash; opened directly,
// it falls through to its href, the parent list. Lives in <head> so pagereveal is heard before the
// first frame. The page change waits a beat (150ms) after a link lights up so the choice is seen
// before the slide starts. Progressive enhancement: without JS or view transitions the links work as plain links.
const PRESS_JS = `<script data-press>(function(){function clear(){[].forEach.call(document.querySelectorAll('.is-pressed'),function(x){x.classList.remove('is-pressed');var i=x.querySelector('img');if(i)i.style.viewTransitionName=''})}function canBack(){var n=window.navigation;if(n&&n.currentEntry){var p=n.entries()[n.currentEntry.index-1];return !!p&&new URL(p.url).origin===location.origin}try{return history.length>1&&!!document.referrer&&new URL(document.referrer).origin===location.origin}catch(_){return false}}function back(e){var a=e&&e.activation;return a&&a.navigationType==='traverse'&&a.from&&a.entry&&a.entry.index<a.from.index}document.addEventListener('click',function(e){var t=e.target.closest&&e.target.closest('a[href]');if(!t||e.defaultPrevented||e.button||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;var b=t.matches('.back,[data-go="back"]');try{sessionStorage.setItem('feel-dir',b?'back':'')}catch(_){}if(t.hash&&t.pathname===location.pathname&&t.search===location.search)return;clear();t.classList.add('is-pressed');if(t.target||t.origin!==location.origin)return;e.preventDefault();setTimeout(function(){if(b&&canBack())history.back();else location.href=t.href},150)});window.addEventListener('pageshow',clear);window.addEventListener('pageswap',function(e){if(!e.viewTransition)return;var b=back(e);try{b=b||sessionStorage.getItem('feel-dir')==='back'}catch(_){}if(b){e.viewTransition.types.add('back');return}var i=document.querySelector('.is-pressed img');if(i)i.style.viewTransitionName='card-art'});window.addEventListener('pagereveal',function(e){if(!e.viewTransition)return;var b=back(window.navigation);try{b=b||sessionStorage.getItem('feel-dir')==='back';sessionStorage.removeItem('feel-dir')}catch(_){}if(b){e.viewTransition.types.add('back');return}var h=document.querySelector('.hero img');if(!h)return;h.style.viewTransitionName='card-art';e.viewTransition.finished.finally(function(){h.style.viewTransitionName=''})})})();</script>`;

export function applyReadingFeel(html) {
  html = html.replace(/\/\* reading-feel:start \*\/[\s\S]*?\/\* reading-feel:end \*\//, '').replace(/\n<\/style>/, '</style>');
  html = html.replace('</style>', `\n${FEEL_CSS}</style>`);
  html = html.replace(/\n?<script data-press>[\s\S]*?<\/script>/, '').replace('</head>', `${PRESS_JS}\n</head>`);
  return splitLongParagraphs(html);
}
