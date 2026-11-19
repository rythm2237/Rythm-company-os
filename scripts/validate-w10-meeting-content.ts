import assert from 'node:assert/strict';
import {readableMeetingMessage} from '../lib/meetings/message-content';
const summary='Review "CTR" using synthetic inputs.\nNo external action occurred.';
const input=JSON.stringify({executive_summary:summary,decision:'Finalize internal draft',risks:['Synthetic data only'],action_items:[{title:'Final document',description:'Calculate CTR',owner_agent_id:'internal-id',needs_approval:false}]});
const text=readableMeetingMessage(input);
assert.ok(text.includes(summary));assert.ok(text.includes('Proposed decision\nFinalize internal draft'));assert.ok(text.includes('Suggested follow-up work\n- Final document — Calculate CTR'));assert.ok(!text.includes('needs_approval'));assert.ok(!text.includes('internal-id'));assert.ok(!text.includes('executive_summary'));
for(const value of ['Human CEO plain message','{broken','["legacy"]','{"unknown":"keep legacy record"}'])assert.equal(readableMeetingMessage(value),value);
assert.equal(readableMeetingMessage(JSON.stringify({position:'<script>literal text</script>'})),'Position\n<script>literal text</script>','Formatting keeps text, never interprets HTML');
console.log('PASS W10 readable meeting content: exact persisted quotes/newlines, advisory decision labels, no model approval/ID authority, legacy fallback and literal text');
