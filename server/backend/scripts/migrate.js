import { createKnex, migrate } from '../src/db.js';
import { seedDefaults } from '../src/services/common.js';

const knex = createKnex();
await migrate(knex);
await seedDefaults(knex);
console.log('Database is up to date.');
await knex.destroy();
