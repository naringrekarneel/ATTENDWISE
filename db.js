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

// ==========================================
// JSON Semester Schema Import/Export & Validation
// ==========================================

export async function exportSemesterJSON() {
  const semesterId = 'default-semester';
  const subjects = await getSubjects(semesterId);
  const timetables = await getTimetables(semesterId);

  const jsonSubjects = subjects.map(s => {
    const code = s.facultyName && s.facultyName !== 'TBA' ? s.facultyName : (s.name.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 5));
    return {
      id: s.id,
      name: s.name,
      code: code,
      color: s.color || '#0061a4'
    };
  });

  const jsonTimetable = [];
  const subjectIdMapByName = {};
  jsonSubjects.forEach(s => {
    subjectIdMapByName[s.name.toUpperCase()] = s.id;
    if (s.code) subjectIdMapByName[s.code.toUpperCase()] = s.id;
  });

  if (timetables.length > 0) {
    const activeTT = timetables[timetables.length - 1];
    const grid = activeTT.gridData || [];
    if (grid.length > 1) {
      const header = grid[0];
      const fullDays = {
        MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday', FRI: 'Friday', SAT: 'Saturday', SUN: 'Sunday'
      };

      for (let r = 1; r < grid.length; r++) {
        const startTime = grid[r][0];
        let endTime = '';
        if (r < grid.length - 1 && grid[r + 1][0]) {
          endTime = grid[r + 1][0];
        } else if (startTime && startTime.includes(':')) {
          let [h, m] = startTime.split(':').map(Number);
          endTime = `${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        }

        for (let c = 1; c < header.length; c++) {
          const rawCell = grid[r][c];
          if (!rawCell || !rawCell.trim()) continue;

          let cellText = rawCell.replace(/\[\d+\s*Hrs\]/ig, '').trim();
          let room = '';
          const roomMatch = cellText.match(/(.*?)\s*(?:\(([^)]+)\)|\|\s*(.*))$/);
          if (roomMatch) {
            cellText = roomMatch[1].trim();
            room = (roomMatch[2] || roomMatch[3]).trim();
          }

          if (['BREAK', 'LUNCH', 'RECESS'].includes(cellText.toUpperCase())) continue;

          const headerDay = header[c].toUpperCase().trim();
          const dayKey = Object.keys(fullDays).find(k => headerDay.includes(k));
          const dayName = dayKey ? fullDays[dayKey] : header[c];

          const matchedSubjId = subjectIdMapByName[cellText.toUpperCase()] || cellText.toLowerCase().replace(/\s+/g, '-');
          const type = cellText.toLowerCase().includes('lab') ? 'lab' : 'lecture';

          jsonTimetable.push({
            day: dayName,
            start: startTime,
            end: endTime,
            subjectId: matchedSubjId,
            room: room,
            type: type
          });
        }
      }
    }
  }

  return JSON.stringify({
    subjects: jsonSubjects,
    timetable: jsonTimetable
  }, null, 2);
}

export function validateSemesterJSON(input) {
  let parsed = null;
  if (typeof input === 'string') {
    try {
      parsed = JSON.parse(input);
    } catch (e) {
      return { valid: false, errors: ['Invalid JSON syntax: ' + e.message], warnings: [], preview: null };
    }
  } else {
    parsed = input;
  }

  if (!parsed || typeof parsed !== 'object') {
    return { valid: false, errors: ['JSON root must be an object'], warnings: [], preview: null };
  }

  const errors = [];
  const warnings = [];

  if (!Array.isArray(parsed.subjects)) {
    errors.push('Missing or invalid "subjects" array.');
  }

  if (!Array.isArray(parsed.timetable)) {
    errors.push('Missing or invalid "timetable" array.');
  }

  if (errors.length > 0) {
    return { valid: false, errors, warnings, preview: null };
  }

  const subjectIds = new Set();

  parsed.subjects.forEach((sub, idx) => {
    if (!sub || typeof sub !== 'object') {
      errors.push(`Subject at index ${idx} is not an object.`);
      return;
    }
    if (!sub.id || typeof sub.id !== 'string') {
      errors.push(`Subject at index ${idx} ("${sub.name || 'unnamed'}") is missing a valid string "id".`);
    } else if (subjectIds.has(sub.id.toLowerCase())) {
      errors.push(`Duplicate subject ID found: "${sub.id}".`);
    } else {
      subjectIds.add(sub.id.toLowerCase());
    }

    if (!sub.name || typeof sub.name !== 'string') {
      errors.push(`Subject with id "${sub.id || idx}" is missing a valid "name".`);
    }
  });

  const validDays = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

  parsed.timetable.forEach((slot, idx) => {
    if (!slot || typeof slot !== 'object') {
      errors.push(`Timetable slot at index ${idx} is not an object.`);
      return;
    }

    if (!slot.day || typeof slot.day !== 'string') {
      errors.push(`Timetable slot ${idx} is missing a valid "day".`);
    } else {
      const cleanDay = slot.day.trim().toUpperCase();
      if (!validDays.includes(cleanDay)) {
        warnings.push(`Slot ${idx} has an unusual day: "${slot.day}". Standard values: Monday to Saturday.`);
      }
    }

    if (!slot.start || typeof slot.start !== 'string') {
      errors.push(`Timetable slot ${idx} is missing a valid "start" time.`);
    }

    if (!slot.subjectId || typeof slot.subjectId !== 'string') {
      errors.push(`Timetable slot ${idx} (${slot.day} ${slot.start}) is missing "subjectId".`);
    } else if (!subjectIds.has(slot.subjectId.toLowerCase())) {
      errors.push(`Timetable slot ${idx} (${slot.day} ${slot.start}) references unknown subjectId: "${slot.subjectId}".`);
    }
  });

  const isValid = errors.length === 0;

  return {
    valid: isValid,
    errors,
    warnings,
    preview: {
      subjectsCount: parsed.subjects.length,
      timetableCount: parsed.timetable.length,
      subjects: parsed.subjects,
      timetable: parsed.timetable
    }
  };
}

export async function importSemesterJSON(jsonInput, startDate = null, endDate = null) {
  const validation = validateSemesterJSON(jsonInput);
  if (!validation.valid) {
    throw new Error("Validation failed: " + validation.errors.join("; "));
  }

  const { subjects, timetable } = validation.preview;
  const semesterId = 'default-semester';

  if (!startDate) {
    const today = new Date();
    startDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
  }
  if (!endDate) {
    const today = new Date();
    const end = new Date(today.getFullYear(), today.getMonth() + 4, 1);
    endDate = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-01`;
  }

  const daysHeader = ['Time', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayIndexMap = {
    MONDAY: 1, MON: 1,
    TUESDAY: 2, TUE: 2,
    WEDNESDAY: 3, WED: 3,
    THURSDAY: 4, THU: 4,
    FRIDAY: 5, FRI: 5,
    SATURDAY: 6, SAT: 6,
    SUNDAY: 6
  };

  const uniqueTimes = Array.from(new Set(timetable.map(t => t.start.trim()))).sort();
  if (uniqueTimes.length === 0) {
    uniqueTimes.push('09:15', '10:15', '11:15', '13:15', '14:15', '15:15');
  }

  const subjectMap = {};
  subjects.forEach(s => {
    subjectMap[s.id.toLowerCase()] = s;
  });

  const gridData = [];
  gridData.push(daysHeader);

  uniqueTimes.forEach(t => {
    const row = new Array(7).fill('');
    row[0] = t;
    gridData.push(row);
  });

  timetable.forEach(slot => {
    const dayKey = slot.day.toUpperCase().trim();
    const colIdx = dayIndexMap[dayKey];
    if (!colIdx) return;

    const timeRowIdx = uniqueTimes.indexOf(slot.start.trim()) + 1;
    if (timeRowIdx <= 0) return;

    const sub = subjectMap[slot.subjectId.toLowerCase()];
    const subName = sub ? sub.name : slot.subjectId;
    const roomInfo = slot.room ? ` | ${slot.room}` : '';

    gridData[timeRowIdx][colIdx] = `${subName}${roomInfo}`;
  });

  await db.transaction('rw', db.subjects, db.timetables, db.lectureRecords, async () => {
    await wipeAppClean();

    for (const sub of subjects) {
      await addSubject(
        semesterId,
        sub.name,
        sub.code || 'TBA',
        75,
        sub.color || '#0061a4',
        3
      );
    }

    await addTimetable(semesterId, 'Imported JSON Timetable', gridData, startDate, endDate);
  });

  const { SchedulerEngine } = await import('./engine.js');
  await SchedulerEngine.generateScheduleFromTimetable(gridData, startDate, endDate, 'wipe');

  return true;
}

