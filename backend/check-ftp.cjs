const ftp = require('basic-ftp');
async function test() {
  const client = new ftp.Client();
  try {
    await client.access({ host: 'ftp.hermes33.webd.pl', port: 21, user: 'lenka@hermes33.webd.pl', password: 'S)t;=&@?9X%*', secure: false });
    console.log('=== Checking api.lenaparty.pl ===');
    try {
      const list = await client.list('/home/hermes33/public_html/api.lenaparty.pl');
      list.forEach(f => console.log((f.type === 2 ? 'd' : 'f') + ' ' + f.name + ' ' + f.size));
    } catch(e) { console.log('Not found: ' + e.message); }
    console.log('=== Checking public_html ===');
    const list2 = await client.list('/home/hermes33/public_html');
    list2.forEach(f => console.log((f.type === 2 ? 'd' : 'f') + ' ' + f.name));
  } catch(e) { console.error('Error:', e.message); }
  finally { client.close(); }
}
test();
