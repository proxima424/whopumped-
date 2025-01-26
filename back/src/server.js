require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Scraper } = require('agent-twitter-client');

const app = express();
const port = process.env.PORT || 3001;

// Initialize Twitter scraper
const scraper = new Scraper({
    username: process.env.TWITTER_USERNAME,
    password: process.env.TWITTER_PASSWORD
});

// Middleware
app.use(cors());
app.use(express.json());

// Helper function to extract tweet ID from URL
function extractTweetId(tweetUrl) {
    try {
        return tweetUrl.split('/status/')[1]?.split('?')[0];
    } catch (error) {
        return null;
    }
}

// Endpoint to get tweet timestamp
app.post('/api/tweet-timestamp', async (req, res) => {
    try {
        const { tweetUrl } = req.body;
        
        if (!tweetUrl) {
            return res.status(400).json({ error: 'Tweet URL is required' });
        }

        const tweetId = extractTweetId(tweetUrl);
        if (!tweetId) {
            return res.status(400).json({ error: 'Invalid tweet URL' });
        }

        const tweet = await scraper.getTweet(tweetId);
        if (!tweet || !tweet.timestamp) {
            return res.status(404).json({ error: 'Could not fetch tweet data or timestamp missing' });
        }

        return res.json({
            timestamp: tweet.timestamp,
            humanReadable: new Date(tweet.timestamp * 1000).toLocaleString()
        });

    } catch (error) {
        console.error('Error fetching tweet timestamp:', error);
        return res.status(500).json({ error: 'Failed to fetch tweet timestamp' });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
