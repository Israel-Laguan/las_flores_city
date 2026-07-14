import path from 'path';
import { validateContent } from './validate.js';

const isCli = process.argv[1]
  ? path.resolve(process.argv[1]).endsWith(path.join('src', 'content', 'validate.ts'))
  : false;

if (isCli) {
  const contentDir = process.argv[2] || '../content';
  const schemaOnly = process.argv.includes('--schema-only');

  validateContent(contentDir, schemaOnly)
    .then(result => {
      if (result.warnings.length > 0) {
        console.log('\n⚠️  Warnings:');
        result.warnings.forEach(w => console.log(`  - ${w}`));
      }
      if (result.errors.length > 0) {
        console.log('\n❌ Errors:');
        result.errors.forEach(e => console.log(`  - [${e.severity}] ${e.file ?? ''}: ${e.message}`));
      }
      if (result.valid) {
        console.log('\n✅ Content validation passed!');
        process.exit(0);
      } else {
        console.log('\n💥 Content validation failed!');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('Unexpected error:', error);
      process.exit(1);
    });
}
