import { AppDatabase } from './database.js';
import { seedDatabase } from './seed.js';

const command = process.argv[2];
const database = new AppDatabase();

try {
  switch (command) {
    case 'migrate':
      database.migrate();
      break;
    case 'seed':
      database.migrate();
      seedDatabase(database);
      break;
    case 'reset':
      database.reset();
      seedDatabase(database);
      break;
    default:
      throw new Error(`Unknown database command: ${command ?? '(missing)'}`);
  }
} finally {
  database.close();
}
