const fs = require('fs');
const path = require('path');
const prettier = require('prettier');
const chokidar = require('chokidar');
const { debounce } = require('throttle-debounce');
const {
  createGraphFromEntry,
  bundle,
  cleanCaches
} = require('./minipack');

const fsPromises = fs.promises;

const rootDir = path.resolve(__dirname, '..');
const entryDir = path.join(rootDir, 'example');
let isPacking = false;
let isWatchingInited = false;
let runOpts;
let currGraph;
let currEntryFile;
const pendingOfWatchFiles = [];

const onFileChange = debounce(300, () => {
  const files = pendingOfWatchFiles.splice(0, pendingOfWatchFiles.length);
  partialBuild(files);
});

async function packFromEntry() {
  if (isPacking) {
    return;
  }

  isPacking = true;
  console.log('start pack from entry...');

  const { graph, entryFilePath } = await createGraphFromEntry(entryDir, './entry');
  currGraph = graph;
  currEntryFile = entryFilePath;
  const rst = bundle(currGraph, currEntryFile);
  await writeOutput(rst);

  console.log('pack finished.');
  isPacking = false;
}

async function writeOutput(content) {
  const outDir = path.join(rootDir, 'out');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir);
  }

  const formatOpts = {
    singleQuote: true
  };
  content = prettier.format(content, formatOpts);

  const outFile = path.join(outDir, 'pack.js');
  await fsPromises.writeFile(outFile, content);
}

async function packForChanges(files) {
  if (isPacking) {
    return;
  }

  isPacking = true;
  console.log('build for changes...');
  cleanCaches(files);
  const { graph, entryFilePath } = await createGraphFromEntry(entryDir, './entry');
  currGraph = graph;
  currEntryFile = entryFilePath;
  const rst = bundle(currGraph, currEntryFile);
  await writeOutput(rst);
  console.log('build finished.');
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
        if (!pendingOfWatchFiles.includes(path)) {
          pendingOfWatchFiles.push(path);
        }
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

function partialBuild(files) {
  packForChanges(files).catch(err => {
    console.log(err);
  }).finally(() => {
    console.log('watching...');
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
 * 那么问题来了，有两种做法：
 * 1. 是每次文件变化时，从入口开始重新创建依赖图（利用缓存加快速度），然后输出？
 * 2. 还是说，将依赖图整个缓存下来，从改变的文件开始更新依赖图，然后输出？
 *
 * 第一种方案实现简单。只需要设置一个 cacheMap，key 是文件路径，如果 watch 文件改变了，则清除对应的 cache。
 *
 * 第二种方案貌似看起来效率会更高，但有个问题是如果文件内容发生了变化，有可能依赖文件数量发生变化，
 * 如果减少了，还要去删除多余的依赖图内容，这样就需要记录每个文件之间的引用关系，
 * 只有当没有被当前文件依赖的文件同时也没有被其他文件依赖时，就可以安心删除依赖图的内容了。
 * 并且这个依赖图删除的时候还需要是一个递归检查（应该可以改为广度检查）…
 *
 * 先来实现第一种方案。
 */
