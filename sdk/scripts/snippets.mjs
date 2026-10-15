// Load the actual code strings displayed in the dashboard, without its browser environment.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = new URL('../../dashboard/src/features/integrations/snippets/', import.meta.url);
export function loadSnippets(language, api = 'https://api.truplexy.com/v3') {
  function load(name) {
    const source = readFileSync(new URL(`${name}.ts`, root), 'utf8');
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const module = { exports: {} };
    const require = (id) => {
      if (id === './types') return { PUBLIC_API: api, indent: (s, by) => s.split('\n').join(`\n${by}`) };
      if (id === './wordpress-plugin') return load('wordpress-plugin');
      throw new Error(`Unexpected snippet import: ${id}`);
    };
    new Function('require', 'module', 'exports', js)(require, module, module.exports);
    return module.exports;
  }
  return load(language).default;
}

// Extract for syntax checks or running the Python/Go routes against the mock API.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [out, api] = process.argv.slice(2);
  if (!out) throw new Error('Usage: node scripts/snippets.mjs <output directory> [API base URL]');
  for (const language of ['node', 'python', 'php', 'go', 'java', 'csharp', 'ruby']) {
    const pack = loadSnippets(language, api);
    const dir = resolve(out, language);
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, pack.files.helper), pack.helper);
    writeFileSync(resolve(dir, pack.files.verify), pack.verify);
    for (const [name, code] of Object.entries(pack.integrations)) {
      writeFileSync(resolve(dir, `${name}-${code.file ?? pack.files.server}`), code.handler);
    }
  }
  console.log(`Extracted integration code to ${resolve(out)}`);
}
