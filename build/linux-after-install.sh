#!/bin/bash
set -e

# Recreate the parts of the default electron-builder postinst that get
# overwritten when afterInstall is used.
if type update-alternatives 2>/dev/null >&1; then
    if [ -L '/usr/bin/${executable}' ] && [ -e '/usr/bin/${executable}' ] && [ "$(readlink '/usr/bin/${executable}')" != '/etc/alternatives/${executable}' ]; then
        rm -f '/usr/bin/${executable}'
    fi
    update-alternatives --install '/usr/bin/${executable}' '${executable}' '/opt/${productFilename}/${executable}' 100 || ln -sf '/opt/${productFilename}/${executable}' '/usr/bin/${executable}'
else
    ln -sf '/opt/${productFilename}/${executable}' '/usr/bin/${executable}'
fi

# Force SUID on chrome-sandbox. The default electron-builder logic skips this
# when the kernel reports user-namespace support, but on Ubuntu 24.04+ AppArmor
# blocks unprivileged user namespaces at runtime even when the test passes,
# leaving the app unable to start without --no-sandbox.
chown root:root '/opt/${productFilename}/chrome-sandbox' || true
chmod 4755 '/opt/${productFilename}/chrome-sandbox' || true

if hash update-mime-database 2>/dev/null; then
    update-mime-database /usr/share/mime || true
fi

if hash update-desktop-database 2>/dev/null; then
    update-desktop-database /usr/share/applications || true
fi
