import { defineConfig } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================
// Vite-конфигурация для kip8test — два режима сборки:
//   --mode mobile   → PWA-бандл без десктопного кода
//   --mode desktop  → Electron-бандл без мобильного кода
//
// Выходная структура:
//   dist-mobile/  или  dist-desktop/
//     index.html   — всё инлайн (CSS + JS), для offline
//     sw.js        — Service Worker
//     manifest.json
//     images/      — статика
//     data/        — JSON-данные
// ============================================================

function copyDirSync(src, dest) {
    if (!fs.existsSync(src)) return;
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const srcPath = resolve(src, entry.name);
        const destPath = resolve(dest, entry.name);
        if (entry.isDirectory()) {
            copyDirSync(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

export default defineConfig(({ mode: viteMode }) => {
    const desktop = viteMode === 'desktop';

    return {
        mode: viteMode || 'mobile',

        root: resolve(__dirname, 'src'),
        base: './',

        define: {
            __IS_DESKTOP_BUILD__: desktop,
        },

        publicDir: false,

        build: {
            outDir: resolve(__dirname, desktop ? 'dist-desktop' : 'dist-mobile'),
            emptyOutDir: true,

            cssCodeSplit: false,

            // Инлайн все assets < 4MB в HTML/JS
            assetsInlineLimit: 4 * 1024 * 1024,

            minify: 'terser',
            terserOptions: {
                compress: {
                    drop_console: false,
                    dead_code: true,
                    unused: true,
                    global_defs: {
                        __IS_DESKTOP_BUILD__: desktop,
                    },
                },
            },

            rollupOptions: {
                input: resolve(__dirname, 'src/index.html'),
                output: {
                    manualChunks: undefined,
                },
            },
        },

        server: {
            port: 5173,
            open: false,
        },

        plugins: [
            // Условное включение CSS
            {
                name: 'conditional-css',
                transformIndexHtml(html) {
                    if (desktop) {
                        return html.replace(
                            /<link[^>]*href=["']\.\/css\/mobile\.css["'][^>]*>/g,
                            ''
                        );
                    } else {
                        return html.replace(
                            /<link[^>]*href=["']\.\/css\/desktop\.css["'][^>]*>/g,
                            ''
                        );
                    }
                },
            },

            // Пост-сборка: копировать images/, data/, manifest.json
            {
                name: 'copy-static-assets',
                writeBundle(options) {
                    const outDir = options.dir || resolve(__dirname, desktop ? 'dist-desktop' : 'dist-mobile');
                    const srcDir = resolve(__dirname, 'src');

                    copyDirSync(resolve(srcDir, 'images'), resolve(outDir, 'images'));
                    copyDirSync(resolve(srcDir, 'data'), resolve(outDir, 'data'));

                    const manifestSrc = resolve(srcDir, 'manifest.json');
                    if (fs.existsSync(manifestSrc)) {
                        fs.copyFileSync(manifestSrc, resolve(outDir, 'manifest.json'));
                    }
                },
            },
        ],
    };
});
