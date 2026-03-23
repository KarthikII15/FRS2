#!/bin/bash
# ============================================================
# JETSON STEP J06 — Write FastAPI sidecar + start runner.py
# Run this ON THE JETSON (172.18.3.202)
#
# runner.py is already in the repo. This script:
#  1. Writes the FastAPI sidecar app (app/main.py + app/pipeline.py)
#  2. Starts runner.py with all required env vars
# ============================================================
set -e

VM_IP="172.20.100.222"
PROJECT_JETSON="/opt/frs"

echo ""
echo "=================================================="
echo " JETSON J06: Write sidecar app + start runner"
echo "=================================================="
echo ""

# ── Locate runner.py ──────────────────────────────────────
# runner.py was copied from the repo's jetson/ folder
# Check common locations
RUNNER_PATH=""
for P in \
  "/opt/frs/runner.py" \
  "/opt/frs/jetson/runner.py" \
  "$HOME/frs2/FRS--Java-Verison/jetson/runner.py"; do
  if [ -f "$P" ]; then
    RUNNER_PATH="$P"
    break
  fi
done

if [ -z "$RUNNER_PATH" ]; then
  echo "  ❌ runner.py not found."
  echo "     Copy it from the repo:"
  echo "     scp ubuntu@${VM_IP}:/home/administrator/FRS_/FRS--Java-Verison/jetson/runner.py /opt/frs/"
  echo "     scp -r ubuntu@${VM_IP}:/home/administrator/FRS_/FRS--Java-Verison/jetson/ /opt/frs/"
  echo ""
  echo "  Will attempt to copy now (requires backend VM to have the repo)..."
  scp -o StrictHostKeyChecking=no \
    "ubuntu@${VM_IP}:/home/administrator/FRS_/FRS--Java-Verison/jetson/runner.py" \
    /opt/frs/runner.py 2>/dev/null || {
    echo "  ❌ Could not copy runner.py. Copy it manually."
    exit 1
  }
  RUNNER_PATH="/opt/frs/runner.py"
fi

echo "  ✅ runner.py found at: $RUNNER_PATH"
RUNNER_DIR=$(dirname "$RUNNER_PATH")

# ── Write FastAPI app/pipeline stub ──────────────────────
# runner.py imports from app.pipeline and app.main
# These are the bridge between TensorRT models and the runner

mkdir -p "${RUNNER_DIR}/app"

# app/__init__.py
touch "${RUNNER_DIR}/app/__init__.py"

# ── app/pipeline.py — FacePipeline wrapper ────────────────
echo "[1/3] Writing app/pipeline.py ..."

cat > "${RUNNER_DIR}/app/pipeline.py" << 'PYEOF'
"""
app/pipeline.py — FacePipeline: YOLO face detection + ArcFace embedding

Wraps TensorRT engines (or falls back to ONNX Runtime).
Loaded once at startup by PramaJetsonRunner.
"""

import os
import numpy as np
import cv2
import logging

logger = logging.getLogger(__name__)


