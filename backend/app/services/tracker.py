import logging
import requests
import pandas as pd
import time
import os
import json
from typing import List, Dict, Any, Optional

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "data")
os.makedirs(DATA_DIR, exist_ok=True)


logger = logging.getLogger("PolymarketInsiderTracker")

class PolymarketInsiderTracker:
    """
    A modular data pipeline to discover and verify high-conviction "insider" wallets
    trading political markets on Polymarket using official REST APIs.
    """
    
    DATA_API_BASE = "https://data-api.polymarket.com"
    GAMMA_API_BASE = "https://gamma-api.polymarket.com"
    
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "PolymarketInsiderTracker/1.0.0 (Web3 Algorithmic Research Client)",
            "Accept": "application/json"
        })
        # Cache to prevent duplicate category lookups for events
        self.event_politics_cache: Dict[str, bool] = {}
        self.event_category_cache: Dict[str, str] = {}
        # Store holder profile metadata mapping lower_case_wallet -> metadata dict
        self.holders_metadata: Dict[str, Dict[str, Any]] = {}
        
    def _get(self, url: str, params: Optional[Dict[str, Any]] = None) -> Optional[Any]:
        """
        Executes a GET request with automatic handling for rate limits (429s) and connection retries.
        """
        max_retries = 5
        backoff_factor = 2.0
        
        for attempt in range(max_retries):
            try:
                response = self.session.get(url, params=params, timeout=10)
                
                if response.status_code == 200:
                    return response.json()
                elif response.status_code == 429:
                    retry_after = int(response.headers.get("Retry-After", 2))
                    wait_time = max(retry_after, backoff_factor ** attempt)
                    logger.warning(f"Rate limited (429). Retrying after {wait_time:.1f}s...")
                    time.sleep(wait_time)
                else:
                    logger.error(f"Request to {url} failed with status {response.status_code}: {response.text}")
                    return None
            except Exception as e:
                logger.error(f"Network error during GET request to {url}: {e}")
                time.sleep(backoff_factor ** attempt)
                
        return None

    def fetch_top_holders(self, condition_id: str) -> List[str]:
        """
        1. Identification Phase: Fetch top asset holders for the specified condition ID.
        """
        logger.info(f"Retrieving top holders for Condition ID: {condition_id}")
        url = f"{self.DATA_API_BASE}/holders"
        data = self._get(url, params={"market": condition_id})
        
        if not data:
            logger.warning("No holder data retrieved.")
            return []
            
        wallets = set()
        self.holders_metadata = {}
        for token_data in data:
            holders = token_data.get("holders", [])
            for holder in holders:
                wallet = holder.get("proxyWallet")
                if wallet and wallet.startswith("0x"):
                    w_lower = wallet.lower()
                    wallets.add(w_lower)
                    # Cache the metadata for this wallet
                    self.holders_metadata[w_lower] = {
                        "name": holder.get("name", ""),
                        "pseudonym": holder.get("pseudonym", ""),
                        "bio": holder.get("bio", ""),
                        "profileImage": holder.get("profileImage", ""),
                        "profileUrl": f"https://polymarket.com/profile/{wallet}"
                    }
                    
        unique_wallets = list(wallets)
        logger.info(f"Discovered {len(unique_wallets)} unique target wallets from market holder sheets.")
        return unique_wallets

    def fetch_user_positions(self, user_address: str) -> List[Dict[str, Any]]:
        """
        2. Forensic Phase (Part A): Query active positions for a target wallet.
        """
        url = f"{self.DATA_API_BASE}/positions"
        positions = self._get(url, params={"user": user_address})
        return positions if positions else []

    def fetch_user_trades(self, user_address: str) -> List[Dict[str, Any]]:
        """
        3. Verification Phase (Part A): Query historical trades for a target wallet.
        """
        url = f"{self.DATA_API_BASE}/trades"
        trades = self._get(url, params={"user": user_address})
        return trades if trades else []

    def is_political_event(self, event_id: str) -> bool:
        """
        Helper method to check if a specific event belongs to the Politics category.
        """
        return self.get_event_category(event_id) == "politics"

    def get_event_category(self, event_id: str) -> str:
        """
        Helper method to resolve the specific category (politics, weather, other) of an event.
        Includes local caching to prevent redundant API queries.
        """
        if not event_id:
            return "other"
            
        if event_id in self.event_category_cache:
            return self.event_category_cache[event_id]
            
        url = f"{self.GAMMA_API_BASE}/events/{event_id}"
        event_data = self._get(url)
        
        category = "other"
        if event_data:
            tags = event_data.get("tags", [])
            for tag in tags:
                label = str(tag.get("label", "")).lower()
                slug = str(tag.get("slug", "")).lower()
                if "politics" in label or "politics" in slug:
                    category = "politics"
                    break
                elif "weather" in label or "weather" in slug or "climate" in label or "climate" in slug:
                    category = "weather"
                    break
            
            # Fallback text scanning
            if category == "other":
                title = str(event_data.get("title", "")).lower()
                desc = str(event_data.get("description", "")).lower()
                if any(kw in title or kw in desc for kw in ["politics", "election", "biden", "trump", "harris", "democrat", "republican"]):
                    category = "politics"
                elif any(kw in title or kw in desc for kw in ["weather", "temp", "climate", "rain", "snow", "degree", "wind", "storm", "hurricane", "flood", "heatwave", "celsius", "fahrenheit"]):
                    category = "weather"
                    
        self.event_category_cache[event_id] = category
        time.sleep(0.1)
        return category

    def analyze_wallet(self, user_address: str, target_condition_id: str, target_category: str = "politics") -> Optional[Dict[str, Any]]:
        """
        Analyzes a single wallet's portfolio allocation, trade execution, and directional conviction.
        Applies strict filtering heuristics using pandas.
        """
        logger.debug(f"Starting forensic analysis on wallet: {user_address}")
        
        # --- PHASE 2: FORENSIC PORTFOLIO ANALYSIS ---
        positions = self.fetch_user_positions(user_address)
        if not positions:
            return None
            
        df_pos = pd.DataFrame(positions)
        if df_pos.empty:
            return None
            
        # Ensure correct numeric types
        df_pos['currentValue'] = df_pos['currentValue'].astype(float)
        df_pos['size'] = df_pos['size'].astype(float)
        df_pos['cashPnl'] = df_pos['cashPnl'].astype(float)
        
        total_portfolio_value = df_pos['currentValue'].sum()
        if total_portfolio_value <= 0:
            return None
            
        # --- Winning History / Profitability Filter ---
        net_pnl = df_pos['cashPnl'].sum()
        if net_pnl <= 0:
            logger.info(f"Wallet {user_address} failed Profitability Filter (Net PnL must be > 0, current: ${net_pnl:,.2f}).")
            return None
            
        # Determine target category exposure for each position to verify specialist focus
        df_pos['category'] = df_pos['eventId'].apply(self.get_event_category)
        domain_value = df_pos[df_pos['category'] == target_category]['currentValue'].sum()
        
        # Domain Specialist Filter: Target category makes up > 75% of total allocation
        domain_ratio = domain_value / total_portfolio_value
        if domain_ratio <= 0.75:
            logger.debug(f"Wallet {user_address} failed Domain Specialist Filter. {target_category.capitalize()} Ratio: {domain_ratio:.2%}")
            return None
            
        # Conviction Threshold: directional position size on a single outcome
        target_positions = df_pos[df_pos['conditionId'].str.lower() == target_condition_id.lower()]
        if target_positions.empty:
            logger.debug(f"Wallet {user_address} holds no active positions in the target market.")
            return None
            
        max_conviction_pos = target_positions.loc[target_positions['currentValue'].idxmax()]
        conviction_size = max_conviction_pos['currentValue']
        
        conviction_threshold = 5000.0
        if target_category == "weather":
            conviction_threshold = 1000.0
            
        if conviction_size < conviction_threshold:
            logger.debug(f"Wallet {user_address} failed Conviction Threshold. Max Position: ${conviction_size:,.2f} (Required: ${conviction_threshold:,.2f})")
            return None
            
        target_outcome = max_conviction_pos.get('outcome', 'Unknown')
        
        # --- PHASE 3: VERIFICATION (TRADE EXECUTION STYLE) ---
        trades = self.fetch_user_trades(user_address)
        if not trades:
            return None
            
        df_trades = pd.DataFrame(trades)
        if df_trades.empty:
            return None
            
        df_trades['size'] = df_trades['size'].astype(float)
        df_trades['price'] = df_trades['price'].astype(float)
        df_trades['value'] = df_trades['size'] * df_trades['price']
        
        # --- Trade History Depth Filter ---
        total_trades = len(df_trades)
        if total_trades < 5:
            logger.info(f"Wallet {user_address} failed Trade History Depth (Only {total_trades} trades found).")
            return None
            
        # Market Maker Filter
        # 1. Balanced buy/sell trade count
        buys = len(df_trades[df_trades['side'].str.upper() == 'BUY'])
        sells = len(df_trades[df_trades['side'].str.upper() == 'SELL'])
        
        if total_trades >= 8:
            buy_ratio = buys / total_trades
            if 0.35 <= buy_ratio <= 0.65:
                logger.info(f"Wallet {user_address} flagged as Market Maker (balanced buy/sell ratio: {buy_ratio:.2%}).")
                return None
                
        # 2. Automated liquidity across multiple outcomes for the same condition
        condition_outcomes = df_trades.groupby('conditionId')['outcomeIndex'].nunique()
        frequent_hedging = (condition_outcomes > 1).any()
        if frequent_hedging and total_trades >= 5:
            logger.info(f"Wallet {user_address} flagged as Market Maker (hedging across multiple outcomes of same market).")
            return None
            
        # Determine execution accumulation style
        target_trades = df_trades[df_trades['conditionId'].str.lower() == target_condition_id.lower()]
        execution_style = "Quiet Accumulation"
        if not target_trades.empty:
            target_avg_size = target_trades['value'].mean()
            # If placing large block trades on average, they "loudly crossed the spread"
            if target_avg_size >= 1500.0:
                execution_style = "Aggressive Take (Crossed Spread)"
                
        # --- NEW COPY-TRADING METRICS ---
        total_positions = len(df_pos)
        positive_pnl_positions = len(df_pos[df_pos['cashPnl'] > 0])
        win_rate = positive_pnl_positions / total_positions if total_positions > 0 else 0.0
        
        net_pnl = df_pos['cashPnl'].sum()
        
        global_total_trades = len(df_trades)
        global_avg_trade_size = df_trades['value'].mean() if global_total_trades > 0 else 0.0
        
        # Calculate Copy-Trade Fit Score (0 - 100)
        win_rate_score = win_rate * 30.0
        pnl_divisor = 20000.0
        if target_category == "weather":
            pnl_divisor = 5000.0
        net_pnl_score = min(30.0, (max(0.0, net_pnl) / pnl_divisor) * 30.0)
        trade_depth_score = min(20.0, (global_total_trades / 40.0) * 20.0)
        domain_specialist_score = domain_ratio * 20.0
        
        copy_trade_score = win_rate_score + net_pnl_score + trade_depth_score + domain_specialist_score
        copy_trade_score = max(0.0, min(100.0, copy_trade_score))
        
        if copy_trade_score >= 85.0:
            copy_trade_rating = "Excellent (Tier 1)"
        elif copy_trade_score >= 70.0:
            copy_trade_rating = "Good (Tier 2)"
        elif copy_trade_score >= 50.0:
            copy_trade_rating = "Caution (Speculative)"
        else:
            copy_trade_rating = "Avoid (High Risk)"
 
        # Fetch cached metadata
        meta = self.holders_metadata.get(user_address.lower(), {})
        
        return {
            "wallet": user_address,
            "name": meta.get("name", ""),
            "pseudonym": meta.get("pseudonym", ""),
            "bio": meta.get("bio", ""),
            "profile_image": meta.get("profileImage", ""),
            "profile_url": meta.get("profileUrl", f"https://polymarket.com/profile/{user_address}"),
            "total_portfolio_value": total_portfolio_value,
            "political_exposure": domain_value,
            "domain_score": domain_ratio,
            "target_conviction": conviction_size,
            "target_outcome": target_outcome,
            "execution_style": execution_style,
            "win_rate": win_rate,
            "net_pnl": net_pnl,
            "total_trades": global_total_trades,
            "avg_trade_size": global_avg_trade_size,
            "copy_trade_score": copy_trade_score,
            "copy_trade_rating": copy_trade_rating
        }

    def load_scan_cache(self, condition_id: str) -> Optional[Dict[str, Any]]:
        """
        Loads cached scan results from local file if it exists.
        """
        cache_path = os.path.join(DATA_DIR, f"scan_{condition_id.lower()}.json")
        if os.path.exists(cache_path):
            try:
                with open(cache_path, "r") as f:
                    return json.load(f)
            except Exception as e:
                logger.error(f"Error loading scan cache for {condition_id}: {e}")
        return None

    def save_scan_cache(self, condition_id: str, results: List[Dict[str, Any]], target_category: str):
        """
        Saves scan results and target category locally.
        """
        cache_path = os.path.join(DATA_DIR, f"scan_{condition_id.lower()}.json")
        try:
            with open(cache_path, "w") as f:
                json.dump({
                    "timestamp": time.time(),
                    "target_category": target_category,
                    "results": results
                }, f, indent=4)
        except Exception as e:
            logger.error(f"Error saving scan cache for {condition_id}: {e}")

    def get_and_track_wallet_trades(self, user_address: str) -> Dict[str, Any]:
        """
        Fetches latest trades for a wallet, compares with local history to identify new trades,
        updates the history, and returns all trades and new trades.
        """
        user_address = user_address.lower()
        trades_file = os.path.join(DATA_DIR, f"wallet_{user_address}_trades.json")
        
        # Load old trades
        old_trades = []
        if os.path.exists(trades_file):
            try:
                with open(trades_file, "r") as f:
                    old_trades = json.load(f)
            except Exception as e:
                logger.error(f"Error reading local trades file for {user_address}: {e}")
                
        # Fetch latest trades
        latest_trades = self.fetch_user_trades(user_address)
        
        def get_trade_key(t: Dict[str, Any]) -> str:
            return t.get("id") or f"{t.get('transactionHash')}_{t.get('timestamp')}_{t.get('size')}_{t.get('price')}"
            
        old_keys = {get_trade_key(t) for t in old_trades if t}
        
        new_trades = []
        for t in latest_trades:
            if get_trade_key(t) not in old_keys:
                new_trades.append(t)
                
        # Merge all unique trades
        merged_trades_map = {get_trade_key(t): t for t in (old_trades + latest_trades) if t}
        merged_trades = list(merged_trades_map.values())
        
        try:
            merged_trades.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
        except Exception:
            pass
            
        try:
            with open(trades_file, "w") as f:
                json.dump(merged_trades, f, indent=4)
        except Exception as e:
            logger.error(f"Error saving trades file for {user_address}: {e}")
            
        return {
            "all_trades": merged_trades,
            "new_trades": new_trades,
            "new_count": len(new_trades)
        }

    def run_pipeline(self, target_condition_id: str, bypass_cache: bool = False) -> List[Dict[str, Any]]:
        """
        Runs the complete discovery pipeline and returns a list of qualified domain specialist profiles.
        """
        # If cache is not bypassed, check if we have a fresh copy (< 1 hour old)
        if not bypass_cache:
            cached_data = self.load_scan_cache(target_condition_id)
            if cached_data:
                # 3600 seconds = 1 hour
                if time.time() - cached_data.get("timestamp", 0) < 3600:
                    logger.info(f"Using cached scan results for {target_condition_id}")
                    self.last_target_category = cached_data.get("target_category", "politics")
                    return cached_data.get("results", [])

        logger.info("Initializing Polymarket Insider Discovery Pipeline...")
        
        # Resolve target event category
        target_category = "politics"
        try:
            url = f"{self.GAMMA_API_BASE}/markets"
            market_data = self._get(url, params={"conditionId": target_condition_id})
            if market_data and isinstance(market_data, list) and len(market_data) > 0:
                events = market_data[0].get("events", [])
                if events:
                    event_id = events[0].get("id")
                    target_category = self.get_event_category(event_id)
                    logger.info(f"Target market identified as category: {target_category.upper()}")
        except Exception as e:
            logger.error(f"Error identifying target market category: {e}")

        # Store last target category for reference
        self.last_target_category = target_category

        holders = self.fetch_top_holders(target_condition_id)
        
        if not holders:
            logger.error("No holders discovered. Pipeline terminated.")
            return []
            
        qualified_insiders = []
        
        for idx, wallet in enumerate(holders):
            logger.info(f"Processing wallet [{idx+1}/{len(holders)}]: {wallet}")
            try:
                insider_profile = self.analyze_wallet(wallet, target_condition_id, target_category)
                if insider_profile:
                    logger.info(f"[!] MATCH DETECTED: {wallet} qualified as an Insider!")
                    qualified_insiders.append(insider_profile)
            except Exception as e:
                logger.error(f"Error analyzing wallet {wallet}: {e}")
                
        # Save to local cache
        self.save_scan_cache(target_condition_id, qualified_insiders, target_category)
                
        return qualified_insiders
