# Partida completa por la interfaz: 1 TV + 3 móviles en Chrome sin interfaz.
import os, subprocess, time, sys
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'test', 'shots')
os.makedirs(OUT, exist_ok=True)
PORT = 4011
BASE = f'http://localhost:{PORT}'
env = dict(os.environ, DEEZER_MOCK='1', HU_FAST='1', PORT=str(PORT))
srv = subprocess.Popen(['node', 'server.js'], cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
time.sleep(1)
errors = []

def shot(page, name):
    page.screenshot(path=os.path.join(OUT, name + '.png'))

try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--autoplay-policy=no-user-gesture-required'])
        tvc = b.new_context(viewport={'width': 1280, 'height': 720})
        tv = tvc.new_page()
        tv.on('pageerror', lambda e: errors.append('TV: ' + str(e)))
        tv.goto(BASE + '/tv')
        tv.click('#unlockBtn')
        tv.wait_for_function("location.search.includes('c=')")
        code = tv.evaluate("new URLSearchParams(location.search).get('c')")
        print('Sala', code)

        phones = {}
        for name in ['Ana', 'Bea', 'Carlos']:
            ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
            pg = ctx.new_page()
            pg.on('pageerror', lambda e, n=name: errors.append(n + ': ' + str(e)))
            pg.on('response', lambda r, n=name: print('HTTP', n, r.status, (r.request.post_data or '')[:90], r.text()[:120]) if '/api/action' in r.url and r.status != 200 else None)
            pg.goto(BASE + '/?c=' + code)
            pg.fill('#jname', name)
            pg.click('button[type=submit]')
            pg.wait_for_selector('text=Hola, ' + name)
            phones[name] = pg

        ana, bea, carlos = phones['Ana'], phones['Bea'], phones['Carlos']
        ana.click('[data-act=joinGroup][data-arg=g0]')
        carlos.click('[data-act=joinGroup][data-arg=g0]')
        bea.click('[data-act=joinGroup][data-arg=g1]')
        # lista personal
        bea.click('[data-act=prepTab][data-arg=canciones]'); bea.click('[data-tab=search]')
        bea.fill('#q', 'queen'); bea.wait_for_selector('#results li'); bea.click('#results [data-pact=add]')
        shot(bea, '02b_movil_mis_canciones')
        bea.click('[data-act=prepTab][data-arg=partida]')
        time.sleep(0.5)
        shot(tv, '01_tv_sala'); shot(ana, '02_movil_sala')
        ana.click('[data-act=start]'); tv.wait_for_selector('text=La Selección')
        shot(tv, '03_tv_intro')
        ana.click('[data-act=beginRound]')

        queries = ['despacito', 'macarena', 'waka', 'dancing', 'billie', 'tusa', 'bailando', 'flaca', 'quedate', 'uptown']
        qi = 0; shots_done = set(); turns = 0
        while turns < 20:
            turns += 1
            time.sleep(0.6)
            phase = tv.evaluate("document.body.innerText")
            if 'Clasificación tras la ronda 1' in phase:
                break
            prop = None
            for n, pg in phones.items():
                if pg.locator('text=Te toca,').count():
                    prop = n
            if not prop:
                continue
            pg = phones[prop]
            if 'buscador' not in shots_done:
                pg.click('[data-tab=search]')
            pg.click('[data-tab=search]')
            pg.fill('#q', ''); pg.wait_for_selector('#results li', state='detached')
            pg.fill('#q', queries[qi % len(queries)]); qi += 1
            pg.wait_for_selector('#results [data-pact=propose]')
            if 'buscador' not in shots_done:
                shot(pg, '04_movil_buscador'); shots_done.add('buscador')
            pg.click('#results [data-pact=propose] >> nth=0')
            try:
                tv.wait_for_selector('text=¿Qué canción es?', timeout=8000)
            except Exception:
                shot(pg, 'ERR_prop'); shot(tv, 'ERR_tv'); print('prop', prop, 'q', queries[(qi-1) % len(queries)]); raise
            time.sleep(0.8)
            rival = 'Bea' if prop in ('Ana', 'Carlos') else 'Ana'
            rp = phones[rival]
            if 'pulsador' not in shots_done:
                shot(tv, '05_tv_suena'); shot(rp, '06_movil_pulsador')
            rp.click('[data-act=buzz]')
            pg.wait_for_selector('[data-act=judge][data-arg=title]:not([disabled])')
            if 'pulsador' not in shots_done:
                time.sleep(0.4)
                shot(tv, '07_tv_responde'); shot(pg, '08_movil_juez'); shot(rp, '09_movil_os_toca'); shots_done.add('pulsador')
            pg.click('[data-act=judge][data-arg=title]')
            tv.wait_for_selector('text=Entra al mazo')
            if 'reveal' not in shots_done:
                shot(tv, '10_tv_revelacion'); shots_done.add('reveal')
            tv.wait_for_selector('text=Entra al mazo', state='detached', timeout=8000)

        tv.wait_for_selector('text=Clasificación tras la ronda 1', timeout=15000)
        shot(tv, '11_tv_clasificacion'); shot(bea, '12_movil_clasificacion')

        for rnd in (2, 3, 4):
            ana.click('[data-act=next]')
            ana.click('[data-act=beginRound]')
            falta_done = False
            for _ in range(80):
                time.sleep(0.4)
                txt = tv.evaluate('document.body.innerText')
                if ('Clasificación tras la ronda %d' % rnd) in txt or '¡Gana' in txt:
                    break
                for n, pg in phones.items():
                    if pg.locator('[data-act=begin]').count():
                        if rnd == 2 and 'ready' not in shots_done:
                            shot(pg, '13_movil_te_toca'); shot(tv, '14_tv_turno'); shots_done.add('ready')
                        pg.click('[data-act=begin]')
                    elif pg.locator('[data-act=hit]').count():
                        clue = n
                        rivals = [m for m, q in phones.items() if q.locator('[data-act=falta]').count()]
                        if rnd == 3 and not falta_done and rivals:
                            if 'carta' not in shots_done:
                                shot(pg, '15_movil_carta'); shot(phones[rivals[0]], '16_movil_vigilar'); shot(tv, '17_tv_turno_en_juego'); shots_done.add('carta')
                            phones[rivals[0]].click('[data-act=falta]')
                            tv.wait_for_selector('text=reclama a')
                            time.sleep(0.4)
                            shot(tv, '18_tv_falta'); shot(pg, '19_movil_falta_acusado')
                            pg.click('[data-act=faltaChoice][data-arg=admit]')
                            falta_done = True
                            continue
                        pg.click('[data-act=hit]')
                        break
        tv.wait_for_selector('text=¡Gana', timeout=30000)
        shot(tv, '20_tv_final'); shot(ana, '21_movil_final')
        print('Partida completa por la interfaz')
        b.close()
finally:
    srv.terminate()
    out = srv.stdout.read().decode()
    if 'Error' in out or 'TypeError' in out:
        print('SERVER LOG:', out[-2000:])
print('Errores de página:', errors or 'ninguno')
