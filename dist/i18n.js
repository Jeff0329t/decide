// DECIDE. i18n runtime (minimum multilingual build: ja / en).
//
// - Language resolution: ?lang= -> localStorage 'decide.lang.v1' ->
//   navigator.language (English environments start in English) -> 'ja'.
// - Japanese mode: the app behaves exactly as before; only the language
//   switcher is added to Settings.
// - English mode: a DOM translation layer rewrites rendered Japanese text
//   using the static dictionary (i18n-dict.js) plus data-driven maps built
//   from assets/cards.json + assets/cards-en.json (card names, keywords,
//   meanings, stories, themes), assets/learn.json + assets/learn-en.json,
//   and assets/related-articles.json + assets/article-titles-en.json.
//   Stored user data is never modified; only what is displayed changes.
(() => {
  const KEY = 'decide.lang.v1';
  let lang = null;
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (q === 'en' || q === 'ja') { lang = q; localStorage.setItem(KEY, q); }
  } catch (e) { /* ignore */ }
  if (!lang) { try { lang = localStorage.getItem(KEY); } catch (e) { /* ignore */ } }
  if (lang !== 'en' && lang !== 'ja') {
    lang = String(navigator.language || 'ja').toLowerCase().startsWith('en') ? 'en' : 'ja';
  }

  const api = {
    lang,
    locale: () => (lang === 'en' ? 'en-US' : 'ja-JP'),
    isEn: () => lang === 'en',
    setLang(next) {
      if (next !== 'en' && next !== 'ja') return;
      try { localStorage.setItem(KEY, next); } catch (e) { /* ignore */ }
      location.reload();
    },
  };
  window.DECIDE_I18N = api;

  // ---------- language switcher in Settings (both languages) ----------
  function injectLangSwitch() {
    const page = document.querySelector('#settings-modal .settings-page');
    if (!page || page.querySelector('[data-i18n-lang]')) return;
    const section = document.createElement('div');
    section.setAttribute('data-i18n-lang', '');
    section.setAttribute('data-i18n-skip', '');
    const title = document.createElement('h3');
    title.className = 'settings-group-title';
    title.textContent = lang === 'en' ? 'Language' : '言語 / Language';
    const box = document.createElement('div');
    box.className = 'deck-setting';
    const row = document.createElement('div');
    row.className = 'data-actions';
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', 'Language');
    for (const [value, label] of [['ja', '日本語'], ['en', 'English']]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'button secondary';
      b.dataset.langChoice = value;
      b.textContent = label;
      if (value === lang) { b.classList.add('selected'); b.setAttribute('aria-pressed', 'true'); b.style.borderColor = 'currentColor'; }
      row.append(b);
    }
    const note = document.createElement('p');
    note.textContent = lang === 'en'
      ? 'Your language choice is saved on this device. Card meanings and lessons are also shown in English.'
      : '言語はこの端末に保存されます。Englishを選ぶと、カードの意味やレッスンも英語で表示されます。';
    box.append(row, note);
    section.append(title, box);
    page.insertBefore(section, page.querySelector('.settings-group-title'));
    section.addEventListener('click', (event) => {
      const b = event.target.closest('[data-lang-choice]');
      if (b) api.setLang(b.dataset.langChoice);
    });
  }

  if (lang !== 'en') {
    // Japanese mode: no translation, just keep the switcher available.
    new MutationObserver(() => injectLangSwitch()).observe(document.body, { childList: true, subtree: true });
    injectLangSwitch();
    return;
  }

  // ---------- English mode ----------
  document.documentElement.lang = 'en';
  document.title = 'DECIDE. — Decisions you can truly stand by.';

  const staticDict = new Map(Object.entries(window.DECIDE_I18N_DICT || {}));
  const dataDict = new Map();   // card / learn / article content
  const nameMap = new Map();    // card name JA -> EN
  const meaningMap = new Map(); // card meaning JA -> EN
  const GENRE_EN = { '仕事': 'Work', 'お金': 'Money', '人間関係・恋愛': 'Relationships & love', 'その他': 'Other', '暮らし・住まい': 'Life & home', '健康': 'Health' };
  const JA_RE = /[぀-ヿ一-鿿]/;

  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const enDate = (y, m, d) => `${MON[m - 1]} ${d}, ${y}`;
  const enTime = (h, mi) => { const hh = Number(h); const ap = hh >= 12 ? 'PM' : 'AM'; const h12 = hh % 12 === 0 ? 12 : hh % 12; return `${h12}:${mi} ${ap}`; };
  const plural = (n, word) => `${n} ${word}${Number(n) === 1 ? '' : 's'}`;
  const orient = (s) => (s === '正位置' ? 'Upright' : 'Reversed');
  const translateWord = (s) => staticDict.get(s) || dataDict.get(s) || s;

  const patterns = [
    [/^(\d{4})年(\d{1,2})月(\d{1,2})日 (\d{1,2}):(\d{2}) の記録として保存$/, (m) => `Saved as a record from ${enDate(+m[1], +m[2], +m[3])}, ${enTime(m[4], m[5])}`],
    [/^(.+) の記録として保存$/, (m) => (JA_RE.test(m[1]) ? null : `Saved as a record from ${m[1]}`)],
    [/^(\d{4})年(\d{1,2})月(\d{1,2})日 (\d{1,2}):(\d{2})$/, (m) => `${enDate(+m[1], +m[2], +m[3])}, ${enTime(m[4], m[5])}`],
    [/^(\d{4})年(\d{1,2})月(\d{1,2})日$/, (m) => enDate(+m[1], +m[2], +m[3])],
    [/^(\d{4})年 (\d{1,2})月$/, (m) => `${MONTHS[+m[2] - 1]} ${m[1]}`],
    [/^(\d{4})年(\d{1,2})月、決定(\d+)件$/, (m) => `${MONTHS[+m[2] - 1]} ${m[1]}, ${plural(m[3], 'decision')}`],
    [/^(\d{1,2})月(\d{1,2})日、決定(\d+)件（評価待ち(\d+)件）$/, (m) => `${MON[+m[1] - 1]} ${+m[2]}, ${plural(m[3], 'decision')} (${m[4]} awaiting review)`],
    [/^(\d{1,2})月(\d{1,2})日、決定(\d+)件$/, (m) => `${MON[+m[1] - 1]} ${+m[2]}, ${plural(m[3], 'decision')}`],
    [/^(\d{1,2})月(\d{1,2})日（今日）$/, (m) => `${MON[+m[1] - 1]} ${+m[2]} (today)`],
    [/^(\d{1,2})月(\d{1,2})日$/, (m) => `${MON[+m[1] - 1]} ${+m[2]}`],
    [/^(\d{1,2})月$/, (m) => MON[+m[1] - 1]],
    [/^更新 (\d{4})年(\d{1,2})月(\d{1,2})日$/, (m) => `Updated ${enDate(+m[1], +m[2], +m[3])}`],
    [/^ジャンル：(.+)$/, (m) => `Genre: ${GENRE_EN[m[1]] || translateWord(m[1])}`],
    [/^(.+?)[:：]\s*(.+?)\s*[·・]\s*(\d{1,2})\/(\d{1,2})$/, (m) => `${GENRE_EN[m[1]] || translateWord(m[1])}: ${nameMap.get(m[2]) || translateWord(m[2])} · ${m[3]}/${m[4]}`],
    [/^(\S+) · (正位置|逆位置)$/, (m) => `${m[1]} · ${orient(m[2])}`],
    [/^番号 (\S+) ・ (.+)$/, (m) => `No. ${m[1]} · ${translateWord(m[2])}`],
    [/^(.+?) · (正位置|逆位置) — (.+)$/, (m) => `${nameMap.get(m[1]) || m[1]} · ${orient(m[2])} — ${meaningMap.get(m[3]) || m[3]}`],
    [/^『(.+)』を選択としておすすめします$/, (m) => `‘${translateWord(m[1])}’ is the suggested choice`],
    [/^『(.+)』にする$/, (m) => `Going with ‘${translateWord(m[1])}’`],
    [/^選択肢([AB])を選択としておすすめします$/, (m) => `Option ${m[1]} is the suggested choice`],
    [/^今回は、保留をおすすめします。選ぶなら選択肢([AB])です。$/, (m) => `This time, holding off is recommended. If you do choose, go with Option ${m[1]}.`],
    [/^選択肢Aは「(.+)」、選択肢Bは「(.+)」を示しています。$/, (m) => { const a = translateWord(m[1]); const b = translateWord(m[2]); return (JA_RE.test(a) || JA_RE.test(b)) ? null : `Option A points to “${a}”, and Option B points to “${b}”.`; }],
    [/^選択肢([AB])（(.+)）$/, (m) => { const t = translateWord(m[2]); return JA_RE.test(t) ? null : `Option ${m[1]} (${t})`; }],
    [/^選択肢([AB])：(.+)$/, (m) => { const t = translateWord(m[2]); return JA_RE.test(t) ? null : `Option ${m[1]}: ${t}`; }],
    [/^「(.+)」の決断$/, (m) => { const t = GENRE_EN[m[1]] || translateWord(m[1]); return JA_RE.test(t) ? null : `“${t}” decisions`; }],
    [/^(.+)：(.+)／(.+)$/, (m) => { const g = GENRE_EN[m[1]] || translateWord(m[1]); const a = translateWord(m[2]); const b = translateWord(m[3]); return (JA_RE.test(g) || JA_RE.test(a) || JA_RE.test(b)) ? null : `${g}: ${a} / ${b}`; }],
    [/^選んだ日の夕方（19時ごろ）に、その日の分をまとめて、(\S+) へ、記録の題名を添えて送ります。題名は配信用に保存します。題名以外の記録は載せません。$/, (m) => `On the evening of your chosen day (around 7 PM), that day's records are sent together to ${m[1]}, with their titles included. Titles are saved for delivery. Nothing else from your records is included.`],
    [/^ファイルは(\d+)MB以下にしてください。$/, (m) => `Please keep the file at ${m[1]} MB or smaller.`],
    [/^もっと見る（あと(\d+)件）$/, (m) => `Show more (${m[1]} more)`],
    [/^約(\d+)分で読めます$/, (m) => `About ${m[1]} min to read`],
    [/^約(\d+)分$/, (m) => `About ${m[1]} min`],
    [/^(\d+)件の記事$/, (m) => plural(m[1], 'article')],
    [/^(\d+)件の記事（「(.+)」で検索）$/, (m) => `${plural(m[1], 'article')} (searching for “${m[2]}”)`],
    [/^最終同期 (.+)$/, (m) => { const d = m[1].match(/^(\d{4})年(\d{1,2})月(\d{1,2})日 (\d{1,2}):(\d{2})$/); if (d) return `Last synced ${enDate(+d[1], +d[2], +d[3])}, ${enTime(d[4], d[5])}`; return JA_RE.test(m[1]) ? null : `Last synced ${m[1]}`; }],
    [/^(.+) の同期に失敗しました。通信が戻ると自動でやり直します。(.*)$/, (m) => { const t = translateWord(m[1]); return JA_RE.test(t) ? null : `${t} sync failed. It will retry automatically when you're back online.${m[2] ? ` ${m[2]}` : ''}`; }],
    [/^(.+?)の詳しい意味を見る$/, (m) => (nameMap.has(m[1]) ? `See the meaning of ${nameMap.get(m[1])}` : null)],
    [/^伏せたカード (\d+)枚目$/, (m) => `Face-down card ${m[1]}`],
    [/^選択肢([AB])のおすすめ度、5段階中(\d)$/, (m) => `Option ${m[1]} recommendation: ${m[2]} out of 5`],
    [/^履歴 (\d+)件$/, (m) => plural(m[1], 'record')],
    [/^この月の決定 (\d+)件$/, (m) => `${plural(m[1], 'decision')} this month`],
    [/^評価待ち (\d+)件$/, (m) => `Awaiting review: ${m[1]}`],
    [/^(\d+)件$/, (m) => m[1]],
    [/^(\d+)日後$/, (m) => `In ${plural(m[1], 'day')}`],
    [/^あとで（(\d+)日後）$/, (m) => `Later (in ${plural(m[1], 'day')})`],
    [/^(\d+)枚$/, (m) => plural(m[1], 'card')],
    [/^(\d+)通り$/, (m) => plural(m[1], 'pattern')],
    [/^読みもの · (\d+)分$/, (m) => `Article · ${m[1]} min`],
    [/^(\d+)分$/, (m) => `${m[1]} min`],
    [/^無料で保存できる決定ログは(\d+)件までです。$/, (m) => `The free plan keeps up to ${plural(m[1], 'decision log')}.`],
    [/^無料で引けるのは累計(\d+)回までです。$/, (m) => `The free plan includes ${plural(m[1], 'draw')} in total.`],
    [/^履歴を(\d+)件追加(?:・(\d+)件更新)?しました$/, (m) => `Added ${plural(m[1], 'record')} to your history${m[2] ? ` and updated ${m[2]}` : ''}`],
    [/^(.+) でログイン中$/, (m) => `Signed in as ${m[1]}`],
    [/^プラン：(.+)$/, (m) => `Plan: ${translateWord(m[1])}`],
    [/^UNLIMITED（招待特典・(\d+)\/(\d+)まで）$/, (m) => `UNLIMITED (invitation bonus, until ${m[1]}/${m[2]})`],
    [/^状態：(.+)$/, (m) => `Status: ${translateWord(m[1])}`],
    [/^・未同期 (\d+)件$/, (m) => ` · ${m[1]} not yet synced`],
    [/^特典つきで招待できるのはあと (\d+)人$/, (m) => `You can invite ${plural(m[1], 'more person').replace('persons', 'people')} with the bonus`],
    [/^関連レッスン：(.+)$/, (m) => `Related lesson: ${translateWord(m[1])}`],
    [/^(.+)を使います$/, (m) => (staticDict.has(m[1]) ? `${staticDict.get(m[1])} is now in use` : null)],
  ];

  // Fallback: substitute known names/terms inside a longer string.
  let fallbackPairs = [];
  function rebuildFallback() {
    const pairs = [];
    for (const [ja, en] of nameMap) if (ja.length >= 2) pairs.push([ja, en]);
    pairs.push(
      ['人間関係・恋愛', 'Relationships & love'], ['暮らし・住まい', 'Life & home'], ['仕事', 'Work'], ['お金', 'Money'], ['その他', 'Other'],
      ['大アルカナ', 'Major Arcana'], ['小アルカナ', 'Minor Arcana'],
      ['正位置', 'Upright'], ['逆位置', 'Reversed'],
      ['選択肢A', 'Option A'], ['選択肢B', 'Option B'],
      ['ふり返り', 'review'], ['ストーリー', 'story'], ['リマインド', 'reminder'],
    );
    pairs.sort((a, b) => b[0].length - a[0].length);
    fallbackPairs = pairs;
  }
  rebuildFallback();

  function fallback(s) {
    let out = s;
    for (const [ja, en] of fallbackPairs) if (out.includes(ja)) out = out.split(ja).join(en);
    out = out.replace(/(\d+)件/g, '$1');
    out = out.replace(/：/g, ': ').replace(/・/g, ' · ');
    return out;
  }

  const WEEKDAYS = { '日': 'Sun', '月': 'Mon', '火': 'Tue', '水': 'Wed', '木': 'Thu', '金': 'Fri', '土': 'Sat' };
  function translateString(raw, el) {
    const trimmed = raw.trim();
    if (!trimmed || !JA_RE.test(trimmed)) return null;
    if (staticDict.has(trimmed)) return staticDict.get(trimmed);
    if (dataDict.has(trimmed)) return dataDict.get(trimmed);
    // Calendar weekday headers are single characters inside the calendar.
    if (WEEKDAYS[trimmed] && el && el.closest && el.closest('[class*="calendar"]')) return WEEKDAYS[trimmed];
    for (const [re, fn] of patterns) {
      const m = trimmed.match(re);
      if (m) { const r = fn(m); if (r != null) return r; }
    }
    const fb = fallback(trimmed);
    return fb !== trimmed ? fb : null;
  }

  function translateTextNode(node) {
    const parent = node.parentElement;
    if (!parent) return;
    const raw = node.nodeValue;
    const out = translateString(raw, parent);
    if (out == null) return;
    const lead = raw.match(/^\s*/)[0];
    const trail = raw.match(/\s*$/)[0];
    const next = lead + out + trail;
    if (next !== raw) node.nodeValue = next;
  }

  const ATTRS = ['placeholder', 'aria-label', 'title'];
  function translateAttrs(el) {
    for (const a of ATTRS) {
      const v = el.getAttribute && el.getAttribute(a);
      if (!v || !JA_RE.test(v)) continue;
      const out = translateString(v, el);
      if (out != null && out !== v) el.setAttribute(a, out);
    }
  }

  // The two-card option fields are filled by the app itself when a suggestion
  // pair is tapped; translate those app-provided values (exact dictionary /
  // pattern matches only, and never while the user is editing the field).
  // Free text the user typed that is not a known suggestion stays untouched.
  function translateValue(el) {
    if (!el || document.activeElement === el) return;
    const v = el.value;
    if (!v || !JA_RE.test(v)) return;
    const out = translateString(v, el);
    if (out != null && out !== v) el.value = out;
  }
  function translateOptionValues(root) {
    if (!root || !root.querySelectorAll) return;
    if (root.matches && root.matches('#option-1, #option-2')) translateValue(root);
    root.querySelectorAll('#option-1, #option-2').forEach(translateValue);
  }

  // ---------- content-page links ----------
  // In English mode, links the app renders to the Japanese content pages
  // (card / worry indexes and individual pages, articles, About) are pointed
  // at the English versions under /en/. Only same-site relative ("./…",
  // bare) and root-absolute ("/…") hrefs are rewritten, and any query or
  // fragment is kept. Legal pages (privacy / terms / tokushoho) have no
  // English version and stay as they are, as do external links and links
  // that already point at /en/ (so rewriting is idempotent).
  function rewriteHref(raw) {
    if (typeof raw !== 'string' || !raw) return null;
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('//') || raw.startsWith('#')) return null;
    const cut = raw.search(/[?#]/);
    const path = cut === -1 ? raw : raw.slice(0, cut);
    const suffix = cut === -1 ? '' : raw.slice(cut);
    let prefix = '';
    let rest = path;
    if (rest.startsWith('./')) { prefix = './'; rest = rest.slice(2); }
    else if (rest.startsWith('/')) { prefix = '/'; rest = rest.slice(1); }
    else if (rest.startsWith('../') || rest === '..') return null;
    if (!rest || rest === 'en' || rest.startsWith('en/')) return null;
    if (!/^(?:cards|articles)(?:\/|$)/.test(rest) && !/^about\/?$/.test(rest)) return null;
    return `${prefix}en/${rest}${suffix}`;
  }
  function rewriteLink(a) {
    if (!a || !a.getAttribute) return;
    const raw = a.getAttribute('href');
    const out = rewriteHref(raw);
    if (out != null && out !== raw) a.setAttribute('href', out);
  }
  function rewriteLinks(root) {
    if (!root || !root.querySelectorAll) return;
    if (root.matches && root.matches('a[href]')) rewriteLink(root);
    root.querySelectorAll('a[href]').forEach(rewriteLink);
  }
  api.rewriteHref = rewriteHref;

  const SKIP = 'script, style, noscript, textarea, [data-i18n-skip], [data-detail-memo]';
  function translateRoot(root) {
    if (!root || root.nodeType !== 1) return;
    if (root.matches && root.matches(SKIP)) return;
    // Learn tiles split card names at "の" into two spans: rebuild whole name.
    if (root.classList && root.classList.contains('learn-tile-name')) {
      const full = root.textContent.trim();
      if (nameMap.has(full)) { root.textContent = nameMap.get(full); return; }
    }
    translateAttrs(root);
    rewriteLinks(root);
    translateOptionValues(root);
    // Tile names first: their fragments must not be translated piecemeal.
    root.querySelectorAll('.learn-tile-name').forEach((el) => {
      const full = el.textContent.trim();
      if (nameMap.has(full)) el.textContent = nameMap.get(full);
    });
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !JA_RE.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;
        const p = node.parentElement;
        if (!p || p.closest(SKIP) || p.closest('.learn-tile-name')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(translateTextNode);
    if (root.querySelectorAll) root.querySelectorAll('[placeholder],[aria-label],[title]').forEach(translateAttrs);
  }

  // ---------- data-driven maps ----------
  function addPair(ja, en) {
    if (typeof ja === 'string' && typeof en === 'string' && ja && en && ja !== en && !dataDict.has(ja)) dataDict.set(ja, en);
  }
  function buildCardMaps(jaData, enData) {
    if (!jaData || !enData) return;
    for (const [key, jaLabel] of Object.entries(jaData.themes || {})) addPair(jaLabel, (enData.themes || {})[key]);
    for (const jc of jaData.cards || []) {
      const ec = (enData.cards || {})[jc.id];
      if (!ec) continue;
      nameMap.set(jc.name, ec.name);
      addPair(jc.name, ec.name);
      addPair(jc.symbol, ec.symbol);
      addPair(jc.story, ec.story);
      addPair(jc.background, ec.background);
      addPair(jc.arcana, ec.arcana);
      for (const o of ['upright', 'reversed']) {
        const jo = jc[o]; const eo = ec[o];
        if (!jo || !eo) continue;
        if (jo.meaning) { meaningMap.set(jo.meaning, eo.meaning); addPair(jo.meaning, eo.meaning); }
        (jo.keywords || []).forEach((k, i) => addPair(k, (eo.keywords || [])[i]));
        if ((jo.keywords || []).length) {
          addPair(jo.keywords.join('・'), (eo.keywords || []).join(' · '));
          addPair(jo.keywords.slice(0, 2).join('・'), (eo.keywords || []).slice(0, 2).join(' · '));
        }
        for (const [tk, tv] of Object.entries(jo.themes || {})) addPair(tv, (eo.themes || {})[tk]);
      }
    }
    rebuildFallback();
  }
  function buildLearnMaps(ja, en) {
    const walk = (a, b) => {
      if (typeof a === 'string') { addPair(a, b); return; }
      if (Array.isArray(a)) { a.forEach((v, i) => walk(v, Array.isArray(b) ? b[i] : undefined)); return; }
      if (a && typeof a === 'object') for (const k of Object.keys(a)) walk(a[k], b ? b[k] : undefined);
    };
    walk(ja, en);
  }
  const ARTICLE_CATS = { 'タロットの使い方': 'Using tarot', '気持ちと迷い': 'Feelings & indecision', '人との関係': 'Relationships', '仕事と暮らし': 'Work & life', '行動と習慣': 'Actions & habits' };
  function buildArticleMaps(articles, titles) {
    for (const [ja, en] of Object.entries(ARTICLE_CATS)) addPair(ja, en);
    for (const a of (articles && articles.articles) || []) {
      if (titles && titles[a.id]) addPair(a.title, titles[a.id]);
    }
  }

  let dataReady = false;
  async function loadData() {
    const get = (url) => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const [jaCards, enCards, jaLearn, enLearn, articles, titles] = await Promise.all([
      get('./assets/cards.json'), get('./assets/cards-en.json'),
      get('./assets/learn.json'), get('./assets/learn-en.json'),
      get('./assets/related-articles.json'), get('./assets/article-titles-en.json'),
    ]);
    buildCardMaps(jaCards, enCards);
    buildLearnMaps(jaLearn, enLearn);
    buildArticleMaps(articles, titles);
    dataReady = true;
    translateRoot(document.body);
  }

  // ---------- observer ----------
  let scheduled = false;
  const pending = new Set();
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      injectLangSwitch();
      translateOptionValues(document);
      rewriteLinks(document);
      const roots = [...pending];
      pending.clear();
      for (const r of roots) if (r.isConnected) translateRoot(r);
    });
  }
  const observer = new MutationObserver((mutations) => {
    for (const mu of mutations) {
      if (mu.type === 'characterData') { if (mu.target.parentElement) pending.add(mu.target.parentElement); }
      else if (mu.type === 'attributes') pending.add(mu.target);
      else for (const node of mu.addedNodes) {
        if (node.nodeType === 1) pending.add(node);
        else if (node.nodeType === 3 && node.parentElement) pending.add(node.parentElement);
      }
    }
    if (pending.size) schedule();
    injectLangSwitchSoon();
  });
  let switchTimer = 0;
  function injectLangSwitchSoon() {
    if (switchTimer) return;
    switchTimer = setTimeout(() => { switchTimer = 0; injectLangSwitch(); }, 120);
  }

  translateRoot(document.body);
  injectLangSwitch();
  observer.observe(document.body, {
    childList: true, subtree: true, characterData: true,
    attributes: true, attributeFilter: [...ATTRS, 'href'],
  });
  loadData();
  api.ready = () => dataReady;
})();
