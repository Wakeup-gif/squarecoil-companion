'use strict';

// Local presentation preview. It serves the production renderer with fictional
// data; it has no extension APIs, account connection, or Timer authority.
const http = require('http');
const fs = require('fs');
const path = require('path');
const extensionRoot = path.resolve(__dirname, '../..');

function bundle(entry) {
  const modules = new Map();
  const dependencies = {};
  function visit(id) {
    if (modules.has(id)) return;
    const source = fs.readFileSync(path.join(extensionRoot, id), 'utf8');
    modules.set(id, source);
    dependencies[id] = {};
    for (const match of source.matchAll(/require\(['"]([^'"]+)['"]\)/g)) {
      const request = match[1];
      if (!request.startsWith('.')) throw new Error(`Nonlocal preview dependency: ${request}`);
      let resolved = path.posix.normalize(path.posix.join(path.posix.dirname(id), request));
      if (!path.posix.extname(resolved)) resolved += '.js';
      dependencies[id][request] = resolved;
      visit(resolved);
    }
  }
  visit(entry);
  const factories = [...modules].map(([id, source]) => `${JSON.stringify(id)}:function(module,exports,require){\n${source}\n}`).join(',');
  return `(function(){const factories={${factories}},deps=${JSON.stringify(dependencies)},cache={};function load(id){if(cache[id])return cache[id].exports;const m=cache[id]={exports:{}};factories[id](m,m.exports,r=>load(deps[id][r]));return m.exports;}load(${JSON.stringify(entry)});})();`;
}

const server = http.createServer((request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  try {
    if (request.url === '/preview.js') {
      response.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      response.end(bundle('dev/ui-preview/client.js'));
    } else if (request.url === '/' || request.url === '/index.html') {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(fs.readFileSync(path.join(__dirname, 'index.html')));
    } else { response.writeHead(404); response.end('Not found'); }
  } catch (error) { response.writeHead(500); response.end(error.message); }
});
server.listen(4173, '127.0.0.1', () => console.log('Companion UI preview: http://127.0.0.1:4173'));
