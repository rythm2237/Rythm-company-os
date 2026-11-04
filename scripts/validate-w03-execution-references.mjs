import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
const state={registry:0,inserts:0,queryError:false};globalThis.w03ExecutionReferences=state;
try{
 const built=await build({entryPoints:['lib/integrations/execution-gateway.ts'],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',plugins:[{name:'stop-after-context-validation',setup(b){b.onResolve({filter:/^@\/lib\/integrations\/registry$/},a=>({path:a.path,namespace:'w03-registry'}));b.onLoad({filter:/.*/,namespace:'w03-registry'},()=>({contents:"export function getToolMetadata(){globalThis.w03ExecutionReferences.registry++;throw Error('W03_VALIDATED_REFERENCE')}",loader:'js'}));}}]});
 const mod={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(createRequire(process.cwd()+'/package.json'),mod,mod.exports);
 const db={organization_integrations:[{id:'own-integration',organization_id:'A',provider_key:'internal'}],organization_members:[{user_id:'owner-A',organization_id:'A',role:'owner',membership_status:'active'}],projects:[{id:'own-project',organization_id:'A'},{id:'foreign-project',organization_id:'B'}],meetings:[{id:'own-meeting',organization_id:'A',project_id:'own-project'},{id:'foreign-meeting',organization_id:'B',project_id:'foreign-project'}],meeting_agent_sessions:[{id:'own-session',organization_id:'A',meeting_id:'own-meeting',project_id:'own-project'},{id:'foreign-session',organization_id:'B',meeting_id:'foreign-meeting',project_id:'foreign-project'}],agents:[{id:'own-agent',organization_id:'A'},{id:'foreign-agent',organization_id:'B'}]};
 const client={from(table){const f=[];const q={select(){return q;},eq(k,v){f.push([k,v]);return q;},insert(){state.inserts++;throw Error('Unexpected ledger insert');},async maybeSingle(){return {data:state.queryError?null:(db[table]??[]).find(row=>f.every(([k,v])=>row[k]===v))??null,error:state.queryError?{code:'fixture-error'}:null};}};return q;}};
 const base={organizationId:'A',userId:'owner-A',integrationId:'own-integration',toolId:'internal.validation',capabilityKey:'validation.record.create'};
 for(const field of ['projectId','meetingId','sessionId','agentId']){
  const kind={projectId:'project',meetingId:'meeting',sessionId:'session',agentId:'agent'}[field];
  const before=state.registry;
  await assert.rejects(()=>mod.exports.requestToolExecution(client,{...base,[field]:'foreign-'+kind}),/Execution context is not available to this company/);
  assert.equal(state.registry,before);assert.equal(state.inserts,0);
  await assert.rejects(()=>mod.exports.requestToolExecution(client,{...base,[field]:'own-'+kind}),/W03_VALIDATED_REFERENCE/);
  assert.equal(state.registry,before+1);
 }
 await assert.rejects(()=>mod.exports.requestToolExecution(client,{...base,projectId:'foreign-project',meetingId:'own-meeting'}),/Execution context is not available/);
 state.queryError=true;await assert.rejects(()=>mod.exports.requestToolExecution(client,{...base,projectId:'own-project'}),/Integration is not available/);
 console.log('PASS W03 actual execution gateway: four foreign context references denied before registry/ledger, four own controls, inconsistent context and lookup errors fail closed.');
}finally{delete globalThis.w03ExecutionReferences;}
