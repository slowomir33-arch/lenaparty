const https = require('https');
const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
const albumName = 'Test Upload ' + Date.now();

const pngData = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0xF8, 0xFF, 0xFF, 0x3F, 0x00, 0x05, 0xFE, 0x02, 0xFE, 0xDC, 0xCC, 0x59, 0xE7, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82]);

const body = '--' + boundary + '\r\nContent-Disposition: form-data; name="albumName"\r\n\r\n' + albumName + '\r\n--' + boundary + '\r\nContent-Disposition: form-data; name="photos"; filename="test.png"\r\nContent-Type: image/png\r\n\r\n';
const bodyEnd = '\r\n--' + boundary + '--\r\n';
const fullBody = Buffer.concat([Buffer.from(body), pngData, Buffer.from(bodyEnd)]);

const options = {
  hostname: 'api.lenaparty.pl',
  port: 443,
  path: '/api/upload',
  method: 'POST',
  headers: {
    'Content-Type': 'multipart/form-data; boundary=' + boundary,
    'Content-Length': fullBody.length
  }
};

console.log('Testing upload to https://api.lenaparty.pl/api/upload...');

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', data);
  });
});

req.on('error', (e) => {
  console.error('Error:', e.message);
});

req.write(fullBody);
req.end();
