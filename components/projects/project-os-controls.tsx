"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ProjectLiveOperations } from "@/components/projects/project-live-operations";

type Props={projectId:string;canRun?:boolean;status:string;showLiveOperations?:boolean;liveMode?:"full"|"approvals"};

type ApiResult={ok?:boolean;error?:string;execution?:{id:string;execution_no:number;taskCount?:number}};

async function jsonRequest(endpoint:string,body:unknown){
  const response=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
  const data=await response.json() as ApiResult;
  if(!response.ok||!data.ok)throw new Error(data.error||"Request failed.");
  return data;
}

export function ProjectOsControls({projectId,status,showLiveOperations=false,liveMode="full"}:Props){
  const router=useRouter();
  const [busy,setBusy]=useState<"run"|"pause"|"upload"|null>(null);
  const [message,setMessage]=useState<string>("");
  const normalizedStatus=status.toLowerCase();
  const isRunning=normalizedStatus==="running"||normalizedStatus==="queued";
  const isPaused=normalizedStatus==="paused";

  const run=async()=>{
    setBusy("run");setMessage("");
    try{
      if(isPaused){
        await jsonRequest("/api/projects/control",{projectId,action:"resume"});
        setMessage("Project resumed. Independent work continues server-side.");
      }else{
        const result=await jsonRequest("/api/projects/run",{projectId});
        setMessage(`Execution #${result.execution?.execution_no??""} started.`);
      }
      router.refresh();
    }catch(error){setMessage(error instanceof Error?error.message:"Project could not start.");}
    finally{setBusy(null);}
  };
  const pause=async()=>{
    setBusy("pause");setMessage("");
    try{
      await jsonRequest("/api/projects/control",{projectId,action:"pause"});
      setMessage("Project paused. Completed work is preserved and execution can be resumed.");
      router.refresh();
    }catch(error){setMessage(error instanceof Error?error.message:"Project could not be paused.");}
    finally{setBusy(null);}
  };
  const upload=async(formData:FormData)=>{
    setBusy("upload");setMessage("");formData.set("projectId",projectId);
    try{
      const response=await fetch("/api/projects/files",{method:"POST",body:formData});
      const data=await response.json() as {ok?:boolean;error?:string;files?:unknown[]};
      if(!response.ok||!data.ok)throw new Error(data.error||"Upload failed.");
      setMessage(`${data.files?.length??0} file(s) added to Project Knowledge.`);router.refresh();
    }catch(error){setMessage(error instanceof Error?error.message:"Upload failed.");}
    finally{setBusy(null);}
  };

  return <>
    <section className="panel" style={{marginTop:18}}>
      <div className="panel-heading"><div><p className="label">Project Control</p><h2>Run or pause project</h2></div><span className="pill">{status.replaceAll("_"," ")}</span></div>
      <p className="subtitle">Run starts or resumes durable server-side execution. Readiness is advisory: approvals and dependencies block only the work that depends on them, while independent work continues.</p>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:14}}>
        {isRunning
          ? <button type="button" onClick={pause} disabled={busy!==null}>{busy==="pause"?"Pausing…":"Pause"}</button>
          : <button type="button" onClick={run} disabled={busy!==null}>{busy==="run"?(isPaused?"Resuming…":"Starting…"):"Run"}</button>}
      </div>
      <form action={upload} className="auth-form" style={{marginTop:18}}>
        <div style={{display:"grid",gridTemplateColumns:"minmax(180px,260px) 1fr",gap:12,alignItems:"end"}}>
          <label>Document category<select name="category" defaultValue="other"><option value="contract">Contract</option><option value="amendment">Amendment</option><option value="nda">NDA</option><option value="statement_of_work">Statement of Work</option><option value="client_brief">Client Brief</option><option value="brand_guidelines">Brand Guidelines</option><option value="research">Research</option><option value="analytics">Analytics</option><option value="financial">Financial</option><option value="creative_asset">Creative Asset</option><option value="technical_documentation">Technical Documentation</option><option value="report">Report</option><option value="other">Other</option></select></label>
          <label>Add project files<input name="files" type="file" multiple required accept=".pdf,.docx,.xlsx,.xls,.csv,.pptx,.txt,.png,.jpg,.jpeg,.webp"/></label>
        </div>
        <button disabled={busy!==null}>{busy==="upload"?"Uploading…":"Add to Project Knowledge"}</button>
      </form>
      {message?<p className="security-note" role="status">{message}</p>:null}
    </section>
    {showLiveOperations?<ProjectLiveOperations projectId={projectId} initialStatus={status} mode={liveMode}/>:null}
  </>;
}
