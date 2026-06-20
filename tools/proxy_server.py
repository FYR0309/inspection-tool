"""
本地修图中转服务
手机连同一 WiFi 时，电脑运行此脚本，手机通过电脑中转访问 ModelScope 修图 API

启动：python proxy_server.py
然后手机访问网页时，修图就会走电脑中转
"""

import http.server
import json
import urllib.request
import urllib.error
import sys
import os

MODELSCOPE_BASE = "https://api-inference.modelscope.cn/v1"
API_KEY = os.environ.get("MODELSCOPE_API_KEY", "ms-6cd149c2-d1bf-48b4-9d50-23cb26cc94a4")
PORT = 8765


class ProxyHandler(http.server.BaseHTTPRequestHandler):
    def _cors(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.end_headers()

    def do_OPTIONS(self):
        self._cors()

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length) if length else b""

        target_url = f"{MODELSCOPE_BASE}{self.path}"
        req = urllib.request.Request(
            target_url, data=body, method="POST",
            headers={
                "Authorization": f"Bearer {API_KEY}",
                "Content-Type": "application/json",
                "X-ModelScope-Async-Mode": "true",
            }
        )

        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = resp.read()
                self._respond(resp.status, data, resp.headers.get("Content-Type", "application/json"))
        except urllib.error.HTTPError as e:
            self._respond(e.code, e.read(), "application/json")
        except Exception as e:
            self._respond(502, json.dumps({"error": str(e)}).encode(), "application/json")

    def do_GET(self):
        # 健康检查
        if self.path == '/health':
            self._respond(200, b'OK', 'text/plain')
            return
        target_url = f"{MODELSCOPE_BASE}{self.path}"
        req = urllib.request.Request(
            target_url, method="GET",
            headers={
                "Authorization": f"Bearer {API_KEY}",
                "X-ModelScope-Task-Type": "image_generation",
            }
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = resp.read()
                self._respond(resp.status, data, resp.headers.get("Content-Type", "application/json"))
        except urllib.error.HTTPError as e:
            self._respond(e.code, e.read(), "application/json")
        except Exception as e:
            self._respond(502, json.dumps({"error": str(e)}).encode(), "application/json")

    def _respond(self, code, data, content_type="application/json"):
        self.send_response(code)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Type", content_type)
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    import socket

    # 解决 Windows 中文编码问题
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

    hostname = socket.gethostname()
    local_ip = socket.gethostbyname(hostname)

    print("=" * 50)
    print("  修图 API 本地中转服务")
    print(f"  手机代理地址: http://{local_ip}:{PORT}")
    print(f"  电脑本机地址: http://127.0.0.1:{PORT}")
    print("  按 Ctrl+C 停止")
    print("=" * 50)

    server = http.server.HTTPServer(("0.0.0.0", PORT), ProxyHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止")
        server.shutdown()
