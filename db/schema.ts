import {sqliteTable,text,integer,index} from 'drizzle-orm/sqlite-core';
export const temperamentPresets=sqliteTable('temperament_presets',{
 id:text('id').primaryKey(),owner:text('owner').notNull(),name:text('name').notNull(),state:text('state').notNull(),revision:integer('revision').notNull(),updatedAt:text('updated_at').notNull()
},t=>[index('idx_temperament_presets_owner').on(t.owner)]);
