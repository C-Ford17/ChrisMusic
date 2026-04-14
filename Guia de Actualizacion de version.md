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
El archivo que subes a GitHub para avisar a todo el mundo. Ahora incluye versión para Android OTA.
*   **Archivo:** `updater.json`
*   **Campos:** 
    *   `"version": "1.0.2"` (Para cambios Nativos/Tauri)
    *   `"web_version": "1.0.2"` (Para cambios OTA/Interfaz)

### 7. Paquete de Interfaz OTA (`dist.zip`)
Si solo hiciste cambios en React/Next (sin tocar Rust o Gradle), puedes generar este archivo para una actualización instantánea.
*   **Comando:** `npm run build:zip`
*   **Resultado:** Archivo `dist.zip` en la raíz.

---

> [!IMPORTANT]
> **Flujo de Trabajo según el cambio:**
> 
> **A. Si es un cambio NATIVO (Escritorio, Audio Engine, Plugins):**
> 1. Actualiza los 6 puntos anteriores subiendo el número de versión (ej: `1.0.3`).
> 2. Genera el APK y el instalador de Windows.
> 3. Sube ambos a GitHub y actualiza `updater.json`.
> 
> **B. Si es un cambio Web (UI, CSS, Nuevas pantallas, PlayerStore):**
> 1. Solo actualiza `package.json` y `updater.json` (`version` y `web_version`).
> 2. Ejecuta `npm run build:zip`.
> 3. Sube el `dist.zip` a tu GitHub Release actual (o crea uno nuevo).
> 4. Los usuarios recibirán el aviso de "Actualización Web" y se instalará sin descargar un APK.

---

> [!TIP]
> **Live Reload (Desarrollo):** Para ver tus cambios al instante en el móvil, usa tu IP real en `capacitor.config.ts` (ej: `192.168.1.XX`). No uses `[IP_ADDRESS]` ni `localhost`.
