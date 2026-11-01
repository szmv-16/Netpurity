const http=require('http'),fs=require('fs'),path=require('path');
const root=process.argv[2];
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'};
http.createServer((req,res)=>{
  let p=decodeURIComponent(req.url.split('?')[0]);
  if(p==='/')p='/index.html';
  const f=path.join(root,p);
  fs.readFile(f,(e,d)=>{
    if(e){res.writeHead(404);res.end('nf');return}
    res.writeHead(200,{'content-type':types[path.extname(f)]||'application/octet-stream'});
    res.end(d);
  });
}).listen(5178,'127.0.0.1',()=>console.log('preview server on 5178 root='+root));
