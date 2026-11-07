from playwright.sync_api import sync_playwright
from pathlib import Path
import time
CONTENT=(Path(__file__).resolve().parents[1]/'index.html').read_text()
INIT="""
window.__speechLog=[];
const __mock = {cancel(){window.__speechLog.push('[cancel]')},speak(u){window.__speechLog.push(u.text)},getVoices(){return[];}};
Object.defineProperty(window, 'speechSynthesis', {configurable:true,value:__mock});
window.SpeechSynthesisUtterance=class {constructor(s){this.text=s;this.rate=1;this.volume=1}};
"""
def run():
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,args=['--no-sandbox'],**({'executable_path':'/usr/bin/chromium'} if Path('/usr/bin/chromium').exists() else {}))
  for w,h in [(390,844),(320,568),(844,390),(1280,800)]:
   ctx=browser.new_context(viewport={'width':w,'height':h},device_scale_factor=1, is_mobile=w<500,has_touch=w<500)
   ctx.add_init_script(INIT)
   page=ctx.new_page(); errors=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   page.set_content(CONTENT,wait_until="load")
   page.wait_for_timeout(150)
   metrics=page.evaluate('({scrollHeight:document.documentElement.scrollHeight,clientHeight:document.documentElement.clientHeight,scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth})')
   assert metrics['scrollHeight']<=metrics['clientHeight'],(w,h,metrics)
   assert metrics['scrollWidth']<=metrics['clientWidth'],(w,h,metrics)
   assert not errors,errors
   page.screenshot(path=str(Path(__file__).resolve().parents[1]/f'preview-{w}x{h}.png'))
   print('viewport',w,h,'ok')
   ctx.close()
  ctx=browser.new_context(viewport={'width':390,'height':844},has_touch=True,is_mobile=True)
  ctx.add_init_script(INIT)
  page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.set_content(CONTENT,wait_until="load")
  assert page.locator('#voiceLabel').inner_text()=='VOICE ON'
  x,y=195,660
  page.mouse.click(x,y)
  assert page.locator('#timer').get_attribute('data-phase')=='running','tap failed to start'
  before=page.locator('#digits').inner_text()
  page.wait_for_timeout(1100)
  after=page.locator('#digits').inner_text()
  assert before!=after,(before,after)
  page.mouse.click(x,y)
  assert page.locator('#timer').get_attribute('data-phase')=='running','tap reset active timer'
  log=page.evaluate('window.__speechLog')
  assert any('remaining' in s for s in log),log
  # First stage of hold warning, release before full 3-second hold.
  page.mouse.move(x,y);page.mouse.down();page.wait_for_timeout(1150)
  assert page.locator('#holdNotice').is_visible(),'hold warning missing'
  assert any('two more seconds' in s for s in page.evaluate('window.__speechLog'))
  page.mouse.up()
  assert page.locator('#timer').get_attribute('data-phase')=='running','short hold cleared timer'
  assert not page.locator('#holdNotice').is_visible()
  assert 'Clear cancelled.' in page.evaluate('window.__speechLog')
  # Full three second hold clears and confirms verbally.
  page.mouse.move(x,y);page.mouse.down();page.wait_for_timeout(3170)
  assert page.locator('#timer').get_attribute('data-phase')=='ready','full hold did not clear'
  assert 'Timer cleared.' in page.evaluate('window.__speechLog')
  page.mouse.up()
  assert page.locator('#timer').get_attribute('data-phase')=='ready'
  # Voice on/off must actually suppress all app TTS, including hear and hold warnings.
  page.locator('#voiceControl').click()
  assert page.locator('#voiceControl').get_attribute('aria-pressed')=='false'
  assert page.locator('#voiceLabel').inner_text()=='VOICE OFF'
  startlog=page.evaluate('window.__speechLog.filter(s=>s!=="[cancel]").length')
  page.mouse.click(x,y)
  page.mouse.click(x,y)
  page.locator('#hearControl').click()
  page.mouse.move(x,y);page.mouse.down();page.wait_for_timeout(3100);page.mouse.up()
  endlog=page.evaluate('window.__speechLog.filter(s=>s!=="[cancel]").length')
  assert startlog==endlog,('voice off ignored',startlog,endlog,page.evaluate('window.__speechLog'))
  page.locator('#voiceControl').click()
  assert page.locator('#voiceLabel').inner_text()=='VOICE ON'
  assert 'Voice on.' in page.evaluate('window.__speechLog')
  page.mouse.click(x,y)
  page.locator('#mainControl').click()
  assert page.locator('#timer').get_attribute('data-phase')=='paused'
  page.locator('#mainControl').click()
  assert page.locator('#timer').get_attribute('data-phase')=='running'
  assert not errors,errors
  print('tap, countdown, hear, hold warning, hold cancellation, 3-second clear, voice mute/unmute, pause/resume: OK')
  ctx.close();browser.close()
if __name__=='__main__':run()
