# Talking Visual Countdown — accessible full-screen PWA

A single-screen, tap-first talking timer for people with low vision or blindness. The countdown itself fills the entire screen. Settings are hidden in an accessible drawer that you can open from the small gear button at the top.

## Core interactions

- **Tap** at any height of the ruler to set the duration and start the countdown immediately. Drag to adjust the duration. Spoken previews wait until your finger settles for about 420 ms; movements smaller than 14 screen pixels are ignored to prevent an announced time changing from tiny finger drift. On release, the app confirms the **exact** duration that starts.
- **Tap an active timer** to hear the remaining time, without resetting it.
- **Hold for one second** for a warning. Keep holding for **three additional seconds** to clear the timer, followed by “Timer cleared.” Releasing during the warning cancels clearing.
- The large **PAUSE/RESUME** and **HEAR TIME** buttons appear only during a timer. There is also a keyboard/screen-reader-focusable Clear timer control requiring two activations within five seconds.
- Voice on/off is available only in **Settings → Spoken feedback**, not on the timer face. Choosing **Voice off** cancels queued speech. Settings are remembered next time.

## Settings drawer

The timer remains full-screen when the drawer is closed. Settings persist in local storage on this device.

**Spoken feedback:** Voice off entirely; only when tapped; key moments; every 5 minutes, every minute, every 30 seconds, or every 15 seconds. Except for voice-off and tap-only modes, the automatic schedule includes 30 seconds and the final spoken ten seconds. All voice-on modes still speak when the timer is touched. While setting it, the app waits until your finger is steady before announcing the selected duration. A final announcement always confirms the actual duration when it begins. The delay and small movement threshold reduce stale announcements caused by touch jitter and speech-synthesis latency.

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
python tests/test_selection_feedback.py
python tests/test_accessibility.py
node tests/test_worker.cjs
```

The browser tests exercise screen sizes, tap/hold, mute through Settings, spoken-selection stability, voice frequencies with a virtual clock, 24-hour ruler midpoint, scale changes without changing a running timer, immediate palette changes, persisted state with mocked storage, and mocked wake-lock request/release. The worker test exercises precaching, targeted cache cleanup, offline navigation fallback, and explicit update activation. **A real installed/offline PWA re-launch and VoiceOver/TalkBack interaction still require manual device testing**; the build environment blocks Chromium from navigating to its local HTTP server.

## Accessibility improvements (v8)

The timer is intended to work with or without a screen reader. **TalkBack (Android) and VoiceOver (Apple) cannot be reliably detected from a web page**, and Web Speech synthesis may be separate from the device's screen-reader speech. Open **Settings → Screen reader and browser speech** and select **Use TalkBack or VoiceOver for announcements** when a screen reader is active. This switches off the app's browser speech to avoid two voices competing; it uses semantic controls and ARIA live regions for important updates. A screen reader's own speech settings remain controlled by the operating system. In screen reader mode, final countdown announcements are simplified to 10, 5 and 1 seconds rather than flooding the announcement queue.

**Native, labelled controls:** Settings starts with the Accessible timer controls section. Set an exact duration through **Hours**, **Minutes** and **Seconds** number fields with the on-screen or braille keyboard. Large native buttons can add or subtract a minute, **Start**, **Pause or resume**, **Hear remaining time**, and **Clear timer**. Starting a replacement timer or clearing an active timer requires confirming with the same button twice within seven seconds, to prevent accidental loss. These controls do not require long presses or pointer coordinates, and they work with switch access and keyboard navigation.

**Direct ruler remains available:** The full-screen vertical ruler is a keyboard-focusable, ARIA-labelled slider while choosing a duration, with correctly expressed units and adjustable semantics. Arrow keys (or supported screen-reader adjustable gestures) change its value; Enter starts. Once running or paused, the surface becomes an accessible button that reads the remaining time instead of remaining a continually changing slider. The numeric countdown itself is a separate non-interrupting timer. Screen-reader activation can also start a selected duration using a synthetic click. Some touch-screen readers do not emit the correct events for custom sliders: in that case, the native duration fields in Settings are the recommended alternative.

**Semantic countdown and feedback:** There is a separate `role="timer"` with `aria-live="off"`, so screen readers can navigate to read the current countdown without being interrupted each second. Time selections, start/stop, clear confirmations, and milestones use an `aria-live="polite"` status region. Urgent clear-hold warnings and completion use an assertive alert. Messages triggered in the modal settings drawer are also exposed inside the drawer, since some screen readers ignore live regions behind an active modal.

**Browser voice controls:** Select an installed system voice (when available), choose slow/normal/fast/very fast speaking speed, and use **Test speech**. The voice list refreshes when the browser announces new speech voices. If the browser cannot synthesize speech, the status message recommends screen-reader mode and checking the operating system speech engine. App-generated audio tones are silenced in screen-reader mode.

The full-screen display retains high-contrast solid themes, 48+ pixel touch targets, visible keyboard focus rings, large digits, system forced-colour support, reduced-motion support, and a settings drawer with keyboard focus trapping and Escape to close. Browser zoom and native text magnification can help, though extreme display zoom may reduce the visible ruler height.

### Accessibility test coverage

Run `python tests/test_accessibility.py` and `python tests/test_sr_cues.py` for automated Chromium checks of: native numeric labels and input modes, keyboard focus handling, modal semantics, four viewport sizes, synthetic screen-reader activation, timer live-region semantics, precise start and two-step clear/replace safeguards, browser voice/rate selection, TalkBack/VoiceOver mode silencing the second voice, and accessibility-tree exposure of labelled inputs and actions.

**Manual acceptance tests (required before claiming platform-level support):**

1. On an actual Android phone, enable TalkBack. Navigate to Settings, activate the screen-reader option, enter an exact time with the native fields, start, hear time, pause/resume, and clear via two-step confirmation. Check that the Android speech engine and browser voices do not overlap. Test the adjustable timer as an optional alternate method.
2. On iPhone/iPad, repeat with VoiceOver using Safari and with the PWA installed from Add to Home Screen; check focus order, double-tap activation, announcements within Settings, and two-step confirmation.
3. Test large system font sizes, Display Zoom, high-contrast/reduced-motion settings, switch control, keyboard or Bluetooth keyboard, external Braille display if available, low-battery/power-saver mode, silent mode, offline PWA launch, and returning from background. The browser may suspend TTS while not foregrounded; it cannot guarantee background alerts.
