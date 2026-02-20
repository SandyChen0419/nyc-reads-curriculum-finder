from .shared import json_response, build_search

def handler(request):
    if request.method == "OPTIONS":
        return json_response({}, status=200)

    return json_response(build_search(request.args), status=200）
