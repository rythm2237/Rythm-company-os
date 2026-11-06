import {appendFileSync} from 'node:fs';
import http from 'node:http';
import https from 'node:https';

// Applied only to the disposable staging Next process, never to production.
const allowed=new Set(['localhost','127.0.0.1','::1','viqjdgohtxqkrdgwtull.supabase.co']);
function check(value){
 const url=value instanceof URL?value:new URL(typeof value==='string'?value:value.url);
 if(allowed.has(url.hostname))return;
 if(process.env.W03_EGRESS_LOG)appendFileSync(process.env.W03_EGRESS_LOG,JSON.stringify({host:url.hostname,blocked:true})+'\n');
 throw Error('W03_EXTERNAL_EGRESS_BLOCKED');
}
const original=globalThis.fetch;
globalThis.fetch=function(input,init){check(input);return original.call(this,input,init);};
for(const [client,protocol] of [[http,'http:'],[https,'https:']]){
 const request=client.request,get=client.get;
 const inspect=args=>{const a=args[0];check(typeof a==='string'||a instanceof URL?a:new URL(`${a.protocol??protocol}//${a.hostname??a.host??'localhost'}${a.path??'/'}`));};
 client.request=function(...args){inspect(args);return request.apply(this,args);};
 client.get=function(...args){inspect(args);return get.apply(this,args);};
}
