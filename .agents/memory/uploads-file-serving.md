---
name: Uploads file serving authorization
description: How /api/files downloads are authorized and why express.static must not return
---

- `/api/files/:filename` is a custom handler (not express.static): it requires a `Document` row whose `fileUrl` matches, then `userCanAccessProject` on that row's project(s); 404 otherwise (no existence leak). Unattached uploads are intentionally not downloadable.
- Stored upload names are `${ts}-${randomHex}.pdf` — never keep client filename/extension.
- Uploads are validated by magic bytes (`%PDF-`) after write; multer's `fileFilter` mimetype check is attacker-controlled and only a first pass.
- Downloads always send `Content-Type: application/pdf` + `Content-Disposition: attachment` so a stored payload can never render as HTML in origin (nosniff alone does NOT stop server-declared text/html).
**Why:** express.static behind requireAuth alone allowed cross-project BOLA (timestamp brute-force) and stored XSS via spoofed .html uploads.
**How to apply:** any new upload type or file-serving route must repeat this pattern: content validation, random stored name, Document-backed authz, fixed content type + attachment.
