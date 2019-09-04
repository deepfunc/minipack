const fs = require('fs');
const path = require('path');
const prettier = require('prettier');
const { createGraph, bundle } = require('./minipack');

function build() {
  const outDir = path.join(process.cwd(), 'out');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir);
  }

  const graph = createGraph('./example/entry.js');
  let result = bundle(graph);
  const formatOpts = {
    singleQuote: true
  };
  result = prettier.format(result, formatOpts);

  const outFile = path.join(outDir, 'pack.js');
  fs.writeFileSync(outFile, result);

  console.log('build done.');
}

build();
