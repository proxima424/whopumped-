import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
  LineController
} from 'chart.js';
import annotationPlugin from 'chartjs-plugin-annotation';
import 'chartjs-adapter-date-fns';
import { GeckoTerminalAPI } from './api/geckoTerminal';
import './App.css';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  Title,
  Tooltip,
  Legend,
  TimeScale,
  annotationPlugin
);

function App() {
  const [tokenAddress, setTokenAddress] = useState('');
  const [selectedNetwork, setSelectedNetwork] = useState('ethereum');
  const [tweetUrl, setTweetUrl] = useState('');
  const [error, setError] = useState(null);
  const chartRef = useRef(null);
  const [chartData, setChartData] = useState(null);
  const geckoAPI = new GeckoTerminalAPI();
  const [tweetTimestamp, setTweetTimestamp] = useState(null);

  // Constants
  const BACKEND_URL = 'http://localhost:3001';
  const PRICE_HISTORY_DAYS = 90;
  const SECONDS_PER_DAY = 86400;
  const MAX_API_CALLS = 20;
  const RATE_LIMIT_DELAY = 2000;

  const networks = {
    ethereum: 'eth',
    base: 'base',
    solana: 'solana'
  };

  // Initialize chart when data changes
  useEffect(() => {
    if (!chartData || !chartRef.current) return;

    // Destroy existing chart
    const chart = ChartJS.getChart(chartRef.current);
    if (chart) {
      chart.destroy();
    }

    const ctx = chartRef.current.getContext('2d');
    const newChart = new ChartJS(ctx, {
      type: 'line',
      data: {
        datasets: [{
          label: 'Price (USD)',
          data: chartData,
          borderColor: '#00ff00',
          borderWidth: 1,
          pointRadius: (context) => {
            // Get the x value of this point
            const value = context.raw.x;
            // Check if this point is close to the tweet timestamp
            return tweetTimestamp && Math.abs(value - tweetTimestamp * 1000) < 3600000 ? 5 : 0;
          },
          pointBackgroundColor: (context) => {
            const value = context.raw.x;
            return tweetTimestamp && Math.abs(value - tweetTimestamp * 1000) < 3600000 ? '#FFFF00' : '#00ff00';
          },
          pointBorderColor: '#000000',
          pointBorderWidth: 1,
          fill: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: {
          intersect: false,
          mode: 'index'
        },
        scales: {
          x: {
            type: 'time',
            time: {
              displayFormats: {
                millisecond: 'HH:mm:ss.SSS',
                second: 'HH:mm:ss',
                minute: 'HH:mm',
                hour: 'MMM d, HH:mm',
                day: 'MMM d',
                week: 'MMM d',
                month: 'MMM yyyy',
                quarter: 'MMM yyyy',
                year: 'yyyy'
              },
              tooltipFormat: 'MMM d, yyyy HH:mm:ss'
            },
            grid: {
              color: '#00ff00',
              borderColor: '#00ff00',
              tickColor: '#00ff00'
            },
            ticks: {
              color: '#00ff00',
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 10
            }
          },
          y: {
            grid: {
              color: '#00ff00',
              borderColor: '#00ff00',
              tickColor: '#00ff00'
            },
            ticks: {
              color: '#00ff00',
              callback: function(value) {
                if (value >= 1) {
                  return '$' + value.toFixed(2);
                } else {
                  return '$' + value.toFixed(6);
                }
              }
            }
          }
        },
        plugins: {
          legend: {
            labels: {
              color: '#00ff00'
            }
          },
          tooltip: {
            callbacks: {
              title: function(context) {
                const date = new Date(context[0].parsed.x);
                const isTweetTime = tweetTimestamp && Math.abs(date.getTime() - tweetTimestamp * 1000) < 3600000;
                return `${date.toLocaleString()}${isTweetTime ? ' (Tweet Time)' : ''}`;
              },
              label: function(context) {
                const price = context.parsed.y;
                return `Price: ${price >= 1 ? '$' + price.toFixed(2) : '$' + price.toFixed(6)}`;
              }
            }
          }
        }
      }
    });

    return () => {
      newChart.destroy();
    };
  }, [chartData, tweetTimestamp]);

  const fetchPoolData = async (address, network) => {
    try {
      const response = await axios.get(
        `https://api.geckoterminal.com/api/v2/networks/${network}/tokens/${address}/pools`
      );
      
      const pools = response.data.data.map(pool => {
        const poolId = pool.id;
        const address = poolId.split(`${network}_`)[1];
        return {
          fullId: poolId,
          address: address,
          baseTokenPrice: pool.attributes?.base_token_price_usd || 'N/A',
          createdAt: pool.attributes?.pool_created_at || null
        };
      });

      if (pools.length > 0) {
        const poolCreatedAt = Math.floor(new Date(pools[0].createdAt).getTime() / 1000);
        console.log('Pool created at:', new Date(poolCreatedAt * 1000));
        
        const data = await fetchPoolOHLCV(network, pools[0].address, 'hour', poolCreatedAt);
        setChartData(data);
      }

    } catch (err) {
      console.error('Error fetching pool data:', err);
      setError('Failed to fetch pool data');
    }
  };

  const fetchPoolOHLCV = async (network, poolAddress, timeframe, startTimestamp) => {
    try {
      let allData = [];
      const endTimestamp = Math.floor(Date.now() / 1000); // Current time
      
      // Calculate the earliest timestamp we want data for
      const earliestDesiredTimestamp = endTimestamp - (PRICE_HISTORY_DAYS * SECONDS_PER_DAY);
      
      // Use the later of pool creation time or earliest desired time
      const effectiveStartTimestamp = Math.max(startTimestamp, earliestDesiredTimestamp);
      let currentTimestamp = endTimestamp;
      
      // Force hourly timeframe
      timeframe = 'hour';
      
      console.log(`Fetching ${PRICE_HISTORY_DAYS} days of hourly price data from ${new Date(effectiveStartTimestamp * 1000)} to ${new Date(endTimestamp * 1000)}`);

      let apiCallCount = 0;
      while (currentTimestamp > effectiveStartTimestamp && apiCallCount < MAX_API_CALLS) {
        apiCallCount++;
        console.log(`API Call ${apiCallCount}/${MAX_API_CALLS} - Fetching data before: ${new Date(currentTimestamp * 1000)}`);
        
        const response = await axios.get(
          `https://api.geckoterminal.com/api/v2/networks/${network}/pools/${poolAddress}/ohlcv/${timeframe}`,
          {
            params: {
              limit: 1000,
              before_timestamp: currentTimestamp,
              aggregate: 1 // 1 hour aggregation
            }
          }
        );

        if (!response.data?.data?.attributes?.ohlcv_list) {
          throw new Error('Invalid OHLCV data received');
        }

        const newData = response.data.data.attributes.ohlcv_list;
        console.log(`Received ${newData.length} data points`);
        
        if (newData.length === 0) break;

        // Update currentTimestamp to the earliest timestamp we got
        currentTimestamp = newData[0][0]; // First item's timestamp

        // Convert and add the new data
        const chartData = newData
          .filter(item => item[0] >= effectiveStartTimestamp) // Only include data after our start time
          .map(item => ({
            x: new Date(item[0] * 1000), // Convert to milliseconds for Date object
            y: parseFloat(item[4]) // Using closing price
          }));

        allData = [...allData, ...chartData];
        console.log(`Total data points so far: ${allData.length}`);
        
        // Add a delay to respect rate limits (30 calls per minute = 1 call per 2 seconds)
        if (apiCallCount < MAX_API_CALLS) {
          await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
        }
      }

      if (apiCallCount >= MAX_API_CALLS) {
        console.log(`Reached maximum API calls (${MAX_API_CALLS}). Some historical data might be missing.`);
      }

      // Sort all data by time in ascending order
      const sortedData = allData.sort((a, b) => a.x - b.x);
      console.log(`Final dataset has ${sortedData.length} points spanning ${PRICE_HISTORY_DAYS} days`);
      return sortedData;
    } catch (err) {
      console.error('Error fetching pool OHLCV data:', err);
      throw err;
    }
  };

  const handleTweetUrl = async (e) => {
    e.preventDefault();
    setError(null);
    
    if (!tweetUrl) {
      setError('Please enter a tweet URL');
      return;
    }

    try {
      const response = await fetch(`${BACKEND_URL}/api/tweet-timestamp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ tweetUrl })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch tweet timestamp');
      }

      console.log('----------------------------------------');
      console.log('🕒 Tweet Timestamps:');
      console.log('Human readable:', data.humanReadable);
      console.log('Unix timestamp:', data.timestamp);
      console.log('----------------------------------------');
      
      setTweetTimestamp(data.timestamp);
      
    } catch (err) {
      console.error('Error processing tweet URL:', err);
      setError(err.message || 'Error processing tweet URL');
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    setError(null);

    if (!tokenAddress) {
      setError('Please enter a token address');
      return;
    }

    try {
      await fetchPoolData(tokenAddress, networks[selectedNetwork]);
    } catch (err) {
      setError('Failed to fetch data. Please check the token address.');
    }
  };

  useEffect(() => {
    if (tokenAddress) {
      const network = networks[selectedNetwork];
      fetchPoolData(tokenAddress, network);
    }
  }, [selectedNetwork]);

  // Cleanup chart on component unmount
  useEffect(() => {
    return () => {
      const chart = ChartJS.getChart(chartRef.current);
      if (chart) {
        chart.destroy();
      }
    };
  }, []);

  return (
    <div className="App">
      <div className="container">
        <h1>whopumped.fun? </h1>
        <div className="search-section">
          <form onSubmit={handleSearch} className="search-form">
            <input
              type="text"
              value={tokenAddress}
              onChange={(e) => setTokenAddress(e.target.value)}
              placeholder="Enter token address..."
              className="search-input"
            />
            <div className="network-buttons">
              <button
                type="button"
                className={`network-button ${selectedNetwork === 'ethereum' ? 'active' : ''}`}
                onClick={() => setSelectedNetwork('ethereum')}
              >
                [ETH]
              </button>
              <button
                type="button"
                className={`network-button ${selectedNetwork === 'base' ? 'active' : ''}`}
                onClick={() => setSelectedNetwork('base')}
              >
                [BASE]
              </button>
              <button
                type="button"
                className={`network-button ${selectedNetwork === 'solana' ? 'active' : ''}`}
                onClick={() => setSelectedNetwork('solana')}
              >
                [SOL]
              </button>
            </div>
            <button type="submit" className="search-button">
              Search
            </button>
          </form>

          <form onSubmit={handleTweetUrl} className="tweet-form">
            <div className="tweet-input-container">
              <input
                type="text"
                value={tweetUrl}
                onChange={(e) => setTweetUrl(e.target.value)}
                placeholder="Enter tweet URL..."
                className="search-input"
              />
            </div>
            <button type="submit" className="search-button">
              Get Tweet Time
            </button>
          </form>

          {error && <div className="error-message">{error}</div>}
        </div>
        <div className="chart-container">
          <canvas ref={chartRef}></canvas>
        </div>
      </div>
    </div>
  );
}

export default App;
