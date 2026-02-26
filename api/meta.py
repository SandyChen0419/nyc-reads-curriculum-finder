# api/meta.py
from api._shared import json_response, build_meta

def handler(request):
    if request.method == 'OPTIONS':
        return json_response({'ok': True}, 204)
    dbg = str(request.args.get('debug', '')).lower() in ('1','true','yes')
    if dbg:
        return json_response({'ok': True, 'route': 'meta'})
    return json_response(build_meta(), 200)
