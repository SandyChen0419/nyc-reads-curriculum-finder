from ._shared import json_response, build_modules

def handler(request):
    if request.method == 'OPTIONS':
        return json_response({'ok': True}, 204)
    curriculum = (request.args.get('curriculum') or '').strip()
    grade = (request.args.get('grade') or '').strip()
    data = build_modules(curriculum, grade)
    return json_response(data, 200)

