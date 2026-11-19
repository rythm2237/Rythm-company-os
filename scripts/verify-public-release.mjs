import {readFileSync} from 'node:fs';

const expected=process.env.RELEASE_SHA;
if(!/^[a-f0-9]{40}$/.test(expected||''))throw new Error('RELEASE_SHA must identify the exact merged commit');
const html=readFileSync(process.argv[2],'utf8');
const observed=html.match(/data-public-build="([a-f0-9]{40})"/)?.[1];
console.log(`Public build: ${observed||'not available'}; expected: ${expected}`);
process.exit(observed===expected?0:1);
