# Agent Browser Runtime TLS Gateway

This service is a local HTTP proxy that can be wired into Chromium at browser launch time with `--proxy-server`.

In the default compose stack:

- Chromium receives `BRS_TLS_GATEWAY_PROXY_SERVER=http://tls-gateway:8080` before it starts.
- Chromium also receives `--disable-quic` when that gateway proxy is active.
- The broker reports gateway health and stats through `./cli/brs.js status`.

The default path is intended to keep browser networking coherent at launch time. It is not a post-attach CDP header patch.

For responsible operation, keep rate limits conservative, use manual handoff for login/challenge flows, and respect target platform terms and account-safety boundaries.
