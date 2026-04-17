import { get, set } from 'idb-keyval';
import { db } from '../firebase/firebaseConfig';
import { collection, addDoc, query, where, getDocs, updateDoc } from 'firebase/firestore';

const PENDING_SYNC_KEY = 'pending_attendance_sync';

export const savePendingSync = async (attendanceRecord) => {
  const pendingRecords = (await get(PENDING_SYNC_KEY)) || [];
  // Ensure no duplicate offline mark for the same day
  const exists = pendingRecords.find(r => r.date === attendanceRecord.date && r.userId === attendanceRecord.userId);
  
  if (!exists) {
    pendingRecords.push(attendanceRecord);
    await set(PENDING_SYNC_KEY, pendingRecords);
  } else if (attendanceRecord.type === 'checkout') {
    // If it's a checkout, update the existing offline record
    const index = pendingRecords.indexOf(exists);
    pendingRecords[index] = { ...exists, checkoutTime: attendanceRecord.checkoutTime };
    await set(PENDING_SYNC_KEY, pendingRecords);
  }
};

export const syncPendingRecords = async () => {
  if (!navigator.onLine) return;

  const pendingRecords = await get(PENDING_SYNC_KEY);
  if (!pendingRecords || pendingRecords.length === 0) return;

  const attendanceRef = collection(db, 'attendance');
  let successfullySynced = [];

  for (const record of pendingRecords) {
    try {
        // Check if it already exists online to prevent duplicates
        const q = query(attendanceRef, where('userId', '==', record.userId), where('date', '==', record.date));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            // New record
            await addDoc(attendanceRef, record);
        } else if (record.checkoutTime) {
            // Update existing check-in with checkout time
            const docId = querySnapshot.docs[0].id;
            await updateDoc(querySnapshot.docs[0].ref, { checkoutTime: record.checkoutTime });
        }
        
        successfullySynced.push(record);
    } catch (error) {
        console.error("Failed to sync record", error);
    }
  }

  // Remove successfully synced items from IDB
  const remainingRecords = pendingRecords.filter(r => !successfullySynced.includes(r));
  await set(PENDING_SYNC_KEY, remainingRecords);
  
  return successfullySynced.length; // Returns count of synced items
};
