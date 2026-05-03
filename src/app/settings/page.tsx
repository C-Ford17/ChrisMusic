'use client';

import { 
  ChevronLeft, Trash2, Download, Upload, 
  Info, ShieldCheck, Github, ExternalLink,
  Moon, Sun, Monitor, PlayCircle, Music2,
  HardDrive, Sparkles, WifiOff, Bug, DatabaseZap,
  Check, RefreshCw, ChevronRight
} from 'lucide-react';
import Link from 'next/link';
import { LibraryService } from '@/features/library/services/libraryService';
import { useSettingsStore, type AudioQuality, type ThemeMode, type DoHProvider } from '@/features/settings/store/settingsStore';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';
import packageJson from '../../../package.json';
import { InstallButton } from '@/components/InstallButton';
import { db } from '@/core/db/db';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { usePlayerStore } from '@/features/player/store/playerStore';
import { MaintenanceService } from '@/features/library/services/maintenanceService';
import { offlineService } from '@/features/library/services/offlineService';
import { youtubeExtractionService } from '@/features/player/services/youtubeExtractionService';
import { useState, useEffect } from 'react';
import { 
  Globe, Server, Shield, Network,
  Lock, Settings2, HelpCircle
} from 'lucide-react';

export default function SettingsPage() {
  const { 
    theme: storeTheme, setTheme: setStoreTheme, 
    autoplay, setAutoplay, audioQuality, setAudioQuality,
    isForcedOffline, setForcedOffline,
    isDebugMode, setDebugMode,
    accentColor, setAccentColor,
    enableProxy, setEnableProxy, 
    proxyType, setProxyType, proxyHost, setProxyHost, proxyPort, setProxyPort,
    proxyUrl, setProxyUrl,
    dohProvider, setDohProvider, customDohUrl, setCustomDohUrl,
    autoCache, setAutoCache, forceIPv4, setForceIPv4
  } = useSettingsStore();
  const { theme, setTheme } = useTheme();

  const [cookieText, setCookieText] = useState('');
  const [poToken, setPoToken] = useState('');
  const [visitorData, setVisitorData] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSavingLocal, setIsSavingLocal] = useState(false);
  const [isTauri, setIsTauri] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);
  const [repairProgress, setRepairProgress] = useState({ current: 0, total: 0, title: '' });
  const [showDohModal, setShowDohModal] = useState(false);

  useEffect(() => {
    setIsTauri(typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__);
    // Load existing tokens
    setPoToken(localStorage.getItem('yt_po_token') || '');
    setVisitorData(localStorage.getItem('yt_visitor_data') || '');
  }, []);

  const handleSaveTokens = async () => {
    try {
      await youtubeExtractionService.updateTokens(poToken, visitorData);
      toast.success('Tokens de YouTube actualizados correctamente');
    } catch (err) {
      toast.error('Error al actualizar tokens');
    }
  };

  const handleSaveCookiesLocal = async () => {
    if (!cookieText.trim()) {
      toast.error('Por favor, pega el contenido del archivo cookies.txt');
      return;
    }

    setIsSavingLocal(true);
    try {
      await MaintenanceService.saveCookiesLocally(cookieText);
      toast.success('Cookies guardadas localmente en la PC');
    } catch (err) {
      toast.error('Error al guardar cookies en PC');
    } finally {
      setIsSavingLocal(false);
    }
  };

  const handleSyncCookiesApi = async () => {
    if (!cookieText.trim()) {
      toast.error('Por favor, pega el contenido del archivo cookies.txt');
      return;
    }

    setIsSyncing(true);
    try {
      await MaintenanceService.syncCookiesWithApi(cookieText);
      toast.success('Cookies sincronizadas con la API correctamente');
    } catch (err) {
      toast.error('Error al sincronizar con la API');
    } finally {
      setIsSyncing(false);
    }
  };

  // Sync store with next-themes if they differ
  const currentTheme = theme || storeTheme;

  const handleExport = async () => {
    try {
      const blob = await LibraryService.exportData();
      const fileName = `chrismusic-backup-${new Date().toISOString().split('T')[0]}.zip`;

      if (Capacitor.isNativePlatform()) {
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = async () => {
          const base64data = reader.result as string;
          const base64 = base64data.split(',')[1];
          
          try {
            const { uri } = await Filesystem.writeFile({
              path: fileName,
              data: base64,
              directory: Directory.Cache
            });

            await Share.share({
              title: 'Copia de Seguridad ChrisMusic',
              text: 'Tu biblioteca de música de ChrisMusic.',
              url: uri,
              dialogTitle: '¿Dónde quieres guardar tu copia?'
            });
            toast.success('Backup preparado para compartir');
          } catch (fileErr) {
            console.error(fileErr);
            toast.error('Error al preparar el archivo en móvil');
          }
        };
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success('Copia de seguridad descargada (formato ZIP)');
      }
    } catch (err) {
      console.error(err);
      toast.error('Error al exportar datos');
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const arrayBuffer = event.target?.result as ArrayBuffer;
        await LibraryService.importData(arrayBuffer);
        toast.success('Datos importados correctamente. Reinicia la app para ver los cambios.');
        setTimeout(() => window.location.reload(), 2000);
      } catch (err) {
        console.error(err);
        toast.error('Error al importar el archivo. Formato ZIP no válido o corrupto.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const { 
    clearPlayerState 
  } = usePlayerStore();

  const handleClearAll = async () => {
    if (confirm('¿Estás seguro de que quieres borrar TODOS tus datos (favoritos, playlists, historial)?')) {
      await LibraryService.clearAllData();
      clearPlayerState();
      toast.success('Todos los datos han sido borrados');
    }
  };

  const handleClearCache = async () => {
    if (confirm('¿Limpiar caché temporal? (Las descargas permanentes NO se borran)')) {
      await MaintenanceService.clearAppCache();
    }
  };

  const handleRepairMetadata = async () => {
    setIsRepairing(true);
    try {
      await offlineService.repairMetadata((current, total, title) => {
        setRepairProgress({ current, total, title });
      });
      toast.success('Mantenimiento completado. Se han actualizado las imágenes y letras.');
    } catch (err) {
      toast.error('Error durante el mantenimiento');
    } finally {
      setIsRepairing(false);
      setRepairProgress({ current: 0, total: 0, title: '' });
    }
  };

  return (
    <main className="flex-1 p-6 pb-32 min-h-screen pt-safe max-w-2xl mx-auto transition-colors duration-500">
      <div className="flex items-center gap-4 mb-10">
        <Link href="/library" className="p-3 bg-black/5 dark:bg-white/5 hover:bg-[var(--accent-primary)]/10 rounded-2xl transition-all group shadow-sm">
          <ChevronLeft size={24} className="text-black/60 dark:text-white/60 group-hover:text-[var(--accent-primary)]" />
        </Link>
        <h1 className="text-4xl font-black tracking-tighter text-black dark:text-white">Ajustes</h1>
      </div>

      <div className="space-y-12">
        <InstallButton />

        {/* Apariencia */}
        <section className="animate-in fade-in slide-in-from-bottom-6 duration-500">
          <h2 className="text-xs font-black text-[var(--accent-primary)] uppercase tracking-[0.2em] mb-5 px-3 flex items-center gap-3">
            <Sparkles size={16} /> Personalización
          </h2>
          <div className="bg-black/5 dark:bg-white/5 rounded-[32px] p-8 border border-black/10 dark:border-white/10 space-y-8 shadow-sm">
            <div className="flex flex-col gap-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-black text-lg text-black/80 dark:text-white/90 tracking-tight">Tema de la aplicación</p>
                  <p className="text-xs font-bold text-black/30 dark:text-white/40 uppercase tracking-widest mt-1">Apariencia visual</p>
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-2 bg-black/5 dark:bg-black/40 p-2 rounded-[24px] border border-black/5 dark:border-white/5">
                {[
                  { id: 'dark', label: 'Oscuro', icon: Moon },
                  { id: 'light', label: 'Claro', icon: Sun },
                  { id: 'system', label: 'Sistema', icon: Monitor },
                ].map((item) => {
                  const Icon = item.icon;
                  const isActive = currentTheme === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setTheme(item.id);
                        setStoreTheme(item.id as ThemeMode);
                      }}
                      className={`flex flex-col items-center gap-2 py-4 rounded-[18px] transition-all ${
                        isActive 
                        ? 'bg-[var(--accent-primary)] text-white shadow-xl shadow-[var(--accent-primary)]/20' 
                        : 'text-black/30 dark:text-white/40 hover:text-[var(--accent-primary)] dark:hover:text-white/60'
                      }`}
                    >
                      <Icon size={20} className={isActive ? "fill-current" : ""} />
                      <span className="text-[10px] font-black uppercase tracking-widest">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Accent Color Palette */}
            <div className="flex flex-col gap-6 pt-6 border-t border-black/5 dark:border-white/5">
              <div>
                <p className="font-black text-lg text-black/80 dark:text-white/90 tracking-tight">Color de acento</p>
                <p className="text-xs font-bold text-black/30 dark:text-white/40 uppercase tracking-widest mt-1">Elige tu estilo</p>
              </div>

              <div className="flex flex-wrap gap-4">
                {[
                  { id: 'violet', color: '#7C3AED' },
                  { id: 'green', color: '#1DB954' },
                  { id: 'red', color: '#FF0000' },
                  { id: 'blue', color: '#3B82F6' },
                  { id: 'amber', color: '#F59E0B' },
                  { id: 'pink', color: '#E11D48' },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setAccentColor(item.color)}
                    className={`w-12 h-12 rounded-2xl transition-all relative flex items-center justify-center ${
                      accentColor === item.color ? 'scale-110 shadow-lg' : 'hover:scale-105 active:scale-90 opacity-60 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: item.color }}
                  >
                    {accentColor === item.color && (
                      <Check size={20} className="text-white drop-shadow-md" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Red y Conectividad */}
        <section className="animate-in fade-in slide-in-from-bottom-6 duration-700">
          <h2 className="text-xs font-black text-emerald-500 dark:text-emerald-400 uppercase tracking-[0.2em] mb-5 px-3 flex items-center gap-3">
            <Globe size={16} /> Red y Conectividad
          </h2>
          <div className="bg-black/5 dark:bg-white/5 rounded-[32px] overflow-hidden border border-black/10 dark:border-white/10 shadow-sm transition-all space-y-px bg-black/10 dark:bg-white/5">
            
            {/* DNS over HTTPS */}
            <div className="bg-white dark:bg-[#121212] p-8">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-5">
                  <div className="p-4 bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 rounded-2xl">
                    <Shield size={24} />
                  </div>
                  <div>
                    <p className="font-black text-lg text-black/80 dark:text-white/90 tracking-tight">DNS mediante HTTPS</p>
                    <p className="text-sm font-bold text-black/30 dark:text-white/40 mt-0.5">Evita bloqueos de red y censura</p>
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { id: 'none', label: 'Ninguno' },
                  { id: 'google', label: 'Google' },
                  { id: 'cloudflare', label: 'Cloudflare' },
                  { id: 'opendns', label: 'OpenDNS' },
                  { id: 'adguard', label: 'AdGuard' },
                  { id: 'custom', label: 'Personalizado' },
                ].map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setDohProvider(p.id as DoHProvider)}
                    className={`py-3 px-4 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all ${
                      dohProvider === p.id 
                      ? 'bg-[var(--accent-primary)] text-white border-[var(--accent-primary)] shadow-lg' 
                      : 'bg-black/5 dark:bg-white/5 border-transparent text-black/40 dark:text-white/40 hover:border-white/10'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {dohProvider === 'custom' && (
                <input
                  type="text"
                  value={customDohUrl}
                  onChange={(e) => setCustomDohUrl(e.target.value)}
                  placeholder="https://doh.ejemplo.com/dns-query"
                  className="w-full mt-4 bg-black/5 dark:bg-black/40 border border-black/10 dark:border-white/10 rounded-xl p-4 text-[10px] font-mono text-black/80 dark:text-white/80 focus:ring-2 focus:ring-[var(--accent-primary)] outline-none"
                />
              )}
            </div>

            {/* Proxy */}
            <div className="bg-white dark:bg-[#121212] p-8">
              <div 
                className="flex items-center justify-between cursor-pointer group mb-4"
                onClick={() => setEnableProxy(!enableProxy)}
              >
                <div className="flex items-center gap-5">
                  <div className="p-4 bg-purple-500/10 text-purple-500 dark:text-purple-400 rounded-2xl group-hover:scale-110 transition-transform">
                    <Server size={24} />
                  </div>
                  <div>
                    <p className="font-black text-lg text-black/80 dark:text-white/90 tracking-tight">Habilitar Proxy</p>
                    <p className="text-sm font-bold text-black/30 dark:text-white/40 mt-0.5 text-[10px] uppercase tracking-widest">Necesario reiniciar la app</p>
                  </div>
                </div>
                <div className={`w-14 h-7 rounded-full transition-all relative p-1 ${enableProxy ? 'bg-purple-500 shadow-inner' : 'bg-black/10 dark:bg-white/10'}`}>
                  <div className={`w-5 h-5 bg-white rounded-full shadow-lg transition-all transform ${enableProxy ? 'translate-x-7' : 'translate-x-0'}`} />
                </div>
              </div>

              {enableProxy && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-300 space-y-6">
                   <div>
                     <p className="text-[10px] font-black uppercase tracking-widest text-black/40 dark:text-white/40 mb-3 px-1">Modo proxy</p>
                     <div className="grid grid-cols-3 gap-2">
                       {(['http', 'socks4', 'socks5'] as const).map((type) => (
                         <button
                           key={type}
                           onClick={() => setProxyType(type)}
                           className={`py-3 px-4 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all ${
                             proxyType === type 
                             ? 'bg-purple-500 text-white border-purple-500 shadow-lg shadow-purple-500/20' 
                             : 'bg-black/5 dark:bg-white/5 border-transparent text-black/40 dark:text-white/40 hover:border-white/10'
                           }`}
                         >
                           {type}
                         </button>
                       ))}
                     </div>
                   </div>

                   <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                     <div className="sm:col-span-3">
                        <p className="text-[10px] font-black uppercase tracking-widest text-black/40 dark:text-white/40 mb-2 px-1">Servidor proxy</p>
                        <input
                          type="text"
                          value={proxyHost}
                          onChange={(e) => setProxyHost(e.target.value)}
                          placeholder="p. ej. 127.0.0.1"
                          className="w-full bg-black/5 dark:bg-black/40 border border-black/10 dark:border-white/10 rounded-xl p-4 text-[10px] font-mono text-black/80 dark:text-white/80 focus:ring-2 focus:ring-purple-500 outline-none"
                        />
                     </div>
                     <div className="sm:col-span-1">
                        <p className="text-[10px] font-black uppercase tracking-widest text-black/40 dark:text-white/40 mb-2 px-1">Puerto</p>
                        <input
                          type="text"
                          value={proxyPort}
                          onChange={(e) => setProxyPort(e.target.value)}
                          placeholder="1080"
                          className="w-full bg-black/5 dark:bg-black/40 border border-black/10 dark:border-white/10 rounded-xl p-4 text-[10px] font-mono text-black/80 dark:text-white/80 focus:ring-2 focus:ring-purple-500 outline-none"
                        />
                     </div>
                   </div>

                   <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-black/40 dark:text-white/40 mb-2 px-1">O usar URL completa (Legacy)</p>
                      <input
                        type="text"
                        value={proxyUrl}
                        onChange={(e) => setProxyUrl(e.target.value)}
                        placeholder="http://usuario:pass@host:puerto"
                        className="w-full bg-black/5 dark:bg-black/40 border border-black/10 dark:border-white/10 rounded-xl p-4 text-[10px] font-mono text-black/80 dark:text-white/80 focus:ring-2 focus:ring-purple-500 outline-none opacity-60"
                      />
                   </div>
                </div>
              )}
            </div>

            {/* Forzar IPv4 */}
            <div className="bg-white dark:bg-[#121212] p-8 border-t border-black/5 dark:border-white/5">
              <div 
                className="flex items-center justify-between cursor-pointer group"
                onClick={() => setForceIPv4(!forceIPv4)}
              >
                <div className="flex items-center gap-5">
                  <div className="p-4 bg-orange-500/10 text-orange-500 dark:text-orange-400 rounded-2xl group-hover:scale-110 transition-transform">
                    <Network size={24} />
                  </div>
                  <div>
                    <p className="font-black text-lg text-black/80 dark:text-white/90 tracking-tight">Forzar IPv4</p>
                    <p className="text-sm font-bold text-black/30 dark:text-white/40 mt-0.5">Mejora la conexión en redes restringidas</p>
                  </div>
                </div>
                <div className={`w-14 h-7 rounded-full transition-all relative p-1 ${forceIPv4 ? 'bg-orange-500 shadow-inner' : 'bg-black/10 dark:bg-white/10'}`}>
                  <div className={`w-5 h-5 bg-white rounded-full shadow-lg transition-all transform ${forceIPv4 ? 'translate-x-7' : 'translate-x-0'}`} />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Reproducción */}
        <section className="animate-in fade-in slide-in-from-bottom-6 duration-700">
          <h2 className="text-xs font-black text-blue-500 dark:text-blue-400 uppercase tracking-[0.2em] mb-5 px-3 flex items-center gap-3">
            <PlayCircle size={16} /> Reproducción
          </h2>
          <div className="bg-black/5 dark:bg-white/5 rounded-[32px] overflow-hidden border border-black/10 dark:border-white/10 shadow-sm transition-all">
            <div 
              className="flex items-center justify-between p-8 hover:bg-white dark:hover:bg-white/2 transition-all cursor-pointer group"
              onClick={() => setAutoplay(!autoplay)}
            >
              <div className="flex items-center gap-5">
                <div className="p-4 bg-blue-500/10 text-blue-500 dark:text-blue-400 rounded-2xl group-hover:scale-110 transition-transform">
                  <PlayCircle size={24} />
                </div>
                <div>
                  <p className="font-black text-lg text-black/80 dark:text-white/90 tracking-tight">Reproducción Automática</p>
                  <p className="text-sm font-bold text-black/30 dark:text-white/40 mt-0.5">Sugerir música al terminar</p>
                </div>
              </div>
              <div className={`w-14 h-7 rounded-full transition-all relative p-1 ${autoplay ? 'bg-[var(--accent-primary)] shadow-inner shadow-black/20' : 'bg-black/10 dark:bg-white/10'}`}>
                <div className={`w-5 h-5 bg-white rounded-full shadow-lg transition-all transform ${autoplay ? 'translate-x-7' : 'translate-x-0'}`} />
              </div>
            </div>

            <div 
              className="flex items-center justify-between p-8 hover:bg-white dark:hover:bg-white/2 transition-all cursor-pointer group border-t border-black/5 dark:border-white/5"
              onClick={() => setAutoCache(!autoCache)}
            >
              <div className="flex items-center gap-5">
                <div className="p-4 bg-purple-500/10 text-purple-500 dark:text-purple-400 rounded-2xl group-hover:scale-110 transition-transform">
                  <DatabaseZap size={24} />
                </div>
                <div>
                  <p className="font-black text-lg text-black/80 dark:text-white/90 tracking-tight">Auto Cache</p>
                  <p className="text-sm font-bold text-black/30 dark:text-white/40 mt-0.5">Guardar automáticamente al escuchar</p>
                </div>
              </div>
              <div className={`w-14 h-7 rounded-full transition-all relative p-1 ${autoCache ? 'bg-[var(--accent-primary)] shadow-inner shadow-black/20' : 'bg-black/10 dark:bg-white/10'}`}>
                <div className={`w-5 h-5 bg-white rounded-full shadow-lg transition-all transform ${autoCache ? 'translate-x-7' : 'translate-x-0'}`} />
              </div>
            </div>

            <div className="p-8 border-t border-black/5 dark:border-white/5 space-y-6">
              <div className="flex items-center gap-5">
                <div className="p-4 bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 rounded-2xl">
                  <Music2 size={24} />
                </div>
                <div>
                  <p className="font-black text-lg text-black/80 dark:text-white/90 tracking-tight">Calidad de Audio</p>
                  <p className="text-sm font-bold text-black/30 dark:text-white/40 mt-0.5">Menor calidad = Carga más rápida y ahorro de datos</p>
                </div>
              </div>
              <div className="flex gap-2 ml-0 sm:ml-16">
                {(['low', 'normal', 'high'] as AudioQuality[]).map((q) => (
                  <button
                    key={q}
                    onClick={() => setAudioQuality(q)}
                    className={`flex-1 py-4 px-5 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] border transition-all ${
                      audioQuality === q 
                      ? 'bg-white dark:bg-white text-black border-white shadow-xl scale-105 z-10' 
                      : 'bg-black/5 dark:bg-transparent border-black/5 dark:border-white/10 text-black/30 dark:text-white/40 hover:border-[var(--accent-primary)]/30'
                    }`}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <span>{q === 'low' ? 'Baja' : q === 'normal' ? 'Media' : 'Alta'}</span>
                      <span className="text-[7px] opacity-60">
                        {q === 'low' ? '64kbps' : q === 'normal' ? '128kbps' : 'Bestaudio'}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>


        {/* Biblioteca y Datos */}
        <section className="animate-in fade-in slide-in-from-bottom-10 duration-1000">
          <h2 className="text-xs font-black text-emerald-500 dark:text-green-400 uppercase tracking-[0.2em] mb-5 px-3 flex items-center gap-3">
            <HardDrive size={16} /> Datos & Backup
          </h2>
          <div className="bg-black/5 dark:bg-white/5 rounded-[32px] overflow-hidden border border-black/10 dark:border-white/10 shadow-sm">
            <div 
              className="flex items-center justify-between p-8 hover:bg-white dark:hover:bg-white/2 transition-all cursor-pointer group"
              onClick={() => setForcedOffline(!isForcedOffline)}
            >
              <div className="flex items-center gap-5">
                <div className="p-4 bg-orange-500/10 text-orange-500 dark:text-orange-400 rounded-2xl group-hover:scale-110 transition-transform">
                  <WifiOff size={24} />
                </div>
                <div>
                  <p className="font-black text-lg text-black/80 dark:text-white/90 tracking-tight">Simular Modo Offline</p>
                  <p className="text-sm font-bold text-black/30 dark:text-white/40 mt-0.5 uppercase tracking-widest text-[10px]">Forzar desconexión</p>
                </div>
              </div>
              <div className={`w-14 h-7 rounded-full transition-all relative p-1 ${isForcedOffline ? 'bg-orange-500 shadow-inner' : 'bg-black/10 dark:bg-white/10'}`}>
                <div className={`w-5 h-5 bg-white rounded-full shadow-lg transition-all transform ${isForcedOffline ? 'translate-x-7' : 'translate-x-0'}`} />
              </div>
            </div>

            <button 
              onClick={handleExport}
              className="w-full flex items-center justify-between p-8 hover:bg-white dark:hover:bg-white/2 transition-all text-left group"
            >
              <div className="flex items-center gap-5">
                <div className="p-4 bg-blue-500/10 text-blue-500 dark:text-blue-400 rounded-2xl group-hover:bg-blue-500 group-hover:text-white transition-all">
                  <Download size={24} />
                </div>
                <div>
                  <p className="font-black text-lg text-black/80 dark:text-white/90 tracking-tight">Exportar Todo</p>
                  <p className="text-sm font-bold text-black/30 dark:text-white/40 mt-0.5 uppercase tracking-widest text-[10px]">Copia comprimida (ZIP)</p>
                </div>
              </div>
              <div className="w-10 h-10 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                 <ExternalLink size={16} />
              </div>
            </button>

            <label className="w-full flex items-center justify-between p-8 hover:bg-white dark:hover:bg-white/2 transition-all text-left cursor-pointer border-t border-black/5 dark:border-white/5 group">
              <div className="flex items-center gap-5">
                <div className="p-4 bg-emerald-500/10 text-emerald-500 dark:text-green-400 rounded-2xl group-hover:bg-emerald-500 group-hover:text-white transition-all">
                  <Upload size={24} />
                </div>
                <div>
                  <p className="font-black text-lg text-black/80 dark:text-white/90 tracking-tight">Importar Backup</p>
                  <p className="text-sm font-bold text-black/30 dark:text-white/40 mt-0.5 uppercase tracking-widest text-[10px]">Restaurar datos</p>
                </div>
              </div>
              <input type="file" accept=".zip" className="hidden" onChange={handleImport} />
            </label>

            <button
              onClick={handleClearCache}
              className="w-full flex items-center justify-between p-8 hover:bg-amber-500/10 transition-all text-left border-t border-black/5 dark:border-white/5 group"
            >
              <div className="flex items-center gap-5 text-amber-500">
                <div className="p-4 bg-amber-500/10 rounded-2xl group-hover:bg-amber-500 group-hover:text-white transition-all">
                  <DatabaseZap size={24} />
                </div>
                <div>
                  <p className="font-black text-lg tracking-tight">Limpiar Caché</p>
                  <p className="text-sm font-bold text-amber-500/50 mt-0.5 uppercase tracking-widest text-[10px]">No borra descargas permanentes</p>
                </div>
              </div>
            </button>

            <button
              onClick={handleRepairMetadata}
              disabled={isRepairing}
              className="w-full flex items-center justify-between p-8 hover:bg-[var(--accent-primary)]/10 transition-all text-left border-t border-black/5 dark:border-white/5 group disabled:opacity-50"
            >
              <div className="flex items-center gap-5 text-[var(--accent-primary)]">
                <div className={`p-4 bg-[var(--accent-primary)]/10 rounded-2xl group-hover:bg-[var(--accent-primary)] group-hover:text-white transition-all ${isRepairing ? 'animate-pulse' : ''}`}>
                  <RefreshCw size={24} className={isRepairing ? 'animate-spin' : ''} />
                </div>
                <div>
                  <p className="font-black text-lg tracking-tight">Sincronizar Metadatos</p>
                  <p className="text-sm font-bold opacity-50 mt-0.5 uppercase tracking-widest text-[10px]">
                    {isRepairing 
                      ? `Reparando (${repairProgress.current}/${repairProgress.total}): ${repairProgress.title}` 
                      : 'Descargar carátulas HD y letras faltantes'}
                  </p>
                </div>
              </div>
            </button>

            <button
              onClick={handleClearAll}
              className="w-full flex items-center justify-between p-8 hover:bg-red-500/10 transition-all text-left border-t border-black/5 dark:border-white/5 group"
            >
              <div className="flex items-center gap-5 text-red-500">
                <div className="p-4 bg-red-500/10 rounded-2xl group-hover:bg-red-500 group-hover:text-white transition-all">
                  <Trash2 size={24} />
                </div>
                <div>
                  <p className="font-black text-lg tracking-tight">Borrar Todo</p>
                  <p className="text-sm font-bold text-red-500/50 mt-0.5 uppercase tracking-widest text-[10px]">Acción irreversible</p>
                </div>
              </div>
            </button>
          </div>
        </section>

        {/* Mantenimiento YouTube */}
        <section className="animate-in fade-in slide-in-from-bottom-10 duration-1000">
          <h2 className="text-xs font-black text-red-500 uppercase tracking-[0.2em] mb-5 px-3 flex items-center gap-3">
            <DatabaseZap size={16} /> Mantenimiento YouTube
          </h2>
          <div className="bg-black/5 dark:bg-white/5 rounded-[32px] overflow-hidden border border-black/10 dark:border-white/10 shadow-sm p-8 space-y-6">
            <div>
              <p className="font-black text-lg text-black/80 dark:text-white/90 tracking-tight">Actualizar Cookies</p>
              <p className="text-sm font-bold text-black/30 dark:text-white/40 mt-1">
                Pega aquí el contenido de tu <code className="bg-black/10 dark:bg-white/10 px-2 py-0.5 rounded text-[var(--accent-primary)]">cookies.txt</code> para evitar bloqueos de YouTube.
              </p>
            </div>
            
            <textarea
              className="w-full h-32 bg-black/5 dark:bg-black/40 border border-black/10 dark:border-white/10 rounded-2xl p-4 text-[10px] font-mono text-black/60 dark:text-white/60 focus:ring-2 focus:ring-[var(--accent-primary)] outline-none transition-all resize-none"
              placeholder="# Netscape HTTP Cookie File..."
              value={cookieText}
              onChange={(e) => setCookieText(e.target.value)}
            />

            <div className="flex flex-col sm:flex-row gap-3">
              {isTauri && (
                <button
                  onClick={handleSaveCookiesLocal}
                  disabled={isSavingLocal}
                  className="flex-1 py-4 bg-white dark:bg-white text-black rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all shadow-lg disabled:opacity-50"
                >
                  {isSavingLocal ? 'Guardando...' : 'Guardar en esta PC'}
                </button>
              )}
              <button
                onClick={handleSyncCookiesApi}
                disabled={isSyncing}
                className="flex-1 py-4 bg-[var(--accent-primary)] text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all shadow-lg shadow-[var(--accent-primary)]/20 disabled:opacity-50"
              >
                {isSyncing ? 'Sincronizando...' : 'Sincronizar con API'}
              </button>
            </div>
            
            <p className="text-[9px] font-bold text-black/20 dark:text-white/20 uppercase tracking-widest text-center">
              Recomendado si recibes errores de &quot;Sign in to confirm you are not a bot&quot;
            </p>
          </div>
        </section>

        {/* Configuración Avanzada YouTube (PO Token) */}
        <section className="animate-in fade-in slide-in-from-bottom-10 duration-1000">
          <h2 className="text-xs font-black text-[var(--accent-primary)] uppercase tracking-[0.2em] mb-5 px-3 flex items-center gap-3">
            <ShieldCheck size={16} /> YouTube Independiente (Android)
          </h2>
          <div className="bg-black/5 dark:bg-white/5 rounded-[32px] overflow-hidden border border-black/10 dark:border-white/10 shadow-sm p-8 space-y-6">
            <div>
              <p className="font-black text-lg text-black/80 dark:text-white/90 tracking-tight">Tokens de Identidad (PO Token)</p>
              <p className="text-sm font-bold text-black/30 dark:text-white/40 mt-1">
                Necesario para reproducir videos musicales en Android sin usar Railway.
              </p>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-black/40 dark:text-white/40 mb-2 block px-1">PO Token</label>
                <input
                  type="text"
                  className="w-full bg-black/5 dark:bg-black/40 border border-black/10 dark:border-white/10 rounded-xl p-4 text-[10px] font-mono text-black/80 dark:text-white/80 focus:ring-2 focus:ring-[var(--accent-primary)] outline-none"
                  placeholder="PO_TOKEN..."
                  value={poToken}
                  onChange={(e) => setPoToken(e.target.value)}
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-black/40 dark:text-white/40 mb-2 block px-1">Visitor Data</label>
                <input
                  type="text"
                  className="w-full bg-black/5 dark:bg-black/40 border border-black/10 dark:border-white/10 rounded-xl p-4 text-[10px] font-mono text-black/80 dark:text-white/80 focus:ring-2 focus:ring-[var(--accent-primary)] outline-none"
                  placeholder="VISITOR_DATA..."
                  value={visitorData}
                  onChange={(e) => setVisitorData(e.target.value)}
                />
              </div>
            </div>

            <button
              onClick={handleSaveTokens}
              className="w-full py-4 bg-white dark:bg-white text-black rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all shadow-lg"
            >
              Guardar Configuración Local
            </button>
            
            <p className="text-[9px] font-bold text-black/20 dark:text-white/20 uppercase tracking-widest text-center">
              Estos valores son específicos de tu dispositivo y IP.
            </p>
          </div>
        </section>

      {/* Desarrollador & Diagnóstico */}
      <section className="animate-in fade-in slide-in-from-bottom-10 duration-1000">
        <h2 className="text-xs font-black text-orange-400 uppercase tracking-[0.2em] mb-5 px-3 flex items-center gap-3">
          <Bug size={16} /> Desarrollador & Diagnóstico
        </h2>
        <div className="bg-black/5 dark:bg-white/5 rounded-[32px] overflow-hidden border border-black/10 dark:border-white/10 shadow-sm">
          <div
            className="flex items-center justify-between p-8 hover:bg-white dark:hover:bg-white/2 transition-all cursor-pointer group"
            onClick={() => setDebugMode(!isDebugMode)}
          >
            <div className="flex items-center gap-5">
              <div className="p-4 bg-orange-400/10 text-orange-400 rounded-2xl group-hover:scale-110 transition-transform">
                <Bug size={24} />
              </div>
              <div>
                <p className="font-black text-lg text-black/80 dark:text-white/90 tracking-tight">Modo Debug</p>
                <p className="text-sm font-bold text-black/30 dark:text-white/40 mt-0.5">Mostrar info técnica en reproductor</p>
              </div>
            </div>
            <div className={`w-14 h-7 rounded-full transition-all relative p-1 ${isDebugMode ? 'bg-orange-400 shadow-inner' : 'bg-black/10 dark:bg-white/10'}`}>
              <div className={`w-5 h-5 bg-white rounded-full shadow-lg transition-all transform ${isDebugMode ? 'translate-x-7' : 'translate-x-0'}`} />
            </div>
          </div>

          <button
            onClick={async () => {
              const diag = await youtubeExtractionService.getDiagnostics();
              console.log('NATIVE DIAGNOSTICS:', diag);
              const totalFiles = (diag?.no_backup_files?.length || 0) + (diag?.files_files?.length || 0);
              alert('Diagnóstico copiado a consola. Archivos encontrados: ' + totalFiles);
            }}
            className="w-full flex items-center justify-between p-8 hover:bg-white dark:hover:bg-white/2 transition-all text-left border-t border-black/5 dark:border-white/5 group"
          >
            <div className="flex items-center gap-5">
              <div className="p-4 bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] rounded-2xl group-hover:bg-[var(--accent-primary)] group-hover:text-white transition-all">
                <DatabaseZap size={24} />
              </div>
              <div>
                <p className="font-black text-lg tracking-tight">Diagnóstico Nativo</p>
                <p className="text-sm font-bold text-black/30 mt-0.5 uppercase tracking-widest text-[10px]">Ver archivos internos (Logcat)</p>
              </div>
            </div>
          </button>
          <button
            onClick={async () => {
              if (confirm('Esto forzará la extracción de los binarios nativos. ¿Continuar?')) {
                try {
                  const { YouTubeNative } = await import('@/features/player/services/youtubeExtractionService');
                  await YouTubeNative.forceReextraction();
                  toast.success('Extracción completada correctamente');
                } catch (err: any) {
                  toast.error('Fallo en la extracción: ' + err.message);
                }
              }
            }}
            className="w-full flex items-center justify-between p-8 hover:bg-white dark:hover:bg-white/2 transition-all text-left border-t border-black/5 dark:border-white/5 group"
          >
            <div className="flex items-center gap-5">
              <div className="p-4 bg-red-500/10 text-red-500 rounded-2xl group-hover:bg-red-500 group-hover:text-white transition-all">
                <Sparkles size={16} />
              </div>
              <div>
                <p className="font-black text-lg tracking-tight">Forzar Re-Extracción</p>
                <p className="text-sm font-bold text-black/30 mt-0.5 uppercase tracking-widest text-[10px]">Reparar binarios dañados</p>
              </div>
            </div>
          </button>
        </div>
      </section>

      {/* Acerca de */}
        <section className="animate-in fade-in slide-in-from-bottom-10 duration-1000">
          <h2 className="text-xs font-black text-black/40 dark:text-white/20 uppercase tracking-[0.2em] mb-5 px-3">Información</h2>
          <div className="bg-black/5 dark:bg-white/5 rounded-[32px] overflow-hidden border border-black/10 dark:border-white/10 shadow-sm">
            <div className="p-8 flex items-center gap-5">
              <div className="p-4 bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] rounded-2xl">
                <Info size={24} />
              </div>
              <div>
                <p className="font-black text-black/80 dark:text-white/90">Versión {packageJson.version}-stable</p>
                <p className="text-sm font-bold text-black/30 dark:text-white/40 mt-0.5">Lanzamiento Oficial • ChrisMusic Premium</p>
              </div>
            </div>

            <button 
              onClick={() => window.dispatchEvent(new CustomEvent('check-for-updates'))}
              className="w-full flex items-center justify-between p-8 hover:bg-white dark:hover:bg-white/2 transition-all text-left border-t border-black/5 dark:border-white/5 group"
            >
              <div className="flex items-center gap-5">
                <div className="p-4 bg-green-500/10 text-green-500 rounded-2xl group-hover:bg-green-500 group-hover:text-white transition-all">
                  <RefreshCw size={16} />
                </div>
                <div>
                  <p className="font-black text-black/80 dark:text-white/90 uppercase tracking-tighter text-sm">Buscar Actualizaciones</p>
                  <p className="text-[10px] font-bold text-black/30 dark:text-white/40 mt-0.5 uppercase tracking-widest">Forzar verificación OTA</p>
                </div>
              </div>
              <ChevronRight size={18} className="text-zinc-600 group-hover:translate-x-1 transition-transform" />
            </button>

            <button 
              onClick={() => {
                window.dispatchEvent(new CustomEvent('force-update-check'));
              }}
              className="w-full flex items-center justify-between p-8 hover:bg-white dark:hover:bg-white/2 transition-all text-left border-t border-black/5 dark:border-white/5 group"
            >
              <div className="flex items-center gap-5">
                <div className="p-4 bg-orange-500/10 text-orange-500 rounded-2xl group-hover:bg-orange-500 group-hover:text-white transition-all">
                  <RefreshCw size={16} />
                </div>
                <div>
                  <p className="font-black text-black/80 dark:text-white/90 uppercase tracking-tighter text-sm">Reinstalar Actualización</p>
                  <p className="text-[10px] font-bold text-black/30 dark:text-white/40 mt-0.5 uppercase tracking-widest">Forzar re-descarga de la interfaz</p>
                </div>
              </div>
              <ChevronRight size={18} className="text-zinc-600 group-hover:translate-x-1 transition-transform" />
            </button>

            <a 
              href="https://github.com/C-Ford17/ChrisMusic" 
              target="_blank" 
              className="w-full flex items-center justify-between p-8 hover:bg-white dark:hover:bg-white/2 transition-all text-left border-t border-black/5 dark:border-white/5 group"
            >
              <div className="flex items-center gap-5">
                <div className="p-4 bg-black/5 dark:bg-white/10 text-black/70 dark:text-white/70 rounded-2xl group-hover:bg-black group-hover:text-white dark:group-hover:bg-white dark:group-hover:text-black transition-all">
                  <Github size={24} />
                </div>
                <div>
                  <p className="font-black text-black/80 dark:text-white/90">GitHub Community</p>
                  <p className="text-sm font-bold text-black/30 dark:text-white/40 mt-0.5 tracking-tight">Código abierto colaborativo</p>
                </div>
              </div>
              <ExternalLink size={18} className="text-black/10 dark:text-white/10 group-hover:text-[var(--accent-primary)] transition-all" />
            </a>

            <div className="p-8 flex items-center gap-5 border-t border-black/5 dark:border-white/5">
              <div className="p-4 bg-amber-500/10 text-amber-600 dark:text-amber-500 rounded-2xl">
                <ShieldCheck size={24} />
              </div>
              <div>
                <p className="font-black text-black/80 dark:text-white/90">Privacidad Local</p>
                <p className="text-sm font-bold text-black/30 dark:text-white/40 mt-0.5 tracking-tight">Tus datos nunca salen de aquí</p>
              </div>
            </div>
          </div>
        </section>

        <div className="text-center py-10">
          <p className="text-[10px] uppercase font-black tracking-[0.4em] text-black/10 dark:text-white/10">Hecho con ❤️ para Christian</p>
        </div>
      </div>
    </main>
  );
}
