import { logMessage } from '../utils/index.js';
import Scraper from './scraper.js';

const KickScraper = new Scraper();

export const fetchVideo = async (url) => {
	try {
		const dataArray = url.split('/');
		const indexVideo = dataArray.indexOf('videos');
		const idVideo = dataArray[indexVideo + 1];
		const data = await KickScraper.scrapeData(
			`https://kick.com/api/v1/video/${idVideo}/`
		);
		return data;
	} catch (error) {
		return {
			error: true,
			message: error.message,
		};
	}
};

export const fetchChannel = async (channel) => {
	try {
		const data = await KickScraper.scrapeData(
			`https://kick.com/api/v2/channels/${channel}`
		);
		return data;
	} catch (error) {
		logMessage(error.message, 'red');
	}
};
    // Updated fetchAllClips in to prompt fetching option by -sort :time,views and date: allTime, last month, last weel, last day. 
	export const fetchAllClips = async (channel, timeFilter = 'all', sortOrder = 'view') => {
		try {
		  let allClips = [];
		  let seenClipIds = new Set(); // Track seen clip IDs for more efficient duplicate detection
		  let cursor = null;
		  let hasMoreClips = true;
		  let page = 1;
		  
		  logMessage(`Starting to fetch all clips for channel: ${channel} (${timeFilter} time, sorted by ${sortOrder})`, 'blue');
		  
		  while (hasMoreClips) {
			// Build URL with time filter and sort parameters for any time period
			let apiUrl = `https://kick.com/api/v2/channels/${channel}/clips?sort=${sortOrder}&time=${timeFilter}`;
			if (cursor) {
			  apiUrl += `&cursor=${cursor}`;
			}
			
			logMessage(`Fetching clips page ${page}, URL: ${apiUrl}`, 'blue');
			
			try {
			  const data = await KickScraper.scrapeData(apiUrl);
			  
			  if (data && data.clips && data.clips.length > 0) {
				// More efficient duplicate filtering using Set
				const newClips = [];
				for (const clip of data.clips) {
				  if (!seenClipIds.has(clip.id)) {
					seenClipIds.add(clip.id);
					newClips.push(clip);
				  }
				}
				
				allClips = [...allClips, ...newClips];
				logMessage(`Found ${data.clips.length} clips on page ${page}, ${newClips.length} are new (filtered ${data.clips.length - newClips.length} duplicates). Total: ${allClips.length}`, 'green');
				
				// Continue paginating as long as there's a valid nextCursor, regardless of time filter
				if (data.nextCursor && data.nextCursor !== cursor) {
				  cursor = data.nextCursor;
				  page++;
				} else {
				  hasMoreClips = false;
				  logMessage(`No more clips available for time period: ${timeFilter}`, 'yellow');
				}
			  } else {
				hasMoreClips = false;
				logMessage(`No clips found for time period: ${timeFilter}`, 'yellow');
			  }
			} catch (error) {
			  logMessage(`Error fetching page ${page}: ${error.message}. Retrying...`, 'red');
			  await new Promise(resolve => setTimeout(resolve, 2000));
			  continue;
			}
			
			await new Promise(resolve => setTimeout(resolve, 500));
		  }
		  
		  logMessage(`Successfully fetched a total of ${allClips.length} unique clips for time period: ${timeFilter}`, 'green');
		  return allClips;
		} catch (error) {
		  logMessage(`Error in fetchAllClips: ${error.message}`, 'red');
		  return [];
		}
	  };
	  
	  export const fetchContentList = async (channel, contentType, fetchAll = false, timeFilter = 'all', sortOrder = 'view') => {
		try {
		  if (contentType === 'Clip') {
			if (fetchAll) {
			  const clips = await fetchAllClips(channel, timeFilter, sortOrder);
			  return { clips }; // Return in the expected format
			}
			
			const data = await KickScraper.scrapeData(
			  `https://kick.com/api/v2/channels/${channel}/clips?cursor=0&sort=${sortOrder}&time=${timeFilter}`
			);
			return data;
		  }
	  
		  // No change to VOD fetching
		  const data = await KickScraper.scrapeData(
			`https://kick.com/api/v2/channels/${channel}/videos?cursor=0&sort=date&time=all`
		  );
		  return data;
		} catch (error) {
		  logMessage(error.message, 'red');
		  return { clips: [] }; // Return empty clips array on error
		}
	  };
