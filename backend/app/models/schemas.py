from pydantic import BaseModel, Field
from typing import List, Optional

class InsiderProfile(BaseModel):
    wallet: str = Field(..., description="The user's Polygon proxy wallet address.")
    name: str = Field("", description="The user's custom display name.")
    pseudonym: str = Field("", description="The user's platform-assigned anonymous pseudonym.")
    bio: str = Field("", description="The user's biography/description.")
    profile_image: str = Field("", description="The user's profile image avatar link.")
    profile_url: str = Field(..., description="Direct link leading to their public profile on Polymarket.")
    total_portfolio_value: float = Field(..., description="Sum value of all active positions in USD.")
    political_exposure: float = Field(..., description="Total value deployed in political markets in USD.")
    domain_score: float = Field(..., description="Concentration ratio of political assets (between 0.0 and 1.0).")
    target_conviction: float = Field(..., description="Active position size on the target outcome.")
    target_outcome: str = Field(..., description="The outcome choice (YES/NO/outcomeIndex).")
    execution_style: str = Field(..., description="Classification of trade execution style (Quiet vs Aggressive).")

class ScanResponse(BaseModel):
    status: str = Field(..., description="Status of the scan query execution.")
    condition_id: str = Field(..., description="The market condition ID analyzed.")
    count: int = Field(..., description="Total number of qualified domain specialist portfolios.")
    insiders: List[InsiderProfile] = Field(..., description="A list of qualified insider profiles.")
