"""
Vercel serverless: POST /api/upload-document — upload file to Gemini File Search.
Uses Google GenAI Python SDK (same logic as upload_service.py).
Note: Vercel has a ~4.5 MB request body limit; larger files may need direct upload elsewhere.
"""
import cgi
import io
import json
import os
import re
import tempfile
import time
import urllib.request
from http.server import BaseHTTPRequestHandler
from pathlib import Path

# Optional: configure proxy/SSL before importing genai
from google import genai
from google.genai import types

ALLOWED_EXTENSIONS = {".pdf", ".md"}


def allowed_file(filename):
    ext = Path(filename).suffix.lower()
    return ext in ALLOWED_EXTENSIONS


def sanitize_display_name(name: str) -> str:
    if not name or not name.strip():
        return "file"
    name = re.sub(r"[/\\\0]", "", name).strip()
    name = re.sub(r'[<>:"|?*]', "", name).strip()
    return name or "file"


def get_client(api_key: str, proxy_url: str = None, ssl_cert: str = None):
    kwargs = {"api_key": api_key}
    if proxy_url or ssl_cert:
        client_args = {}
        if proxy_url:
            client_args["proxy"] = proxy_url
        if ssl_cert:
            client_args["verify"] = ssl_cert
        kwargs["http_options"] = types.HttpOptions(
            client_args=client_args,
            async_client_args=client_args,
        )
    elif os.environ.get("HTTPS_PROXY"):
        kwargs["http_options"] = types.HttpOptions(
            client_args={"proxy": os.environ["HTTPS_PROXY"]},
            async_client_args={"proxy": os.environ["HTTPS_PROXY"]},
        )
    return genai.Client(**kwargs)


def _extract_document_from_operation(operation, store_name: str) -> dict | None:
    try:
        resp = getattr(operation, "response", None)
        if resp is None and callable(getattr(operation, "result", None)):
            resp = operation.result()
        if resp is None:
            return None
        doc = None
        if hasattr(resp, "document"):
            doc = resp.document
        elif hasattr(resp, "documents") and resp.documents:
            doc = resp.documents[0]
        elif isinstance(resp, dict):
            doc = resp.get("document") or (resp.get("documents") or [None])[0] or resp
        else:
            doc = resp
        if doc is None:
            return None
        name = None
        display = ""
        if hasattr(doc, "name"):
            name = doc.name
            display = getattr(doc, "display_name", None) or getattr(doc, "displayName", "") or ""
        elif isinstance(doc, dict):
            name = doc.get("name") or doc.get("documentName")
            display = doc.get("display_name") or doc.get("displayName") or ""
        if not name:
            return None
        return {
            "name": name,
            "displayName": display or (name.split("/")[-1] if name else ""),
            "display_name": display or (name.split("/")[-1] if name else ""),
        }
    except Exception:
        return None


def _fetch_newest_document_from_store(
    store_name: str, api_key: str, display_name_hint: str = ""
) -> dict | None:
    try:
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/{store_name}/documents"
            f"?key={api_key}&pageSize=20"
        )
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode())
        docs = data.get("documents", [])
        if not docs:
            return None
        for doc in docs:
            if display_name_hint and (
                doc.get("displayName", "") == display_name_hint
                or doc.get("display_name", "") == display_name_hint
            ):
                return {
                    "name": doc.get("name"),
                    "displayName": doc.get("displayName") or doc.get("display_name", ""),
                    "display_name": doc.get("display_name") or doc.get("displayName", ""),
                }
        docs_sorted = sorted(docs, key=lambda d: d.get("createTime", "") or "", reverse=True)
        doc = docs_sorted[0]
        return {
            "name": doc.get("name"),
            "displayName": doc.get("displayName") or doc.get("display_name", ""),
            "display_name": doc.get("display_name") or doc.get("displayName", ""),
        }
    except Exception:
        return None


def _send_json(handler, status: int, data: dict):
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.end_headers()
    handler.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        # Vercel may pass path as /api/upload-document
        if "/api/upload-document" not in (self.path or ""):
            _send_json(self, 404, {"error": "Not found"})
            return

        content_length = int(self.headers.get("Content-Length", 0))
        content_type = self.headers.get("Content-Type", "")

        if content_length <= 0 or "multipart/form-data" not in content_type:
            _send_json(self, 400, {"error": "No file provided or invalid Content-Type"})
            return

        body = self.rfile.read(content_length)
        env = {
            "REQUEST_METHOD": "POST",
            "CONTENT_TYPE": content_type,
            "CONTENT_LENGTH": str(content_length),
        }
        form = cgi.FieldStorage(fp=io.BytesIO(body), environ=env)

        if "file" not in form:
            _send_json(self, 400, {"error": "No file provided"})
            return

        store_name = form.getvalue("storeName")
        api_key = form.getvalue("apiKey")
        display_name = form.getvalue("displayName")
        if not store_name or not api_key:
            _send_json(
                self,
                400,
                {"error": "Missing required parameters: storeName and apiKey are required"},
            )
            return

        file_field = form["file"]
        if not getattr(file_field, "filename", None) or not file_field.filename.strip():
            _send_json(self, 400, {"error": "No file selected"})
            return

        if not allowed_file(file_field.filename):
            _send_json(
                self,
                400,
                {"error": f"File type not allowed. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"},
            )
            return

        file_display_name = sanitize_display_name(display_name or file_field.filename)
        if not store_name.startswith("fileSearchStores/"):
            store_name = f"fileSearchStores/{store_name}"

        temp_path = None
        try:
            suffix = Path(file_field.filename).suffix
            if hasattr(file_field, "file") and file_field.file is not None:
                file_content = file_field.file.read()
            else:
                v = getattr(file_field, "value", None)
                file_content = v if isinstance(v, bytes) else (v or "").encode("utf-8")
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                tmp.write(file_content)
                temp_path = tmp.name

            proxy_url = form.getvalue("proxyUrl") or os.environ.get("HTTPS_PROXY")
            ssl_cert = os.environ.get("SSL_CERT_FILE")
            client = get_client(api_key, proxy_url=proxy_url or None, ssl_cert=ssl_cert or None)

            operation = client.file_search_stores.upload_to_file_search_store(
                file=temp_path,
                file_search_store_name=store_name,
                config={"display_name": file_display_name},
            )

            max_wait = 300
            start = time.time()
            while not operation.done:
                if time.time() - start > max_wait:
                    _send_json(self, 504, {"error": "Indexing timeout - processing took too long"})
                    return
                time.sleep(5)
                operation = client.operations.get(operation)

            document = _extract_document_from_operation(operation, store_name)
            if not document:
                document = _fetch_newest_document_from_store(
                    store_name, api_key, file_display_name
                )
            if not document:
                _send_json(
                    self,
                    500,
                    {"error": "Upload completed but could not extract document info"},
                )
                return

            _send_json(self, 200, document)

        except Exception as e:
            err_msg = str(e)
            if hasattr(e, "message"):
                err_msg = getattr(e, "message", err_msg)
            if hasattr(e, "details"):
                err_msg = getattr(getattr(e, "details"), "message", err_msg) or err_msg
            _send_json(self, 500, {"error": err_msg})

        finally:
            if temp_path and os.path.exists(temp_path):
                try:
                    os.unlink(temp_path)
                except OSError:
                    pass
