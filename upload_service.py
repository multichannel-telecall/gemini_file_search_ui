"""
File Search Store Upload Service
Uses Google GenAI Python SDK for upload + import in one operation.
Handles proxy configuration (HTTPS_PROXY, SSL_CERT_FILE) and polling until indexing completes.
"""

import os
import tempfile
import time
import urllib.request
import urllib.error
import json
from pathlib import Path

import re

from flask import Flask, request, jsonify

# Optional: Configure proxy/SSL before importing genai
# os.environ['HTTPS_PROXY'] = 'http://username:password@proxy:port'
# os.environ['SSL_CERT_FILE'] = '/path/to/cert.pem'

from google import genai
from google.genai import types

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100MB

# Allowed file extensions for File Search
ALLOWED_EXTENSIONS = {'.pdf', '.md'}


def allowed_file(filename):
    ext = Path(filename).suffix.lower()
    return ext in ALLOWED_EXTENSIONS


def sanitize_display_name(name: str) -> str:
    """Sanitize display name while preserving Hebrew/Unicode."""
    if not name or not name.strip():
        return 'file'
    # Remove path separators and null bytes
    name = re.sub(r'[/\\\0]', '', name).strip()
    # Remove dangerous chars: < > : " | ? *
    name = re.sub(r'[<>:"|?*]', '', name).strip()
    return name or 'file'


def get_client(api_key: str, proxy_url: str = None, ssl_cert: str = None):
    """Create GenAI client with optional proxy and SSL cert configuration."""
    kwargs = {'api_key': api_key}

    if proxy_url or ssl_cert:
        client_args = {}
        if proxy_url:
            client_args['proxy'] = proxy_url
        if ssl_cert:
            client_args['verify'] = ssl_cert
        kwargs['http_options'] = types.HttpOptions(
            client_args=client_args,
            async_client_args=client_args,
        )
    elif os.environ.get('HTTPS_PROXY'):
        kwargs['http_options'] = types.HttpOptions(
            client_args={'proxy': os.environ['HTTPS_PROXY']},
            async_client_args={'proxy': os.environ['HTTPS_PROXY']},
        )

    return genai.Client(**kwargs)


@app.route('/api/upload-document', methods=['POST'])
def upload_document():
    """Upload file to File Search Store using SDK (upload + index in one operation)."""
    print('📤 Upload request received (Python)')

    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    store_name = request.form.get('storeName')
    api_key = request.form.get('apiKey')
    display_name = request.form.get('displayName')

    if not store_name or not api_key:
        return jsonify({
            'error': 'Missing required parameters: storeName and apiKey are required'
        }), 400

    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    if not allowed_file(file.filename):
        return jsonify({
            'error': f'File type not allowed. Allowed: {", ".join(ALLOWED_EXTENSIONS)}'
        }), 400

    file_display_name = sanitize_display_name(display_name or file.filename)

    # Ensure store_name has correct format
    if not store_name.startswith('fileSearchStores/'):
        store_name = f'fileSearchStores/{store_name}'

    print(f'  - Store: {store_name}')
    print(f'  - Display name: {file_display_name}')
    print(f'  - File size: {request.content_length} bytes')

    temp_path = None
    try:
        # Save uploaded file to temp (SDK expects file path)
        suffix = Path(file.filename).suffix
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            file.save(tmp.name)
            temp_path = tmp.name

        # Optional proxy from request or env
        proxy_url = request.form.get('proxyUrl') or os.environ.get('HTTPS_PROXY')
        ssl_cert = os.environ.get('SSL_CERT_FILE')

        client = get_client(api_key, proxy_url=proxy_url or None, ssl_cert=ssl_cert or None)

        # Upload and import in one operation (creates embeddings/indexes)
        operation = client.file_search_stores.upload_to_file_search_store(
            file=temp_path,
            file_search_store_name=store_name,
            config={'display_name': file_display_name},
        )

        print('  - Upload started, waiting for indexing...')

        # Poll until processing completes
        max_wait = 300  # 5 minutes
        start = time.time()
        while not operation.done:
            if time.time() - start > max_wait:
                return jsonify({'error': 'Indexing timeout - processing took too long'}), 504
            time.sleep(5)
            operation = client.operations.get(operation)
            print('  - Indexing...')

        # Extract document from operation result
        document = _extract_document_from_operation(operation, store_name)
        if not document:
            # Fallback: list documents and return the most recent one (upload just completed)
            document = _fetch_newest_document_from_store(store_name, api_key, file_display_name)
        if not document:
            return jsonify({
                'error': 'Upload completed but could not extract document info'
            }), 500

        print(f'  - ✅ File added to store: {store_name}')
        return jsonify(document)

    except Exception as e:
        print(f'❌ Upload error: {e}')
        err_msg = str(e)
        if hasattr(e, 'message'):
            err_msg = e.message
        if hasattr(e, 'details'):
            err_msg = getattr(e.details, 'message', err_msg) or err_msg
        return jsonify({'error': err_msg}), 500

    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.unlink(temp_path)
            except OSError:
                pass


