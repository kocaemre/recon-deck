---
target: "box.htb (10.10.10.5)"
ip: "10.10.10.5"
hostname: "box.htb"
engagement: "box.htb (10.10.10.5)"
status: "active"
os: "Linux 5.x"
ports:
  - 53/udp
  - 80/tcp
  - 443/tcp
coverage: 67
tags:
  - recon-deck
  - pentest
recon-deck-version: "0.0.0-test"
exported_at: "2026-04-17T12:00:00.000Z"
---

# box.htb (10.10.10.5)

## Ports

| Port | Proto | Service | Version | Done |
|------|-------|---------|---------|------|
| 53 | udp | domain |  | 1/1 |
| 80 | tcp | http | Apache 2.4.52 | 1/1 |
| 443 | tcp | https | nginx 1.18 | 0/1 |

## Port 53/udp — domain

### Commands

- **dig axfr:** `dig axfr @10.10.10.5 box.htb`

### Checklist

- [x] Attempt zone transfer (AXFR)

## Port 80/tcp — http (Apache 2.4.52)

### NSE Output

**http-title**

```text
<script>alert(1)</script> Site Title
```

### Commands

- **gobuster dir:** `gobuster dir -u http://10.10.10.5:80/`

### Checklist

- [x] Check for directory listing

### Notes

Looked at main page, see screenshot-01.png in HackTricks folder

## Port 443/tcp — https (nginx 1.18)

### NSE Output

**ssl-cert**

```text
Subject: CN=box.htb
```

### AutoRecon Files

**tcp_443_https_curl.txt**

```text
HTTP/1.1 200 OK
```

### Commands

- **openssl s_client:** `openssl s_client -connect 10.10.10.5:443`

### AutoRecon Commands

- **nikto:** `nikto -h 10.10.10.5:443`

### Checklist

- [ ] Inspect TLS certificate

## Host Scripts

**smb-os-discovery**

```text
OS: Windows Server 2019
```
