import requests
import pandas as pd
from typing import List, Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)

class GeckoTerminalAPI:
    """Client for interacting with the GeckoTerminal API"""
    
    BASE_URL = "https://api.geckoterminal.com/api/v2"
    
    def __init__(self):
        self.session = requests.Session()
    
    def get_pool_ohlcv(self, 
                      network: str,
                      pool_address: str, 
                      timeframe: str = 'hour',
                      limit: int = 1000) -> Optional[pd.DataFrame]:
        """
        Get OHLCV data for a specific pool
        
        Args:
            network: Network name (e.g. 'eth' for Ethereum)
            pool_address: Pool contract address
            timeframe: Data timeframe ('hour', 'minute', 'day')
            limit: Number of data points to return (max 1000)
            
        Returns:
            DataFrame with OHLCV data or None if request fails
        """
        try:
            url = f"{self.BASE_URL}/networks/{network}/pools/{pool_address}/ohlcv/{timeframe}"
            params = {'limit': min(limit, 1000)}  # API max is 1000
            
            response = self.session.get(url, params=params)
            response.raise_for_status()
            
            data = response.json()
            ohlcv_list = data['data']['attributes']['ohlcv_list']
            
            if not ohlcv_list:
                logger.warning(f"No OHLCV data returned for pool {pool_address}")
                return None
                
            # Convert to DataFrame
            df = pd.DataFrame(ohlcv_list, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
            
            # Convert timestamp to datetime
            df['timestamp'] = pd.to_datetime(df['timestamp'], unit='s')
            
            # Set timestamp as index
            df.set_index('timestamp', inplace=True)
            
            return df
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error fetching OHLCV data: {str(e)}")
            return None
        except (KeyError, ValueError) as e:
            logger.error(f"Error parsing OHLCV data: {str(e)}")
            return None
    
    def get_historical_ohlcv(self,
                           network: str,
                           pool_address: str,
                           timeframe: str = 'hour',
                           chunks: int = 3) -> Optional[pd.DataFrame]:
        """
        Get extended historical OHLCV data by making multiple requests
        
        Args:
            network: Network name (e.g. 'eth' for Ethereum)
            pool_address: Pool contract address
            timeframe: Data timeframe ('hour', 'minute', 'day')
            chunks: Number of 1000-point chunks to fetch
            
        Returns:
            DataFrame with combined OHLCV data or None if requests fail
        """
        all_data = []
        
        for _ in range(chunks):
            df = self.get_pool_ohlcv(network, pool_address, timeframe)
            if df is None:
                return None
                
            all_data.append(df)
            
            # Get timestamp of oldest point to use as end point for next request
            oldest_timestamp = df.index.min()
            
            # Break if we don't get a full chunk (reached beginning of data)
            if len(df) < 1000:
                break
                
        if not all_data:
            return None
            
        # Combine all chunks and sort by timestamp
        combined_df = pd.concat(all_data)
        combined_df = combined_df[~combined_df.index.duplicated(keep='first')]
        combined_df.sort_index(inplace=True)
        
        return combined_df
