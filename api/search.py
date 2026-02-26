import json
import traceback

def handler(request):
    try:
        from api._shared import json_response, build_search, build_grades_lookup_norm, _norm_school_name
        params = {
            'date': (request.args.get('date') or '').strip(),
            'district': (request.args.get('district') or '').strip(),
            'school': (request.args.get('school') or '').strip(),
            'grade': (request.args.get('grade') or '').strip(),
        }
        # Strict validation: if school+grade set and grade not allowed, short-circuit empty results
        school_name = params['school']
        grade_sel = params['grade']
        if school_name and grade_sel:
            lookup = build_grades_lookup_norm()
            allowed = lookup.get(_norm_school_name(school_name), [])
            if allowed and grade_sel not in allowed:
                return json_response({'results': [], 'error': None, 'note': 'information_not_available'}, 200)
        data = build_search(params)
        return json_response(data, 200)
    except Exception as e:
        trace = traceback.format_exc()
        headers = {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        }
        if request.method == "OPTIONS":
            return (json.dumps({"ok": True}), 204, headers)
        return (json.dumps({"error": str(e), "trace": trace}), 200, headers)

from .shared import json_response, build_search

def handler(request):
    if request.method == "OPTIONS":
        return json_response({}, status=200)

    return json_response(build_search(request.args), status=200）
