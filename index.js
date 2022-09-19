import path from 'path';
import { fileURLToPath } from 'url';
import esbuild from 'esbuild';
import {existsSync, mkdirSync, promises, writeFileSync} from "fs";
import mime from 'mime/lite.js';

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
            builder.rimraf(out);
            const files = fileURLToPath(new URL('./src', import.meta.url).href);

            const dirs = {
                static: `${out}`,
                functions: `${out}`
            };


            builder.log.minor('Copying assets...');
            builder.writeClient(dirs.static);
            builder.writePrerendered(dirs.static);

            builder.log.minor('Writing routes...');
            /** @type {Record<string, { path: string }>} */
            const overrides = {};
            builder.prerendered.pages.forEach((page, src) => {
                overrides[page.file] = { path: src.slice(1) };
            });

            builder.log.minor('Creating static file index...');
            const staticFiles = JSON.stringify(await listDirectoryRecursiveWithMIME(dirs.static, dirs.static));
            writeFileSync(`${files}/static.js`, `export default ${staticFiles}`)

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
            builder.copy(`${files}/static.js`, `${tmp}/static.js`);
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
        }
    };

    return adapter;
}

/**
 *
 * @param base
 * @param dir
 * @param {StaticFileEntry[]} files
 * @return {Promise<*[]>}
 */
async function listDirectoryRecursiveWithMIME(base, dir, files = []) {
    const dirents = await promises.readdir(dir, { withFileTypes: true });
    const dirs = [];
    for (const dirent of dirents) {
        if (dirent.isDirectory()) {
            dirs.push(`${dir}/${dirent.name}`);
        }
        if (dirent.isFile()) {
            let name = `${dir.substring(base.length)}/${dirent.name}`.replace(/^\//,'');
            files.push({
                name: name,
                mime: mime.getType(path.extname(dirent.name)),
            });
        }
    }
    for (const d of dirs) {
        files = await listDirectoryRecursiveWithMIME(base, d, files);
    }

    return Promise.resolve(files);
}