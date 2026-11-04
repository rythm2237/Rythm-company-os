import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
try{
 await db.exec(`create table projects(id text primary key,organization_id text not null);
 create table project_executions(id text primary key,project_id text not null,organization_id text not null);
 create table agents(id text primary key,organization_id text not null);
 create table action_items(id text primary key,organization_id text not null);
 create table project_decision_memory(id text primary key,project_id text not null,organization_id text not null);
 create table tool_execution_requests(id text primary key,project_id text,organization_id text not null);
 create table project_task_runs(id text primary key,project_id text not null,organization_id text not null,execution_id text not null,assigned_agent_id text,action_item_id text);
 insert into projects values('pa','a'),('pb','b');insert into project_executions values('ea','pa','a'),('eb','pb','b');insert into agents values('aa','a'),('ab','b');insert into action_items values('ia','a'),('ib','b');`);
 await db.exec(readFileSync('supabase/migrations/20261104190228_w03_project_tenant_relationships.sql','utf8'));
 let denied=0;
 const reject=async(sql)=>{await assert.rejects(()=>db.exec(sql),e=>e.code==='23503');denied++;};
 await db.exec("insert into project_decision_memory values('ma','pa','a');insert into tool_execution_requests values('ta','pa','a');insert into project_task_runs values('wa','pa','a','ea','aa','ia');");
 await reject("insert into project_decision_memory values('foreign','pb','a')");
 await reject("update project_decision_memory set project_id='pb' where id='ma'");
 await reject("insert into tool_execution_requests values('foreign','pb','a')");
 await reject("update tool_execution_requests set project_id='pb' where id='ta'");
 for(const patch of ["project_id='pb'","execution_id='eb'","assigned_agent_id='ab'","action_item_id='ib'"])await reject('update project_task_runs set '+patch+" where id='wa'");
 for(const values of ["'pb','a','ea','aa','ia'","'pa','a','eb','aa','ia'","'pa','a','ea','ab','ia'","'pa','a','ea','aa','ib'"])await reject("insert into project_task_runs values('foreign',"+values+')');
 await db.exec("delete from agents where id='aa';delete from action_items where id='ia';");
 const row=(await db.query("select * from project_task_runs where id='wa'")).rows[0];assert.equal(row.organization_id,'a');assert.equal(row.assigned_agent_id,null);assert.equal(row.action_item_id,null);
 assert.equal(denied,12);console.log('PASS W03 real Postgres migration: 12 cross-tenant INSERT/UPDATE violations denied; own references pass; nullable parent deletion preserves organization.');
}finally{await db.close();}
