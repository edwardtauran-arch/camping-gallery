import { google } from 'googleapis';

// Mengambil kredensial dari environment variable
const getDriveInstance = () => {
  const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!credentialsJson) {
    throw new Error('Kredensial GOOGLE_SERVICE_ACCOUNT_KEY tidak ditemukan.');
  }

  const credentials = JSON.parse(credentialsJson);

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });

  return google.drive({ version: 'v3', auth });
};

export async function getPhotosFromFolder(folderId) {
  try {
    const drive = getDriveInstance();
    let allFiles = [];
    let pageToken = null;

    do {
      const response = await drive.files.list({
        q: `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`,
        fields: 'nextPageToken, files(id, name, thumbnailLink, webContentLink)',
        pageSize: 1000, // Maximum allowed per request
        pageToken: pageToken || undefined,
      });

      const files = response.data.files || [];
      allFiles = allFiles.concat(files);
      pageToken = response.data.nextPageToken;
    } while (pageToken);

    return allFiles;
  } catch (error) {
    console.error('Gagal mengambil data dari Google Drive API:', error);
    return [];
  }
}
