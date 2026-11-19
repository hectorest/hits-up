# Sugerencias con el buscador vacío y espera al teclear (Deezer simulado en el navegador).
import os, subprocess, time, json, re
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'test', 'shots'); os.makedirs(OUT, exist_ok=True)
PORT = 4012; BASE = f'http://localhost:{PORT}'
srv = subprocess.Popen(['node', 'server.js'], cwd=ROOT, env=dict(os.environ, DEEZER_MOCK='1', HU_FAST='1', PORT=str(PORT)), stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
time.sleep(1)
calls, errors = [], []

def track(i, tag):
    return {'id': 1000 + i, 'title': f'{tag} canción {i}', 'preview': f'{BASE}/mock.wav', 'readable': True, 'duration': 200,
            'artist': {'id': 50 + i % 4, 'name': f'Artista {tag} {i % 7}'}, 'album': {'title': 'Álbum', 'cover_medium': ''}}

def fake(route):
    u = urlparse(route.request.url); q = parse_qs(u.query); path = u.path
    calls.append(path + ('?q=' + q['q'][0] if 'q' in q else ''))
    if path.startswith('/chart'): d = {'data': [track(i, 'Éxito') for i in range(20)] + [dict(track(99, 'Karaoke'), title='Karaoke version')]}
    elif path == '/search/playlist': d = {'data': [{'id': 7, 'nb_tracks': 80, 'user': {'name': 'Deezer'}}]}
    elif path.startswith('/playlist/'): d = {'data': [track(i, 'Década') for i in range(30, 45)]}
    elif path.startswith('/track/'): d = track(int(path.split('/')[-1]) - 1000, 'Semilla')
    elif path.endswith('/related'): d = {'data': [{'id': 900 + i} for i in range(5)]}
    elif path.endswith('/top'): a = int(path.split('/')[2]); d = {'data': [track(a * 10 + i, 'Parecida') for i in range(3)]}
    else: d = {'data': []}
    route.fulfill(status=200, content_type='application/javascript', body=f"{q['callback'][0]}({json.dumps(d)})")

try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
        tv = b.new_page(viewport={'width': 1280, 'height': 720}); tv.goto(BASE + '/tv'); tv.click('#unlockBtn')
        tv.wait_for_function("location.search.includes('c=')"); code = tv.evaluate("new URLSearchParams(location.search).get('c')")
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        ctx.route('https://api.deezer.com/**', fake)
        pg = ctx.new_page(); pg.on('pageerror', lambda e: errors.append(str(e)))
        searches = []
        pg.on('request', lambda r: searches.append(r.url) if '/api/search' in r.url else None)
        pg.goto(BASE + '/?c=' + code); pg.fill('#jname', 'Ana'); pg.click('button[type=submit]'); pg.wait_for_selector('text=Hola, Ana')
        pg.click('[data-act=prepTab][data-arg=canciones]'); pg.click('[data-tab=search]')
        pg.wait_for_selector('#suggHead >> text=Sugerencias · Éxitos del momento')
        n = pg.locator('#results li').count(); assert n == 8, n
        assert 'Karaoke' not in pg.inner_text('#results'); print('✓ Éxitos: 8 sugerencias, sin karaoke')
        first = pg.inner_text('#results li >> nth=0'); pg.click('[data-sugg-more]'); pg.wait_for_timeout(1000*0.2)
        assert pg.inner_text('#results li >> nth=0') != first; print('✓ "Otras" cambia la tanda sin pedir de nuevo')
        pg.screenshot(path=os.path.join(OUT, 'sugg_exitos.png'))
        pg.click('[data-sugg=sim]'); pg.wait_for_selector('#resultsNote >> text=parecidas'); print('✓ Parecidas sin semillas: aviso')
        pg.click('[data-sugg=d90]'); pg.wait_for_selector('#results li >> text=Década'); assert any('años 90' in c for c in calls); print('✓ Década 90s')
        pg.click('#results [data-pact=add] >> nth=0'); pg.wait_for_timeout(1000*0.3)
        pg.click('[data-sugg=sim]'); pg.wait_for_selector('#results li >> text=Parecida'); print('✓ Parecidas al mazo con la lista como semilla')
        pg.screenshot(path=os.path.join(OUT, 'sugg_parecidas.png'))
        # espera al teclear: "queen" letra a letra → una sola búsqueda
        searches.clear(); pg.click('#q'); pg.type('#q', 'queen', delay=80); 
        for _ in range(30):
            if searches: break
            pg.wait_for_timeout(100)
        pg.wait_for_timeout(1000*0.6)
        assert len(searches) == 1, searches; print('✓ 5 teclas → 1 petición')
        assert pg.locator('#suggBar').is_hidden(); print('✓ Las sugerencias se ocultan al escribir')
        pg.fill('#q', ''); pg.dispatch_event('#q', 'input'); pg.type('#q', 'queen', delay=30); pg.wait_for_timeout(1000*1)
        assert len(searches) == 1, searches; print('✓ Búsqueda repetida sale de memoria')
        pg.fill('#q', 'q'); pg.dispatch_event('#q', 'input'); pg.wait_for_timeout(1000*0.8)
        assert len(searches) == 1 and '2 letras' in pg.inner_text('#resultsNote'); print('✓ 1 letra no busca')
        pg.fill('#q', ''); pg.dispatch_event('#q', 'input'); pg.wait_for_selector('#suggBar', state='visible'); print('✓ Vaciar vuelve a sugerencias')
    assert not errors, errors
    print('\nTodo OK')
finally:
    srv.kill()
