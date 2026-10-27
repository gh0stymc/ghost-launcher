// Linux: envuelve el ejecutable en un pequeño script de arranque.
// Ubuntu 23.10+ y otras distros bloquean el "sandbox" de Chromium en apps que no se instalan
// con el gestor de paquetes (AppImage, .tar.gz). En esos sistemas el script arranca sin sandbox;
// en el resto, arranca normal.
const fs = require('fs')
const path = require('path')

const wrapper = (bin) => `#!/bin/bash
HERE="$(dirname "$(readlink -f "$0")")"
EXTRA=()
if [ "$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null)" = "1" ] || \\
   [ "$(cat /proc/sys/kernel/unprivileged_userns_clone 2>/dev/null)" = "0" ]; then
  if [ ! -u "$HERE/chrome-sandbox" ]; then
    EXTRA+=(--no-sandbox)
  fi
fi
exec "$HERE/${bin}" "\${EXTRA[@]}" "$@"
`

exports.default = async function afterPack (context) {
  if (context.electronPlatformName !== 'linux') return
  const name = context.packager.executableName
  const exe = path.join(context.appOutDir, name)
  const bin = `${name}.bin`
  fs.renameSync(exe, path.join(context.appOutDir, bin))
  fs.writeFileSync(exe, wrapper(bin), { mode: 0o755 })
  fs.chmodSync(exe, 0o755)
}
