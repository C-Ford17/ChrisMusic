PR #1 - Añadir configuración de temporizador en settingsStore
// src/features/settings/store/settingsStore.ts
export const SettingsStore = create({
  // ... existentes
  shutdownTimer: { type: "number", default: 60000 }, // 1 minuto por defecto
  toggleShutdownTimer() { set(this, "shutdownTimer") },
  setShutdownTimer(ms) { set(this, "shutdownTimer", ms) },
  isTimerActive: { type: "boolean", default: false },
  startTimerTask() {
    setTimeout(() => {
      // Lógica para cerrar app
    }, get(this, "shutdownTimer"));
  },
  cancelTimer() {
    clearTimeout(get(this, "shutdownTimerTask"));
    set(this, "timerTask", null);
  }
});

PR #2 - Modificar UI del reproductor para incluir botón de temporizador
// src/components/PlayerControls.tsx
const PlayerControls = () => {
  // ... existente
  return (
    <div className="controls">
      {/* ... existentes */}
     div className="more-options">
       button 
          onClick={() => navigate("/settings")}
          className="settings-button">
          ⚙️
        </button>
button 
          onClick={handleStartTimer}
          className="timer-button">
          ⏰
        </buttondiv>
    </div>
  );
};

PR #3 - Implementar lógica del temporizador en PlayerComponent
// src/app/player/page.tsx
const PlayerPage = () => {
  const settings = use(SettingsStore);
  
  const handleStartTimer = () => {
    settings.startTimerTask();
    settings.isTimerActive = true;
  };

  const handleTimerComplete = () => {
    // Lógica para cerrar app completo
    window.navigator.standalone?.close?.();
    // O para apps híbridas:
    window.open('close_app.html', '_self');
    settings.isTimerActive = false;
  };

  useEffect(() => {
    if (settings.isTimerActive) {
      // Mostrar contador regresivo en UI
    }
  }, [settings.isTimerActive]);

  return (
    <div>
      {/* ... existente */}
      {settings.isTimerActive && (
        <div className="timer-indicator">
          <p>Apagando en {settings.shutdownTimer/1000} segundos</p>
        </div>
      )}
    </div>
  );
};

PR #4 - Manejar cancelación del temporizador
// En PlayerComponent
const handleBackToMain = () => {
  settings.cancelTimer();
  settings.isTimerActive = false;
};

PR #5 - Añadir mensajes de confirmación si el usuario intenta cerrar
if (get(settings, "isTimerActive")) {
  return (
    <Alert>
      La app se cerrará en {settings.shutdownTimer/1000} segundosAlert>
  );
}