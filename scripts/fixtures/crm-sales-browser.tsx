import React from "react";
import {createRoot} from "react-dom/client";
import {PipelineBoard} from "../../app/(app)/crm/pipeline/pipeline-board";
import {CustomerFields} from "../../app/(app)/crm/customer-fields";
import {CrmNav} from "../../app/(app)/crm/crm-nav";
const stages=[{code:"qualified",name:"Qualified",probability:25,is_closed:false,is_won:false},{code:"proposal",name:"Proposal",probability:50,is_closed:false,is_won:false},{code:"won",name:"Won",probability:100,is_closed:true,is_won:true},{code:"lost",name:"Lost",probability:0,is_closed:true,is_won:false}];
const opportunity={id:"fixture",account_id:"customer",name:"Example delivery",stage_code:"qualified",value:1200,currency:"EUR",probability:25,version:1,expected_close_date:"2026-11-15",owner_user_id:null,lost_reason:null};
const readonly=new URLSearchParams(location.search).has("readonly");
createRoot(document.getElementById("root")!).render(<main className="command-shell crm-shell"><header className="command-header"><div><p className="eyebrow">Isolated component test</p><h1>Sales pipeline</h1></div></header><CrmNav active="/crm/pipeline"/><section className="panel"><PipelineBoard stages={stages} opportunities={[opportunity]} writableIds={readonly?[]:[opportunity.id]} onTransition={async(o,stage,reason)=>{const result=await fetch("/transition",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:o.id,version:o.version,stage,reason})});if(!result.ok)throw Error();}}/></section><section className="panel"><h2>Customer profile</h2><form className="auth-form"><CustomerFields customer={{name:"Example Company",email:"hello@example.test",custom_fields:{region:"Europe"}}}/><button className="primary-button">Save customer</button></form></section></main>);
