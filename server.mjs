import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const policy = 'P1: Educational technical guides are permitted, but affiliate links must be removed before republication.';
const digest = text => createHash('sha256').update(text).digest('hex');
const fault = (status, message) => Object.assign(new Error(message), {status});
const required = (text, name) => {
  if (typeof text !== 'string' || !text.trim() || text.length > 4000) throw fault(400,name+' must be nonempty and under 4000 characters');
  return text.trim();
};
const check = (actual, expected) => { if(actual!==expected) throw fault(403, expected+' role required'); };
const statusIs = (c, statuses) => { if(!statuses.includes(c.status)) throw fault(409,'Invalid state '+c.status); };

export function createDomain(path=':memory:') {
  if(path!==':memory:') mkdirSync(dirname(resolve(path)),{recursive:true});
  const db=new DatabaseSync(path);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON');
  db.exec('CREATE TABLE IF NOT EXISTS posts(id TEXT PRIMARY KEY, author TEXT NOT NULL, content TEXT NOT NULL, hidden INTEGER NOT NULL, version INTEGER NOT NULL)');
  db.exec('CREATE TABLE IF NOT EXISTS cases(id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES posts(id), author TEXT NOT NULL, appeal TEXT NOT NULL, response TEXT, status TEXT NOT NULL, snapshot TEXT, digest TEXT, source_version INTEGER, revision TEXT, decision TEXT, clause TEXT, quote TEXT, reason TEXT, updated TEXT NOT NULL)');
  db.exec('CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT, case_id TEXT, action TEXT NOT NULL, data TEXT NOT NULL, time TEXT NOT NULL)');
  db.exec('CREATE TABLE IF NOT EXISTS executions(case_id TEXT PRIMARY KEY REFERENCES cases(id), op_key TEXT UNIQUE NOT NULL, verified INTEGER NOT NULL)');
  if(db.prepare('SELECT COUNT(*) n FROM posts').get().n===0) {
    db.prepare('INSERT INTO posts VALUES(?,?,?,?,?)').run('P100','alice','How to install a self-custody wallet without exposing your recovery phrase.',1,1);
    db.prepare('INSERT INTO posts VALUES(?,?,?,?,?)').run('P200','bob','Self-host a community forum. Affiliate link: https://shop.example/dock?ref=bob',1,1);
  }
  const findPost=id=>db.prepare('SELECT * FROM posts WHERE id=?').get(id);
  const find=id=>db.prepare('SELECT * FROM cases WHERE id=?').get(id);
  const note=(id,action,data)=>db.prepare('INSERT INTO events(case_id,action,data,time) VALUES(?,?,?,?)').run(id,action,JSON.stringify(data),new Date().toISOString());
  const set=(id,props)=>db.prepare('UPDATE cases SET '+Object.keys(props).map(k=>k+'=?').join(',')+',updated=? WHERE id=?').run(...Object.values(props),new Date().toISOString(),id);
  const tx=fn=>{db.exec('BEGIN IMMEDIATE');try{const v=fn();db.exec('COMMIT');return v;}catch(e){db.exec('ROLLBACK');throw e;}};
  const view=id=>{const c=find(id);if(!c)throw fault(404,'Case not found');return {...c,post:findPost(c.post_id),events:db.prepare('SELECT * FROM events WHERE case_id=? ORDER BY id').all(id)};};
  const snapshot=(c,revision)=>{const p=findPost(c.post_id);return JSON.stringify({post_id:p.id,post_content:p.content,post_version:p.version,author:p.author,context:'public technical help forum',policy_version:'pilot-v1',policy,appeal:c.appeal,moderator_response:c.response,revision:revision||null});};
  const list=()=>({mode:'LOCAL_FIXTURE_ONLY',policy,posts:db.prepare('SELECT * FROM posts ORDER BY id').all(),cases:db.prepare('SELECT id,post_id,author,status,decision,digest,updated FROM cases ORDER BY updated DESC').all()});
  function create(role,data) {
    check(role,'author');
    const p=findPost(required(data.postId,'postId'));
    if(!p)throw fault(404,'Post not found');
    if(!p.hidden)throw fault(409,'Post already visible');
    if(p.author!==data.author)throw fault(403,'Only original author can appeal');
    const appeal=required(data.appeal,'appeal');
    return tx(()=>{const id=randomUUID();db.prepare('INSERT INTO cases(id,post_id,author,appeal,status,updated) VALUES(?,?,?,?,?,?)').run(id,p.id,p.author,appeal,'OPEN',new Date().toISOString());note(id,'APPEAL_OPENED',{post_id:p.id,source_version:p.version});return view(id);});
  }
  function act(id,role,operation,data={}) {
    return tx(()=>{
      const c=find(id);if(!c)throw fault(404,'Case not found');
      if(operation==='respond') {
        check(role,'moderator');statusIs(c,['OPEN']);
        set(id,{response:required(data.response,'response')});note(id,'RESPONSE_RECORDED',{role});
      } else if(operation==='freeze') {
        check(role,'moderator');statusIs(c,['OPEN']);
        if(!c.response)throw fault(409,'Moderator must respond before freeze');
        const frozen=snapshot(c);
        set(id,{snapshot:frozen,digest:digest(frozen),source_version:findPost(c.post_id).version,status:'FROZEN'});
        note(id,'FROZEN',{sha256:digest(frozen)});
      } else if(operation==='decide') {
        check(role,'moderator');statusIs(c,['FROZEN','REVISION_SUBMITTED']);
        const outcome=required(data.outcome,'outcome');
        if(!['RESTORE','ALLOW_REVISION','DENY'].includes(outcome))throw fault(400,'Unsupported decision');
        if(c.status==='REVISION_SUBMITTED' && outcome==='ALLOW_REVISION')throw fault(409,'Revision needs a final decision');
        const clause=required(data.clause,'clause'),quote=required(data.quote,'quote'),reason=required(data.reason,'reason');
        if(!policy.includes(clause))throw fault(422,'Policy clause does not exist');
        if(!c.snapshot.includes(quote))throw fault(422,'Quoted evidence not present in frozen snapshot');
        set(id,{decision:outcome,clause,quote,reason,status:outcome==='RESTORE'?'APPROVED':outcome==='DENY'?'DENIED':'REVISION_REQUIRED'});
        note(id,'MANUAL_FIXTURE_DECISION',{outcome,clause,quote,reason,snapshot_sha256:c.digest});
      } else if(operation==='revision') {
        check(role,'author');statusIs(c,['REVISION_REQUIRED']);
        const revision=required(data.content,'content');
        if(/https?:\/\/\S*(?:[?&](?:ref|aff|affiliate|tag)=|\/ref\/)|affiliate\s+link/i.test(revision))throw fault(422,'Affiliate/referral link remains');
        const frozen=snapshot(c,revision);
        set(id,{revision,snapshot:frozen,digest:digest(frozen),status:'REVISION_SUBMITTED',decision:null,clause:null,quote:null,reason:null});
        note(id,'REVISION_FROZEN',{sha256:digest(frozen)});
      } else if(operation==='execute') {
        check(role,'moderator');
        if(c.status==='RESTORED')return view(id);
        statusIs(c,['APPROVED']);
        const p=findPost(c.post_id);
        if(p.version!==c.source_version || !p.hidden) {
          set(id,{status:'CONFLICT'});note(id,'STALE_VERSION',{expected:c.source_version,actual:p.version});return view(id);
        }
        const content=c.revision||p.content;
        db.prepare('INSERT OR IGNORE INTO executions VALUES(?,?,?)').run(id,'publish:'+id,0);
        const changed=db.prepare('UPDATE posts SET content=?,hidden=0,version=version+1 WHERE id=? AND version=? AND hidden=1').run(content,p.id,p.version);
        if(changed.changes!==1)throw fault(409,'Concurrent publication conflict');
        const after=findPost(p.id);
        if(after.hidden || after.content!==content)throw fault(503,'Readback not confirmed');
        db.prepare('UPDATE executions SET verified=1 WHERE case_id=?').run(id);
        set(id,{status:'RESTORED'});note(id,'VERIFIED_PUBLICATION',{post_id:p.id,visible:true,version:after.version});
      } else throw fault(404,'Unknown operation');
      return view(id);
    });
  }
  function simulate(id,role,data) {
    check(role,'moderator');required(data.content,'content');
    return tx(()=>{if(!findPost(id))throw fault(404,'No post');db.prepare('UPDATE posts SET content=?,version=version+1 WHERE id=?').run(data.content,id);return findPost(id);});
  }
  return {db,list,view,create,act,simulate};
}

