# Chimi+ custom integration

This directory snapshots the custom Chimi+ layer currently deployed around Seerr/Jellyseerr on the Alaive Server.

## Purpose

The custom layer adds:

- authenticated ASC release availability checks;
- recent ASC catalogue feed;
- Chimi+ navigation/preview additions;
- pt-BR UI localization;
- reverse-proxy injection for the custom scripts.

## Runtime model

The deployed server keeps this code outside the upstream Seerr application and injects it through the Chimi+ reverse proxy. This reduces coupling with upstream updates.

Current runtime source on the server:

`/Users/maguziserver/AlaiveServer/infrastructure/chimiplus/availability/`

## Secrets

No API keys are stored in this repository. Runtime code reads the Prowlarr API key from the local Prowlarr configuration file.

## Scope

This snapshot documents and versions the deployed custom layer. Runtime state, caches, `__pycache__`, databases, credentials, container volumes, logs and private configuration are intentionally excluded.

See `docs/chimi-plus-unified-search.md` for architecture and expected behavior.
