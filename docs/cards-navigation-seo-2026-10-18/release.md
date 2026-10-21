# Production release

- Commit: 7c58f4affa2644bdc9f0c192e29bea783c781f0f
- Base: e3210d6e0e9f2bd8711ab49ed0351113bb1f3779
- GitHub Pages: https://github.com/Jeff0329t/decide/actions/runs/39123150023 (success)
- Public site: https://decisionprocess.net/
- Cards index: https://decisionprocess.net/cards/
- Scope: 97 cards pages, top navigation/styles, shared generation/update sources and regression checks.
- Unrelated dirty workspace changes excluded via an isolated release checkout.
- Release tests: 310 passed, 0 failed, including isolated full regeneration twice and preview/sitemap exclusion.
- Service Worker: decide-shell-editorial-v191; release-specific fingerprint regenerated and verified.
- Public comparison: 103/103 files byte-identical, including all 97 card HTML files, index.html, app.js, styles.css, service-worker.js, sitemap.xml and robots.txt. See public-verification.json.
- Public Chrome checks: 320x568, 390x844, 430x932; top links, card atlas, start navigation, both sample article CTAs and entry guides passed; no horizontal overflow or page JavaScript errors. Evidence: public-browser/.
- Proposal previews/backups excluded from dist and sitemap. Deployment uploads only dist.
- Search Console indexing status and installed iPhone PWA update receipt were not verified.
