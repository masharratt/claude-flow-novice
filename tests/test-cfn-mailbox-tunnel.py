#!/usr/bin/env python3
"""Tests for .claude/skills/cfn-mailbox/proxy-tunnel.py (redis-cli through the sandbox proxy).

Bug (2026-11-09, session claude-flow-novice-src-7a): inside the Claude Code sandbox every
`mailbox.sh` call failed with "cannot reach <host>:6379 over TLS". The sandbox lets traffic out
only through its HTTP proxy, and redis-cli ignores proxy settings, so allowing the mail host in
sandbox.network.allowedDomains changed nothing. proxy-tunnel.py relays a local port through the
proxy with HTTP CONNECT so redis-cli can reach the server.

Offline: a fake CONNECT proxy on 127.0.0.1 stands in for the sandbox proxy.
Run: python3 tests/test-cfn-mailbox-tunnel.py
"""
import os, socket, subprocess, sys, threading, time, unittest

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TUNNEL = os.path.join(REPO, ".claude", "skills", "cfn-mailbox", "proxy-tunnel.py")
PROXY_VARS = ("HTTPS_PROXY", "https_proxy", "ALL_PROXY", "all_proxy", "HTTP_PROXY", "http_proxy",
              "NO_PROXY", "no_proxy")


class FakeProxy:
    """Accepts one CONNECT per client, records it, answers `status`, then echoes '+PONG' per line."""

    def __init__(self, status=b"200 Connection established"):
        self.status = status
        self.requests = []
        self.srv = socket.socket()
        self.srv.bind(("127.0.0.1", 0))
        self.srv.listen(8)
        self.port = self.srv.getsockname()[1]
        threading.Thread(target=self._serve, daemon=True).start()

    def _serve(self):
        while True:
            try:
                c, _ = self.srv.accept()
            except OSError:
                return
            threading.Thread(target=self._client, args=(c,), daemon=True).start()

    def _client(self, c):
        head = b""
        while b"\r\n\r\n" not in head:
            d = c.recv(4096)
            if not d:
                c.close(); return
            head += d
        self.requests.append(head.split(b"\r\n\r\n", 1)[0].decode())
        c.sendall(b"HTTP/1.1 " + self.status + b"\r\n\r\n")
        if not self.status.startswith(b"200"):
            c.close(); return
        while True:
            d = c.recv(4096)
            if not d:
                break
            c.sendall(b"+PONG\r\n")
        c.close()

    def close(self):
        self.srv.close()


def tunnel_env(**extra):
    env = {k: v for k, v in os.environ.items() if k not in PROXY_VARS}
    env.update(extra)
    return env


def start(env, watch_pid=None, host="mbx.example.test", port="6379"):
    return subprocess.run([sys.executable, "-I", TUNNEL, host, port, str(watch_pid or os.getpid())],
                          env=env, capture_output=True, text=True, timeout=10)


class TunnelTest(unittest.TestCase):
    def setUp(self):
        self.proxy = FakeProxy()

    def tearDown(self):
        self.proxy.close()

    def test_relays_through_connect_with_auth(self):
        env = tunnel_env(HTTPS_PROXY="http://srt.user:p%%40ss@127.0.0.1:%d" % self.proxy.port)
        r = start(env)
        self.assertEqual(r.returncode, 0, r.stderr)
        port = int(r.stdout.strip())
        s = socket.create_connection(("127.0.0.1", port), timeout=5)
        s.sendall(b"PING\r\n")
        self.assertEqual(s.recv(100), b"+PONG\r\n")
        s.close()
        req = self.proxy.requests[0]
        self.assertTrue(req.startswith("CONNECT mbx.example.test:6379 HTTP/1.1"), req)
        # base64("srt.user:p@ss"): the URL-encoded password is decoded before encoding.
        self.assertIn("Proxy-Authorization: Basic c3J0LnVzZXI6cEBzcw==", req)

    def test_serves_many_connections(self):
        r = start(tunnel_env(ALL_PROXY="http://127.0.0.1:%d" % self.proxy.port))
        port = int(r.stdout.strip())
        for _ in range(3):
            s = socket.create_connection(("127.0.0.1", port), timeout=5)
            s.sendall(b"PING\r\n")
            self.assertEqual(s.recv(100), b"+PONG\r\n")
            s.close()
        self.assertEqual(len(self.proxy.requests), 3)
        self.assertNotIn("Proxy-Authorization", self.proxy.requests[0])

    def test_no_proxy_set_means_direct(self):
        r = start(tunnel_env())
        self.assertEqual(r.returncode, 3, r.stderr)
        self.assertEqual(r.stdout, "")

    def test_no_proxy_list_bypasses_host(self):
        r = start(tunnel_env(HTTPS_PROXY="http://127.0.0.1:%d" % self.proxy.port,
                             NO_PROXY="localhost,.example.test"))
        self.assertEqual(r.returncode, 3, r.stderr)
        self.assertEqual(r.stdout, "")

    def test_refused_connect_closes_client(self):
        self.proxy.status = b"403 Forbidden"
        r = start(tunnel_env(HTTPS_PROXY="http://127.0.0.1:%d" % self.proxy.port))
        port = int(r.stdout.strip())
        s = socket.create_connection(("127.0.0.1", port), timeout=5)
        s.sendall(b"PING\r\n")
        try:
            got = s.recv(100)
        except ConnectionResetError:
            got = b""   # closed with unread data: the OS reports a reset instead of EOF
        self.assertEqual(got, b"", "client must be closed, never handed proxy bytes")
        s.close()

    def test_bad_arguments(self):
        r = subprocess.run([sys.executable, "-I", TUNNEL, "host", "notaport", "1"],
                           env=tunnel_env(HTTPS_PROXY="http://127.0.0.1:1"), capture_output=True, text=True)
        self.assertEqual(r.returncode, 2)

    def test_exits_when_watched_process_ends(self):
        watched = subprocess.Popen(["sleep", "30"])
        r = start(tunnel_env(HTTPS_PROXY="http://127.0.0.1:%d" % self.proxy.port), watch_pid=watched.pid)
        port = int(r.stdout.strip())
        socket.create_connection(("127.0.0.1", port), timeout=5).close()
        watched.kill(); watched.wait()
        deadline = time.time() + 5
        gone = False
        while time.time() < deadline:
            try:
                socket.create_connection(("127.0.0.1", port), timeout=1).close()
                time.sleep(0.2)
            except OSError:
                gone = True
                break
        self.assertTrue(gone, "tunnel still listening after its watched process ended")


if __name__ == "__main__":
    unittest.main(verbosity=1)
