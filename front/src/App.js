import React, { useState, useRef, useEffect } from 'react';
import { createChart } from 'lightweight-charts';
import axios from 'axios';
import './App.css';

function App() {
  const [tokenAddress, setTokenAddress] = useState('');
  const [error, setError] = useState('');
  const [selectedNetwork, setSelectedNetwork] = useState('ethereum');
  const chartContainerRef = useRef(null);
  const chart = useRef(null);
  const series = useRef(null);

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
      
      // Extract pool addresses from the response
      const pools = response.data.data.map(pool => {
        const poolId = pool.id;
        // Extract the actual address part after the network prefix (e.g., 'solana_')
        const address = poolId.split(`${network}_`)[1];
        return {
          fullId: poolId,
          address: address,
          baseTokenPrice: pool.attributes?.base_token_price_usd || 'N/A'
        };
      });

      console.log('Pool Addresses:', pools);
      return pools;
    } catch (err) {
      console.error('Error fetching pool data:', err);
      return [];
    }
  };

  const fetchPriceData = async (address) => {
    try {
      setError('');
      const network = networks[selectedNetwork];
      
      // Fetch pool data first
      await fetchPoolData(address, network);
      
      const response = await axios.get(
        `https://api.geckoterminal.com/api/v2/networks/${network}/tokens/${address}/ohlcv/minute`
      );
      
      if (!response.data?.data?.attributes?.ohlcv_list) {
        throw new Error('Invalid data received from API');
      }

      const chartData = response.data.data.attributes.ohlcv_list.map(item => ({
        time: new Date(item[0]).getTime() / 1000,
        open: parseFloat(item[1]),
        high: parseFloat(item[2]),
        low: parseFloat(item[3]),
        close: parseFloat(item[4])
      }));

      return chartData;
    } catch (err) {
      setError('Failed to fetch price data. Please check the token address.');
      console.error('Error fetching price data:', err);
      return null;
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!tokenAddress) return;

    const data = await fetchPriceData(tokenAddress);
    if (!data) return;

    if (series.current) {
      series.current.setData(data);
    }
  };

  // Also fetch pool data when network changes
  useEffect(() => {
    if (tokenAddress) {
      const network = networks[selectedNetwork];
      fetchPoolData(tokenAddress, network);
    }
  }, [selectedNetwork, tokenAddress]);

  useEffect(() => {
    if (chartContainerRef.current) {
      const chartInstance = createChart(chartContainerRef.current, {
        width: chartContainerRef.current.clientWidth,
        height: 400,
        layout: {
          background: { color: '#000000' },
          textColor: '#00ff00',
        },
        grid: {
          vertLines: { color: 'rgba(0, 255, 0, 0.1)' },
          horzLines: { color: 'rgba(0, 255, 0, 0.1)' },
        },
        timeScale: {
          timeVisible: true,
          secondsVisible: false,
          borderColor: '#00ff00',
        },
      });

      const candleSeries = chartInstance.addCandlestickSeries({
        upColor: '#00ff00',
        downColor: '#ff0000',
        borderVisible: false,
        wickUpColor: '#00ff00',
        wickDownColor: '#ff0000'
      });

      chart.current = chartInstance;
      series.current = candleSeries;

      const handleResize = () => {
        chartInstance.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      };

      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
        chartInstance.remove();
      };
    }
  }, []);

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
              &gt; Execute Search
            </button>
          </form>
        </div>
        {error && <div className="error-message">&gt; {error}</div>}
        <div 
          ref={chartContainerRef} 
          className="chart-container"
        />
      </div>
    </div>
  );
}

export default App;
