from ._shared import json_response, build_meta

def handler(request):
    # CORS and OPTIONS preflight
    if request.method == 'OPTIONS':
        return json_response({'ok': True}, 204)
    # Debug fast path
    try:
        dbg = str(request.args.get('debug', '')).lower() in ('1', 'true', 'yes')
    except Exception:
        dbg = False
    if dbg:
        return json_response({'ok': True, 'route': 'meta'})
    data = build_meta()
    return json_response(data, 200)

