# Wordcraft integration

The module uses the unmodified official WordCraft 0.6.1 WebAssembly release from
https://github.com/storytold/wordcraft, pinned by URL, source commit and SHA-256 in
`source.json`. The release is fetched and verified by `scripts/prepare-wordcraft.py`
during `npm run build:pages` and served from `modules/wordcraft/0.6.1/` in the
Pages output. The downloaded archive is an ignored local cache, not a tracked binary.
No Rust toolchain or third-party hosted runtime is required. Do not silently update
this release or checksum; verify the official replacement and run the browser test.

DOCX files open the full editor in a same-origin iframe. The upstream package is
unchanged; `production/wordcraft-bridge.ts` adapts its file-open/save commands to the
app's existing file API. Edits autosave with version checks, and failed saves keep
an IndexedDB recovery copy. A conflicting original is never silently overwritten.
Opening another local document inside WordCraft detaches it from the app original;
use the editor's File menu to download that document. A simpler editor remains an
explicit alternative, and continues to handle TXT/HTML files.
Automatic Pages reload is deferred while a document editor is running.

MIT/Apache license texts, required notices and bundled-font licenses are copied
into the deployed folder. Font attribution additionally comes from storytold/craft-fonts.
Original branding assets are not modified or extracted for use elsewhere in the app.

Browser regression: `CHROMIUM_PATH=/usr/bin/chromium .venv/bin/python scripts/test-full-document-browser.py`.
This verifies the restored full editor, DOCX formatting and autosave, reopening,
conflict protection and edited-copy download. The general Pages suite also covers
the simpler alternative and TXT recovery. WordCraft requires WebGPU or WebGL2.

The app host `app.html` is separate from the unchanged upstream `index.html`. It
loads a gzip sidecar, checks the decompressed WASM SHA-256 against the verified
release, and caches only the public engine in CacheStorage. No NAS responses or
documents enter this cache. Browsers without gzip decompression support load the
original verified WASM instead. The standalone editor bundle is separate from
the application and lazily loads the simpler editor when needed.

The app toolbar uses keyboard commands; the complete original tools remain
available through “전체 도구”. Mobile “맞춤 보기” selects the pinned release's
view-only Web Layout status control. The default presentation crops the native
ribbon/status chrome, and full tools restore it without recreating the editor.
