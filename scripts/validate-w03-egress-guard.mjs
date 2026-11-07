import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import './fixtures/w03-egress-guard.mjs';

const directory=mkdtempSync(join(tmpdir(),'w03-egress-'));
process.env.W03_EGRESS_LOG=join(directory,'blocked.jsonl');
const server=http.createServer((_req,res)=>res.end('W03_LOCAL_POSITIVE'));
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const own=await fetch('http://127.0.0.1:'+server.address().port);
 assert.equal(await own.text(),'W03_LOCAL_POSITIVE');
 await assert.rejects(()=>fetch('https://dezbacyuvsdrlpmmpjht.supabase.co/functions/v1/two-nya-push'),/W03_EXTERNAL_EGRESS_BLOCKED/);
 await assert.rejects(()=>fetch('https://api.openai.com/v1/responses'),/W03_EXTERNAL_EGRESS_BLOCKED/);
 assert.throws(()=>https.get('https://api.resend.com/emails'),/W03_EXTERNAL_EGRESS_BLOCKED/);
 const blocked=readFileSync(process.env.W03_EGRESS_LOG,'utf8').trim().split('\n').map(JSON.parse);
 assert.deepEqual(blocked.map(x=>x.host),['dezbacyuvsdrlpmmpjht.supabase.co','api.openai.com','api.resend.com']);
 assert.ok(blocked.every(x=>x.blocked));
 console.log('PASS W03 sandbox: localhost works; production Supabase, model API and email provider are blocked before network I/O.');
}finally{await new Promise(resolve=>server.close(resolve));delete process.env.W03_EGRESS_LOG;rmSync(directory,{recursive:true,force:true});}
