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
  let rst = bundle(graph);
  const formatOpts = {
    singleQuote: true
  };
  rst = prettier.format(rst, formatOpts);

  const outFile = path.join(outDir, 'pack.js');
  fs.writeFileSync(outFile, rst);

  console.log('\r\n' + 'build done.');
}

build();
