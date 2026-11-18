import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
const state={approve:0,start:0,writes:0,owned:true,review:null};globalThis.w10RoadmapBoundary=state;
const clientSource=`export function createServerSupabaseClient(){return {from(table){const q={select(){return q},eq(){return q},in(){return q},order(){return q},limit(){return q},insert(){globalThis.w10RoadmapBoundary.writes++;return q},maybeSingle:async()=>({data:table==='projects'&&globalThis.w10RoadmapBoundary.owned?{id:'project'}:null,error:null}),then(resolve,reject){return Promise.resolve({data:null,error:null}).then(resolve,reject)}};return q}}}`;
const mocks={
 '@/lib/supabase/server':clientSource,
 '@/lib/auth/api-organization-context':clientSource.replace('export function createServerSupabaseClient','function createServerSupabaseClient')+`;export async function resolveOwnerApiOrganizationContext(){return {ok:true,organizationId:'org',user:{id:'owner'},supabase:createServerSupabaseClient()}}`,
 '@/lib/projects/project-roadmap':`export async function getLatestProjectRoadmap(){return globalThis.w10RoadmapBoundary.review}export async function approveProjectRoadmap(){globalThis.w10RoadmapBoundary.approve++;return {...globalThis.w10RoadmapBoundary.review,status:'approved'}}`,
 '@/lib/projects/project-execution-start':`export async function startProjectExecutionWithoutGlobalGate(){globalThis.w10RoadmapBoundary.start++;return {id:'execution',execution_no:1}}`,
 '@/lib/projects/project-progress':`export async function getProjectProgressSnapshot(){return {}}`,
};
try{
 const compiled=await build({entryPoints:['app/api/projects/roadmap/route.ts'],bundle:true,platform:'node',format:'cjs',write:false,packages:'external',plugins:[{name:'synthetic-boundaries',setup(builder){builder.onResolve({filter:/^@\//},input=>mocks[input.path]?{path:input.path,namespace:'fixture'}:undefined);builder.onLoad({filter:/.*/,namespace:'fixture'},input=>({loader:'js',contents:mocks[input.path]}));}}]});
 const fixtureModule={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),fixtureModule,fixtureModule.exports);
 const review=dependencies=>({id:'roadmap',version:1,status:'in_review',phases:[{id:'phase',key:'draft',tasks:[{key:'outline',dependencies,requiresApproval:true}]}]});
 const post=roadmapId=>fixtureModule.exports.POST(new Request('http://localhost/api/projects/roadmap',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({projectId:'project',roadmapId:roadmapId??'roadmap',action:'approve_and_start'})}));
 for(const dependencies of [['Client budget approval'],['outline'],['missing-task']]){
  state.review=review(dependencies);assert.equal((await post()).status,422);assert.deepEqual([state.approve,state.start,state.writes],[0,0,0]);assert.equal(state.review.status,'in_review','Invalid model graph remains reviewable through normal Request changes');
 }
 state.review=review([]);assert.equal((await post('stale-roadmap')).status,409);assert.equal(state.approve,0);
 state.owned=false;assert.equal((await post()).status,404);assert.equal(state.approve,0);state.owned=true;
 state.review=review(['Human CEO approval of roadmap']);assert.equal((await post()).status,200);assert.equal(state.approve,1);assert.equal(state.start,1);assert.equal(state.review.phases[0].tasks[0].requiresApproval,true);
 console.log('PASS W10 actual roadmap API: invalid/cyclic/missing graph returns 422 before approval/write, reviewable state retained, stale/foreign rejected, own baseline gate reaches normal approved start');
}finally{delete globalThis.w10RoadmapBoundary;}
