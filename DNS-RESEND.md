# Resend DNS records for viscosejournal.com

Status 2026-11-06 15:24 ET: **none of these are live yet; values now complete.** Resend answers
`403 The viscosejournal.com domain is not verified`, and HostGator's authoritative nameserver
(`ns4249.hostgator.com`) returns nothing for all four names below.

Where to add: **HostGator → cPanel → Zone Editor → viscosejournal.com → + Add Record**.
TTL: leave **Auto** (HostGator fills 14400).

> Do not touch the existing MX records (`aspmx.l.google.com` …) — that is the domain's live
> Google Workspace mail. None of the records below overlap with it.
>
> This is a **CNAME delegation** flow, not the older MX+TXT-on-`send` flow. CNAMEs must point at
> the exact targets Resend shows; a typo in the target silently fails verification.

## 1 · DKIM — fully known, ready to add

| Field | Value |
| --- | --- |
| Type | `TXT` |
| Name | `resend._domainkey` |
| Content | paste the `p=MIG…` value below |
| TTL | Auto |

Value (218 characters, one TXT string, no splitting, no quotes):

```
p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDBVZYF5OgpxYU9ucbAAuUj8nOZu5qj6cAkPpdx6AvLQb6VEYJStPVLzEnuURVPGRgzMXstaH9JppxAgEPy07Pxc6YaG0dgtaY2q0RN6Fg3Ryfq73hw5XAKAxNoW7dcFmD0bSpSB6NzyN31x9jAH35t1NRFoB3QxK8L5kZRnekIFwIDAQAB
```

## 2 · SPF — CNAME

| Field | Value |
| --- | --- |
| Type | `CNAME` |
| Name | `rsend` |
| Content | `rsend.forge.rmta.net` |
| TTL | Auto |

## 3 · Sending infrastructure — CNAME

| Field | Value |
| --- | --- |
| Type | `CNAME` |
| Name | `send` |
| Content | `send.forge.rmta.net` |
| TTL | Auto |

Both targets end in `forge.rmta.net`, which is Resend's delegated sending infrastructure: the
CNAME hands SPF and bounce handling to them without touching the domain's own MX or SPF.

## 4 · DMARC — optional, recommended

| Field | Value |
| --- | --- |
| Type | `TXT` |
| Name | `_dmarc` |
| Content | `v=DMARC1; p=none;` |
| TTL | Auto |

`p=none` is monitor-only: it asks receivers to report, and enforces nothing. Combining it with
"Enable receiving: off" is correct — Resend only sends for this domain.

## How this gets verified

Run against the authoritative nameserver (bypasses cache):

```sh
dig +short TXT   resend._domainkey.viscosejournal.com @ns4249.hostgator.com
dig +short CNAME rsend.viscosejournal.com              @ns4249.hostgator.com
dig +short CNAME send.viscosejournal.com               @ns4249.hostgator.com
dig +short TXT   _dmarc.viscosejournal.com             @ns4249.hostgator.com
```

Then Resend → Domains → viscosejournal.com → **Verify**, and finally:

```sh
npm run mail:test -- juje@viscosejournal.com
```

Once that send is accepted, switch `.env.local`:

```
RESEND_FROM="PULL <pull@viscosejournal.com>"
# delete RESEND_REDIRECT_TO — real recipients work now
```

## Why the targets must be copied exactly

The CNAME targets are account-specific (`…forge.rmta.net`). A typo does not error loudly — Resend
keeps the domain unverified and the only symptom is the same 403. If HostGator appends the zone
name to a CNAME target (check the saved record for `…rmta.net.viscosejournal.com`), edit it to end
with a trailing dot: `rsend.forge.rmta.net.`
