import http from 'http';
const req = http.request('http://localhost:3000/api/auth/signup', { method: 'POST', headers: {'Content-Type': 'application/json'} }, (res) => {
  let chunks = '';
  res.on('data', d => chunks += d);
  res.on('end', () => console.log('RESPONSE:', chunks.substring(0, 50)));
});
req.write(JSON.stringify({ userId: 'test', password: 'password', role: 'doctor', name: 'Test', email: 'test@example.com' }));
req.end();
