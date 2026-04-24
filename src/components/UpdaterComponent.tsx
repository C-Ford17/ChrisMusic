"use client";

import { useEffect, useState } from "react";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { CapacitorUpdater } from "@capgo/capacitor-updater";
import { SplashScreen } from "@capacitor/splash-screen";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// A fallback updater URL if nothing is provided.
const UPDATER_URL = "https://raw.githubusercontent.com/C-Ford17/ChrisMusic/main/updater.json";

function compareVersions(v1: string, v2: string): number {
  const clean = (v: string) => (v || "0").replace(/^v/, "").split('-')[0].split(".").map(n => parseInt(n, 10) || 0);
  const parts1 = clean(v1);
  const parts2 = clean(v2);
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
}

interface UpdateInfo {
  version: string;
  currentNative: string;
  currentWeb: string;
  notes: string;
  downloadUrl: string;
  type: 'tauri' | 'android-native' | 'android-ota';
  updateFn?: () => Promise<void>;
}

// Esta versión debe coincidir con la de package.json cada vez que hagas un build nativo
const APP_CODE_VERSION = "1.0.11";

export function UpdaterComponent() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");


  useEffect(() => {
    async function checkForUpdates(isManual = false, force = false) {
      try {
        if (isManual) toast.info(force ? "Forzando reinstalación..." : "Buscando actualizaciones...");
        const isTauri = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;

        if (isTauri) {
          // Tauri Desktop check
          const { check } = await import("@tauri-apps/plugin-updater");
          const update = await check();
          if (update) {
            setUpdateAvailable(true);
            setUpdateInfo({
              version: update.version,
              currentNative: "Desktop",
              currentWeb: "Desktop",
              notes: update.body || "Mejoras de rendimiento y UI.",
              downloadUrl: "",
              type: 'tauri',
              updateFn: async () => {
                await update.downloadAndInstall();
                const { relaunch } = await import("@tauri-apps/plugin-process");
                await relaunch();
              }
            });
          } else if (isManual) {
            toast.success("Estás en la última versión.");
          }
        } else if (Capacitor.isNativePlatform()) {
          // Capacitor Android check
          const appInfo = await App.getInfo();
          const nativeVersion = appInfo.version;

          // Add timestamp to bypass GitHub cache
          const response = await fetch(`${UPDATER_URL}?t=${Date.now()}`);
          const data = await response.json();

          if (data && data.android) {
            const androidData = data.android;
            
            // Prioridad de detección de versión actual:
            // 1. Memoria LocalStorage (si ya hubo una actualización OTA exitosa)
            // 2. APP_CODE_VERSION (la versión del código que estamos compilando)
            // 3. nativeVersion (lo que dice el APK)
            const savedWebVersion = localStorage.getItem('current_web_version');
            const currentWebVersion = savedWebVersion || APP_CODE_VERSION || nativeVersion;

            // 1. Check for Native Update (APK) - Usamos versión específica de Android
            console.log(`[Updater] Native: ${nativeVersion}, Server Native: ${androidData.version}`);
            if (androidData.version && nativeVersion && compareVersions(androidData.version, nativeVersion) > 0) {
              setUpdateAvailable(true);
              setUpdateInfo({
                version: androidData.version,
                currentNative: nativeVersion,
                currentWeb: currentWebVersion,
                notes: data.notes || "Nueva versión nativa disponible.",
                downloadUrl: androidData.url,
                type: 'android-native',
              });
              return;
            }

            // 2. Check for Web Update (OTA) via GitHub
            if (androidData.web_version && androidData.web_url) {
              if (force || compareVersions(androidData.web_version, currentWebVersion) > 0) {
                setUpdateAvailable(true);
                setUpdateInfo({
                  version: androidData.web_version,
                  currentNative: nativeVersion,
                  currentWeb: currentWebVersion,
                  notes: force ? "REINSTALAR: " + (data.notes || "") : (data.notes || "Nueva actualización de interfaz (OTA)."),
                  downloadUrl: androidData.web_url,
                  type: 'android-ota',
                });
                return;
              }
            }
            
            if (isManual) toast.success("Estás en la última versión.");
          }
        }
      } catch (error) {
        console.error("Failed to check for updates:", error);
        if (isManual) toast.error("Error al buscar actualizaciones.");
      }
    }

    // Listen for manual trigger
    const handleManualCheck = () => checkForUpdates(true);
    const handleForceCheck = () => checkForUpdates(true, true);
    
    window.addEventListener('check-for-updates', handleManualCheck);
    window.addEventListener('force-update-check', handleForceCheck);

    const timer = setTimeout(() => checkForUpdates(false), 3000);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('check-for-updates', handleManualCheck);
      window.removeEventListener('force-update-check', handleForceCheck);
    };
  }, []);

  const handleUpdate = async () => {
    if (!updateInfo) return;
    setIsUpdating(true);
    setDownloadProgress(0);

    try {
      if (updateInfo.type === 'tauri' && updateInfo.updateFn) {
        setStatusMessage("Descargando actualización...");
        await updateInfo.updateFn();
      } else if (updateInfo.type === 'android-ota') {
        setStatusMessage("Iniciando descarga...");
        
        const progressListener = await CapacitorUpdater.addListener('download', (data: any) => {
          if (data.percent) {
            setDownloadProgress(data.percent);
            setStatusMessage(`Descargando... ${data.percent}%`);
          }
        });

        try {
          const bundle = await CapacitorUpdater.download({
            url: updateInfo.downloadUrl,
            version: updateInfo.version,
          });

          setStatusMessage("Preparando archivos...");
          setDownloadProgress(100);

          // Guardar la versión en memoria antes de aplicar
          localStorage.setItem('current_web_version', updateInfo.version);

          setStatusMessage("Aplicando cambios...");
          
          // Activar Splash nativo solo brevemente para el reinicio real, 
          // pero el overlay de React ya habrá preparado al usuario.
          if (Capacitor.isNativePlatform()) {
             await SplashScreen.show({
              showDuration: 2000,
              autoHide: true
             });
          }
          
          await CapacitorUpdater.set({ id: bundle.id });
        } finally {
          progressListener.remove();
        }
      } else {
        // Android-Native (APK)
        setStatusMessage("Abriendo descarga de APK...");
        window.open(updateInfo.downloadUrl, "_system");
        setTimeout(() => setUpdateAvailable(false), 1000);
      }
    } catch (e: any) {
      toast.error(`Error: ${e.message}`);
      setIsUpdating(false);
      setStatusMessage("");
    }
  };

  return (
    <>
      <Dialog open={updateAvailable && !isUpdating} onOpenChange={setUpdateAvailable}>
        <DialogContent className="sm:max-w-[425px] rounded-2xl bg-zinc-900 border-zinc-800 text-white shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-2">
              {updateInfo?.type === 'android-ota' ? "Mejora de Interfaz" : "Actualización de App"}
            </DialogTitle>
            <DialogDescription className="text-zinc-400 mt-2">
              Versión <span className="font-bold text-white">{updateInfo?.version}</span> disponible.
              {updateInfo?.type === 'android-ota' && " (Instalación instantánea)"}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div className="bg-white/5 rounded-xl p-3 border border-white/5">
               <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-1">Tu versión actual</p>
               <div className="flex justify-between text-xs font-mono">
                  <span className="text-zinc-400">Nativa: {updateInfo?.currentNative}</span>
                  <span className="text-zinc-400">Web: {updateInfo?.currentWeb}</span>
               </div>
            </div>
            <p className="text-sm text-zinc-300">
              {updateInfo?.notes}
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="ghost"
              onClick={() => setUpdateAvailable(false)}
              className="text-zinc-400 hover:text-white hover:bg-zinc-800"
              disabled={isUpdating}
            >
              Más tarde
            </Button>
            <Button
              onClick={handleUpdate}
              className="bg-green-500 hover:bg-green-600 text-black font-semibold rounded-full px-6"
              disabled={isUpdating}
            >
              {updateInfo?.type === 'android-ota' || updateInfo?.type === 'tauri' 
                  ? "Actualizar Ahora" 
                  : "Descargar APK"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modern Update Overlay */}
      {isUpdating && (
        <div className="fixed inset-0 z-[9999] bg-black flex flex-col items-center justify-center p-8 animate-in fade-in duration-500">
          <div className="w-full max-w-xs space-y-8 text-center">
            <div className="relative mx-auto w-24 h-24">
              <div className="absolute inset-0 border-4 border-white/10 rounded-full"></div>
              <div 
                className="absolute inset-0 border-4 border-green-500 rounded-full border-t-transparent animate-spin"
                style={{ animationDuration: '1.5s' }}
              ></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xl font-bold text-white">{downloadProgress}%</span>
              </div>
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-bold text-white">Actualizando ChrisMusic</h2>
              <p className="text-zinc-400 text-sm animate-pulse">{statusMessage}</p>
            </div>

            <div className="relative w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div 
                className="absolute top-0 left-0 h-full bg-green-500 transition-all duration-300 ease-out"
                style={{ width: `${downloadProgress}%` }}
              ></div>
            </div>
            
            <p className="text-[10px] text-zinc-600 uppercase tracking-widest font-medium">
              No cierres la aplicación
            </p>
          </div>
        </div>
      )}
    </>
  );
}
