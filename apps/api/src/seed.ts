/**
 * CLI entry: regenerate the seeded day.
 *
 *   npm -w @aura/api run db:seed            # skip if already seeded
 *   npm -w @aura/api run db:reset           # delete the file and regenerate
 *   node dist/seed.js --force               # regenerate in place
 */
import { seedDatabase } from './seed-world.js';
import { sqlite } from './db.js';

seedDatabase({ force: process.argv.includes('--force') });
sqlite.close();
