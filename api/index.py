import json
from flask import Flask, request, make_response, jsonify

from api._shared import build_meta, build_modules, build_search, build_school_grades, build_meta_debug, build_grades_lookup_norm, _norm_school_name

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
        dbg = False
        try:
            dbg = str(request.args.get('debug', '')).lower() in ('1', 'true', 'yes')
        except Exception:
            dbg = False
        data = build_meta()
        if dbg:
            # Attach expanded debug without short-circuiting
            try:
                extra = build_meta_debug()
                data['_debug_summary'] = extra
            except Exception as e:
                data['_debug_summary'] = {'error': str(e)}
        data.setdefault('error', None)
        return json_utf8(data)
    except Exception as e:
        # Never return 500; preserve structure expected by frontend
        safe = {
            'districts': [],
            'schools': [],
            'grades': [],
            'curricula': [],
            'schoolsByDistrict': {},
            'gradesBySchool': {},
            'error': str(e),
        }
        return json_utf8(safe)


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
    try:
        params = {
            'date': (request.args.get('date') or '').strip(),
            'district': (request.args.get('district') or '').strip(),
            'school': (request.args.get('school') or '').strip(),
            'grade': (request.args.get('grade') or '').strip(),
        }
        # Strict grade validation based on School Directories mapping
        try:
            school_name = params['school']
            grade_sel = params['grade']
            if school_name and grade_sel:
                lookup = build_grades_lookup_norm()
                allowed = lookup.get(_norm_school_name(school_name), [])
                if allowed and grade_sel not in allowed:
                    return json_utf8({'results': [], 'error': None, 'note': 'information_not_available'})
        except Exception:
            # On any error, fall through to existing behavior
            pass
        data = build_search(params)
        data.setdefault('error', None)
        return json_utf8(data)
    except Exception as e:
        # Never return 500; preserve expected list shape
        return json_utf8({'results': [], 'error': str(e)})

@app.route('/school-grades', methods=['GET', 'OPTIONS'])
@app.route('/api/school-grades', methods=['GET', 'OPTIONS'])
def api_school_grades():
    if request.method == 'OPTIONS':
        return json_utf8({'ok': True}, 204)
    data = build_school_grades()
    return json_utf8(data)

@app.route('/meta_debug', methods=['GET', 'OPTIONS'])
@app.route('/api/meta_debug', methods=['GET', 'OPTIONS'])
def api_meta_debug():
    if request.method == 'OPTIONS':
        return json_utf8({'ok': True}, 204)
    return json_utf8(build_meta_debug())

@app.route('/api/index.py', methods=['GET', 'OPTIONS'])
@app.route('/api/index', methods=['GET', 'OPTIONS'])
def api_dispatch_rewrite():
    """
    Dispatcher for Vercel rewrite that forwards original path via ?__path=/api/xxx
    """
    if request.method == 'OPTIONS':
        return json_utf8({'ok': True}, 204)
    orig = (request.args.get('__path') or '').strip() or request.path
    # Normalize and strip query part if any leaked
    orig = orig.split('?', 1)[0]
    # Expect formats like /api/meta, /api/modules, /api/search
    tail = orig
    if tail.startswith('/'):
        tail = tail[1:]
    if tail.startswith('api/'):
        tail = tail[4:]
    tail = tail.strip('/')
    if tail == 'health':
        return json_utf8({'ok': True})
    if tail == 'meta':
        # support debug=1 passthrough
        try:
            if str(request.args.get('debug', '')).lower() in ('1', 'true', 'yes'):
                return json_utf8({'ok': True, 'route': 'meta'})
        except Exception:
            pass
        return json_utf8(build_meta())
    if tail == 'modules':
        curriculum = (request.args.get('curriculum') or '').strip()
        grade = (request.args.get('grade') or '').strip()
        return json_utf8(build_modules(curriculum, grade))
    if tail == 'search':
        params = {
            'date': (request.args.get('date') or '').strip(),
            'district': (request.args.get('district') or '').strip(),
            'school': (request.args.get('school') or '').strip(),
            'grade': (request.args.get('grade') or '').strip(),
        }
        return json_utf8(build_search(params))
    return json_utf8({'error': 'Not Found', 'path': orig}, 404)

