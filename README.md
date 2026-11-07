# Talking Visual Countdown — tap-first, high-contrast timer

A full-screen, single-file talking countdown designed for people with low vision or blindness. The page is the timer: no dashboard, settings menus, scrolling, or remote dependencies.

## Touch interactions

- **Tap any height on the 0–60-minute ruler** to set and immediately start a countdown. A drag is optional if you want to refine the time before releasing; the app speaks the selection as you go.
- **Tap the running or paused timer** to hear the exact remaining time. A tap cannot reset the active timer.
- **Press and hold on an active timer:** at 1 second, the app speaks **“Keep holding for two more seconds to clear the timer.”** and shows a solid yellow warning. Hold continuously until 3 seconds to clear. The app says **“Timer cleared.”**
- Releasing after the warning but before 3 seconds cancels clearing and speaks **“Clear cancelled.”** Moving the finger too far also cancels clearing.
- The clearly labelled **VOICE ON / VOICE OFF** button mutes **all in-app speech and tones** when off; it also cancels speech already underway. Turning voice back on speaks “Voice on.” Screen-reader announcements remain available independently.
- During a countdown, there are large **PAUSE / RESUME** and **HEAR TIME** buttons. The idle screen has no bottom buttons, preserving access to short durations. Fullscreen is in the top-right corner.

## Screen reader / keyboard alternatives

The full-screen timer is an adjustable ARIA slider. Use arrow keys to select a duration, Shift+arrows for five-minute increments, Home/End for limits, Enter or Space to start/pause/resume. A screen-reader-focusable **Clear timer** control requires two activations within five seconds, as an alternative to the long press (which some assistive touch gestures can intercept).

## Browser and device considerations

The countdown is deadline-based, so it does not drift after a tab is backgrounded. The browser may suspend spoken announcements while in the background. Native browser speech and VoiceOver/TalkBack can overlap; test with the intended speech engine. The HTML works on its own; the included manifest, icons and service worker make it an installable offline-ready PWA when hosted over HTTPS.

## Tests

Install Python Playwright and Chromium, then run:

```sh
python tests/test_timer.py
python tests/test_touch.py
```

The scripts run Chromium with mocked speech synthesis, checking tap start, countdown, tap-to-hear, 1-second warning, early-release cancellation, 3-second clear, complete voice muting, responsive no-scroll viewports, and screen-reader fallback. Please also test on physical iOS and Android devices before merging.
