const program = require('commander');

program
  .command('build')
  .description('pack .js files')
  .action(require('./build'))
  .option('-w, --watch', 'watching for changes');

program.parse(process.argv);
