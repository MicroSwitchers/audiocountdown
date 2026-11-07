# Talking Visual Countdown — accessible full-screen PWA

A single-screen, tap-first talking timer for people with low vision or blindness. The countdown itself fills the entire screen. Settings are hidden in an accessible drawer that you can open from the small gear button at the top.

## Core interactions

- **Tap** at any height of the ruler to set the duration and start the countdown immediately. Dragging first lets you hear and preview the chosen duration.
- **Tap an active timer** to hear the remaining time, without resetting it.
- **Hold for one second** for a warning. Keep holding for **two additional seconds** to clear the timer, followed by “Timer cleared.” Releasing during the warning cancels clearing.
- The large **PAUSE/RESUME** and **HEAR TIME** buttons appear only during a timer. There is also a keyboard/screen-reader-focusable Clear timer control requiring two activations within five seconds.
- The **VOICE ON / VOICE OFF** button immediately changes mute state, cancels queued speech, and reflects the selected voice mode in Settings.

## Settings drawer

The timer remains full-screen when the drawer is closed. Settings persist in local storage on this device.

**Spoken feedback:** Voice off entirely; only when tapped; key moments; every 5 minutes, every minute, every 30 seconds, or every 15 seconds. Except for voice-off and tap-only modes, the automatic schedule includes 30 seconds and the final spoken ten seconds. All voice-on modes still speak when the timer is touched, and speak the selection while setting it.

**Ruler layout (maximum selectable duration, NOT an automatic timer preset):**

| Ruler | Selection increment | Major ruler marks |
|---|---:|---:|
| 1 hour | 15 seconds | 5 minutes |
| 5 hours | 1 minute | 30 minutes |
| 12 hours | 5 minutes | 1 hour |
| 24 hours | 5 minutes | 2 hours |

For example, on a **24-hour ruler**, tapping halfway up sets **12 hours**. Switching the ruler while a timer is running **does not change or reset the countdown**. If a running duration is larger than the new ruler maximum, the visual bar is capped at the top, while the large numeric countdown remains correct.

**High-contrast colour themes:** Solid Blue/Yellow, Black/Gold, Dark/Cyan, Black/White. No gradients or translucent overlays on the countdown.

**Keep screen on:** Optional screen wake lock while counting down. On supported browsers, the lock is acquired when running, released when paused or finished, and reacquired on return to a visible page. If denied by the browser or OS, Settings shows the actual status. Screen wake lock requires a secure context (HTTPS or localhost); battery-saver and other system restrictions can override it. Turning this on uses additional battery.

## PWA installation and updates

This app includes a web manifest, regular and dedicated maskable icons, and a versioned service worker. The app shell is precached on first successful online visit and can then be launched offline. Countdown state and settings are stored locally; the timer uses a persisted real-world deadline rather than accumulating interval ticks.

The service worker checks for updates when the app opens and when it comes back online. A new version is **not forced into an active session**. Open **Settings → Check for updates**, then choose **Install ready update** to activate and reload when convenient. An active timer is restored after reload.

The standalone `index.html` works by itself, without an external CDN, but full offline PWA installation requires serving the files together over **HTTPS** or **localhost**. This repository is compatible with GitHub Pages at `/audiocountdown/`.

**Browser limitations:** Page backgrounding can suppress speech, and a browser can revoke the wake lock at any moment. Installation and speech may differ between browsers and screen readers. Do not rely on a PWA for safety-critical alarms. Native speech synthesis can overlap VoiceOver/TalkBack, so test using intended devices.

## Tests

Install Python Playwright and Chromium, and run:

```sh
python tests/test_timer.py
python tests/test_touch.py
python tests/test_frequency.py
python tests/test_settings.py
node tests/test_worker.cjs
```

The browser tests exercise screen sizes, tap/hold, mute, voice frequencies with a virtual clock, 24-hour ruler midpoint, scale changes without changing a running timer, immediate palette changes, persisted state with mocked storage, and mocked wake-lock request/release. The worker test exercises precaching, targeted cache cleanup, offline navigation fallback, and explicit update activation. **A real installed/offline PWA re-launch and VoiceOver/TalkBack interaction still require manual device testing**; the build environment blocks Chromium from navigating to its local HTTP server.
