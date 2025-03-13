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

// src/api/fetcher.js - Updated fetchAllClips function
export const fetchAllClips = async (channel) => {
	try {
	  let allClips = [];
	  let cursor = null; // Start with null cursor
	  let hasMoreClips = true;
	  let page = 1;
	  
	  logMessage(`Starting to fetch all clips for channel: ${channel}`, 'blue');
	  
	  while (hasMoreClips) {
		// Build URL based on whether we have a cursor
		let apiUrl = `https://kick.com/api/v2/channels/${channel}/clips?sort=view&time=all`;
		if (cursor) {
		  apiUrl += `&cursor=${cursor}`;
		}
		
		logMessage(`Fetching clips page ${page}, URL: ${apiUrl}`, 'blue');
		
		try {
		  const data = await KickScraper.scrapeData(apiUrl);
		  
		  if (data && data.clips && data.clips.length > 0) {
			// Filter out duplicates
			const newClips = data.clips.filter(clip => 
			  !allClips.some(existingClip => existingClip.id === clip.id)
			);
			
			allClips = [...allClips, ...newClips];
			logMessage(`Found ${data.clips.length} clips on page ${page}, ${newClips.length} are new. Total: ${allClips.length}`, 'green');
			
			// Check if there's a new nextCursor in the response
			if (data.nextCursor && data.nextCursor !== cursor) {
			  cursor = data.nextCursor; // Use nextCursor, not cursor
			  page++;
			} else {
			  hasMoreClips = false;
			  logMessage('No more pages available (no nextCursor or unchanged)', 'yellow');
			}
		  } else {
			hasMoreClips = false;
			logMessage('No clips found or empty response', 'yellow');
		  }
		} catch (error) {
		  logMessage(`Error fetching page ${page}: ${error.message}. Retrying...`, 'red');
		  await new Promise(resolve => setTimeout(resolve, 2000));
		  continue;
		}
		
		// Wait between requests to avoid rate limiting
		await new Promise(resolve => setTimeout(resolve, 500)); // Reduced to 500ms as per your working code
	  }
	  
	  logMessage(`Successfully fetched a total of ${allClips.length} clips`, 'green');
	  return allClips;
	} catch (error) {
	  logMessage(`Error in fetchAllClips: ${error.message}`, 'red');
	  return [];
	}
  };
  
  // Update fetchContentList to properly handle the clip data structure
  export const fetchContentList = async (channel, contentType, fetchAll = false) => {
	try {
	  if (contentType === 'Clip') {
		if (fetchAll) {
		  const clips = await fetchAllClips(channel);
		  return { clips }; // Return in the expected format
		}
		
		const data = await KickScraper.scrapeData(
		  `https://kick.com/api/v2/channels/${channel}/clips?cursor=0&sort=view&time=all`
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

