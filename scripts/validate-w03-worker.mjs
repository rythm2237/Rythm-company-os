import assert from 'node:assert/strict';
import {workerBoundaryMatrix} from './fixtures/w03-worker.mjs';

// Fast actual-worker regression; the same harness also runs real staging reads.
const companies=['A','B','C'].map(key=>({key,id:'org-'+key,projectId:'project-'+key}));
const rows={projects:companies.map(o=>({id:o.projectId,organization_id:o.id,name:o.key})),project_executions:companies.map(o=>({id:'execution-'+o.key,project_id:o.projectId,organization_id:o.id})),project_decision_memory:companies.map(o=>({project_id:o.projectId,organization_id:o.id,decision:'W03-SENTINEL-'+o.key})),project_context_documents:[]};
const admin={from(table){const filters=[];const result=()=>({data:(rows[table]??[]).filter(r=>filters.every(([k,v])=>r[k]===v)),error:null});const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},order(){return q;},limit(){return q;},single:async()=>{const r=result();return {...r,data:r.data[0]??null};},maybeSingle:async()=>{const r=result();return {...r,data:r.data[0]??null};},then(resolve,reject){return Promise.resolve(result()).then(resolve,reject);}};return q;}};
const seeds=new Map(companies.map(o=>[o.key,[['project_task_runs',{id:'task-'+o.key,organization_id:o.id,project_id:o.projectId,execution_id:'execution-'+o.key,title:'synthetic'}]]]));
const checks=[];await workerBoundaryMatrix({b:{companies},admin,seeds,record:(...args)=>checks.push({operation:args[1],ok:args[4],detail:args[5]})});
assert.equal(checks.length,9);assert.equal(checks.filter(x=>!x.ok).length,0,JSON.stringify(checks.filter(x=>!x.ok)));
console.log('PASS W03 actual worker: three own-context provider controls and six foreign-project provider denials; provider/writes intercepted.');
