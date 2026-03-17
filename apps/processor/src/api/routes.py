from fastapi import APIRouter, Depends

from src.api.dependencies import verify_api_key

router = APIRouter()


@router.get("/health")
async def health():
    return {"status": "ok"}


@router.post("/process", dependencies=[Depends(verify_api_key)])
async def process_video(job_id: str):
    # Stub — will be implemented in Phase 3
    return {"job_id": job_id, "status": "queued"}
