const fs = require('fs');
const path = require('path');

async function packageApp() {
  const sourceDir = path.resolve(__dirname, '..', 'app', 'webapp');
  const targetDir = path.resolve(__dirname, '..', 'gen', 'app');
  const zipPath = path.join(targetDir, 'comfsoftzpmmaintenancecockpit.zip');

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  console.log(`Packaging ${sourceDir} -> ${zipPath}...`);

  let archiver;
  try {
    archiver = require('archiver');
  } catch (e) {
    // If archiver not installed, fallback to powershell or child_process
  }

  if (archiver) {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    return new Promise((resolve, reject) => {
      output.on('close', () => {
        console.log(`Successfully created UI5 package: ${zipPath} (${(archive.pointer() / 1024).toFixed(1)} KB)`);
        resolve();
      });
      archive.on('error', (err) => reject(err));
      archive.pipe(output);
      archive.directory(sourceDir, false);
      archive.finalize();
    });
  } else {
    // Fallback: Use PowerShell Compress-Archive on Windows or zip on Linux
    const { execSync } = require('child_process');
    if (process.platform === 'win32') {
      execSync(`powershell -Command "Compress-Archive -Path '${sourceDir}\\*' -DestinationPath '${zipPath}' -Force"`);
    } else {
      execSync(`cd "${sourceDir}" && zip -r "${zipPath}" ./*`);
    }
    console.log(`Successfully created UI5 package via system zip: ${zipPath}`);
  }
}

packageApp().catch((err) => {
  console.error('Error packaging UI5 app:', err);
  process.exit(1);
});
