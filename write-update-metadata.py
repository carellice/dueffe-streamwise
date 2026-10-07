#!/usr/bin/env python3
"""Generate the public metadata uploaded alongside a signed release APK."""
import hashlib
import json
import sys
from pathlib import Path


def write_metadata(apk, code, name, package):
    apk = Path(apk)
    if not apk.is_file() or apk.stat().st_size == 0:
        raise ValueError("APK mancante o vuoto")
    if int(code) <= 0:
        raise ValueError("versionCode non valido")
    digest = hashlib.sha256()
    with apk.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    checksum = digest.hexdigest()
    destination = apk.parent / "latest.json"
    destination.write_text(json.dumps({"packageName": package, "versionCode": int(code), "versionName": name,
                                       "apk": apk.name, "sha256": checksum}, indent=2) + "\n")
    return destination


if __name__ == "__main__":
    write_metadata(*sys.argv[1:5])
