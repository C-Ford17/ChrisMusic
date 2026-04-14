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
const APP_CODE_VERSION = "1.0.5";

export function UpdaterComponent() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    async function checkForUpdates(isManual = false) {
      try {
        if (isManual) toast.info("Buscando actualizaciones...");
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

          if (data && data.platforms?.android) {
            const androidData = data.platforms.android;
            
            // Prioridad de detección de versión actual:
            // 1. Memoria LocalStorage (si ya hubo una actualización OTA exitosa)
            // 2. APP_CODE_VERSION (la versión del código que estamos compilando)
            // 3. nativeVersion (lo que dice el APK)
            const savedWebVersion = localStorage.getItem('current_web_version');
            const currentWebVersion = savedWebVersion || APP_CODE_VERSION || nativeVersion;

            // 1. Check for Native Update (APK) - Priority
            if (compareVersions(data.version, nativeVersion) > 0) {
              setUpdateAvailable(true);
              setUpdateInfo({
                version: data.version,
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
              if (compareVersions(androidData.web_version, currentWebVersion) > 0) {
                setUpdateAvailable(true);
                setUpdateInfo({
                  version: androidData.web_version,
                  currentNative: nativeVersion,
                  currentWeb: currentWebVersion,
                  notes: data.notes || "Nueva actualización de interfaz (OTA).",
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
    window.addEventListener('check-for-updates', handleManualCheck);

    const timer = setTimeout(() => checkForUpdates(false), 3000);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('check-for-updates', handleManualCheck);
    };
  }, []);

  const handleUpdate = async () => {
    if (!updateInfo) return;
    setIsUpdating(true);

    try {
      if (updateInfo.type === 'tauri' && updateInfo.updateFn) {
        toast.info("Descargando actualización...");
        await updateInfo.updateFn();
      } else if (updateInfo.type === 'android-ota') {
        toast.info("Descargando interfaz web...");
        
        const bundle = await CapacitorUpdater.download({
          url: updateInfo.downloadUrl,
          version: updateInfo.version,
        });

        // Guardar la versión en memoria antes de aplicar
        localStorage.setItem('current_web_version', updateInfo.version);

        toast.success("¡Interfaz actualizada! Reiniciando...");
        
        // Activar Splash nativo para ocultar el recargo de archivos
        if (Capacitor.isNativePlatform()) {
           await SplashScreen.show({
            showDuration: 5000,
            autoHide: true
           });
        }
        
        await CapacitorUpdater.set({ id: bundle.id });
      } else {
        // Android-Native (APK)
        toast.info("Abriendo descarga de APK...");
        window.open(updateInfo.downloadUrl, "_system");
        setTimeout(() => setUpdateAvailable(false), 1000);
      }
    } catch (e: any) {
      toast.error(`Error: ${e.message}`);
      setIsUpdating(false);
    }
  };

  return (
    <Dialog open={updateAvailable} onOpenChange={setUpdateAvailable}>
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
            {isUpdating ? "Cargando..." : (updateInfo?.type === 'android-ota' ? "Actualizar Ahora" : "Descargar APK")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
