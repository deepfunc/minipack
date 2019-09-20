const fs = require('fs');
const path = require('path');
const babylon = require('babylon');
const traverse = require('babel-traverse').default;
const { transformFromAst } = require('babel-core');
const resolver = require('./resolver');
const FileDep = require('./FileDep');

const fsPromises = fs.promises;

let ID = 0;
const fileDep = new FileDep();

async function createGraphFromEntry(startPath, request) {
  const { filepath: entryFilePath } = await resolveFilePath(startPath, request);
  const mainAsset = await createAsset(entryFilePath);

  const assetMap = {};
  const queue = [mainAsset];
  const graph = {};

  assetMap[mainAsset.filename] = mainAsset;

  while (queue.length > 0) {
    const asset = queue.shift();
    asset.mapping = {};
    const dirname = path.dirname(asset.filename);
    const deps = [];

    for (const relativePath of asset.dependencies) {
      const { filepath: absolutePath } = await resolveFilePath(dirname, relativePath);
      let child = assetMap[absolutePath];

      if (child == null) {
        child = await createAsset(absolutePath);
        assetMap[child.filename] = child;
        queue.push(child);
      }

      asset.mapping[relativePath] = child.id;
      deps.push(absolutePath);
    }

    fileDep.addDeps(asset.filename, deps);
    graph[asset.filename] = asset;
  }

  return { graph, entryFilePath };
}

function resolveFilePath(startPath, request) {
  return resolver.resolve({}, startPath, request, {});
}

async function createAsset(filename) {
  const fileContent = await fsPromises.readFile(filename, 'utf-8');

  const ast = babylon.parse(fileContent, {
    sourceType: 'module'
  });

  const dependencies = [];
  traverse(ast, {
    ImportDeclaration: ({ node }) => {
      dependencies.push(node.source.value);
    }
  });

  const id = ID++;
  const { code } = transformFromAst(ast, null, {
    presets: ['env']
  });

  return {
    id,
    filename,
    dependencies,
    code
  };
}

function bundle(graph, entryFilePath) {
  let modules = '';

  const modKeys = Object.keys(graph);
  for (const key of modKeys) {
    const mod = graph[key];
    modules += `${mod.id}: [
      function (require, module, exports) {
        ${mod.code}
      },
      ${JSON.stringify(mod.mapping)}
    ],`;
  }

  /* eslint-disable */
  const loader = function (modules, entryID) {
    var moduleMap = {};

    function require(id) {
      var module = moduleMap[id];
      if (module != null) {
        return module.exports;
      }

      var fn = modules[id][0];
      var mapping = modules[id][1];

      function localRequire(name) {
        return require(mapping[name]);
      }

      module = {
        id: id,
        exports: {},
        loaded: false
      };
      moduleMap[id] = module;

      fn(localRequire, module, module.exports);
      module.loaded = true;

      return module.exports;
    }

    require(entryID);
  };
  /* eslint-enable */

  return `(${loader.toString()})({${modules}}, ${graph[entryFilePath].id})`;
}

async function updateGraphForChanges(currGraph, changedFiles) {
  /**
   * 文件发生变化，更新依赖图步骤如下：
   * 1. 重新转码文件，并拿到所有依赖文件的绝对路径；
   * 2. 检查当前依赖文件数组与原依赖文件数组；
   * 3. 新增的依赖要解析并加入依赖图（注意递归依赖）；
   * 4. 删除的依赖要删除依赖图中的内容（注意递归依赖）；
   */

  for (const changedFile of changedFiles) {
    const fileContent = await fsPromises.readFile(changedFile, 'utf-8');
    const ast = babylon.parse(fileContent, {
      sourceType: 'module'
    });

    const dependencies = [];
    traverse(ast, {
      ImportDeclaration: ({ node }) => {
        dependencies.push(node.source.value);
      }
    });
  }

  return currGraph;
}

module.exports = {
  createGraphFromEntry,
  bundle,
  updateGraphForChanges
};
