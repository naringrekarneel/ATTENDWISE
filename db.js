import Dexie from 'dexie';
import { v4 as uuidv4 } from 'uuid';

export const db = new Dexie('AttendWiseDB');

// Define the schema. Only indexed properties need to be declared here.
db.version(1).stores({
  semesters: 'id, name, isCurrent, isArchived',
  subjects: 'id, semesterId, name',
  timetables: 'id, semesterId, isActive, effectiveFrom, effectiveUntil',
  lectureTemplates: 'id, timetableId, subjectId, dayOfWeek',
  lectureRecords: 'id, lectureTemplateId, subjectId, date, status',
  attendanceTransactions: 'id, lectureRecordId, timestamp'
});

// Helper functions for Subjects
export async function addTimetable(semesterId, name, gridData, effectiveFrom = null, effectiveUntil = null) {
  const id = uuidv4();
  await db.timetables.add({
    id,
    semesterId,
    name,
    gridData, // Store the raw parsed grid
    isActive: true,
    effectiveFrom,
    effectiveUntil,
    createdAt: new Date().toISOString()
  });
  return id;
}

export async function getTimetables(semesterId) {
  return await db.timetables.where('semesterId').equals(semesterId).toArray();
}

export async function deleteTimetable(id) {
  await db.timetables.delete(id);
}

export async function addLectureRecord(subjectId, name, time, faculty) {
  const id = uuidv4();
  const today = new Date().toISOString().split('T')[0];
  await db.lectureRecords.add({
    id,
    subjectId,
    name,
    time,
    faculty,
    date: today,
    status: 'pending' // pending, present, absent, cancelled
  });
}

export async function clearLectureRecords() {
  await db.lectureRecords.clear();
}

export async function bulkAddLectureRecords(records) {
  await db.lectureRecords.bulkAdd(records);
}

export async function getAllLectureRecords() {
  return await db.lectureRecords.toArray();
}

export async function syncSubjectsFromTimetable(gridData) {
  const allExistingSubjects = await getSubjects('default-semester');
  const existingNames = allExistingSubjects.map(s => s.name.toUpperCase());
  
  const subjectsInGrid = new Set();
  const uniqueNewSubjects = new Set();
  
  // Skip row 0 (headers), iterate over cells (columns 1 to end)
  for (let r = 1; r < gridData.length; r++) {
    for (let c = 1; c < gridData[r].length; c++) {
      let cellText = gridData[r][c];
      if (!cellText || cellText.trim() === '') continue;
      
      // Clean the text: remove [X Hrs] annotations
      let cleanSubject = cellText.replace(/\[\d+\s*Hrs\]/ig, '').trim();
      
      // Extract room number if present, keeping only the subject name
      const roomMatch = cleanSubject.match(/(.*?)\s*(?:\(([^)]+)\)|\|\s*(.*))$/);
      if (roomMatch) {
        cleanSubject = roomMatch[1].trim();
      }
      
      // Ignore common breaks
      if (cleanSubject.toUpperCase() === 'BREAK' || cleanSubject.toUpperCase() === 'LUNCH' || cleanSubject.toUpperCase() === 'RECESS' || cleanSubject === '') continue;
      
      subjectsInGrid.add(cleanSubject.toUpperCase());
      
      if (!existingNames.includes(cleanSubject.toUpperCase())) {
        uniqueNewSubjects.add(cleanSubject);
      }
    }
  }
  
  // Add discovered subjects to the DB with default values
  for (const subjectName of uniqueNewSubjects) {
    const colors = ['#f44336', '#9c27b0', '#3f51b5', '#009688', '#ff9800', '#795548', '#607d8b'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    await addSubject('default-semester', subjectName, 'TBA', 75, randomColor, 3);
    existingNames.push(subjectName.toUpperCase()); // Prevent duplicates in the same pass
  }
  
  // Remove subjects that are no longer in the grid
  for (const subject of allExistingSubjects) {
    if (!subjectsInGrid.has(subject.name.toUpperCase())) {
      await deleteSubject(subject.id);
    }
  }
}

export async function getLecturesByDate(dateString) {
  if (!dateString) {
    const d = new Date();
    dateString = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  return await db.lectureRecords.where('date').equals(dateString).toArray();
}

export async function updateLectureStatus(id, newStatus) {
  await db.lectureRecords.update(id, { status: newStatus });
}
export async function addSubject(semesterId, name, facultyName, requiredAttendance, color, credits) {
  const id = uuidv4();
  await db.subjects.add({
    id,
    semesterId,
    name,
    facultyName,
    requiredAttendance,
    color,
    credits,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDeleted: false
  });
  return id;
}

export async function getSubjects(semesterId) {
  return await db.subjects
    .where('semesterId')
    .equals(semesterId)
    .filter(s => !s.isDeleted)
    .toArray();
}

export async function updateSubject(id, updates) {
  updates.updatedAt = new Date().toISOString();
  return await db.subjects.update(id, updates);
}

export async function deleteSubject(id) {
  // Soft delete
  return await db.subjects.update(id, { 
    isDeleted: true, 
    updatedAt: new Date().toISOString() 
  });
}

// ==========================================
// Demo Data Generator
// ==========================================
export async function generateDemoData() {
  const count = await db.subjects.count();
  if (count > 0) return; // DB already has user data

  console.log("Seeding Demo Data for Preview...");
  const semId = 'demo-semester';
  
  // Create dummy subjects with pre-calculated mock stats for the Dashboard UI
  await addSubject(semId, 'Database Management (DBMS)', 'Prof. Smith', 75, '#0061a4', 3);
  await addSubject(semId, 'Cloud Computing', 'Prof. Johnson', 75, '#4caf50', 3);
  await addSubject(semId, 'Machine Learning', 'Prof. Davis', 75, '#ff9800', 4);
}
  
export async function deleteFuturePendingRecords(effectiveFrom) {
  // Delete only 'pending' records that are on or after the effective date
  await db.lectureRecords
    .filter(r => r.date >= effectiveFrom && r.status === 'pending')
    .delete();
}

export async function wipeAppClean() {  
  await db.timetables.clear();  
  await db.lectureRecords.clear();  
  await db.subjects.clear();  
}

export async function backupData() {
  const data = {
    timetables: await db.timetables.toArray(),
    subjects: await db.subjects.toArray(),
    lectureRecords: await db.lectureRecords.toArray()
  };
  return JSON.stringify(data);
}

export async function restoreData(jsonString) {
  try {
    const data = JSON.parse(jsonString);
    if (!data.timetables || !data.subjects || !data.lectureRecords) {
      throw new Error("Invalid backup file format");
    }
    
    await db.transaction('rw', db.timetables, db.subjects, db.lectureRecords, async () => {
      await db.timetables.clear();
      await db.subjects.clear();
      await db.lectureRecords.clear();
      
      if (data.timetables.length > 0) await db.timetables.bulkAdd(data.timetables);
      if (data.subjects.length > 0) await db.subjects.bulkAdd(data.subjects);
      if (data.lectureRecords.length > 0) await db.lectureRecords.bulkAdd(data.lectureRecords);
    });
    return true;
  } catch (error) {
    console.error("Restore failed", error);
    throw error;
  }
}
