const {spawn}=require('node:child_process');
const net=require('node:net');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function freePort(){
 const listener=net.createServer();
 await new Promise((resolve,reject)=>{listener.once('error',reject);listener.listen(0,'127.0.0.1',resolve);});
 const port=listener.address().port;
 await new Promise(resolve=>listener.close(resolve));return port;
}
function run(file,args,env){return new Promise((resolve,reject)=>{
 const child=spawn(process.execPath,[file,...args],{cwd:root,env,stdio:'inherit'});
 child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error(file+' exited '+code)));
});}
(async()=>{
 for(const name of ['looks','refinement','revision2','sky-navigation'])fs.mkdirSync(path.join(root,'artifacts',name),{recursive:true});
 const port=await freePort(),base='http://127.0.0.1:'+port;
 const env={...process.env,PORT:String(port),PREVIEW_URL:base};
 const server=spawn(process.env.PYTHON||'python',['server.py'],{cwd:root,env,stdio:['ignore','ignore','ignore']});
 let launchError;server.once('error',error=>{launchError=error;});
 try{
  let ready=false;
  for(let i=0;i<80;i++){
   if(launchError)throw launchError;
   if(server.exitCode!==null)throw Error('Preview server exited before becoming ready');
   try{const response=await fetch(base+'/index.html',{signal:AbortSignal.timeout(1000)});if(response.ok){ready=true;break;}}catch{}
   await delay(100);
  }
  if(!ready)throw Error('Preview server failed to start');
  for(const [file,args] of [['discoveries.cjs',[]],['eggs.cjs',['--browser']],['extended.cjs',[]],['revision2.cjs',[]],['sky-navigation.cjs',[]],['looks.cjs',[]],['gallery.cjs',[]]]){
   await run(path.join('tests',file),args,env);
  }
  console.log('PASS all public demo checks');
 }finally{server.kill();}
})().catch(error=>{console.error(error);process.exitCode=1;});
