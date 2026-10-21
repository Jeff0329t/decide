# Production release

- Commit: e3210d6e0e9f2bd8711ab49ed0351113bb1f3779
- Base: 0608ea41bb8979cf8506fc0855ff0293b9b16e40
- Deployment: https://github.com/Jeff0329t/decide/actions/runs/39121645045 (success)
- Tests: 307 passed, 0 failed.
- Public HTML: 97/97 pages byte-identical to released dist/cards files.
- Only target metadata changed in all 97 pages; body, styles, scripts, and structured data preserved.
- Existing dirty work was excluded by releasing from an isolated checkout of production main.
- Service Worker unchanged: /cards/ requests already bypass cache.
- Search indexing and search-result snippets are not verified by this deployment check.
