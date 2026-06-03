import React, { useState, useEffect } from 'react';

function App() {
  const [customMarketInput, setCustomMarketInput] = useState('');
  const [isResolving, setIsResolving] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [insiders, setInsiders] = useState([]);
  const [hasScanned, setHasScanned] = useState(false);
  const [targetCategory, setTargetCategory] = useState('politics');
  const [bypassCache, setBypassCache] = useState(false);
  const [selectedWalletForTrades, setSelectedWalletForTrades] = useState(null);
  const [walletTrades, setWalletTrades] = useState([]);
  const [newTrades, setNewTrades] = useState([]);
  const [isLoadingTrades, setIsLoadingTrades] = useState(false);
  const [showTradesModal, setShowTradesModal] = useState(false);
  const [activeTab, setActiveTab] = useState('scan');
  const [bookmarks, setBookmarks] = useState([]);

  useEffect(() => {
    fetchBookmarks();
  }, []);

  const fetchBookmarks = async () => {
    try {
      const response = await fetch('http://127.0.0.1:8000/api/bookmarks');
      if (response.ok) {
        const data = await response.json();
        setBookmarks(data || []);
      }
    } catch (err) {
      console.error("Error loading bookmarks:", err);
    }
  };

  const handleToggleBookmark = async (insider) => {
    const isBookmarked = bookmarks.some(b => b.wallet.toLowerCase() === insider.wallet.toLowerCase());
    try {
      let response;
      if (isBookmarked) {
        response = await fetch(`http://127.0.0.1:8000/api/bookmarks/${insider.wallet}`, {
          method: 'DELETE'
        });
      } else {
        response = await fetch('http://127.0.0.1:8000/api/bookmarks', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(insider)
        });
      }
      
      if (response.ok) {
        const updated = await response.json();
        setBookmarks(updated || []);
      } else {
        alert("Failed to update bookmark.");
      }
    } catch (err) {
      alert("Error bookmarking: " + err.message);
    }
  };

  // Active markets available for selection (Prepopulated with geopolitical presets)
  const [activeMarkets, setActiveMarkets] = useState([
    {
      condition_id: "0x9769f78cbc95a5ed11895e6064bac471d8fd8f930b260cf581b68d3f58630d27",
      title: "US x Iran Peace Deal (by December 31, 2026)"
    },
    {
      condition_id: "0x6114a8a3f9ac214f48a7e20d169f1c7a5c84082cb6f7058ed9fe1137b11fd0e7",
      title: "US x Iran Peace Deal (by June 30, 2026)"
    },
    {
      condition_id: "0x20af55ab35186377b81219db6cb8615240cba42cea41731091be9484a5f5b122",
      title: "US x Iran Peace Deal (by July 31, 2026)"
    },
    {
      condition_id: "0xda519921a7090298cbdc56ee838a403a5193c2b3f637aef3e154e52de7b5e79c",
      title: "US x Iran Peace Deal (by August 31, 2026)"
    },
    {
      condition_id: "0xbb57ccf5853a85487bc3d83d04d669310d28c6c810758953b9d9b91d1aee89d2",
      title: "Will Bitcoin hit $1m before GTA VI?"
    },
    {
      condition_id: "0x84f8b70331323c2fba97d7ceaa9a35fb645a0770d0dbff169d07f24f376766e9",
      title: "Trump out as President before GTA VI?"
    }
  ]);

  // Selected markets for scan
  const [selectedMarketIds, setSelectedMarketIds] = useState([
    "0x9769f78cbc95a5ed11895e6064bac471d8fd8f930b260cf581b68d3f58630d27"
  ]);

  // Individual market scanning statuses for progress tracking
  const [scanStatuses, setScanStatuses] = useState({});

  const steps = [
    "Contacting Polymarket Data endpoints...",
    "Retrieving unique holder registers...",
    "Querying deep portfolio positions...",
    "Computing on-chain copy-trading suitability scores..."
  ];

  // Rotate steps during scan
  useEffect(() => {
    let interval;
    if (isScanning) {
      interval = setInterval(() => {
        setActiveStep((prev) => (prev + 1) % steps.length);
      }, 2500);
    } else {
      setActiveStep(0);
    }
    return () => clearInterval(interval);
  }, [isScanning]);

  const handleResolveMarket = async () => {
    if (!customMarketInput.trim()) {
      alert("Please enter a Polymarket URL, slug, or search phrase.");
      return;
    }
    setIsResolving(true);
    try {
      const response = await fetch(`http://127.0.0.1:8000/api/resolve?query=${encodeURIComponent(customMarketInput.trim())}`);
      if (!response.ok) {
        throw new Error("Resolution failed. Make sure the market is active on Polymarket.");
      }
      const data = await response.json();
      if (data.status === "success" && data.markets) {
        setActiveMarkets(prev => {
          const existingIds = new Set(prev.map(m => m.condition_id));
          const newMarkets = data.markets.filter(m => !existingIds.has(m.condition_id));
          return [...prev, ...newMarkets];
        });
        
        // Auto-select newly resolved contracts
        setSelectedMarketIds(prev => {
          const next = [...prev];
          data.markets.forEach(m => {
            if (!next.includes(m.condition_id)) next.push(m.condition_id);
          });
          return next;
        });

        alert(`Successfully added ${data.markets.length} resolved contract(s) under: "${data.event_title || 'Event'}"`);
        setCustomMarketInput("");
      }
    } catch (err) {
      alert("Error resolving market: " + err.message);
    } finally {
      setIsResolving(false);
    }
  };

  const handleToggleSelectMarket = (id) => {
    setSelectedMarketIds(prev => 
      prev.includes(id) ? prev.filter(mid => mid !== id) : [...prev, id]
    );
  };

  const handleSelectAllMarkets = () => {
    if (selectedMarketIds.length === activeMarkets.length) {
      setSelectedMarketIds([]);
    } else {
      setSelectedMarketIds(activeMarkets.map(m => m.condition_id));
    }
  };

  const handleDeleteMarket = (id, e) => {
    e.stopPropagation();
    setActiveMarkets(prev => prev.filter(m => m.condition_id !== id));
    setSelectedMarketIds(prev => prev.filter(mid => mid !== id));
  };

  const formatTradeTimestamp = (ts) => {
    if (!ts) return 'Unknown Time';
    if (isNaN(ts)) {
      return new Date(ts).toLocaleString();
    }
    return new Date(parseFloat(ts) * 1000).toLocaleString();
  };

  const handleViewTrades = async (walletAddress) => {
    setIsLoadingTrades(true);
    setSelectedWalletForTrades(walletAddress);
    setShowTradesModal(true);
    try {
      const response = await fetch(`http://127.0.0.1:8000/api/wallet/trades?wallet=${walletAddress}`);
      if (!response.ok) {
        throw new Error("Failed to fetch wallet trades.");
      }
      const data = await response.json();
      setWalletTrades(data.all_trades || []);
      setNewTrades(data.new_trades || []);
    } catch (err) {
      alert("Error loading trades: " + err.message);
    } finally {
      setIsLoadingTrades(false);
    }
  };

  const triggerMultiScan = async () => {
    if (selectedMarketIds.length === 0) {
      alert("Please select at least one active market to scan.");
      return;
    }

    setIsScanning(true);
    setHasScanned(false);
    setInsiders([]);
    
    // Set individual scan statuses
    const initialStatuses = {};
    selectedMarketIds.forEach(id => {
      initialStatuses[id] = 'scanning';
    });
    setScanStatuses(initialStatuses);

    try {
      const scanPromises = selectedMarketIds.map(async (id) => {
        try {
          const response = await fetch(`http://127.0.0.1:8000/api/scan?condition_id=${id}&bypass_cache=${bypassCache}`);
          if (!response.ok) {
            throw new Error(`Failed scanning condition ID: ${id}`);
          }
          const data = await response.json();
          setScanStatuses(prev => ({ ...prev, [id]: 'success' }));
          if (data.target_category) {
            setTargetCategory(data.target_category);
          }
          return data.insiders || [];
        } catch (err) {
          setScanStatuses(prev => ({ ...prev, [id]: 'failed' }));
          return [];
        }
      });

      const allResults = await Promise.all(scanPromises);
      
      // Merge results by wallet address
      const mergedMap = new Map();
      allResults.forEach((walletList) => {
        walletList.forEach((wallet) => {
          const address = wallet.wallet.toLowerCase();
          if (mergedMap.has(address)) {
            const existing = mergedMap.get(address);
            // Sum target conviction
            existing.target_conviction = parseFloat(existing.target_conviction) + parseFloat(wallet.target_conviction);
            // Combine outcomes
            if (!existing.target_outcome.includes(wallet.target_outcome)) {
              existing.target_outcome += `, ${wallet.target_outcome}`;
            }
            // Keep the maximum copy trade rating / score
            existing.copy_trade_score = Math.max(existing.copy_trade_score, wallet.copy_trade_score);
            // Keep largest portfolio net worth
            existing.total_portfolio_value = Math.max(existing.total_portfolio_value, wallet.total_portfolio_value);
            // Merge execution styles
            if (!existing.execution_style.includes(wallet.execution_style)) {
              existing.execution_style += ` / ${wallet.execution_style}`;
            }
            mergedMap.set(address, existing);
          } else {
            mergedMap.set(address, { ...wallet });
          }
        });
      });

      const mergedList = Array.from(mergedMap.values());
      // Sort by Copy-Trade score descending
      mergedList.sort((a, b) => b.copy_trade_score - a.copy_trade_score);
      setInsiders(mergedList);

    } catch (err) {
      alert("Error executing pipeline scan: " + err.message);
    } finally {
      setIsScanning(false);
      setHasScanned(true);
    }
  };

  const getRatingClass = (score) => {
    if (score >= 85) return 'rating-excellent';
    if (score >= 70) return 'rating-good';
    if (score >= 50) return 'rating-caution';
    return 'rating-avoid';
  };

  const renderInsidersGrid = (list, emptyMessage) => {
    return (
      <div className="cards-grid">
        {list.length > 0 ? (
          list.map((insider, idx) => {
            let initials = "W";
            if (insider.pseudonym) {
              initials = insider.pseudonym.substring(0, 2).toUpperCase();
            } else if (insider.name) {
              initials = insider.name.substring(0, 2).toUpperCase();
            } else if (insider.wallet) {
              initials = insider.wallet.substring(2, 4).toUpperCase();
            }

            const displayName = insider.pseudonym || insider.name || "Anonymous Trader";
            const bioText = insider.bio || "No platform description set.";
            const formattedAddress = insider.wallet.substring(0, 6) + "..." + insider.wallet.substring(insider.wallet.length - 4);
            const isBookmarked = bookmarks.some(b => b.wallet.toLowerCase() === insider.wallet.toLowerCase());

            return (
              <div className="insider-card" key={idx}>
                <div className="card-header">
                  {insider.profile_image ? (
                    <img className="avatar" src={insider.profile_image} alt="Profile avatar" />
                  ) : (
                    <div className="avatar">{initials}</div>
                  )}
                  <div className="user-details">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <div className="display-name" title={displayName}>{displayName}</div>
                      <button 
                        onClick={() => handleToggleBookmark(insider)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          fontSize: '1.25rem',
                          cursor: 'pointer',
                          color: isBookmarked ? '#fbbf24' : 'rgba(255, 255, 255, 0.2)',
                          padding: '0.1rem 0.25rem',
                          lineHeight: 1,
                          boxShadow: 'none',
                          minWidth: 'auto'
                        }}
                        title={isBookmarked ? "Remove Bookmark" : "Bookmark Trader"}
                      >
                        ★
                      </button>
                    </div>
                    <div className="pseudonym-tag">
                      <span className="address-hash">{formattedAddress}</span>
                    </div>
                  </div>
                  <div className={`rating-badge ${getRatingClass(insider.copy_trade_score)}`}>
                    <span className="rating-score">{insider.copy_trade_score.toFixed(0)}</span>
                    <span className="rating-label">{insider.copy_trade_rating.replace(/ \(.+\)/, "")}</span>
                  </div>
                </div>
                
                <div className="bio-section">
                  "{bioText}"
                </div>

                <div className="metrics-grid">
                  <div className="metric-item">
                    <span className="metric-label">Aggregated Exposure</span>
                    <span className="metric-value emerald">
                      ${parseFloat(insider.target_conviction).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                    </span>
                  </div>
                  
                  <div className="metric-item">
                    <span className="metric-label">{targetCategory === 'weather' ? 'Weather Focus' : 'Politics Focus'}</span>
                    <span className="metric-value indigo">
                      {(parseFloat(insider.domain_score) * 100).toFixed(1)}%
                    </span>
                  </div>

                  <div className="metric-item">
                    <span className="metric-label">Net Profit (PnL)</span>
                    <span className="metric-value emerald">
                      +${parseFloat(insider.net_pnl).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                    </span>
                  </div>

                  <div className="metric-item">
                    <span className="metric-label">Win Rate</span>
                    <span className="metric-value violet">
                      {(parseFloat(insider.win_rate) * 100).toFixed(1)}%
                    </span>
                  </div>

                  <div className="metric-item">
                    <span className="metric-label">Total Trades</span>
                    <span className="metric-value amber">
                      {insider.total_trades}
                    </span>
                  </div>

                  <div className="metric-item">
                    <span className="metric-label">Avg Trade Size</span>
                    <span className="metric-value blue">
                      ${parseFloat(insider.avg_trade_size).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                    </span>
                  </div>

                  <div className="metric-item" style={{ gridColumn: 'span 2', borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '0.5rem', marginTop: '0.25rem' }}>
                    <span className="metric-label">Total Portfolio Net Worth</span>
                    <span className="metric-value platinum">
                      ${parseFloat(insider.total_portfolio_value).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                    </span>
                  </div>
                </div>

                <div className="badges-row">
                  <span className="badge specialist">{targetCategory === 'weather' ? 'Weather Specialist' : 'Political Specialist'}</span>
                  <span className="badge execution">{insider.execution_style}</span>
                  <span className="badge outcome">Outcomes: {insider.target_outcome}</span>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                  <a className="profile-btn" href={insider.profile_url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, margin: 0, textAlign: 'center' }}>
                    Polymarket Profile
                  </a>
                  <button 
                    className="profile-btn" 
                    onClick={() => handleViewTrades(insider.wallet)}
                    style={{ 
                      flex: 1, 
                      margin: 0, 
                      background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(139, 92, 246, 0.2) 100%)', 
                      border: '1px solid rgba(139, 92, 246, 0.3)',
                      boxShadow: 'none'
                    }}
                  >
                    Inspect Trades
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
            {emptyMessage}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="container">
      <header style={{ marginBottom: '1.5rem' }}>
        <h1>Polymarket Insider Tracker</h1>
        <p>Discover domain specialists and qualified on-chain insider portfolios with advanced algorithmic filters.</p>
      </header>

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.5rem' }}>
        <button 
          onClick={() => setActiveTab('scan')}
          style={{
            background: 'transparent',
            boxShadow: 'none',
            border: 'none',
            borderBottom: activeTab === 'scan' ? '2px solid var(--color-indigo)' : '2px solid transparent',
            color: activeTab === 'scan' ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontWeight: 600,
            borderRadius: 0,
            padding: '0.5rem 1rem',
            cursor: 'pointer'
          }}
        >
          🔍 Market Scanner
        </button>
        <button 
          onClick={() => { setActiveTab('saved'); fetchBookmarks(); }}
          style={{
            background: 'transparent',
            boxShadow: 'none',
            border: 'none',
            borderBottom: activeTab === 'saved' ? '2px solid var(--color-indigo)' : '2px solid transparent',
            color: activeTab === 'saved' ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontWeight: 600,
            borderRadius: 0,
            padding: '0.5rem 1rem',
            cursor: 'pointer'
          }}
        >
          ⭐ Saved Traders ({bookmarks.length})
        </button>
      </div>

      {/* Dynamic Copy-Paste Resolver Panel & Checklist (Scanner View Only) */}
      {activeTab === 'scan' && (
        <>
          {/* Dynamic Copy-Paste Resolver Panel */}
          <div className="controls-panel">
            <div className="input-group">
              <label htmlFor="customMarketInput">Copy-Paste Market Name, Slug, or Polymarket URL</label>
              <div className="input-wrapper">
                <input 
                  type="text" 
                  id="customMarketInput" 
                  placeholder="e.g. https://polymarket.com/event/us-x-iran-permanent-peace-deal-by" 
                  value={customMarketInput}
                  onChange={(e) => setCustomMarketInput(e.target.value)}
                  disabled={isResolving || isScanning}
                />
                <button 
                  id="resolveBtn" 
                  onClick={handleResolveMarket} 
                  disabled={isResolving || isScanning}
                  style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)' }}
                >
                  {isResolving ? "Resolving..." : "Add to Active Markets"}
                </button>
              </div>
            </div>
          </div>

          {/* Active Markets Checklist Section */}
          <div className="controls-panel" style={{ marginTop: '-1.5rem' }}>
            <div className="section-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <label style={{ margin: 0 }}>Active Markets for Analysis ({activeMarkets.length})</label>
              <button 
                onClick={handleSelectAllMarkets} 
                disabled={isScanning}
                style={{ padding: '0.4rem 1rem', fontSize: '0.8rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: 'none' }}
              >
                {selectedMarketIds.length === activeMarkets.length ? "Deselect All" : "Select All"}
              </button>
            </div>

            <div className="markets-checklist" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '250px', overflowY: 'auto', paddingRight: '0.5rem' }}>
              {activeMarkets.map((market) => {
                const isSelected = selectedMarketIds.includes(market.condition_id);
                const status = scanStatuses[market.condition_id];
                
                return (
                  <div 
                    key={market.condition_id} 
                    onClick={() => !isScanning && handleToggleSelectMarket(market.condition_id)}
                    className={`market-item-row ${isSelected ? 'selected' : ''}`}
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '1rem', 
                      background: isSelected ? 'rgba(99, 102, 241, 0.08)' : 'rgba(15, 17, 26, 0.4)', 
                      border: isSelected ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid rgba(255, 255, 255, 0.04)',
                      borderRadius: '10px',
                      padding: '0.75rem 1rem',
                      cursor: isScanning ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <input 
                      type="checkbox" 
                      checked={isSelected}
                      onChange={() => {}} // Handled by div onClick
                      disabled={isScanning}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem', color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                        {market.title}
                      </div>
                      <div style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: 'rgba(255,255,255,0.25)', marginTop: '2px' }}>
                        ID: {market.condition_id}
                      </div>
                    </div>

                    {isScanning && status === 'scanning' && (
                      <div className="spinner" style={{ width: '16px', height: '16px', borderTopColor: 'var(--color-indigo)' }}></div>
                    )}
                    {status === 'success' && (
                      <span style={{ color: 'var(--color-emerald)', fontSize: '0.8rem', fontWeight: 600 }}>✓ Scanned</span>
                    )}
                    {status === 'failed' && (
                      <span style={{ color: 'red', fontSize: '0.8rem', fontWeight: 600 }}>✕ Failed</span>
                    )}

                    <button 
                      onClick={(e) => handleDeleteMarket(market.condition_id, e)} 
                      disabled={isScanning}
                      style={{ 
                        background: 'transparent', 
                        boxShadow: 'none', 
                        padding: '0.25rem', 
                        color: 'rgba(255,255,255,0.2)',
                        fontSize: '1rem',
                        border: 'none',
                        minWidth: 'auto'
                      }}
                      onMouseEnter={(e) => e.target.style.color = '#f87171'}
                      onMouseLeave={(e) => e.target.style.color = 'rgba(255,255,255,0.2)'}
                    >
                      🗑
                    </button>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1rem' }}>
              <input 
                type="checkbox" 
                id="bypassCacheCheckbox" 
                checked={bypassCache} 
                onChange={(e) => setBypassCache(e.target.checked)}
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
              <label htmlFor="bypassCacheCheckbox" style={{ fontSize: '0.85rem', cursor: 'pointer', userSelect: 'none', color: 'var(--text-secondary)' }}>
                Force Refresh (Bypass local cache)
              </label>
            </div>

            <button 
              id="scanBtn" 
              onClick={triggerMultiScan} 
              disabled={isScanning || selectedMarketIds.length === 0}
              style={{ width: '100%', marginTop: '0.75rem', padding: '1rem' }}
            >
              {isScanning ? "Scanning Selected Markets in Parallel..." : `Scan ${selectedMarketIds.length} Selected Markets`}
            </button>
          </div>
        </>
      )}

      {/* Scanning / Loading Section */}
      {isScanning && (
        <div className="loading-container">
          <div className="spinner"></div>
          <div className="loading-steps">
            {steps.map((step, idx) => (
              <span key={idx} className={idx === activeStep ? 'step-active' : ''}>
                {step}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Results / Cards Section based on tab selection */}
      {activeTab === 'scan' ? (
        <>
          {hasScanned && !isScanning && (
            <div className="results-section">
              <div className="section-title">
                Discovered Positive-PnL Insiders
                <span className="badge-count">{insiders.length}</span>
              </div>
              {renderInsidersGrid(
                insiders,
                `No wallets in this market successfully cleared the MM threshold, domain specialist criteria (>75%), and conviction limits (${targetCategory === 'weather' ? '>= $1k' : '>= $5k'}) with positive PnL.`
              )}
            </div>
          )}
        </>
      ) : (
        <div className="results-section">
          <div className="section-title">
            Bookmarked Insider Portfolios
            <span className="badge-count">{bookmarks.length}</span>
          </div>
          {renderInsidersGrid(
            bookmarks,
            "No bookmarked traders yet. Save discovered insiders from the scanner tab to keep track of them here."
          )}
        </div>
      )}
      {/* Trades Inspect Modal */}
      {showTradesModal && (
        <div className="modal-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
          padding: '2rem'
        }}>
          <div className="modal-content" style={{
            background: '#0c0f17',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '850px',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.4)'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '1.5rem',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#fff' }}>Forensic Trade Ledger</h3>
                <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>
                  Wallet: {selectedWalletForTrades}
                </span>
              </div>
              <button 
                onClick={() => setShowTradesModal(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'rgba(255, 255, 255, 0.4)',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  padding: '0.5rem',
                  lineHeight: 1
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
              {isLoadingTrades ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem' }}>
                  <div className="spinner"></div>
                  <span style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>Querying on-chain logs...</span>
                </div>
              ) : (
                <>
                  {/* Alert Banner for New Trades */}
                  {newTrades.length > 0 ? (
                    <div style={{
                      background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(4, 120, 87, 0.15) 100%)',
                      border: '1px solid rgba(16, 185, 129, 0.4)',
                      borderRadius: '8px',
                      padding: '1rem',
                      marginBottom: '1.5rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span style={{ fontSize: '1.5rem' }}>🔔</span>
                        <div>
                          <div style={{ fontWeight: 600, color: '#10b981' }}>New Activity Detected!</div>
                          <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)' }}>
                            Discovered {newTrades.length} new trades since your last check of this wallet.
                          </div>
                        </div>
                      </div>
                      <span className="badge specialist" style={{ background: '#10b981', color: '#000', fontWeight: 'bold' }}>
                        +{newTrades.length} NEW
                      </span>
                    </div>
                  ) : (
                    <div style={{
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid rgba(255, 255, 255, 0.05)',
                      borderRadius: '8px',
                      padding: '0.75rem 1rem',
                      marginBottom: '1.5rem',
                      fontSize: '0.85rem',
                      color: 'rgba(255, 255, 255, 0.45)'
                    }}>
                      ℹ️ Trade ledger sync complete. No new trades detected since last check.
                    </div>
                  )}

                  {/* Trades List */}
                  {walletTrades.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '3rem', color: 'rgba(255, 255, 255, 0.3)' }}>
                      No trade events returned from indexers.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {walletTrades.map((trade, idx) => {
                        const isNew = newTrades.some(nt => (nt.id === trade.id) || 
                          (nt.transactionHash === trade.transactionHash && nt.timestamp === trade.timestamp));
                        const dateStr = formatTradeTimestamp(trade.timestamp);
                        const isBuy = String(trade.side).toUpperCase() === 'BUY';
                        
                        return (
                          <div key={idx} style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.5rem',
                            background: isNew ? 'rgba(16, 185, 129, 0.05)' : 'rgba(255, 255, 255, 0.02)',
                            border: isNew ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(255, 255, 255, 0.04)',
                            borderRadius: '10px',
                            padding: '1rem',
                            transition: 'all 0.2s ease'
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <span style={{
                                  padding: '0.25rem 0.6rem',
                                  borderRadius: '6px',
                                  fontSize: '0.75rem',
                                  fontWeight: 'bold',
                                  background: isBuy ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                  color: isBuy ? '#10b981' : '#f87171',
                                  border: isBuy ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)'
                                }}>
                                  {isBuy ? 'BUY' : 'SELL'}
                                </span>
                                <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                                  Outcome {trade.outcomeIndex !== undefined ? trade.outcomeIndex : 'Index: ' + trade.outcomeIndex}
                                </span>
                                {isNew && (
                                  <span style={{
                                    fontSize: '0.65rem',
                                    background: '#10b981',
                                    color: '#000',
                                    fontWeight: 'bold',
                                    padding: '0.1rem 0.4rem',
                                    borderRadius: '4px'
                                  }}>NEW</span>
                                )}
                              </div>
                              <span style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.3)' }}>
                                {dateStr}
                              </span>
                            </div>

                            <div style={{
                              display: 'grid',
                              gridTemplateColumns: 'repeat(4, 1fr)',
                              gap: '0.5rem',
                              marginTop: '0.25rem',
                              fontSize: '0.8rem',
                              color: 'rgba(255, 255, 255, 0.6)'
                            }}>
                              <div>
                                <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>Size</div>
                                <div style={{ color: '#fff', fontWeight: 500 }}>{parseFloat(trade.size).toLocaleString()}</div>
                              </div>
                              <div>
                                <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>Avg Price</div>
                                <div style={{ color: '#fff', fontWeight: 500 }}>${parseFloat(trade.price).toFixed(3)}</div>
                              </div>
                              <div>
                                <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>Total Value</div>
                                <div style={{ color: '#fff', fontWeight: 500 }}>${(parseFloat(trade.size) * parseFloat(trade.price)).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                              </div>
                              <div>
                                <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>Tx Link</div>
                                {trade.transactionHash ? (
                                  <a href={`https://polygonscan.com/tx/${trade.transactionHash}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-indigo)', textDecoration: 'none' }}>
                                    Polygonscan ↗
                                  </a>
                                ) : (
                                  <span>N/A</span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '1rem 1.5rem',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              justifyContent: 'flex-end',
              background: 'rgba(255, 255, 255, 0.01)'
            }}>
              <button 
                onClick={() => setShowTradesModal(false)}
                style={{
                  padding: '0.5rem 1.5rem',
                  fontSize: '0.85rem',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#fff',
                  boxShadow: 'none'
                }}
              >
                Close Ledger
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
