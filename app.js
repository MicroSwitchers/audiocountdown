(() => {
  'use strict';

  const STORAGE_KEY = 'visual-countdown-v3';
  const SCALES = [300, 900, 1800, 3600, 7200];
  const $ = id => document.getElementById(id);
  const els = {
    stage: $('timerStage'), canvas: $('timerCanvas'), status: $('stageStatus'), scaleLabel: $('stageScale'),
    scaleButton: $('scaleButton'), scaleValue: $('scaleValue'), kicker: $('timeKicker'), digits: $('timeDigits'),
    description: $('timeDescription'), percent: $('percentLabel'), finishAt: $('finishAt'),
    startPause: $('startPause'), startPauseLabel: $('startPauseLabel'), startPauseIcon: $('startPauseIcon'),
    hearTime: $('hearTime'), restart: $('restart'), clear: $('clear'),
    minus: $('minusMinute'), plus: $('plusMinute'), selected: $('selectedReadout'), presets: $('presets'),
    customForm: $('customForm'), customMinutes: $('customMinutes'), customSeconds: $('customSeconds'),
    voiceToggle: $('voiceToggle'), voiceToggleLabel: $('voiceToggleLabel'), testVoice: $('testVoice'),
    tonesToggle: $('tonesToggle'), fullscreenButton: $('fullscreenButton'), fullscreenApp: $('fullscreenApp'),
    announcements: $('srAnnouncements'), urgent: $('srUrgent')
  };
  const ctx = els.canvas.getContext('2d', { alpha: false });
  const config = { scale: 900, voiceEnabled: true, cadence: 'frequent', tones: false };
  const timer = { phase: 'ready', totalMs: 0, remainingMs: 0, endEpoch: 0, lastWholeSecond: 0 };
  let audioContext = null;
  let wakeLock = null;
  let pointerId = null;
  let previewBefore = null;
  let lastPreviewTime = -Infinity;
  let lastPreviewSeconds = null;
  let canvasWidth = 0;
  let canvasHeight = 0;
  let lastRenderSec = -1;
  let lastPaintAt = 0;
  let lastSave = 0;
  let voice = null;

  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  function stored(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { return null; }
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 3, config: { ...config }, timer: {
      phase: timer.phase === 'setting' ? 'ready' : timer.phase,
      totalMs: timer.totalMs, remainingMs: timer.remainingMs, endEpoch: timer.endEpoch
    } })); } catch (_) { /* Storage is optional. */ }
    lastSave = Date.now();
  }
  function restore() {
    const data = stored(STORAGE_KEY) || stored('visual-countdown-v2');
    if (!data || ![2, 3].includes(data.version)) return;
    const cfg = data.config || {};
    if (SCALES.includes(cfg.scale)) config.scale = cfg.scale;
    if (typeof cfg.voiceEnabled === 'boolean') config.voiceEnabled = cfg.voiceEnabled;
    else if (cfg.voiceMode === 'off') config.voiceEnabled = false;
    if (['frequent', 'standard', 'quiet'].includes(cfg.cadence)) config.cadence = cfg.cadence;
    else if (cfg.voiceMode === 'minute') config.cadence = 'standard';
    else if (cfg.voiceMode === 'milestones') config.cadence = 'quiet';
    if (typeof cfg.tones === 'boolean') config.tones = cfg.tones;
    else if (cfg.soundMode && cfg.soundMode !== 'silent') config.tones = true;
    const t = data.timer || {};
    if (!['ready', 'running', 'paused', 'finished'].includes(t.phase)) return;
    const total = Number(t.totalMs), remaining = Number(t.remainingMs), end = Number(t.endEpoch);
    if (![total, remaining, end].every(Number.isFinite) || total < 0 || total > 7200000 || remaining < 0 || remaining > 7200000) return;
    timer.phase = t.phase;
    timer.totalMs = total;
    timer.remainingMs = remaining;
    timer.endEpoch = end;
    if (timer.phase === 'running') {
      timer.remainingMs = clamp(end - Date.now(), 0, 7200000);
      if (timer.remainingMs === 0) timer.phase = 'finished';
    }
    timer.lastWholeSecond = secondsRemaining();
    fitScale(Math.ceil(Math.max(total, timer.remainingMs) / 1000));
  }
  function fitScale(seconds) {
    if (seconds > config.scale) config.scale = SCALES.find(n => n >= seconds) || 7200;
  }
  function formatClock(seconds) {
    seconds = Math.max(0, Math.ceil(seconds));
    const h = Math.floor(seconds / 3600), m = Math.floor(seconds % 3600 / 60), s = seconds % 60;
    return h ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }
  function formatWords(seconds) {
    seconds = Math.max(0, Math.ceil(seconds));
    if (!seconds) return 'zero seconds';
    const h = Math.floor(seconds / 3600), m = Math.floor(seconds % 3600 / 60), s = seconds % 60;
    return [h ? `${h} ${h === 1 ? 'hour' : 'hours'}` : '', m ? `${m} ${m === 1 ? 'minute' : 'minutes'}` : '', s ? `${s} ${s === 1 ? 'second' : 'seconds'}` : ''].filter(Boolean).join(' and ');
  }
  function secondsRemaining() { return Math.ceil(Math.max(0, timer.remainingMs) / 1000); }
  function currentRemaining() {
    return timer.phase === 'running' ? Math.max(0, timer.endEpoch - Date.now()) : timer.remainingMs;
  }
  function screenRead(message, urgent = false) {
    const target = urgent ? els.urgent : els.announcements;
    target.textContent = '';
    requestAnimationFrame(() => { target.textContent = message; });
  }
  function unlockAudio() {
    if (!audioContext) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) { try { audioContext = new AudioCtx(); } catch (_) {} }
    }
    if (audioContext && audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    if ('speechSynthesis' in window) { try { window.speechSynthesis.getVoices(); } catch (_) {} }
  }
  function stopSpeech() {
    if ('speechSynthesis' in window) { try { window.speechSynthesis.cancel(); } catch (_) {} }
    voice = null;
  }
  function speak(message, { force = false } = {}) {
    if ((!config.voiceEnabled && !force) || !('speechSynthesis' in window)) return false;
    try {
      window.speechSynthesis.cancel(); // Never let old speech pile up behind the current time.
      voice = new SpeechSynthesisUtterance(message);
      voice.rate = 1.05;
      voice.pitch = 1;
      voice.volume = 1;
      window.speechSynthesis.speak(voice);
      return true;
    } catch (_) { return false; }
  }
  function tone(frequency, offset = 0, duration = .15) {
    if (!config.tones || !audioContext || audioContext.state !== 'running') return;
    const t = audioContext.currentTime + offset;
    const osc = audioContext.createOscillator(), gain = audioContext.createGain();
    osc.type = 'sine'; osc.frequency.setValueAtTime(frequency, t);
    gain.gain.setValueAtTime(.0001, t);
    gain.gain.exponentialRampToValueAtTime(.13, t + .02);
    gain.gain.exponentialRampToValueAtTime(.0001, t + duration);
    osc.connect(gain).connect(audioContext.destination);
    osc.start(t); osc.stop(t + duration + .025);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }
  function chime() { tone(520,0,.22); tone(660,.24,.22); tone(800,.48,.4); }
  function sayTime() {
    unlockAudio();
    const secs = Math.ceil(currentRemaining() / 1000);
    const text = timer.phase === 'finished' ? 'Time is up.'
      : timer.phase === 'running' ? `${formatWords(secs)} remaining.`
      : timer.phase === 'paused' ? `Paused. ${formatWords(secs)} remaining.`
      : secs > 0 ? `${formatWords(secs)} selected. Press Start to begin.`
      : 'Timer ready. Touch the ruler or select a time.';
    speak(text, { force: true });
    screenRead(text);
  }
  function shouldAnnounceSecond(second) {
    if (second <= 0) return false;
    if (second <= 10) return true; // Spoken final ten-second countdown in every mode.
    if (config.cadence === 'frequent') {
      if (second <= 60) return second % 10 === 0;
      if (second <= 300) return second % 30 === 0;
      return second % 60 === 0;
    }
    if (config.cadence === 'standard') return (second % 60 === 0 || [30, 20].includes(second));
    return second % 300 === 0 || [60, 30, 20].includes(second);
  }
  function cueSecond(oldSec, newSec) {
    if (oldSec <= newSec || oldSec - newSec > 2 || document.visibilityState !== 'visible') return;
    for (let sec = oldSec - 1; sec >= newSec; sec--) {
      if (sec > 0 && shouldAnnounceSecond(sec)) {
        const message = sec <= 10 ? String(sec) : `${formatWords(sec)} remaining`;
        speak(message);
        if (sec > 10 || sec === 10 || sec === 5) screenRead(sec <= 10 ? `${sec} seconds remaining` : message);
        if (config.tones && sec <= 10) tone(650,0,.065);
      }
    }
  }
  async function holdScreen() {
    if (wakeLock || timer.phase !== 'running' || document.visibilityState !== 'visible' || !navigator.wakeLock) return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; }, { once: true });
      if (timer.phase !== 'running') releaseScreen();
    } catch (_) {}
  }
  function releaseScreen() {
    if (!wakeLock) return;
    const w = wakeLock; wakeLock = null;
    w.release().catch(() => {});
  }
  function start(seconds, announce = true) {
    seconds = Math.round(Number(seconds));
    if (!Number.isFinite(seconds) || seconds < 1 || seconds > 7200) return;
    unlockAudio(); stopSpeech();
    config.scale = SCALES.find(n => n >= seconds) || 7200;
    timer.phase = 'running';
    timer.totalMs = seconds * 1000;
    timer.remainingMs = seconds * 1000;
    timer.endEpoch = Date.now() + timer.remainingMs;
    timer.lastWholeSecond = seconds;
    lastRenderSec = -1;
    holdScreen();
    if (announce) speak(`${formatWords(seconds)}. Countdown started.`);
    screenRead(`Started ${formatWords(seconds)} countdown`);
    render(true); save();
  }
  function pause() {
    if (timer.phase !== 'running') return;
    timer.remainingMs = currentRemaining();
    if (timer.remainingMs === 0) { finish(); return; }
    timer.phase = 'paused'; releaseScreen();
    const msg = `Paused. ${formatWords(secondsRemaining())} remaining.`;
    speak(msg); screenRead(msg); render(true); save();
  }
  function resume() {
    if (timer.phase !== 'paused' || timer.remainingMs <= 0) return;
    unlockAudio();
    timer.phase = 'running'; timer.endEpoch = Date.now() + timer.remainingMs;
    timer.lastWholeSecond = secondsRemaining();
    holdScreen();
    const msg = `Resumed. ${formatWords(secondsRemaining())} remaining.`;
    speak(msg); screenRead(msg); render(true); save();
  }
  function finish(withAudio = true) {
    if (timer.phase === 'finished') return;
    timer.phase = 'finished'; timer.remainingMs = 0; timer.endEpoch = 0;
    timer.lastWholeSecond = 0; releaseScreen();
    stopSpeech();
    if (withAudio) { chime(); speak('Time is up.'); }
    screenRead('Time is up.', true);
    render(true); save();
  }
  function clear() {
    stopSpeech(); releaseScreen();
    timer.phase = 'ready'; timer.totalMs = 0; timer.remainingMs = 0; timer.endEpoch = 0; timer.lastWholeSecond = 0;
    const msg = 'Timer cleared.';
    speak(msg); screenRead(msg); render(true); save();
  }
  function restart() { if (timer.totalMs > 0) start(Math.round(timer.totalMs / 1000)); }
  function toggle() {
    if (timer.phase === 'running') pause();
    else if (timer.phase === 'paused') resume();
    else if (timer.phase === 'finished') restart();
    else if (timer.phase === 'ready' && timer.remainingMs > 0) start(secondsRemaining());
  }
  function setReady(seconds, talk = true) {
    if (timer.phase === 'running' || timer.phase === 'paused') return;
    seconds = Math.round(clamp(seconds,0,7200));
    timer.phase = 'ready'; timer.remainingMs = seconds * 1000; timer.totalMs = seconds * 1000;
    timer.endEpoch = 0; timer.lastWholeSecond = seconds;
    fitScale(seconds);
    const msg = seconds > 0 ? `${formatWords(seconds)} selected.` : 'Zero minutes selected.';
    if (talk) speak(msg);
    screenRead(msg); render(true); save();
  }
  function adjust(delta) {
    unlockAudio();
    const remaining = Math.ceil(currentRemaining() / 1000);
    const target = clamp(remaining + delta, timer.phase === 'running' || timer.phase === 'paused' ? 1 : 0, 7200);
    if (target === remaining) {
      const msg = delta > 0 ? 'Maximum time is two hours.' : 'Minimum time reached.';
      speak(msg); screenRead(msg); return;
    }
    if (timer.phase === 'running') {
      const old = timer.remainingMs;
      timer.remainingMs = target * 1000;
      timer.endEpoch = Date.now() + timer.remainingMs;
      timer.totalMs = clamp(timer.totalMs + (target * 1000 - old), timer.remainingMs, 7200000);
      timer.lastWholeSecond = target;
    } else if (timer.phase === 'paused') {
      timer.remainingMs = target * 1000;
      timer.totalMs = Math.max(timer.totalMs, timer.remainingMs);
      timer.lastWholeSecond = target;
    } else {
      setReady(target, false);
    }
    fitScale(target);
    const msg = (delta > 0 ? 'Added one minute. ' : 'Subtracted one minute. ') + `${formatWords(target)} ${timer.phase === 'running' || timer.phase === 'paused' ? 'remaining' : 'selected'}.`;
    speak(msg); screenRead(msg); render(true); save();
  }
  function pickSeconds(clientY) {
    const r = els.stage.getBoundingClientRect();
    const fraction = clamp(1 - (clientY - r.top) / r.height, 0, 1);
    const raw = fraction * config.scale;
    const step = config.scale <= 300 ? 5 : config.scale <= 900 ? 15 : config.scale <= 1800 ? 30 : 60;
    return Math.round(raw / step) * step;
  }
  function setPreview(seconds) {
    if (seconds === secondsRemaining() && timer.phase === 'setting') return;
    timer.phase = 'setting';
    timer.remainingMs = seconds * 1000; timer.totalMs = seconds * 1000; timer.endEpoch = 0;
    render(true);
    const now = performance.now();
    if (now - lastPreviewTime >= 450 || lastPreviewSeconds === null) {
      const msg = `${formatWords(seconds)}.`;
      speak(msg); screenRead(msg);
      lastPreviewTime = now; lastPreviewSeconds = seconds;
    }
  }
  function paint() {
    if (!ctx || !canvasWidth || !canvasHeight) return;
    const w = canvasWidth, h = canvasHeight;
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle = '#07141b'; ctx.fillRect(0,0,w,h);
    const seconds = clamp(timer.remainingMs / 1000,0,config.scale);
    const filled = seconds / config.scale * h;
    if (filled > 0) {
      const gradient = ctx.createLinearGradient(0,h,0,h-filled);
      gradient.addColorStop(0,'#e57c26'); gradient.addColorStop(1,'#ffce59');
      ctx.fillStyle = gradient; ctx.fillRect(0,h-filled,w,filled);
    }
    const step = config.scale <= 300 ? 30 : config.scale <= 900 ? 60 : config.scale <= 1800 ? 120 : config.scale <= 3600 ? 300 : 600;
    const major = config.scale <= 300 ? 60 : config.scale <= 900 ? 180 : config.scale <= 1800 ? 300 : config.scale <= 3600 ? 600 : 1200;
    for (let s = 0; s <= config.scale; s += step) {
      const y = h - s/config.scale * h;
      const big = s % major === 0 || s === config.scale;
      ctx.beginPath(); ctx.moveTo(0,Math.round(y)+.5); ctx.lineTo(big?w:Math.min(w,60),Math.round(y)+.5);
      ctx.lineWidth = big?3:1.5; ctx.strokeStyle = '#ffffffa8'; ctx.stroke();
      if (big) {
        const label = s >= 60 ? `${s/60}m` : `${s}s`;
        ctx.font = '900 16px system-ui,sans-serif'; ctx.textBaseline = 'middle';ctx.textAlign = 'left';
        ctx.lineWidth = 4;ctx.strokeStyle = '#05141c';ctx.strokeText(label,14,clamp(y,54,h-40));
        ctx.fillStyle = '#fff';ctx.fillText(label,14,clamp(y,54,h-40));
      }
    }
    if (filled > 0 && filled < h) {
      const y = h-filled;
      ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.strokeStyle='#fff';ctx.lineWidth=5;ctx.stroke();
      ctx.beginPath();ctx.arc(w-23,y,11,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();
    }
  }
  function resizeCanvas() {
    const bounds = els.canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvasWidth = bounds.width; canvasHeight = bounds.height;
    els.canvas.width = Math.round(canvasWidth*dpr); els.canvas.height = Math.round(canvasHeight*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    render(true);
  }
  function render(force = false) {
    const sec = secondsRemaining(), phase = timer.phase, now = performance.now();
    if (!force && sec === lastRenderSec && (phase !== 'running' || now-lastPaintAt < 90)) return;
    lastRenderSec = sec; lastPaintAt = now;
    paint();
    const phaseNames = { ready:'READY', setting:'SETTING', running:'RUNNING', paused:'PAUSED', finished:'FINISHED' };
    els.stage.dataset.state = phase;
    els.status.textContent = phaseNames[phase];
    els.scaleLabel.textContent = `${config.scale/60}-minute ruler`;
    els.scaleValue.textContent = `${config.scale/60} min`;
    els.scaleButton.setAttribute('aria-label', `Ruler range: ${config.scale/60} minutes. Change ruler range`);
    els.digits.textContent = formatClock(sec);
    els.digits.classList.toggle('long-time',sec >= 3600);
    els.kicker.textContent = phase === 'finished'?'ALL DONE':phase === 'running'?'TIME REMAINING':phase === 'paused'?'TIMER PAUSED':phase === 'setting'?'RELEASE TO START':'SET YOUR TIME';
    els.description.textContent = phase === 'running' ? 'Touch to hear time remaining' : phase === 'setting' ? 'Release to start' : phase === 'paused' ? 'Press Resume to continue' : phase === 'finished' ? 'Time is up!' : sec ? 'Press Start or drag to change time' : 'Touch or drag to choose a time';
    els.percent.textContent = phase === 'finished'?'Complete':phase === 'ready' && !sec?'Ready': `${timer.totalMs ? Math.round(timer.remainingMs/timer.totalMs*100) : 0}% remaining`;
    els.finishAt.textContent = phase === 'running' ? `Ends ${new Date(timer.endEpoch).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}` : '';
    els.startPause.disabled = (phase === 'ready' && !sec) || phase === 'setting';
    els.startPauseLabel.textContent = phase === 'running'?'Pause':phase === 'paused'?'Resume':phase === 'finished'?'Again':'Start';
    els.startPauseIcon.textContent = phase === 'running'?'Ⅱ':phase === 'finished'?'↻':'▶';
    els.restart.disabled = !timer.totalMs || phase === 'setting';
    els.clear.disabled = (!sec && phase === 'ready') || phase === 'setting';
    els.selected.textContent = sec < 60 ? `${sec} sec` : `${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`;
    els.minus.disabled = phase === 'setting' || (sec === 0 && phase !== 'running' && phase !== 'paused');
    els.plus.disabled = phase === 'setting' || sec >= 7200;
    els.stage.setAttribute('aria-valuemax',String(config.scale));
    els.stage.setAttribute('aria-valuenow',String(sec));
    els.stage.setAttribute('aria-valuetext',`${formatWords(sec)}. ${phaseNames[phase].toLowerCase()}.`);
    els.stage.setAttribute('aria-readonly',String(phase === 'running' || phase === 'paused'));
  }
  function updateVoiceControls() {
    els.voiceToggle.setAttribute('aria-pressed',String(config.voiceEnabled));
    els.voiceToggle.setAttribute('aria-label',config.voiceEnabled?'Voice on. Turn voice off':'Voice off. Turn voice on');
    els.voiceToggleLabel.textContent = config.voiceEnabled?'Voice on':'Voice off';
    els.tonesToggle.setAttribute('aria-pressed',String(config.tones));
    els.tonesToggle.textContent = config.tones?'Tones on':'Tones off';
    for (const b of document.querySelectorAll('[data-cadence]')) b.setAttribute('aria-pressed',String(config.cadence === b.dataset.cadence));
  }
  function tick() {
    if (timer.phase === 'running') {
      const old = timer.lastWholeSecond;
      timer.remainingMs = currentRemaining();
      const sec = secondsRemaining();
      if (sec !== old) {
        timer.lastWholeSecond = sec;
        if (sec <= 0) finish();
        else cueSecond(old,sec);
      }
      if (Date.now()-lastSave > 12000) save();
    }
    render();
    requestAnimationFrame(tick);
  }
  els.stage.addEventListener('pointerdown', e => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault(); unlockAudio();
    if (timer.phase === 'running' || timer.phase === 'paused') { sayTime(); return; }
    previewBefore = { phase: timer.phase, total: timer.totalMs, remaining: timer.remainingMs };
    pointerId = e.pointerId; lastPreviewTime = -Infinity; lastPreviewSeconds = null;
    try { els.stage.setPointerCapture(pointerId); } catch (_) {}
    setPreview(pickSeconds(e.clientY));
  });
  els.stage.addEventListener('pointermove', e => {
    if (pointerId !== e.pointerId || timer.phase !== 'setting') return;
    e.preventDefault();setPreview(pickSeconds(e.clientY));
  });
  els.stage.addEventListener('pointerup', e => {
    if (pointerId !== e.pointerId) return;
    e.preventDefault();pointerId = null;
    const sec = secondsRemaining();
    if (sec) start(sec); else clear();
  });
  els.stage.addEventListener('pointercancel', e => {
    if (pointerId !== e.pointerId) return;
    pointerId = null;
    stopSpeech();
    if (previewBefore) {
      timer.phase = previewBefore.phase;
      timer.totalMs = previewBefore.total;
      timer.remainingMs = previewBefore.remaining;
      timer.endEpoch = 0;
    } else timer.phase = 'ready';
    render(true);save();
  });
  els.stage.addEventListener('keydown', e => {
    const key = e.key;
    if (!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End','Enter',' '].includes(key)) return;
    e.preventDefault();unlockAudio();
    if (key === 'Enter' || key === ' ') { toggle(); return; }
    if (timer.phase === 'running' || timer.phase === 'paused') { sayTime(); return; }
    const step = config.scale <= 300 ? 5 : config.scale <= 900 ? 15 : config.scale <= 1800 ? 30 : 60;
    let sec = secondsRemaining();
    if (key === 'Home') sec = 0;
    else if (key === 'End') sec = config.scale;
    else sec += ['ArrowUp','ArrowRight'].includes(key) ? step : -step;
    setReady(clamp(sec,0,config.scale));
  });
  els.startPause.addEventListener('click',toggle);
  els.hearTime.addEventListener('click',sayTime);
  els.restart.addEventListener('click',restart);
  els.clear.addEventListener('click',clear);
  els.plus.addEventListener('click',() => adjust(60));
  els.minus.addEventListener('click',() => adjust(-60));
  els.scaleButton.addEventListener('click',() => {
    const remaining = Math.ceil(currentRemaining() / 1000);
    // Never change or truncate the selected countdown while changing the ruler.
    const allowed = SCALES.filter(n => n >= remaining);
    const next = allowed.find(n => n > config.scale) || allowed[0];
    config.scale = next;
    const msg = `${next/60} minute ruler.`;
    speak(msg); screenRead(msg);
    render(true); save();
  });
  els.presets.addEventListener('click',e => {
    const b = e.target.closest('[data-seconds]');
    if (b) start(Number(b.dataset.seconds));
  });
  els.customForm.addEventListener('submit',e => {
    e.preventDefault();
    const m=els.customMinutes.valueAsNumber,s=els.customSeconds.valueAsNumber,total=m*60+s;
    if (!Number.isInteger(m) || !Number.isInteger(s) || m<0 || m>120 || s<0 || s>59 || total<=0 || total>7200) {
      els.customSeconds.setCustomValidity('Choose a time from one second to two hours.');
      els.customSeconds.reportValidity();return;
    }
    els.customSeconds.setCustomValidity('');start(total);
  });
  els.customMinutes.addEventListener('input',()=>els.customSeconds.setCustomValidity(''));
  els.customSeconds.addEventListener('input',()=>els.customSeconds.setCustomValidity(''));
  els.voiceToggle.addEventListener('click',() => {
    config.voiceEnabled = !config.voiceEnabled;
    if (!config.voiceEnabled) stopSpeech();
    else { unlockAudio();speak('Voice on.'); }
    const msg = config.voiceEnabled?'Voice on':'Voice off';
    updateVoiceControls();screenRead(msg);save();
  });
  els.tonesToggle.addEventListener('click',() => {
    config.tones = !config.tones;
    if (config.tones) {unlockAudio();tone(620);}
    const msg = config.tones?'Tones on':'Tones off';
    updateVoiceControls();speak(msg);screenRead(msg);save();
  });
  els.testVoice.addEventListener('click',() => {
    unlockAudio();speak('This is your visual countdown. Ten seconds remaining.', { force: true });
    screenRead('Playing a voice test');
  });
  document.querySelectorAll('[data-cadence]').forEach(b=>b.addEventListener('click',() => {
    config.cadence = b.dataset.cadence;
    const msg = config.cadence === 'frequent'?'Frequent spoken updates.' : config.cadence === 'standard'?'Spoken updates every minute and near the end.' : 'Spoken updates at key moments.';
    updateVoiceControls();speak(msg);screenRead(msg);save();
  }));
  els.fullscreenButton.addEventListener('click',() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(()=>{});
    else if (els.fullscreenApp.requestFullscreen) els.fullscreenApp.requestFullscreen().catch(()=>screenRead('Fullscreen unavailable'));
    else screenRead('Fullscreen is unavailable');
  });
  document.addEventListener('fullscreenchange',() => {
    els.fullscreenButton.setAttribute('aria-label',document.fullscreenElement?'Exit fullscreen':'Enter fullscreen');
    setTimeout(resizeCanvas,40);
  });
  document.addEventListener('visibilitychange',() => {
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
  window.addEventListener('pagehide',save);
  window.addEventListener('resize',resizeCanvas);
  if (window.ResizeObserver) new ResizeObserver(resizeCanvas).observe(els.stage);
  restore();updateVoiceControls();resizeCanvas();render(true);
  requestAnimationFrame(tick);
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost','127.0.0.1'].includes(location.hostname))) {
    window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').then(r=>r.update()).catch(()=>{}));
  }
})();
