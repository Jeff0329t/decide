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
.pager a:active,.cats a:active,.wtile-cards a:active{transform:translate(1px,1px);background:var(--accent);color:#111}
.wjump a:active,.wjump a.is-pressed{transform:translate(2px,2px);box-shadow:0 0 0 #111;background:var(--accent);color:#111}
.wtile:has(.wtile-head:active){transform:translate(2px,2px);box-shadow:2px 2px 0 #111}
.pager a:active{box-shadow:1px 1px 0 #111}
.wtile{transition:transform .12s ease,box-shadow .12s ease}
.wtile-head:active{background:#f7e88a}
.wtile-more:active{opacity:.85}
.grid a{margin:-4px;padding:4px}
.grid a:active,.grid a.is-pressed{transform:scale(.96);background:var(--accent);color:#111}
.wcards a:active,.wcards a.is-pressed{background:#f7e88a}
.wtile-cards a.is-pressed{background:var(--accent);color:#111}
.crumbs a:active,.alist a:active,.note a:active{opacity:.55}
@media (hover:hover){.pager a:hover,.cats a:hover,.wjump a:hover,.wtile-cards a:hover{background:#fff6c2}.cta a:hover{transform:translateY(-1px)}}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
/* reading-feel:end */`;

// Card tiles and rows stay lit from the tap until the next page opens (cleared on 戻る via pageshow),
// so a slow page load never looks like a missed tap. Progressive enhancement: the links work without it.
const PRESS_JS = `<script data-press>(function(){var S='.wjump a,.grid a,.wcards a,.wtile-cards a';function clear(){[].forEach.call(document.querySelectorAll('.is-pressed'),function(x){x.classList.remove('is-pressed')})}document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest(S);if(!a||e.defaultPrevented||e.button||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;clear();a.classList.add('is-pressed')});window.addEventListener('pageshow',clear)})();</script>`;

export function applyReadingFeel(html) {
  html = html.replace(/\/\* reading-feel:start \*\/[\s\S]*?\/\* reading-feel:end \*\//, '').replace(/\n<\/style>/, '</style>');
  html = html.replace('</style>', `\n${FEEL_CSS}</style>`);
  html = html.replace(/\n?<script data-press>[\s\S]*?<\/script>/, '').replace('</body>', `${PRESS_JS}\n</body>`);
  return splitLongParagraphs(html);
}
