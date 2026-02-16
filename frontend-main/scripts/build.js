const fs = require('fs').promises;
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'public');

async function copyDir(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const name = entry.name;
    if (name === 'node_modules' || name === '.git' || name === 'public' || name === 'scripts') continue;
    const srcPath = path.join(src, name);
    const destPath = path.join(dest, name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else if (entry.isFile()) {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

async function writeConfig() {
  const backend = process.env.BACKEND_URL || 'https://evans-backend.onrender.com';
  const content = `window.__BACKEND_URL='${backend}'`;
  await fs.writeFile(path.join(OUT, 'config.js'), content, 'utf8');
}

async function build() {
  try {
    await copyDir(ROOT, OUT);
    await writeConfig();
    console.log('Built public/ with config.js');
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  }
}

build();
