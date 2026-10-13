# Wordcraft integration

The module uses the unmodified official WordCraft 0.6.1 WebAssembly release from
https://github.com/storytold/wordcraft, pinned by URL, source commit and SHA-256 in
`source.json`. The release is fetched and verified by `scripts/prepare-wordcraft.py`
during `npm run build:pages` and served from `modules/wordcraft/0.6.1/` in the
Pages output. The downloaded archive is an ignored local cache, not a tracked binary.
No Rust toolchain or third-party hosted runtime is required. Do not silently update
this release or checksum; verify the official replacement and run the browser test.

The original editor runs inside an on-demand, same-origin iframe, as supported by
its HOSTING.md. Document contents stay inside the editor and are opened from/saved
to user-selected local files. They are not automatically saved to NAS or module data.
Project/reference module metadata uses the existing app storage. Closing a module
or switching app screens destroys its running editor: save documents first.
Automatic Pages reload is deferred while an embedded editor is running.

MIT/Apache license texts, required notices and bundled-font licenses are copied
into the deployed folder. Font attribution additionally comes from storytold/craft-fonts.
Original branding assets are not modified or extracted for use elsewhere in the app.

Browser regression: `CHROMIUM_PATH=/usr/bin/chromium .venv/bin/python scripts/test-pages-browser.py`.
It verifies startup, creating a document, typing, DOCX download and reopen in an
isolated local HTTPS app. Wordcraft requires WebGPU or WebGL2.
