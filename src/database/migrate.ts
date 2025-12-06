/**
 * Database Migration Runner
 * Запуск: npx ts-node src/database/migrate.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'path';
import { getDatabase, PostgresAdapter } from './PostgresAdapter';

dotenvConfig({ path: resolve(__dirname, '../../.env') });

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

interface Migration {
    name: string;
    sql: string;
}

async function loadMigrations(): Promise<Migration[]> {
    const files = fs.readdirSync(MIGRATIONS_DIR)
        .filter(f => f.endsWith('.sql'))
        .sort();

    return files.map(file => ({
        name: file.replace('.sql', ''),
        sql: fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8')
    }));
}

async function getAppliedMigrations(db: PostgresAdapter): Promise<string[]> {
    try {
        const result = await db.query<{ name: string }>(
            'SELECT name FROM migrations ORDER BY applied_at'
        );
        return result.rows.map(r => r.name);
    } catch {
        // migrations table doesn't exist yet
        return [];
    }
}

async function runMigrations(): Promise<void> {
    console.log('🗄️  Database Migration Runner\n');

    const db = getDatabase();

    try {
        await db.connect();
        console.log('✅ Connected to database\n');

        const migrations = await loadMigrations();
        const applied = await getAppliedMigrations(db);

        console.log(`📋 Found ${migrations.length} migration(s)`);
        console.log(`✅ ${applied.length} already applied\n`);

        const pending = migrations.filter(m => !applied.includes(m.name));

        if (pending.length === 0) {
            console.log('✨ No pending migrations\n');
            await db.disconnect();
            return;
        }

        console.log(`🔄 Running ${pending.length} pending migration(s)...\n`);

        for (const migration of pending) {
            console.log(`  ▶ ${migration.name}...`);

            const tx = await db.transaction();
            try {
                await tx.query(migration.sql);
                await tx.commit();
                console.log(`    ✅ Applied`);
            } catch (error) {
                await tx.rollback();
                const message = error instanceof Error ? error.message : String(error);
                console.error(`    ❌ Failed: ${message}`);
                throw error;
            }
        }

        console.log('\n✅ All migrations applied successfully\n');

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`\n❌ Migration failed: ${message}\n`);
        process.exit(1);
    } finally {
        await db.disconnect();
    }
}

async function rollback(steps: number = 1): Promise<void> {
    console.log(`🔙 Rolling back ${steps} migration(s)...\n`);

    const db = getDatabase();

    try {
        await db.connect();

        const applied = await getAppliedMigrations(db);

        if (applied.length === 0) {
            console.log('No migrations to rollback\n');
            await db.disconnect();
            return;
        }

        const toRollback = applied.slice(-steps);

        for (const name of toRollback.reverse()) {
            console.log(`  ▶ Rolling back ${name}...`);
            // Note: For proper rollback, you'd need down migrations
            // This just removes from migrations table
            await db.query('DELETE FROM migrations WHERE name = $1', [name]);
            console.log(`    ✅ Removed from migrations table`);
        }

        console.log('\n⚠️  Note: Tables were NOT dropped. Run down migrations manually if needed.\n');

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`\n❌ Rollback failed: ${message}\n`);
        process.exit(1);
    } finally {
        await db.disconnect();
    }
}

async function status(): Promise<void> {
    console.log('📊 Migration Status\n');

    const db = getDatabase();

    try {
        await db.connect();

        const migrations = await loadMigrations();
        const applied = await getAppliedMigrations(db);

        console.log('Migration                     Status');
        console.log('─'.repeat(50));

        for (const migration of migrations) {
            const isApplied = applied.includes(migration.name);
            const status = isApplied ? '✅ Applied' : '⏳ Pending';
            console.log(`${migration.name.padEnd(30)} ${status}`);
        }

        console.log('─'.repeat(50));
        console.log(`Total: ${migrations.length}, Applied: ${applied.length}, Pending: ${migrations.length - applied.length}\n`);

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`\n❌ Error: ${message}\n`);
        process.exit(1);
    } finally {
        await db.disconnect();
    }
}

// CLI
const command = process.argv[2] || 'up';

switch (command) {
    case 'up':
    case 'migrate':
        runMigrations();
        break;
    case 'down':
    case 'rollback':
        const steps = parseInt(process.argv[3] || '1');
        rollback(steps);
        break;
    case 'status':
        status();
        break;
    default:
        console.log(`
Database Migration Tool

Usage:
  npx ts-node src/database/migrate.ts [command]

Commands:
  up, migrate     Run all pending migrations (default)
  down, rollback  Rollback last migration (or specify count)
  status          Show migration status

Examples:
  npx ts-node src/database/migrate.ts
  npx ts-node src/database/migrate.ts status
  npx ts-node src/database/migrate.ts rollback 2
`);
}
