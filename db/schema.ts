import { sql } from 'drizzle-orm';
import { check, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Each library belongs to the identity verified by the Sites authentication gate.
export const lumenHeads = sqliteTable('lumen_heads', {
  owner: text('owner').primaryKey().notNull(),
  revision: integer('revision').notNull().default(0),
  updatedAt: integer('updated_at').notNull().default(0),
}, table => [check('lumen_heads_revision_nonnegative', sql`${table.revision} >= 0`)]);

// Snapshots are split into small Base64 chunks to stay below D1 value limits.
export const lumenChunks = sqliteTable('lumen_chunks', {
  owner: text('owner').notNull().references(() => lumenHeads.owner),
  revision: integer('revision').notNull(),
  part: integer('part').notNull(),
  payload: text('payload').notNull(),
}, table => [primaryKey({ columns: [table.owner, table.revision, table.part] })]);
