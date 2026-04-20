from __future__ import annotations

import os
import shutil
import time
import uuid
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from model1 import DeepfakeDetector
from model2 import LieDetector
from download_models import download_models

# ── Constants ─────────────────────────────────────────────────
DEEPFAKE_WEIGHT = 0.6
BEHAVIOR_WEIGHT = 0.4
DECEPTIVE_HIGH_THRESHOLD = 60
DECEPTIVE_LOW_THRESHOLD = 45

ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".avi", ".mov", ".mkv", ".webm"}
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
ALLOWED_AUDIO_EXTENSIONS = {".wav", ".mp3", ".ogg", ".flac", ".m4a"}
MAX_UPLOAD_BYTES = 200 * 1024 * 1024  # 200 MB

# ── App setup ─────────────────────────────────────────────────
download_models()

BASE_DIR = Path(__file__).parent
MODELS_DIR = BASE_DIR / "models"
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

app = FastAPI(title="DeepGuard API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

deepfake_model = DeepfakeDetector(str(MODELS_DIR / "best_model_v2.pth"))
lie_model = LieDetector()


# ── Helpers ───────────────────────────────────────────────────

def _save_upload(file: UploadFile, allowed_extensions: set[str]) -> Path:
    """Save an uploaded file to the upload directory after validating its extension.

    Args:
        file: The uploaded file object from FastAPI.
        allowed_extensions: A set of lowercase extensions (e.g. {".mp4", ".mov"}).

    Returns:
        The Path where the file was saved.

    Raises:
        HTTPException: If the file extension is not in ``allowed_extensions``.
    """
    ext = Path(file.filename or "").suffix.lower()
    if ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed: {allowed_extensions}",
        )
    filepath = UPLOAD_DIR / f"{uuid.uuid4()}{ext}"
    with filepath.open("wb") as out:
        shutil.copyfileobj(file.file, out)
    return filepath


def _cleanup(filepath: Path) -> None:
    """Remove a file from disk if it still exists."""
    if filepath.exists():
        filepath.unlink()


def _video_verdict(lie_result: dict, deepfake_conf: float) -> tuple[str, str, float]:
    """Derive status, verdict string, and trust score from lie-detection output.

    Args:
        lie_result: The dict returned by ``LieDetector.predict``.
        deepfake_conf: Confidence from the deepfake model (0-100).

    Returns:
        A tuple of (status, verdict, trust_score).
    """
    deceptive_prob = lie_result.get("deceptive_prob", 0)
    truthful_prob = lie_result.get("truthful_prob", 50)

    if lie_result["result"] == "DECEPTIVE" and deceptive_prob >= DECEPTIVE_HIGH_THRESHOLD:
        status = "SUSPICIOUS"
        verdict = "SUSPICIOUS — Real video but deceptive behavior detected"
    elif lie_result["result"] == "DECEPTIVE" and deceptive_prob >= DECEPTIVE_LOW_THRESHOLD:
        status = "SUSPICIOUS"
        verdict = "SUSPICIOUS — Mild deceptive behavioral patterns detected"
    else:
        status = "AUTHENTICATED"
        verdict = "AUTHENTICATED — Real video with truthful behavior"

    trust_score = round(
        DEEPFAKE_WEIGHT * deepfake_conf + BEHAVIOR_WEIGHT * truthful_prob, 2
    )
    return status, verdict, trust_score


# ── Routes ────────────────────────────────────────────────────

@app.get("/")
def root() -> dict:
    """Health-check endpoint."""
    return {"status": "DeepGuard API running"}


@app.post("/analyze/video")
async def analyze_video(file: UploadFile = File(...)) -> dict:
    """Analyze a video file for deepfake content and deceptive behavior.

    Returns a JSON payload with ``status``, ``trust_score``, ``deepfake``,
    ``behavior``, and ``final_verdict`` fields.
    """
    start_time = time.time()
    filepath = _save_upload(file, ALLOWED_VIDEO_EXTENSIONS)

    try:
        deepfake_result = deepfake_model.predict(str(filepath))

        if deepfake_result["result"] == "FAKE":
            _cleanup(filepath)
            return {
                "status": "REJECTED",
                "input_type": "video",
                "trust_score": 0,
                "processing_time": round(time.time() - start_time, 2),
                "deepfake": deepfake_result,
                "behavior": None,
                "final_verdict": "REJECTED — Video is a deepfake",
            }

        lie_result = lie_model.predict(str(filepath))
        _cleanup(filepath)

        deepfake_conf = deepfake_result.get("confidence", 0)
        status, verdict, trust_score = _video_verdict(lie_result, deepfake_conf)

        return {
            "status": status,
            "input_type": "video",
            "trust_score": trust_score,
            "processing_time": round(time.time() - start_time, 2),
            "deepfake": deepfake_result,
            "behavior": lie_result,
            "final_verdict": verdict,
        }

    except (OSError, RuntimeError, ValueError) as exc:
        _cleanup(filepath)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/analyze/image")
async def analyze_image(file: UploadFile = File(...)) -> dict:
    """Analyze an image file for AI-generated or manipulated content.

    Returns a JSON payload with ``status``, ``trust_score``, ``deepfake``,
    and ``final_verdict`` fields.
    """
    start_time = time.time()
    filepath = _save_upload(file, ALLOWED_IMAGE_EXTENSIONS)

    try:
        result = deepfake_model.predict_image(str(filepath))
        _cleanup(filepath)

        is_fake = result["result"] == "FAKE"
        status = "REJECTED" if is_fake else "AUTHENTICATED"
        verdict = (
            "REJECTED — Image appears to be AI generated or manipulated"
            if is_fake
            else "AUTHENTICATED — Image appears to be genuine"
        )
        trust_score = 0 if is_fake else result.get("real_prob", 0)

        return {
            "status": status,
            "input_type": "image",
            "trust_score": trust_score,
            "processing_time": round(time.time() - start_time, 2),
            "deepfake": result,
            "behavior": None,
            "final_verdict": verdict,
        }

    except (OSError, RuntimeError, ValueError) as exc:
        _cleanup(filepath)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/analyze/audio")
async def analyze_audio(file: UploadFile = File(...)) -> dict:
    """Analyze an audio file for deceptive vocal patterns.

    Returns a JSON payload with ``status``, ``trust_score``, ``behavior``,
    and ``final_verdict`` fields.
    """
    start_time = time.time()
    filepath = _save_upload(file, ALLOWED_AUDIO_EXTENSIONS)

    try:
        result = lie_model.predict_audio_only(str(filepath))
        _cleanup(filepath)

        is_deceptive = result["result"] == "DECEPTIVE"
        status = "SUSPICIOUS" if is_deceptive else "AUTHENTICATED"
        verdict = (
            "SUSPICIOUS — Deceptive vocal patterns detected"
            if is_deceptive
            else "AUTHENTICATED — Truthful vocal patterns detected"
        )

        return {
            "status": status,
            "input_type": "audio",
            "trust_score": result.get("truthful_prob", 0),
            "processing_time": round(time.time() - start_time, 2),
            "deepfake": None,
            "behavior": result,
            "final_verdict": verdict,
        }

    except (OSError, RuntimeError, ValueError) as exc:
        _cleanup(filepath)
        raise HTTPException(status_code=500, detail=str(exc)) from exc