let dailyMAChart = null;
let weeklyMAChart = null;

// Format currency
function formatCurrency(value) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(value);
}

// Update gauge needle position based on Fear & Greed value
function updateGaugeNeedle(value) {
    // SVG arc: M 20 100 A 80 80 0 0 1 180 100
    // Upward semicircle with center at (100, 100) and radius 80
    // Value 0 (fear) = 180 degrees (left), Value 100 (greed) = 0 degrees (right)
    
    const cx = 100;  // center x
    const cy = 100;  // center y
    const radius = 80;  // arc radius
    
    // Map value 0-100 to angle 180-0 degrees
    const angleDegrees = 180 - (value / 100) * 180;
    const angleRadians = (angleDegrees * Math.PI / 180);
    
    // Calculate point on the arc (upward semicircle, so subtract sine)
    const x2 = cx + radius * Math.cos(angleRadians);
    const y2 = cy - radius * Math.sin(angleRadians);
    
    const needleLine = document.getElementById('gauge-needle-line');
    needleLine.setAttribute('x2', x2);
    needleLine.setAttribute('y2', y2);
}

// Calculate moving average
function calculateMA(prices, period) {
    if (prices.length < period) return null;
    const sum = prices.slice(-period).reduce((a, b) => a + b, 0);
    return sum / period;
}

// Find crossover dates
function findCrossovers(historicalData) {
    if (!historicalData || historicalData.length < 200) {
        return {
            daily: 'Insufficient data',
            weekly50: 'Insufficient data',
            weekly200: 'Insufficient data'
        };
    }

    const prices = historicalData.map(d => d.price);
    const dates = historicalData.map(d => d.date);
    
    let dailyCrossover = 'No crossover detected';
    let weekly50Crossover = 'No crossover detected';
    let weekly200Crossover = 'No crossover detected';

    // Find last 50/200 day MA crossover
    for (let i = prices.length - 1; i > 200; i--) {
        const ma50_prev = calculateMA(prices.slice(0, i - 1), 50);
        const ma200_prev = calculateMA(prices.slice(0, i - 1), 200);
        const ma50_curr = calculateMA(prices.slice(0, i), 50);
        const ma200_curr = calculateMA(prices.slice(0, i), 200);

        if (ma50_prev && ma200_prev && ma50_curr && ma200_curr) {
            const crossedAbove = ma50_prev < ma200_prev && ma50_curr > ma200_curr;
            const crossedBelow = ma50_prev > ma200_prev && ma50_curr < ma200_curr;
            
            if (crossedAbove || crossedBelow) {
                const direction = crossedAbove ? 'above' : 'below';
                dailyCrossover = `${direction.charAt(0).toUpperCase() + direction.slice(1)} on ${dates[i]}`;
                break;
            }
        }
    }

    return {
        daily: dailyCrossover,
        weekly50: weekly50Crossover,
        weekly200: weekly200Crossover
    };
}

// Generate signal explanation
function generateSignalExplanation(data) {
    const fgValue = data.fearGreedIndex.value;
    const rsiValue = parseFloat(data.rsi);
    
    let explanation = '';
    
    if (fgValue < 20 && rsiValue < 30) {
        explanation = '🟢 BUY conditions met: Fear & Greed < 20 AND RSI < 30';
    } else if (fgValue > 80 && rsiValue > 70) {
        explanation = '🔴 SELL conditions met: Fear & Greed > 80 AND RSI > 70';
    } else {
        explanation = `Waiting for trading signals:\n`;
        explanation += `• BUY: Fear & Greed < 20 (currently ${fgValue}) AND RSI < 30 (currently ${rsiValue.toFixed(2)})\n`;
        explanation += `• SELL: Fear & Greed > 80 (currently ${fgValue}) AND RSI > 70 (currently ${rsiValue.toFixed(2)})`;
    }
    
    return explanation;
}

