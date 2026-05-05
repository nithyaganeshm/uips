
def validate_exam_mode(mode: str) -> bool:
    """Validate that exam mode is one of the allowed values."""
    return mode in ("online",)