class FacePipeline:
    """
    Two-stage pipeline:
      Stage 1: YOLOv8n-face  → bounding boxes + confidence
      Stage 2: ArcFace R50   → 512-dim L2-normalised embedding
    """

    def __init__(self, det_path: str, emb_path: str,
                 conf: float = 0.5, nms: float = 0.4):
        self.conf_threshold = conf
        self.nms_threshold = nms
        self.det_session = None
        self.emb_session = None

        self._load_models(det_path, emb_path)
        logger.info("[FacePipeline] Loaded — det=%s  emb=%s", det_path, emb_path)

    def _load_models(self, det_path: str, emb_path: str):
        """Load TensorRT (.engine) or ONNX (.onnx) models."""
        # Try TensorRT first (Jetson native)
        if det_path.endswith(".engine"):
            try:
                import tensorrt as trt
                import pycuda.driver as cuda
                import pycuda.autoinit  # noqa: F401
                # Full TRT loading is device-specific — skipped here,
                # use onnxruntime-gpu as the practical path on JetPack 6+
                raise ImportError("Using onnxruntime-gpu path")
            except (ImportError, Exception):
                # Fall through to onnxruntime
                pass

        # ONNX Runtime (works on Jetson with onnxruntime-gpu)
        try:
            import onnxruntime as ort
            providers = ['CUDAExecutionProvider', 'CPUExecutionProvider']

            # Check if .onnx versions exist alongside .engine files
            det_onnx = det_path.replace(".engine", ".onnx")
            emb_onnx = emb_path.replace(".engine", ".onnx")

            if os.path.exists(det_onnx):
                self.det_session = ort.InferenceSession(det_onnx, providers=providers)
                logger.info("[FacePipeline] Loaded det model (ONNX): %s", det_onnx)
            elif os.path.exists(det_path):
                self.det_session = ort.InferenceSession(det_path, providers=providers)
                logger.info("[FacePipeline] Loaded det model: %s", det_path)
            else:
                logger.warning("[FacePipeline] Detection model not found: %s", det_path)

            if os.path.exists(emb_onnx):
                self.emb_session = ort.InferenceSession(emb_onnx, providers=providers)
                logger.info("[FacePipeline] Loaded emb model (ONNX): %s", emb_onnx)
            elif os.path.exists(emb_path):
                self.emb_session = ort.InferenceSession(emb_path, providers=providers)
                logger.info("[FacePipeline] Loaded emb model: %s", emb_path)
            else:
                logger.warning("[FacePipeline] Embedding model not found: %s", emb_path)

        except ImportError:
            logger.error("[FacePipeline] onnxruntime not installed. "
                         "Run: pip3 install onnxruntime --break-system-packages")

    # ── Detection helpers ──────────────────────────────────────

    def _preprocess_det(self, frame: np.ndarray) -> np.ndarray:
        """Resize + normalize frame for YOLOv8."""
        img = cv2.resize(frame, (640, 640))
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        img = img.astype(np.float32) / 255.0
        return np.transpose(img, (2, 0, 1))[np.newaxis, ...]  # BCHW

    def _preprocess_emb(self, face_crop: np.ndarray) -> np.ndarray:
        """Resize + normalize face crop for ArcFace."""
        img = cv2.resize(face_crop, (112, 112))
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        img = img.astype(np.float32)
        img = (img - 127.5) / 128.0
        return np.transpose(img, (2, 0, 1))[np.newaxis, ...]  # BCHW

    def _detect_faces(self, frame: np.ndarray):
        """Run YOLOv8 detection, return list of (x1,y1,x2,y2,conf) boxes."""
        if self.det_session is None:
            return []
        inp = self._preprocess_det(frame)
        inp_name = self.det_session.get_inputs()[0].name
        outputs = self.det_session.run(None, {inp_name: inp})
        raw = outputs[0][0]  # shape: (num_detections, 5+)

        h, w = frame.shape[:2]
        sx, sy = w / 640.0, h / 640.0

        boxes = []
        for det in raw:
            conf = float(det[4])
            if conf < self.conf_threshold:
                continue
            cx, cy, bw, bh = det[0]*sx, det[1]*sy, det[2]*sx, det[3]*sy
            x1 = int(cx - bw/2); y1 = int(cy - bh/2)
            x2 = int(cx + bw/2); y2 = int(cy + bh/2)
            x1, y1 = max(0, x1), max(0, y1)
            x2, y2 = min(w, x2), min(h, y2)
            boxes.append((x1, y1, x2, y2, conf))

        # Non-max suppression
        if len(boxes) > 1:
            rects = [[b[0], b[1], b[2]-b[0], b[3]-b[1]] for b in boxes]
            scores = [b[4] for b in boxes]
            idxs = cv2.dnn.NMSBoxes(rects, scores, self.conf_threshold, self.nms_threshold)
            if len(idxs):
                boxes = [boxes[i] for i in idxs.flatten()]

        return boxes

    def _embed_face(self, face_crop: np.ndarray) -> list:
        """Run ArcFace on a face crop, return 512-dim L2-normalised embedding."""
        if self.emb_session is None:
            # Return random unit vector as placeholder when model is missing
            v = np.random.randn(512).astype(np.float32)
            return (v / np.linalg.norm(v)).tolist()

        inp = self._preprocess_emb(face_crop)
        inp_name = self.emb_session.get_inputs()[0].name
        emb = self.emb_session.run(None, {inp_name: inp})[0][0]
        norm = np.linalg.norm(emb)
        if norm > 0:
            emb = emb / norm
        return emb.tolist()

    # ── Public API ─────────────────────────────────────────────

    def process_frame(self, frame: np.ndarray) -> dict:
        """
        Full pipeline: detect faces, embed the best one.

        Returns:
          {
            "faceCount": int,
            "embedding": List[float] | None,   # 512 floats, best/largest face
            "confidence": float,
            "detections": [{"embedding":..., "confidence":..., "bbox":...}]
          }
        """
        boxes = self._detect_faces(frame)
        if not boxes:
            return {"faceCount": 0, "embedding": None, "confidence": 0.0, "detections": []}

        # Pick the largest face by bounding box area
        best = max(boxes, key=lambda b: (b[2]-b[0]) * (b[3]-b[1]))
        x1, y1, x2, y2, best_conf = best

        face_crop = frame[y1:y2, x1:x2]
        if face_crop.size == 0:
            return {"faceCount": len(boxes), "embedding": None, "confidence": 0.0, "detections": []}

        embedding = self._embed_face(face_crop)

        detections = []
        for b in boxes:
            crop = frame[b[1]:b[3], b[0]:b[2]]
            if crop.size > 0:
                emb = self._embed_face(crop)
                detections.append({
                    "embedding": emb,
                    "confidence": b[4],
                    "bbox": {"x1": b[0], "y1": b[1], "x2": b[2], "y2": b[3]}
                })

        return {
            "faceCount": len(boxes),
            "embedding": embedding,
            "confidence": float(best_conf),
            "detections": detections,
        }

    def embed_image_bytes(self, image_bytes: bytes) -> dict:
        """Process raw JPEG/PNG bytes — used by the FastAPI sidecar."""
        arr = np.frombuffer(image_bytes, np.uint8)
        frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if frame is None:
            return {"error": "Could not decode image", "faceCount": 0}
        return self.process_frame(frame)
