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
    
    // 1. Dapatkan semua ID subfolder secara rekursif (termasuk folder parent itu sendiri)
    const folderIds = await getAllFolderIdsRecursive(drive, folderId);
    
    // 2. Ambil foto dari semua folder tersebut
    let allFiles = [];
    
    for (const fid of folderIds) {
      let pageToken = null;
      do {
        const response = await drive.files.list({
          q: `'${fid}' in parents and mimeType contains 'image/' and trashed = false`,
          fields: 'nextPageToken, files(id, name, thumbnailLink, webContentLink)',
          pageSize: 1000, // Maksimal per request
          pageToken: pageToken || undefined,
        });
  
        const files = response.data.files || [];
        allFiles = allFiles.concat(files);
        pageToken = response.data.nextPageToken;
      } while (pageToken);
    }
  
    return allFiles;
  } catch (error) {
    console.error('Gagal mengambil data dari Google Drive API secara rekursif:', error);
    throw error;
  }
}

// Fungsi pembantu untuk melacak semua ID subfolder (rekursif menggunakan Queue)
async function getAllFolderIdsRecursive(drive, parentId) {
  const result = [parentId];
  const queue = [parentId];

  while (queue.length > 0) {
    const currentId = queue.shift();
    try {
      let pageToken = null;
      do {
        const response = await drive.files.list({
          q: `'${currentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
          fields: 'nextPageToken, files(id)',
          pageSize: 100,
          pageToken: pageToken || undefined,
        });
        const subfolders = response.data.files || [];
        for (const sf of subfolders) {
          if (!result.includes(sf.id)) {
            result.push(sf.id);
            queue.push(sf.id); // Masukkan ke queue untuk dilacak subfolder-nya lagi
          }
        }
        pageToken = response.data.nextPageToken;
      } while (pageToken);
    } catch (err) {
      console.error(`Gagal mengambil subfolder dari parent ${currentId}:`, err);
    }
  }

  return result;
}
