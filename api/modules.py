import json
import traceback

def handler(request):
    try:
        from api._shared import json_response, build_modules
        curriculum = (request.args.get('curriculum') or '').strip()
        grade = (request.args.get('grade') or '').strip()
        data = build_modules(curriculum, grade)
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

from .shared import json_response, build_modules

def handler(request):
    if request.method == "OPTIONS":
        return json_response({}, status=200)

    return json_response(build_modules(request.args), status=200)
