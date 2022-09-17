import path, { dirname, join, resolve, posix } from 'path';
import { fileURLToPath } from 'url';

export default function ({ out = '.aws-lambda/lambda' } = {}) {
    /** @type {import('@sveltejs/kit').Adapter} */
    const adapter = {
        name: 'adapter-lambda-function-urls',
        async adapt(builder) {
            const tmp = builder.getBuildDirectory('aws-lambda-tmp');
            builder.rimraf(tmp);
            const files = fileURLToPath(new URL('./files', import.meta.url).href);

            const dirs = {
                static: `${out}/static`,
                functions: `${out}/`
            };

            const relativePath = path.posix.relative(tmp, builder.getServerDirectory());

            builder.log.minor('Copying server...');
            builder.writeServer(dirs.functions);
            builder.copy(`${files}/handler.js`, `${tmp}/index.js`, {
                replace: {
                    SERVER: `${relativePath}/index.js`,
                    MANIFEST: './manifest.js'
                }
            });
            builder.copy(`${files}/shims.js`, `${tmp}/shims.js`);

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