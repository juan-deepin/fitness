#!/usr/bin/env python3
import json
import os
import re
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib import error, request


ROOT = Path(__file__).resolve().parent
ENV_PATH = ROOT / ".env"


def load_gemini_api_key() -> str:
    env_value = os.getenv("GEMINI_API_KEY", "").strip()
    if env_value:
        return env_value

    if not ENV_PATH.exists():
        return ""

    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        clean = line.strip()
        if not clean or clean.startswith("#"):
            continue

        if "=" in clean:
            key, value = clean.split("=", 1)
            if key.strip() == "GEMINI_API_KEY":
                return value.strip().strip('"').strip("'")
            continue

        return clean

    return ""


def extract_json_from_text(text: str):
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*", "", text).strip()
        text = re.sub(r"```$", "", text).strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    start = text.find("{")
    if start < 0:
        raise ValueError("La respuesta de Gemini no contiene JSON.")

    depth = 0
    for idx in range(start, len(text)):
        char = text[idx]
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                candidate = text[start : idx + 1]
                return json.loads(candidate)

    raise ValueError("No se pudo extraer un JSON valido de la respuesta.")


def call_gemini(payload: dict, api_key: str) -> dict:
    prompt = str(payload.get("prompt_interno") or "").strip()
    if not prompt:
        raise ValueError("No se recibio prompt_interno en el payload.")

    instruction = (
        "Responde solo JSON valido, sin markdown ni texto fuera del JSON. "
        "El JSON DEBE incluir exactamente estos campos: "
        "titulo (string), "
        "cliente (objeto con nombre, edad, peso, altura, sexo tal como aparecen en los datos del cliente), "
        "objetivo (string), "
        "calorias_estimadas (string con formato '2000 kcal/dia'), "
        "recomendaciones_generales (array de strings), "
        "semanas (array de exactamente 4 objetos con 'semana' y 'comidas'; "
        "IMPORTANTE: cada semana debe tener comidas DISTINTAS y PROGRESIVAS entre si, "
        "variando los alimentos, preparaciones y porciones semana a semana; "
        "cada comida tiene 'tipo' y 'descripcion'), "
        "sustituciones (array de 6 a 10 strings; deben ser PERSONALIZADAS segun "
        "alergias, restricciones, alimentos no deseados, objetivo y actividad; "
        "evita sustituciones genericas repetidas), "
        "notas_finales (array de strings). "
        "Adapta las calorias, porciones y recomendaciones al peso, altura, objetivo y actividad del cliente."
    )

    body = {
        "contents": [
            {
                "parts": [
                    {
                        "text": f"{instruction}\n\n{prompt}"
                    }
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.4,
            "maxOutputTokens": 3072
        }
    }

    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        "gemini-1.5-flash:generateContent"
        f"?key={api_key}"
    )

    req = request.Request(
        url,
        method="POST",
        headers={"Content-Type": "application/json"},
        data=json.dumps(body).encode("utf-8")
    )

    with request.urlopen(req, timeout=60) as response:
        raw = json.loads(response.read().decode("utf-8"))

    candidates = raw.get("candidates") or []
    if not candidates:
        raise ValueError("Gemini no devolvio candidates.")

    parts = (((candidates[0] or {}).get("content") or {}).get("parts") or [])
    text = "\n".join(str(p.get("text", "")) for p in parts if isinstance(p, dict)).strip()
    if not text:
        raise ValueError("Gemini no devolvio texto util.")

    extracted = extract_json_from_text(text)
    if not isinstance(extracted, dict):
        raise ValueError("La respuesta de Gemini no es un objeto JSON.")

    return extracted


class AppHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_POST(self):
        if self.path != "/api/generar-plan":
            self.send_error(404, "Ruta no encontrada")
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(length).decode("utf-8") if length > 0 else "{}"
            payload = json.loads(body)
            if not isinstance(payload, dict):
                raise ValueError("Body JSON invalido")

            api_key = load_gemini_api_key()
            if not api_key:
                raise ValueError("No se encontro GEMINI_API_KEY en .env o variables de entorno")

            result = call_gemini(payload, api_key)
            data = json.dumps(result, ensure_ascii=False).encode("utf-8")

            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            message = {"error": f"Gemini HTTP {exc.code}", "detail": detail[:800]}
            data = json.dumps(message, ensure_ascii=False).encode("utf-8")
            self.send_response(502)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except Exception as exc:
            message = {"error": str(exc)}
            data = json.dumps(message, ensure_ascii=False).encode("utf-8")
            self.send_response(500)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)


def main():
    os.chdir(ROOT)
    port = int(os.getenv("PORT", "8080"))
    server = ThreadingHTTPServer(("0.0.0.0", port), AppHandler)
    print(f"Servidor activo en http://0.0.0.0:{port}")
    print("Endpoint IA: POST /api/generar-plan")
    server.serve_forever()


if __name__ == "__main__":
    main()