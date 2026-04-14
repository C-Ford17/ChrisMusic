const fs = require('fs');
const path = require('path');

const newVersion = process.argv[2];

if (!newVersion) {
  console.error('❌ Por favor especifica la nueva versión. Ej: node bump.js 1.0.8');
  process.exit(1);
}

const files = {
  package: path.join(__dirname, 'package.json'),
  tauri: path.join(__dirname, 'src-tauri', 'tauri.conf.json'),
  updater: path.join(__dirname, 'updater.json'),
  component: path.join(__dirname, 'src', 'components', 'UpdaterComponent.tsx')
};

try {
  // 1. Update package.json
  const pkg = JSON.parse(fs.readFileSync(files.package, 'utf8'));
  pkg.version = newVersion;
  fs.writeFileSync(files.package, JSON.stringify(pkg, null, 2));
  console.log('✅ package.json actualizado');

  // 2. Update tauri.conf.json
  const tauri = JSON.parse(fs.readFileSync(files.tauri, 'utf8'));
  tauri.version = newVersion;
  fs.writeFileSync(files.tauri, JSON.stringify(tauri, null, 2));
  console.log('✅ tauri.conf.json actualizado');

  // 3. Update updater.json
  const upd = JSON.parse(fs.readFileSync(files.updater, 'utf8'));
  upd.version = newVersion; // Root version (used by Tauri)
  upd.notes = `v${newVersion}: Actualización de interfaz y mejoras generales`;
  upd.platforms.android.web_version = newVersion;
  upd.platforms.android.web_url = `https://github.com/C-Ford17/ChrisMusic/releases/download/${newVersion}/dist.zip`;
  upd.platforms['windows-x86_64'].url = `https://github.com/C-Ford17/ChrisMusic/releases/download/tauri-${newVersion}/ChrisMusic_${newVersion}_x64-setup.exe`;
  fs.writeFileSync(files.updater, JSON.stringify(upd, null, 2));
  console.log('✅ updater.json actualizado');

  // 4. Update UpdaterComponent.tsx
  let component = fs.readFileSync(files.component, 'utf8');
  component = component.replace(/const APP_CODE_VERSION = ".*";/, `const APP_CODE_VERSION = "${newVersion}";`);
  fs.writeFileSync(files.component, component);
  console.log('✅ UpdaterComponent.tsx actualizado');

  console.log(`\n🚀 ¡LISTO! Versión ${newVersion} aplicada en todos los archivos.`);
  console.log(`\nPróximos pasos:`);
  console.log(`1. git add -A ; git commit -m "chore: bump version to ${newVersion}" ; git push`);
  console.log(`2. git tag ${newVersion} ; git push origin ${newVersion}`);
  console.log(`3. git tag tauri-${newVersion} ; git push origin tauri-${newVersion}`);

} catch (err) {
  console.error('❌ Error actualizando archivos:', err);
}
