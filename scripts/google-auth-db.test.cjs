const { test } = require('node:test');
const assert = require('node:assert/strict');
const { databaseTarget, analyzeSchema, inspectDatabase } = require('./google-auth-db.cjs');

test('database target excludes credentials and rejects unexpected schema', () => {
  const target = databaseTarget({ DATABASE_URL:'postgresql://u:private@db.example/main?schema=public', NEON_PROJECT_ID:'test-project' });
  assert.equal(target.fingerprint, databaseTarget({DATABASE_URL:'postgresql://other:different@db.example/main',NEON_PROJECT_ID:'test-project'}).fingerprint);
  assert.notEqual(target.fingerprint, databaseTarget({DATABASE_URL:'postgresql://u:private@db.example/other',NEON_PROJECT_ID:'test-project'}).fingerprint);
  assert(!JSON.stringify(target).includes('private'));
  assert.throws(() => databaseTarget({DATABASE_URL:'postgresql://u:p@db.example/main?schema=other',NEON_PROJECT_ID:'test-project'}));
  assert.throws(() => databaseTarget({DATABASE_URL:'postgresql://u:p@db.example/main'}));
});

const columns = [
  ...['id','name','email','password'].map(column_name => ({table_name:'User',column_name,data_type:'text',is_nullable:'NO'})),
  {table_name:'User',column_name:'emailVerified',data_type:'boolean',is_nullable:'NO'},
  ...['id','provider','subject','userId'].map(column_name => ({table_name:'auth_identities',column_name,data_type:'text',is_nullable:'NO'})),
  {table_name:'auth_identities',column_name:'createdAt',data_type:'timestamp without time zone',is_nullable:'NO'},
];
const constraints = [
  {table_name:'auth_identities',contype:'p',columns:['id']},
  {table_name:'auth_identities',contype:'f',columns:['userId'],foreign_schema:'public',foreign_table:'User',foreign_columns:['id'],delete_action:'c'},
];
const indexes = [
  {table_name:'auth_identities',is_unique:true,is_valid:true,is_partial:false,columns:['provider','subject']},
  {table_name:'auth_identities',is_unique:false,is_valid:true,is_partial:false,columns:['userId']},
];

test('identity preflight rejects missing table, nullable fields and unsafe keys', () => {
  assert.deepEqual(analyzeSchema(columns,constraints,indexes),{userReady:true,authTableExists:true,authSchemaValid:true});
  assert.equal(analyzeSchema(columns.filter(c=>c.table_name==='User'),[],[]).authTableExists,false);
  assert.equal(analyzeSchema(columns.map(c=>c.column_name==='subject'?{...c,is_nullable:'YES'}:c),constraints,indexes).authSchemaValid,false);
  assert.equal(analyzeSchema(columns,constraints.map(c=>({...c,delete_action:'a'})),indexes).authSchemaValid,false);
  assert.equal(analyzeSchema(columns,constraints,indexes.map(i=>({...i,is_partial:true}))).authSchemaValid,false);
  assert.equal(analyzeSchema(columns,constraints,indexes.map(i=>({...i,is_unique:false}))).authSchemaValid,false);
});

test('inspection sets read-only transaction before metadata queries', async () => {
  const calls=[];
  const result=await inspectDatabase({$transaction:fn=>fn({
    $executeRawUnsafe:async sql=>calls.push(sql),
    $queryRawUnsafe:async sql=>{calls.push(sql);return sql.includes('information_schema')?columns:sql.includes('pg_constraint')?constraints:indexes;},
  })});
  assert.equal(calls[0],'SET TRANSACTION READ ONLY');
  assert(calls.slice(2).every(sql=>sql.startsWith('SELECT')));
  assert.equal(result.authSchemaValid,true);
});
