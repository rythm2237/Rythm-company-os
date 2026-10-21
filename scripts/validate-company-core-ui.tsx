import assert from 'node:assert/strict';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';
import CustomerForm from '../app/customer-forms/[token]/customer-form';
async function main(){
 const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'https://example.test/customer-forms/synthetic',pretendToBeVisual:true});
 Object.assign(globalThis,{React,window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,IS_REACT_ACT_ENVIRONMENT:true});
 const {createRoot}=await import('react-dom/client');
 const originalFetch=globalThis.fetch;
 try{
 for(const template of ['ready_ai_advertising_agency_v1','ready_software_company_v1','ready_web_development_company_v1']){
  const questions=[{id:'scope',question:`${template}: scope`,input_type:'select',options:['Yes','No'],materiality:'required'},{id:'channels',question:'Select requirements',input_type:'multi_choice',options:['A','B'],materiality:'required'},{id:'detail',question:'Conditional detail',input_type:'text',options:[],materiality:'optional',condition:{questionId:'scope',equals:'Yes'}}];
  let saved={questions,answers:{scope:'No',channels:['A'],detail:'Preserved previous valid answer'},revision:0,status:'draft',language:'en'};
  const writes:Array<Record<string,unknown>>=[];
  globalThis.fetch=(async(_url:unknown,init?:RequestInit)=>{
   if(init?.method==='POST'){const body=JSON.parse(String(init.body));writes.push(body);assert.equal(body.revision,saved.revision);saved={...saved,answers:body.answers,revision:saved.revision+1,status:body.submit?'submitted':'draft'};return Response.json({ok:true,revision:saved.revision,errors:[],submitted:body.submit});}
   return Response.json({ok:true,form:saved});
  }) as typeof fetch;
  const container=document.getElementById('root')!;let root=createRoot(container);
  await act(async()=>root.render(<CustomerForm token="synthetic"/>));
  assert.equal(container.querySelectorAll('textarea').length,0,'conditional fields start hidden');
  const select=container.querySelector('select')!;
  await act(async()=>{select.value='Yes';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
  assert.equal(container.querySelectorAll('textarea').length,1,'conditional answer reveals only relevant input');
  assert.equal(container.querySelector('textarea')!.value,'Preserved previous valid answer');
  const second=container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[1];
  await act(async()=>second.click());
  const draft=Array.from(container.querySelectorAll('button')).find(b=>b.textContent==='Save draft')!;
  await act(async()=>{draft.click();draft.click();});
  assert.equal(writes.length,1,'double-click issues exactly one draft write');
  assert.deepEqual((writes[0].answers as Record<string,unknown>).channels,['A','B']);
  assert.match(container.querySelector('[role="status"]')!.textContent!,/Draft saved/);
  await act(async()=>root.unmount());root=createRoot(container);
  await act(async()=>root.render(<CustomerForm token="synthetic"/>));
  assert.equal(container.querySelector('textarea')!.value,'Preserved previous valid answer','saved draft resumes');
  const submit=container.querySelector('button[type="submit"]')!;
  await act(async()=>{submit.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));submit.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));});
  assert.equal(writes.length,2,'double submission remains one mutation');
  assert.equal(container.querySelector('form'),null);
  assert.match(container.querySelector('[role="status"]')!.textContent!,/submitted for review/);
  await act(async()=>root.unmount());
 }
 }finally{globalThis.fetch=originalFetch;dom.window.close();}
 console.log('Company core UI: all three template identifiers passed synthetic conditional controls, multi-choice, preserved answers, draft resume and duplicate submission checks. JSDOM + mocked HTTP; not browser/live-email verification.');
}
main().catch(error=>{console.error(error);process.exit(1);});
