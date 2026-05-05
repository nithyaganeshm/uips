import os
import time
import glob
from datetime import datetime, timezone

try:
    from database.db import db
    from models.session import ExamSession
    from models.event import SuspicionEvent
except ImportError:
    pass

# ML components will be lazy-loaded inside InferenceEngine
torch = None
np = None

class InferenceEngine:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(InferenceEngine, cls).__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
            
        print("[ML] --- LAZY LOADING ML MODELS ---", flush=True)
        global torch, np
        import torch
        import numpy as np
        
        try:
            from ml.visual_encoder import VisualEncoder
            from ml.audio_encoder import AudioEncoder
            from ml.behavior_encoder import BehaviorEncoder
            from ml.transformer import MTTSEPModel
        except ImportError:
            from visual_encoder import VisualEncoder
            from audio_encoder import AudioEncoder
            from behavior_encoder import BehaviorEncoder
            from transformer import MTTSEPModel

        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.score_history = {} # session_id -> current EMA score
        self.prob_history = {}  # session_id -> list of tensor probs
        self.state_transitions = {} # session_id -> {current_risk, pending_risk, pending_since}
        
        print(f"[ML] Initializing Inference Engine on {self.device}...")
        
        try:
            self.vis_enc = VisualEncoder()
            self.aud_enc = AudioEncoder()
            self.beh_enc = BehaviorEncoder()
            self.model = MTTSEPModel()
            
            base_dir = os.path.dirname(__file__)
            model_path = os.path.abspath(os.path.join(base_dir, "..", "trained_models", "mtt_sep.pth"))
            
            if os.path.exists(model_path):
                checkpoint = torch.load(model_path, map_location="cpu")
                self.model.load_state_dict(checkpoint, strict=False)
                print(f"[ML] Main model loaded from {model_path}")
            else:
                print(f"[ML] CRITICAL: Main model not found at {model_path}")
                
            self.model.eval()
            self.model.to(self.device)
            
            # Verify sub-encoders
            if hasattr(self.vis_enc, 'face_detector') and self.vis_enc.face_detector is not None:
                print("[ML] Visual encoder ready.")
            else:
                print("[ML] WARNING: Visual encoder initialized but face detector is MISSING.")
                
            self._initialized = True
            print("[ML] Inference Engine fully initialized.")
        except Exception as e:
            print(f"[ML] CRITICAL initialization error: {e}")
            import traceback
            traceback.print_exc()

    def run_inference(self, session_id: int, img_data=None) -> dict:
        t0 = time.time()
        result = {
            "session_id": session_id,
            "suspicion_index": 0.0,
            "face_detected": False,
            "face_count": 0,
            "anomalies": [],
            "timestamp": time.time(),
            "inference_time_ms": 0,
            "risk_level": "low"
        }
        
        # 0. Determine video input
        vid_input = None
        if img_data is not None:
            vid_input = img_data
        else:
            base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "uploads", "sessions", str(session_id)))
            if os.path.exists(base_dir):
                vid_files = sorted(glob.glob(f"{base_dir}/video/*.jpg"))
                if vid_files:
                    vid_input = vid_files[-1]
        
        if vid_input is None:
            # If video input is missing entirely, treat as medium risk
            result["risk_level"] = "medium"
            result["suspicion_index"] = 50.0
            return result
            
        try:
            # 1. Consolidated Visual Processing (Feature Extraction + Face Detection)
            v_data = self.vis_enc.process_frame(vid_input, session_id=session_id)
            v_feat = v_data["features"].unsqueeze(0).to(self.device)
            
            result["face_detected"] = v_data.get("face_detected", False)
            result["face_count"] = v_data.get("face_count", 0)
            
            if not result["face_detected"]:
                print(f"[ML] Session {session_id}: Face LOST or MISSING in frame")
            if v_data.get("anomaly_type"):
                result["anomalies"].append({
                    "source": "visual", 
                    "type": v_data["anomaly_type"], 
                    "severity": "high"
                })
            
            # 2. Other Modalities (File based fallback for now)
            base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "uploads", "sessions", str(session_id)))
            aud_files = sorted(glob.glob(f"{base_dir}/audio/*.wav"))
            beh_log = f"{base_dir}/behavior/log.json"
            aud_path = aud_files[-1] if aud_files else ""
            
            a_feat = self.aud_enc.extract_audio_features(aud_path).unsqueeze(0).to(self.device)
            b_feat = self.beh_enc.extract_behavior_features(beh_log).unsqueeze(0).to(self.device)
            
            a_anom = self.aud_enc.detect_audio_anomaly(aud_path)
            if a_anom.get("anomaly"):
                result["anomalies"].append({"source": "audio", "type": a_anom.get("type"), "severity": a_anom.get("severity", "medium")})
                
            b_anom = self.beh_enc.detect_behavior_anomaly(beh_log)
            if b_anom.get("anomaly"):
                result["anomalies"].append({"source": "behavior", "type": b_anom.get("type"), "severity": b_anom.get("severity", "low")})
                
            # 3. Model Prediction
            with torch.no_grad():
                out = self.model(v_feat, a_feat, b_feat)
                probs = torch.softmax(out, dim=1).squeeze(0)
                
            # 4. Temporal Smoothing for Probs
            if session_id not in self.prob_history:
                self.prob_history[session_id] = []
            self.prob_history[session_id].append(probs)
            if len(self.prob_history[session_id]) > 3:
                self.prob_history[session_id].pop(0)
            
            avg_probs = torch.stack(self.prob_history[session_id]).mean(dim=0)
            risk_class = torch.argmax(avg_probs).item()
            
            # If face is not detected, we still predict high but allow the delay logic to confirm
            if not result["face_detected"]:
                risk_class = 2
            
            # 5. Score Calculation & EMA Smoothing
            base_scores = [15.0, 55.0, 95.0]
            raw_score = base_scores[risk_class] + (avg_probs[risk_class].item() - 0.5) * 20
            
            # Apply Exponential Moving Average (EMA) for smoother transitions
            alpha = 0.85
            if session_id not in self.score_history:
                self.score_history[session_id] = raw_score
            else:
                self.score_history[session_id] = (alpha * raw_score) + ((1 - alpha) * self.score_history[session_id])
            
            final_score = min(100.0, max(0.0, round(self.score_history[session_id], 2)))
            result["suspicion_index"] = final_score
            
            # 6. State Transition Logic (5-second delay)
            predicted_risk = ["low", "medium", "high"][risk_class]
            
            if session_id not in self.state_transitions:
                self.state_transitions[session_id] = {
                    "current_risk": "low",
                    "pending_risk": None,
                    "pending_since": None
                }
            
            state = self.state_transitions[session_id]
            
            # Removed immediate escalation to allow 5s confirmation delay
            if predicted_risk == state["current_risk"]:
                # Predicted risk matches confirmed state, reset pending
                state["pending_risk"] = None
                state["pending_since"] = None
            else:
                # Predicted risk differs from current state
                if predicted_risk != state["pending_risk"]:
                    # New pending risk detected
                    state["pending_risk"] = predicted_risk
                    state["pending_since"] = time.time()
                else:
                    # Same pending risk, check duration
                    elapsed = time.time() - (state["pending_since"] or time.time())
                    if elapsed >= 5.0:
                        print(f"[ML] Session {session_id}: Risk level confirmed as {predicted_risk} after 5s delay")
                        state["current_risk"] = predicted_risk
                        state["pending_risk"] = None
                        state["pending_since"] = None
            
            result["risk_level"] = state["current_risk"]
            
            # 7. Set Modal Risks for UI
            # Visual risk based on head pose and anomalies
            # Visual risk based on head pose and anomalies
            if not result["face_detected"]:
                # If face is missing, visual risk is high but we use history to dampen it
                result["visual_risk"] = 100.0
            else:
                v_feat_np = v_feat.cpu().numpy()[0]
                # Pitch is index 1, Yaw is 2, Mouth is 5
                # Relaxed multipliers: 40 instead of 50
                pose_dev = (abs(v_feat_np[1]) + abs(v_feat_np[2])) * 40 
                mouth_dev = v_feat_np[5] * 20
                result["visual_risk"] = min(100.0, pose_dev + mouth_dev)
            
            # Audio risk based on anomalies
            result["audio_risk"] = 50.0 if any(a["source"] == "audio" for a in result["anomalies"]) else 0.0
            
            # Behavioral risk reflects the model's overall score
            result["behavior_risk"] = final_score
            
        except Exception as e:
            import traceback
            print(f"[ML] Inference error for session {session_id}: {e}")
            traceback.print_exc()
            
        result["inference_time_ms"] = int((time.time() - t0) * 1000)
        return result

