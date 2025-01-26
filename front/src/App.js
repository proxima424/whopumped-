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
  LineController,
  Filler
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import { GeckoTerminalAPI } from './api/geckoTerminal';
import { fetchTimestampFromTweet, isValidTweetUrl } from './components/tweetUtils';
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
  Filler
);

function App() {
  const [tokenAddress, setTokenAddress] = useState('');
  const [selectedNetwork, setSelectedNetwork] = useState('ethereum');
  const [tweetUrl, setTweetUrl] = useState('');
  const [error, setError] = useState(null);
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const geckoAPI = new GeckoTerminalAPI();

  // Constants
  const PRICE_HISTORY_DAYS = 90; // 3 months of price history
  const SECONDS_PER_DAY = 86400; // 24 hours * 60 minutes * 60 seconds
  const MAX_API_CALLS = 20; // Leave 10 calls for other operations
  const RATE_LIMIT_DELAY = 2000; // 2 seconds between calls

  const networks = {
    ethereum: 'eth',
    base: 'base',
    solana: 'solana'
  };

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

      console.log('Pool Addresses:', pools);
      
      if (pools.length > 0) {
        // Convert pool creation time to Unix timestamp
        const poolCreatedAt = Math.floor(new Date(pools[0].createdAt).getTime() / 1000);
        console.log('Pool created at:', new Date(poolCreatedAt * 1000));
        
        const chartData = await fetchPoolOHLCV(network, pools[0].address, 'hour', poolCreatedAt);
        updateChart(chartData);
      }

      return pools;
    } catch (err) {
      console.error('Error fetching pool data:', err);
      throw err;
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

  const updateChart = async (data) => {
    try {
      console.log('Updating chart with data points:', data.length);
      
      if (chartInstance.current) {
        chartInstance.current.destroy();
        chartInstance.current = null;
      }

      if (!data || data.length === 0) {
        console.warn('No data to display in chart');
        return;
      }

      // Calculate time range of the data
      const timeRange = data[data.length - 1].x - data[0].x; // in milliseconds
      const hoursRange = timeRange / (1000 * 60 * 60);
      
      // Determine appropriate time unit and step size
      let timeUnit, stepSize;
      if (hoursRange <= 24) {
        timeUnit = 'hour';
        stepSize = 1;
      } else if (hoursRange <= 72) {
        timeUnit = 'hour';
        stepSize = 4;
      } else if (hoursRange <= 168) { // 1 week
        timeUnit = 'day';
        stepSize = 1;
      } else {
        timeUnit = 'day';
        stepSize = Math.ceil(hoursRange / (24 * 7)); // Adjust step size based on range
      }

      console.log(`Chart time range: ${hoursRange.toFixed(1)} hours, using ${timeUnit} units with step size ${stepSize}`);

      const ctx = chartRef.current.getContext('2d');
      ctx.clearRect(0, 0, chartRef.current.width, chartRef.current.height);
      
      chartInstance.current = new ChartJS(ctx, {
        type: 'line',
        data: {
          datasets: [
            {
              label: 'Price',
              data: data,
              borderColor: '#00ff00',
              backgroundColor: 'rgba(0, 255, 0, 0.1)',
              borderWidth: 2,
              pointRadius: 0,
              tension: 0.1,
              fill: false
            }
          ]
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
                unit: timeUnit,
                stepSize: stepSize,
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
                }
              },
              display: true,
              grid: {
                display: false
              },
              ticks: {
                maxRotation: 0,
                autoSkip: true,
                maxTicksLimit: 10
              }
            },
            y: {
              display: true,
              grid: {
                display: false
              },
              ticks: {
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
            tooltip: {
              enabled: true,
              mode: 'index',
              intersect: false,
              callbacks: {
                label: function(context) {
                  const price = context.parsed.y;
                  return `Price: ${price >= 1 ? '$' + price.toFixed(2) : '$' + price.toFixed(6)}`;
                },
                title: function(context) {
                  const date = new Date(context[0].parsed.x);
                  return date.toLocaleString();
                }
              }
            }
          }
        }
      });
    } catch (err) {
      console.error('Error updating chart:', err);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!tokenAddress) return;

    try {
      await fetchPoolData(tokenAddress, networks[selectedNetwork]);
    } catch (err) {
      setError('Failed to fetch data. Please check the token address.');
    }
  };

  const handleTweetUrl = async (e) => {
    e.preventDefault();
    if (!tweetUrl) return;

    if (!isValidTweetUrl(tweetUrl)) {
      setError('Please enter a valid tweet URL');
      return;
    }

    try {
      const timestamp = await fetchTimestampFromTweet(tweetUrl);
      if (timestamp) {
        console.log('Tweet timestamp:', new Date(timestamp * 1000).toLocaleString());
        console.log('Unix timestamp:', timestamp);
      } else {
        setError('Could not fetch tweet timestamp');
      }
    } catch (err) {
      setError('Error processing tweet URL');
      console.error(err);
    }
  };

  useEffect(() => {
    if (tokenAddress) {
      const network = networks[selectedNetwork];
      fetchPoolData(tokenAddress, network);
    }
  }, [selectedNetwork]);

  return (
    <div className="App">
      <div className="container">
        <h1>$ whopumped.eth ~</h1>
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
            <input
              type="text"
              value={tweetUrl}
              onChange={(e) => setTweetUrl(e.target.value)}
              placeholder="Enter tweet URL..."
              className="search-input"
            />
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
