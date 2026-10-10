from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit
import os

ROOT = Path(__file__).resolve().parent
os.chdir(ROOT)

class Handler(SimpleHTTPRequestHandler):
    def allowed(self):
        path = urlsplit(self.path).path
        candidate = Path(self.translate_path(path)).resolve()
        named = path in ('/', '/index.html', '/style.css', '/app.js', '/data.js', '/materials.js', '/looks.js', '/looks.css', '/gallery.html', '/favicon.svg', '/discoveries.js', '/discovery.css', '/dust.js', '/intro.js', '/eggs.js', '/eggs.css')
        vendor = candidate.is_relative_to(ROOT / 'vendor') and candidate.is_file()
        return named or vendor
    def do_GET(self):
        if not self.allowed():
            self.send_error(404)
            return
        path = urlsplit(self.path).path
        if path == '/':
            self.path = '/index.html'
        super().do_GET()
    def do_HEAD(self):
        if not self.allowed():
            self.send_error(404)
            return
        super().do_HEAD()
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', '43178'))
    print(f'Alkaid 3D: http://127.0.0.1:{port}', flush=True)
    ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()
