"""Prints what App Store Connect has for Community: the app, its platforms, the bundle IDs, the
certificates and the profiles, so the Mac TestFlight setup can be checked. Prints no secrets."""
from asc import ApiError, call, get_all

BUNDLE = 'Kojo.SDAAPPGEMINI'


def show(title, rows):
    print(f'== {title}')
    for r in rows:
        print('  ', r)


try:
    apps = get_all('/v1/apps?fields[apps]=name,bundleId,sku,primaryLocale&limit=50')
    show('apps', [(a['id'], a['attributes']['name'], a['attributes']['bundleId']) for a in apps])
    app = next((a for a in apps if a['attributes']['bundleId'] == BUNDLE), None)
    if app:
        vers = get_all(f"/v1/apps/{app['id']}/appStoreVersions?fields[appStoreVersions]=platform,versionString,appStoreState&limit=50")
        show('app store versions', [(v['id'], v['attributes']) for v in vers])
        builds = get_all(f"/v1/builds?filter[app]={app['id']}&fields[builds]=version,uploadedDate,processingState,expired&limit=5&sort=-uploadedDate")
        show('latest builds', [b['attributes'] for b in builds[:5]])
        groups = get_all(f"/v1/apps/{app['id']}/betaGroups?fields[betaGroups]=name,isInternalGroup,hasAccessToAllBuilds")
        show('beta groups', [(g['id'], g['attributes']) for g in groups])
    ids = get_all('/v1/bundleIds?fields[bundleIds]=identifier,platform,name,seedId&limit=200')
    show('bundle ids', [(b['id'], b['attributes']) for b in ids if 'SDAAPPGEMINI' in b['attributes']['identifier'] or 'ommunity' in b['attributes']['name']])
    certs = get_all('/v1/certificates?fields[certificates]=certificateType,displayName,name,serialNumber,expirationDate,platform&limit=200')
    show('certificates', [(c['id'], c['attributes']) for c in certs])
    profiles = get_all('/v1/profiles?fields[profiles]=name,profileType,profileState,expirationDate,uuid&limit=200')
    show('profiles', [(p['id'], p['attributes']) for p in profiles])
except ApiError as e:
    print('API ERROR', e)
    raise
