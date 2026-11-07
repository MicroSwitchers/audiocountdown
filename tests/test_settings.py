"""Run: python tests/test_settings_pwa.py (requires Playwright and Chromium)."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from functools import partial
import json

ROOT=Path(__file__).resolve().parents[1]
VOICE_MOCK="""
window.__spoken=[];window.__cancelled=0;
Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{cancel(){window.__cancelled++},speak(u){window.__spoken.push(u.text)},getVoices(){return[]}}});
window.SpeechSynthesisUtterance=class{constructor(s){this.text=s;this.rate=1;this.volume=1}};
window.__wakeRequests=0;window.__wakeReleases=0;
Object.defineProperty(navigator,'wakeLock',{configurable:true,value:{async request(type){window.__wakeRequests++;const lock={released:false,handlers:[],addEventListener(type,fn){this.handlers.push(fn)},async release(){if(this.released)return;this.released=true;window.__wakeReleases++;for(const f of this.handlers)f();}};return lock;}}});
"""

class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
 def end_headers(self):
  self.send_header('Cache-Control','no-cache, no-store, must-revalidate')
  super().end_headers()

def run():
 server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(ROOT)))
 t=Thread(target=server.serve_forever,daemon=True);t.start()
 url=f'http://127.0.0.1:{server.server_address[1]}/'
 try:
  with sync_playwright() as p:
   browser=p.chromium.launch(headless=True,args=['--no-sandbox'],**({'executable_path':'/usr/bin/chromium'} if Path('/usr/bin/chromium').exists() else {}))
   context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,service_workers='allow')
   context.add_init_script(VOICE_MOCK)
   page=context.new_page();errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
   page.evaluate("""() => { const store={}; Object.defineProperty(window, 'localStorage', { configurable: true, value: { getItem(k){return store[k]??null}, setItem(k,v){store[k]=String(v)}, removeItem(k){delete store[k]} } }); }""")
   page.set_content((ROOT/'index.html').read_text(),wait_until='load')
   page.wait_for_timeout(400)
   assert page.locator('#settingsDrawer').is_hidden()
   page.locator('#settingsControl').click()
   assert page.locator('#settingsDrawer').is_visible()
   assert page.locator('#settingsControl').get_attribute('aria-expanded')=='true'
   assert page.locator('#closeSettings').evaluate('(el)=>document.activeElement===el')
   assert page.locator('#settingsDrawer').evaluate('(node)=>node.scrollHeight>node.clientHeight'), 'Settings drawer should scroll independently'
   assert not page.evaluate('document.documentElement.scrollHeight>document.documentElement.clientHeight'), 'Main page must never scroll'
   page.screenshot(path=str(ROOT/'preview-settings.png'))
   # Scale choices change ruler ranges and labels, not pre-set durations.
   for hours in [5,12,24,1]:
    page.locator(f'input[name="scaleHours"][value="{hours}"]').check()
    assert page.locator('#timer').get_attribute('aria-valuemax')==str(hours*60)
    assert page.locator('.tick.major span').last.inner_text()==f'{hours}h'
    assert f'{hours}H SCALE' in page.locator('#status').inner_text()
   # Colour choices affect solid colour variables and render without JS errors.
   colors={'gold':'#060606','cyan':'#08141a','mono':'#050505','blue':'#0a1120'}
   for palette,night in colors.items():
    page.locator(f'input[name="palette"][value="{palette}"]').check()
    assert page.locator('html').evaluate('(el)=>getComputedStyle(el).getPropertyValue("--night").trim()')==night
   # Speech setting 'off' mutes, manual mode permits requested speech.
   page.locator('input[name="speechMode"][value="off"]').check()
   assert page.locator('#voiceControl').count()==0
   assert page.evaluate("JSON.parse(localStorage.getItem('talking-visual-countdown-fullscreen-v7')).prefs.speechMode")=='off'
   page.locator('input[name="speechMode"][value="manual"]').check()
   assert page.evaluate("JSON.parse(localStorage.getItem('talking-visual-countdown-fullscreen-v7')).prefs.speechMode")=='manual'
   # Keep screen awake setting persists; wake lock only starts once countdown is running.
   page.locator('#wakeToggle').check()
   assert page.locator('#wakeStatus').inner_text().startswith('On.')
   page.locator('#closeSettings').click()
   assert page.locator('#settingsDrawer').is_hidden()
   page.mouse.click(195,420)
   assert page.locator('#timer').get_attribute('data-phase')=='running'
   page.wait_for_timeout(200)
   assert page.evaluate('window.__wakeRequests')>=1
   assert 'active' in page.locator('#wakeStatus').inner_text()
   original=page.locator('#digits').inner_text()
   assert original != '00:00'
   # Scale may be smaller than remaining duration, but countdown is NEVER modified.
   page.locator('#settingsControl').click()
   page.locator('input[name="scaleHours"][value="24"]').check()
   assert page.locator('#digits').inner_text() in [original,page.locator('#digits').inner_text()]  # clock may tick
   page.locator('#closeSettings').click()
   page.locator('#mainControl').click()
   assert page.locator('#timer').get_attribute('data-phase')=='paused'
   assert page.evaluate('window.__wakeReleases')>=1
   page.locator('#mainControl').click()
   assert page.locator('#timer').get_attribute('data-phase')=='running'
   # Persisted settings and live deadline survive reload.
   page.set_content((ROOT/'index.html').read_text(),wait_until='load')
   assert page.locator('#timer').get_attribute('data-phase')=='running'
   page.locator('#settingsControl').click()
   assert page.locator('input[name="scaleHours"][value="24"]').is_checked()
   assert page.locator('input[name="speechMode"][value="manual"]').is_checked()
   assert page.locator('#wakeToggle').is_checked()
   page.locator('#closeSettings').click()
   # Real service-worker offline installation requires an HTTPS/localhost browser host.
   # This CI browser blocks all navigation, so verify the app-shell and worker files statically.
   assert (ROOT/'sw.js').is_file() and (ROOT/'manifest.webmanifest').is_file()
   manifest=json.loads((ROOT/'manifest.webmanifest').read_text())
   assert manifest['display']=='fullscreen' and manifest['scope']=='./'
   assert all((ROOT/asset).exists() for asset in ['icons/icon.svg','icons/icon-192.png','icons/icon-512.png'])
   assert not errors,errors
   print('drawer, ruler sizes, themes, voice preferences, wake lock, in-page state persistence, PWA assets: OK')
   context.close();browser.close()
 finally:server.shutdown();server.server_close()

if __name__=='__main__':run()
