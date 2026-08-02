# Vendored runtime files — provenance

All files in this directory are vendored verbatim (no local modifications) so the skill works offline. Sync them when bumping versions, and keep the pinned CDN fallback tags in `system-prompt.md` ("React + Babel") and `agents/lib/ds-prompt.mjs` in step.

| File | Package / version | Source | License |
|---|---|---|---|
| `react-18.3.1.production.min.js` | `react` 18.3.1 (UMD production build, `umd/react.production.min.js`) | https://unpkg.com/react@18.3.1/umd/react.production.min.js | MIT (Meta Platforms) |
| `react-dom-18.3.1.production.min.js` | `react-dom` 18.3.1 (UMD production build, `umd/react-dom.production.min.js`) | https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js | MIT (Meta Platforms) |
| `babel.min.js` | `@babel/standalone` 7.29.0 (`babel.min.js`) | https://unpkg.com/@babel/standalone@7.29.0/babel.min.js | MIT (Babel contributors) |
| `fflate.mjs` | `fflate` (minified ESM build; sync APIs only — `unzipSync`, `inflateSync`) | https://github.com/101arrowz/fflate | MIT (Arjun Barrett) |
| `fig-materialize.mjs` | Offline Figma `.fig` decoder + materializer, vendored from the upstream `baoyu-design` repo (`skills/baoyu-design/agents/vendor/fig-materialize.mjs`); embeds an inlined zstd WASM decoder | https://github.com/JimLiu/baoyu-design | MIT (per upstream repo license) |

SRI (sha384, base64) of the current files — these are the values pinned in the CDN fallback tags:

- `react-18.3.1.production.min.js` — `sha384-DGyLxAyjq0f9SPpVevD6IgztCFlnMF6oW/XQGmfe+IsZ8TqEiDrcHkMLKI6fiB/Z`
- `react-dom-18.3.1.production.min.js` — `sha384-gTGxhz21lVGYNMcdJOyq01Edg0jhn/c22nsx0kyqP0TxaV5WVdsSH1fSDUf5YJj1`
- `babel.min.js` — `sha384-m08KidiNqLdpJqLq95G/LEi8Qvjl/xUYll3QILypMoQ65QorJ9Lvtp2RXYGBFj1y`

Local policy note: both the vendored files and the CDN fallback pin the React **production** builds (upstream mixed production vendor files with development CDN pins); production keeps vendored and CDN pages byte-identical in behavior and smaller to inline.
