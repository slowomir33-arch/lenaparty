const ftp = require('basic-ftp');
const path = require('path');
const fs = require('fs');

async function uploadPHP() {
  const client = new ftp.Client();
  client.ftp.verbose = true;
  
  try {
    await client.access({
      host: 'ftp.hermes33.webd.pl',
      port: 21,
      user: 'lenka@hermes33.webd.pl',
      password: 'S)t;=&@?9X%*',
      secure: false
    });
    
    const remotePath = '/home/hermes33/public_html/api.lenaparty.pl';
    
    console.log('=== Uploading PHP backend ===');
    
    // Upload PHP files
    const phpDir = path.join(__dirname, 'php');
    const files = ['config.php', 'helpers.php', 'index.php', 'router.php', '.htaccess'];
    
    for (const file of files) {
      const localPath = path.join(phpDir, file);
      if (fs.existsSync(localPath)) {
        console.log(`Uploading ${file}...`);
        await client.uploadFrom(localPath, `${remotePath}/${file}`);
        console.log(`✓ ${file} uploaded`);
      }
    }
    
    // Ensure directories exist
    console.log('Creating directories...');
    try { await client.ensureDir(`${remotePath}/uploads/albums`); } catch(e) {}
    try { await client.ensureDir(`${remotePath}/uploads/thumbnails`); } catch(e) {}
    try { await client.ensureDir(`${remotePath}/data`); } catch(e) {}
    
    // Upload albums.json if not exists
    const albumsJson = path.join(__dirname, 'data', 'albums.json');
    try {
      await client.size(`${remotePath}/data/albums.json`);
      console.log('albums.json already exists, skipping');
    } catch(e) {
      if (fs.existsSync(albumsJson)) {
        await client.uploadFrom(albumsJson, `${remotePath}/data/albums.json`);
        console.log('✓ albums.json uploaded');
      } else {
        // Create empty albums.json
        const tmpPath = path.join(__dirname, 'albums_tmp.json');
        fs.writeFileSync(tmpPath, JSON.stringify({ albums: [] }, null, 2));
        await client.uploadFrom(tmpPath, `${remotePath}/data/albums.json`);
        fs.unlinkSync(tmpPath);
        console.log('✓ albums.json created');
      }
    }
    
    console.log('\n=== Upload complete! ===');
    console.log('Test: https://api.lenaparty.pl/api/health');
    
  } catch(e) {
    console.error('Error:', e.message);
  } finally {
    client.close();
  }
}

uploadPHP();
