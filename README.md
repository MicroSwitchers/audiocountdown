# Visual Countdown — redesigned edition

An improved version of MicroSwitchers' single-page visual/audio countdown timer.

## Highlights

- Keeps the original **tap / drag the full-height vertical ruler, release to start** interaction.
- **Accurate deadline-based timing** (using real elapsed time, not counting `setInterval` callbacks); time catches up after sleep or tab backgrounding.
- **Pause, resume, restart, clear, and fullscreen** controls; 9 one-tap presets and custom duration (up to 120 minutes).
- **Adaptable ruler scale** (5, 10, 15, 30, 60, 120 minutes). When a preset exceeds the scale, the scale expands automatically.
- Optional **gentle audio, ticking, voice reminders, volume, mute, and finish chime**.
- Responsive mobile-first layout, four bar colours, high-contrast mode, large time readout, keyboard controls, and live status updates for screen readers.
- Saves timer state and preferences on-device; countdown survives a page reload.
- No framework, CDN, fonts, analytics, or user accounts. Offline-capable PWA on HTTPS (including GitHub Pages).

## Deploy to GitHub Pages

Copy all contents into the root of `MicroSwitchers/audiocountdown` on the `main` branch, keeping the directory layout. GitHub Pages will then serve the improved app at the existing URL. You can test locally with any static web server (e.g. `python -m http.server 8000`) or open `index.html` directly for most features. Service workers require HTTPS or localhost.

## Notes

- Audio/speech require user interaction in many browsers; browser tabs in the background might mute or pause audio.
- The Screen Wake Lock API is optional and may be unavailable on some mobile browsers.
- Tap/dragging a running timer **starts a new timer**, like the original app; pause first if you only want to stop it.
- Settings are private to the browser via `localStorage`. No data is sent anywhere.

## Original interaction

The original app had a 60-minute vertical canvas ruler, touch/drag/release to start, spoken start/reminders/finish, and a beep each second. This version retains that interaction while adding accessible controls, a much clearer interface, and more reliable timing.
