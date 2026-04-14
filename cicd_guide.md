# 🚀 Guía CI/CD — ChrisMusic GitHub Actions

Tienes configurados **tres workflows** que automatizan todo el proceso de publicación.

## 📋 Resumen de Workflows

| Workflow | Archivo | Tag de activación | Qué produce |
|---|---|---|---|
| **OTA Web** | `release-ota.yml` | `1.0.6` (sin prefijo) | `dist.zip` para actualización en vivo |
| **Android Nativo** | `release-android.yml` | `native-1.0.3` | `app-release.apk` firmado |
| **Tauri Desktop** | `release-tauri.yml` | `tauri-1.0.2` | Instalador `.exe` para Windows |

---

## 🗂️ Qué cambiar en `updater.json` según el tipo de release

```json
{
  "version": "1.0.2",          // ← Cambiar solo si publicas APK nativo
  "platforms": {
    "android": {
      "url": "...native-1.0.2/app-release.apk",  // ← Cambiar solo si publicas APK nativo
      "web_version": "1.0.6",                     // ← Cambiar solo si publicas OTA web
      "web_url": "...1.0.6/dist.zip"              // ← Cambiar solo si publicas OTA web
    }
  }
}
```

---

## 🌐 1. Publicar actualización de Interfaz (OTA Web)

### Qué cambiar antes del tag
- `updater.json`: subir `web_version` y `web_url` (usar el tag sin prefijo)
- `UpdaterComponent.tsx`: subir `APP_CODE_VERSION`
- `package.json`: subir `version`

```powershell
git add -A
git commit -m "feat: descripcion del cambio"
git push

git tag 1.0.7
git push origin 1.0.7
```
GitHub Actions crea el Release y sube el `dist.zip` automáticamente. ✅

---

## 🤖 2. Publicar APK Nativo de Android

### Qué cambiar antes del tag
- `updater.json`: subir `"version"` raíz y `"url"` del APK (usar tag con prefijo `native-`)
- `android/app/build.gradle`: subir `versionCode` y `versionName`

```powershell
git add -A
git commit -m "feat(native): descripcion del cambio nativo"
git push

git tag native-1.0.3
git push origin native-1.0.3
```
GitHub Actions compila y sube el APK firmado automáticamente. ✅

### Secretos necesarios en GitHub
| Secreto | Descripción |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | Keystore `.jks` en Base64 |
| `ANDROID_KEYSTORE_PASSWORD` | Contraseña del keystore |
| `ANDROID_KEY_ALIAS` | Alias de la clave |
| `ANDROID_KEY_PASSWORD` | Contraseña de la clave |

---

## 🖥️ 3. Publicar versión de Escritorio (Tauri/Windows)

### Qué cambiar antes del tag
- `src-tauri/tauri.conf.json`: subir `"version"`

```powershell
git add -A
git commit -m "feat(desktop): descripcion del cambio"
git push

git tag tauri-1.0.2
git push origin tauri-1.0.2
```
GitHub Actions compila el instalador `.exe` automáticamente. ✅

### Secretos necesarios en GitHub
| Secreto | Descripción |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | Clave privada para firmar la app |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Contraseña de esa clave |

---

> [!IMPORTANT]
> Los tres sistemas de release son completamente **independientes**. Puedes tener la web en `1.0.7`, el APK nativo en `native-1.0.2` y Tauri en `tauri-1.0.1` sin conflicto.

> [!TIP]
> Para volver a disparar un workflow después de un fix, borra y recrea el tag:
> ```powershell
> git tag -d 1.0.7 ; git push origin :refs/tags/1.0.7
> git tag 1.0.7 ; git push origin 1.0.7
> ```
