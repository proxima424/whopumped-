import Scraper from 'agent-twitter-client';

/**
 * Extracts timestamp from a tweet URL
 * @param {string} tweetUrl - The URL of the tweet
 * @param {Scraper} scraper - Twitter scraper instance
 * @returns {Promise<number|null>} Unix timestamp in seconds, or null if failed
 */
export async function fetchTimestampFromTweet(tweetUrl, scraper) {
    try {
        // Extract tweet ID from URL
        const tweetId = tweetUrl.split('/status/')[1]?.split('?')[0];
        if (!tweetId) {
            throw new Error('Could not extract tweet ID from URL');
        }

        // Get tweet data using scraper
        const tweet = await scraper.getTweet(tweetId);
        if (!tweet || !tweet.timestamp) {
            throw new Error('Could not fetch tweet data or timestamp missing');
        }

        // Log the timestamp in human-readable format
        console.log('Tweet timestamp:', new Date(tweet.timestamp * 1000).toLocaleString());
        
        return tweet.timestamp;
    } catch (error) {
        console.error('Error fetching tweet timestamp:', error.message);
        return null;
    }
}

/**
 * Validates if a given URL is a valid tweet URL
 * @param {string} url - URL to validate
 * @returns {boolean} True if URL is a valid tweet URL
 */
export function isValidTweetUrl(url) {
    try {
        const tweetUrlPattern = /^https?:\/\/(mobile\.)?(twitter|x)\.com\/\w+\/status\/\d+/i;
        return tweetUrlPattern.test(url);
    } catch {
        return false;
    }
}
