from .shared import json_response, build_modules

def handler(request):
    if request.method == "OPTIONS":
        return json_response({}, status=200)

    return json_response(build_modules(request.args), status=200)