export function createServer(options={}) {
  const domain=createDomain(options.dbPath||':memory:');
  const index=readFileSync(new URL('./ui/index.html',import.meta.url));
  const server=http.createServer(async(req,res)=>{
    function reply(code,obj){res.writeHead(code,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(obj));}
    try{
      const path=new URL(req.url,'http://localhost').pathname,role=req.headers['x-demo-role'];
      if(req.method==='GET'&&path==='/'){res.writeHead(200,{'content-type':'text/html; charset=utf-8','content-security-policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'"});return res.end(index);}
      if(req.method==='GET'&&path==='/api/state')return reply(200,domain.list());
      const match=path.match(/^\/api\/cases\/([^/]+)(?:\/(respond|freeze|decide|revision|execute))?$/);
      if(req.method==='GET'&&match&&!match[2])return reply(200,domain.view(match[1]));
      if(req.method!=='POST')return reply(404,{error:'Not found'});
      let total=0,chunks=[];
      for await (const part of req){total+=part.length;if(total>20000)throw fault(413,'Body too large');chunks.push(part);}
      let body;try{body=JSON.parse(Buffer.concat(chunks).toString()||'{}');}catch{throw fault(400,'Invalid JSON');}
      if(path==='/api/cases')return reply(201,domain.create(role,body));
      if(match&&match[2])return reply(200,domain.act(match[1],role,match[2],body));
      const edit=path.match(/^\/api\/demo\/posts\/(P\d+)\/change$/);
      if(edit)return reply(200,domain.simulate(edit[1],role,body));
      return reply(404,{error:'Not found'});
    }catch(e){return reply(e.status||500,{error:e.message});}
  });
  server.on('close',()=>domain.db.close());
  return {server,domain};
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if((process.env.APP_MODE||'demo')!=='demo')throw Error('Live mode disabled until wallet and chain verification exist');
  const port=Number(process.env.PORT||4100);
  const {server}=createServer({dbPath:process.env.DB_PATH||'data/modappeal.sqlite'});
  server.listen(port,'127.0.0.1',()=>console.log('MODAPPEAL LOCAL FIXTURE ONLY: http://127.0.0.1:'+port));
}
