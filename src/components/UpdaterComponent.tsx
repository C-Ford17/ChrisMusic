"use client";

import { useEffect, useState } from "react";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { CapacitorUpdater } from "@capgo/capacitor-updater";
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
  const parts1 = v1.replace("v", "").split(".").map(Number);
  const parts2 = v2.replace("v", "").split(".").map(Number);
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
  notes: string;
  downloadUrl: string;
  type: 'tauri' | 'android-native' | 'android-ota';
  updateFn?: () => Promise<void>;
}

export function UpdaterComponent() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    async function checkForUpdates() {
      try {
        const isTauri = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;

        if (isTauri) {
          // Tauri Desktop check
          const { check } = await import("@tauri-apps/plugin-updater");
          const update = await check();
          if (update) {
            setUpdateAvailable(true);
            setUpdateInfo({
              version: update.version,
              notes: update.body || "Mejoras de rendimiento y UI.",
              downloadUrl: "",
              type: 'tauri',
              updateFn: async () => {
                await update.downloadAndInstall();
                const { relaunch } = await import("@tauri-apps/plugin-process");
                await relaunch();
              }
            });
          }
        } else if (Capacitor.isNativePlatform()) {
          // Capacitor Android check
          const appInfo = await App.getInfo();
          const nativeVersion = appInfo.version;

          const response = await fetch(UPDATER_URL);
          const data = await response.json();

          if (data && data.platforms?.android) {
            const androidData = data.platforms.android;

            // 1. Check for Native Update (APK) - Priority
            if (compareVersions(data.version, nativeVersion) > 0) {
              setUpdateAvailable(true);
              setUpdateInfo({
                version: data.version,
                notes: data.notes || "Nueva versión nativa disponible.",
                downloadUrl: androidData.url,
                type: 'android-native',
              });
              return;
            }

            // 2. Check for Web Update (OTA) via Capgo
            if (androidData.web_version && androidData.web_url) {
              const currentWeb = await CapacitorUpdater.getLatest();
              // If there is no currentWeb.version, we use the build version as baseline
              const currentWebVersion = currentWeb.version || nativeVersion;

              if (compareVersions(androidData.web_version, currentWebVersion) > 0) {
                setUpdateAvailable(true);
                setUpdateInfo({
                  version: androidData.web_version,
                  notes: data.notes || "Actualización de interfaz disponible.",
                  downloadUrl: androidData.web_url,
                  type: 'android-ota',
                });
              }
            }
          }
        }
      } catch (error) {
        console.error("Failed to check for updates:", error);
      }
    }

    const timer = setTimeout(checkForUpdates, 3000);
    return () => clearTimeout(timer);
  }, []);

  const handleUpdate = async () => {
    if (!updateInfo) return;
    setIsUpdating(true);

    try {
      if (updateInfo.type === 'tauri' && updateInfo.updateFn) {
        toast.info("Descargando actualización...");
        await updateInfo.updateFn();
      } else if (updateInfo.type === 'android-ota') {
        toast.info("Actualizando interfaz...");
        
        const bundle = await CapacitorUpdater.download({
          url: updateInfo.downloadUrl,
          version: updateInfo.version,
        });

        toast.success("Interfaz descargada. Reiniciando...");
        await CapacitorUpdater.set({ id: bundle.id });
        // The app will reload automatically with the new version
      } else {
        // Android-Native (APK)
        toast.info("Abriendo descarga en el navegador...");
        window.open(updateInfo.downloadUrl, "_system");
        setTimeout(() => setUpdateAvailable(false), 1000);
      }
    } catch (e: any) {
      toast.error(`Error actualizando: ${e.message}`);
      setIsUpdating(false);
    }
  };

  return (
    <Dialog open={updateAvailable} onOpenChange={setUpdateAvailable}>
      <DialogContent className="sm:max-w-[425px] rounded-2xl bg-zinc-900 border-zinc-800 text-white">
        <DialogHeader>
          <DialogTitle className="text-xl">Actualización Disponible</DialogTitle>
          <DialogDescription className="text-zinc-400 mt-2">
            La versión <span className="font-bold text-white">{updateInfo?.version}</span> {updateInfo?.type === 'android-ota' ? '(Web)' : ''} ya está disponible.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
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
            {isUpdating ? "Actualizando..." : "Actualizar Ahora"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