# Global singleton engine
_engine = None

def run_inference(session_id: int, img_data=None) -> dict:
    global _engine
    if _engine is None:
        _engine = InferenceEngine()
    return _engine.run_inference(session_id, img_data=img_data)

def save_inference_result(session_id: int, result: dict) -> None:
    """Save inference results and create events in database."""
    session = ExamSession.query.get(session_id)
    if not session:
        return
        
    session.suspicion_index = result.get("suspicion_index", 0.0)
    risk_level = result.get("risk_level", "low")
    
    # Process anomalies into events
    from models.event import SuspicionEvent, Severity, EventType
    
    for anom in result.get("anomalies", []):
        raw_type = anom.get("type", "")
        # Map raw anomaly types to DB EventType Enums
        type_map = {
            "face_absent": EventType.face_absent,
            "multiple_faces": EventType.multiple_faces,
            "silence": EventType.audio_anomaly,
            "loud_noise": EventType.audio_anomaly,
            "low_typing": EventType.typing_anomaly,
            "high_idle": EventType.typing_anomaly
        }
        etype = type_map.get(raw_type, EventType.posture_alert)
        
        severity_str = anom.get("severity", "low")
        if risk_level == "high": severity_str = "high"
        elif risk_level == "medium" and severity_str == "low": severity_str = "medium"
        
        severity = Severity.high if severity_str == "high" else Severity.medium if severity_str == "medium" else Severity.low
            
        event = SuspicionEvent(
            session_id=session_id,
            event_type=etype,
            severity=severity,
            score_delta=15.0 if risk_level == "high" else 5.0
        )
        db.session.add(event)
        
    db.session.commit()

if __name__ == "__main__":
    print("Testing Inference Engine singleton...")
    e1 = InferenceEngine()
    e2 = InferenceEngine()
    print("Same instance:", e1 is e2)
