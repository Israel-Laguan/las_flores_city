import path from 'path';
import { migrateContent } from './migrate.js';

const contentDir = process.argv[2] || path.join(process.cwd(), 'content');

migrateContent(contentDir)
  .then(result => {
    if (result.success) {
      console.log('\n🎉 Migration completed successfully!');
      process.exit(0);
    } else {
      console.log('\n💥 Migration failed!');
      if (result.errors.length > 0) {
        console.log('\nErrors:');
        result.errors.forEach(e => console.log(`  - ${typeof e === 'string' ? e : (e as any).message ?? String(e)}`));
      }
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
