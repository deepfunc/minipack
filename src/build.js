const fs = require('fs');
const path = require('path');
const prettier = require('prettier');
const { createGraph, bundle } = require('./minipack');

const fsPromises = fs.promises;

async function build() {
  const rootDir = path.resolve(__dirname, '..');
  const outDir = path.join(rootDir, 'out');

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir);
  }

  const graph = await createGraph(rootDir, './example/entry');
  let rst = bundle(graph);

  const formatOpts = {
    singleQuote: true
  };
  rst = prettier.format(rst, formatOpts);

  const outFile = path.join(outDir, 'pack.js');
  await fsPromises.writeFile(outFile, rst);
}

(function start() {
  console.log('build start...');
  build().then(() => {
    console.log('build finished.');
  }).catch(err => {
    console.log(err);
  });
})();
