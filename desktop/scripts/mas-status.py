"""Prints the Mac builds on App Store Connect with their processing and TestFlight state.

python3 scripts/mas-status.py            the latest Mac builds
python3 scripts/mas-status.py <build>    also waits (up to 25 minutes) until that build has been processed
"""
import sys
import time

from asc import ApiError, call, get_all

BUNDLE = 'Kojo.SDAAPPGEMINI'
app = next(a for a in get_all(f'/v1/apps?filter[bundleId]={BUNDLE}&fields[apps]=bundleId') if a['attributes']['bundleId'] == BUNDLE)


def mac_builds():
    q = ('&sort=-uploadedDate&limit=20&include=buildBetaDetail,preReleaseVersion&fields[builds]=version,uploadedDate,processingState,expired,buildBetaDetail,preReleaseVersion'
         '&fields[buildBetaDetails]=internalBuildState,externalBuildState&fields[preReleaseVersions]=version,platform')
    try:
        r = call('GET', f"/v1/builds?filter[app]={app['id']}&filter[preReleaseVersion.platform]=MAC_OS" + q)
    except ApiError:
        r = call('GET', f"/v1/builds?filter[app]={app['id']}" + q)
    inc = {(i['type'], i['id']): i['attributes'] for i in r.get('included', [])}
    out = []
    for b in r['data']:
        rel = b['relationships']
        beta = inc.get(('buildBetaDetails', (rel.get('buildBetaDetail', {}).get('data') or {}).get('id')), {})
        pre = inc.get(('preReleaseVersions', (rel.get('preReleaseVersion', {}).get('data') or {}).get('id')), {})
        if pre.get('platform') not in (None, 'MAC_OS'):
            continue
        out.append({'version': pre.get('version'), 'build': b['attributes']['version'], 'uploaded': b['attributes']['uploadedDate'],
                    'processing': b['attributes']['processingState'], 'internal': beta.get('internalBuildState'), 'external': beta.get('externalBuildState')})
    return out[:6]


want = sys.argv[1] if len(sys.argv) > 1 else None
deadline = time.time() + 25 * 60
while True:
    builds = mac_builds()
    for b in builds:
        print('  ', b)
    mine = next((b for b in builds if b['build'] == want), None) if want else None
    if not want or (mine and mine['processing'] in ('VALID', 'FAILED', 'INVALID')) or time.time() > deadline:
        if want:
            print('BUILD', want, 'is', mine['processing'] if mine else 'not listed yet', '| TestFlight:', mine['internal'] if mine else '-')
        break
    print('waiting for', want, '…')
    time.sleep(60)
