"use client";
import {useMemo,useState} from "react";
import {createCustomerIntegration} from "./customer-actions";
type Provider={provider_key:string;display_name:string;setup_availability?:string};
export function CustomerIntegrationForm({providers,projectId,projectName,initialProviderKey}:{providers:Provider[];projectId?:string;projectName?:string;initialProviderKey?:string}){
  const initialKey=providers.some(item=>item.provider_key===initialProviderKey)?initialProviderKey:providers[0]?.provider_key??"";
  const [providerKey,setProviderKey]=useState(initialKey??"");
  const provider=useMemo(()=>providers.find(item=>item.provider_key===providerKey),[providers,providerKey]);
  const suggested=projectName&&provider?`${projectName} — ${provider.display_name}`:provider?.display_name??"";
  const [name,setName]=useState(suggested);
  const [custom,setCustom]=useState(false);
  function select(value:string){setProviderKey(value);const next=providers.find(item=>item.provider_key===value);if(!custom)setName(projectName&&next?`${projectName} — ${next.display_name}`:next?.display_name??"");}
  return <form action={createCustomerIntegration} className="stacked-form integration-simple-form"><label>Service<select data-guide-target="provider" name="providerKey" required value={providerKey} onChange={event=>select(event.target.value)}>{providers.map(item=><option key={item.provider_key} value={item.provider_key} disabled={item.setup_availability==="coming_later"}>{item.display_name}{item.setup_availability==="coming_later"?" — Coming later":item.setup_availability==="setup_available"?" — Setup available":""}</option>)}</select></label><label>Connection name<input data-guide-target="display-name" name="displayName" value={name} onChange={event=>{setName(event.target.value);setCustom(true);}} required/></label>{custom?<button className="secondary-button" type="button" onClick={()=>{setName(suggested);setCustom(false);}}>Reset suggested name</button>:null}{projectId?<input type="hidden" name="projectId" value={projectId}/>:null}<button data-guide-target="start-setup" className="primary-button" type="submit">Continue to secure setup</button></form>;
}
