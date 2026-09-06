import esbuild from 'esbuild';
import process from 'process';
import builtins from 'builtin-modules';
import { copyFileSync, mkdirSync } from 'fs';

const prod = process.argv.includes('--production');

const OUT_DIR = 'dist/task-baby';
const OUT_FILE = `${OUT_DIR}/main.js`;

const commonOptions = {
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: [
    'obsidian',
    'electron',
    '@codemirror/autocomplete',
    '@codemirror/collab',
    '@codemirror/commands',
    '@codemirror/language',
    '@codemirror/lint',
    '@codemirror/search',
    '@codemirror/state',
    '@codemirror/view',
    '@lezer/common',
    '@lezer/highlight',
    '@lezer/lr',
    ...builtins
  ],
  format: 'cjs',
  target: 'es2020',
  logLevel: 'info',
  sourcemap: prod ? false : 'inline',
  treeShaking: true,
  outfile: OUT_FILE,
  minify: prod
};

function copyAssets() {
  mkdirSync(OUT_DIR, { recursive: true });
  copyFileSync('manifest.json', `${OUT_DIR}/manifest.json`);
  copyFileSync('styles.css', `${OUT_DIR}/styles.css`);
}

if (prod) {
  await esbuild.build(commonOptions);
  copyAssets();
} else {
  copyAssets();
  const ctx = await esbuild.context(commonOptions);
  await ctx.watch();
}
