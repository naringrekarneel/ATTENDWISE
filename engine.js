import { db, getTimetables, addLectureRecord, getLecturesByDate, clearLectureRecords, bulkAddLectureRecords, getAllLectureRecords, getSubjects, deleteFuturePendingRecords } from './db.js';

/**
 * Attendance Engine
 * Contains the complex mathematical logic for attendance calculation, prediction, and smart insights.
 */
export class AttendanceEngine {
  
  static calculatePercentage(present, total) {
    if (total === 0) return 0;
    return Math.round((present / total) * 100);
  }

  static calculateSafeBunks(present, total, targetPercentage) {
    if (total === 0) return 0;
    const targetFraction = targetPercentage / 100;
    const safeMisses = Math.floor((present / targetFraction) - total);
    return Math.max(0, safeMisses);
  }

  static async generateDashboardInsights(dateString) {
    if (!dateString) {
      const d = new Date();
      dateString = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    await SchedulerEngine.syncDateLectures(dateString);
    const todayRecs = await getLecturesByDate(dateString);
    
    const allRecords = await getAllLectureRecords();
    let presentCount = 0; 
    let totalCount = 0;
    
    allRecords.forEach(r => {
      if (r.status === 'present') presentCount++;
      if (r.status === 'present' || r.status === 'absent') totalCount++;
    });
    
    const percentage = this.calculatePercentage(presentCount, totalCount);
    
    const safeBunks = this.calculateSafeBunks(presentCount, totalCount, 75);

    return {
      overallPercentage: percentage,
      smartInsight: `You can safely miss <strong>${safeBunks} more lectures</strong> this week without dropping below your 75% target.`,
      schedule: todayRecs
    };
  }
}

/**
 * Scheduler Engine
 * Runs automatically on app start. Generates daily LectureRecords based on Timetable.
 */
export class SchedulerEngine {
  static async generateScheduleFromTimetable(gridData, effectiveFrom = null, effectiveUntil = null, mode = 'wipe') {
    if (mode === 'wipe') {
      // Clear old data when a new timetable is saved completely fresh
      await clearLectureRecords();
    } else {
      // Continue mode: only delete future pending records starting from effective date
      if (!effectiveFrom) {
         effectiveFrom = new Date().toISOString().split('T')[0];
      }
      await deleteFuturePendingRecords(effectiveFrom);
    }
    
    const newRecords = [];
    const daysMap = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    
    let startDiff = mode === 'wipe' ? 30 : 0; // default start
    let endDiff = -120; // default end (4 months future)
    const today = new Date();
    today.setHours(0,0,0,0);
    
    if (effectiveFrom) {
      const [y, m, d] = effectiveFrom.split('-').map(Number);
      const startDate = new Date(y, m - 1, d);
      const diffTime = today - startDate;
      startDiff = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      if (startDiff < 0) startDiff = -1; // If future, don't generate past history
    }
    
    if (effectiveUntil) {
      const [y, m, d] = effectiveUntil.split('-').map(Number);
      const endDate = new Date(y, m - 1, d);
      const diffTime = today - endDate;
      endDiff = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    }

    // Simulate past days and future days based on start and end diffs
    for (let i = startDiff; i >= endDiff; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayName = daysMap[d.getDay()];
      const dateString = d.toISOString().split('T')[0];
      
      if (dayName === 'SUNDAY') continue; // College closed
      
      const gridHeader = gridData[0] || [];
      const shortDay = dayName.substring(0, 3); // "MON", "TUE"
      const colIndex = gridHeader.findIndex(h => h.toUpperCase().includes(shortDay));
      
      if (colIndex !== -1) {
        // Iterate through time slots
        for (let r = 1; r < gridData.length; r++) {
          const time = gridData[r][0]; 
          let subject = gridData[r][colIndex];
          
          if (subject && subject.trim() !== '') {
             // Clean up the text (remove [2 Hrs] tag)
             let cleanSubject = subject.replace(/\[\d+\s*Hrs\]/ig, '').trim();
             
             let room = null;
             const roomMatch = cleanSubject.match(/(.*?)\s*(?:\(([^)]+)\)|\|\s*(.*))$/);
             if (roomMatch) {
               cleanSubject = roomMatch[1].trim();
               room = (roomMatch[2] || roomMatch[3]).trim();
             }
             
             let upperSubj = cleanSubject.toUpperCase();
             
             // Ignore breaks and empty subjects
             if (upperSubj === 'BREAK' || upperSubj === 'LUNCH' || upperSubj === 'RECESS' || cleanSubject === '') {
                 continue;
             }
             
             let status = 'pending';
             
             newRecords.push({
               id: crypto.randomUUID(),
               subjectId: 'parsed',
               name: cleanSubject,
               room: room,
               time: time,
               faculty: 'TBA',
               date: dateString,
               status: status 
             });
          }
        }
      }
    }
    
