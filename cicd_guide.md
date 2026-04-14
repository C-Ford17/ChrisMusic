# 🚀 Guía CI/CD — ChrisMusic GitHub Actions

Tienes configurados **dos workflows** que automatizan todo el proceso de publicación.

## 📋 Resumen de Workflows

| Workflow | Archivo | Se activa con | Qué hace |
|---|---|---|---|
| **OTA Web** | `release-ota.yml` | Tag tipo `1.0.5` | Compila Next.js y sube `dist.zip` al Release |
| **Android Nativo** | `release-android.yml` | Tag tipo `native-1.0.2` | Compila APK firmado y lo sube al Release |

---

## 🌐 1. Publicar una actualización de Interfaz (OTA)

### Cuándo usarlo
Cuando hagas cambios solo en el frontend (TSX, CSS, lógica de React). **No requiere reinstalar la app.**

### Pasos
```powershell
# 1. Editar updater.json: subir web_version y web_url al nuevo tag
# 2. Editar UpdaterComponent.tsx: subir APP_CODE_VERSION
# 3. Commit de los cambios
git add -A
git commit -m "feat: descripcion del cambio"
git push

# 4. Crear el tag (sin 'v', ej: 1.0.6)
git tag 1.0.6
git push origin 1.0.6
```
GitHub Actions compilará automáticamente y creará el Release con el `dist.zip` incluido. ✅

---

## 🤖 2. Publicar un APK Nativo de Android

### Cuándo usarlo
Cuando hagas cambios en:
- Carpeta `android/` (Java/Kotlin)
- Plugins de Capacitor
- `capacitor.config.ts`
- Versión de `versionCode` o `versionName` en `build.gradle`

### Prerequisito: Configurar Secretos en GitHub

Antes de que el workflow de Android funcione, debes añadir estos **4 secretos** en tu repositorio:

> **GitHub → Settings → Secrets and variables → Actions → New repository secret**

| Nombre del Secreto | Descripción |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | Tu archivo `.jks` convertido a Base64 |
| `ANDROID_KEYSTORE_PASSWORD` | Contraseña del keystore |
| `ANDROID_KEY_ALIAS` | Alias de la clave (ej: `key0`) |
| `ANDROID_KEY_PASSWORD` | Contraseña de la clave |

#### Cómo obtener el Base64 del keystore
```powershell
# En PowerShell, desde la carpeta donde está tu .jks
[Convert]::ToBase64String([IO.File]::ReadAllBytes("tu-keystore.jks")) | clip
# Esto copia el Base64 al portapapeles para que lo pegues en el secreto
```

### Pasos para publicar APK
```powershell
# 1. Actualizar versionCode y versionName en android/app/build.gradle
# 2. Commit de los cambios
git add -A
git commit -m "feat(native): descripcion del cambio nativo"
git push

# 3. Crear el tag nativo
git tag native-1.0.3
git push origin native-1.0.3
```
GitHub Actions compilará el APK firmado y lo subirá al Release automáticamente. ✅

---

> [!NOTE]
> Los dos workflows son completamente independientes. Puedes tener un Release OTA (`1.0.6`) y un Release Nativo (`native-1.0.3`) al mismo tiempo, cada uno con sus propios assets.

> [!IMPORTANT]
> El `updater.json` **siempre debe estar actualizado** antes de crear el tag OTA para que la app sepa a qué URL apuntar para descargar el `dist.zip`.

> [!TIP]
> Si el workflow de Android falla por el keystore, verifica que el Base64 sea correcto ejecutando localmente `./gradlew assembleRelease` dentro de la carpeta `android/` para confirmar que `keystore.properties` funciona.
