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
    def do_OPTIONS(self):
        self._cors()
        self.send_response(204)
        self.end_headers()

    def do_POST(self):
        self._cors()
        # 读取请求体
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
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = resp.read()
                self.send_response(resp.status)
                for k, v in resp.headers.items():
                    if k.lower() not in ("transfer-encoding", "connection"):
                        self.send_header(k, v)
                self.end_headers()
                self.wfile.write(data)
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            self.end_headers()
            self.wfile.write(e.read())
        except Exception as e:
            self.send_response(502)
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())

    def do_GET(self):
        self._cors()
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
                self.send_response(resp.status)
                for k, v in resp.headers.items():
                    if k.lower() not in ("transfer-encoding", "connection"):
                        self.send_header(k, v)
                self.end_headers()
                self.wfile.write(data)
        except Exception as e:
            self.send_response(502)
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")

    def log_message(self, format, *args):
        print(f"[修图中转] {args[0]}")


if __name__ == "__main__":
    # 获取本机 IP
    import socket
    hostname = socket.gethostname()
    local_ip = socket.gethostbyname(hostname)

    print(f"""
╔══════════════════════════════════════════╗
║       🎨 修图 API 本地中转服务          ║
║                                          ║
║  手机代理地址：http://{local_ip}:{PORT}    ║
║  电脑本机地址：http://127.0.0.1:{PORT}     ║
║                                          ║
║  按 Ctrl+C 停止                          ║
╚══════════════════════════════════════════╝
""")

    server = http.server.HTTPServer(("0.0.0.0", PORT), ProxyHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止")
        server.shutdown()
