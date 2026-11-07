"""Run: python tests/browser_test.py. Requires playwright + Chromium.
Browser tests do not use external network so file-based distribution can be verified.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

HTML = Path(__file__).resolve().parents[1].joinpath('index.html').read_text()


def make_page(browser, width=390, height=844, fake_clock=False):
    page = browser.new_page(viewport={'width': width, 'height': height}, is_mobile=width<900, has_touch=width<900)
    page.evaluate('''() => {
      window.__spoken = [];
      window.SpeechSynthesisUtterance = class { constructor(text) {this.text = text;} };
      Object.defineProperty(window, 'speechSynthesis', {
        configurable:true, value:{cancel(){}, speak(msg){window.__spoken.push(msg.text)}}
      });
      window.__timerStorage = {};
      Object.defineProperty(window, 'localStorage', {
        configurable:true, value:{getItem(k){return window.__timerStorage[k]??null},setItem(k,v){window.__timerStorage[k]=v}}
      });
    }''')
    if fake_clock: page.clock.install()
    errors=[]
    page.on('pageerror', lambda exc:errors.append(str(exc)))
    page.set_content(HTML, wait_until='load')
    assert not errors, errors
    return page, errors

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    for width,height in [(320,568),(390,844),(844,390),(1280,800)]:
        page,errors=make_page(browser,width,height)
        assert page.evaluate('document.documentElement.scrollHeight === innerHeight && document.documentElement.scrollWidth === innerWidth'),(width,height)
        assert page.locator('#digits').inner_text()=='00:00'
        assert page.locator('#controls button:visible').count()==2
        assert page.locator('#voiceControl').get_attribute('aria-pressed')=='true'
        print(f'PASS: edge-to-edge, speech on and two controls at {width} x {height}')
        page.close()

    page,errors=make_page(browser)
    stage=page.locator('#timer').bounding_box()
    x=stage['x']+stage['width']/2
    y=stage['y']+stage['height']/2
    page.mouse.move(x,y)
    page.mouse.down()
    assert page.locator('#digits').inner_text()=='30:00'
    assert page.evaluate('window.__spoken.at(-1)')=='30 minutes'
    print('PASS: initial touch speaks selected time')
    page.mouse.move(x,y+stage['height']/4,steps=10)
    page.wait_for_timeout(650)
    assert page.locator('#digits').inner_text()=='15:00'
    page.mouse.up()
    assert page.locator('#phase').inner_text()=='TIME REMAINING'
    assert 'Countdown started' in page.evaluate('window.__spoken.at(-1)')
    assert page.locator('#controls button:visible').count()==3
    print('PASS: dragging changes duration, release starts and announces')
    page.wait_for_timeout(1100)
    assert page.locator('#digits').inner_text() in ('14:59','14:58')
    print('PASS: actual wall-clock countdown advances')
    page.mouse.click(x,y)
    assert page.locator('#phase').inner_text()=='TIME REMAINING'
    assert 'remaining' in page.evaluate('window.__spoken.at(-1)')
    print('PASS: touch while running reads remaining time without resetting')
    page.locator('#mainControl').click()
    assert page.locator('#phase').inner_text()=='PAUSED'
    held=page.locator('#digits').inner_text()
    page.wait_for_timeout(1100)
    assert page.locator('#digits').inner_text()==held
    page.locator('#mainControl').click()
    assert page.locator('#phase').inner_text()=='TIME REMAINING'
    print('PASS: pause freezes and resume works')
    page.locator('#resetControl').click()
    assert page.locator('#digits').inner_text()=='00:00'
    assert page.locator('#controls button:visible').count()==2
    page.locator('#mainControl').click()
    assert 'Timer ready' in page.evaluate('window.__spoken.at(-1)')
    print('PASS: reset; Set time button is an audible instruction, not disabled junk')
    page.locator('#timer').focus()
    page.keyboard.press('ArrowUp')
    page.keyboard.press('Shift+ArrowUp')
    assert page.locator('#digits').inner_text()=='06:00'
    page.keyboard.press('Enter')
    assert page.locator('#phase').inner_text()=='TIME REMAINING'
    print('PASS: keyboard / assistive slider can set and start')
    page.locator('#voiceControl').click()
    assert page.locator('#voiceControl').get_attribute('aria-pressed')=='false'
    n=len(page.evaluate('window.__spoken'))
    page.locator('#mainControl').click()
    assert len(page.evaluate('window.__spoken'))==n
    page.locator('#hearControl').click()
    assert len(page.evaluate('window.__spoken'))==n+1
    print('PASS: explicit Hear time works even if automatic speech is off')
    page.close()

    page,errors=make_page(browser, fake_clock=True)
    # Select 15 seconds using 0.004167 of viewport height from the bottom.
    page.locator('#timer').dispatch_event('pointerdown',{'pointerId':2,'pointerType':'touch','button':0,'clientY':844*.995833})
    assert page.locator('#digits').inner_text()=='00:15'
    page.locator('#timer').dispatch_event('pointerup',{'pointerId':2,'pointerType':'touch','button':0,'clientY':844*.995833})
    assert page.locator('#phase').inner_text()=='TIME REMAINING'
    page.clock.run_for(6000)
    assert page.locator('#digits').inner_text() in ('00:10','00:09','00:08')
    assert '10' in page.evaluate('window.__spoken')
    page.clock.run_for(10000)
    assert page.locator('#digits').inner_text()=='00:00'
    assert page.locator('#phase').inner_text()=='TIME IS UP'
    assert page.evaluate('window.__spoken.at(-1)')=='Time is up.'
    print('PASS: last 10-second announcements and finished state')
    assert not errors,errors
    page.close()
    browser.close()
print('All browser tests passed.')
