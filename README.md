# Visual Countdown — accessible talking timer

This is the low-vision and blindness-focused revision of MicroSwitchers' Visual Countdown app. It keeps the original **touch / drag / release** interaction, with speech as a primary feature instead of an optional settings panel.

## What people can do without opening a menu

- **Touch the ruler:** the selected duration is spoken immediately. Slide your finger up or down and it announces changing durations as you move (throttled slightly so speech does not pile up). Release your finger to start the countdown, with spoken confirmation.
- **Touch the ruler while a timer is already running or paused:** hear the remaining time. This DOES NOT reset the countdown.
- **Press Hear time:** a large, always-visible button speaks the remaining or selected time on demand, even if automatic spoken updates are off.
- **Press Start / Pause / Resume, Restart, or Clear:** distinct, large, always-visible controls, with spoken state changes.
- **Press + 1 min / - 1 min:** accessible exact adjustments, with spoken confirmation, including while the countdown runs.
- **Select a preset:** six one-tap 1–30-minute timers, or enter minutes and seconds for a custom duration up to two hours.
- **Choose a voice cadence:** three plainly visible choices (Often, Every minute, Key moments); no nested audio/settings menus.
- **Toggle Voice** from the top bar. Speech is **on by default** for new visitors. An optional Tones button adds simple cues and a finish chime.
- **Change ruler range** with a visible cycling button; selected or active time is never truncated silently.

## Spoken countdown schedule

Every cadence speaks the last **10 seconds as single numbers** and announces *Time is up* on completion. Above that:

- **Often (default):** every minute above 5 minutes; every 30 seconds from 5 to 1 minute; every 10 seconds during the final minute.
- **Every minute:** each minute, plus 30 and 20 seconds.
- **Key moments:** every 5 minutes, plus 60, 30 and 20 seconds.

The app uses the browser's native `speechSynthesis` interface. Unlike recorded audio files, speech quality and timing vary by device, available voices, accessibility setup, and browser. A user gesture may be required to activate sound; background tabs may suspend or silence speech. The countdown **time itself** is deadline-based and catches up after sleep/backgrounding. The app cannot guarantee uninterrupted spoken reminders when the browser is not active; this should not be relied on as a safety-critical alarm.

## Accessibility features

- Dark, high-contrast timer background; warm filled progress bar; very large white countdown digits.
- Large minimum-size touch targets and visible keyboard focus.
- Semantic controls with descriptive accessible names and state (`aria-pressed`, `aria-valuetext`).
- Keyboard: focus the ruler; arrow keys adjust, Home/End jump to limits, Enter/Space starts. The main button pauses/resumes. Tab navigates all controls.
- Distinctive live-region announcements on actions and completion; time digits themselves do **not** act as a one-second live region. This limits excessive screen-reader chatter.
- Screen readers (including VoiceOver and TalkBack) may reserve touch gestures for navigation. The accessible buttons and keyboard commands provide a non-drag alternative.
- Visual and audio feedback provide redundant modalities; audio can be turned off when using a screen reader to avoid two simultaneous voices.
- Offline-capable on HTTPS through a network-first service worker; optional screen wake lock where supported; no accounts, analytics, fonts, frameworks, or external network dependencies.

## Test

Run `node tests/smoke.cjs`. The dependency-free smoke test simulates spoken drag feedback, release-to-start, touch-to-hear while running, accurate elapsed time, time adjustment, pause/resume, final-second speech, finish, restart/clear, and voice-on/off behavior.

**Browser/device QA is still necessary** before production use. In particular test speech synthesis and touch semantics on Android Chrome with TalkBack and iOS Safari with VoiceOver, and test portrait/landscape, installed-PWA mode, and screen wake-lock behavior. Browser rendering could not be exercised in the present build environment.

## Deploy

Place the app files in the root of `MicroSwitchers/audiocountdown` on `main` (or merge the review branch). GitHub Pages will serve the update at its current URL. Run a static server locally for PWA testing (`python -m http.server 8000`), or open the standalone HTML version for quick testing without an install. Offline caching via a service worker requires HTTPS or localhost.
