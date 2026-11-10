#!/usr/bin/env python3
"""proxy-tunnel.py HOST PORT WATCH_PID

Local TCP relay through an HTTP CONNECT proxy, for redis-cli, which cannot use a proxy itself.
Inside the Claude Code sandbox the only way out is the sandbox's HTTP proxy, so mailbox.sh points
redis-cli at this relay (bug 2026-11-09: every mailbox call in a sandboxed session failed with
"cannot reach <host>:6379 over TLS" even with the host in allowedDomains).

Proxy: HTTPS_PROXY, else ALL_PROXY (http://[user:pass@]host:port). NO_PROXY is honoured.
Binds 127.0.0.1 on a free port, prints the port on stdout, then detaches and serves (one CONNECT
per local connection) until process WATCH_PID exits. TLS stays end to end: the relay only moves
bytes, redis-cli does the handshake with the real server.

Exit: 0 port printed; 2 bad arguments; 3 no proxy applies to HOST (connect directly).
Stdlib only; run with python3 -I.
"""
import base64
import os
import select
import socket
import sys
import threading
import time
from urllib.parse import unquote, urlsplit
from urllib.request import proxy_bypass_environment

CONNECT_TIMEOUT = 15     # seconds for the proxy to answer CONNECT
WATCH_EVERY = 1.0        # seconds between checks that WATCH_PID is alive
BUF = 65536
HEAD_MAX = 16384         # longest CONNECT reply header accepted


def proxy_for(host):
    """(proxy_host, proxy_port, basic_auth_or_None) for HOST, or None when none applies."""
    if proxy_bypass_environment(host):
        return None
    for k in ("HTTPS_PROXY", "https_proxy", "ALL_PROXY", "all_proxy"):
        v = os.environ.get(k, "")
        if not v:
            continue
        u = urlsplit(v if "://" in v else "http://" + v)
        try:
            pport = u.port
        except ValueError:
            continue
        if u.scheme != "http" or not u.hostname or not pport:
            continue
        auth = None
        if u.username is not None:
            cred = "%s:%s" % (unquote(u.username), unquote(u.password or ""))
            auth = base64.b64encode(cred.encode()).decode()
        return u.hostname, pport, auth
    return None


def close_all(*socks):
    for s in socks:
        try:
            s.close()
        except OSError:
            pass


def pipe(a, b):
    try:
        while True:
            r, _, _ = select.select([a, b], [], [])
            for s in r:
                d = s.recv(BUF)
                if not d:
                    return
                (b if s is a else a).sendall(d)
    except OSError:
        return
    finally:
        close_all(a, b)


def handle(client, proxy, host, port):
    phost, pport, auth = proxy
    up = None
    try:
        up = socket.create_connection((phost, pport), timeout=CONNECT_TIMEOUT)
        req = "CONNECT %s:%d HTTP/1.1\r\nHost: %s:%d\r\n" % (host, port, host, port)
        if auth:
            req += "Proxy-Authorization: Basic %s\r\n" % auth
        up.sendall((req + "\r\n").encode())
        head = b""
        while b"\r\n\r\n" not in head:
            d = up.recv(4096)
            if not d or len(head) > HEAD_MAX:
                raise OSError("proxy closed during CONNECT")
            head += d
        status = head.split(b"\r\n", 1)[0].split()
        if len(status) < 2 or status[1] != b"200":
            raise OSError("proxy refused CONNECT")
        up.settimeout(None)
        rest = head.split(b"\r\n\r\n", 1)[1]
        if rest:
            client.sendall(rest)
    except OSError:
        close_all(client, *([up] if up else []))
        return
    pipe(client, up)


def alive(pid):
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


def main():
    a = sys.argv[1:]
    if len(a) != 3 or not a[0] or not a[1].isdigit() or not a[2].isdigit():
        sys.stderr.write("usage: proxy-tunnel.py HOST PORT WATCH_PID\n")
        return 2
    host, port, watch = a[0], int(a[1]), int(a[2])
    proxy = proxy_for(host)
    if proxy is None:
        return 3
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.bind(("127.0.0.1", 0))
    srv.listen(16)
    sys.stdout.write("%d\n" % srv.getsockname()[1])
    sys.stdout.flush()
    # Detach so the caller's $(...) returns at once; the child serves until WATCH_PID is gone.
    if os.fork() > 0:
        os._exit(0)
    os.setsid()
    devnull = os.open(os.devnull, os.O_RDWR)
    for fd in (0, 1, 2):
        os.dup2(devnull, fd)
    srv.settimeout(WATCH_EVERY)
    while alive(watch):
        try:
            c, _ = srv.accept()
        except socket.timeout:
            continue
        except OSError:
            break
        threading.Thread(target=handle, args=(c, proxy, host, port), daemon=True).start()
    srv.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
