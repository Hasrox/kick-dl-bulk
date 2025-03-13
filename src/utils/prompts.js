import { input, select, confirm, checkbox } from '@inquirer/prompts';
import { channelTransformer, confirmTransformer } from './index.js';
import colors from '../lib/colors.js';

export const promptChannelName = () => {
  return input({
    message: 'Type a channel name:',
    transformer: channelTransformer,
    validate: (input) => {
      if (!input) return 'Please enter a channel name';
      return true;
    },
  });
};

export const promptContentType = (channelName) => {
  return select({
    message: `Select a content type for ${channelName}:`,
    choices: [
      { 
        name: 'Clip', 
        value: 'Clip',
        description: `- List short clips from ${channelName}, perfect for highlights...` 
      },
      { 
        name: 'VOD', 
        value: 'VOD',
        description: `- List past VODs from ${channelName}, ideal for full streams...` 
      },
    ],
  });
};

export const promptClipDownloadType = () => {
	return confirm({
	  message: 'Fetch All Clips?',
	  default: true,
	  transformer: (input) => input ? 'Yes' : 'No'
	}).then(confirmed => {
	  return 'bulk';
	});
  };
export const promptContent = (choices, contentType) => {
  return select({
    message: `Select a ${contentType}:`,
    choices,
  });
};

export const promptDownload = (contentType, username) => {
  return confirm({
    message: `Do you want to download the ${contentType} from ${username}?`,
    default: true,
    transformer: confirmTransformer,
  });
};

// New function to select multiple clips with improved instructions
export const promptClipSelection = (clips, channelName) => {
	// Add a "Select All" option at the top
	const selectAllOption = {
	  name: colors.green("✅ SELECT ALL CLIPS"),
	  value: "all",
	  checked: false
	};
	
	// Format clip choices with more details
	const clipChoices = clips.map((clip, index) => {
	  const title = clip.originalTitle || clip.name.split(' - ')[0]; // Original title
	  const duration = clip.durationSec || clip.name.split(' - ')[1].split(' ')[0]; // Duration in seconds
	  const views = clip.originalContent?.views || 0;
	  
	  return {
		name: `${index+1}. ${title} (${duration} sec, ${views} views)`,
		value: index,
		checked: false
	  };
	});
	
	// Combine options with Select All first
	const choices = [selectAllOption, ...clipChoices];
	
	// Custom onState handler to prevent selecting both "all" and individual clips
	const onState = (state) => {
	  const hasSelectAll = state.includes('all');
	  const hasIndividualClips = state.some(value => value !== 'all');
	  
	  // If both select all and individual clips are selected
	  if (hasSelectAll && hasIndividualClips) {
		// If select all was just added, remove individual selections
		if (state[state.length - 1] === 'all') {
		  return ['all'];
		} 
		// If individual clip was just added, remove select all
		else {
		  return state.filter(value => value !== 'all');
		}
	  }
	  
	  return state;
	};
	
	return checkbox({
	  message: `Select clips to download from ${channelName}:`,
	  choices,
	  loop: false,
	  pageSize: 15,
	  instructions: `\n${colors.yellow('Use arrow keys ↑↓ to navigate, SPACE to select, Enter to confirm')}\n${clipChoices.length} clips available`,
	  onState
	});
  };