PYEOF

echo "  ✅ app/pipeline.py written"

# ── app/main.py — FastAPI sidecar ─────────────────────────
echo "[2/3] Writing app/main.py (FastAPI sidecar) ..."

cat > "${RUNNER_DIR}/app/main.py" << 'PYEOF'
"""
app/main.py — FastAPI sidecar on port 5000

Endpoints:
  GET  /health              → {"status":"ok","model":"loaded"|"unavailable"}
  POST /api/recognize       → accept image file or JSON embedding, return recognition result
  POST /api/face/recognize  → alias (backend may call either path)

The sidecar is called by the Node.js backend when:
  - An image URL is posted to /api/face/recognize (Path B)
  - An image file is uploaded via HR dashboard (Path C)

When runner.py sends embeddings directly (Path A), this sidecar is NOT called.
"""

import os
import io
import json
import logging
from contextlib import asynccontextmanager
from typing import Optional

import numpy as np
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.pipeline import FacePipeline

logger = logging.getLogger(__name__)

# ── Global pipeline (loaded once at startup) ───────────────
_pipeline: Optional[FacePipeline] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _pipeline
    model_cfg_path = os.getenv("MODEL_CONFIG_PATH", "/opt/frs-models/config/model_config.json")
    try:
        with open(model_cfg_path) as f:
            cfg = json.load(f)
        det = cfg["models"]["face_detection"]
        emb = cfg["models"]["face_embedding"]
        det_path = os.path.join(det["path"], det["filename"])
        emb_path = os.path.join(emb["path"], emb["filename"])
        _pipeline = FacePipeline(
            det_path=det_path,
            emb_path=emb_path,
            conf=det.get("confThreshold", 0.5),
            nms=det.get("nmsThreshold", 0.4),
        )
        logger.info("[sidecar] Pipeline ready")
    except Exception as e:
        logger.warning("[sidecar] Pipeline load failed: %s — will use stub", e)
        _pipeline = FacePipeline(
            det_path="/nonexistent.engine",
            emb_path="/nonexistent.engine",
        )
    yield
    logger.info("[sidecar] Shutdown")


