from fastapi import APIRouter, Query, HTTPException
from app.models.schemas import ScanResponse
from app.services.tracker import PolymarketInsiderTracker
import logging
import requests
import re

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
        target_category = getattr(tracker, "last_target_category", "politics")
        return {
            "status": "success",
            "condition_id": condition_id,
            "target_category": target_category,
            "count": len(results),
            "insiders": results
        }
    except Exception as e:
        logger.error(f"Error executing scan pipeline: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Algorithmic pipeline error: {str(e)}"
        )

@router.get("/resolve")
def resolve_market(query: str = Query(..., description="URL, slug, or title of the market")):
    """
    Resolves a Polymarket URL, slug, or title into its constituent active markets (condition IDs and titles)
    by fetching from the Gamma API.
    """
    query = query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Empty query provided.")

    # Check if it's a URL
    slug = ""
    url_match = re.search(r"polymarket\.com/(?:event|market)/([a-zA-Z0-9\-]+)", query)
    if url_match:
        slug = url_match.group(1)
    else:
        # Check if it looks like a slug already, otherwise slugify it
        if re.match(r"^[a-zA-Z0-9\-]+$", query):
            slug = query
        else:
            # Slugify the search term
            slug = query.lower()
            slug = re.sub(r"[^a-z0-9\-]", "-", slug)
            slug = re.sub(r"\-+", "-", slug).strip("-")

    # Try fetching by slug from Gamma events API
    url = "https://gamma-api.polymarket.com/events"
    try:
        response = requests.get(url, params={"slug": slug}, timeout=10)
        if response.status_code == 200:
            data = response.json()
            if data and isinstance(data, list):
                event_data = data[0]
                markets = []
                for m in event_data.get("markets", []):
                    if m.get("conditionId"):
                        markets.append({
                            "condition_id": m.get("conditionId"),
                            "title": m.get("question") or m.get("title") or event_data.get("title"),
                            "slug": m.get("slug")
                        })
                if markets:
                    return {
                        "status": "success",
                        "event_title": event_data.get("title"),
                        "markets": markets
                    }
    except Exception as e:
        logger.error(f"Error resolving event slug {slug}: {e}")

    # If not found by slug, let's try direct keyword search on markets API
    try:
        response = requests.get("https://gamma-api.polymarket.com/markets", params={"active": "true", "search": query}, timeout=10)
        if response.status_code == 200:
            data = response.json()
            if data and isinstance(data, list):
                markets = []
                for m in data:
                    if m.get("conditionId"):
                        markets.append({
                            "condition_id": m.get("conditionId"),
                            "title": m.get("question") or m.get("title"),
                            "slug": m.get("slug")
                        })
                # Filter down to top matches to avoid noise
                markets = markets[:5]
                if markets:
                    return {
                        "status": "success",
                        "event_title": f"Search Results for '{query}'",
                        "markets": markets
                    }
    except Exception as e:
        logger.error(f"Error searching markets for {query}: {e}")

    raise HTTPException(status_code=404, detail="Could not resolve market name or URL to any active Polymarket condition IDs.")

