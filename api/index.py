import json
from flask import Flask, request, make_response, jsonify

from ._shared import build_meta, build_modules, build_search

# Vercel: export a Flask WSGI app at module scope
app = Flask(__name__)


def json_utf8(data: dict, status: int = 200):
    resp = make_response(jsonify(data), status)
    resp.headers['Content-Type'] = 'application/json; charset=utf-8'
    resp.headers['Access-Control-Allow-Origin'] = '*'
    resp.headers['Access-Control-Allow-Methods'] = 'GET,OPTIONS'
    resp.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
    resp.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    return resp


@app.route('/health', methods=['GET', 'OPTIONS'])
@app.route('/api/health', methods=['GET', 'OPTIONS'])
def api_health():
    if request.method == 'OPTIONS':
        return json_utf8({'ok': True}, 204)
    return json_utf8({'ok': True})


@app.route('/meta', methods=['GET', 'OPTIONS'])
@app.route('/api/meta', methods=['GET', 'OPTIONS'])
def api_meta():
    if request.method == 'OPTIONS':
        return json_utf8({'ok': True}, 204)
    try:
        if str(request.args.get('debug', '')).lower() in ('1', 'true', 'yes'):
            return json_utf8({'ok': True, 'route': 'meta'})
    except Exception:
        pass
    data = build_meta()
    return json_utf8(data)


@app.route('/modules', methods=['GET', 'OPTIONS'])
@app.route('/api/modules', methods=['GET', 'OPTIONS'])
def api_modules():
    if request.method == 'OPTIONS':
        return json_utf8({'ok': True}, 204)
    curriculum = (request.args.get('curriculum') or '').strip()
    grade = (request.args.get('grade') or '').strip()
    data = build_modules(curriculum, grade)
    return json_utf8(data)


@app.route('/search', methods=['GET', 'OPTIONS'])
@app.route('/api/search', methods=['GET', 'OPTIONS'])
def api_search():
    if request.method == 'OPTIONS':
        return json_utf8({'ok': True}, 204)
    params = {
        'date': (request.args.get('date') or '').strip(),
        'district': (request.args.get('district') or '').strip(),
        'school': (request.args.get('school') or '').strip(),
        'grade': (request.args.get('grade') or '').strip(),
    }
    data = build_search(params)
    return json_utf8(data)
