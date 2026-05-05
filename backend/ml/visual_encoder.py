import os
import cv2
import torch
import torchvision.transforms as T
from torchvision.models import mobilenet_v3_small
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

class VisualEncoder:
    def __init__(self):
        # 1. Feature Extractor (MobileNetV3)
        self.model = mobilenet_v3_small(pretrained=True)
        self.feature_extractor = self.model.features
        self.pool = torch.nn.AdaptiveAvgPool2d(1)
        self.model.eval()
        
        self.transform = T.Compose([
            T.ToPILImage(),
            T.Resize((224, 224)),
            T.ToTensor(),
            T.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
        ])
        
        # 2. MediaPipe Face Detection (Tasks API - modern and works where solutions might be missing)
        try:
            base_dir = os.path.dirname(__file__)
            model_path = os.path.join(base_dir, "face_detector.tflite")
            
            base_options = python.BaseOptions(model_asset_path=model_path)
            options = vision.FaceDetectorOptions(
                base_options=base_options,
                running_mode=vision.RunningMode.IMAGE,
                min_detection_confidence=0.75 # Further increased to 0.75 for maximum precision
            )
            self.face_detector = vision.FaceDetector.create_from_options(options)
            print(f"[ML] Tasks API Face Detector initialized with {model_path}")
        except Exception as e:
            print(f"[ML] Error initializing Tasks API Face Detector: {e}")
            self.face_detector = None
        
        # Buffer for temporal smoothing, keyed by session_id
        self.session_face_histories = {}

    def process_frame(self, image_input, session_id: int = 0) -> dict:
        """
        Consolidated processing: Performs both 
        face detection and geometric feature extraction.
        image_input can be a path (str) or an RGB image array (numpy).
        """
        result = {
            "face_detected": False, 
            "face_count": 0, 
            "anomaly_type": None,
            "features": torch.zeros((576,), dtype=torch.float32)
        }
        
        # 1. Load Image or use provided array
        if isinstance(image_input, str):
            if not image_input or not os.path.exists(image_input):
                return result
            img = cv2.imread(image_input)
            if img is None:
                return result
            img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        else:
            img_rgb = image_input # Assume already RGB numpy array
            
        h, w = img_rgb.shape[:2]
        
        # 2. Face Detection (MediaPipe)
        geometric_features = np.zeros(576, dtype=np.float32)
        
        if self.face_detector:
            # OPTIMIZATION: Resize for MediaPipe if the image is large
            if h > 256 or w > 256:
                scale = 256.0 / max(h, w)
                mp_img_data = cv2.resize(img_rgb, (0,0), fx=scale, fy=scale)
            else:
                mp_img_data = img_rgb
                
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=mp_img_data)
            detection_result = self.face_detector.detect(mp_image)
            
            count = 0 # Initialize to 0, will be 1 if a valid face is found
            if detection_result.detections:
                # Extract geometric features from the first detected face
                for face in detection_result.detections:
                    keypoints = face.keypoints
                    
                    # keypoints: 0:L-eye, 1:R-eye, 2:Nose, 3:Mouth, 4:L-ear, 5:R-ear
                    if len(keypoints) >= 4:
                        le = keypoints[0]
                        re = keypoints[1]
                        nose = keypoints[2]
                        mouth = keypoints[3]
                        
                        # SANITY CHECK 1: Size (Eyes should be reasonably far apart)
                        eye_dist_x = abs(re.x - le.x)
                        if eye_dist_x < 0.05: # Face is too small/far
                            continue

                        # SANITY CHECK 2: Orientation (Eyes above nose, nose above mouth)
                        eye_center_y = (le.y + re.y) / 2
                        if nose.y < eye_center_y or mouth.y < nose.y:
                            continue
                            
                        # If we reach here, we found a "sane" face
                        count = 1 
                        
                        # 1. Yaw (Looking Left/Right)
                        eye_center_x = (le.x + re.x) / 2
                        eye_dist_x = abs(re.x - le.x) + 1e-6
                        yaw = (nose.x - eye_center_x) / eye_dist_x
                        geometric_features[2] = np.clip(yaw * 2.0, -1.0, 1.0)
                        
                        # 2. Pitch (Looking Up/Down)
                        eye_dist_y = eye_dist_x 
                        pitch = (nose.y - eye_center_y) / eye_dist_y
                        geometric_features[1] = np.clip((pitch - 0.2) * 2.0, -1.0, 1.0)
                        
                        # 3. Gaze (Approximate)
                        geometric_features[4] = geometric_features[2] * 0.8
                        
                        # 4. Mouth Opening
                        mouth_dist = abs(mouth.y - nose.y)
                        geometric_features[5] = np.clip((mouth_dist / eye_dist_y) - 0.3, 0.0, 1.0)
                        
                        geometric_features[0] = 0.5 
                        break # Only process the first valid face
            
            # Temporal smoothing (REDUCED to 1 frame for immediate response)
            if session_id not in self.session_face_histories:
                self.session_face_histories[session_id] = []
            
            history = self.session_face_histories[session_id]
            history.append(count)
            if len(history) > 1: # Reduced from 3 to 1
                history.pop(0)
            
            smooth_count = history[0] # Just use the current/only frame
            
            result["face_count"] = smooth_count
            if smooth_count == 0:
                result["anomaly_type"] = "face_absent"
                result["face_detected"] = False
                geometric_features[0] = 0.0
            elif smooth_count > 1:
                result["anomaly_type"] = "multiple_faces"
                result["face_detected"] = True
                geometric_features[0] = 1.0
            else:
                result["face_detected"] = True

        result["features"] = torch.from_numpy(geometric_features)
        return result

    def extract_visual_features(self, image_input) -> torch.Tensor:
        """Legacy method for backward compatibility."""
        res = self.process_frame(image_input)
        return res["features"]

    def detect_face(self, image_input, session_id: int = 0) -> dict:
        """Legacy method for backward compatibility."""
        res = self.process_frame(image_input, session_id)
        # Remove features to match old return signature
        if "features" in res:
            del res["features"]
        return res

if __name__ == "__main__":
    enc = VisualEncoder()
    print("Visual encoder (MediaPipe Tasks API) optimized.")


