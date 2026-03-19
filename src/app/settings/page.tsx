'use client';

import { 
  ChevronLeft, Trash2, Download, Upload, 
  Info, ShieldCheck, Github, ExternalLink,
  Moon, Sun, Monitor, PlayCircle, Music2,
  HardDrive, Sparkles, WifiOff
} from 'lucide-react';
import Link from 'next/link';
import { LibraryService } from '@/features/library/services/libraryService';
import { useSettingsStore, type AudioQuality, type ThemeMode } from '@/features/settings/store/settingsStore';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';
import { InstallButton } from '@/components/InstallButton';

export default function SettingsPage() {
  const { 
    theme: storeTheme, setTheme: setStoreTheme, 
    autoplay, setAutoplay, audioQuality, setAudioQuality,
    isForcedOffline, setForcedOffline
  } = useSettingsStore();
  const { theme, setTheme } = useTheme();

  // Sync store with next-themes if they differ
  const currentTheme = theme || storeTheme;

  const handleExport = async () => {
    try {
      const data = await LibraryService.exportData();
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chrismusic-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Copia de seguridad descargada');
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
        const json = event.target?.result as string;
        await LibraryService.importData(json);
        toast.success('Datos importados correctamente. Reinicia la app para ver los cambios.');
        setTimeout(() => window.location.reload(), 2000);
      } catch (err) {
        console.error(err);
        toast.error('Error al importar el archivo. Formato no válido.');
      }
    };
    reader.readAsText(file);
  };

  const handleClearHistory = async () => {
    if (confirm('¿Estás seguro de que quieres borrar todo el historial?')) {
      await LibraryService.clearHistory();
      toast.success('Historial borrado');
    }
  };

  return (
    <main className="flex-1 p-6 pb-32 min-h-screen max-w-2xl mx-auto transition-colors duration-500">
      <div className="flex items-center gap-4 mb-10">
        <Link href="/library" className="p-3 bg-black/5 dark:bg-white/5 hover:bg-[#7C3AED]/10 rounded-2xl transition-all group shadow-sm">
          <ChevronLeft size={24} className="text-black/60 dark:text-white/60 group-hover:text-[#7C3AED]" />
        </Link>
        <h1 className="text-4xl font-black tracking-tighter text-black dark:text-white">Ajustes</h1>
      </div>

      <div className="space-y-12">
        <InstallButton />

        {/* Apariencia */}
        <section className="animate-in fade-in slide-in-from-bottom-6 duration-500">
          <h2 className="text-xs font-black text-[#7C3AED] uppercase tracking-[0.2em] mb-5 px-3 flex items-center gap-3">
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
                        ? 'bg-[#7C3AED] text-white shadow-xl shadow-[#7C3AED]/20' 
                        : 'text-black/30 dark:text-white/40 hover:text-[#7C3AED] dark:hover:text-white/60'
                      }`}
                    >
                      <Icon size={20} className={isActive ? "fill-current" : ""} />
                      <span className="text-[10px] font-black uppercase tracking-widest">{item.label}</span>
                    </button>
                  );
                })}
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
              <div className={`w-14 h-7 rounded-full transition-all relative p-1 ${autoplay ? 'bg-[#7C3AED] shadow-inner shadow-black/20' : 'bg-black/10 dark:bg-white/10'}`}>
                <div className={`w-5 h-5 bg-white rounded-full shadow-lg transition-all transform ${autoplay ? 'translate-x-7' : 'translate-x-0'}`} />
              </div>
            </div>

            <div className="p-8 border-t border-black/5 dark:border-white/5 space-y-6">
              <div className="flex items-center gap-5">
                <div className="p-4 bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 rounded-2xl">
                  <Music2 size={24} />
                </div>
                <div>
                  <p className="font-black text-lg text-black/80 dark:text-white/90 tracking-tight">Calidad de Audio</p>
                  <p className="text-sm font-bold text-black/30 dark:text-white/40 mt-0.5">Optimiza tu consumo de datos</p>
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
                      : 'bg-black/5 dark:bg-transparent border-black/5 dark:border-white/10 text-black/30 dark:text-white/40 hover:border-[#7C3AED]/30'
                    }`}
                  >
                    {q === 'low' ? 'Baja' : q === 'normal' ? 'Media' : 'Alta'}
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
                  <p className="text-sm font-bold text-black/30 dark:text-white/40 mt-0.5 uppercase tracking-widest text-[10px]">Copia JSON</p>
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
              <input type="file" accept=".json" className="hidden" onChange={handleImport} />
            </label>

            <button 
              onClick={handleClearHistory}
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

        {/* Acerca de */}
        <section className="animate-in fade-in slide-in-from-bottom-10 duration-1000">
          <h2 className="text-xs font-black text-black/40 dark:text-white/20 uppercase tracking-[0.2em] mb-5 px-3">Información</h2>
          <div className="bg-black/5 dark:bg-white/5 rounded-[32px] overflow-hidden border border-black/10 dark:border-white/10 shadow-sm">
            <div className="p-8 flex items-center gap-5">
              <div className="p-4 bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded-2xl">
                <Info size={24} />
              </div>
              <div>
                <p className="font-black text-black/80 dark:text-white/90">Versión 0.6.0-stable</p>
                <p className="text-sm font-bold text-black/30 dark:text-white/40 mt-0.5">Sprint 6 • ChrisMusic Premium</p>
              </div>
            </div>

            <a 
              href="https://github.com/Christian/ChrisMusic" 
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
              <ExternalLink size={18} className="text-black/10 dark:text-white/10 group-hover:text-[#7C3AED] transition-all" />
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
