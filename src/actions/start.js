import {
	promptChannelName,
	promptContent,
	promptContentType,
	promptDownload,
	promptClipDownloadType,
	promptClipSelection,
	promptClipFilterOptions
  } from '../utils/prompts.js';
  import API from '../api/index.js';
  import { formatContent } from '../helpers/index.js';
  import { Downloader, generateClipFileName } from '../lib/downloader.js';
  import { logMessage, confirmTransformer } from '../utils/index.js';
  import { confirm } from '@inquirer/prompts';
  import pLimit from 'p-limit';
  import cliProgress from 'cli-progress';
  import colors from '../lib/colors.js';
  import path from 'path';
  import fs from 'fs';
  import ora from 'ora';
  
  // Create directory if it doesn't exist
  const ensureDirectoryExists = (directory) => {
	if (!fs.existsSync(directory)) {
	  fs.mkdirSync(directory, { recursive: true });
	}
  };
  
  // Create batches of clips based on concurrency level
  const createBatches = (clips, concurrencyLevel) => {
	const batches = [];
	let batch = [];
	
	clips.forEach((clip, index) => {
	  batch.push(clip);
	  
	  if (batch.length === concurrencyLevel || index === clips.length - 1) {
		batches.push([...batch]);
		batch = [];
	  }
	});
	
	return batches;
  };
  
  // src/actions/start.js
  export const initialAction = async () => {
	try {
	  const channel = await promptChannelName();
	  const infoChannel = await API.fetchChannel(channel);
	  const { username } = infoChannel.user;
	  const contentType = await promptContentType(username);
	  
	  // Handle clip download differently
	  if (contentType === 'Clip') {
		const downloadType = await promptClipDownloadType();
		
		if (downloadType === 'bulk') {
		  // Get filter options before fetching
		  const filterOptions = await promptClipFilterOptions();
		  const { time: timeFilter, sort: sortOrder } = filterOptions;
		  
		  // Create a spinner for loading indicator
		  const spinner = ora({
			text: `Fetching clips (${timeFilter} time, sorted by ${sortOrder === 'view' ? 'views' : 'recent'})... this might take a moment`,
			color: 'blue'
		  }).start();
		  
		  try {
			const response = await API.fetchContentList(channel, contentType, true, timeFilter, sortOrder);
			const allClips = response.clips || [];
			
			if (!allClips || allClips.length === 0) {
			  spinner.fail('No clips found for this channel with the selected filters.');
			  return;
			}
			
			spinner.succeed(`Found ${allClips.length} clips!`);
			const formattedContent = formatContent(allClips, contentType);
			
			// Prompt user to select clips
			const selectedIndices = await promptClipSelection(formattedContent, username);
			
			// Handle "Select All" option with better logic
			let clipsToDownload = [];
			
			if (selectedIndices.includes('all')) {
			  // If "all" is selected, use all clips regardless of individual selections
			  clipsToDownload = formattedContent;
			  logMessage('Selected: ALL CLIPS', 'green');
			} else {
			  clipsToDownload = selectedIndices.map(index => formattedContent[index]);
			  logMessage(`Selected: ${clipsToDownload.length} clips`, 'green');
			}
			
			if (clipsToDownload.length === 0) {
			  logMessage('No clips selected for download.', 'yellow');
			  return;
			}
			
			// Create output directory
			const outputDir = path.join('downloads', username, 'clips');
			ensureDirectoryExists(outputDir);
			
			// Ask for concurrency level
			const concurrencyOptions = [
			  { name: 'Low (2 concurrent downloads)', value: 2 },
			  { name: 'Medium (4 concurrent downloads)', value: 4 },
			  { name: 'High (8 concurrent downloads)', value: 8 }
			];
			
			const concurrencyLevel = await promptConcurrencyLevel(concurrencyOptions);
			
			// Create batches of clips
			const batches = createBatches(clipsToDownload, concurrencyLevel);
			
			// Create progress bars
			const multibar = new cliProgress.MultiBar({
			  clearOnComplete: false,
			  hideCursor: true,
			  format: (options, params, payload) => {
				const bar = options.barCompleteString.substring(0, Math.round(params.progress * options.barsize)) +
						  options.barIncompleteString.substring(0, options.barsize - Math.round(params.progress * options.barsize));
				
				if (payload.isOverall) {
				  return `${colors.green('Overall:')} [${bar}] ${params.value}/${params.total} clips | ${payload.status}`;
				} else if (payload.isBatch) {
				  const etaStr = payload.eta !== undefined ? `ETA: ${payload.eta}s` : 'Calculating...';
				  return `${colors.yellow('Batch:')} [${bar}] ${params.value}/${params.total} active | ${etaStr} | ${payload.status || ''}`;
				} else {
				  return `${colors.blue('Downloading:')} [${bar}] ${payload.speed || ''} | ${payload.filename || ''}`;
				}
			  },
			  barCompleteChar: '\u2588',
			  barIncompleteChar: '\u2591'
			});
			
			// Create overall progress bar
			const overallProgress = multibar.create(clipsToDownload.length, 0, { 
			  isOverall: true,
			  status: 'Starting downloads...'
			});
			
			// Create progress bars for active downloads
			const progressBars = [];
			for (let i = 0; i < concurrencyLevel; i++) {
			  progressBars.push({
				bar: multibar.create(100, 0, {}),
				inUse: false
			  });
			}
			
			// Function to get an available progress bar
			const getProgressBar = () => {
			  const available = progressBars.find(pb => !pb.inUse);
			  if (available) {
				available.inUse = true;
				available.bar.update(0);
				return available.bar;
			  }
			  return null;
			};
			
			// Function to release a progress bar
			const releaseProgressBar = (bar) => {
			  const pbEntry = progressBars.find(pb => pb.bar === bar);
			  if (pbEntry) {
				pbEntry.inUse = false;
				pbEntry.bar.update(0, { filename: '', speed: '' });
			  }
			};
			
			let successCount = 0;
			let skipCount = 0;
			let failCount = 0;
			let overallCompleted = 0;
			
			// Process batches sequentially
			for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
			  const batch = batches[batchIndex];
			  const batchSize = batch.length;
			  
			  // Show batch status in overall progress
			  overallProgress.update(overallCompleted, { 
				status: `Processing batch ${batchIndex + 1}/${batches.length} | Downloaded: ${successCount} | Skipped: ${skipCount}`
			  });
			  
			  // Batch tracking info
			  const batchInfo = {
				startTime: Date.now(),
				total: batchSize,
				completed: 0,
				eta: 0
			  };
			  
			  // Create download promises for current batch
			  const batchPromises = batch.map((clip, index) => {
				return new Promise(async (resolve) => {
				  const progressBar = getProgressBar();
				  
				  if (!clip.value) {
					overallProgress.increment({
					  status: `Processing batch ${batchIndex + 1}/${batches.length} | Downloaded: ${successCount} | Skipped: ${skipCount} | Failed: ${failCount}`
					});
					overallCompleted++;
					failCount++;
					batchInfo.completed++;
					if (progressBar) releaseProgressBar(progressBar);
					resolve();
					return;
				  }
				  
				  try {
					// Use original title and duration for consistent naming
					const originalTitle = clip.originalTitle || clip.name.split(' - ')[0];
					const durationSec = clip.durationSec || clip.name.split(' - ')[1].split(' ')[0];
					const views = clip.originalContent?.views || 0;
					
					const clipName = generateClipFileName(
					  username, 
					  originalTitle, 
					  durationSec,
					  views
					);
					
					if (progressBar) {
					  progressBar.update(0, { 
						filename: clipName.length > 25 ? clipName.substring(0, 22) + '...' : clipName,
						speed: '0 B/s'
					  });
					}
					
					const downloadResult = await Downloader(
					  true, 
					  clip.value, 
					  {
						name: clipName,
						outputDir
					  }, 
					  progressBar,
					  batchInfo
					);
					
					if (downloadResult.status) {
					  if (downloadResult.skipped) {
						skipCount++;
					  } else {
						successCount++;
					  }
					  
					  overallProgress.increment({ 
						status: `Processing batch ${batchIndex + 1}/${batches.length} | Downloaded: ${successCount} | Skipped: ${skipCount} | Failed: ${failCount}`
					  });
					} else {
					  failCount++;
					  overallProgress.increment({ 
						status: `Processing batch ${batchIndex + 1}/${batches.length} | Downloaded: ${successCount} | Skipped: ${skipCount} | Failed: ${failCount}`
					  });
					}
					
					overallCompleted++;
				  } catch (error) {
					failCount++;
					overallCompleted++;
					batchInfo.completed++;
					
					overallProgress.increment({ 
					  status: `Processing batch ${batchIndex + 1}/${batches.length} | Error: ${error.message.substring(0, 30)}...`
					});
				  } finally {
					if (progressBar) releaseProgressBar(progressBar);
					resolve();
				  }
				});
			  });
			  
			  // Wait for all downloads in current batch to complete
			  await Promise.all(batchPromises);
			  
			  // Show batch completion message
			  logMessage(`Batch ${batchIndex + 1}/${batches.length} completed`, 'blue');
			}
			
			// Complete overall progress
			overallProgress.update(clipsToDownload.length, { 
			  status: `Completed: ${successCount} downloaded, ${skipCount} skipped, ${failCount} failed`
			});
			
			// Stop progress bars
			multibar.stop();
			
			logMessage(`\nBulk download completed!`, 'green');
			logMessage(`✅ Successfully downloaded: ${successCount} clips`, 'green');
			logMessage(`⏭️ Skipped existing: ${skipCount} clips`, 'blue');
			logMessage(`❌ Failed: ${failCount} clips`, failCount > 0 ? 'red' : 'blue');
			logMessage(`📁 Files saved to: ${outputDir}`, 'green');
		  } catch (error) {
			spinner.fail(`Error fetching clips: ${error.message}`);
			throw error;
		  }
		  
		  return;
		}
	  }
	  
	  // Original flow for single clip or VOD
	  const contentList = await API.fetchContentList(channel, contentType);
	  const formattedContent = formatContent(contentList, contentType);
	  const content = await promptContent(formattedContent, contentType);
	  const confirmDownload = await promptDownload(contentType, username);
	  const statusDownload = await Downloader(confirmDownload, content);
	  console.log(statusDownload.message);
	} catch (error) {
	  if (error.name === 'ExitPromptError') {
		process.exit(0);
	  }
	  
	  throw error;
	}
  };
  
  // Helper function to prompt for concurrency level
  const promptConcurrencyLevel = async (options) => {
	const { select } = await import('@inquirer/prompts');
	
	const result = await select({
	  message: 'Select download concurrency level:',
	  choices: options,
	  default: options[1].value, // Medium by default
	});
	
	return result;
  };
