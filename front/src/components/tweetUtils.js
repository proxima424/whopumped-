import axios from 'axios';

/**
 * Converts a Twitter ID to a timestamp
 * @param {string} tweetId - The tweet ID
 * @returns {number} Unix timestamp in seconds
 */
function tweetIdToTimestamp(tweetId) {
    // Convert the first 41 bits of the ID to a timestamp
    const TWITTER_EPOCH = 1288834974657;
    // Convert ID to binary string, pad with zeros
    const binary = parseInt(tweetId).toString(2).padStart(64, '0');
    // Get the timestamp bits (first 41 bits)
    const timestampBits = binary.slice(0, 41);
    // Convert back to decimal and add Twitter epoch
    const timestamp = parseInt(timestampBits, 2) + TWITTER_EPOCH;
    return Math.floor(timestamp / 1000); // Convert to seconds
}

/**
 * Extracts timestamp from a tweet URL
 * @param {string} tweetUrl - The URL of the tweet
 * @returns {Promise<number|null>} Unix timestamp in seconds, or null if failed
 */
export async function fetchTimestampFromTweet(tweetUrl) {
    try {
        // Clean up the URL
        const cleanUrl = tweetUrl.replace('x.com', 'twitter.com');
        
        // Use Twitter's oEmbed API which has CORS enabled
        const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(cleanUrl)}`;
        const response = await axios.get(oembedUrl);
        
        if (response.data && response.data.html) {
            // Extract the tweet ID
            const tweetId = cleanUrl.split('/status/')[1]?.split('?')[0];
            if (!tweetId) {
                throw new Error('Could not extract tweet ID');
            }
            
            const timestamp = tweetIdToTimestamp(tweetId);
            console.log('Extracted timestamp from tweet ID:', new Date(timestamp * 1000).toLocaleString());
            return timestamp;
        }
        
        throw new Error('Could not find timestamp in tweet');
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
