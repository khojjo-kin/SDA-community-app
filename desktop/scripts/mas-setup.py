"""Gets everything the Mac App Store build needs from App Store Connect, creating what is missing:

- the "Mac Installer Distribution" certificate (signs the .pkg) for the private key in
  $INSTALLER_KEY (made by the workflow the first time and kept on the desktop-signing branch);
- the Apple Distribution certificate PRZR6A95J9 (the iPhone build's; signs the app);
- a Mac App Store provisioning profile for Kojo.SDAAPPGEMINI with that certificate.

Writes installer.cer and dist.cer (DER) to $SIGN_DIR and build/embedded.provisionprofile, and
prints what it found. Also lists the latest builds per platform.
"""
import base64
import os
import sys

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.x509.oid import NameOID

from asc import ApiError, call, get_all

BUNDLE = 'Kojo.SDAAPPGEMINI'
DIST_CERT_ID = 'PRZR6A95J9'
PROFILE_NAME = 'Community Mac App Store'
sign = os.environ['SIGN_DIR']


def load_key(path):
    return serialization.load_pem_private_key(open(path, 'rb').read(), password=None)


def same_key(cert_der, key):
    cert = x509.load_der_x509_certificate(cert_der)
    return cert.public_key().public_numbers() == key.public_key().public_numbers()


def cert_content(cert_id):
    c = call('GET', f'/v1/certificates/{cert_id}?fields[certificates]=certificateContent,name,expirationDate')
    return base64.b64decode(c['data']['attributes']['certificateContent']), c['data']['attributes']


# ---------- the installer certificate ----------
inst_key = load_key(os.environ['INSTALLER_KEY'])
found = None
for c in get_all('/v1/certificates?filter[certificateType]=MAC_INSTALLER_DISTRIBUTION&fields[certificates]=name,expirationDate,certificateContent'):
    der = base64.b64decode(c['attributes']['certificateContent'])
    if same_key(der, inst_key):
        found = (c['id'], der, c['attributes'])
        break
if found:
    print('installer certificate: found', found[0], found[2]['name'], found[2]['expirationDate'])
else:
    csr = (
        x509.CertificateSigningRequestBuilder()
        .subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, 'Community Mac Installer'), x509.NameAttribute(NameOID.EMAIL_ADDRESS, 'ci@community.invalid'), x509.NameAttribute(NameOID.COUNTRY_NAME, 'GB')]))
        .sign(inst_key, hashes.SHA256())
    )
    pem = csr.public_bytes(serialization.Encoding.PEM).decode()
    try:
        made = call('POST', '/v1/certificates', {'data': {'type': 'certificates', 'attributes': {'certificateType': 'MAC_INSTALLER_DISTRIBUTION', 'csrContent': pem}}})
    except ApiError as e:
        print('could not create the installer certificate:', e)
        sys.exit(1)
    der = base64.b64decode(made['data']['attributes']['certificateContent'])
    found = (made['data']['id'], der, made['data']['attributes'])
    print('installer certificate: created', found[0], found[2].get('name'))
open(os.path.join(sign, 'installer.cer'), 'wb').write(found[1])

# ---------- the app certificate ----------
dist_der, dist_attr = cert_content(DIST_CERT_ID)
open(os.path.join(sign, 'dist.cer'), 'wb').write(dist_der)
print('app certificate:', DIST_CERT_ID, dist_attr['name'], dist_attr['expirationDate'])
dist_key_path = os.path.join(sign, 'dist.key')
if os.path.exists(dist_key_path):
    print('app certificate matches the saved key:', same_key(dist_der, load_key(dist_key_path)))

# ---------- the provisioning profile ----------
bundle = next(b for b in get_all(f'/v1/bundleIds?filter[identifier]={BUNDLE}&fields[bundleIds]=identifier,platform') if b['attributes']['identifier'] == BUNDLE)
profile = None
for p in get_all('/v1/profiles?filter[profileType]=MAC_APP_STORE&include=bundleId,certificates&fields[profiles]=name,profileState,profileContent,expirationDate,bundleId,certificates&limit=200'):
    rel = p['relationships']
    if rel['bundleId']['data']['id'] != bundle['id'] or p['attributes']['profileState'] != 'ACTIVE':
        continue
    if not any(c['id'] == DIST_CERT_ID for c in rel['certificates']['data']):
        continue
    profile = p
    break
if profile:
    print('profile: found', profile['attributes']['name'], profile['attributes']['expirationDate'])
else:
    # A stale profile with the same name would block the new one.
    for p in get_all(f'/v1/profiles?filter[name]={PROFILE_NAME.replace(" ", "%20")}&fields[profiles]=name'):
        try:
            call('DELETE', f"/v1/profiles/{p['id']}")
            print('removed old profile', p['id'])
        except ApiError as e:
            print('could not remove old profile', p['id'], e)
    made = call('POST', '/v1/profiles', {'data': {'type': 'profiles', 'attributes': {'name': PROFILE_NAME, 'profileType': 'MAC_APP_STORE'}, 'relationships': {'bundleId': {'data': {'type': 'bundleIds', 'id': bundle['id']}}, 'certificates': {'data': [{'type': 'certificates', 'id': DIST_CERT_ID}]}}}})
    profile = made['data']
    print('profile: created', profile['attributes']['name'], profile['attributes'].get('expirationDate'))
open('build/embedded.provisionprofile', 'wb').write(base64.b64decode(profile['attributes']['profileContent']))

# ---------- what TestFlight has ----------
app = next(a for a in get_all(f'/v1/apps?filter[bundleId]={BUNDLE}&fields[apps]=bundleId') if a['attributes']['bundleId'] == BUNDLE)
builds = call('GET', f"/v1/builds?filter[app]={app['id']}&sort=-uploadedDate&limit=12&include=preReleaseVersion&fields[builds]=version,uploadedDate,processingState,preReleaseVersion&fields[preReleaseVersions]=platform,version")
pre = {i['id']: i['attributes'] for i in builds.get('included', [])}
print('latest builds:')
for b in builds['data']:
    pv = pre.get((b['relationships'].get('preReleaseVersion', {}).get('data') or {}).get('id'), {})
    print('  ', pv.get('platform'), pv.get('version'), b['attributes']['version'], b['attributes']['uploadedDate'], b['attributes']['processingState'])
print('APP_ID', app['id'])
