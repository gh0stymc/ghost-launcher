# Ghost Launcher

Hola 👋 soy gh0stymc. Llevo un montón de horas jugando PvP en Minecraft, y como a muchos, lo que me gustaba de
Lunar Client era tenerlo todo en un sitio: HUD, cosméticos, skins, rendimiento... pero siempre me faltaba poder
hacerlo a mi manera, sin paywalls y en condiciones. Así que en vez de seguir quejándome, me puse a hacer el mío.

**Ghost Launcher** es eso: un launcher de Minecraft gratuito (Electron + React) con su propio cliente PvP,
[ghost client](https://github.com/gh0stymc/ghost-client). La idea es sencilla — lo mejor de un launcher tipo Lunar,
pero libre, en español y con su propia cara. Lo uso yo a diario, así que lo que no me gusta, lo cambio.

**Descarga:** [última versión para Windows y Linux](https://ghost-server.gh0styclient.workers.dev/descargar).
Se actualiza solo en segundo plano.

> No es un producto oficial de Minecraft ni está aprobado por Mojang o Microsoft.
> Minecraft se descarga de los servidores de Mojang y necesita una cuenta que tenga el juego comprado.

## Qué hace

- **Cuenta Microsoft**: inicio de sesión oficial, varias cuentas, la sesión se guarda cifrada.
- **Versiones oficiales**: cualquier release o snapshot de Mojang.
- **Java automático**: descarga la versión de Java que necesita cada versión (8, 17, 21, 25…).
- **Perfiles**: cada uno con su carpeta, versión, Fabric o Vanilla, RAM, resolución y argumentos de Java.
- **Mods sin límites**: busca e instala mods, texturas y shaders de Modrinth (con sus dependencias),
  o arrastra tus propios `.jar`/`.zip`. Puedes activarlos y desactivarlos sin borrarlos.
- **Mods integrados**: cada perfil nuevo con Fabric trae mods libres de Modrinth que dan las funciones de los
  mods integrados de Lunar (Ghost Client, nuestro cliente basado en AxolotlClient, para el HUD PvP, zoom y freelook; Sodium/Iris; minimapa; etc.)
  y el mod **Capes**. Se eligen en Ajustes. Un comprobador lee los requisitos de cada mod y ajusta versiones
  para que todo arranque, aunque Modrinth tenga versiones mal etiquetadas.
- **Modpacks**: importa modpacks de Modrinth (buscándolos o desde un archivo .mrpack) y tus perfiles de Lunar Client
  (mods, configuración, texturas, opciones y servidores; tu Lunar no se toca). Los mods se reconocen solos en Modrinth.
- **ghost client**: HUD, zoom, freelook, Sound Effects (sonidos al matar y morir), skin animada en el menú
  y pantalla de carga propia (animación 3D, o tu imagen, GIF o vídeo).
- **Vestidor**: guarda tus skins y cambia entre ellas; se cambian en tu cuenta oficial, así que se ven en todos
  los servidores. También capas y copiar la skin de cualquier jugador.
- **Tiempo de juego y medallas**: horas por perfil y versión, medallas a las 500, 750, 1000, 2500 y 5000 horas.
- **Actualizaciones automáticas**: se descargan solas en segundo plano desde el servidor de Ghost (Cloudflare).
- **Personalización**: foto por perfil, color principal (el texto se adapta para que siempre se lea), fondo, ocultar el launcher al jugar.

## Uso

```bash
npm start          # compila la interfaz y abre el launcher
npm run dev        # modo desarrollo con recarga en vivo
npm run dist       # crea el instalador en release/
```

## Dónde se guardan los datos

`%APPDATA%\ghost-launcher`

- `minecraft/`: versiones, librerías y assets compartidos
- `instances/<id>/`: un perfil (mods, mundos, opciones)
- `java/<versión>/`: Java descargado
- `launcher.json`: perfiles, ajustes y cuentas

## Estructura del código

- `electron/`: proceso principal (Node)
  - `auth.js` inicio de sesión Microsoft
  - `versions.js` versiones de Mojang y Fabric (con servidores de respaldo)
  - `java.js` descarga de Java
  - `modrinth.js` mods, texturas y shaders
  - `modpacks.js` importar modpacks de Modrinth y Lunar Client
  - `builtins.js` lista de mods integrados (y Capes)
  - `resolver.js` comprobador de compatibilidad entre mods
  - `ghostclient.js` instala ghost client (incluido en `resources/ghost-client/`)
  - `wardrobe.js` vestidor (API de skins de Mojang)
  - `loadingscreen.js` pantalla de carga de ghost client
  - `updater.js` actualizaciones automáticas
  - `launch.js` lanza el juego
  - `profiles.js`, `store.js` datos guardados
- `src/`: interfaz React
  - `pages/` Inicio, Perfiles, Mods, Consola, Ajustes
  - `styles.css` todo el diseño (colores en `:root`)
- `scripts/make-icons.js`: regenera los iconos (`node scripts/make-icons.js brand/logo-original.png`)
- `scripts/selftest.js`: prueba completa sin interfaz
- `scripts/test-builtins.js`: instala los mods integrados en una versión y comprueba que el juego arranca

## Publicar una versión

1. Compila ghost client ([repositorio](https://github.com/gh0stymc/ghost-client)) y copia los `.jar` de
   `versions/*/build/libs/` a `resources/ghost-client/` (no se guardan en este repositorio).
2. Sube el número de versión en `package.json`.
3. Windows: `npx electron-builder --win --publish never`. Linux (desde Ubuntu): `npx electron-builder --linux`
   (AppImage, tar.gz, pacman para CachyOS/Arch y deb para Ubuntu).
4. Sube el instalador y los `.yml` al servidor con `node tools/upload-release.js` (van a Cloudflare R2, servidos
   por el Worker de [ghost-server](https://ghost-server.gh0styclient.workers.dev)). Deja solo la última versión en
   el bucket. Los launchers instalados la descargan solos. Los binarios **no** se suben a este repositorio.

## Licencia

El código del launcher es [MIT](LICENSE). ghost client, que va incluido, es una versión modificada de
[AxolotlClient](https://codeberg.org/AxolotlClient/AxolotlClient-mod) con licencia LGPL-3.0; su código está en
[gh0stymc/ghost-client](https://github.com/gh0stymc/ghost-client).
