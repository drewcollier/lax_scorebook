// Serves Code.gs (running on the mock Google services) over HTTP, like a
// deployed Apps Script web app. Usage: node mock_script_server.js <port> <Code.gs path>
const http = require('http');
const { makeEnv, seedLiveWorkbook } = require('./gas_mock');
const [port, codePath] = [Number(process.argv[2]), process.argv[3]];
let env = seedLiveWorkbook(makeEnv({ codePath }));

function send(res, out) {
  if (out.kind === 'html') {
    // Like Apps Script HtmlService output: no CORS header, so fetch() can't read it.
    res.writeHead(200, { 'Content-Type': 'text/html' });
  } else {
    res.writeHead(200, { 'Content-Type': out.mime, 'Access-Control-Allow-Origin': '*' });
  }
  res.end(out.content);
}

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/__state') { // test hook: dump the workbook
    const dump = {};
    Object.keys(env.sheets).forEach((n) => (dump[n] = env.sheets[n].getDataRange().getValues()));
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify(dump));
  }
  if (u.pathname === '/__mail') { // test hook: emails "sent" by the script
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify(env.mail));
  }
  if (u.pathname === '/__run') { // test hook: run a line of script code (e.g. approve a viewer)
    let src = ''; req.on('data', (c) => (src += c));
    return req.on('end', () => {
      let out; try { out = JSON.stringify(require('vm').runInContext(src, env.ctx)); } catch (e) { out = JSON.stringify({ error: e.message }); }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(out || 'null');
    });
  }
  if (u.pathname === '/__reset') { env = seedLiveWorkbook(makeEnv({ codePath })); res.writeHead(200, { 'Access-Control-Allow-Origin': '*' }); return res.end('ok'); }
  const parameter = {}; u.searchParams.forEach((v, k) => (parameter[k] = v));
  if (req.method === 'GET') return send(res, env.ctx.doGet({ parameter }));
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const ct = req.headers['content-type'] || '';
    if (ct.indexOf('application/x-www-form-urlencoded') === 0) {
      new URLSearchParams(body).forEach((v, k) => (parameter[k] = v));
    }
    send(res, env.ctx.doPost({ parameter, postData: { contents: body, type: ct } }));
  });
}).listen(port, () => console.log('mock script on ' + port));
