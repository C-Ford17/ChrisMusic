"use client";

import { useEffect, useState } from "react";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
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

export function UpdaterComponent() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{ version: string; notes: string; downloadUrl: string; isTauri: boolean; updateFn?: () => Promise<void> } | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    async function checkForUpdates() {
      try {
        const isTauri = !!(window as any).__TAURI_INTERNALS__;

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
              isTauri: true,
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
          const currentVersion = appInfo.version;

          const response = await fetch(UPDATER_URL);
          const data = await response.json();

          if (data && data.version && data.platforms?.android?.url) {
            if (compareVersions(data.version, currentVersion) > 0) {
              setUpdateAvailable(true);
              setUpdateInfo({
                version: data.version,
                notes: data.notes || "Mejoras de sistema.",
                downloadUrl: data.platforms.android.url,
                isTauri: false,
              });
            }
          }
        }
      } catch (error) {
        console.error("Failed to check for updates:", error);
      }
    }

    // Delay check slightly to not block splash screen or initial load
    const timer = setTimeout(checkForUpdates, 3000);
    return () => clearTimeout(timer);
  }, []);

  const handleUpdate = async () => {
    if (!updateInfo) return;
    setIsUpdating(true);

    try {
      if (updateInfo.isTauri && updateInfo.updateFn) {
        toast.info("Descargando actualización...");
        await updateInfo.updateFn();
      } else {
        // Android / Capacitor
        toast.info("Abriendo descarga en el navegador...");
        // This will prompt the Android system browser to download the file directly.
        window.open(updateInfo.downloadUrl, "_system");
        // Give it a moment before hiding modal
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
            La versión <span className="font-bold text-white">{updateInfo?.version}</span> ya está disponible para descargar.
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
