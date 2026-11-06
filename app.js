(() => {
  'use strict';

  const STORAGE_KEY = 'visual-countdown-v2';
  const SCALES = [300, 600, 900, 1800, 3600, 7200];
  const COLORS = {
    coral: { start: '#f46e51', end: '#ff9771' },
    teal: { start: '#238e88', end: '#59c9ae' },
    violet: { start: '#7966ca', end: '#a99bec' },
    gold: { start: '#bb7d2b', end: '#e9b95a' }
  };
  const defaults = { scale: 3600, soundMode: 'gentle', voiceMode: 'milestones', volume: 50, color: 'coral', contrast: false, keepAwake: true, muted: false };
  const $ = id => document.getElementById(id);
  const els = {
    stage: $('timerStage'), canvas: $('timerCanvas'), status: $('stageStatus'), scaleLabel: $('stageScale'),
    kicker: $('timeKicker'), digits: $('timeDigits'), description: $('timeDescription'),
    percent: $('percentLabel'), finishAt: $('finishAt'), startPause: $('startPause'),
    startPauseIcon: $('startPauseIcon'), startPauseLabel: $('startPauseLabel'), restart: $('restart'),
    clear: $('clear'), fsPause: $('fsPause'), fsRestart: $('fsRestart'), fsExit: $('fsExit'),
    fullscreenButton: $('fullscreenButton'), soundShortcut: $('soundShortcut'),
    presets: $('presets'), customForm: $('customForm'), customMinutes: $('customMinutes'),
    customSeconds: $('customSeconds'), scaleSelect: $('scaleSelect'), soundMode: $('soundMode'),
    voiceMode: $('voiceMode'), volume: $('volume'), volumeValue: $('volumeValue'),
    testSound: $('testSound'), contrast: $('highContrast'), keepAwake: $('keepAwake'),
    announcements: $('srAnnouncements')
  };
  const ctx = els.canvas.getContext('2d', { alpha: false });
  const config = { ...defaults };
  const timer = { phase: 'ready', totalMs: 0, remainingMs: 0, endEpoch: 0, lastWholeSecond: 0 };
  let pointerId = null;
  let audioContext = null;
  let wakeLock = null;
  let frame = 0;
  let lastRenderSecond = -1;
  let lastSave = 0;
  let lastPaintAt = 0;
  let canvasWidth = 1;
  let canvasHeight = 1;

  function safelyRead() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); }
    catch (_) { return null; }
  }
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: 2, config: { ...config }, timer: {
          phase: timer.phase === 'setting' ? 'ready' : timer.phase,
          totalMs: timer.totalMs, remainingMs: timer.remainingMs, endEpoch: timer.endEpoch
        }
      }));
    } catch (_) { /* Private browsing / storage unavailable: timer still works. */ }
    lastSave = Date.now();
  }
  function restore() {
    const saved = safelyRead();
    if (!saved || saved.version !== 2) return;
    const s = saved.config || {};
    if (SCALES.includes(s.scale)) config.scale = s.scale;
    if (['gentle', 'ticking', 'silent'].includes(s.soundMode)) config.soundMode = s.soundMode;
    if (['milestones', 'minute', 'off'].includes(s.voiceMode)) config.voiceMode = s.voiceMode;
    if (Number.isFinite(s.volume)) config.volume = Math.min(100, Math.max(0, s.volume));
    if (Object.hasOwn(COLORS, s.color)) config.color = s.color;
    for (const key of ['contrast', 'keepAwake', 'muted']) if (typeof s[key] === 'boolean') config[key] = s[key];
    const t = saved.timer || {};
    if (!['running', 'paused', 'finished', 'ready'].includes(t.phase)) return;
    const total = Number(t.totalMs), remaining = Number(t.remainingMs), end = Number(t.endEpoch);
    if (![total, remaining, end].every(Number.isFinite) || total < 0 || total > 7200000 || remaining < 0 || remaining > 7200000) return;
    timer.phase = t.phase;
    timer.totalMs = total;
    timer.remainingMs = remaining;
    timer.endEpoch = end;
    if (timer.phase === 'running') {
      timer.remainingMs = Math.max(0, timer.endEpoch - Date.now());
      if (timer.remainingMs === 0) timer.phase = 'finished';
    }
    timer.lastWholeSecond = Math.ceil(timer.remainingMs / 1000);
    fitScale(Math.ceil(Math.max(timer.remainingMs, timer.totalMs) / 1000));
  }
  function fitScale(seconds) {
    if (seconds > config.scale) config.scale = SCALES.find(x => x >= seconds) || 7200;
  }
  function secondsRemaining() { return Math.ceil(timer.remainingMs / 1000); }
  function formatClock(seconds) {
    seconds = Math.max(0, Math.ceil(seconds));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours) return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  function formatWords(seconds) {
    seconds = Math.ceil(seconds);
    if (seconds <= 0) return 'zero seconds';
    const m = Math.floor(seconds / 60), s = seconds % 60;
    return [m ? `${m} ${m === 1 ? 'minute' : 'minutes'}` : '', s ? `${s} ${s === 1 ? 'second' : 'seconds'}` : ''].filter(Boolean).join(' and ');
  }
  function announceForScreenReader(message) {
    els.announcements.textContent = '';
    requestAnimationFrame(() => { els.announcements.textContent = message; });
  }
  function unlockAudio() {
    if (!audioContext) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        try { audioContext = new AudioCtx(); } catch (_) { /* Optional audio. */ }
      }
    }
    if (audioContext && audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    // Browser speech synthesis needs a user gesture on some platforms.
    if ('speechSynthesis' in window) {
      try { window.speechSynthesis.getVoices(); } catch (_) {}
    }
  }
  function tone(frequency, startOffset = 0, duration = .12, loudness = .16, type = 'sine') {
    if (!audioContext || audioContext.state !== 'running' || config.muted || config.soundMode === 'silent' || config.volume <= 0) return;
    const now = audioContext.currentTime + startOffset;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0002, loudness * config.volume / 100), now + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + .015);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
  function chime() {
    tone(523.25, 0, .25, .20, 'sine');
    tone(659.25, .19, .25, .18, 'sine');
    tone(783.99, .38, .37, .20, 'sine');
    tone(1046.5, .54, .6, .17, 'sine');
  }
  function speak(message) {
    if (config.muted || config.voiceMode === 'off' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(message);
      utterance.rate = .94;
      utterance.volume = config.volume / 100;
      window.speechSynthesis.speak(utterance);
    } catch (_) { /* Speech varies across browsers. */ }
  }
  function cancelSpeech() {
    if ('speechSynthesis' in window) try { window.speechSynthesis.cancel(); } catch (_) {}
  }
  function voiceMilestone(second) {
    if (config.voiceMode === 'off' || second <= 0) return false;
    if (config.voiceMode === 'minute') return second % 60 === 0 || second === 30 || second === 10;
    return (second > 300 && second % 300 === 0) || [300, 180, 120, 60, 30, 10].includes(second);
  }
  function audioSecondCue(second) {
    if (config.soundMode === 'silent' || config.muted || !second) return;
    if (config.soundMode === 'ticking') {
      if (second % 60 === 0) tone(740, 0, .18, .15, 'triangle');
      else tone(560, 0, .045, .075, 'sine');
    } else if (second % 60 === 0 || second <= 5) {
      tone(second <= 5 ? 780 : 660, 0, .12, .14, 'sine');
    }
  }
  function applyAudioCue(oldSec, newSec) {
    if (oldSec <= newSec || oldSec - newSec > 2 || document.visibilityState !== 'visible') return;
    for (let sec = oldSec - 1; sec >= newSec; sec--) {
      if (sec > 0) {
        audioSecondCue(sec);
        if (voiceMilestone(sec)) {
          const words = `${formatWords(sec)} remaining`;
          speak(words);
          announceForScreenReader(words);
        }
      }
    }
  }
  async function holdScreen() {
    if (!config.keepAwake || timer.phase !== 'running' || document.visibilityState !== 'visible' || !('wakeLock' in navigator) || wakeLock) return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; }, { once: true });
      if (timer.phase !== 'running' || !config.keepAwake) releaseScreen();
    } catch (_) { /* Not supported or user declined. */ }
  }
  function releaseScreen() {
    if (wakeLock) { const lock = wakeLock; wakeLock = null; lock.release().catch(() => {}); }
  }
  function start(seconds, shouldSpeak = true) {
    seconds = Math.round(Number(seconds));
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 7200) return;
    unlockAudio();
    cancelSpeech();
    fitScale(seconds);
    timer.phase = 'running';
    timer.totalMs = seconds * 1000;
    timer.remainingMs = seconds * 1000;
    timer.endEpoch = Date.now() + timer.remainingMs;
    timer.lastWholeSecond = seconds;
    lastRenderSecond = -1;
    holdScreen();
    if (shouldSpeak) speak(`Counting down ${formatWords(seconds)}`);
    announceForScreenReader(`Started ${formatWords(seconds)} countdown`);
    render(true);
    save();
  }
  function pause() {
    if (timer.phase !== 'running') return;
    timer.remainingMs = Math.max(0, timer.endEpoch - Date.now());
    if (timer.remainingMs <= 0) { finish(); return; }
    timer.phase = 'paused';
    releaseScreen(); cancelSpeech();
    announceForScreenReader(`Paused at ${formatWords(secondsRemaining())}`);
    render(true); save();
  }
  function resume() {
    if (timer.phase !== 'paused' || timer.remainingMs <= 0) return;
    unlockAudio();
    timer.phase = 'running';
    timer.endEpoch = Date.now() + timer.remainingMs;
    timer.lastWholeSecond = secondsRemaining();
    holdScreen();
    announceForScreenReader('Countdown resumed');
    render(true); save();
  }
  function finish(playAudio = true) {
    timer.phase = 'finished';
    timer.remainingMs = 0;
    timer.endEpoch = 0;
    releaseScreen();
    if (playAudio) {
      chime();
      if (config.voiceMode !== 'off') window.setTimeout(() => speak('Time is up'), 720);
    }
    announceForScreenReader('Time is up');
    render(true); save();
  }
  function clear() {
    cancelSpeech(); releaseScreen();
    timer.phase = 'ready'; timer.remainingMs = 0; timer.totalMs = 0; timer.endEpoch = 0;
    timer.lastWholeSecond = 0; lastRenderSecond = -1;
    announceForScreenReader('Timer cleared');
    render(true); save();
  }
  function restart() {
    if (timer.totalMs <= 0) return;
    start(Math.round(timer.totalMs / 1000));
  }
  function toggle() {
    if (timer.phase === 'running') pause();
    else if (timer.phase === 'paused') resume();
    else if (timer.phase === 'ready' && timer.remainingMs > 0) start(secondsRemaining());
    else if (timer.phase === 'finished') restart();
  }
  function pickSeconds(clientY) {
    const r = els.stage.getBoundingClientRect();
    const fraction = 1 - (clientY - r.top) / r.height;
    const unclamped = Math.max(0, Math.min(1, fraction)) * config.scale;
    const step = config.scale <= 600 ? 5 : config.scale <= 1800 ? 15 : 60;
    return Math.max(0, Math.min(config.scale, Math.round(unclamped / step) * step));
  }
  function selectForPreview(seconds) {
    cancelSpeech();
    releaseScreen();
    timer.phase = 'setting';
    timer.remainingMs = seconds * 1000;
    timer.totalMs = seconds * 1000;
    timer.endEpoch = 0;
    render(true);
  }
  function currentRemaining() {
    if (timer.phase === 'running') return Math.max(0, timer.endEpoch - Date.now());
    return timer.remainingMs;
  }
  function tick() {
    if (timer.phase === 'running') {
      const old = timer.lastWholeSecond;
      timer.remainingMs = currentRemaining();
      const next = secondsRemaining();
      if (next !== old) {
        timer.lastWholeSecond = next;
        if (next > 0) applyAudioCue(old, next);
        if (next === 0) { finish(true); }
      }
      if (Date.now() - lastSave > 10000) save();
    }
    render();
    frame = window.requestAnimationFrame(tick);
  }
  function updateSettingsForm() {
    els.scaleSelect.value = String(config.scale);
    els.soundMode.value = config.soundMode;
    els.voiceMode.value = config.voiceMode;
    els.volume.value = String(config.volume);
    els.volumeValue.textContent = `${config.volume}%`;
    els.contrast.checked = config.contrast;
    els.keepAwake.checked = config.keepAwake;
    document.body.classList.toggle('high-contrast', config.contrast);
    for (const button of document.querySelectorAll('.color-choice')) {
      const selected = button.dataset.color === config.color;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
    els.soundShortcut.classList.toggle('is-muted', config.muted);
    els.soundShortcut.setAttribute('aria-label', config.muted ? 'Unmute all audio' : 'Mute all audio');
    els.soundShortcut.title = config.muted ? 'Unmute all audio' : 'Mute all audio';
    els.soundShortcut.innerHTML = config.muted
      ? '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Z M17 9l5 6m0-6-5 6" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M17 9a5 5 0 0 1 0 6M19.5 6a9 9 0 0 1 0 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  }
  function paint() {
    if (!ctx) return;
    const w = canvasWidth, h = canvasHeight;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = config.contrast ? '#07151a' : '#22303a';
    ctx.fillRect(0, 0, w, h);

    const value = Math.min(config.scale, Math.max(0, timer.remainingMs / 1000));
    const filled = value / config.scale * h;
    if (filled > 0) {
      const color = COLORS[config.color];
      const gradient = ctx.createLinearGradient(0, h, 0, Math.max(0, h - filled));
      gradient.addColorStop(0, color.start);
      gradient.addColorStop(1, color.end);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, h - filled, w, filled);
      if (!config.contrast) {
        ctx.fillStyle = 'rgba(255,255,255,.045)';
        for (let i = h - filled + 16; i < h; i += 23) ctx.fillRect(0, i, w, 1);
      }
    }

    const scale = config.scale;
    const step = scale <= 300 ? 30 : scale <= 900 ? 60 : scale <= 1800 ? 120 : scale <= 3600 ? 300 : 600;
    const majorStep = scale <= 300 ? 60 : scale <= 900 ? 180 : scale <= 1800 ? 300 : scale <= 3600 ? 600 : 1200;
    for (let sec = 0; sec <= scale; sec += step) {
      const y = h - sec / scale * h;
      const isMajor = sec % majorStep === 0 || sec === scale;
      const isEnd = sec === 0 || sec === scale;
      ctx.lineWidth = isMajor ? 2 : 1;
      ctx.strokeStyle = config.contrast ? 'rgba(255,255,255,.52)' : (isMajor ? 'rgba(255,255,255,.31)' : 'rgba(255,255,255,.15)');
      ctx.beginPath();
      ctx.moveTo(0, Math.round(y) + .5);
      ctx.lineTo(isMajor ? w : Math.min(w, 51), Math.round(y) + .5);
      ctx.stroke();
      if (isMajor) {
        const label = `${sec / 60 < 1 ? `${sec}s` : `${sec / 60}m`}`;
        const yText = Math.min(h - 40, Math.max(42, y + (isEnd && sec === scale ? 8 : 0)));
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.font = `800 ${w < 400 ? 12 : 14}px system-ui, sans-serif`;
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(6,16,22,.75)';
        ctx.shadowBlur = 5;
        ctx.fillText(label, 18, yText);
        ctx.shadowBlur = 0;
      }
    }
    if (filled > 0 && filled < h) {
      const y = h - filled;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = config.contrast ? 5 : 3;
      ctx.shadowColor = 'rgba(0,0,0,.26)';
      ctx.shadowBlur = 9;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      ctx.shadowBlur = 0;
      const handleX = w - 28;
      ctx.beginPath(); ctx.arc(handleX, y, 11, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';ctx.fill();
      ctx.beginPath();ctx.arc(handleX, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#24313c';ctx.fill();
    }
  }
  function resizeCanvas() {
    const r = els.canvas.getBoundingClientRect();
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    canvasWidth = r.width; canvasHeight = r.height;
    if (!canvasWidth || !canvasHeight || !ctx) return;
    els.canvas.width = Math.round(canvasWidth * dpr);
    els.canvas.height = Math.round(canvasHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    render(true);
  }
  function render(force = false) {
    const secs = secondsRemaining();
    const phase = timer.phase;
    const now = performance.now();
    if (!force && secs === lastRenderSecond && (phase !== 'running' || now - lastPaintAt < 65)) return;
    lastRenderSecond = secs;
    lastPaintAt = now;
    paint();
    const statusWords = { ready: 'Ready', setting: 'Setting time', running: 'Counting down', paused: 'Paused', finished: 'Finished' };
    els.stage.dataset.state = phase;
    els.status.lastChild.textContent = statusWords[phase];
    els.scaleLabel.textContent = `${config.scale / 60}-minute scale`;
    els.kicker.textContent = phase === 'finished' ? 'ALL DONE!' : phase === 'paused' ? 'TAKE YOUR TIME' : phase === 'running' ? 'TIME REMAINING' : phase === 'setting' ? 'RELEASE TO START' : 'YOUR TIME, AT A GLANCE';
    els.digits.textContent = formatClock(secs);
    els.description.textContent = phase === 'ready' ? (secs > 0 ? 'Press Start when you are ready' : 'Tap or drag to set a countdown')
      : phase === 'setting' ? (secs > 0 ? 'Release to start this countdown' : 'Release to clear the timer')
      : phase === 'running' ? 'Watch time gently disappear'
      : phase === 'paused' ? 'Your countdown is paused'
      : 'Time is up. Ready for another?';
    const proportion = timer.totalMs > 0 ? Math.round(timer.remainingMs / timer.totalMs * 100) : 0;
    els.percent.textContent = phase === 'finished' ? 'Complete' : phase === 'ready' && secs === 0 ? 'Ready to begin' : `${proportion}% remaining`;
    if (phase === 'running') {
      const end = new Date(timer.endEpoch);
      els.finishAt.textContent = `Ends ${end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
    } else els.finishAt.textContent = phase === 'paused' ? 'Timer on hold' : '';
    els.startPause.disabled = (phase === 'ready' && secs === 0) || phase === 'setting';
    els.startPauseLabel.textContent = phase === 'running' ? 'Pause' : phase === 'paused' ? 'Resume' : phase === 'finished' ? 'Again' : 'Start';
    els.startPauseIcon.textContent = phase === 'running' ? 'Ⅱ' : phase === 'finished' ? '↻' : '▶';
    els.restart.disabled = timer.totalMs <= 0 || phase === 'setting';
    els.clear.disabled = (phase === 'ready' && secs === 0) || phase === 'setting';
    els.fsPause.disabled = els.startPause.disabled;
    els.fsPause.textContent = els.startPauseLabel.textContent;
    els.fsRestart.disabled = els.restart.disabled;
    els.stage.setAttribute('aria-valuemax', String(config.scale));
    els.stage.setAttribute('aria-valuenow', String(secs));
    els.stage.setAttribute('aria-valuetext', `${formatWords(secs)}. ${statusWords[phase]}.`);
  }

  els.stage.addEventListener('pointerdown', e => {
    if (e.target.closest('button') || e.button !== 0) return;
    e.preventDefault();
    unlockAudio();
    pointerId = e.pointerId;
    try { els.stage.setPointerCapture(pointerId); } catch (_) {}
    selectForPreview(pickSeconds(e.clientY));
  });
  els.stage.addEventListener('pointermove', e => {
    if (pointerId !== e.pointerId || timer.phase !== 'setting') return;
    e.preventDefault();
    const s = pickSeconds(e.clientY);
    if (s !== secondsRemaining()) selectForPreview(s);
  });
  els.stage.addEventListener('pointerup', e => {
    if (pointerId !== e.pointerId) return;
    e.preventDefault();
    pointerId = null;
    if (timer.phase !== 'setting') return;
    const seconds = secondsRemaining();
    if (seconds > 0) start(seconds);
    else clear();
  });
  els.stage.addEventListener('pointercancel', e => {
    if (pointerId !== e.pointerId) return;
    pointerId = null;
    if (timer.phase === 'setting') {
      timer.phase = 'ready';
      render(true); save();
    }
  });
  els.stage.addEventListener('keydown', e => {
    if (e.target !== els.stage) return;
    const current = secondsRemaining();
    const step = config.scale <= 600 ? 5 : config.scale <= 1800 ? 15 : 60;
    if (['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      let s = current;
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') s += step;
      if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') s -= step;
      if (e.key === 'Home') s = 0;
      if (e.key === 'End') s = config.scale;
      s = Math.max(0, Math.min(config.scale, s));
      selectForPreview(s);
      timer.phase = 'ready';
      render(true); save();
    } else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); }
  });
  els.startPause.addEventListener('click', toggle);
  els.restart.addEventListener('click', restart);
  els.clear.addEventListener('click', clear);
  els.fsPause.addEventListener('click', e => { e.stopPropagation(); toggle(); });
  els.fsRestart.addEventListener('click', e => { e.stopPropagation(); restart(); });
  els.fsExit.addEventListener('click', e => { e.stopPropagation(); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); });
  els.fullscreenButton.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (els.stage.requestFullscreen) els.stage.requestFullscreen().catch(() => announceForScreenReader('Fullscreen unavailable on this browser'));
    else announceForScreenReader('Fullscreen is not supported on this browser');
  });
  els.presets.addEventListener('click', e => {
    const button = e.target.closest('[data-seconds]');
    if (button) start(Number(button.dataset.seconds));
  });
  els.customForm.addEventListener('submit', e => {
    e.preventDefault();
    const m = els.customMinutes.valueAsNumber, s = els.customSeconds.valueAsNumber;
    const total = m * 60 + s;
    if (!Number.isInteger(m) || !Number.isInteger(s) || m < 0 || m > 120 || s < 0 || s > 59 || total <= 0 || total > 7200) {
      els.customSeconds.setCustomValidity('Please enter a duration between 1 second and 120 minutes.');
      els.customSeconds.reportValidity();
      return;
    }
    els.customSeconds.setCustomValidity('');
    start(total);
  });
  els.customMinutes.addEventListener('input', () => els.customSeconds.setCustomValidity(''));
  els.customSeconds.addEventListener('input', () => els.customSeconds.setCustomValidity(''));
  els.scaleSelect.addEventListener('change', () => {
    const wanted = Number(els.scaleSelect.value);
    config.scale = wanted;
    fitScale(secondsRemaining());
    if (config.scale !== wanted) announceForScreenReader('Scale expanded to fit remaining time');
    updateSettingsForm();render(true);save();
  });
  els.soundMode.addEventListener('change', () => {config.soundMode = els.soundMode.value;save();});
  els.voiceMode.addEventListener('change', () => {config.voiceMode = els.voiceMode.value;if (config.voiceMode === 'off') cancelSpeech();save();});
  els.volume.addEventListener('input', () => { config.volume = Number(els.volume.value);els.volumeValue.textContent = `${config.volume}%`;save(); });
  els.testSound.addEventListener('click', () => {
    unlockAudio();
    if ((config.soundMode === 'silent' || config.volume === 0) && (config.voiceMode === 'off' || config.volume === 0)) {
      announceForScreenReader('Enable sound or voice and raise the volume to test');return;
    }
    chime(); speak('Five minutes remaining');
    announceForScreenReader('Playing test sound and speech');
  });
  els.soundShortcut.addEventListener('click', () => {
    config.muted = !config.muted;
    if (config.muted) cancelSpeech();
    else unlockAudio();
    updateSettingsForm();save();
    announceForScreenReader(config.muted ? 'All sounds and speech muted' : 'All sounds and speech unmuted');
  });
  document.querySelectorAll('.color-choice').forEach(button => button.addEventListener('click', () => {
    config.color = button.dataset.color;
    updateSettingsForm();render(true);save();
  }));
  els.contrast.addEventListener('change', () => { config.contrast = els.contrast.checked;updateSettingsForm();render(true);save(); });
  els.keepAwake.addEventListener('change', () => { config.keepAwake = els.keepAwake.checked;config.keepAwake ? holdScreen() : releaseScreen();save(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (timer.phase === 'running') {
        timer.remainingMs = currentRemaining();
        timer.lastWholeSecond = secondsRemaining();
        if (timer.remainingMs <= 0) finish(false);
        else holdScreen();
      }
      render(true);
    } else releaseScreen();
  });
  window.addEventListener('pagehide', save);
  document.addEventListener('fullscreenchange', () => {
    const isFull = document.fullscreenElement === els.stage;
    els.fullscreenButton.setAttribute('aria-label', isFull ? 'Exit fullscreen' : 'Make timer fullscreen');
    window.setTimeout(resizeCanvas, 50);
  });
  window.addEventListener('resize', resizeCanvas);
  if ('ResizeObserver' in window) new ResizeObserver(resizeCanvas).observe(els.stage);

  restore();
  updateSettingsForm();
  resizeCanvas();
  render(true);
  frame = window.requestAnimationFrame(tick);

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').then(registration => registration.update()).catch(() => {});
    });
  }
})();
