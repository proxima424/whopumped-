const BASE_URL = "https://api.geckoterminal.com/api/v2";

export class GeckoTerminalAPI {
    async getPoolOHLCV(network, poolAddress, timeframe = 'hour', limit = 1000) {
        try {
            const url = `${BASE_URL}/networks/${network}/pools/${poolAddress}/ohlcv/${timeframe}`;
            const params = new URLSearchParams({
                limit: Math.min(limit, 1000) // API max is 1000
            });

            const response = await fetch(`${url}?${params}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            const ohlcvList = data.data.attributes.ohlcv_list;

            if (!ohlcvList || ohlcvList.length === 0) {
                console.warn(`No OHLCV data returned for pool ${poolAddress}`);
                return null;
            }

            // Format data for chart display
            return ohlcvList.map(([timestamp, open, high, low, close, volume]) => ({
                time: timestamp,
                open: parseFloat(open),
                high: parseFloat(high),
                low: parseFloat(low),
                close: parseFloat(close),
                volume: parseFloat(volume)
            }));

        } catch (error) {
            console.error('Error fetching OHLCV data:', error);
            throw error;
        }
    }

    async getHistoricalOHLCV(network, poolAddress, timeframe = 'hour', chunks = 3) {
        try {
            let allData = [];
            
            for (let i = 0; i < chunks; i++) {
                const data = await this.getPoolOHLCV(network, poolAddress, timeframe);
                if (!data) break;
                
                allData = [...allData, ...data];
                
                // Break if we don't get a full chunk (reached beginning of data)
                if (data.length < 1000) break;
            }

            // Sort by timestamp and remove duplicates
            return allData
                .sort((a, b) => a.time - b.time)
                .filter((item, index, self) => 
                    index === self.findIndex(t => t.time === item.time)
                );

        } catch (error) {
            console.error('Error fetching historical OHLCV data:', error);
            throw error;
        }
    }
}
