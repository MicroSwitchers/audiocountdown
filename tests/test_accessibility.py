"""Chromium functional and accessibility-tree checks. Not a substitute for TalkBack/VoiceOver on devices."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json

ROOT=Path(__file__).resolve().parents[1]
HTML=(ROOT/'index.html').read_text()
SPEECH='''
window.__spoken=[];window.__cancelCount=0;
const voices=[{voiceURI:'en-test',name:'Offline test voice',lang:'en-US',localService:true}];
Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{
  cancel(){window.__cancelCount++},speak(u){window.__spoken.push({text:u.text,rate:u.rate,voice:u.voice?.voiceURI})},
  getVoices(){return voices},paused:false,resume(){},addEventListener(){}}});
window.SpeechSynthesisUtterance=class {constructor(t){this.text=t;this.rate=1;this.volume=1}};
'''

def run():
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  for width,height in [(320,568),(390,844),(844,390),(1280,800)]:
   ctx=browser.new_context(viewport={'width':width,'height':height},has_touch=width<500,is_mobile=width<500)
   ctx.add_init_script(SPEECH)
   page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.set_content(HTML)
   assert page.locator('#timer').get_attribute('role')=='slider'
   assert page.locator('#timer').get_attribute('aria-orientation')=='vertical'
   assert page.locator('#settingsDrawer').is_hidden()
   assert not page.evaluate('document.documentElement.scrollHeight>document.documentElement.clientHeight')
   assert not page.evaluate('document.documentElement.scrollWidth>document.documentElement.clientWidth')
   page.locator('#settingsControl').click()
   assert page.locator('#closeSettings').evaluate('(e)=>document.activeElement===e')
   assert page.locator('#settingsDrawer').get_attribute('role')=='dialog'
   assert page.locator('#exactHours').get_attribute('type')=='number'
   assert page.locator('#exactMinutes').get_attribute('inputmode')=='numeric'
   for id in ['exactHours','exactMinutes','exactSeconds','exactStart','exactClear','exactMinus','exactPlus','exactHear','testVoice','screenReaderModeToggle']:
    assert page.locator('#'+id).count()==1,id
   assert page.locator('#settingsDrawer').evaluate('(e)=>e.scrollHeight>e.clientHeight')
   assert not errors,(width,height,errors)
   ctx.close()
  ctx=browser.new_context(viewport={'width':390,'height':844},has_touch=True,is_mobile=True)
  ctx.add_init_script(SPEECH)
  page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.set_content(HTML)
  page.locator('#settingsControl').click()
  page.locator('#exactHours').fill('0');page.locator('#exactMinutes').fill('0');page.locator('#exactSeconds').fill('15')
  page.locator('#exactStart').click()
  assert page.locator('#timer').get_attribute('data-phase')=='running'
  assert page.locator('#timer').get_attribute('role')=='button'
  assert page.locator('#timer').get_attribute('aria-valuenow') is None
  assert page.locator('#timerReadout').get_attribute('role')=='timer'
  assert 'seconds' in page.locator('#timerReadout').inner_text()
  assert any('15 seconds' in x['text'] for x in page.evaluate('window.__spoken'))
  page.locator('#exactHours').fill('0');page.locator('#exactMinutes').fill('2');page.locator('#exactSeconds').fill('0')
  before=page.locator('#digits').inner_text()
  page.locator('#exactStart').click()
  assert page.locator('#digits').inner_text()==before,'replaced running timer without confirmation'
  assert 'again' in page.locator('#exactFeedback').inner_text()
  page.locator('#exactStart').click()
  assert page.locator('#timer').get_attribute('data-phase')=='running'
  assert '02:00' in page.locator('#digits').inner_text()
  page.locator('#exactToggle').click();assert page.locator('#timer').get_attribute('data-phase')=='paused'
  page.locator('#exactToggle').click();assert page.locator('#timer').get_attribute('data-phase')=='running'
  page.locator('#exactClear').click();assert page.locator('#timer').get_attribute('data-phase')=='running'
  page.locator('#exactClear').click();assert page.locator('#timer').get_attribute('data-phase')=='ready'
  assert page.locator('#timer').get_attribute('role')=='slider'
  # Screen reader mode silences app TTS but emits live announcements.
  page.locator('#screenReaderModeToggle').check()
  page.locator('#exactHours').fill('0');page.locator('#exactMinutes').fill('0');page.locator('#exactSeconds').fill('20')
  calls=len(page.evaluate('window.__spoken'))
  page.locator('#exactStart').click()
  page.locator('#exactHear').click()
  assert len(page.evaluate('window.__spoken'))==calls
  assert page.locator('#announcement').get_attribute('aria-live')=='polite'
  assert page.locator('#timerReadout').get_attribute('aria-live')=='off'
  page.wait_for_function("document.getElementById('announcement').textContent.includes('remaining')")
  page.locator('#screenReaderModeToggle').uncheck()
  page.locator('#speechRate').select_option('1.2')
  page.locator('#speechVoice').select_option('en-test')
  page.locator('#testVoice').click()
  spoken=page.evaluate('window.__spoken')[-1]
  assert spoken['rate']==1.2 and spoken['voice']=='en-test',spoken
  # Accessibility tree exposes native number inputs and buttons with meaningful names.
  cdp=ctx.new_cdp_session(page)
  tree=cdp.send('Accessibility.getFullAXTree')['nodes']
  names=[node.get('name',{}).get('value','') for node in tree if not node.get('ignored')]
  assert any('Hours'==n for n in names),names[:100]
  assert any('Start timer'==n for n in names),names[:100]
  assert any('TalkBack or VoiceOver' in n for n in names),names[:100]
  page.locator('#exactClear').click();page.locator('#exactClear').click()
  page.locator('#closeSettings').click()
  assert page.locator('#settingsControl').evaluate('(e)=>document.activeElement===e')
  # Screen-reader synthetic double tap after keyboard increments starts selected duration.
  page.locator('#timer').focus()
  page.keyboard.press('ArrowUp')
  assert page.locator('#timer').get_attribute('data-phase')=='ready'
  page.locator('#timer').evaluate('(e)=>e.click()')
  assert page.locator('#timer').get_attribute('data-phase')=='running'
  assert not errors,errors
  ctx.close();browser.close()
 print('PASS: 4 viewports, accessible dialog/native input, confirm before replacing/clearing, speech engine controls, screen-reader live regions, synthetic accessibility activation, focus, AX tree')
if __name__=='__main__':run()
