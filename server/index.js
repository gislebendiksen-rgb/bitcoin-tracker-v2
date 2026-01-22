const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const LCW_API_KEY = '29a62b87-7b2b-4328-9f65-41c394f5603a'; // Live Coin Watch API Key

// Path to store weekly prices
const WEEKLY_PRICES_FILE = path.join(__dirname, '../data/weekly_prices.json');

// Ensure data directory exists
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Push to GitHub endpoint
app.post('/api/push-to-github', (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    const repoUrl = `https://${token}@github.com/gislebendiksen-rgb/bitcoin-tracker.git`;
    
    execSync(`cd /home/ubuntu/bitcoin-tracker && git push ${repoUrl} main`, {
      stdio: 'pipe',
      timeout: 30000
    });

    res.json({ success: true, message: 'Successfully pushed to GitHub!' });
  } catch (error) {
    console.error('Push error:', error.message);
    res.status(500).json({ 
      error: 'Failed to push to GitHub',
      details: error.message 
    });
  }
});

// Load weekly prices from file
function loadWeeklyPrices() {
  try {
    if (fs.existsSync(WEEKLY_PRICES_FILE)) {
      const data = fs.readFileSync(WEEKLY_PRICES_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading weekly prices:', error.message);
  }
  return [];
}

// Save weekly prices to file
function saveWeeklyPrices(weeklyPrices) {
  try {
    fs.writeFileSync(WEEKLY_PRICES_FILE, JSON.stringify(weeklyPrices, null, 2));
    console.log(`Saved ${weeklyPrices.length} weekly prices to file`);
  } catch (error) {
    console.error('Error saving weekly prices:', error.message);
  }
}

// Convert daily data to weekly data
function convertToWeeklyData(dailyData) {
  const weeklyData = [];
  let currentWeek = [];
  let weekStartDate = null;
  let lastWeekStart = null;

  for (let i = 0; i < dailyData.length; i++) {
    const date = new Date(dailyData[i].date);
    const dayOfWeek = date.getDay();

    // Calculate the start of the current week (Monday = 1)
    const currentDate = new Date(date);
    const daysToMonday = (dayOfWeek === 0) ? 6 : dayOfWeek - 1;
    const weekStart = new Date(currentDate);
    weekStart.setDate(currentDate.getDate() - daysToMonday);
    const weekStartStr = weekStart.toISOString().split('T')[0];

    // If we've moved to a new week, save the previous week's data
    if (lastWeekStart !== null && weekStartStr !== lastWeekStart) {
      if (currentWeek.length > 0) {
        const avgPrice = currentWeek.reduce((a, b) => a + b, 0) / currentWeek.length;
        weeklyData.push({
          date: weekStartDate,
          price: parseFloat(avgPrice.toFixed(2))
        });
      }
      currentWeek = [];
    }

    // Add current price to week
    if (currentWeek.length === 0) {
      weekStartDate = dailyData[i].date;
    }
    currentWeek.push(dailyData[i].price);
    lastWeekStart = weekStartStr;
  }

  // Don't forget the last week
  if (currentWeek.length > 0) {
    const avgPrice = currentWeek.reduce((a, b) => a + b, 0) / currentWeek.length;
    weeklyData.push({
      date: weekStartDate,
      price: parseFloat(avgPrice.toFixed(2))
    });
  }

  return weeklyData;
}

// Helper function to calculate RSI
function calculateRSI(prices, period = 14) {
  if (prices.length < period + 1) return null;

  let gains = 0;
  let losses = 0;

  // Calculate initial average gain and loss
  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) {
      gains += change;
    } else {
      losses += Math.abs(change);
    }
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  // Calculate RSI values
  const rsiValues = [];
  for (let i = period; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) {
      avgGain = (avgGain * (period - 1) + change) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.abs(change)) / period;
    }

    const rs = avgGain / avgLoss;
    const rsi = 100 - 100 / (1 + rs);
    rsiValues.push(rsi);
  }

  return rsiValues[rsiValues.length - 1];
}

// Helper function to calculate Moving Average
function calculateMovingAverage(prices, period) {
  if (prices.length < period) return null;
  const sum = prices.slice(-period).reduce((a, b) => a + b, 0);
  return sum / period;
}

// Fetch Bitcoin historical data from Kraken (free, no auth required)
async function getBitcoinHistoricalData() {
  try {
    console.log('Fetching Bitcoin historical data from Kraken...');

    const response = await axios.get(
      'https://api.kraken.com/0/public/OHLC',
      {
        params: {
          pair: 'XBTUSD',
          interval: 1440, // Daily
          since: 0 // Get all available data
        },
        timeout: 30000
      }
    );

    if (response.data.error && response.data.error.length > 0) {
      throw new Error(response.data.error[0]);
    }

    const ohlcData = response.data.result.XXBTZUSD;
    const prices = ohlcData.map(candle => ({
      date: new Date(candle[0] * 1000).toISOString().split('T')[0],
      price: parseFloat(candle[4]) // Close price
    }));

    console.log(`Fetched ${prices.length} historical data points`);
    return prices;
  } catch (error) {
    console.error('Error fetching Bitcoin historical data:', error.message);
    throw error;
  }
}

// Fetch current Bitcoin price from Live Coin Watch
async function getCurrentBitcoinPrice() {
  try {
    console.log('Fetching current Bitcoin price from Live Coin Watch...');

    const response = await axios.post(
      'https://api.livecoinwatch.com/coins/single',
      {
        currency: 'USD',
        code: 'BTC',
        meta: true
      },
      {
        headers: {
          'x-api-key': LCW_API_KEY,
          'content-type': 'application/json'
        },
        timeout: 10000
      }
    );

    const price = response.data.rate;
    console.log(`Current Bitcoin price: $${price.toFixed(2)}`);
    return price;
  } catch (error) {
    console.error('Error fetching current Bitcoin price:', error.message);
    throw error;
  }
}

