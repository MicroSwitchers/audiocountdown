# Talking Visual Countdown — full-screen accessibility rebuild

This version restores the original idea: **the complete viewport is the timer**. No page scrolling, presets, forms, sidebars, or settings pages. The HTML contains all CSS and JavaScript, so a single local file also runs without additional resources.

## Using the timer

- **Touch anywhere in the timer area** to choose a duration on the 0–60 minute vertical scale. Slide up or down for adjustment; the currently selected time is spoken during the gesture. **Release to start**. The timer gives a spoken confirmation.
- **Tap the active timer** to hear how much time is left. The same action works while paused.
- Use the three large on-screen controls for **Start/Pause/Resume**, **Hear time**, and **Reset**. The small speaker icon turns speech on/off; the adjacent icon requests browser full screen when supported. In installed PWA mode the app uses a fullscreen display.
- Keyboard/assistive technology: focus the timer slider; arrow keys adjust by one minute, Shift+arrow by five minutes, Home and End set 0 and 60 minutes; Enter/Space starts/pauses/resumes. The timer has a meaningful accessible name, value, and instructions. The large controls are semantic HTML buttons.
- Speech is enabled by default, with announcements while setting, at start/pause/resume, every remaining minute, 30 seconds, 10 seconds, each of the last nine seconds, and at completion. Tap **Hear time** at any moment for an immediate report. Gentle tick tones are synthesized locally after a user gesture.
- A timer continues to use a wall-clock deadline if the app is backgrounded. Automatic audible reminders may be suspended while the browser is backgrounded. Device speech voices depend on the browser/OS and may overlap with a screen reader.
- Timer state and the speech toggle are restored after reload. Wake Lock is requested while running on supporting devices.

## Deploying on GitHub Pages

Publish the contents of this folder at the repository root. On HTTPS, the service worker makes the timer available offline after its first successful visit. On a normal browser tab, edge-to-edge mode fills the *page viewport*; the browser's own address bar can be hidden by using the fullscreen button where supported or installing the web app on a home screen.

## Testing

Run `python tests/browser_test.py` with Python Playwright and Chromium. This test loads the self-contained HTML into a real browser page without relying on network access. Manually test speech on Android TalkBack, iOS VoiceOver, and desktop screen readers because their speech engines and gesture handling vary.
