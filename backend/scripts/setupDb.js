// One command database setup:   npm run db:setup
//   1. connects to PostgreSQL (maintenance database "postgres")
//   2. creates the database named in DB_NAME if it doesn't exist yet
//   3. runs database/schema.sql inside it
// Safe to run again — the schema only creates what is missing.
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

dotenv.config();

const here = path.dirname(fileURLToPath(import.meta.url));
const schemaFile = path.resolve(here, '../../database/schema.sql');
const dbName = process.env.DB_NAME || 'restaurant_management';

if (!/^[A-Za-z0-9_]+$/.test(dbName)) {
  console.error('❌ DB_NAME may only contain letters, numbers and underscores.');
  process.exit(1);
}

const base = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 5432,
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,
    };
const ssl = process.env.DB_SSL === 'true' ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' } : undefined;

function explain(err) {
  console.error(`\n❌ ${err.message}`);
  if (err.code === '28P01') console.error('   Wrong DB_USER / DB_PASSWORD in backend/.env (same as your pgAdmin login).');
  if (err.code === 'ECONNREFUSED') console.error('   PostgreSQL is not running, or DB_HOST / DB_PORT is wrong (default port 5432).');
  if (err.code === '42501') console.error('   This user may not create databases. Create "' + dbName + '" in pgAdmin, then run this again.');
  process.exit(1);
}

async function main() {
  if (!fs.existsSync(schemaFile)) { console.error(`❌ Cannot find ${schemaFile}`); process.exit(1); }

  // managed hosts (Neon, Supabase, Render…) give you a ready-made database — skip the CREATE step
  if (!process.env.DATABASE_URL) {
    const admin = new pg.Client({ ...base, database: 'postgres', ssl });
    await admin.connect();
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (exists.rowCount === 0) {
      await admin.query(`CREATE DATABASE "${dbName}"`);
      console.log(`✅ Created database "${dbName}"`);
    } else {
      console.log(`ℹ️  Database "${dbName}" already exists`);
    }
    await admin.end();
  }

  const client = new pg.Client({ ...base, ...(process.env.DATABASE_URL ? {} : { database: dbName }), ssl });
  await client.connect();
  await client.query(fs.readFileSync(schemaFile, 'utf8'));   // multi-statement script, runs as one batch
  const { rows } = await client.query("SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'");
  await client.end();
  console.log(`✅ Schema applied — ${rows[0].n} tables in "${dbName}"`);
  console.log('   Next:  npm run seed   (creates the first admin)   then   npm run dev');
}

main().catch(explain);
