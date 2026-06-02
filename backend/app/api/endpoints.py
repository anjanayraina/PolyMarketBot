from fastapi import APIRouter, Query, HTTPException
from app.models.schemas import ScanResponse
from app.services.tracker import PolymarketInsiderTracker
import logging

logger = logging.getLogger("PolymarketRouter")
router = APIRouter()

@router.get("/scan", response_model=ScanResponse)
def scan_market(
    condition_id: str = Query(
        "0xbb57ccf5853a85487bc3d83d04d669310d28c6c810758953b9d9b91d1aee89d2", 
        description="The Polymarket Condition ID to analyze."
    )
):
    """
    Triggers the insider tracking pipeline for a specific market condition ID
    and returns a strictly validated Pydantic model response.
    """
    logger.info(f"API Scan triggered via Router for Condition ID: {condition_id}")
    try:
        tracker = PolymarketInsiderTracker()
        results = tracker.run_pipeline(condition_id)
        return {
            "status": "success",
            "condition_id": condition_id,
            "count": len(results),
            "insiders": results
        }
    except Exception as e:
        logger.error(f"Error executing scan pipeline: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Algorithmic pipeline error: {str(e)}"
        )
