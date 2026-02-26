import json
import traceback

def handler(request):
    # Wrap everything so meta always returns JSON (with error/trace if needed)
    try:
        # Import heavy dependencies only inside handler
        from api._shared import json_response, build_meta, build_meta_debug

        dbg = False
        try:
            dbg = str(request.args.get('debug') or '').lower() in ('1', 'true', 'yes')
        except Exception:
            dbg = False

        data = build_meta()
        if dbg:
            try:
                data['_debug_summary'] = build_meta_debug()
            except Exception as e:
                data['_debug_summary'] = {'error': str(e)}
        return json_response(data, 200)
    except Exception as e:
        trace = traceback.format_exc()
        body = {
            "error": str(e),
            "trace": trace
        }
        headers = {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        }
        if request.method == "OPTIONS":
            return (json.dumps({"ok": True}), 204, headers)
        return (json.dumps(body), 200, headers)

from .shared import json_response, build_meta  # adjust import if needed

def handler(request):
    if request.method == "OPTIONS":
        return json_response({}, status=200)

    # quick debug to prove routing works
    if request.args.get("debug") == "1":
        return json_response({"ok": True, "route": "meta"}, status=200)

    return json_response(build_meta(), status=200)