    if (newRecords.length > 0) {
      await bulkAddLectureRecords(newRecords);
      console.log("SchedulerEngine: Generated", newRecords.length, "historical & future records from timetable.");
    }
  }

  static async syncDateLectures(dateString) {
    if (!dateString) return;
    const existing = await getLecturesByDate(dateString);
    if (existing.length > 0) return; // already exists
    
    const timetables = await getTimetables('default-semester');
    if (timetables.length === 0) return;
    const active = timetables[timetables.length - 1];
    if (!active.gridData) return;
    
    // Check if the requested date is BEFORE the semester start date
    if (active.effectiveFrom) {
      const reqDate = new Date(dateString);
      const startD = new Date(active.effectiveFrom);
      reqDate.setHours(0,0,0,0);
      startD.setHours(0,0,0,0);
      if (reqDate < startD) {
        return; // Do not generate records before semester start!
      }
    }
    
    // Check if the requested date is AFTER the semester end date
    if (active.effectiveUntil) {
      const reqDate = new Date(dateString);
      const endD = new Date(active.effectiveUntil);
      reqDate.setHours(0,0,0,0);
      endD.setHours(0,0,0,0);
      if (reqDate > endD) {
        return; // Do not generate records after semester end!
      }
    }
    
    // Parse Date locally to get correct weekday
    // Ensure "YYYY-MM-DD" is interpreted correctly in local time by splitting and passing integers
    const [y, m, d] = dateString.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const daysMap = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    const dayName = daysMap[dateObj.getDay()];
    if (dayName === 'SUNDAY') return;
    
    const shortDay = dayName.substring(0, 3);
    const gridHeader = active.gridData[0] || [];
    const colIndex = gridHeader.findIndex(h => h.toUpperCase().includes(shortDay));
    
    if (colIndex !== -1) {
      const newRecords = [];
      for (let r = 1; r < active.gridData.length; r++) {
         const time = active.gridData[r][0];
         let subject = active.gridData[r][colIndex];
         if (subject && subject.trim() !== '') {
            let cleanSubject = subject.replace(/\[\d+\s*Hrs\]/ig, '').trim();
            
            let room = null;
            const roomMatch = cleanSubject.match(/(.*?)\s*(?:\(([^)]+)\)|\|\s*(.*))$/);
            if (roomMatch) {
              cleanSubject = roomMatch[1].trim();
              room = (roomMatch[2] || roomMatch[3]).trim();
            }
            
            let upperSubj = cleanSubject.toUpperCase();
            if (upperSubj === 'BREAK' || upperSubj === 'LUNCH' || upperSubj === 'RECESS' || cleanSubject === '') continue;
            
            // basic uuid implementation if crypto is unavailable
            let uid = 'id-' + Math.random().toString(36).substr(2, 9);
            try { uid = crypto.randomUUID(); } catch(e){}
            
            newRecords.push({
              id: uid,
              lectureTemplateId: "dynamic",
              subjectId: "dynamic",
              date: dateString,
              time: time,
              name: cleanSubject,
              room: room,
              faculty: "TBA",
              status: 'pending'
            });
         }
      }
      if (newRecords.length > 0) {
        await bulkAddLectureRecords(newRecords);
      }
    }
  }

  static async syncTodayLectures() {
    // Now handled seamlessly by the DB pipeline. Real-world apps would generate records daily via a CRON or start-up check.
    return;
  }
}

