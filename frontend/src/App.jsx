import React, { useState, useEffect } from 'react';

function App() {
  const [conditionId, setConditionId] = useState('0xbb57ccf5853a85487bc3d83d04d669310d28c6c810758953b9d9b91d1aee89d2');
  const [isScanning, setIsScanning] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [insiders, setInsiders] = useState([]);
  const [hasScanned, setHasScanned] = useState(false);

  const steps = [
    "Connecting to Polymarket Data REST API...",
    "Pulling top asset holder tables (Identification Phase)",
    "Querying portfolios & categorizing events (Forensic Phase)",
    "Evaluating buy/sell liquidity behaviors (Verification Phase)"
  ];

  // Rotate steps during scan
  useEffect(() => {
    let interval;
    if (isScanning) {
      interval = setInterval(() => {
        setActiveStep((prev) => (prev + 1) % steps.length);
      }, 3000);
    } else {
      setActiveStep(0);
    }
    return () => clearInterval(interval);
  }, [isScanning]);

  const triggerScan = async () => {
    if (!conditionId.trim()) {
      alert("Please enter a valid condition ID.");
      return;
    }

    setIsScanning(true);
    setHasScanned(false);
    setInsiders([]);

    try {
      const response = await fetch(`http://127.0.0.1:8000/api/scan?condition_id=${conditionId.trim()}`);
      if (!response.ok) {
        throw new Error(`Pipeline error: HTTP status ${response.status}`);
      }
      const data = await response.json();
      if (data.status === "success" && data.insiders) {
        setInsiders(data.insiders);
      }
    } catch (err) {
      alert("Error executing discovery pipeline:\n" + err.message);
    } finally {
      setIsScanning(false);
      setHasScanned(true);
    }
  };

  return (
    <div className="container">
      {/* Dashboard Header */}
      <header>
        <h1>Polymarket Insider Tracker</h1>
        <p>Discover domain specialists and qualified on-chain insider portfolios with advanced algorithmic filters.</p>
      </header>

      {/* Controls Panel */}
      <div className="controls-panel">
        <div className="input-group">
          <label htmlFor="conditionIdInput">Market Condition ID</label>
          <div className="input-wrapper">
            <input 
              type="text" 
              id="conditionIdInput" 
              placeholder="Enter market condition ID hex (0x...)" 
              value={conditionId}
              onChange={(e) => setConditionId(e.target.value)}
              disabled={isScanning}
            />
            <button id="scanBtn" onClick={triggerScan} disabled={isScanning}>
              {isScanning ? "Scanning..." : "Scan Market"}
            </button>
          </div>
        </div>
      </div>

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

      {/* Results / Cards Section */}
      {hasScanned && !isScanning && (
        <div className="results-section">
          <div className="section-title">
            Qualified Insiders 
            <span className="badge-count">{insiders.length}</span>
          </div>
          
          <div className="cards-grid">
            {insiders.length > 0 ? (
              insiders.map((insider, idx) => {
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

                return (
                  <div className="insider-card" key={idx}>
                    <div className="card-header">
                      {insider.profile_image ? (
                        <img className="avatar" src={insider.profile_image} alt="Profile avatar" />
                      ) : (
                        <div className="avatar">{initials}</div>
                      )}
                      <div className="user-details">
                        <div className="display-name" title={displayName}>{displayName}</div>
                        <div className="pseudonym-tag">
                          <span className="address-hash">{formattedAddress}</span>
                        </div>
                      </div>
                    </div>
                    <div className="bio-section">
                      "{bioText}"
                    </div>
                    <div className="metrics-grid">
                      <div className="metric-item">
                        <span class="metric-label">Exposure</span>
                        <span className="metric-value emerald">
                          ${parseFloat(insider.target_conviction).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                        </span>
                      </div>
                      <div className="metric-item">
                        <span class="metric-label">Domain Allocation</span>
                        <span className="metric-value indigo">
                          {(parseFloat(insider.domain_score) * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    <div className="badges-row">
                      <span className="badge specialist">Political Specialist</span>
                      <span className="badge execution">{insider.execution_style}</span>
                      <span className="badge outcome">Outcome: {insider.target_outcome}</span>
                    </div>
                    <a className="profile-btn" href={insider.profile_url} target="_blank" rel="noopener noreferrer">
                      View Polymarket Profile
                    </a>
                  </div>
                );
              })
            ) : (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                No wallets in this market successfully cleared the MM threshold, domain specialist criteria (&gt;75%), and conviction limits (&gt;= $5k).
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
