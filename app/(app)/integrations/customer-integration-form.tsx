"use client";
import {useMemo,useState} from "react";
import {canStartProviderSetup,initialSetupProvider,providerAvailabilityLabel} from "@/lib/integrations/connections/availability";
import {createCustomerIntegration} from "./customer-actions";
type Provider={provider_key:string;display_name:string;setup_availability?:string|null};
export function CustomerIntegrationForm({providers,projectId,projectName,initialProviderKey}:{providers:Provider[];projectId?:string;projectName?:string;initialProviderKey?:string}){
  const initialKey=initialSetupProvider(providers,initialProviderKey)?.provider_key??"";
  const [providerKey,setProviderKey]=useState(initialKey??"");
  const provider=useMemo(()=>providers.find(item=>item.provider_key===providerKey),[providers,providerKey]);
  const suggested=projectName&&provider?`${projectName} — ${provider.display_name}`:provider?.display_name??"";
  const [name,setName]=useState(suggested);
  const [custom,setCustom]=useState(false);
  function select(value:string){setProviderKey(value);const next=providers.find(item=>item.provider_key===value);if(!custom)setName(projectName&&next?`${projectName} — ${next.display_name}`:next?.display_name??"");}
  return <form action={createCustomerIntegration} className="stacked-form integration-simple-form"><label>Service<select data-guide-target="provider" name="providerKey" required value={providerKey} onChange={event=>select(event.target.value)}>{providers.map(item=><option key={item.provider_key} value={item.provider_key} disabled={!canStartProviderSetup(item)}>{item.display_name}{` — ${providerAvailabilityLabel(item)}`}</option>)}</select></label><label>Connection name<input data-guide-target="display-name" name="displayName" value={name} onChange={event=>{setName(event.target.value);setCustom(true);}} required/></label>{custom?<button className="secondary-button" type="button" onClick={()=>{setName(suggested);setCustom(false);}}>Reset suggested name</button>:null}{projectId?<input type="hidden" name="projectId" value={projectId}/>:null}<button data-guide-target="start-setup" className="primary-button" type="submit" disabled={!provider||!canStartProviderSetup(provider)}>Continue to secure setup</button></form>;
}
