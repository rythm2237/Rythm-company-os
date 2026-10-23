"use client";
import {useEffect} from "react";
/** Open the linked native disclosure without removing its keyboard behavior. */
export function CrmAnchorDetails(){
 useEffect(()=>{
  const open=()=>{if(location.hash==="#add-customer"){const target=document.getElementById("add-customer");if(target instanceof HTMLDetailsElement){target.open=true;target.scrollIntoView({block:"start"});}}};
  open();window.addEventListener("hashchange",open);return()=>window.removeEventListener("hashchange",open);
 },[]);
 return null;
}
