# Retail device adapter boundary

Epic BOS now keeps an immutable, scoped adapter profile for each approved store device. A profile is a controlled configuration record; it is **not** proof that a driver is installed, a device is paired, or a physical action succeeded.

## Profile lifecycle

1. A maker creates a profile with the device kind, device code, transport, bounded configuration, declared capabilities, and the precise driver boundary.
2. A different reviewer approves the profile with an evidence reference.
3. A profile-bound device command receives an independently recorded response.
4. A third reviewer records that acknowledgement against the profile.
5. Only a separate release reviewer may activate a profile, and only when the acknowledgement came from the implemented network TCP execution path.
6. Later network commands can use that same profile only while its exact current version is `approved` or `operational`. Epic BOS reads the reviewed endpoint from the profile; it never accepts an arbitrary host or port for a live command.

This preserves maker-checker separation and prevents a profile from being called operational without a current, profile-bound acknowledgement.

## Network command boundary

- A network command without a profile ID is rejected as legacy/unbound and must be prepared again from Device setup.
- A profile ID is accepted only when its kind, device code, connection, capability, scope, version, and `approved`/`operational` status still match the command.
- The Hardware workbench shows a single locked **Reviewed endpoint**. It cannot be edited in the command form.
- Network responses are captured only by the bounded main-process TCP executor. A manual acknowledgement may document USB, Bluetooth, or manual handoff evidence, but cannot activate a network profile.
- Repeated valid TCP status responses are retained as separate command records. Their profile/version, exact endpoint, command ID, and executor origin remain part of the evidence; response text alone is not used as a global replay key.

## Current implementation truth

| Transport | What Epic BOS can currently record | What it cannot claim or do yet |
| --- | --- | --- |
| Network | A bounded TCP connection/payload/response checksum and response length. | Model-specific protocol certification, TLS/client-cert lifecycle, vendor SDK support, or a guarantee that a printer/drawer/scale completed its mechanical action. |
| USB | A user-selected Web Serial diagnostic and bounded metadata. | Native USB driver installation, HID barcode input in POS, automatic device discovery, cash-drawer pulse, or production driver certification. |
| Bluetooth | An approved profile-bound Web Bluetooth diagnostic can select one GATT device, write one bounded payload, read one bounded response, close the connection, and retain checksum evidence. | Native driver installation, unattended discovery/pairing, reconnect handling, HID/cash-drawer production control, or live activation without a certified native bridge. |
| Manual | A governed procedure reference and operator evidence. | Automated physical-device communication or driver certification. |

## Configuration rules

- Network profiles store only a hostname/IP and TCP port; paths and credentials are rejected.
- USB profiles require hexadecimal vendor/product IDs and optional bounded serial/baud metadata.
- Bluetooth profiles require a service UUID, a diagnostic characteristic UUID, and optionally a validated MAC address; no secrets are stored.
- Manual profiles require an operator procedure reference.
- Profiles declare a primary capability appropriate to their device kind: barcode input, receipt printing, drawer pulse, or weight reading. A profile cannot request another device kind's capability.

## Physical-device gap to close later

Before certifying a real USB or Bluetooth deployment, select the exact device models and obtain their documented protocols or vendor SDKs. The native-driver evidence form is now the governed handoff into that external bridge: it requires the current profile/version, approved driver identity, independent operator, response reference, and bounded response metadata. A production adapter still needs a least-privilege native Electron bridge with connection lifecycle, bounded reads/writes, device identity verification, acknowledgement capture, failure/recovery tests, and hardware-in-hand acceptance evidence. Do not treat the current profile registry or Web Serial/Web Bluetooth diagnostic as a substitute for that work.
