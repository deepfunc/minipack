const fs = require('fs');
const path = require('path');
const babylon = require('babylon');
const traverse = require('babel-traverse').default;
const { transformFromAst } = require('babel-core');
const resolver = require('./resolver');

const fsPromises = fs.promises;

let ID = 0;
const cacheMap = {};

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

    for (const relativePath of asset.dependencies) {
      const { filepath: absolutePath } = await resolveFilePath(dirname, relativePath);
      let child = assetMap[absolutePath];

      if (child == null) {
        child = await createAsset(absolutePath);
        assetMap[child.filename] = child;
        queue.push(child);
      }

      asset.mapping[relativePath] = child.id;
    }

    graph[asset.filename] = asset;
  }

  return { graph, entryFilePath };
}

function resolveFilePath(startPath, request) {
  return resolver.resolve({}, startPath, request, {});
}

async function createAsset(filename) {
  let asset = cacheMap[filename];
  if (asset == null) {
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

    asset = {
      id,
      filename,
      dependencies,
      code
    };
    cacheMap[filename] = asset;
  }

  return asset;
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

function cleanCaches(files) {
  files.forEach(file => {
    delete cacheMap[file];
  });
}

module.exports = {
  createGraphFromEntry,
  bundle,
  cleanCaches
};
