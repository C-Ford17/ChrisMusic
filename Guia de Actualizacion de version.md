# Guía de Actualización de Versión (ChrisMusic)

Para que el sistema de actualizaciones detecte correctamente que ya estás en la nueva versión y deje de pedirte descargar la misma, debes sincronizar el número de versión en **6 lugares clave** antes de generar tus archivos (.apk o .msi).

### 1. Web & Lógica (`package.json`)
Es la base del proyecto Node/Next.js.
*   **Archivo:** `package.json`
*   **Campo:** `"version": "1.0.1"`

### 2. Interfaz Visual (Ajustes)
Es lo que el usuario lee en la pantalla de la app. Si no lo cambias, aunque la app sea la nueva, el texto dirá la vieja.
*   **Archivo:** `src/app/settings/page.tsx`
*   **Línea aprox 582:** `<p ...>Versión 1.0.1-stable</p>`

### 3. Sistema Android (`build.gradle`)
**¡Este es el más importante para el aviso de actualización!** Capacitor lee la versión de aquí. Si GitHub dice `1.0.1` pero aquí dice `1.0`, la app pensará que es vieja.
*   **Archivo:** `android/app/build.gradle`
*   **Línea 10 (versionCode):** `2` (Debe ser un número entero que sube siempre: 1, 2, 3...)
*   **Línea 11 (versionName):** `"1.0.1"` (Debe coincidir exactamente con el JSON de GitHub)

### 4. Escritorio - Configuración Tauri (`tauri.conf.json`)
Controla la versión del instalador de Windows.
*   **Archivo:** `src-tauri/tauri.conf.json`
*   **Campo:** `"version": "1.0.1"`

### 5. Escritorio - Compilador Rust (`Cargo.toml`)
Es la versión interna del binario de Rust.
*   **Archivo:** `src-tauri/Cargo.toml`
*   **Campo:** `version = "1.0.1"`

### 6. El Manifiesto Público (`updater.json`)
El archivo que subes a GitHub para avisar a todo el mundo.
*   **Archivo:** `updater.json` (En la raíz de tu repo de GitHub)
*   **Campo:** `"version": "1.0.1"`

---

> [!IMPORTANT]
> **Orden Recomendado:**
> 1. Modifica los 5 archivos locales (1 al 5).
> 2. Genera el APK y el instalador MSI/EXE.
> 3. Súbelos a GitHub Releases.
> 4. Actualiza el `updater.json` en GitHub con la nueva versión y los nuevos links.
