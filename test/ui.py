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
        ana.click('[data-act=editName]')
        ana.fill('#gname', 'Las <i>Fieras</i>')
        shot(ana, '02a_movil_editar_nombre')
        ana.click('#gform button[type=submit]')
        tv.wait_for_selector('text=Las <i>Fieras</i>')
        ana.wait_for_selector('#gform', state='detached')
        time.sleep(0.5)
        shot(tv, '01_tv_sala'); shot(ana, '02_movil_sala')
        ana.click('[data-act=start]'); tv.wait_for_selector('text=La Selección')
        time.sleep(0.4); shot(tv, '03_tv_intro'); shot(bea, '03b_movil_intro')
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
            if 'audio' not in shots_done:
                tv.wait_for_function('window.__huAudio && !window.__huAudio.paused && window.__huAudio.currentTime > 0.3', timeout=6000)
                print('  ✓ La canción suena en la TV')
            rp.click('[data-act=buzz]')
            pg.wait_for_selector('[data-act=judge][data-arg=title]:not([disabled])')
            if 'audio' not in shots_done:
                tv.wait_for_function('window.__huAudio.paused', timeout=3000)
                paused_at = tv.evaluate('window.__huAudio.currentTime')
                print('  ✓ Se pausa al pulsar (en %.1f s)' % paused_at)
            if 'pulsador' not in shots_done:
                time.sleep(0.4)
                shot(tv, '07_tv_responde'); shot(pg, '08_movil_juez'); shot(rp, '09_movil_os_toca'); shots_done.add('pulsador')
                pg.wait_for_selector('text=¿Ha acertado?', timeout=9000)
                time.sleep(0.3)
                shot(tv, '07b_tv_decide_juez'); shot(pg, '08b_movil_juez_decide'); shot(rp, '09b_movil_decide_juez')
            pg.click('[data-act=judge][data-arg=title]')
            tv.wait_for_selector('text=Entra al mazo')
            if 'audio' not in shots_done:
                tv.wait_for_function('!window.__huAudio.paused && window.__huAudio.currentTime > %f' % (paused_at + 0.3), timeout=4000)
                print('  ✓ Se reanuda al acertar, desde donde se paró (%.1f s)' % tv.evaluate('window.__huAudio.currentTime'))
                shots_done.add('audio')
            if 'reveal' not in shots_done:
                shot(tv, '10_tv_revelacion'); shots_done.add('reveal')
            tv.wait_for_selector('text=Entra al mazo', state='detached', timeout=8000)

        tv.wait_for_selector('text=Clasificación tras la ronda 1', timeout=15000)
        shot(tv, '11_tv_clasificacion'); shot(bea, '12_movil_clasificacion')

        for rnd in (2, 3, 4):
            ana.click('[data-act=next]')
            tv.wait_for_selector('text=Ronda %d' % rnd); time.sleep(0.4)
            shot(tv, '%02d_tv_intro_r%d' % (30 + rnd, rnd)); shot(bea, '%02d_movil_intro_r%d' % (30 + rnd, rnd))
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
                        if rnd == 2 and 'handoff' not in shots_done:
                            shots_done.add('handoff')
                            try:
                                pg.wait_for_function('window.__phoneAudio && !window.__phoneAudio.paused && window.__phoneAudio.currentTime > 1.5', timeout=5000)
                                ph_pos = pg.evaluate('window.__phoneAudio.currentTime')
                                t0 = time.time()
                                pg.click('[data-act=hit]')
                                tv.wait_for_function('!window.__huAudio.paused && window.__huAudio.currentTime > 0', timeout=4000)
                                tv_pos = tv.evaluate('window.__huAudio.currentTime'); dt = time.time() - t0
                                ok = abs(tv_pos - (ph_pos + dt)) < 0.8
                                print('  %s Relevo auriculares → tele: móvil en %.2f s, tele en %.2f s (%.2f s después)' % ('✓' if ok else '✗', ph_pos, tv_pos, dt))
                                time.sleep(0.3)
                                print('  %s El móvil deja de sonar al pasar a la tele' % ('✓' if pg.evaluate('window.__phoneAudio.paused') else '✗'))
                                shot(tv, '17b_tv_acertada'); shot(pg, '17c_movil_acertada')
                            except Exception as e:
                                print('  ✗ Relevo auriculares → tele:', str(e)[:200])
                            break
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