/**
 * History Engine
 * Aggregates historical data to power the Spreadsheet tracking view.
 */
export class HistoryEngine {
  static async getSpreadsheetData() {
    const allRecords = await getAllLectureRecords();
    
    // Group records by date
    const grouped = {};
    allRecords.forEach(r => {
      if (!grouped[r.date]) grouped[r.date] = [];
      grouped[r.date].push(r);
    });
    
    // Sort dates descending
    const sortedDates = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a));
    
    const data = [];
    let weekAttended = 0;
    let weekTotal = 0;
    let monthAttended = 0;
    let monthTotal = 0;
    
    const today = new Date();
    today.setHours(0,0,0,0);
    const daysOfWeek = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    
    sortedDates.forEach((dateStr) => {
      const lectures = grouped[dateStr];
      const d = new Date(dateStr);
      
      const uiLectures = [];
      let attendedCount = 0;
      let totalCount = 0;
      
      // Format to 5 columns for the UI grid
      for(let i = 0; i < 5; i++) {
        if (i < lectures.length) {
          const lec = lectures[i];
          const isAttended = lec.status === 'present';
          uiLectures.push({ id: lec.id, name: lec.name, active: true, attended: isAttended });
          
          if (lec.status === 'present' || lec.status === 'absent') {
             totalCount++; 
             if (isAttended) attendedCount++;
          }
        } else {
          uiLectures.push({ id: `blank-${i}`, active: false, attended: false });
        }
      }
      
      // Formatting date like screenshot (m/d/yyyy)
      const formattedDate = `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()}`;
      
      data.push({
        date: formattedDate, rawDate: dateStr,
        day: daysOfWeek[d.getDay()],
        lectures: uiLectures,
        attendedCount,
        totalCount
      });
      
      const diffTime = Math.abs(today - d);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
      
      if (diffDays <= 7 && diffDays > 0) { // Don't count today's pending stats in history aggregations yet
        weekAttended += attendedCount;
        weekTotal += totalCount;
      }
      if (diffDays <= 30 && diffDays > 0) {
        monthAttended += attendedCount;
        monthTotal += totalCount;
      }
    });

    return {
      rows: data,
      weeklyStats: {
        attended: weekAttended,
        total: weekTotal,
        percentage: weekTotal > 0 ? Math.round((weekAttended / weekTotal) * 100) : 0
      },
      monthlyStats: {
        attended: monthAttended,
        total: monthTotal,
        percentage: monthTotal > 0 ? Math.round((monthAttended / monthTotal) * 100) : 0
      }
    };
  }
}

