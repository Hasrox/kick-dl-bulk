import { convertTime } from '../utils/index.js';

export const formatInput = (input) => {
  return input.toLowerCase().replace(/\s+/g, '_');
};

// Enhanced formatContent function to preserve original content details
export const formatContent = (contentList, contentType) => {
  return contentList.map((content) => {
    if (contentType === 'VOD') {
      const hours = convertTime(content.duration);
      const masterUrl = content.source;
      const url = masterUrl.replace(
        /\/hls\/master\.m3u8$/,
        '/hls/480p30/playlist.m3u8'
      );
      return {
        name: `${content.session_title} - ${hours} - ${content.start_time}`,
        value: url,
        description: `- Description: ${content.session_title} | ${content.categories && content.categories[0] ? content.categories[0].name : 'No category'} | ${content.views || 0} views`,
        originalContent: content
      };
    }

    // For clips, preserve more of the original information
    return {
      name: `${content.title} - ${content.duration} seconds`,
      value: content.clip_url,
      description: `- Description: ${content.title} | ${content.category ? content.category.name : 'No category'} | ${content.views || 0} views`,
      originalTitle: content.title,
      durationSec: content.duration,
      id: content.id,
      originalContent: content
    };
  });
};
