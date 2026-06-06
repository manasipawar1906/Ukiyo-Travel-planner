import os
from pathlib import Path
from textwrap import dedent

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv

try:
    from groq import Groq
except ImportError:
    Groq = None

try:
    import google.generativeai as genai
except ImportError:
    genai = None

FRONTEND_DIR = Path(__file__).resolve().parents[1] / "frontend"
BACKEND_DIR = Path(__file__).resolve().parent

load_dotenv(BACKEND_DIR / ".env")

app = Flask(__name__, static_folder=str(FRONTEND_DIR), static_url_path="")
CORS(app)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL_NAME = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "groq").strip().lower()

if genai is not None and GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    gemini_model = genai.GenerativeModel(GEMINI_MODEL_NAME)
else:
    gemini_model = None

if Groq is not None and GROQ_API_KEY:
    groq_client = Groq(api_key=GROQ_API_KEY)
else:
    groq_client = None


@app.route("/")
def home():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/<path:path>")
def static_files(path):
    file_path = FRONTEND_DIR / path
    if file_path.exists() and file_path.is_file():
        return send_from_directory(app.static_folder, path)
    return jsonify({"error": "Not found"}), 404


@app.route("/generate", methods=["POST"])
def generate_itinerary():
    data = request.get_json(silent=True) or {}

    destination = str(data.get("destination", "")).strip()
    days = str(data.get("days", "")).strip()
    budget = str(data.get("budget", "")).strip()
    interests = str(data.get("interests", "")).strip()

    missing_fields = [
        name
        for name, value in {
            "destination": destination,
            "days": days,
            "budget": budget,
            "interests": interests,
        }.items()
        if not value
    ]
    if missing_fields:
        return (
            jsonify({"error": f"Missing required fields: {', '.join(missing_fields)}"}),
            400,
        )

    prompt = (
        f"Create a detailed {days}-day travel itinerary for {destination}.\n"
        f"Budget: {budget}\n"
        f"Interests: {interests}\n"
        "Include day-wise plans, recommended food, travel tips, and pacing that feels realistic."
    )

    try:
        itinerary = generate_with_provider(prompt)
        return jsonify({"itinerary": itinerary, "provider": LLM_PROVIDER})
    except Exception as exc:
        error_text = str(exc)
        if "429" in error_text or "quota" in error_text.lower():
            fallback_itinerary = build_fallback_itinerary(
                destination=destination,
                days=days,
                budget=budget,
                interests=interests,
            )
            return (
                jsonify(
                    {
                        "itinerary": fallback_itinerary,
                        "provider": "fallback",
                        "warning": (
                            "The configured LLM provider is currently unavailable or quota-limited, so this is a locally generated fallback itinerary. "
                            "Check your API key, plan, and rate limits, then try again later."
                        ),
                    }
                ),
                200,
            )
        return jsonify({"error": error_text}), 500


def generate_with_provider(prompt):
    if LLM_PROVIDER == "groq":
        return generate_with_groq(prompt)
    if LLM_PROVIDER == "gemini":
        return generate_with_gemini(prompt)
    raise ValueError("Unsupported LLM_PROVIDER. Use 'groq' or 'gemini'.")


def generate_with_groq(prompt):
    if groq_client is None:
        raise ValueError(
            "Groq is not configured. Install dependencies and set GROQ_API_KEY in backend/.env or your environment."
        )

    response = groq_client.chat.completions.create(
        model=GROQ_MODEL_NAME,
        messages=[
            {
                "role": "system",
                "content": "You create practical, day-by-day travel itineraries.",
            },
            {
                "role": "user",
                "content": prompt,
            },
        ],
    )
    itinerary = (response.choices[0].message.content or "").strip()
    if not itinerary:
        raise ValueError("The Groq model returned an empty itinerary.")
    return itinerary


def generate_with_gemini(prompt):
    if gemini_model is None:
        raise ValueError(
            "Gemini is not configured. Install dependencies and set GEMINI_API_KEY in backend/.env or your environment."
        )

    response = gemini_model.generate_content(prompt)
    itinerary = getattr(response, "text", "").strip()
    if not itinerary:
        raise ValueError("The Gemini model returned an empty itinerary.")
    return itinerary


def build_fallback_itinerary(destination, days, budget, interests):
    interests_list = [item.strip() for item in interests.split(",") if item.strip()]
    interest_summary = ", ".join(interests_list) if interests_list else "local highlights"

    try:
        total_days = max(int(days), 1)
    except ValueError:
        total_days = 1

    day_plans = []
    for day_number in range(1, total_days + 1):
        if day_number == 1:
            focus = f"arrival and a relaxed introduction to {destination}"
        elif day_number == total_days:
            focus = "souvenir shopping, a final meal, and a smooth departure plan"
        else:
            focus = f"exploring {interest_summary}"

        day_plans.append(
            dedent(
                f"""\
                Day {day_number}
                Morning: Start with {focus} and keep the pace aligned with a {budget} budget.
                Afternoon: Visit a popular neighborhood, try one signature activity related to {interest_summary}, and leave buffer time for rest.
                Evening: Have dinner at a well-reviewed local spot, take a short walk, and note transport options for the next day.
                Tip: Prioritize advance bookings for top attractions and keep one backup indoor option ready.
                """
            ).strip()
        )

    return "\n\n".join(
        [
            f"Fallback itinerary for {destination}",
            f"Trip length: {total_days} day(s)",
            f"Budget: {budget}",
            f"Interests: {interest_summary}",
            "",
            *day_plans,
        ]
    )


if __name__ == "__main__":
    app.run(debug=True)
