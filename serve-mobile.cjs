const fs=require('fs'),path=require('path'),http=require('http');
const root=path.join(__dirname,'test-build'),port=Number(process.env.LANTERN_PORT||8005),host=process.env.LANTERN_BIND||'127.0.0.1';
http.createServer((req,res)=>{try{
 const u=new URL(req.url,'http://localhost'),local=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
 if(u.pathname==='/audit.js'&&local){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(__dirname,'audit-mobile.js')));return;}
 if(u.pathname==='/audio-diagnostic.js'){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(__dirname,'audio-diagnostic.js')));return;}
 const f=path.resolve(root,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));
 if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){res.writeHead(404).end();return;}
 let b=fs.readFileSync(f);if(local&&f.endsWith('index.html')&&u.searchParams.has('audit'))b=Buffer.from(b.toString().replace('<body>','<body><script src="audit.js"></script>'));
 if(f.endsWith('index.html')&&u.searchParams.has('audio-debug'))b=Buffer.from(b.toString().replace('<body>','<body><script src="audio-diagnostic.js"></script>'));
 res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.ogg':'audio/ogg','.wav':'audio/wav'})[path.extname(f)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');
 if(f.startsWith(path.join(root,'assets/audio')+path.sep))res.on('finish',()=>console.log('AUDIO_HTTP',req.socket.remoteAddress,path.basename(f),'sent',b.length,'bytes'));
 res.end(b);
 }catch{res.writeHead(400).end();}
}).listen(port,host,()=>console.log(`Mobile test server http://${host}:${port}/`));