export class AnalyticsEngine {
  static async getAnalyticsData(targetMonthKey = null) {
    const allRecords = await getAllLectureRecords();
    const subjects = await getSubjects('default-semester');
    
    // Config
    const assumedTotalSemester = 120; // Used for "Lectures Remaining"
    const target = 0.75; // 75% target
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    
    // 1. Find all available months that have data
    const availableMonthsSet = new Set();
    allRecords.forEach(r => {
      if (r.status === 'present' || r.status === 'absent') {
        const d = new Date(r.date + "T00:00:00");
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        availableMonthsSet.add(key);
      }
    });
    
    let availableMonths = Array.from(availableMonthsSet).sort(); // chronological sort
    
    // If no data at all, just use current month
    if (availableMonths.length === 0) {
      const now = new Date();
      availableMonths = [`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`];
    }
    
    // 2. Determine target month
    let activeKey = targetMonthKey;
    if (!activeKey || !availableMonths.includes(activeKey)) {
      activeKey = availableMonths[availableMonths.length - 1]; // default to most recent
    }
    
    const [targetYearStr, targetMonthStr] = activeKey.split('-');
    const targetYear = parseInt(targetYearStr);
    const targetMonth = parseInt(targetMonthStr) - 1;
    const currentMonthName = `${monthNames[targetMonth]} ${targetYear}`;
    
    // 3. Setup Weekly Buckets for Target Month
    const daysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
    const numWeeks = Math.ceil(daysInMonth / 7);
    
    const weeklyData = [];
    for (let i = 1; i <= numWeeks; i++) {
      weeklyData.push({ week: i, attended: 0, total: 0 });
    }
    
    let overallAttended = 0;
    let overallTotal = 0;
    let monthlyAttended = 0;
    let monthlyTotal = 0;
    
    allRecords.forEach(r => {
      if (r.status === 'present' || r.status === 'absent') {
         // Overall Tracker
         overallTotal++;
         if (r.status === 'present') overallAttended++;
         
         // Monthly Tracker
         const d = new Date(r.date + "T00:00:00");
         if (d.getMonth() === targetMonth && d.getFullYear() === targetYear) {
            monthlyTotal++;
            if (r.status === 'present') monthlyAttended++;
            
            const dayOfMonth = d.getDate();
            const weekIndex = Math.ceil(dayOfMonth / 7) - 1;
            
            if (weeklyData[weekIndex]) {
               weeklyData[weekIndex].total++;
               if (r.status === 'present') weeklyData[weekIndex].attended++;
            }
         }
      }
    });
    
    weeklyData.forEach(w => {
       w.percentage = w.total > 0 ? (w.attended / w.total) * 100 : 0;
    });
    
    let overallPercentage = overallTotal > 0 ? (overallAttended / overallTotal) * 100 : 0;
    
    let requiredToSeat = 0;
    if (overallPercentage >= 75) {
       let safeBunks = Math.floor((overallAttended / target) - overallTotal);
       requiredToSeat = -safeBunks; 
    } else {
       let mustAttend = Math.ceil((target * overallTotal - overallAttended) / (1 - target));
       requiredToSeat = mustAttend;
    }
    
    let lectureRemaining = assumedTotalSemester - overallTotal;
    if (lectureRemaining < 0) lectureRemaining = 0;
    
    // Subject-wise breakdown (FILTERED BY MONTH)
    const subjectStats = subjects.map(sub => {
      const subNameUpper = sub.name.toUpperCase();
      let attended = 0;
      let total = 0;
      allRecords.forEach(r => {
         if (r.name.toUpperCase() === subNameUpper && (r.status === 'present' || r.status === 'absent')) {
            const d = new Date(r.date + "T00:00:00");
            if (d.getMonth() === targetMonth && d.getFullYear() === targetYear) {
               total++;
               if (r.status === 'present') attended++;
            }
         }
      });
      const percentage = total > 0 ? (attended / total) * 100 : 0;
      return {
         id: sub.id,
         name: sub.name,
         color: sub.color || '#0061a4',
         attended,
         total,
         percentage,
         required: sub.requiredAttendance || 75
      };
    });
    
    // Map availableMonths to formatted labels for the UI
    const availableMonthsFormatted = availableMonths.map(key => {
       const [y, m] = key.split('-');
       return { key, label: `${monthNames[parseInt(m)-1]} ${y}` };
    });
    
    return {
       availableMonths: availableMonthsFormatted,
       activeMonthKey: activeKey,
       currentMonthName,
       weeklyData,
       overallPercentage,
       overallAttended,
       overallTotal,
       requiredToSeat,
       lectureRemaining,
       subjectStats
    };
  }
}
