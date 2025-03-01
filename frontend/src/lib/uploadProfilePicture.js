import { uploadData, getUrl, remove, list } from '@aws-amplify/storage';
import { fetchAuthSession } from '@aws-amplify/auth';
import { cleanS3Url } from './utils';

export async function uploadProfilePicture(file, userId) {
  if (!file || !userId) {
    throw new Error('File and userId are required');
  }

  // Use a consistent filename pattern based on userId
  // This way, we can easily find and delete old profile pictures
  // Format: profile-pictures/userId/profile.extension
  const fileExtension = file.name.split('.').pop().toLowerCase();
  const fileName = `profile-pictures/${userId}/profile.${fileExtension}`;
  
  try {
    // Ensure we have valid credentials
    const session = await fetchAuthSession();
    if (!session.credentials) {
      throw new Error('No valid credentials available');
    }

    // Step 1: List existing files in the user's profile directory
    try {
      const listResult = await list({
        prefix: `profile-pictures/${userId}/`,
        options: {
          accessLevel: 'public'
        }
      });
      
      console.log("Found existing files:", listResult.items);
      
      // Step 2: Delete any existing files
      for (const item of listResult.items) {
        console.log(`Removing old profile picture: ${item.key}`);
        await remove({
          key: item.key,
          options: {
            accessLevel: 'public'
          }
        });
      }
    } catch (listError) {
      // If listing fails, it might be because the directory doesn't exist yet
      console.log("No existing profile pictures found or error listing:", listError);
    }

    // Step 3: Upload the new file
    const uploadResult = await uploadData({
      key: fileName,
      data: file,
      options: {
        contentType: file.type,
        accessLevel: 'public'
      }
    }).result;
    
    console.log("Upload result:", uploadResult);

    // Step 4: Get the URL of the uploaded file
    const urlResult = await getUrl({
      key: fileName,
      options: {
        accessLevel: 'public',
        validateObjectExistence: true
      }
    });
    
    console.log("URL result:", urlResult);
    
    // Get the URL from the result
    const s3Url = urlResult.url.toString();
    
    // Clean the URL to remove query parameters
    const cleanedUrl = cleanS3Url(s3Url);
    console.log("Cleaned URL:", cleanedUrl);
    
    return cleanedUrl;
  } catch (error) {
    console.error('Upload failed:', error);
    throw error;
  }
}