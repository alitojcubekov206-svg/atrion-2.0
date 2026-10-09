// One-off database preflight. Never called by the application or the normal build.
const { createHash } = require('node:crypto');

function databaseTarget(env) {
  const url = new URL(env.DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('Invalid database protocol');
  const schema = url.searchParams.get('schema') || 'public';
  if (schema !== 'public') throw new Error('Expected public database schema');
  if (!env.NEON_PROJECT_ID) throw new Error('NEON_PROJECT_ID is required');
  const fingerprint = createHash('sha256').update(JSON.stringify([url.hostname, url.pathname, schema, env.NEON_PROJECT_ID])).digest('hex');
  return { projectId: env.NEON_PROJECT_ID, schema, fingerprint };
}

function analyzeSchema(columns, constraints, indexes) {
  const hasColumns = (table, fields) => fields.every(([name, type]) => columns.some(c => c.table_name === table && c.column_name === name && c.data_type === type && c.is_nullable === 'NO'));
  const userReady = hasColumns('User', [['id','text'],['name','text'],['email','text'],['password','text'],['emailVerified','boolean']]);
  const authTableExists = columns.some(c => c.table_name === 'auth_identities');
  const keyEquals = (actual, expected) => Array.isArray(actual) && actual.length === expected.length && actual.every((v,i) => v === expected[i]);
  const authSchemaValid = authTableExists && hasColumns('auth_identities', [['id','text'],['provider','text'],['subject','text'],['userId','text'],['createdAt','timestamp without time zone']])
    && constraints.some(c => c.table_name === 'auth_identities' && c.contype === 'p' && keyEquals(c.columns, ['id']))
    && constraints.some(c => c.table_name === 'auth_identities' && c.contype === 'f' && keyEquals(c.columns, ['userId']) && c.foreign_schema === 'public' && c.foreign_table === 'User' && keyEquals(c.foreign_columns, ['id']) && c.delete_action === 'c')
    && indexes.some(i => i.table_name === 'auth_identities' && i.is_unique && i.is_valid && !i.is_partial && keyEquals(i.columns, ['provider','subject']))
    && indexes.some(i => i.table_name === 'auth_identities' && i.is_valid && !i.is_partial && keyEquals(i.columns, ['userId']));
  return { userReady, authTableExists, authSchemaValid };
}

async function inspectDatabase(db) {
  return db.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '15s'");
    const columns = await tx.$queryRawUnsafe(`SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN ('User', 'auth_identities')`);
    const constraints = await tx.$queryRawUnsafe(`SELECT t.relname AS table_name, c.contype::text AS contype,
      ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY AS k(num, ord) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.num ORDER BY k.ord) AS columns,
      fn.nspname AS foreign_schema, ft.relname AS foreign_table,
      ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY AS k(num, ord) JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.num ORDER BY k.ord) AS foreign_columns,
      c.confdeltype::text AS delete_action
      FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
      LEFT JOIN pg_class ft ON ft.oid=c.confrelid LEFT JOIN pg_namespace fn ON fn.oid=ft.relnamespace
      WHERE n.nspname='public' AND t.relname IN ('User','auth_identities')`);
    const indexes = await tx.$queryRawUnsafe(`SELECT t.relname AS table_name, i.indisunique AS is_unique, i.indisvalid AS is_valid, (i.indpred IS NOT NULL) AS is_partial,
      ARRAY(SELECT a.attname::text FROM unnest(i.indkey::smallint[]) WITH ORDINALITY AS k(num, ord) JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.num WHERE k.ord<=i.indnkeyatts ORDER BY k.ord) AS columns
      FROM pg_index i JOIN pg_class t ON t.oid=i.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace
      WHERE n.nspname='public' AND t.relname='auth_identities'`);
    return analyzeSchema(columns, constraints, indexes);
  }, { maxWait: 15000, timeout: 30000 });
}

async function main(args, env = process.env) {
  const expectedProject = args[0], expectedFingerprint = args[1];
  if (!expectedProject || args.length > 3 || (args[2] && args[2] !== '--require-ready')) throw new Error('Usage: node scripts/google-auth-db.cjs expected-project [fingerprint] [--require-ready]');
  const target = databaseTarget(env);
  if (target.projectId !== expectedProject || (expectedFingerprint && target.fingerprint !== expectedFingerprint)) throw new Error('Database target does not match the reviewed target');
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient({ log: [] });
  try {
    const result = await inspectDatabase(db);
    console.log('ATRION_GOOGLE_DB_PREFLIGHT ' + JSON.stringify({ ...target, ...result }));
    if (!result.userReady || (result.authTableExists && !result.authSchemaValid) || (args[2] === '--require-ready' && !result.authSchemaValid)) throw new Error('Database schema is not ready');
  } finally { await db.$disconnect(); }
}

module.exports = { databaseTarget, analyzeSchema, inspectDatabase, main };
if (require.main === module) main(process.argv.slice(2)).catch(error => {
  // Connection diagnostics can contain credentials: emit only a stable failure marker.
  console.error('ATRION_GOOGLE_DB_PREFLIGHT_FAILED' + (typeof error.code === 'string' && /^P\d{4}$/.test(error.code) ? ' ' + error.code : ''));
  process.exitCode = 1;
});
