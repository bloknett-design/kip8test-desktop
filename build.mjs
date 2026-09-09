#!/usr/bin/env node
// ============================================================
// Build-скрипт для kip8test — два режима:
//   node build.mjs mobile   → PWA-бандл (base.css + mobile.css)
//   node build.mjs desktop  → Electron-бандл (base.css + desktop.css)
//
// Стратегия:
//   1. HTML-паршалы: <!-- @include html/xxx.html --> → содержимое файла
//   2. CSS-файлы → один <style> блок (инлайн в HTML)
//   3. JS-модули → esbuild bundle → один <script> блок (инлайн в HTML)
//   4. Изображения и данные копируются как есть
// Результат — автономный index.html для offline PWA.
// ============================================================

import { readFileSync, writeFileSync, copyFileSync, mkdirSync, readdirSync, existsSync, rmSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import * as esbuild from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const mode = process.argv[2] || 'mobile';
const isDesktop = mode === 'desktop';

if (!['mobile', 'desktop'].includes(mode)) {
    console.error('Usage: node build.mjs [mobile|desktop]');
    process.exit(1);
}

const outDir = resolve(__dirname, isDesktop ? 'dist-desktop' : 'dist-mobile');
const srcDir = resolve(__dirname, 'src');

console.log(`\n🔧 Building ${mode.toUpperCase()} bundle...\n`);

// --- 1. Очистить выходную директорию ---
if (existsSync(outDir)) rmSync(outDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

// --- 2. Собрать CSS ---
const cssFiles = ['base.css', `${mode}.css`];
let combinedCss = '';
for (const file of cssFiles) {
    const filePath = resolve(srcDir, 'css', file);
    if (existsSync(filePath)) {
        const content = readFileSync(filePath, 'utf-8');
        combinedCss += `/* === ${file} === */\n${content}\n`;
        console.log(`  ✓ CSS: ${file} (${content.split('\n').length} lines)`);
    } else {
        console.warn(`  ⚠ CSS not found: ${file}`);
    }
}
console.log(`  → Total CSS: ${combinedCss.split('\n').length} lines (${(combinedCss.length / 1024).toFixed(1)} KB)`);

// --- 3. Собрать JS через esbuild ---
const appEntry = resolve(srcDir, 'js', 'app.js');
console.log(`  Bundling JS with esbuild...`);

const jsResult = await esbuild.build({
    entryPoints: [appEntry],
    bundle: true,
    minify: true,            // Минификация включена (после валидации Etap 2)
    target: ['es2020'],
    format: 'iife',          // IIFE — самовызывающаяся функция (не ESM, т.к. инлайнится в HTML)
    define: {
        '__IS_DESKTOP_BUILD__': String(isDesktop),
    },
    write: false,            // не писать на диск — вернём в памяти
    logLevel: 'warning',
    // Внешние зависимости — нет (всё инлайнится)
});

const bundledJs = jsResult.outputFiles[0].text;
console.log(`  ✓ JS bundled: ${bundledJs.split('\n').length} lines (${(bundledJs.length / 1024).toFixed(1)} KB)`);

// --- 4. Прочитать HTML-шаблон и раскрыть @include ---
const htmlPath = resolve(srcDir, 'index.html');
let html = readFileSync(htmlPath, 'utf-8');
console.log(`  ✓ HTML template: ${(html.length / 1024).toFixed(1)} KB (${html.split('\n').length} lines)`);

// --- 4b. Раскрыть <!-- @include html/xxx.html --> директивы ---
const includeRegex = /<!--\s*@include\s+(\S+)\s*-->/g;
let includeCount = 0;
html = html.replace(includeRegex, (match, relPath) => {
    const incPath = resolve(srcDir, relPath);
    if (!existsSync(incPath)) {
        console.warn(`  ⚠ Include not found: ${relPath}`);
        return match; // оставляем как есть если файл не найден
    }
    includeCount++;
    return readFileSync(incPath, 'utf-8');
});
console.log(`  ✓ @include resolved: ${includeCount} partials`);

// --- 5. Заменить <link> на инлайн <style> ---
// (работает после раскрытия @include — CSS <link> из head.html)
// Убираем все <link> на CSS-файлы
html = html.replace(/<link[^>]*href=["']\.\/css\/(?:base|mobile|desktop)\.css["'][^>]*>\n?/g, '');
// Вставляем инлайн <style> после <title>
html = html.replace(
    /(<title>КИПиА<\/title>)/,
    `$1\n<style>\n${combinedCss}</style>`
);
console.log(`  ✓ CSS inlined into HTML`);

// --- 6. Заменить <script type="module"> на инлайн <script> ---
// Убираем module-ссылку на app.js
html = html.replace(/<script\s+type="module"\s+src="\.\/js\/app\.js"><\/script>/, '');
// Вставляем инлайн <script> перед </body>
html = html.replace(
    /(<\/body>)/,
    `<script>\n${bundledJs}\n</script>\n$1`
);
console.log(`  ✓ JS inlined into HTML`);

// --- 7. Установить константу __IS_DESKTOP_BUILD__ в HTML (если осталась) ---
html = html.replace(/__IS_DESKTOP_BUILD__/g, String(isDesktop));

// --- 8. Записать index.html ---
writeFileSync(resolve(outDir, 'index.html'), html, 'utf-8');
const htmlSize = Buffer.byteLength(html, 'utf-8');
console.log(`  ✓ Written index.html: ${(htmlSize / 1024).toFixed(1)} KB (${html.split('\n').length} lines)`);

// --- 9. Скопировать статические файлы ---
function copyDirRecursive(src, dest) {
    if (!existsSync(src)) return;
    mkdirSync(dest, { recursive: true });
    for (const entry of readdirSync(src, { withFileTypes: true })) {
        const srcPath = join(src, entry.name);
        const destPath = join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDirRecursive(srcPath, destPath);
        } else {
            copyFileSync(srcPath, destPath);
        }
    }
}

// images/
copyDirRecursive(resolve(srcDir, 'images'), resolve(outDir, 'images'));
console.log(`  ✓ Copied images/`);

// data/
copyDirRecursive(resolve(srcDir, 'data'), resolve(outDir, 'data'));
console.log(`  ✓ Copied data/`);

// manifest.json
const manifestSrc = resolve(srcDir, 'manifest.json');
if (existsSync(manifestSrc)) {
    copyFileSync(manifestSrc, resolve(outDir, 'manifest.json'));
    console.log(`  ✓ Copied manifest.json`);
}

// sw.js — из корня проекта
const swSrc = resolve(__dirname, 'sw.js');
if (existsSync(swSrc)) {
    copyFileSync(swSrc, resolve(outDir, 'sw.js'));
    console.log(`  ✓ Copied sw.js`);
}

// electron/ — только для desktop
if (isDesktop) {
    copyDirRecursive(resolve(__dirname, 'electron'), resolve(outDir, 'electron'));
    console.log(`  ✓ Copied electron/`);
}

// --- 10. Итого ---
console.log(`\n✅ ${mode.toUpperCase()} build complete → ${outDir}`);
console.log(`   index.html: ${(htmlSize / 1024).toFixed(1)} KB (${html.split('\n').length} lines)`);
console.log(`   CSS: base.css + ${mode}.css (inlined)`);
console.log(`   JS: esbuild IIFE bundle from src/js/app.js (inlined)`);
if (isDesktop) {
    console.log(`   ❌ Excluded: mobile.css (${readFileSync(resolve(srcDir, 'css/mobile.css'), 'utf-8').split('\n').length} lines)`);
} else {
    console.log(`   ❌ Excluded: desktop.css (${readFileSync(resolve(srcDir, 'css/desktop.css'), 'utf-8').split('\n').length} lines)`);
}
