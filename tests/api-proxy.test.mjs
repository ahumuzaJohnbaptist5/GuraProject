import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

test('web proxy forwards auth bodies, Origin, cookies, status and Set-Cookie', async () => {
  const api = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    assert.equal(req.url, '/api/auth/login');
    assert.equal(req.method, 'POST');
    assert.equal(req.headers.origin, 'https://gura-web-bkid.onrender.com');
    assert.equal(req.headers.cookie, 'gura_session=old');
    assert.deepEqual(JSON.parse(body), { email: 'test@example.com', password: 'test-only' });
    res.writeHead(201, { 'Content-Type': 'application/json', 'Set-Cookie': 'gura_session=new; HttpOnly; Secure; SameSite=Lax; Path=/' });
    res.end(JSON.stringify({ user: { id: 'test' } }));
  });
  api.listen(0, '127.0.0.1'); await once(api, 'listening');
  const web = spawn(process.execPath, ['deploy-server.mjs'], { env: { ...process.env, PORT: '0', API_URL: `http://127.0.0.1:${api.address().port}` }, stdio: ['ignore', 'pipe', 'inherit'] });
  // Discover the ephemeral port from the listening message.
  try {
    let output = ''; for await (const chunk of web.stdout) { output += chunk; if (output.includes('port')) break; }
    const port = /port (\d+)/.exec(output)[1];
    const response = await fetch(`http://127.0.0.1:${port}/api/auth/login`, { method: 'POST', headers: { Origin: 'https://gura-web-bkid.onrender.com', Cookie: 'gura_session=old', 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'test@example.com', password: 'test-only' }) });
    assert.equal(response.status, 201);
    assert.match(response.headers.get('set-cookie'), /gura_session=new/);
    assert.deepEqual(await response.json(), { user: { id: 'test' } });
    await new Promise(resolve => api.close(resolve));
    const unavailable = await fetch(`http://127.0.0.1:${port}/api/auth/me`);
    assert.equal(unavailable.status, 502);
    assert.match((await unavailable.json()).error, /unavailable/);
  } finally { web.kill(); api.closeAllConnections(); api.close(); }
});
