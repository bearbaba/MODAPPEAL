import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from '../server.mjs';

async function pilot(t) {
  const {server}=createServer();
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(()=>new Promise(r=>server.close(r)));
  const host='http://127.0.0.1:'+server.address().port;
  const api=async(path,role='author',body)=>{const response=await fetch(host+'/api/'+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json','x-demo-role':role},body:body===undefined?undefined:JSON.stringify(body)});return {code:response.status,data:await response.json()};};
  return api;
}
const open=api=>api('cases','author',{postId:'P100',author:'alice',appeal:'This guide is benign and educational'});
const freeze=async(api,id)=>{await api('cases/'+id+'/respond','moderator',{response:'Checked context and policy'});return api('cases/'+id+'/freeze','moderator',{});};
const decide=(api,id,outcome,quote)=>api('cases/'+id+'/decide','moderator',{outcome,quote,clause:'P1:',reason:'Matches the frozen material'});

test('two-party evidence and exact quotation, verified readback and no duplicate publication',async t=>{
  const api=await pilot(t);const c=(await open(api)).data;
  assert.equal((await api('cases/'+c.id+'/freeze','author',{})).code,403);
  assert.equal((await api('cases/'+c.id+'/execute','moderator',{})).code,409);
  assert.equal((await freeze(api,c.id)).data.status,'FROZEN');
  assert.equal((await decide(api,c.id,'RESTORE','fabricated quote')).code,422);
  assert.equal((await decide(api,c.id,'RESTORE','How to install')).data.status,'APPROVED');
  assert.equal((await api('cases/'+c.id+'/execute','moderator',{})).data.status,'RESTORED');
  const again=(await api('cases/'+c.id+'/execute','moderator',{})).data;
  assert.equal(again.post.hidden,0);assert.equal(again.post.version,2);
  assert.equal(again.events.filter(x=>x.action==='VERIFIED_PUBLICATION').length,1);
});

test('affiliate revision needs a new frozen digest and new decision',async t=>{
  const api=await pilot(t);const c=(await api('cases','author',{postId:'P200',author:'bob',appeal:'I will remove links'})).data;
  const frozen=(await freeze(api,c.id)).data;
  assert.equal((await decide(api,c.id,'ALLOW_REVISION','Affiliate link')).data.status,'REVISION_REQUIRED');
  assert.equal((await api('cases/'+c.id+'/revision','author',{content:'Visit https://example.com?ref=me'})).code,422);
  const revised=(await api('cases/'+c.id+'/revision','author',{content:'Self-host a community forum without referral links.'})).data;
  assert.notEqual(revised.digest,frozen.digest);
  assert.equal((await api('cases/'+c.id+'/execute','moderator',{})).code,409);
  assert.equal((await decide(api,c.id,'RESTORE','Self-host a community forum')).data.status,'APPROVED');
  assert.equal((await api('cases/'+c.id+'/execute','moderator',{})).data.post.hidden,0);
});

test('stale source blocks restoration, denial blocks execution',async t=>{
  const api=await pilot(t);const c=(await open(api)).data;await freeze(api,c.id);await decide(api,c.id,'RESTORE','How to install');
  await api('demo/posts/P100/change','moderator',{content:'Different newer moderation action'});
  const changed=(await api('cases/'+c.id+'/execute','moderator',{})).data;
  assert.equal(changed.status,'CONFLICT');assert.equal(changed.post.hidden,1);
  const other=(await open(api)).data;await freeze(api,other.id);await decide(api,other.id,'DENY','Different newer moderation action');
  assert.equal((await api('cases/'+other.id+'/execute','moderator',{})).code,409);
});