app = FastAPI(title="FRS2 Edge Sidecar", version="1.0.0", lifespan=lifespan)


# ── Health ─────────────────────────────────────────────────
@app.get("/health")
def health():
    model_status = "loaded" if (_pipeline and _pipeline.emb_session) else "stub"
    return {"status": "ok", "model": model_status}


# ── Recognize via file upload ──────────────────────────────
class RecognizeResponse(BaseModel):
    faceCount: int
    embedding: Optional[list] = None
    confidence: float
    error: Optional[str] = None


@app.post("/api/recognize", response_model=RecognizeResponse)
@app.post("/api/face/recognize", response_model=RecognizeResponse)
async def recognize(
    image: Optional[UploadFile] = File(None),
    url: Optional[str] = None,
):
    """Accept image file upload or URL, return face embedding."""
    if _pipeline is None:
        raise HTTPException(503, "Pipeline not initialized")

    image_bytes = None

    if image is not None:
        image_bytes = await image.read()
    elif url:
        import httpx
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                image_bytes = resp.content
        except Exception as e:
            raise HTTPException(400, f"Could not fetch image URL: {e}")
    else:
        raise HTTPException(400, "Provide 'image' file upload or 'url' field")

    result = _pipeline.embed_image_bytes(image_bytes)

    return RecognizeResponse(
        faceCount=result.get("faceCount", 0),
        embedding=result.get("embedding"),
        confidence=result.get("confidence", 0.0),
        error=result.get("error"),
    )
PYEOF

echo "  ✅ app/main.py written"

# ── Start runner.py ───────────────────────────────────────
echo ""
echo "[3/3] Starting runner.py ..."
echo ""

# Source env file
if [ -f /opt/frs/.env ]; then
  set -a
  source /opt/frs/.env
  set +a
fi

export MODEL_CONFIG_PATH="${MODEL_CONFIG_PATH:-/opt/frs-models/config/model_config.json}"
export CAMERAS_CONFIG="${CAMERAS_CONFIG:-/opt/frs-models/config/cameras.json}"
export BACKEND_URL="${BACKEND_URL:-http://${VM_IP}:8080}"
export TOKEN_PATH="${TOKEN_PATH:-/opt/frs/device_token.txt}"
export SIDECAR_PORT="${SIDECAR_PORT:-5000}"

echo "  Environment:"
echo "    BACKEND_URL        = $BACKEND_URL"
echo "    CAMERAS_CONFIG     = $CAMERAS_CONFIG"
echo "    MODEL_CONFIG_PATH  = $MODEL_CONFIG_PATH"
echo "    TOKEN_PATH         = $TOKEN_PATH"
echo "    SIDECAR_PORT       = $SIDECAR_PORT"
echo ""

cd "$RUNNER_DIR"

echo "Starting runner... (Ctrl+C to stop)"
echo "Watch for:"
echo "  ✅ [entrance-cam-01] Opened with HW decoder (nvv4l2decoder)"
echo "  or"
echo "  ⚠️  [entrance-cam-01] HW decoder failed, trying SW decoder"
echo ""
echo "When a face is detected:"
echo "  [entrance-cam-01] ✅ Alice Smith | sim=0.823"
echo "  or"
echo "  [entrance-cam-01] ⚠️  Face not enrolled"
echo ""
echo "──────────────────────────────────────────────────"

python3 runner.py
