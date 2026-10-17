const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const files = { '/': ['index.html','text/html; charset=utf-8'], '/index.html': ['index.html','text/html; charset=utf-8'], '/report.js': ['report.js','text/javascript; charset=utf-8'], '/ui.js': ['ui.js','text/javascript; charset=utf-8'], '/style.css': ['style.css','text/css; charset=utf-8'] };
http.createServer((req,res) => {
  const pathname=new URL(req.url, 'http://localhost').pathname;
  const file = ['/client-common.js','/expenses-report.js','/expenses-ui.js'].includes(pathname)?[pathname.slice(1),'text/javascript; charset=utf-8']:files[pathname];
  if (!file) { res.writeHead(404); res.end('Not found'); return; }
  res.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-store' });
  const content=fs.readFileSync(path.join(__dirname,file[0]));
  res.end(file[0]==='index.html'?content.toString('utf8').replace('<script defer src="session-ui.js"></script>','').replace('<script defer src="backup-ui.js"></script>','').replace('<script defer src="workflow-ui.js"></script>','').replace('<script defer src="direct-ui.js"></script>','').replace('<script defer src="choices-ui.js"></script>',''):content);
}).listen(4317, '127.0.0.1', () => console.log('Local: http://127.0.0.1:4317'));
