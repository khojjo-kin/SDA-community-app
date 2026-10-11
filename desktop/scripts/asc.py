"""A small App Store Connect API client for the Mac TestFlight workflow.

Reads the key from ASC_KEY_PATH, ASC_KEY_ID and ASC_ISSUER_ID (the same key the iPhone build uses).
"""
import json
import os
import time
import urllib.error
import urllib.request

import jwt

BASE = 'https://api.appstoreconnect.apple.com'


def _token():
    key = open(os.environ['ASC_KEY_PATH']).read()
    now = int(time.time())
    return jwt.encode(
        {'iss': os.environ['ASC_ISSUER_ID'], 'iat': now, 'exp': now + 1100, 'aud': 'appstoreconnect-v1'},
        key,
        algorithm='ES256',
        headers={'kid': os.environ['ASC_KEY_ID'], 'typ': 'JWT'},
    )


class ApiError(Exception):
    def __init__(self, status, body):
        super().__init__(f'HTTP {status}: {body[:1500]}')
        self.status = status
        self.body = body


def call(method, path, body=None):
    """One request; returns the decoded JSON (or None for an empty answer)."""
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method, headers={'Authorization': 'Bearer ' + _token(), 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            txt = r.read().decode()
            return json.loads(txt) if txt else None
    except urllib.error.HTTPError as e:
        raise ApiError(e.code, e.read().decode())


def get_all(path):
    """Every page of a list."""
    out = []
    while path:
        page = call('GET', path)
        out += page.get('data', [])
        nxt = page.get('links', {}).get('next')
        path = nxt[len(BASE):] if nxt else None
    return out