// Fetch Fear & Greed Index
async function getFearGreedIndex() {
  try {
    console.log('Fetching Fear & Greed Index...');

    const response = await axios.get('https://api.alternative.me/fng/?limit=1', {
      timeout: 10000
    });

    const data = response.data.data[0];
    const result = {
      value: parseInt(data.value),
      classification: data.value_classification,
      timestamp: parseInt(data.timestamp)
    };

    console.log(`Fear & Greed Index: ${result.value} (${result.classification})`);
    return result;
  } catch (error) {
    console.error('Error fetching Fear & Greed Index:', error.message);
    throw error;
  }
}

// Initialize weekly prices from historical data if empty
async function initializeWeeklyPrices() {
  let weeklyPrices = loadWeeklyPrices();

  if (weeklyPrices.length === 0) {
    console.log('Weekly prices file is empty, initializing from historical data...');
    try {
      const historicalData = await getBitcoinHistoricalData();
      weeklyPrices = convertToWeeklyData(historicalData);
      saveWeeklyPrices(weeklyPrices);
      console.log(`Initialized with ${weeklyPrices.length} weeks of data`);
    } catch (error) {
      console.error('Failed to initialize weekly prices:', error.message);
    }
  }

  return weeklyPrices;
}

// Update weekly prices with latest data
function updateWeeklyPrices(weeklyPrices, dailyData) {
  if (dailyData.length === 0) return weeklyPrices;

  // Get the latest weekly data from daily data
  const latestWeeklyData = convertToWeeklyData(dailyData);

  if (latestWeeklyData.length === 0) return weeklyPrices;

  // Check if the latest week already exists
  const lastStoredWeek = weeklyPrices[weeklyPrices.length - 1];
  const latestWeek = latestWeeklyData[latestWeeklyData.length - 1];

  // If the latest week is new, add it
  if (!lastStoredWeek || lastStoredWeek.date !== latestWeek.date) {
    weeklyPrices.push(latestWeek);
    saveWeeklyPrices(weeklyPrices);
    console.log(`Added new week: ${latestWeek.date} at $${latestWeek.price}`);
  }

  return weeklyPrices;
}

// API endpoint to get all data
app.get('/api/bitcoin-data', async (req, res) => {
  try {
    console.log('=== Fetching Bitcoin data ===');

    // Load or initialize weekly prices
    let weeklyPrices = loadWeeklyPrices();
    if (weeklyPrices.length === 0) {
      weeklyPrices = await initializeWeeklyPrices();
    }

    // Fetch current data
    const [historicalData, currentPrice, fearGreedIndex] = await Promise.all([
      getBitcoinHistoricalData(),
      getCurrentBitcoinPrice(),
      getFearGreedIndex()
    ]);

    // Update weekly prices with latest data
    weeklyPrices = updateWeeklyPrices(weeklyPrices, historicalData);

    // Extract closing prices from weekly data for calculations
    const weeklyClosingPrices = weeklyPrices.map(d => d.price);
    const dailyClosingPrices = historicalData.map(d => d.price);

    // Calculate technical indicators from daily data
    const rsi = calculateRSI(dailyClosingPrices, 14);

    // Calculate moving averages from weekly data
    const ma50w = calculateMovingAverage(weeklyClosingPrices, 50);
    const ma200w = calculateMovingAverage(weeklyClosingPrices, 200);

    // Also calculate daily MAs for reference
    const ma50d = calculateMovingAverage(dailyClosingPrices, 50);
    const ma200d = calculateMovingAverage(dailyClosingPrices, 200);

    console.log(`RSI: ${rsi ? rsi.toFixed(2) : 'N/A'}`);
    console.log(`50-Week MA: ${ma50w ? ma50w.toFixed(2) : 'N/A'}`);
    console.log(`200-Week MA: ${ma200w ? ma200w.toFixed(2) : 'N/A'}`);
    console.log(`Weekly prices count: ${weeklyPrices.length}`);

    // Determine signals
    let buySignal = false;
    let sellSignal = false;

    if (fearGreedIndex.value < 20 && rsi < 30) {
      buySignal = true;
      console.log('🟢 BUY SIGNAL TRIGGERED!');
    }

    if (fearGreedIndex.value > 80 && rsi > 70) {
      sellSignal = true;
      console.log('🔴 SELL SIGNAL TRIGGERED!');
    }

    const responseData = {
      currentPrice,
      fearGreedIndex,
      rsi: rsi ? rsi.toFixed(2) : null,
      ma50w: ma50w ? ma50w.toFixed(2) : null,
      ma200w: ma200w ? ma200w.toFixed(2) : null,
      ma50d: ma50d ? ma50d.toFixed(2) : null,
      ma200d: ma200d ? ma200d.toFixed(2) : null,
      buySignal,
      sellSignal,
      historicalData: historicalData.slice(-365), // Last year for charting
      weeklyPrices: weeklyPrices // Include all weekly prices for frontend
    };

    console.log('Sending response...');
    res.json(responseData);
  } catch (error) {
    console.error('Error in /api/bitcoin-data:', error.message);
    res.status(500).json({ error: 'Failed to fetch Bitcoin data', details: error.message });
  }
});

// Health check endpoint
// Verification endpoint
app.get('/api/verify-ma', (req, res) => {
  try {
    const testData = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109];
    const ma = calculateMovingAverage(testData, 5);
    res.json({ success: true, test: ma });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Bitcoin Tracker server running on http://localhost:${PORT}`);
  console.log(`Visit http://localhost:${PORT} to see the website`);
});