// Update the UI with Bitcoin data
function updateUI(data) {
    const content = document.getElementById('content');
    const loading = document.getElementById('loading');
    const error = document.getElementById('error');

    // Hide loading state
    loading.style.display = 'none';
    error.style.display = 'none';

    // Update current price
    document.getElementById('current-price').textContent = formatCurrency(data.currentPrice);
    document.getElementById('last-update').textContent = new Date().toLocaleTimeString();

    // Update Fear & Greed Index
    const fgValue = data.fearGreedIndex.value;
    document.getElementById('fear-greed-value').textContent = fgValue;
    document.getElementById('fear-greed-classification').textContent = data.fearGreedIndex.classification;
    updateGaugeNeedle(fgValue);

    // Update technical indicators - use weekly MAs if available
    document.getElementById('rsi-value').textContent = data.rsi ? data.rsi : 'N/A';
    document.getElementById('ma50-value').textContent = data.ma50w ? formatCurrency(data.ma50w) : 'N/A';
    document.getElementById('ma200-value').textContent = data.ma200w ? formatCurrency(data.ma200w) : 'N/A';

    // Update trading signals
    const buySignalCard = document.getElementById('buy-signal-card');
    const sellSignalCard = document.getElementById('sell-signal-card');
    const noSignalCard = document.getElementById('no-signal-card');

    if (data.buySignal) {
        buySignalCard.style.display = 'block';
        sellSignalCard.style.display = 'none';
        noSignalCard.style.display = 'none';
        document.getElementById('buy-signal-time').textContent = new Date().toLocaleTimeString();
    } else if (data.sellSignal) {
        buySignalCard.style.display = 'none';
        sellSignalCard.style.display = 'block';
        noSignalCard.style.display = 'none';
        document.getElementById('sell-signal-time').textContent = new Date().toLocaleTimeString();
    } else {
        buySignalCard.style.display = 'none';
        sellSignalCard.style.display = 'none';
        noSignalCard.style.display = 'block';
        document.getElementById('no-signal-explanation').textContent = generateSignalExplanation(data);
    }

    // Update crossover tracking
    const crossovers = findCrossovers(data.historicalData);
    document.getElementById('crossover-daily-text').textContent = crossovers.daily;
    document.getElementById('crossover-weekly-50-text').textContent = crossovers.weekly50;
    document.getElementById('crossover-weekly-200-text').textContent = crossovers.weekly200;

    // Update charts
    updateDailyMAChart(data.historicalData);
    updateWeeklyMAChart(data.weeklyPrices);
    updateWeeklyPriceTable(data.weeklyPrices);

    // Show content
    content.style.display = 'block';
}

// Update the daily MA chart
function updateDailyMAChart(historicalData) {
    const ctx = document.getElementById('dailyMAChart');
    if (!ctx) return;

    const prices = historicalData.map(d => d.price);
    const dates = historicalData.map(d => d.date);
    
    const ma50 = [];
    const ma200 = [];
    
    for (let i = 0; i < prices.length; i++) {
        ma50.push(calculateMA(prices.slice(0, i + 1), 50));
        ma200.push(calculateMA(prices.slice(0, i + 1), 200));
    }

    if (dailyMAChart) {
        dailyMAChart.destroy();
    }

    dailyMAChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates,
            datasets: [
                {
                    label: 'Bitcoin Price (USD)',
                    data: prices,
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    yAxisID: 'y'
                },
                {
                    label: '50-Day MA',
                    data: ma50,
                    borderColor: '#4caf50',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    yAxisID: 'y'
                },
                {
                    label: '200-Day MA',
                    data: ma200,
                    borderColor: '#ff9800',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    yAxisID: 'y'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        color: '#333',
                        font: {
                            size: 12
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    ticks: {
                        callback: function(value) {
                            return '$' + value.toLocaleString('en-US', {
                                minimumFractionDigits: 0,
                                maximumFractionDigits: 0
                            });
                        },
                        color: '#666'
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                },
                x: {
                    ticks: {
                        color: '#666',
                        maxTicksLimit: 10
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                }
            }
        }
    });
}

// Update the weekly MA chart
function updateWeeklyMAChart(weeklyPrices) {
    const ctx = document.getElementById('weeklyMAChart');
    if (!ctx || !weeklyPrices || weeklyPrices.length === 0) return;

    const prices = weeklyPrices.map(d => d.price);
    const dates = weeklyPrices.map(d => d.date);
    
    const ma50w = [];
    const ma200w = [];
    
    // Calculate MAs for all weeks using rolling windows
    for (let i = 0; i < prices.length; i++) {
        // For 50-week MA: use last 50 weeks up to current week
        const ma50 = i < 49 ? null : calculateMA(prices.slice(i - 49, i + 1), 50);
        ma50w.push(ma50);
        
        // For 200-week MA: use last 200 weeks up to current week
        const ma200 = i < 199 ? null : calculateMA(prices.slice(i - 199, i + 1), 200);
        ma200w.push(ma200);
    }

    console.log('Weekly MA Debug:');
    console.log('Total weeks:', prices.length);
    console.log('Latest price:', prices[prices.length - 1]);
    console.log('Latest 50-week MA:', ma50w[ma50w.length - 1]);
    console.log('Latest 200-week MA:', ma200w[ma200w.length - 1]);

    if (weeklyMAChart) {
        weeklyMAChart.destroy();
    }

    weeklyMAChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates,
            datasets: [
                {
                    label: 'Bitcoin Price (USD)',
                    data: prices,
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    yAxisID: 'y'
                },
                {
                    label: '50-Week MA',
                    data: ma50w,
                    borderColor: '#4caf50',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    yAxisID: 'y'
                },
                {
                    label: '200-Week MA',
                    data: ma200w,
                    borderColor: '#ff0000',
                    backgroundColor: 'transparent',
                    borderWidth: 3,
                    fill: false,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    yAxisID: 'y'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        color: '#333',
                        font: {
                            size: 12
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    ticks: {
                        callback: function(value) {
                            return '$' + value.toLocaleString('en-US', {
                                minimumFractionDigits: 0,
                                maximumFractionDigits: 0
                            });
                        },
                        color: '#666'
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                },
                x: {
                    ticks: {
                        color: '#666',
                        maxTicksLimit: 10
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                }
            }
        }
    });
}

