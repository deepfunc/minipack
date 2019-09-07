const fs = require('fs');
const { CachedInputFileSystem, ResolverFactory } = require('enhanced-resolve');

const originalResolver = ResolverFactory.createResolver({
  fileSystem: new CachedInputFileSystem(fs, 4000),
  extensions: ['.js', '.json']
});

const resolver = {};

resolver.resolve = function (...args) {
  return new Promise((resolve, reject) => {
    const callback = function (err, filepath, meta) {
      if (err) {
        reject(err);
      } else {
        resolve({ filepath, meta });
      }
    };
    originalResolver.resolve(...args, callback);
  });
};

module.exports = resolver;
