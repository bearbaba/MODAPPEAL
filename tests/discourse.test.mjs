import test from 'node:test';
import assert from 'node:assert/strict';
import {createDiscourseAdapter} from '../integrations/discourse.mjs';

const configure=fetchImpl=>createDiscourseAdapter({origin:'https://demo.forum.test/',apiKey:'test-secret',apiUsername:'system',fetchImpl});
test('hidden post is unhidden and read back as visible',async()=>{
  const post={raw:'Safe installation guide',version:3,hidden:true,deleted_at:null},methods=[];
  const api=configure(async(url,opts)=>{
    methods.push(opts.method+' '+new URL(url).pathname);
    if(opts.method==='PUT')post.hidden=false;
    return new Response(opts.method==='GET'?JSON.stringify(post):'',{status:200});
  });
  const result=await api.restore({postId:44,expectedRaw:'Safe installation guide',expectedVersion:3});
  assert.equal(result.verified,true);
  assert.deepEqual(methods,['GET /posts/44.json','GET /posts/44.json','PUT /posts/44/unhide.json','GET /posts/44.json']);
});
test('stale content cannot trigger a write',async()=>{
  let writes=0;
  const api=configure(async(_url,opts)=>{
    if(opts.method==='PUT')writes++;
    return new Response(JSON.stringify({raw:'new unrelated content',version:5,hidden:true}),{status:200});
  });
  await assert.rejects(api.restore({postId:8,expectedRaw:'old',expectedVersion:4}),{code:'STALE_POST'});
  assert.equal(writes,0);
});
test('deleted posts use recover route with readback',async()=>{
  const post={raw:'Technical walkthrough',version:2,hidden:false,deleted_at:'2026-11-01T00:00:00Z'},calls=[];
  const api=configure(async(url,opts)=>{
    calls.push(new URL(url).pathname);
    if(opts.method==='PUT')post.deleted_at=null;
    return new Response(opts.method==='GET'?JSON.stringify(post):'',{status:200});
  });
  assert.equal((await api.restore({postId:17,expectedRaw:'Technical walkthrough',expectedVersion:2})).verified,true);
  assert.ok(calls.includes('/posts/17/recover.json'));
});
test('incomplete readback is not reported as success',async()=>{
  const post={raw:'Guide',version:1,hidden:true,deleted_at:null};
  const api=configure(async(_url,opts)=>new Response(opts.method==='GET'?JSON.stringify(post):'',{status:200}));
  await assert.rejects(api.restore({postId:2,expectedRaw:'Guide',expectedVersion:1}),{code:'UNCONFIRMED_WRITE'});
});
