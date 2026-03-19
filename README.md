# 🎶 ChrisMusic 

**ChrisMusic** is a high-performance, premium music streaming web application built with the latest technologies. Designed for a seamless, distraction-free listening experience, it focuses on performance, aesthetics, and privacy.

![ChrisMusic Screenshot](https://raw.githubusercontent.com/Christian/ChrisMusic/main/public/screenshot.png) *(Note: Add a real screenshot here)*

## ✨ Key Features

- 🎧 **Premium Player**: Full-screen player with lyrics, volume control, and progress tracking.
- 🌓 **Dynamic Themes**: Beautiful, high-contrast Light and Dark modes with smooth transitions.
- 📜 **Synced Lyrics**: Integrated lyrics fetching and real-time synchronization.
- 📊 **Library Management**: Create playlists, mark favorites, and track your listening history.
- 📱 **PWA Support**: Installable on mobile and desktop devices with offline detection.
- 🔒 **Local-First Privacy**: Your history and playlists are stored locally on your device (IndexedDB).
- 🚀 **Next-Gen Tech**: Built with Next.js 16, React 19, and Tailwind CSS 4.

## 🛠️ Tech Stack

- **Framework**: [Next.js 16 (App Router)](https://nextjs.org/)
- **UI**: [React 19](https://react.dev/), [Tailwind CSS 4](https://tailwindcss.com/), [Framer Motion](https://www.framer.com/motion/)
- **State Management**: [Zustand](https://zustand-demo.pmnd.rs/)
- **Database**: [Dexie.js (IndexedDB)](https://dexie.org/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Components**: [Shadcn UI](https://ui.shadcn.com/) (adapted for Tailwind 4)
- **PWA**: [@ducanh2912/next-pwa](https://github.com/ducanh2912/next-pwa)

## 🚀 Getting Started

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/Christian/ChrisMusic.git
    cd ChrisMusic
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Run in development**:
    ```bash
    npm run dev
    ```

4.  **Build for production**:
    ```bash
    npm run build
    npm start
    ```

## 🏁 Sprint 6 Status

- [x] **Premium UI Refactor**: Full-screen player, lyrics panel, and advanced library view.
- [x] **Light Mode Support**: Comprehensive theme adjustments across all components.
- [x] **Theme Sync Fixes**: Improved `ThemeProvider` for Next.js App Router stability.
- [ ] **Unit Testing**: Implementing tests for `AudioEngine` and core stores.
- [ ] **Lighthouse PWA Audit**: Target score > 90.
- [ ] **Tauri Evaluation**: Desktop PoC for Windows.

## 🤝 Contribution

Contributions are welcome! Feel free to open issues or pull requests.

## 📄 License

MIT License - © 2026 Christian. Built with ❤️ for the music community.

