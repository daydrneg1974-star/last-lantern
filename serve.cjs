/* Local test server without dependencies: node serve.cjs [port] [bind]
   Serves this folder with correct audio MIME types and no caching, for phone tests over Wi-Fi.
   Defaults: port 8006, all interfaces (0.0.0.0). Environment: LANTERN_PORT, LANTERN_BIND. */
'use strict';
const http=require('http'),fs=require('fs'),path=require('path'),os=require('os');
const root=__dirname,port=Number(process.argv[2]||process.env.LANTERN_PORT||8006),bind=process.argv[3]||process.env.LANTERN_BIND||'0.0.0.0';
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.cjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.m4a':'audio/mp4','.mp4':'audio/mp4','.ogg':'audio/ogg','.wav':'audio/wav','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.md':'text/plain; charset=utf-8','.txt':'text/plain; charset=utf-8','.ico':'image/x-icon'};
http.createServer((req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
    if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
    if(!file.startsWith(root+path.sep)&&file!==root){res.writeHead(403).end();return;}
    if(!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'}).end('404 '+url.pathname);return;}
    const size=fs.statSync(file).size,type=types[path.extname(file).toLowerCase()]||'application/octet-stream';
    res.writeHead(200,{'Content-Type':type,'Content-Length':size,'Cache-Control':'no-store','Accept-Ranges':'none'});
    if(req.method==='HEAD'){res.end();return;}
    fs.createReadStream(file).pipe(res);
    console.log(new Date().toLocaleTimeString(),req.socket.remoteAddress,req.method,url.pathname,size);
  }catch(error){res.writeHead(500).end();console.error(error);}
}).listen(port,bind,()=>{
  console.log(`Last Lantern test server: http://localhost:${port}/`);
  if(bind==='0.0.0.0'||bind==='::')for(const list of Object.values(os.networkInterfaces()))for(const net of list)if(net.family==='IPv4'&&!net.internal)console.log(`  on Wi-Fi/LAN:  http://${net.address}:${port}/   (phone)   http://${net.address}:${port}/?debug   (with overlay)`);
  console.log('Stop with Ctrl+C.');
});
