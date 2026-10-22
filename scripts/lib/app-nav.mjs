// The app's bottom navigation, repeated on the static card and worry pages so readers
// can always get back without hunting for a link. Idempotent: replaced between markers.

const START = '<!-- app-nav:start -->';
const END = '<!-- app-nav:end -->';

const CSS = `body{padding-bottom:calc(68px + env(safe-area-inset-bottom))}
.app-nav{position:fixed;z-index:20;left:50%;bottom:0;transform:translateX(-50%);width:min(760px,100%);display:grid;grid-template-columns:repeat(5,minmax(0,1fr));padding:7px max(8px,env(safe-area-inset-right)) calc(7px + env(safe-area-inset-bottom)) max(8px,env(safe-area-inset-left));background:rgba(4,4,4,.96);border-top:1px solid rgba(255,255,255,.18);font-family:Inter,"Hiragino Sans","Yu Gothic UI","Yu Gothic",sans-serif}
.app-nav a{position:relative;min-width:0;min-height:52px;display:grid;place-items:center;align-content:center;gap:3px;color:#aaa49a;font-weight:700;text-decoration:none;-webkit-tap-highlight-color:transparent}
.app-nav a::before{color:currentColor;font-family:Arial,sans-serif;font-size:1rem;line-height:1}
.app-nav span{font-size:.75rem;letter-spacing:.01em;line-height:1.2}
.app-nav [data-go="back"]{color:#fff}
.app-nav [data-go="back"]::before{content:"←";color:#f1d527}
.app-nav [data-go="home"]::before{content:"⌂"}
.app-nav [data-go="history"]::before{content:"▣"}
.app-nav [data-go="stats"]::before{content:"▂▅▇";font-size:.75rem;letter-spacing:1px}
.app-nav [data-go="settings"]::before{content:"⚙"}
.app-nav a:active{color:#fff}
.app-nav a:focus-visible{outline:2px solid #f1d527;outline-offset:-4px}
@media (min-width:760px){.app-nav{border:1px solid rgba(255,255,255,.18);border-bottom:0;border-radius:18px 18px 0 0}}`;

export function addAppNav(html) {
  html = html.replace(new RegExp(`\\n?${START}[\\s\\S]*?${END}`), '');
  // No JS on these pages: back means the parent page, the same place as the top "← 戻る" pill.
  // From the top-level list, both back buttons land on the app's home rather than its intro.
  html = html.replace('<a class="back" href="../"', '<a class="back" href="../?go=home"');
  const parent = html.match(/<a class="back" href="([^"]+)"/)?.[1] || '../?go=home';
  const nav = `${START}
<style>${CSS}</style>
<nav class="app-nav" aria-label="DECIDE. のメニュー">
<a href="${parent}" data-go="back" aria-label="${parent === '../?go=home' ? 'ホームへ戻る' : 'ひとつ前の一覧へ戻る'}"><span>戻る</span></a>
<a href="../?go=home" data-go="home"><span>ホーム</span></a>
<a href="../?go=history" data-go="history"><span>ログ</span></a>
<a href="../?go=stats" data-go="stats"><span>統計</span></a>
<a href="../?go=settings" data-go="settings"><span>設定</span></a>
</nav>
${END}`;
  if (!html.includes('</body>')) throw new Error('Missing body for app nav');
  return html.replace('</body>', `${nav}\n</body>`);
}
