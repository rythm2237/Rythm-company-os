import assert from "node:assert/strict";
import { runAgentDetailed } from "../lib/ai/agent-provider";
import { routeLegacyRequest } from "../lib/ai/legacy-adaptive-router";
async function main(){
 const originalFetch=globalThis.fetch;
 const originalKey=process.env.OPENAI_API_KEY;
 const originalBase=process.env.OPENAI_BASE_URL;
 process.env.OPENAI_API_KEY="sk-synthetic-no-provider-access";
 process.env.OPENAI_BASE_URL="https://w10-provider-fixture.invalid/v1";
 let captured:Record<string,unknown>={};
 globalThis.fetch=async(input,init)=>{
   const request=new Request(input,init);
   assert.equal(new URL(request.url).origin,"https://w10-provider-fixture.invalid");
   captured=JSON.parse(await request.text());
   return new Response(JSON.stringify({id:"synthetic",object:"response",model:captured.model,output_text:"Synthetic adapter output",output:[{type:"message",role:"assistant",content:[{type:"output_text",text:"Synthetic adapter output",annotations:[]}]}],usage:{input_tokens:10,output_tokens:5}}),{status:200,headers:{"content-type":"application/json"}});
 };
 try {
   for(const model of ["gpt-4.1-mini","gpt-4o","gpt-5.6-terra"]){
     const decision={...routeLegacyRequest({prompt:"Reply with a short internal note"}),selectedProvider:"openai" as const,selectedModel:model,reasoningLevel:"medium" as const,allowEscalation:false};
     const result=await runAgentDetailed({systemInstructions:"Synthetic test",prompt:"Reply briefly",authoritativeDecision:decision,maxOutputTokens:16,timeoutMs:5000});
     assert.equal(result.outputText,"Synthetic adapter output");
     assert.equal(captured.store,false);
     assert.equal(captured.max_output_tokens,16);
     if(model.startsWith("gpt-4")) assert.equal(captured.reasoning,undefined);
     else assert.deepEqual(captured.reasoning,{effort:"medium"});
   }
 } finally {
   globalThis.fetch=originalFetch;
   if(originalKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=originalKey;
   if(originalBase===undefined)delete process.env.OPENAI_BASE_URL;else process.env.OPENAI_BASE_URL=originalBase;
 }
 console.log("PASS W10 provider compatibility: real SDK payload omits unsupported GPT-4 reasoning, preserves reasoning models and output/storage limits; no provider network call");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
