// DECIDE. シェア画像（ストーリー用）の色テーマ
// 選んだテーマは端末に保存し、次にシェアするときも同じ色で作る。
(function(){
  const STORE_KEY = 'decide.tarot.share-theme.v1';
  const DEFAULT_THEME = 'classic';

  // yellow=帯・アクセント / ink=背景 / cream=文字・カードの枠 / line=横線 / soft=小さい文字
  const THEMES = Object.freeze({
    classic: Object.freeze({ label: 'クラシック', yellow: '#f1d527', ink: '#0b0b0b', cream: '#f4efe3', line: 'rgba(244,239,227,.08)', soft: 'rgba(244,239,227,.6)' }),
    yellow: Object.freeze({ label: 'イエロー', yellow: '#0b0b0b', ink: '#f1d527', cream: '#1c1a10', line: 'rgba(11,11,11,.08)', soft: 'rgba(11,11,11,.62)' }),
    paper: Object.freeze({ label: 'ペーパー', yellow: '#0b0b0b', ink: '#f4efe3', cream: '#2a2a2a', line: 'rgba(11,11,11,.06)', soft: 'rgba(11,11,11,.55)' }),
    mono: Object.freeze({ label: 'モノクロ', yellow: '#ffffff', ink: '#0b0b0b', cream: '#d9d9d9', line: 'rgba(255,255,255,.07)', soft: 'rgba(255,255,255,.55)' })
  });
  const NAMES = Object.freeze(Object.keys(THEMES));

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

  // 純粋関数（テスト用にも公開）
  const normalize = name => (typeof name === 'string' && Object.prototype.hasOwnProperty.call(THEMES, name)) ? name : DEFAULT_THEME;
  function palette(name) {
    const t = THEMES[normalize(name)];
    return { yellow: t.yellow, ink: t.ink, cream: t.cream, line: t.line, soft: t.soft };
  }
  function pickerHtml(active) {
    const current = normalize(active);
    const chips = NAMES.map(name => {
      const t = THEMES[name];
      const on = name === current;
      return `<button class="share-theme-chip ${on ? 'active' : ''}" type="button" data-share-theme="${name}" aria-pressed="${on}"><i class="share-theme-swatch" style="background:${t.ink};border-color:${t.yellow};box-shadow:inset 0 -8px 0 ${t.yellow}"></i>${escapeHtml(t.label)}</button>`;
    }).join('');
    return `<div class="share-theme-picker" role="group" aria-label="ストーリー画像の色"><b>ストーリー画像の色</b><div class="share-theme-chips">${chips}</div></div>`;
  }

  function current() {
    try { return normalize(localStorage.getItem(STORE_KEY)); } catch(error) { return DEFAULT_THEME; }
  }
  function set(name) {
    const next = normalize(name);
    try { localStorage.setItem(STORE_KEY, next); } catch(error) {}
    return next;
  }
  const renderPicker = () => pickerHtml(current());

  if(typeof document !== 'undefined') {
    document.addEventListener('click', event => {
      const el = event.target.closest?.('[data-share-theme]');
      if(!el) return;
      event.preventDefault();
      const theme = set(el.dataset.shareTheme);
      window.DECIDE_APP_BRIDGE?.rebuildStory?.(theme);
      el.closest?.('.share-theme-picker')?.querySelectorAll?.('[data-share-theme]').forEach(button => {
        const on = button.dataset.shareTheme === theme;
        button.classList.toggle('active', on);
        button.setAttribute('aria-pressed', String(on));
      });
    });
  }

  window.DECIDE_SHARE_THEMES = Object.freeze({
    palette,
    current,
    set,
    renderPicker,
    _pure: { normalize, palette, pickerHtml, names: NAMES }
  });
})();
