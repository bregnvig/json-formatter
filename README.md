# JSON Formatter

A free JSON formatter and validator without ads: **https://json.loopme.dk**

Paste JSON (anywhere on the page) or drop a file to pretty-print, minify, validate and explore it as a tree.
Everything runs in the browser. Nothing is uploaded, and it works offline as an installable PWA.

- Tree and highlighted text views, expand/collapse all, maximize the output
- Indent with 2 spaces, 4 spaces or tabs; optional key sorting
- Error location with jump-to-error
- History of previously parsed documents, stored locally in IndexedDB
- Light, dark and system themes

Built with Angular, Tailwind CSS, Ubuntu Mono (Fontsource) and Font Awesome Free.

## Development

```bash
npm install
npm start        # http://localhost:4200
npm test
npm run build    # output in dist/json-formatter/browser
```

The service worker is only active in production builds.

## Deployment

Every push to `main` builds, tests and deploys to GitHub Pages via `.github/workflows/deploy.yml`.
The custom domain is set by `public/CNAME` (`json.loopme.dk`), which needs a DNS `CNAME` record pointing
`json` at `bregnvig.github.io`.

## License

The code is released under the [Zero-Clause BSD license](LICENSE): do whatever you like with it, no
attribution needed.

The Loopme name and logo are not part of that license. If you fork the project, replace the logo,
the icons in `public/icons/`, `public/favicon.*`, `public/apple-touch-icon.png` and
`public/og-image.png`. Third-party packages keep their own licenses; a production build lists them
in `3rdpartylicenses.txt`.
