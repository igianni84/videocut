"""Shared test configuration.

Stubs out heavy ML dependencies (torch, torchaudio, silero_vad, faster_whisper)
that are not installed in the dev/CI environment. This must run before any
test module imports the production code.
"""

import sys
from unittest.mock import MagicMock

# Stub heavy ML modules so that imports don't fail in test environments
# where torch/torchaudio/silero_vad/faster_whisper are not installed.
_HEAVY_MODULES = [
    "torch",
    "torch.jit",
    "torch.hub",
    "torchaudio",
    "torchaudio.functional",
    "silero_vad",
    "faster_whisper",
    "cv2",
    "mediapipe",
    "mediapipe.solutions",
    "mediapipe.solutions.face_detection",
]

for mod_name in _HEAVY_MODULES:
    if mod_name not in sys.modules:
        sys.modules[mod_name] = MagicMock()
