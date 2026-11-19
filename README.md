# Hit's Up · versión 0.1

Juego musical por grupos: Hitster × Time's Up. Una TV muestra la partida y cada jugador juega con su móvil.

- **TV:** `https://TU-DIRECCION/tv` (portátil conectado a la tele, Chromecast o el navegador de la Smart TV).
- **Móviles:** `https://TU-DIRECCION` y el código de 4 letras que sale en la TV.

## Jugar en casa (recomendado)

El ordenador hace de servidor y los móviles se conectan por la misma wifi. Es lo más rápido y no necesita cuentas.

1. Instala **Node.js** (versión LTS) desde nodejs.org. Solo la primera vez.
2. Descomprime `hitsup.zip` y haz doble clic en **`Jugar.bat`**.
3. Si Windows pregunta por el firewall, marca **Redes privadas** y pulsa **Permitir**.
4. Se abre la TV en el navegador (`http://localhost:3000/tv`). Llévala a la tele por HDMI o enviando la pestaña al Chromecast.
5. Los móviles, conectados a **la misma wifi**, entran en la dirección que muestra la TV (del tipo `192.168.1.35:3000`) y escriben el código.

Deja abierta la ventana negra mientras jugáis: si la cierras, se acaba la partida.

## Publicarlo en internet con Render (opcional, para jugar desde redes distintas)

1. **GitHub:** crea una cuenta en github.com si no tienes. Pulsa **New repository**, ponle de nombre `hitsup`, márcalo como **Private** y créalo.
2. En el repositorio vacío, pulsa **uploading an existing file** y arrastra **todo el contenido** de esta carpeta (`server.js`, `package.json`, `render.yaml`, la carpeta `public`…). Pulsa **Commit changes**.
3. **Render:** entra en render.com y regístrate con tu cuenta de GitHub.
4. Pulsa **New → Web Service**, elige el repositorio `hitsup` y comprueba:
   - Runtime: **Node**
   - Build Command: `npm install`
   - Start Command: `node server.js`
   - Region: **Frankfurt (EU Central)**, para que el catálogo de Deezer sea el europeo
   - Instance Type: **Free**
5. Pulsa **Create Web Service**. En 2–3 minutos tendrás una dirección del tipo `https://hitsup-xxxx.onrender.com`.

Para actualizar el juego más adelante, sube los archivos nuevos al repositorio: Render lo vuelve a publicar solo.

### Cosas a saber del plan gratuito

- Si nadie lo usa durante 15 minutos, el servidor se duerme. La primera visita tarda cerca de **1 minuto** en despertarlo: abre la TV un rato antes de jugar.
- Las partidas viven en memoria: si el servidor se reinicia o se publica una versión nueva, la partida en curso se pierde.

## Cómo se juega

1. Abre `/tv` en la pantalla grande y pulsa **Activar el sonido**.
2. Cada jugador entra desde su móvil con el código y elige grupo. El primero en entrar es el **anfitrión**: elige el número de grupos y empieza la partida.
3. Mientras esperáis, cada uno puede preparar **su lista** de canciones desde el móvil.
4. **Ronda 1 · La Selección:** por turnos, cada grupo propone una canción, que suena en la TV. Los rivales pulsan en el móvil y responden en 5 s. Quien propuso hace de juez. Solo entran al mazo las canciones acertadas.
5. **Rondas 2–4 · Descríbela, Taréala, Báilala:** quien da pistas escucha la canción con **auriculares** en su móvil. Su grupo adivina y los rivales vigilan la carta con el botón **¡Falta!**.

## Pruebas

`npm test` juega una partida simulada completa con Deezer simulado.

## Limitaciones de esta versión

- Sin modo playlist ni modo individual (previstos para la versión 2).
- Sin código QR en la TV: se escribe la dirección y el código.
- El audio usa los fragmentos de 30 s de la API pública de Deezer.
