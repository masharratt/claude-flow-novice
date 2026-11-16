#!/usr/bin/env python3
"""zai-fence-broker.py: the only network path out of the Linux allow-list fence.

The fence runs the worker in its own network namespace (no host loopback, no
abstract sockets, no route out). Two halves give it exactly one destination:

  host  --sock PATH --allow HOST:PORT[,HOST:PORT] --watch PID
        Host side, outside the fence. Listens on a unix socket that the fence
        binds in. Accepts only `CONNECT host:port` for an allowed pair, dials
        it (DNS happens here), answers 200 and pipes bytes. Anything else gets
        403 and is closed. Exits when PID (the fence/bwrap process) is gone.

  seccomp --out FILE
        Write the socket-family seccomp filter (classic BPF) for this machine.

  relay --port N --sock PATH -- CMD [ARGS...]
        Inside the fence. Listens on 127.0.0.1:N (the fence's own loopback),
        forwards each connection to the unix socket, runs CMD with
        HTTPS_PROXY/https_proxy=http://127.0.0.1:N, and exits with CMD's status.

Standard library only. No logging of payloads.
"""
import os
import signal
import socket
import subprocess
import sys
import threading
import time

BUF = 65536


def pipe(a, b):
    try:
        while True:
            data = a.recv(BUF)
            if not data:
                break
            b.sendall(data)
    except OSError:
        pass
    finally:
        for s in (a, b):
            try:
                s.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass


def splice(a, b):
    t = threading.Thread(target=pipe, args=(b, a), daemon=True)
    t.start()
    pipe(a, b)
    t.join(5)
    a.close()
    b.close()


def read_head(conn):
    data = b""
    while b"\r\n\r\n" not in data:
        chunk = conn.recv(4096)
        if not chunk:
            return None, b""
        data += chunk
        if len(data) > 16384:
            return None, b""
    head, _, rest = data.partition(b"\r\n\r\n")
    return head.decode("latin-1"), rest


def host_client(conn, allow):
    try:
        conn.settimeout(30)
        head, rest = read_head(conn)
        if head is None:
            conn.close()
            return
        parts = head.split("\r\n", 1)[0].split()
        if len(parts) < 2 or parts[0].upper() != "CONNECT" or parts[1].lower() not in allow:
            conn.sendall(b"HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n")
            conn.close()
            return
        host, port = parts[1].rsplit(":", 1)
        up = socket.create_connection((host, int(port)), timeout=30)
        up.settimeout(None)
        conn.settimeout(None)
        conn.sendall(b"HTTP/1.1 200 Connection established\r\n\r\n")
        if rest:
            up.sendall(rest)
        splice(conn, up)
    except OSError:
        try:
            conn.sendall(b"HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n")
        except OSError:
            pass
        conn.close()


def run_host(sock_path, allow, watch):
    if os.path.exists(sock_path):
        os.unlink(sock_path)
    srv = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    old = os.umask(0o077)
    srv.bind(sock_path)
    os.umask(old)
    srv.listen(64)

    def watcher():
        while True:
            try:
                os.kill(watch, 0)
            except ProcessLookupError:
                for f in (lambda: os.unlink(sock_path), lambda: os.rmdir(os.path.dirname(sock_path))):
                    try:
                        f()
                    except OSError:
                        pass
                os._exit(0)
            except PermissionError:
                pass
            time.sleep(1)

    threading.Thread(target=watcher, daemon=True).start()
    while True:
        conn, _ = srv.accept()
        threading.Thread(target=host_client, args=(conn, allow), daemon=True).start()


def run_relay(port, sock_path, cmd):
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(("127.0.0.1", port))
    srv.listen(64)

    def serve():
        while True:
            try:
                conn, _ = srv.accept()
            except OSError:
                return
            try:
                up = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
                up.connect(sock_path)
            except OSError:
                conn.close()
                continue
            threading.Thread(target=splice, args=(conn, up), daemon=True).start()

    threading.Thread(target=serve, daemon=True).start()
    env = dict(os.environ)
    url = "http://127.0.0.1:%d" % port
    for k in ("HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"):
        env[k] = url
    env.pop("NO_PROXY", None)
    env.pop("no_proxy", None)
    child = subprocess.Popen(cmd, env=env, close_fds=True)

    def forward(sig, _frame):
        try:
            child.send_signal(sig)
        except OSError:
            pass

    for s in (signal.SIGTERM, signal.SIGHUP, signal.SIGINT, signal.SIGQUIT,
              signal.SIGWINCH, signal.SIGUSR1, signal.SIGUSR2):
        signal.signal(s, forward)
    while True:
        try:
            rc = child.wait()
            break
        except InterruptedError:
            continue
    sys.exit(rc if rc >= 0 else 128 - rc)


