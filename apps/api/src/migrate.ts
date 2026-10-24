/** Applies every SQL migration under ./drizzle. Safe to run repeatedly. */
import { runMigrations, sqlite } from './db.js';
runMigrations();
console.log('migrations applied');
sqlite.close();
