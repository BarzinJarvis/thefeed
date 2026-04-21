#!/usr/bin/env node
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '..', 'static');

async function build() {
  // Bundle JS
  const jsResult = await esbuild.build({
    entryPoints: [path.join(__dirname, 'src', 'app.jsx')],
    bundle: true,
    minify: true,
    write: false,
    format: 'iife',
    target: ['es2020'],
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
    alias: { 'react': 'preact/compat', 'react-dom': 'preact/compat' },
    define: { 'process.env.NODE_ENV': '"production"' },
    loader: { '.jsx': 'jsx', '.js': 'js' },
  });

  // Bundle CSS
  const cssResult = await esbuild.build({
    entryPoints: [path.join(__dirname, 'src', 'styles.css')],
    bundle: true,
    minify: true,
    write: false,
    loader: { '.css': 'css' },
  });

  const js = jsResult.outputFiles[0].text;
  const css = cssResult.outputFiles[0].text;

  // Read font as base64 for inline embedding (optional, check size)
  const fontPath = path.join(outDir, 'Vazirmatn-Regular.woff2');
  let fontCSS = '';
  if (fs.existsSync(fontPath)) {
    fontCSS = `@font-face{font-family:'Vazirmatn';src:url('/static/Vazirmatn-Regular.woff2') format('woff2');font-weight:normal;font-style:normal;font-display:swap}`;
  }

  const html = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0,user-scalable=no">
<title>thefeed</title>
<style>${fontCSS}${css}</style>
</head>
<body>
<div id="root"></div>
<script>${js}</script>
</body>
</html>`;

  fs.writeFileSync(path.join(outDir, 'index.html'), html);
  const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
  console.log(`Built index.html: ${kb} KB (JS: ${(js.length/1024).toFixed(1)}KB, CSS: ${(css.length/1024).toFixed(1)}KB)`);
}

build().catch(e => { console.error(e); process.exit(1); });
