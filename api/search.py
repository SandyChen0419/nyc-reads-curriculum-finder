from ._shared import json_response, build_search

def handler(request):
    if request.method == 'OPTIONS':
        return json_response({'ok': True}, 204)
    params = {
        'date': (request.args.get('date') or '').strip(),
        'district': (request.args.get('district') or '').strip(),
        'school': (request.args.get('school') or '').strip(),
        'grade': (request.args.get('grade') or '').strip(),
    }
    data = build_search(params)
    return json_response(data, 200)