// Update the weekly price table
function updateWeeklyPriceTable(weeklyPrices) {
    const tbody = document.getElementById('weekly-table-body');
    if (!tbody || !weeklyPrices || weeklyPrices.length === 0) return;

    const prices = weeklyPrices.map(d => d.price);
    const dates = weeklyPrices.map(d => d.date);
    
    // Calculate MAs for all weeks
    const ma50w = [];
    const ma200w = [];
    
    for (let i = 0; i < prices.length; i++) {
        ma50w.push(calculateMA(prices.slice(0, i + 1), 50));
        ma200w.push(calculateMA(prices.slice(0, i + 1), 200));
    }

    // Clear existing rows
    tbody.innerHTML = '';

    // Show last 50 weeks in the table (most recent first)
    const startIdx = Math.max(0, weeklyPrices.length - 50);
    for (let i = weeklyPrices.length - 1; i >= startIdx; i--) {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${dates[i]}</td>
            <td>${formatCurrency(prices[i])}</td>
            <td>${ma50w[i] ? formatCurrency(ma50w[i]) : 'N/A'}</td>
            <td>${ma200w[i] ? formatCurrency(ma200w[i]) : 'N/A'}</td>
        `;
        tbody.appendChild(row);
    }
}

// Fetch Bitcoin data from the server
async function fetchBitcoinData() {
    try {
        const response = await fetch('/api/bitcoin-data');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        updateUI(data);
    } catch (error) {
        console.error('Error fetching Bitcoin data:', error);
        const errorDiv = document.getElementById('error');
        const errorMessage = document.getElementById('error-message');
        errorMessage.textContent = `Error: ${error.message}`;
        errorDiv.style.display = 'block';
        document.getElementById('loading').style.display = 'none';
    }
}

// Initial load
document.addEventListener('DOMContentLoaded', () => {
    fetchBitcoinData();
    
    // Refresh data every 5 minutes
    setInterval(fetchBitcoinData, 5 * 60 * 1000);
});


// GitHub Push Functionality
function setupGitHubPush() {
    const pushButton = document.getElementById('push-button');
    const tokenInput = document.getElementById('github-token');
    const statusDiv = document.getElementById('push-status');
    
    if (!pushButton) return;
    
    pushButton.addEventListener('click', async () => {
        const token = tokenInput.value.trim();
        
        if (!token) {
            statusDiv.textContent = '❌ Please paste your GitHub token';
            statusDiv.style.color = 'red';
            return;
        }
        
        pushButton.disabled = true;
        pushButton.textContent = 'Pushing...';
        statusDiv.textContent = 'Pushing to GitHub...';
        statusDiv.style.color = '#667eea';
        
        try {
            const response = await fetch('/api/push-to-github', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ token })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                statusDiv.textContent = '✅ Successfully pushed to GitHub!';
                statusDiv.style.color = 'green';
                tokenInput.value = '';
                setTimeout(() => {
                    statusDiv.textContent = '';
                }, 5000);
            } else {
                statusDiv.textContent = `❌ Error: ${data.error}`;
                statusDiv.style.color = 'red';
            }
        } catch (error) {
            statusDiv.textContent = `❌ Error: ${error.message}`;
            statusDiv.style.color = 'red';
        } finally {
            pushButton.disabled = false;
            pushButton.textContent = 'Push to GitHub';
        }
    });
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    fetchBitcoinData();
    setupGitHubPush();
    
    // Show admin section if user is admin (check URL parameter)
    const params = new URLSearchParams(window.location.search);
    if (params.get('admin') === 'true') {
        const adminSection = document.getElementById('admin-section');
        if (adminSection) {
            adminSection.style.display = 'block';
        }
    }
    
    // Refresh data every 5 minutes
    setInterval(fetchBitcoinData, 5 * 60 * 1000);
});
