const fs = require('fs');
const path = require('path');
const prettier = require('prettier');
const chokidar = require('chokidar');
const { createGraph, bundle } = require('./minipack');

const fsPromises = fs.promises;

const rootDir = path.resolve(__dirname, '..');
const entryDir = path.join(rootDir, 'example');
let isPacking = false;
let isWatchingInited = false;
let runOpts;

async function packFromEntry() {
  if (isPacking) {
    return;
  }

  isPacking = true;
  console.log('start pack from entry...');
  const outDir = path.join(rootDir, 'out');

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir);
  }

  const graph = await createGraph(entryDir, './entry');
  let rst = bundle(graph);

  const formatOpts = {
    singleQuote: true
  };
  rst = prettier.format(rst, formatOpts);

  const outFile = path.join(outDir, 'pack.js');
  await fsPromises.writeFile(outFile, rst);
  console.log('pack finished.');
  isPacking = false;
}

function watch() {
  if (!isWatchingInited) {
    const watchOpts = {
      ignoreInitial: true,
      depth: 99
    };
    chokidar.watch([entryDir], watchOpts).on('all', (event, path) => {
      if (event === 'change') {
        start(runOpts);
      }
    });
    isWatchingInited = true;
  }

  console.log('watching...');
}

function start(opts) {
  packFromEntry().then(() => {
    if (opts.watch) {
      watch();
    }
  }).catch(err => {
    console.log(err);
  });
}

module.exports = function build(program) {
  runOpts = {
    watch: program.watch
  };
  start(runOpts);
};
