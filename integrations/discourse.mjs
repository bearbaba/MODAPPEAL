// Discourse integration boundary. Do NOT call from the local fixture API without
// real wallet/operator authorization and a finalized GenLayer decision.
const failure=(code,message)=>Object.assign(new Error(message),{code});
export function createDiscourseAdapter({origin,apiKey,apiUsername,fetchImpl=fetch}) {
  const url=new URL(origin);
  if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)
    throw failure('CONFIG','A clean HTTPS Discourse origin is required');
  if(!apiKey||!apiUsername)throw failure('CONFIG','Discourse API credentials required');
  const idOf=value=>{
    const s=String(value);
    if(!/^[1-9]\d{0,12}$/.test(s))throw failure('INVALID_POST','Numeric Discourse post ID required');
    return s;
  };
  async function request(method,path,payload) {
    const headers={'Api-Key':apiKey,'Api-Username':apiUsername,'Accept':'application/json'};
    if(payload){headers['Content-Type']='application/json';}
    const response=await fetchImpl(url.origin+path,{method,headers,body:payload?JSON.stringify(payload):undefined,redirect:'error'});
    if(!response.ok)throw failure('DISCOURSE_HTTP_'+response.status,'Discourse '+method+' '+path+' returned '+response.status);
    const data=await response.text();
    return data?JSON.parse(data):null;
  }
  async function getPost(id){
    const item=await request('GET','/posts/'+idOf(id)+'.json');
    if(!item||typeof item.raw!=='string'||!Number.isInteger(item.version))
      throw failure('INCOMPLETE_POST','Discourse did not return raw text and version');
    return {id:Number(id),raw:item.raw,version:item.version,hidden:item.hidden===true,deletedAt:item.deleted_at||null};
  }
  // The pre-write version check is best-effort; Discourse does not provide
  // a compare-and-swap revision guard on recover/unhide. Never promise atomicity.
  async function restore({postId,expectedRaw,expectedVersion,revision=null}) {
    const id=idOf(postId);
    const current=await getPost(id);
    if(current.raw!==expectedRaw||current.version!==expectedVersion)
      throw failure('STALE_POST','Post was edited since evidence snapshot; adjudicate again');
    if(!current.hidden&&!current.deletedAt)
      return {verified:true,alreadyVisible:true,post:current};
    let desired=current.raw;
    if(revision!==null) {
      if(typeof revision!=='string'||!revision.trim())throw failure('INVALID_REVISION','Nonempty revision required');
      desired=revision;
      await request('PUT','/posts/'+id+'.json',{post:{raw:revision}});
      const edited=await getPost(id);
      if(edited.raw!==desired)throw failure('UNCONFIRMED_WRITE','Revision readback differs; do not blindly retry');
    }
    const latest=await getPost(id);
    if(latest.raw!==desired)throw failure('CONFLICT','Post changed during publication');
    if(latest.deletedAt)await request('PUT','/posts/'+id+'/recover.json');
    else if(latest.hidden)await request('PUT','/posts/'+id+'/unhide.json');
    const after=await getPost(id);
    if(after.hidden||after.deletedAt||after.raw!==desired)
      throw failure('UNCONFIRMED_WRITE','Publication readback failed; reconcile before retry');
    return {verified:true,alreadyVisible:false,post:after};
  }
  return {getPost,restore};
}