def _fetch_newest_document_from_store(
    store_name: str, api_key: str, display_name_hint: str = ''
) -> dict | None:
    """Fallback: list documents in store and return the most recent one."""
    try:
        url = (
            f'https://generativelanguage.googleapis.com/v1beta/{store_name}/documents'
            f'?key={api_key}&pageSize=20'
        )
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode())
        docs = data.get('documents', [])
        if not docs:
            return None
        # Prefer doc matching display_name
        for doc in docs:
            if display_name_hint and (
                doc.get('displayName', '') == display_name_hint
                or doc.get('display_name', '') == display_name_hint
            ):
                return {
                    'name': doc.get('name'),
                    'displayName': doc.get('displayName') or doc.get('display_name', ''),
                    'display_name': doc.get('display_name') or doc.get('displayName', ''),
                }
        # Else take most recent by createTime
        def sort_key(d):
            return d.get('createTime', '') or ''
        docs_sorted = sorted(docs, key=sort_key, reverse=True)
        doc = docs_sorted[0]
        return {
            'name': doc.get('name'),
            'displayName': doc.get('displayName') or doc.get('display_name', ''),
            'display_name': doc.get('display_name') or doc.get('displayName', ''),
        }
    except Exception as e:
        print(f'  - Fallback list documents failed: {e}')
        return None


def _extract_document_from_operation(operation, store_name: str) -> dict | None:
    """Extract document object from completed operation for frontend compatibility."""
    try:
        resp = getattr(operation, 'response', None)
        if resp is None and callable(getattr(operation, 'result', None)):
            resp = operation.result()

        if resp is None:
            return None

        # Handle various response shapes from upload_to_file_search_store
        doc = None
        if hasattr(resp, 'document'):
            doc = resp.document
        elif hasattr(resp, 'documents') and resp.documents:
            doc = resp.documents[0]
        elif isinstance(resp, dict):
            doc = resp.get('document') or resp.get('documents', [None])[0] or resp
        else:
            doc = resp

        if doc is None:
            return None

        # Normalize to dict with name, displayName (frontend expects document.name)
        name = None
        display = ''
        if hasattr(doc, 'name'):
            name = doc.name
            display = getattr(doc, 'display_name', None) or getattr(doc, 'displayName', '') or ''
        elif isinstance(doc, dict):
            name = doc.get('name') or doc.get('documentName')
            display = doc.get('display_name') or doc.get('displayName', '') or ''

        if not name:
            return None

        return {
            'name': name,
            'displayName': display or (name.split('/')[-1] if name else ''),
            'display_name': display or (name.split('/')[-1] if name else ''),
        }
    except Exception:
        return None


@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'message': 'Python upload service running'})


if __name__ == '__main__':
    port = int(os.environ.get('UPLOAD_SERVICE_PORT', 5000))
    print(f'🚀 Upload service (Python) on http://localhost:{port}')
    app.run(host='0.0.0.0', port=port)
