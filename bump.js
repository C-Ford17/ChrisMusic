const fs = require('fs');
const path = require('path');

const newVersion = process.argv[2];
const args = process.argv.slice(3);

const isAll = args.includes('--all') || args.length === 0;
const isOta = isAll || args.includes('--ota');
const isTauri = isAll || args.includes('--tauri');
const isNative = isAll || args.includes('--native');

if (!newVersion) {
  console.error('❌ Uso: node bump.js <version> [--ota] [--tauri] [--native] [--all]');
  process.exit(1);
}

const files = {
  package: path.join(__dirname, 'package.json'),
  tauri: path.join(__dirname, 'src-tauri', 'tauri.conf.json'),
  updater: path.join(__dirname, 'updater.json'),
  component: path.join(__dirname, 'src', 'components', 'UpdaterComponent.tsx'),
  gradle: path.join(__dirname, 'android', 'app', 'build.gradle')
};

console.log(`\n🔄 Iniciando BUMP a v${newVersion}...\n`);

try {
  // 1. OTA / WEB
  if (isOta) {
    const pkg = JSON.parse(fs.readFileSync(files.package, 'utf8'));
    pkg.version = newVersion;
    fs.writeFileSync(files.package, JSON.stringify(pkg, null, 2));

    let component = fs.readFileSync(files.component, 'utf8');
    component = component.replace(/const APP_CODE_VERSION = ".*";/, `const APP_CODE_VERSION = "${newVersion}";`);
    fs.writeFileSync(files.component, component);

    const upd = JSON.parse(fs.readFileSync(files.updater, 'utf8'));
    upd.platforms.android.web_version = newVersion;
    upd.platforms.android.web_url = `https://github.com/C-Ford17/ChrisMusic/releases/download/${newVersion}/dist.zip`;
    fs.writeFileSync(files.updater, JSON.stringify(upd, null, 2));
    console.log('✅ Archivos OTA actualidazos (package.json, UpdaterComponent, updater.json)');
  }

  // 2. TAURI (WINDOWS)
  if (isTauri) {
    const tauri = JSON.parse(fs.readFileSync(files.tauri, 'utf8'));
    tauri.version = newVersion;
    fs.writeFileSync(files.tauri, JSON.stringify(tauri, null, 2));

    const upd = JSON.parse(fs.readFileSync(files.updater, 'utf8'));
    upd.version = newVersion; // Root version (exclusiva para Tauri)
    upd.platforms['windows-x86_64'].url = `https://github.com/C-Ford17/ChrisMusic/releases/download/tauri-${newVersion}/ChrisMusic_${newVersion}_x64-setup.exe`;
    fs.writeFileSync(files.updater, JSON.stringify(upd, null, 2));
    console.log('✅ Archivos TAURI actualizados');
  }

  // 3. ANDROID NATIVE (APK)
  if (isNative) {
    let gradle = fs.readFileSync(files.gradle, 'utf8');
    gradle = gradle.replace(/versionCode (\d+)/, (match, p1) => `versionCode ${parseInt(p1) + 1}`);
    gradle = gradle.replace(/versionName ".*"/, `versionName "${newVersion}"`);
    fs.writeFileSync(files.gradle, gradle);

    const upd = JSON.parse(fs.readFileSync(files.updater, 'utf8'));
    upd.platforms.android.version = newVersion; // Versión nativa específica de Android
    upd.platforms.android.url = `https://github.com/C-Ford17/ChrisMusic/releases/download/native-${newVersion}/app-release.apk`;
    fs.writeFileSync(files.updater, JSON.stringify(upd, null, 2));
    console.log('✅ Archivos NATIVE actualizados');
  }

  console.log(`\n🚀 ¡LISTO! v${newVersion} aplicada.`);
  console.log(`\nSugerencia de tags:`);
  if (isOta) console.log(`- git tag ${newVersion} (OTA)`);
  if (isTauri) console.log(`- git tag tauri-${newVersion} (Tauri)`);
  if (isNative) console.log(`- git tag native-${newVersion} (Native)`);

} catch (err) {
  console.error('❌ Error fatal:', err);
}
