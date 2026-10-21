/**
 * Exercising the *real* review worker with an isolated deterministic Supabase-shaped
 * in-memory adapter. SQL DDL/RLS are tested separately with PGlite.
 * No live credentials, external AI tools, or Production writes.
 */
import assert from "node:assert/strict";
import type {SupabaseClient} from "@supabase/supabase-js";
import {processContinuousProgramReviews} from "../lib/projects/continuous-program-review-worker";

type Row=Record<string,unknown>;
type Table="continuous_programs"|"projects"|"agency_seo_snapshots"|"project_proposals"|"continuous_program_review_cycles";
type Operation="select"|"update"|"insert";
const clone=<T>(item:T):T=>JSON.parse(JSON.stringify(item)) as T;
class Query {
  private filters:((row:Row)=>boolean)[]=[];
  private fields="*";
  private sorting:{column:string;ascending:boolean}|null=null;
  private take=Infinity;
  private values:Row={};
  private isSingle=false;
  private maybe=false;
  constructor(private store:Store,private table:Table,private op:Operation){}
  select(fields:string){this.fields=fields;return this;}
  eq(key:string,value:unknown){this.filters.push(row=>row[key]===value);return this;}
  in(key:string,values:unknown[]){this.filters.push(row=>values.includes(row[key]));return this;}
  order(column:string,opts:{ascending:boolean}){this.sorting={column,ascending:opts.ascending};return this;}
  limit(amount:number){this.take=amount;return this;}
  single(){this.isSingle=true;return this.execute();}
  maybeSingle(){this.maybe=true;return this.execute();}
  update(value:Row){this.values=value;return this;}
  insert(value:Row){this.values=value;return this;}
  then(resolve:(value:{data:unknown;error:{message:string}|null})=>unknown,reject?:(reason:unknown)=>unknown){
    return this.execute().then(resolve,reject);
  }
  private async execute():Promise<{data:unknown;error:{message:string}|null}>{
    const list=this.store.tables[this.table];
    let rows=list.filter(row=>this.filters.every(f=>f(row)));
    if(this.sorting){const {column,ascending}=this.sorting;
      rows=[...rows].sort((a,b)=>String(a[column]??"").localeCompare(String(b[column]??""))*(ascending?1:-1));}
    rows=rows.slice(0,this.take);
    if(this.op==="update"){for(const row of rows)Object.assign(row,clone(this.values));}
    if(this.op==="insert"){
      const entry={...clone(this.values),id:`proposal-${++this.store.sequence}`,created_at:new Date().toISOString()};
      list.push(entry);rows=[entry];
    }
    const data=rows.map(row=>this.fields==="*"?clone(row):
      Object.fromEntries(this.fields.split(",").map(f=>f.trim()).filter(Boolean).map(field=>[field,clone(row[field]??null)])));
    if(this.isSingle&&data.length!==1)return {data:null,error:{message:`Expected one row: ${this.table}`}};
    return {data:this.isSingle||this.maybe?data[0]??null:data,error:null};
  }
}
class Store {
  sequence=0;
  tables:Record<Table,Row[]>={
    continuous_programs:[],projects:[],agency_seo_snapshots:[],project_proposals:[],continuous_program_review_cycles:[]
  };
  from(table:Table){return new Query(this,table,"select");}
  rpc(name:string,args:{p_limit:number}){
    if(name!=="claim_continuous_review_work_v1")return Promise.resolve({data:null,error:{message:"Unexpected RPC"}});
    const ready=this.tables.continuous_program_review_cycles.filter(c=>c.state==="scheduled").slice(0,args.p_limit);
    for(const row of ready){row.state="running";row.attempts=Number(row.attempts??0)+1;}
    return Promise.resolve({data:ready.map(row=>({
      cycle_id:row.id,program_id:row.program_id,organization_id:row.organization_id
    })),error:null});
  }
  client():SupabaseClient{
    return {from:(table:Table)=>{
      const make=new Query(this,table,"select");
      return new Proxy(make,{get:(target,key)=>{
        if(key==="update")return (value:Row)=>new Query(this,table,"update").update(value);
        if(key==="insert")return (value:Row)=>new Query(this,table,"insert").insert(value);
        const member=Reflect.get(target,key);
        return typeof member==="function"?member.bind(target):member;
      }});
    },rpc:this.rpc.bind(this)} as unknown as SupabaseClient;
  }
}
const org="org-test",projectId="project-test",programId="program-test",site="site-test";
const hoursAgo=(hours:number)=>new Date(Date.now()-hours*3600_000).toISOString();
const snapshot=(id:string,ageHours:number,score:number,findings:Row[]=[])=>({
  id,organization_id:org,site_id:site,checked_at:hoursAgo(ageHours),score,
  findings,counts:{warning:findings.length}
});
function fixture(){
  const store=new Store();
  store.tables.projects.push({id:projectId,organization_id:org,lifecycle_kind:"continuous",lifecycle_state:"EXECUTION",status:"active"});
  store.tables.continuous_programs.push({
    id:programId,organization_id:org,project_id:projectId,seo_site_id:site,
    enabled:true,state:"MONITORING",last_review_at:null
  });
  store.tables.continuous_program_review_cycles.push({
    id:"cycle-1",organization_id:org,program_id:programId,
    scheduled_for:hoursAgo(1),state:"scheduled",attempts:0
  });
  return store;
}
const recurring={id:"canonical",severity:"medium",title:"Homepage canonical",authority:"human_approval_required"};
async function main(){
  {
    const store=fixture();
    store.tables.agency_seo_snapshots.push(snapshot("previous",48,87,[recurring]),snapshot("latest",24,87,[recurring]));
    const first=await processContinuousProgramReviews(store.client());
    assert.equal(first.length,1);
    assert.equal(first[0].status,"completed");
    assert.equal(store.tables.project_proposals.length,1);
    assert.equal(store.tables.project_proposals[0].status,"draft","The worker cannot approve its own proposal");
    assert.equal(store.tables.project_proposals[0].proposal_type,"continuous_program_persistent_seo_findings");
    assert.equal(store.tables.continuous_program_review_cycles[0].state,"completed");
    assert.equal(store.tables.continuous_program_review_cycles[0].proposal_id,store.tables.project_proposals[0].id);
    assert.equal(store.tables.continuous_programs[0].state,"MONITORING");
    assert.equal((await processContinuousProgramReviews(store.client())).length,0,"Only scheduled review may be claimed");
    store.tables.continuous_program_review_cycles.push({
      id:"cycle-2",organization_id:org,program_id:programId,state:"scheduled",scheduled_for:hoursAgo(0.5)
    });
    const second=await processContinuousProgramReviews(store.client());
    assert.equal(second[0].status,"completed");
    assert.equal(store.tables.project_proposals.length,1,"Unresolved proposal must be reused");
    assert.equal(second[0].proposalId,first[0].proposalId);
  }
  {
    const store=fixture();
    store.tables.agency_seo_snapshots.push(snapshot("only",24,88));
    const [result]=await processContinuousProgramReviews(store.client());
    assert.equal(result.status,"waiting_for_data");
    assert.equal(store.tables.project_proposals.length,0);
    assert.equal(store.tables.continuous_program_review_cycles[0].state,"waiting_for_data");
  }
  {
    const store=fixture();
    store.tables.agency_seo_snapshots.push(snapshot("old-1",900,60),snapshot("old-2",850,50));
    const [result]=await processContinuousProgramReviews(store.client());
    assert.equal(result.status,"waiting_for_data","Stale measurements may not trigger an optimization");
    assert.equal(store.tables.project_proposals.length,0);
  }
  {
    const store=fixture();
    store.tables.agency_seo_snapshots.push(snapshot("previous",48,88),snapshot("latest",24,71));
    const [result]=await processContinuousProgramReviews(store.client());
    assert.equal(result.status,"completed");
    assert.equal(store.tables.project_proposals[0].proposal_type,"continuous_program_technical_seo_review");
  }
  {
    const store=fixture();
    store.tables.projects[0].lifecycle_state="ON_HOLD";
    store.tables.projects[0].status="blocked";
    store.tables.agency_seo_snapshots.push(snapshot("previous",48,80,[recurring]),snapshot("latest",24,65,[recurring]));
    const [result]=await processContinuousProgramReviews(store.client());
    assert.equal(result.status,"cancelled","Governance must be rechecked *after* claim");
    assert.equal(store.tables.project_proposals.length,0,"On-hold programs must never generate new proposals");
    assert.equal(store.tables.continuous_program_review_cycles[0].state,"cancelled");
  }
  {
    const store=fixture();
    store.tables.continuous_programs[0].seo_site_id=null;
    const [result]=await processContinuousProgramReviews(store.client());
    assert.equal(result.status,"waiting_for_data");
  }
  console.log("PASS real review worker: persistent findings, score regression, proposal deduplication, missing/stale evidence, blocked governance and no execution");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
