import path, {join} from 'path';
import { fileURLToPath } from 'url';
import esbuild from 'esbuild';
import {existsSync, mkdirSync, readFileSync} from "fs";

export default function ({ out = '.aws-lambda/lambda' } = {}) {
    /** @type {import('@sveltejs/kit').Adapter} */
    const adapter = {
        name: 'adapter-lambda-function-urls',
        async adapt(builder) {
            const tmp = builder.getBuildDirectory('aws-lambda-tmp');
            builder.rimraf(tmp);
            if (!existsSync(tmp)) {
                mkdirSync(tmp, { recursive: true })
            }
            const files = fileURLToPath(new URL('./src', import.meta.url).href);

            const dirs = {
                static: `${out}/`,
                functions: `${out}/`
            };

            const relativePath = path.posix.relative(tmp, builder.getServerDirectory());

            builder.log.minor('Copying server...');
            builder.writeServer(dirs.functions);

            builder.log.minor('Building lambda');
            builder.copy(`${files}/handler.js`, `${tmp}/index.js`, {
                replace: {
                    '0SERVER': `${relativePath}/index.js`,
                    MANIFEST: `${relativePath}/manifest.js`,
                }
            });
            builder.copy(`${files}/shims.js`, `${tmp}/shims.js`);
            builder.copy(`${files}/headers.js`, `${tmp}/headers.js`);
            builder.copy(`package.json`, `${out}/package.json`);
            esbuild.buildSync({
                entryPoints: [`${tmp}/index.js`],
                outfile: `${out}/svelte.js`,
                bundle: true,
                // minify: true,
                banner: {
                    js: "import { createRequire } from 'module';const require = createRequire(import.meta.url);"
                },
                platform: 'node',
                external: ['node:*'],
                format: 'esm',
            });

            builder.log.minor('Copying assets...');
            builder.writeClient(dirs.static);
            builder.writePrerendered(dirs.static);

            builder.log.minor('Writing routes...');
            /** @type {Record<string, { path: string }>} */
            const overrides = {};
            builder.prerendered.pages.forEach((page, src) => {
                overrides[page.file] = { path: src.slice(1) };
            });
        }
    };

    return adapter;
}