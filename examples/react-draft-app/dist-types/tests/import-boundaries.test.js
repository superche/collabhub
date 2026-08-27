import { readFile } from 'node:fs/promises';
import { glob } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
describe('host integration boundaries', () => {
    it('keeps React components and domain independent from CollabHub packages', async () => {
        const files = [];
        const pattern = `${fileURLToPath(new URL('../src', import.meta.url))}/{components,domain}/**/*.{ts,tsx}`;
        for await (const file of glob(pattern))
            files.push(file);
        expect(files.length).toBeGreaterThan(0);
        for (const file of files)
            expect(await readFile(file, 'utf8')).not.toMatch(/@collabhub\//);
    });
});
//# sourceMappingURL=import-boundaries.test.js.map