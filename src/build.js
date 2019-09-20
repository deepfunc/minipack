const fs = require('fs');
const path = require('path');
const prettier = require('prettier');
const chokidar = require('chokidar');
const { debounce } = require('throttle-debounce');
const { initPack, createGraph, bundle } = require('./minipack');

const fsPromises = fs.promises;

const rootDir = path.resolve(__dirname, '..');
const entryDir = path.join(rootDir, 'example');
let isPacking = false;
let isWatchingInited = false;
let runOpts;
const pendingOfWatchFiles = [];

const onFileChange = debounce(300, () => {
  pendingOfWatchFiles.splice(0, pendingOfWatchFiles.length);
  start(runOpts);
});

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

  initPack();
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
        pendingOfWatchFiles.push(path);
        onFileChange();
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

/**
 * watch 时候重新编译，当然是希望有缓存的功能，没有改变的文件使用原来的缓存即可。
 * 那么问题来了，是每次文件变化时，从入口开始重新创建依赖图（利用缓存加快速度），然后输出？
 * 还是说，将依赖图整个缓存下来，从改变的文件开始更新依赖图，然后输出？
 */