# --- seccomp ------------------------------------------------------------------
# Classic BPF for seccomp(2), built with struct only (no libseccomp needed).
# Allows everything except: socket() with a family other than AF_UNIX (1),
# AF_INET (2), AF_INET6 (10) -> EAFNOSUPPORT; io_uring_setup -> EPERM (it can
# create sockets without socket()); x32 and foreign-arch syscalls -> EPERM.
ARCHES = {
    # machine: (AUDIT_ARCH, socket nr, io_uring_setup nr, x32 bit check)
    "x86_64": (0xC000003E, 41, 425, True),
    "aarch64": (0xC00000B7, 198, 425, False),
}


def seccomp_program():
    import platform
    import struct
    mach = platform.machine()
    if mach not in ARCHES:
        raise SystemExit("zai-fence-broker: no seccomp filter for machine %r" % mach)
    arch, sock_nr, uring_nr, x32 = ARCHES[mach]
    LD, JEQ, JGE, RET = 0x20, 0x15, 0x35, 0x06
    ALLOW, ERRNO = 0x7FFF0000, 0x00050000
    prog = []  # (code, jt, jf, k) with symbolic targets resolved below
    prog.append((LD, 0, 0, 4))                      # arch
    prog.append((JEQ, 1, 0, arch))                  # match -> skip next
    prog.append((RET, 0, 0, ERRNO | 1))             # foreign arch: EPERM
    prog.append((LD, 0, 0, 0))                      # nr
    if x32:
        prog.append((JGE, "EPERM", 0, 0x40000000))  # x32 ABI
    prog.append((JEQ, "EPERM", 0, uring_nr))
    prog.append((JEQ, 0, "ALLOW", sock_nr))
    prog.append((LD, 0, 0, 16))                     # args[0] low word = family
    prog.append((JEQ, "ALLOW", 0, 1))
    prog.append((JEQ, "ALLOW", 0, 2))
    prog.append((JEQ, "ALLOW", 0, 10))
    prog.append((RET, 0, 0, ERRNO | 97))            # EAFNOSUPPORT
    labels = {"ALLOW": len(prog), "EPERM": len(prog) + 1}
    prog.append((RET, 0, 0, ALLOW))
    prog.append((RET, 0, 0, ERRNO | 1))
    out = b""
    for i, (code, jt, jf, k) in enumerate(prog):
        jt = labels[jt] - i - 1 if isinstance(jt, str) else jt
        jf = labels[jf] - i - 1 if isinstance(jf, str) else jf
        out += struct.pack("=HBBI", code, jt, jf, k)
    return out


def run_seccomp(path):
    data = seccomp_program()
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "wb") as f:
        f.write(data)


def main(argv):
    if len(argv) < 2:
        sys.exit("usage: zai-fence-broker.py host|relay ...")
    mode, args = argv[1], argv[2:]
    opts, rest = {}, []
    i = 0
    while i < len(args):
        a = args[i]
        if a == "--":
            rest = args[i + 1:]
            break
        if a.startswith("--") and i + 1 < len(args):
            opts[a[2:]] = args[i + 1]
            i += 2
            continue
        sys.exit("zai-fence-broker: bad argument %r" % a)
    if mode == "host":
        allow = {x.strip().lower() for x in opts["allow"].split(",") if x.strip()}
        run_host(opts["sock"], allow, int(opts["watch"]))
    elif mode == "relay":
        if not rest:
            sys.exit("zai-fence-broker: relay needs -- CMD")
        run_relay(int(opts["port"]), opts["sock"], rest)
    elif mode == "seccomp":
        run_seccomp(opts["out"])
    else:
        sys.exit("zai-fence-broker: unknown mode %r" % mode)


if __name__ == "__main__":
    main(sys.argv)
