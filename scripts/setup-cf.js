const https = require('https');
const fs = require('fs');
const { execSync } = require('child_process');

function download(url, dest, callback) {
  https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      return download(res.headers.location, dest, callback);
    }
    const file = fs.createWriteStream(dest);
    res.pipe(file);
    file.on('finish', () => {
      file.close(callback);
    });
  }).on('error', (err) => {
    console.error('Download error:', err);
  });
}

console.log('Downloading CF CLI v8...');
download(
  'https://github.com/cloudfoundry/cli/releases/download/v8.19.0/cf8-cli_8.19.0_winx64.zip',
  'cf_portable.zip',
  () => {
    console.log('Downloaded cf_portable.zip. Extracting to bin...');
    if (!fs.existsSync('bin')) {
      fs.mkdirSync('bin', { recursive: true });
    }
    execSync('powershell -Command "Expand-Archive -Path cf_portable.zip -DestinationPath bin -Force"', { stdio: 'inherit' });
    fs.unlinkSync('cf_portable.zip');
    console.log('CF CLI installed successfully:');
    execSync('bin\\cf.exe version', { stdio: 'inherit' });
  }
);
